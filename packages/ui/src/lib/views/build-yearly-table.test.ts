import { describe, expect, it } from 'vitest';
import type { OccurrenceDto, TagDto, TransactionDto } from '@expense-tracker/shared';
import { buildYearlyTable, projectableMonths, UNTAGGED_COLUMN_ID } from './build-yearly-table';

const tag = (id: string, name: string): TagDto => ({ id, userId: 'u1', name, icon: null, backgroundColor: null });

const transaction = (overrides: Partial<TransactionDto> & Pick<TransactionDto, 'date' | 'amount'>): TransactionDto => ({
  id: `tx-${overrides.date}-${overrides.amount}`,
  userId: 'u1',
  title: null,
  type: 'expense',
  vaultId: null,
  vault: null,
  tags: [],
  isCommitted: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const occurrence = (overrides: Partial<OccurrenceDto> & Pick<OccurrenceDto, 'date' | 'amount'>): OccurrenceDto => ({
  recurringId: 'r1',
  title: null,
  type: 'expense',
  vaultId: null,
  vault: null,
  tags: [],
  ...overrides,
});

const food = tag('t-food', 'Food');
const rent = tag('t-rent', 'Rent');

const build = (input: Partial<Parameters<typeof buildYearlyTable>[0]>) => buildYearlyTable({ transactions: [], occurrences: [], tags: [food, rent], year: 2026, vaultId: 'all', ...input });

describe('buildYearlyTable', () => {
  it('returns 12 empty month rows and no tag columns when there is nothing to aggregate', () => {
    const model = build({});

    expect(model.rows).toHaveLength(12);
    expect(model.rows[0].label).toBe('Jan');
    expect(model.tagColumns).toEqual([]);
    expect(model.hasData).toBe(false);
    expect(model.totals.spent.amount).toBe(0);
  });

  it('sums expenses per month into the matching tag column', () => {
    const model = build({
      transactions: [
        transaction({ date: '2026-01-10', amount: 100, tags: [food] }),
        transaction({ date: '2026-01-20', amount: 50, tags: [food] }),
        transaction({ date: '2026-02-01', amount: 900, tags: [rent] }),
      ],
    });

    expect(model.rows[0].byTagId[food.id].amount).toBe(150);
    expect(model.rows[0].spent.amount).toBe(150);
    expect(model.rows[1].byTagId[rent.id].amount).toBe(900);
    expect(model.rows[1].byTagId[food.id].amount).toBe(0);
    expect(model.totals.spent.amount).toBe(1050);
  });

  it('splits a multi-tag expense evenly so the tag columns still add up to SPENT', () => {
    const model = build({ transactions: [transaction({ date: '2026-03-05', amount: 100, tags: [food, rent] })] });

    const row = model.rows[2];
    expect(row.byTagId[food.id].amount).toBe(50);
    expect(row.byTagId[rent.id].amount).toBe(50);
    expect(row.byTagId[food.id].amount + row.byTagId[rent.id].amount).toBe(row.spent.amount);
  });

  it('collects untagged expenses in the Untagged column, placed last', () => {
    const model = build({ transactions: [transaction({ date: '2026-04-05', amount: 40 }), transaction({ date: '2026-04-06', amount: 10, tags: [food] })] });

    expect(model.tagColumns.map((c) => c.id)).toEqual([food.id, UNTAGGED_COLUMN_ID]);
    expect(model.rows[3].byTagId[UNTAGGED_COLUMN_ID].amount).toBe(40);
  });

  it('keeps income out of the tag columns and computes net as income - spent', () => {
    const model = build({
      transactions: [transaction({ date: '2026-05-01', amount: 3000, type: 'income', tags: [food] }), transaction({ date: '2026-05-02', amount: 1200, tags: [rent] })],
    });

    const row = model.rows[4];
    expect(row.income.amount).toBe(3000);
    expect(row.spent.amount).toBe(1200);
    expect(row.net.amount).toBe(1800);
    expect(row.byTagId[food.id]).toBeUndefined();
    expect(model.tagColumns.map((c) => c.id)).toEqual([rent.id]);
  });

  it('excludes transfers entirely', () => {
    const model = build({ transactions: [transaction({ date: '2026-06-01', amount: 500, type: 'transfer', tags: [food] })] });

    expect(model.hasData).toBe(false);
    expect(model.totals.spent.amount).toBe(0);
    expect(model.tagColumns).toEqual([]);
  });

  it('ignores transactions from other years', () => {
    const model = build({ transactions: [transaction({ date: '2025-01-10', amount: 100, tags: [food] }), transaction({ date: '2026-01-10', amount: 20, tags: [food] })] });

    expect(model.totals.spent.amount).toBe(20);
  });

  it('filters transactions and occurrences by vault when a vault is selected', () => {
    const model = build({
      transactions: [transaction({ date: '2026-01-10', amount: 100, tags: [food], vaultId: 'v1' }), transaction({ date: '2026-01-11', amount: 70, tags: [food], vaultId: 'v2' })],
      occurrences: [occurrence({ date: '2026-08-01', amount: 33, tags: [food], vaultId: 'v2' })],
      vaultId: 'v1',
    });

    expect(model.rows[0].spent.amount).toBe(100);
    expect(model.rows[7].spent.amount).toBe(0);
  });

  it('marks occurrence-only months as projected and mixed months as mixed', () => {
    const model = build({
      transactions: [transaction({ date: '2026-07-05', amount: 100, tags: [food] })],
      occurrences: [occurrence({ date: '2026-07-25', amount: 20, tags: [food] }), occurrence({ date: '2026-08-25', amount: 20, tags: [food] })],
    });

    expect(model.rows[6].source).toBe('mixed');
    expect(model.rows[6].spent.amount).toBe(120);
    expect(model.rows[6].byTagId[food.id].source).toBe('mixed');
    expect(model.rows[7].source).toBe('projected');
    expect(model.rows[7].spent.amount).toBe(20);
    expect(model.rows[0].source).toBe('actual');
  });

  it('orders tag columns by yearly total, largest first', () => {
    const model = build({ transactions: [transaction({ date: '2026-01-10', amount: 10, tags: [food] }), transaction({ date: '2026-01-11', amount: 900, tags: [rent] })] });

    expect(model.tagColumns.map((c) => c.name)).toEqual(['Rent', 'Food']);
  });

  it('totals every column and the summary columns across the year', () => {
    const model = build({
      transactions: [
        transaction({ date: '2026-01-10', amount: 100, tags: [food] }),
        transaction({ date: '2026-02-10', amount: 200, tags: [food] }),
        transaction({ date: '2026-02-11', amount: 1000, type: 'income' }),
      ],
    });

    expect(model.totals.byTagId[food.id].amount).toBe(300);
    expect(model.totals.spent.amount).toBe(300);
    expect(model.totals.income.amount).toBe(1000);
    expect(model.totals.net.amount).toBe(700);
  });
});

describe('projectableMonths', () => {
  const now = new Date(2026, 6, 15); // 15 Jul 2026

  it('returns no months for a past year', () => {
    expect(projectableMonths(2025, now)).toEqual([]);
  });

  it('returns the current month onwards for the current year', () => {
    expect(projectableMonths(2026, now)).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it('returns every month for a future year', () => {
    expect(projectableMonths(2027, now)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});
