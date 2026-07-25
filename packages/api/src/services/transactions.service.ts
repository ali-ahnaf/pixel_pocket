import { CreateTransactionInput, CreateTransferInput, ListTransactionsQuery, TransactionDto, UpdateTransactionInput } from '@expense-tracker/shared';
import { Expense } from '../entities/Expense.entity';
import { AppError } from '../errors/app-error';
import { TransactionsRepository, TransactionDateFilter } from '../repositories/transactions.repository';
import { transactionsRepository, vaultsRepository } from '../repositories';
import { logger } from '.';

/**
 * Business logic for one-off transactions. The repository is injected (defaults
 * to the shared singleton) so the service can be unit-tested against a mock.
 */
export class TransactionsService {
  constructor(
    private readonly transactions: TransactionsRepository = transactionsRepository,

    private readonly vaults = vaultsRepository,
  ) {}

  async list(userId: string, query: ListTransactionsQuery): Promise<TransactionDto[]> {
    const allTime = query.period === 'all';
    if (!allTime && (!query.month || !query.year)) {
      throw new AppError('month and year are required unless period=all', 400);
    }

    const filter: TransactionDateFilter = allTime ? { allTime: true } : { month: query.month, year: query.year };

    const transactions = await this.transactions.findManyForUser(userId, filter);
    logger.debug('Listed transactions', { userId, count: transactions.length, allTime });

    return transactions.map((tx) => ({
      id: tx.id,
      userId: tx.userId,
      title: tx.title,
      amount: parseFloat(String(tx.amount)),
      type: tx.type,
      date: tx.date,
      vaultId: tx.vaultId,
      vault: tx.vault ? { id: tx.vault.id, name: tx.vault.name, icon: tx.vault.icon } : null,
      tags: tx.transactionTags?.map((tt) => tt.tag) ?? [],
      isCommitted: true,
      createdAt: tx.createdAt.toISOString(),
      updatedAt: tx.updatedAt.toISOString(),
    }));
  }

  async create(userId: string, input: CreateTransactionInput): Promise<Expense> {
    const { tagIds = [], date, ...rest } = input;
    const transactionDate = date ?? new Date().toISOString().split('T')[0];

    const transaction = this.transactions.createEntity({
      ...rest,
      userId,
      date: transactionDate,
    });

    const saved = await this.transactions.save(transaction);
    if (tagIds.length > 0) {
      await this.transactions.replaceTags(saved.id, tagIds);
    }

    logger.info('Created transaction', { userId, transactionId: saved.id });
    return saved;
  }

  async createTransferTransaction(userId: string, input: CreateTransferInput): Promise<Expense> {
    const { tagIds = [], date, amount, title, vaultId, targetVaultId } = input;
    const transactionDate = date ?? new Date().toISOString().split('T')[0];

    if (!vaultId || !targetVaultId) {
      throw new AppError('Both source and target vaults are required for a transfer', 400);
    }
    if (vaultId === targetVaultId) {
      throw new AppError('Source and target vaults must be different', 400);
    }

    const sourceVault = await this.vaults.findOneForUser(userId, vaultId);
    const targetVault = await this.vaults.findOneForUser(userId, targetVaultId);

    if (!sourceVault || !targetVault) {
      throw new AppError('One or both vaults do not exist or do not belong to you', 403);
    }

    const expenseTx = this.transactions.createEntity({
      userId,
      amount,
      type: 'expense',
      vaultId: vaultId,
      date: transactionDate,
      title: title || 'Transfer Out',
    });
    const incomeTx = this.transactions.createEntity({
      userId,
      amount,
      type: 'income',
      vaultId: targetVaultId,
      date: transactionDate,
      title: title || 'Transfer In',
    });

    const savedExpense = await this.transactions.save(expenseTx);
    const savedIncome = await this.transactions.save(incomeTx);

    if (tagIds.length > 0) {
      await this.transactions.replaceTags(savedExpense.id, tagIds);
      await this.transactions.replaceTags(savedIncome.id, tagIds);
    }

    logger.info('Created transfer transactions', { userId, expenseId: savedExpense.id, incomeId: savedIncome.id });
    return savedExpense;
  }

  async update(userId: string, id: string, input: UpdateTransactionInput): Promise<Expense> {
    const transaction = await this.transactions.findOneForUser(userId, id);
    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    const { tagIds, ...rest } = input;
    Object.assign(transaction, rest);
    const saved = await this.transactions.save(transaction);

    if (tagIds !== undefined) {
      await this.transactions.replaceTags(saved.id, tagIds);
    }

    logger.info('Updated transaction', { userId, transactionId: saved.id });
    return saved;
  }

  async remove(userId: string, id: string): Promise<void> {
    const transaction = await this.transactions.findOneForUser(userId, id);
    if (!transaction) {
      throw new AppError('Transaction not found', 404);
    }

    await this.transactions.softDelete(id);
    logger.info('Deleted transaction', { userId, transactionId: id });
  }
}
