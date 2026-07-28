'use client';

import React from 'react';
import { iconMapper } from '@/lib/iconMapper';
import type { CellSource, MonthRow, TableCell, TagColumn, YearlyTableModel } from '@/lib/views/build-yearly-table';

export interface YearlyTagTableProps {
  model: YearlyTableModel;
  isLoading?: boolean;
  /** 1-12 — highlighted as the current cycle. Omit when the table is not showing the current year. */
  currentMonth?: number;
}

const formatAmount = (amount: number): string => Math.round(Math.abs(amount)).toLocaleString('en-US');

const formatSigned = (amount: number): string => `${amount < 0 ? '−' : '+'}${formatAmount(amount)}`;

/** Projected numbers get a `~` prefix and muted italics so they never read as recorded spend. */
const cellText = (cell: TableCell, signed = false): string => {
  if (cell.amount === 0) return '—';
  const value = signed ? formatSigned(cell.amount) : formatAmount(cell.amount);
  return cell.source === 'actual' ? value : `~${value}`;
};

const sourceClass = (source: CellSource): string => (source === 'actual' ? '' : 'italic opacity-70');

const CELL_BASE = 'px-3 py-2 text-right font-body-sm tabular-nums whitespace-nowrap border-b-2 border-black/20';

interface RowProps {
  row: MonthRow;
  tagColumns: TagColumn[];
  isTotals?: boolean;
  isCurrent?: boolean;
}

const TableRow: React.FC<RowProps> = ({ row, tagColumns, isTotals = false, isCurrent = false }) => {
  const rowBg = isTotals ? 'bg-surface-container-highest' : isCurrent ? 'bg-primary-container/40' : 'bg-surface-container-low';
  // Sticky cells must be fully opaque or the scrolling columns show through them. The current-month
  // tint is translucent, so it is re-created as a flat gradient painted over a solid surface colour.
  const stickyBg = isCurrent && !isTotals ? 'bg-surface-container-low bg-gradient-to-r from-primary-container/40 to-primary-container/40' : rowBg;
  const emphasis = isTotals ? 'font-black' : '';

  return (
    <tr className={rowBg}>
      <th
        scope="row"
        className={`sticky left-0 z-10 ${stickyBg} px-3 py-2 text-left font-label-caps text-xs uppercase tracking-wider border-r-4 border-b-2 border-black whitespace-nowrap ${emphasis}`}
      >
        <span className="flex items-center gap-1">
          {isTotals ? 'Year ∑' : row.label}
          {row.source === 'projected' && <span title="Projected from recurring quests">~</span>}
          {row.source === 'mixed' && <span title="Actuals so far plus remaining projected recurring quests">◐</span>}
        </span>
      </th>

      {tagColumns.map((column) => {
        const cell = row.byTagId[column.id];
        return (
          <td key={column.id} className={`${CELL_BASE} ${emphasis} ${sourceClass(cell.source)}`}>
            {cellText(cell)}
          </td>
        );
      })}

      <td className={`${CELL_BASE} border-l-4 border-l-black font-bold text-error ${sourceClass(row.spent.source)}`}>{cellText(row.spent)}</td>
      <td className={`${CELL_BASE} font-bold text-primary ${sourceClass(row.income.source)}`}>{cellText(row.income)}</td>
      <td
        className={`md:sticky md:right-0 md:z-10 ${stickyBg} ${CELL_BASE} border-l-4 border-l-black font-bold ${row.net.amount >= 0 ? 'text-secondary' : 'text-error'} ${sourceClass(row.net.source)}`}
      >
        {row.net.amount === 0 ? '—' : cellText(row.net, true)}
      </td>
    </tr>
  );
};

export const YearlyTagTable: React.FC<YearlyTagTableProps> = ({ model, isLoading = false, currentMonth }) => {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 animate-pulse" data-testid="yearly-table-loading">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="h-8 bg-surface-container-highest border-4 border-black" />
        ))}
      </div>
    );
  }

  if (!model.hasData) {
    return <p className="font-body-sm text-on-surface-variant py-8 text-center">No transactions or projections for {model.year}.</p>;
  }

  const headerCell = 'px-3 py-2 text-right font-label-caps text-[11px] uppercase tracking-wider whitespace-nowrap border-b-4 border-black bg-surface-container-high';

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto border-4 border-black bg-surface-container-low">
        <table className="min-w-max w-full border-collapse">
          <caption className="sr-only">Monthly spend per tag for {model.year}, with totals and recurring-quest projections</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 px-3 py-2 text-left font-label-caps text-[11px] uppercase tracking-wider border-r-4 border-b-4 border-black bg-surface-container-high"
              >
                Month
              </th>
              {model.tagColumns.map((column) => {
                const Icon = column.icon ? iconMapper(column.icon) : null;
                return (
                  <th key={column.id} scope="col" className={`sticky top-0 z-20 ${headerCell}`} title={column.name}>
                    <span className="flex items-center justify-end gap-1">
                      {Icon && <Icon className="w-3 h-3 shrink-0" />}
                      <span className="max-w-[10ch] truncate">{column.name}</span>
                    </span>
                  </th>
                );
              })}
              <th scope="col" className={`sticky top-0 z-20 ${headerCell} border-l-4 border-l-black text-error`}>
                Spent
              </th>
              <th scope="col" className={`sticky top-0 z-20 ${headerCell} text-primary`}>
                Income
              </th>
              <th scope="col" className={`sticky top-0 z-20 md:right-0 md:z-30 ${headerCell} border-l-4 border-l-black`}>
                Net
              </th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
              <TableRow key={row.month} row={row} tagColumns={model.tagColumns} isCurrent={row.month === currentMonth} />
            ))}
          </tbody>
          <tfoot>
            <TableRow row={model.totals} tagColumns={model.tagColumns} isTotals />
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 font-body-sm text-[11px] text-on-surface-variant">
        <span>
          <span className="font-bold">◐</span> actuals so far + remaining projected recurring quests
        </span>
        <span>
          <span className="font-bold italic opacity-70">~</span> projected from recurring quests only
        </span>
        <span>Tag columns sum expenses; a multi-tag expense is split evenly across its tags.</span>
      </div>
    </div>
  );
};
