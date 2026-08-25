import { CreateDebtInput, UpdateDebtInput, ApplyDebtInput, DebtDto, DebtStatus } from '@expense-tracker/shared';
import { AppError } from '../errors/app-error';
import { DebtsRepository } from '../repositories/debts.repository';
import { TransactionsRepository } from '../repositories/transactions.repository';
import { debtsRepository, transactionsRepository } from '../repositories';
import { logger } from '.';

export type { CreateDebtInput, UpdateDebtInput, ApplyDebtInput, DebtDto, DebtStatus };

/**
 * Business logic for debts (dues). Repositories are injected (default to the
 * shared singletons) so the service can be unit-tested against mocks.
 */
export class DebtsService {
  constructor(
    private readonly debts: DebtsRepository = debtsRepository,
    private readonly transactions: TransactionsRepository = transactionsRepository,
  ) {}

  async list(userId: string, status: DebtStatus = 'incomplete'): Promise<DebtDto[]> {
    const debts = await this.debts.findManyForUser(userId, status);
    return debts.map((debt) => ({
      id: debt.id,
      userId: debt.userId,
      title: debt.title,
      amount: Number(debt.amount),
      type: debt.type,
      notes: debt.notes ?? null,
      dueDate: debt.dueDate ?? null,
      createdAt: debt.createdAt,
      completed: debt.completed,
      // A soft-deleted due that was never applied was discarded by the user.
      discarded: debt.deletedAt != null && !debt.completed,
    }));
  }

  async create(userId: string, input: CreateDebtInput): Promise<DebtDto> {
    // A create queued while the client was offline may already have reached the
    // server on its first attempt; return that row rather than inserting a twin.
    if (input.clientRequestId) {
      const existing = await this.debts.findOneByClientRequestId(userId, input.clientRequestId);
      if (existing) {
        logger.info('Returned existing debt for replayed clientRequestId', { userId, debtId: existing.id });
        return {
          id: existing.id,
          userId: existing.userId,
          title: existing.title,
          amount: Number(existing.amount),
          type: existing.type,
          notes: existing.notes ?? null,
          dueDate: existing.dueDate ?? null,
          createdAt: existing.createdAt,
        };
      }
    }

    const debt = this.debts.createEntity({
      userId,
      title: input.title,
      amount: input.amount,
      type: input.type,
      notes: input.notes ?? null,
      dueDate: input.dueDate ?? null,
      clientRequestId: input.clientRequestId ?? null,
    });
    const saved = await this.debts.save(debt);
    logger.info('Created debt', { userId, debtId: saved.id });
    return {
      id: saved.id,
      userId: saved.userId,
      title: saved.title,
      amount: Number(saved.amount),
      type: saved.type,
      notes: saved.notes ?? null,
      dueDate: saved.dueDate ?? null,
      createdAt: saved.createdAt,
    };
  }

  async update(userId: string, id: string, input: UpdateDebtInput): Promise<DebtDto> {
    const debt = await this.debts.findOneForUser(userId, id);
    if (!debt) {
      throw new AppError('Due not found', 404);
    }

    if (input.title !== undefined) debt.title = input.title;
    if (input.amount !== undefined) debt.amount = input.amount;
    if (input.type !== undefined) debt.type = input.type;
    if (input.notes !== undefined) debt.notes = input.notes;
    if (input.dueDate !== undefined) debt.dueDate = input.dueDate;

    const saved = await this.debts.save(debt);
    logger.info('Updated debt', { userId, debtId: id });
    return {
      id: saved.id,
      userId: saved.userId,
      title: saved.title,
      amount: Number(saved.amount),
      type: saved.type,
      notes: saved.notes ?? null,
      dueDate: saved.dueDate ?? null,
      createdAt: saved.createdAt,
    };
  }

  async remove(userId: string, id: string): Promise<void> {
    const debt = await this.debts.findOneForUser(userId, id);
    if (!debt) {
      throw new AppError('Due not found', 404);
    }

    await this.debts.remove(debt);
    logger.info('Deleted debt', { userId, debtId: id });
  }

  /**
   * Settle a debt: record it as a one-off transaction for today and delete the
   * debt. Returns the id of the created transaction.
   */
  async apply(userId: string, id: string, input: ApplyDebtInput): Promise<{ id: string }> {
    const debt = await this.debts.findOneForUser(userId, id);
    if (!debt) {
      throw new AppError('Due not found', 404);
    }

    // Persist the completed flag first: softRemove only writes deletedAt, so it
    // would drop this in-memory change and the settled due would look discarded.
    debt.completed = true;
    await this.debts.save(debt);

    if (input.skipTransaction) {
      await this.debts.remove(debt);

      logger.info('Applied debt without transaction', {
        userId,
        debtId: id,
      });

      return { id: debt.id };
    }
    const date = new Date().toISOString().split('T')[0];
    const expense = this.transactions.createEntity({
      userId,
      title: debt.title,
      amount: debt.amount,
      type: debt.type,
      date,
      vaultId: input.vaultId ?? null,
    });
    const saved = await this.transactions.save(expense);

    await this.debts.remove(debt);
    logger.info('Applied debt', { userId, debtId: id, transactionId: saved.id });
    return { id: saved.id };
  }
}
