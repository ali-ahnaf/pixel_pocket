import type { OccurrenceDto, TagDto, TransactionDto } from '@expense-tracker/shared';

/** Pseudo tag-id for the column that collects transactions carrying no tag. */
export const UNTAGGED_COLUMN_ID = '__untagged__';

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Where the number in a cell came from: recorded transactions, projected recurring quests, or both. */
export type CellSource = 'actual' | 'projected' | 'mixed';

export interface TableCell {
  readonly amount: number;
  readonly source: CellSource;
}

export interface TagColumn {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
  readonly backgroundColor: string | null;
}

export interface MonthRow {
  /** 1-12, or 0 for the year-total footer row. */
  readonly month: number;
  readonly label: string;
  readonly byTagId: Record<string, TableCell>;
  readonly spent: TableCell;
  readonly income: TableCell;
  readonly net: TableCell;
  readonly source: CellSource;
}

export interface YearlyTableModel {
  readonly year: number;
  readonly tagColumns: TagColumn[];
  readonly rows: MonthRow[];
  readonly totals: MonthRow;
  readonly hasData: boolean;
}

export interface BuildYearlyTableInput {
  readonly transactions: TransactionDto[];
  /** Projected (not yet applied, not skipped) recurring occurrences for the current + future months of `year`. */
  readonly occurrences: OccurrenceDto[];
  readonly tags: TagDto[];
  readonly year: number;
  /** A vault id, or `'all'` for no vault filtering. */
  readonly vaultId: string;
}

/** A transaction or a projected occurrence, reduced to the fields the table cares about. */
interface Entry {
  readonly month: number;
  readonly amount: number;
  readonly type: TransactionDto['type'];
  readonly tagIds: string[];
  readonly source: 'actual' | 'projected';
}

interface MutableCell {
  amount: number;
  actual: boolean;
  projected: boolean;
}

const createCell = (): MutableCell => ({ amount: 0, actual: false, projected: false });

const addToCell = (cell: MutableCell, amount: number, source: 'actual' | 'projected'): void => {
  cell.amount += amount;
  if (source === 'actual') cell.actual = true;
  else cell.projected = true;
};

const mergeCell = (target: MutableCell, other: MutableCell): void => {
  target.amount += other.amount;
  target.actual = target.actual || other.actual;
  target.projected = target.projected || other.projected;
};

const resolveSource = (cell: MutableCell): CellSource => {
  if (cell.actual && cell.projected) return 'mixed';
  if (cell.projected) return 'projected';
  return 'actual';
};

const freezeCell = (cell: MutableCell): TableCell => ({ amount: cell.amount, source: resolveSource(cell) });

/** Parses the year and 1-12 month out of a `YYYY-MM-DD` date, or null when unparseable. */
const parseYearMonth = (date: string): { year: number; month: number } | null => {
  const [year, month] = date.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
};

const matchesVault = (entryVaultId: string | null, vaultId: string): boolean => vaultId === 'all' || entryVaultId === vaultId;

const toEntries = ({ transactions, occurrences, year, vaultId }: BuildYearlyTableInput): Entry[] => {
  const entries: Entry[] = [];

  for (const transaction of transactions) {
    // Transfers move money between vaults; they are neither spend nor income.
    if (transaction.type === 'transfer') continue;
    if (!matchesVault(transaction.vaultId, vaultId)) continue;
    const parsed = parseYearMonth(transaction.date);
    if (!parsed || parsed.year !== year) continue;
    entries.push({ month: parsed.month, amount: transaction.amount, type: transaction.type, tagIds: (transaction.tags ?? []).map((tag) => tag.id), source: 'actual' });
  }

  for (const occurrence of occurrences) {
    if (occurrence.type === 'transfer') continue;
    if (!matchesVault(occurrence.vaultId, vaultId)) continue;
    const parsed = parseYearMonth(occurrence.date);
    if (!parsed || parsed.year !== year) continue;
    entries.push({ month: parsed.month, amount: occurrence.amount, type: occurrence.type, tagIds: (occurrence.tags ?? []).map((tag) => tag.id), source: 'projected' });
  }

  return entries;
};

/**
 * Aggregates transactions and projected recurring occurrences into the 12-row
 * month x tag grid rendered by `/views/table`.
 *
 * Semantics (see plan.md §4): tag columns sum **expenses only** so each row adds
 * up to its SPENT total; a multi-tag expense is split evenly across its tags for
 * the same reason; income only ever feeds the INCOME column.
 */
export const buildYearlyTable = (input: BuildYearlyTableInput): YearlyTableModel => {
  const { tags, year } = input;
  const entries = toEntries(input);

  const monthCells: Record<string, MutableCell>[] = Array.from({ length: 12 }, () => ({}));
  const monthSpent = Array.from({ length: 12 }, createCell);
  const monthIncome = Array.from({ length: 12 }, createCell);
  const tagTotals = new Map<string, number>();

  for (const entry of entries) {
    const index = entry.month - 1;

    if (entry.type === 'income') {
      addToCell(monthIncome[index], entry.amount, entry.source);
      continue;
    }

    addToCell(monthSpent[index], entry.amount, entry.source);

    const columnIds = entry.tagIds.length > 0 ? entry.tagIds : [UNTAGGED_COLUMN_ID];
    const share = entry.amount / columnIds.length;
    for (const columnId of columnIds) {
      const cells = monthCells[index];
      cells[columnId] = cells[columnId] ?? createCell();
      addToCell(cells[columnId], share, entry.source);
      tagTotals.set(columnId, (tagTotals.get(columnId) ?? 0) + share);
    }
  }

  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  // Only tags with activity in this year + vault get a column, otherwise a user
  // with 30 tags gets 30 mostly-empty columns.
  const tagColumns: TagColumn[] = [...tagTotals.entries()]
    .filter(([id]) => id !== UNTAGGED_COLUMN_ID)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => {
      const tag = tagById.get(id);
      return { id, name: tag?.name ?? 'Unknown', icon: tag?.icon ?? null, backgroundColor: tag?.backgroundColor ?? null };
    });

  if (tagTotals.has(UNTAGGED_COLUMN_ID)) {
    tagColumns.push({ id: UNTAGGED_COLUMN_ID, name: 'Untagged', icon: null, backgroundColor: null });
  }

  const totalCells: Record<string, MutableCell> = {};
  const totalSpent = createCell();
  const totalIncome = createCell();

  const rows: MonthRow[] = monthCells.map((cells, index) => {
    const byTagId: Record<string, TableCell> = {};
    const rowState = createCell();

    for (const column of tagColumns) {
      const cell = cells[column.id] ?? createCell();
      byTagId[column.id] = freezeCell(cell);
      totalCells[column.id] = totalCells[column.id] ?? createCell();
      mergeCell(totalCells[column.id], cell);
    }

    mergeCell(rowState, monthSpent[index]);
    mergeCell(rowState, monthIncome[index]);
    mergeCell(totalSpent, monthSpent[index]);
    mergeCell(totalIncome, monthIncome[index]);

    const net: MutableCell = { amount: monthIncome[index].amount - monthSpent[index].amount, actual: rowState.actual, projected: rowState.projected };

    return {
      month: index + 1,
      label: MONTH_LABELS[index],
      byTagId,
      spent: freezeCell(monthSpent[index]),
      income: freezeCell(monthIncome[index]),
      net: freezeCell(net),
      source: resolveSource(rowState),
    };
  });

  const totalsState: MutableCell = { amount: 0, actual: totalSpent.actual || totalIncome.actual, projected: totalSpent.projected || totalIncome.projected };
  const totalsByTagId: Record<string, TableCell> = {};
  for (const column of tagColumns) {
    totalsByTagId[column.id] = freezeCell(totalCells[column.id] ?? createCell());
  }

  const totals: MonthRow = {
    month: 0,
    label: 'Year',
    byTagId: totalsByTagId,
    spent: freezeCell(totalSpent),
    income: freezeCell(totalIncome),
    net: freezeCell({ amount: totalIncome.amount - totalSpent.amount, actual: totalsState.actual, projected: totalsState.projected }),
    source: resolveSource(totalsState),
  };

  return { year, tagColumns, rows, totals, hasData: entries.length > 0 };
};

/**
 * Months of `year` that still need projecting: the current month onwards when
 * `year` is the current year, every month for a future year, none for the past.
 */
export const projectableMonths = (year: number, now: Date = new Date()): number[] => {
  const currentYear = now.getFullYear();
  if (year < currentYear) return [];
  const firstMonth = year === currentYear ? now.getMonth() + 1 : 1;
  return Array.from({ length: 12 - firstMonth + 1 }, (_, i) => firstMonth + i);
};
