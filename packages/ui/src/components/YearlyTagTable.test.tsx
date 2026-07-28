import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { YearlyTagTable } from './YearlyTagTable';
import { buildYearlyTable } from '@/lib/views/build-yearly-table';
import type { OccurrenceDto, TagDto, TransactionDto } from '@expense-tracker/shared';

const food: TagDto = { id: 't-food', userId: 'u1', name: 'Food', icon: null, backgroundColor: null };

const transaction = (date: string, amount: number, type: TransactionDto['type'] = 'expense'): TransactionDto => ({
  id: `tx-${date}-${amount}`,
  userId: 'u1',
  title: null,
  amount,
  type,
  date,
  vaultId: null,
  vault: null,
  tags: type === 'expense' ? [food] : [],
  isCommitted: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const occurrence = (date: string, amount: number): OccurrenceDto => ({
  recurringId: 'r1',
  date,
  title: null,
  amount,
  type: 'expense',
  vaultId: null,
  vault: null,
  tags: [food],
});

const model = buildYearlyTable({
  transactions: [transaction('2026-01-10', 150), transaction('2026-01-11', 1000, 'income')],
  occurrences: [occurrence('2026-08-01', 200)],
  tags: [food],
  year: 2026,
  vaultId: 'all',
});

const emptyModel = buildYearlyTable({ transactions: [], occurrences: [], tags: [], year: 2026, vaultId: 'all' });

describe('YearlyTagTable', () => {
  it('renders a skeleton while loading', () => {
    render(<YearlyTagTable model={emptyModel} isLoading />);
    expect(screen.getByTestId('yearly-table-loading')).toBeInTheDocument();
  });

  it('renders an empty message when the year has no data', () => {
    render(<YearlyTagTable model={emptyModel} />);
    expect(screen.getByText(/no transactions or projections for 2026/i)).toBeInTheDocument();
  });

  it('renders a month row per month plus the year totals row', () => {
    render(<YearlyTagTable model={model} />);

    expect(screen.getByRole('rowheader', { name: /jan/i })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /dec/i })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /year ∑/i })).toBeInTheDocument();
  });

  it('renders tag columns alongside the spent, income and net summary columns', () => {
    render(<YearlyTagTable model={model} />);

    expect(screen.getByRole('columnheader', { name: /food/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /spent/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /income/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /net/i })).toBeInTheDocument();
  });

  it('shows actual amounts unmarked and projected amounts prefixed with ~', () => {
    render(<YearlyTagTable model={model} />);

    const january = screen.getByRole('rowheader', { name: /jan/i }).closest('tr') as HTMLElement;
    // 150 shows twice: once in the Food column, once in the Spent column.
    expect(within(january).getAllByText('150')).toHaveLength(2);
    expect(within(january).getByText('+850')).toBeInTheDocument();

    const august = screen.getByRole('rowheader', { name: /aug/i }).closest('tr') as HTMLElement;
    expect(within(august).getAllByText('~200').length).toBeGreaterThan(0);
    expect(within(august).getByText('~−200')).toBeInTheDocument();
  });

  it('renders the projection legend', () => {
    render(<YearlyTagTable model={model} />);
    expect(screen.getByText(/projected from recurring quests only/i)).toBeInTheDocument();
  });
});
