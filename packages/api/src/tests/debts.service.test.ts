import type { Debt } from '../entities/Debt.entity';
import type { Expense } from '../entities/Expense.entity';
import { TransactionType } from '../entities/Expense.entity';
import { AppError } from '../errors/app-error';
import type { DebtsRepository } from '../repositories/debts.repository';
import type { TransactionsRepository } from '../repositories/transactions.repository';
import { DebtsService } from '../services/debts.service';

// Mock logger just like auth.service.test.ts
jest.mock('../services', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type DebtsRepositoryMock = jest.Mocked<Pick<DebtsRepository, 'findManyForUser' | 'findOneForUser' | 'findOneByClientRequestId' | 'createEntity' | 'remove' | 'save'>>;

type TransactionsRepositoryMock = jest.Mocked<Pick<TransactionsRepository, 'createEntity' | 'save'>>;

const buildDebt = (overrides: Partial<Debt> = {}): Debt =>
  ({
    id: 'debt-1',
    userId: 'user-1',
    title: 'Internet Bill',
    amount: 1000,
    type: 'expense' as TransactionType,
    notes: null,
    dueDate: null,
    createdAt: new Date(),
    ...overrides,
  }) as Debt;

const buildExpense = (overrides: Partial<Expense> = {}): Expense =>
  ({
    id: 'expense-1',
    userId: 'user-1',
    title: 'Internet Bill',
    amount: 1000,
    type: 'expense' as TransactionType,
    date: '2026-06-27',
    vaultId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Expense;

describe('DebtsService', () => {
  let debts: DebtsRepositoryMock;
  let transactions: TransactionsRepositoryMock;
  let service: DebtsService;

  beforeEach(() => {
    debts = {
      findManyForUser: jest.fn(),
      findOneForUser: jest.fn(),
      findOneByClientRequestId: jest.fn(),
      createEntity: jest.fn((data) => data as Debt),
      remove: jest.fn(),
      save: jest.fn(),
    } as DebtsRepositoryMock;

    transactions = {
      createEntity: jest.fn(),
      save: jest.fn(),
    } as TransactionsRepositoryMock;

    service = new DebtsService(debts as unknown as DebtsRepository, transactions as unknown as TransactionsRepository);
  });

  describe('list', () => {
    it("returns the user's debts and defaults to the incomplete status", async () => {
      const debt = buildDebt();
      debts.findManyForUser.mockResolvedValue([debt]);

      const result = await service.list('user-1');

      expect(result).toEqual([
        {
          id: debt.id,
          userId: debt.userId,
          title: debt.title,
          amount: debt.amount,
          type: debt.type,
          notes: null,
          dueDate: null,
          createdAt: debt.createdAt,
          completed: undefined,
          discarded: false,
        },
      ]);
      expect(debts.findManyForUser).toHaveBeenCalledWith('user-1', 'incomplete');
    });

    it('forwards the requested status to the repository', async () => {
      debts.findManyForUser.mockResolvedValue([]);

      await service.list('user-1', 'completed');

      expect(debts.findManyForUser).toHaveBeenCalledWith('user-1', 'completed');
    });

    it('flags soft-deleted, non-completed debts as discarded', async () => {
      const applied = buildDebt({ id: 'applied', completed: true, deletedAt: new Date() });
      const discarded = buildDebt({ id: 'discarded', completed: false, deletedAt: new Date() });
      debts.findManyForUser.mockResolvedValue([applied, discarded]);

      const result = await service.list('user-1', 'completed');

      expect(result).toMatchObject([
        { id: 'applied', completed: true, discarded: false },
        { id: 'discarded', completed: false, discarded: true },
      ]);
    });

    it('returns an empty array if no debt is found', async () => {
      const emptyDebts = [] as Debt[];
      debts.findManyForUser.mockResolvedValue(emptyDebts);

      const result = await service.list('user-1');

      expect(result).toEqual(emptyDebts);
      expect(debts.findManyForUser).toHaveBeenCalledWith('user-1', 'incomplete');
    });
  });

  describe('create', () => {
    const input = { title: 'Internet Bill', amount: 1000, type: 'expense' as TransactionType };
    it('creates a new debt and returns it as a DTO', async () => {
      const saved = buildDebt();
      debts.save.mockResolvedValue(saved);

      const result = await service.create('user-1', input);
      expect(debts.createEntity).toHaveBeenCalledWith(expect.objectContaining({ title: input.title, amount: input.amount, type: input.type }));
      expect(debts.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        id: saved.id,
        userId: saved.userId,
        title: saved.title,
        amount: saved.amount,
        type: saved.type,
        notes: null,
        dueDate: null,
        createdAt: saved.createdAt,
      });
    });

    it('persists only the expected fields even when extra input is present', async () => {
      const saved = buildDebt();
      const inputWithExtra = {
        ...input,
        unexpected: 'ignore me',
      };
      debts.save.mockResolvedValue(saved);

      await service.create('user-1', inputWithExtra);

      expect(debts.createEntity).toHaveBeenCalledWith({
        userId: 'user-1',
        title: input.title,
        amount: input.amount,
        type: input.type,
        notes: null,
        dueDate: null,
        clientRequestId: null,
      });
    });

    it('persists the clientRequestId of an offline-queued create', async () => {
      const saved = buildDebt();
      debts.findOneByClientRequestId.mockResolvedValue(null);
      debts.save.mockResolvedValue(saved);

      await service.create('user-1', { ...input, clientRequestId: 'b3f1c2d4-0000-4000-8000-000000000002' });

      expect(debts.createEntity).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId: 'b3f1c2d4-0000-4000-8000-000000000002' }));
    });

    it('returns the existing debt instead of inserting a duplicate when the clientRequestId was already used', async () => {
      const existing = buildDebt({ id: 'debt-existing' });
      debts.findOneByClientRequestId.mockResolvedValue(existing);

      const result = await service.create('user-1', { ...input, clientRequestId: 'b3f1c2d4-0000-4000-8000-000000000002' });

      expect(debts.findOneByClientRequestId).toHaveBeenCalledWith('user-1', 'b3f1c2d4-0000-4000-8000-000000000002');
      expect(debts.createEntity).not.toHaveBeenCalled();
      expect(debts.save).not.toHaveBeenCalled();
      expect(result).toMatchObject({ id: 'debt-existing', userId: existing.userId, title: existing.title });
    });

    it('does not look up an idempotency key when the create carries none', async () => {
      debts.save.mockResolvedValue(buildDebt());

      await service.create('user-1', input);

      expect(debts.findOneByClientRequestId).not.toHaveBeenCalled();
    });

    it('persists the notes field when provided', async () => {
      const saved = buildDebt({ notes: 'pay back by August' });
      debts.save.mockResolvedValue(saved);

      const result = await service.create('user-1', { ...input, notes: 'pay back by August' });

      expect(debts.createEntity).toHaveBeenCalledWith(expect.objectContaining({ notes: 'pay back by August' }));
      expect(result.notes).toBe('pay back by August');
    });

    it('persists the dueDate field when provided', async () => {
      const saved = buildDebt({ dueDate: '2026-08-15' });
      debts.save.mockResolvedValue(saved);

      const result = await service.create('user-1', { ...input, dueDate: '2026-08-15' });

      expect(debts.createEntity).toHaveBeenCalledWith(expect.objectContaining({ dueDate: '2026-08-15' }));
      expect(result.dueDate).toBe('2026-08-15');
    });
  });

  describe('update', () => {
    it('updates the allowed fields and returns the DTO', async () => {
      const debt = buildDebt();
      debts.findOneForUser.mockResolvedValue(debt);
      debts.save.mockImplementation(async (d) => d);

      const result = await service.update('user-1', 'debt-1', { title: 'Rent', amount: 2500, notes: 'monthly' });

      expect(debts.findOneForUser).toHaveBeenCalledWith('user-1', 'debt-1');
      expect(debts.save).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ title: 'Rent', amount: 2500, notes: 'monthly' });
    });

    it('clears notes when null is passed', async () => {
      const debt = buildDebt({ notes: 'old note' });
      debts.findOneForUser.mockResolvedValue(debt);
      debts.save.mockImplementation(async (d) => d);

      const result = await service.update('user-1', 'debt-1', { notes: null });

      expect(result.notes).toBeNull();
    });

    it('sets the dueDate when provided', async () => {
      const debt = buildDebt();
      debts.findOneForUser.mockResolvedValue(debt);
      debts.save.mockImplementation(async (d) => d);

      const result = await service.update('user-1', 'debt-1', { dueDate: '2026-08-15' });

      expect(result.dueDate).toBe('2026-08-15');
    });

    it('clears dueDate when null is passed', async () => {
      const debt = buildDebt({ dueDate: '2026-08-15' });
      debts.findOneForUser.mockResolvedValue(debt);
      debts.save.mockImplementation(async (d) => d);

      const result = await service.update('user-1', 'debt-1', { dueDate: null });

      expect(result.dueDate).toBeNull();
    });

    it('throws when the debt is missing', async () => {
      debts.findOneForUser.mockResolvedValue(null);

      await expect(service.update('user-1', 'debt-1', { title: 'x' })).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
      });
    });
  });

  describe('remove', () => {
    it('remove the debt when it exists', async () => {
      const debt = buildDebt();

      debts.findOneForUser.mockResolvedValue(debt);
      debts.remove.mockResolvedValue(debt);

      const result = await service.remove('user-1', 'debt-1');

      expect(result).toBeUndefined();
      expect(debts.remove).toHaveBeenCalledTimes(1);
      expect(debts.remove).toHaveBeenCalledWith(debt);
    });

    it('throws the right error when the debt is missing', async () => {
      debts.findOneForUser.mockResolvedValue(null);

      await expect(service.remove('user-1', 'debe-1')).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
      });
    });
  });

  describe('apply', () => {
    it('removes the debt without creating a transaction when skipTransaction is true', async () => {
      const debt = buildDebt();

      debts.findOneForUser.mockResolvedValue(debt);
      debts.remove.mockResolvedValue(debt);

      const result = await service.apply('user-1', debt.id, {
        skipTransaction: true,
      });

      expect(transactions.createEntity).not.toHaveBeenCalled();
      expect(transactions.save).not.toHaveBeenCalled();

      expect(debt.completed).toBe(true);
      // The completed flag must be persisted before the soft-remove, otherwise
      // softRemove drops it and the due is later flagged as discarded.
      expect(debts.save).toHaveBeenCalledWith(expect.objectContaining({ completed: true }));
      expect(debts.remove).toHaveBeenCalledWith(debt);

      expect(result).toEqual({
        id: debt.id,
      });
    });

    it('creates a transaction and removes the debt when skipTransaction is false', async () => {
      const debt = buildDebt();
      const expense = buildExpense();

      debts.findOneForUser.mockResolvedValue(debt);

      transactions.createEntity.mockReturnValue(expense);
      transactions.save.mockResolvedValue(expense);

      debts.remove.mockResolvedValue(debt);

      const result = await service.apply('user-1', debt.id, {});

      expect(transactions.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          title: debt.title,
          amount: debt.amount,
          type: debt.type,
          vaultId: null,
        }),
      );

      expect(transactions.save).toHaveBeenCalledWith(expense);

      expect(debt.completed).toBe(true);
      expect(debts.save).toHaveBeenCalledWith(expect.objectContaining({ completed: true }));
      expect(debts.remove).toHaveBeenCalledWith(debt);

      expect(result).toEqual({
        id: expense.id,
      });
    });

    it('throws when the debt is missing', async () => {
      debts.findOneForUser.mockResolvedValue(null);

      await expect(service.apply('user-1', 'debt-1', {})).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
      });
    });
  });
});
