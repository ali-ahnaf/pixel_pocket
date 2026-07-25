'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { CHART_OVERFLOW_COLOR, seriesColorAt } from '@/lib/chartPalette';
import type { ChartPoint, ChartSeries } from '@/lib/chartPalette';

const AXIS_COLOR = '#8d937f';
const GRID_COLOR = '#353437';

export interface VaultExpenseChartProps {
  readonly data: readonly ChartPoint[];
  readonly series: readonly ChartSeries[];
  readonly formatValue: (value: number) => string;
  /** Prefix for the tooltip heading, e.g. `Day` renders "Day 14". Pass an empty string for self-describing labels. */
  readonly xAxisLabel: string;
  readonly height?: number;
}

const compactValue = (value: number): string => {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(value % 1_000 === 0 ? 0 : 1)}k`;
  return String(value);
};

/** `active`, `label` and `payload` are injected by recharts when it clones the content element. */
type ChartTooltipProps = Partial<TooltipContentProps<number, string>> & {
  readonly series: readonly ChartSeries[];
  readonly formatValue: (value: number) => string;
  readonly xAxisLabel: string;
};

const ChartTooltip = ({ active, label, payload, series, formatValue, xAxisLabel }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;

  const rows = payload
    .map((entry) => ({
      key: String(entry.dataKey),
      name: series.find((s) => s.key === entry.dataKey)?.name ?? String(entry.dataKey),
      color: entry.color ?? CHART_OVERFLOW_COLOR,
      value: typeof entry.value === 'number' ? entry.value : 0,
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="bg-surface-container-high border-4 border-black shadow-[4px_4px_0_rgba(0,0,0,0.5)] p-2 flex flex-col gap-1 min-w-[160px]">
      <span className="font-label-caps text-[10px] text-outline uppercase">{`${xAxisLabel} ${label}`.trim()}</span>
      {rows.length === 0 && <span className="font-body-sm text-body-sm text-on-surface-variant">No expenses</span>}
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-3 font-body-sm text-body-sm">
          <span className="flex items-center gap-2 text-on-surface">
            <span className="w-3 h-3 border-2 border-black inline-block shrink-0" style={{ backgroundColor: row.color }} />
            {row.name}
          </span>
          <span className="text-on-surface-variant">{formatValue(row.value)}</span>
        </div>
      ))}
    </div>
  );
};

export function VaultExpenseChart({ data, series, formatValue, xAxisLabel, height = 240 }: VaultExpenseChartProps) {
  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Chart legend">
          {series.map((entry, index) => (
            <li key={entry.key} className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
              <span className="w-3 h-3 border-2 border-black inline-block shrink-0" style={{ backgroundColor: seriesColorAt(index) }} />
              {entry.name}
            </li>
          ))}
        </ul>
      )}

      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data as ChartPoint[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="label"
              stroke={AXIS_COLOR}
              tick={{ fill: AXIS_COLOR, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#000', strokeWidth: 2 }}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              stroke={AXIS_COLOR}
              tick={{ fill: AXIS_COLOR, fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: '#000', strokeWidth: 2 }}
              width={44}
              tickFormatter={compactValue}
              allowDecimals={false}
            />
            <Tooltip cursor={{ stroke: AXIS_COLOR, strokeWidth: 2, strokeDasharray: '2 4' }} content={<ChartTooltip series={series} formatValue={formatValue} xAxisLabel={xAxisLabel} />} />
            {series.map((entry, index) => (
              <Line
                key={entry.key}
                type="linear"
                dataKey={entry.key}
                name={entry.name}
                stroke={seriesColorAt(index)}
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 5, fill: seriesColorAt(index), stroke: '#000', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
