import { describe, it, expect, beforeEach } from 'vitest';

import { clearOutbox, enqueue, isOfflineId, OUTBOX_STORAGE_KEY, peekAll, pendingDebts, pendingTransactions, remove } from './outbox';

describe('offline outbox', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('assigns an id that doubles as the clientRequestId', () => {
    const entry = enqueue({ kind: 'create-transaction', userId: 'user-1', payload: { amount: 12 } });

    expect(entry.payload.clientRequestId).toBe(entry.id);
    expect(entry.queuedAt).toEqual(expect.any(String));
  });

  it('keeps entries in the order they were queued', () => {
    const first = enqueue({ kind: 'create-transaction', userId: 'user-1', payload: { amount: 1 } });
    const second = enqueue({ kind: 'create-debt', userId: 'user-1', payload: { title: 'Rent', amount: 2, type: 'expense' } });

    expect(peekAll().map((entry) => entry.id)).toEqual([first.id, second.id]);
  });

  it('removes a single entry and leaves the rest queued', () => {
    const first = enqueue({ kind: 'create-transaction', userId: 'user-1', payload: { amount: 1 } });
    const second = enqueue({ kind: 'create-transaction', userId: 'user-1', payload: { amount: 2 } });

    remove(first.id);

    expect(peekAll().map((entry) => entry.id)).toEqual([second.id]);
  });

  it('clears the whole queue', () => {
    enqueue({ kind: 'create-transaction', userId: 'user-1', payload: { amount: 1 } });

    clearOutbox();

    expect(peekAll()).toEqual([]);
  });

  it('recovers from a corrupt queue rather than throwing', () => {
    window.localStorage.setItem(OUTBOX_STORAGE_KEY, 'not json');

    expect(peekAll()).toEqual([]);
  });

  describe('placeholder DTOs', () => {
    it('builds a complete DebtDto for each queued due, newest first, scoped to the user', () => {
      enqueue({ kind: 'create-debt', userId: 'user-1', payload: { title: 'Rent', amount: 500, type: 'expense', notes: 'monthly', dueDate: '2026-08-01' } });
      enqueue({ kind: 'create-debt', userId: 'user-2', payload: { title: 'Other user', amount: 1, type: 'income' } });
      const newest = enqueue({ kind: 'create-debt', userId: 'user-1', payload: { title: 'Loan', amount: 20, type: 'income' } });

      const pending = pendingDebts('user-1');

      expect(pending).toHaveLength(2);
      expect(pending[0]).toMatchObject({ id: `offline:${newest.id}`, title: 'Loan', amount: 20, type: 'income', completed: false, discarded: false });
      expect(pending[1]).toMatchObject({ userId: 'user-1', title: 'Rent', amount: 500, notes: 'monthly', dueDate: '2026-08-01' });
      expect(pending[0].createdAt).toBeInstanceOf(Date);
    });

    it('builds a TransactionDto for each queued transaction, defaulting the type and date', () => {
      const entry = enqueue({ kind: 'create-transaction', userId: 'user-1', payload: { amount: 12, title: 'Coffee', vaultId: 'vault-1' } });

      const [pending] = pendingTransactions('user-1');

      expect(pending).toMatchObject({ id: `offline:${entry.id}`, title: 'Coffee', amount: 12, type: 'expense', vaultId: 'vault-1', vault: null, tags: [] });
      expect(pending.date).toBe(entry.queuedAt.slice(0, 10));
    });

    it('does not mix the two kinds', () => {
      enqueue({ kind: 'create-transaction', userId: 'user-1', payload: { amount: 12 } });
      enqueue({ kind: 'create-debt', userId: 'user-1', payload: { title: 'Rent', amount: 500, type: 'expense' } });

      expect(pendingTransactions('user-1')).toHaveLength(1);
      expect(pendingDebts('user-1')).toHaveLength(1);
    });

    it('marks placeholder ids so the UI can disable server-only actions', () => {
      const entry = enqueue({ kind: 'create-debt', userId: 'user-1', payload: { title: 'Rent', amount: 500, type: 'expense' } });

      expect(isOfflineId(pendingDebts('user-1')[0].id)).toBe(true);
      expect(isOfflineId(entry.id)).toBe(false);
    });
  });
});
