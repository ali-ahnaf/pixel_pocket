import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { VaultExpenseChart } from './VaultExpenseChart';
import { CHART_MAX_SERIES, CHART_OVERFLOW_COLOR, seriesColorAt } from '@/lib/chartPalette';
import type { ChartPoint, ChartSeries } from '@/lib/chartPalette';

const series: ChartSeries[] = [
  { key: 's0', name: 'Groceries' },
  { key: 's1', name: 'Rent' },
];

const data: ChartPoint[] = [
  { label: '1', s0: 120, s1: 0 },
  { label: '2', s0: 40, s1: 900 },
];

const formatValue = (value: number) => `⛁ ${value}`;

describe('VaultExpenseChart', () => {
  it('renders a legend entry per series', () => {
    render(<VaultExpenseChart data={data} series={series} formatValue={formatValue} xAxisLabel="Day" />);
    const legend = screen.getByRole('list', { name: 'Chart legend' });
    expect(legend.querySelectorAll('li').length).toBe(2);
    expect(screen.getByText('Groceries')).toBeDefined();
    expect(screen.getByText('Rent')).toBeDefined();
  });

  it('omits the legend for a single series (the heading already names it)', () => {
    render(<VaultExpenseChart data={data} series={[series[0]]} formatValue={formatValue} xAxisLabel="Day" />);
    expect(screen.queryByRole('list', { name: 'Chart legend' })).toBeNull();
  });

  it('assigns categorical hues in fixed order, never cycling', () => {
    const colors = Array.from({ length: CHART_MAX_SERIES }, (_, i) => seriesColorAt(i));
    expect(new Set(colors).size).toBe(CHART_MAX_SERIES);
    // Anything past the palette is the neutral overflow colour, not a reused hue.
    expect(colors).not.toContain(CHART_OVERFLOW_COLOR);
    expect(seriesColorAt(CHART_MAX_SERIES + 3)).toBe(CHART_OVERFLOW_COLOR);
  });
});
