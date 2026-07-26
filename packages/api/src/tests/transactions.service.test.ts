import type { CreateTransactionInput, ListTransactionsQuery, UpdateTransactionInput } from '@expense-tracker/shared';
import { AppError } from '../errors/app-error';
import type { Expense } from '../entities/Expense.entity';
import type { TransactionsRepository } from '../repositories/transactions.repository';
import { TransactionsService } from '../services/transactions.service';

// Prevent the real logger from being initialized during unit tests.
jest.mock('../services', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type TransactionsRepositoryMock = jest.Mocked<Pick<TransactionsRepository, 'findManyForUser' | 'findOneForUser' | 'findOneByClientRequestId' | 'createEntity' | 'save' | 'replaceTags' | 'softDelete'>>;

const buildTransaction = (overrides: Partial<Expense> = {}): Expense =>
  ({
    id: 'tx-1',
    userId: 'user-1',
    title: 'Salary',
    amount: 5000,
    type: 'income',
    date: '2025-06-15',
    vaultId: 'vault-1',
    vault: {
      id: 'vault-1',
      name: 'Main Stash',
      icon: 'wallet',
    },
    transactionTags: [],
    createdAt: new Date('2025-06-15T10:00:00Z'),
    updatedAt: new Date('2025-06-15T10:00:00Z'),
    ...overrides,
  }) as Expense;

describe('TransactionsService', () => {
  let transactions: TransactionsRepositoryMock;
  let service: TransactionsService;

  beforeEach(() => {
    transactions = {
      findManyForUser: jest.fn(),
      findOneForUser: jest.fn(),
      findOneByClientRequestId: jest.fn(),
      createEntity: jest.fn((data) => data as Expense),
      save: jest.fn(),
      replaceTags: jest.fn(),
      softDelete: jest.fn(),
    };

    service = new TransactionsService(transactions as unknown as TransactionsRepository);
  });

  describe('list', () => {
    it('returns transactions when month and year are provided', async () => {
      const transaction = buildTransaction();

      transactions.findManyForUser.mockResolvedValue([transaction]);

      const query: ListTransactionsQuery = {
        month: 6,
        year: 2025,
      };

      const result = await service.list('user-1', query);

      expect(transactions.findManyForUser).toHaveBeenCalledWith('user-1', {
        month: 6,
        year: 2025,
      });

      expect(result).toHaveLength(1);

      expect(result[0]).toMatchObject({
        id: transaction.id,
        userId: transaction.userId,
        title: transaction.title,
        amount: transaction.amount,
        type: transaction.type,
        vaultId: transaction.vaultId,
      });
    });

    it('throws when month or year is missing', async () => {
      const query: ListTransactionsQuery = {};

      await expect(service.list('user-1', query)).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 400,
      });
    });
  });

  describe('create', () => {
    it('creates a transaction without tags', async () => {
      const input: CreateTransactionInput = {
        title: 'Salary',
        amount: 5000,
        type: 'income',
        vaultId: 'vault-1',
      };

      const transaction = buildTransaction();

      transactions.createEntity.mockReturnValue(transaction);
      transactions.save.mockResolvedValue(transaction);

      const result = await service.create('user-1', input);

      expect(transactions.createEntity).toHaveBeenCalled();
      expect(transactions.save).toHaveBeenCalledWith(transaction);
      expect(transactions.replaceTags).not.toHaveBeenCalled();

      expect(result).toBe(transaction);
    });

    it('links tags when tagIds are provided', async () => {
      const input: CreateTransactionInput = {
        title: 'Salary',
        amount: 5000,
        type: 'income',
        vaultId: 'vault-1',
        tagIds: ['tag-1', 'tag-2'],
      };

      const transaction = buildTransaction();

      transactions.createEntity.mockReturnValue(transaction);
      transactions.save.mockResolvedValue(transaction);

      await service.create('user-1', input);

      expect(transactions.replaceTags).toHaveBeenCalledWith(transaction.id, ['tag-1', 'tag-2']);
    });

    it('persists the clientRequestId of an offline-queued create', async () => {
      const input: CreateTransactionInput = {
        amount: 12,
        type: 'expense',
        clientRequestId: 'b3f1c2d4-0000-4000-8000-000000000001',
      };

      const transaction = buildTransaction();

      transactions.findOneByClientRequestId.mockResolvedValue(null);
      transactions.createEntity.mockReturnValue(transaction);
      transactions.save.mockResolvedValue(transaction);

      await service.create('user-1', input);

      expect(transactions.createEntity).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId: 'b3f1c2d4-0000-4000-8000-000000000001' }));
    });

    it('returns the existing transaction instead of inserting a duplicate when the clientRequestId was already used', async () => {
      const existing = buildTransaction({ id: 'tx-existing' });

      transactions.findOneByClientRequestId.mockResolvedValue(existing);

      const result = await service.create('user-1', { amount: 12, clientRequestId: 'b3f1c2d4-0000-4000-8000-000000000001' });

      expect(transactions.findOneByClientRequestId).toHaveBeenCalledWith('user-1', 'b3f1c2d4-0000-4000-8000-000000000001');
      expect(transactions.createEntity).not.toHaveBeenCalled();
      expect(transactions.save).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('does not look up an idempotency key when the create carries none', async () => {
      const transaction = buildTransaction();
      transactions.createEntity.mockReturnValue(transaction);
      transactions.save.mockResolvedValue(transaction);

      await service.create('user-1', { amount: 12 });

      expect(transactions.findOneByClientRequestId).not.toHaveBeenCalled();
    });
  });
  describe('update', () => {
    it('updates an existing transaction', async () => {
      const transaction = buildTransaction();

      transactions.findOneForUser.mockResolvedValue(transaction);
      transactions.save.mockResolvedValue(transaction);

      const input: UpdateTransactionInput = {
        title: 'Updated Salary',
        amount: 6000,
      };

      const result = await service.update('user-1', 'tx-1', input);

      expect(transactions.findOneForUser).toHaveBeenCalledWith('user-1', 'tx-1');

      expect(transactions.save).toHaveBeenCalled();

      expect(result).toBe(transaction);
    });
    it('throws when the transaction is missing', async () => {
      transactions.findOneForUser.mockResolvedValue(null);

      await expect(
        service.update('user-1', 'missing-id', {
          title: 'Updated',
        }),
      ).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
      });

      expect(transactions.save).not.toHaveBeenCalled();
    });
    it('updates tags when tagIds are provided', async () => {
      const transaction = buildTransaction();

      transactions.findOneForUser.mockResolvedValue(transaction);
      transactions.save.mockResolvedValue(transaction);

      const input: UpdateTransactionInput = {
        title: 'Updated Salary',
        tagIds: ['tag-1', 'tag-2'],
      };

      await service.update('user-1', 'tx-1', input);

      expect(transactions.replaceTags).toHaveBeenCalledWith(transaction.id, ['tag-1', 'tag-2']);
    });
  });

  describe('remove', () => {
    it('deletes an existing transaction', async () => {
      const transaction = buildTransaction();

      transactions.findOneForUser.mockResolvedValue(transaction);

      await service.remove('user-1', 'tx-1');

      expect(transactions.findOneForUser).toHaveBeenCalledWith('user-1', 'tx-1');

      expect(transactions.softDelete).toHaveBeenCalledWith('tx-1');
    });
    it('throws when the transaction is missing', async () => {
      transactions.findOneForUser.mockResolvedValue(null);

      await expect(service.remove('user-1', 'missing-id')).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
      });

      expect(transactions.softDelete).not.toHaveBeenCalled();
    });
  });
});
