/**
 * Categorical series palette for charts. Validated for colour-vision deficiency
 * separation against the app's dark chart surface (#201f22): every pair clears
 * the CVD and normal-vision separation floors, and every hue clears 3:1 contrast
 * against that surface.
 *
 * Hues are assigned in fixed order and never cycled — a series past the palette
 * size is folded into a single neutral "Other" series by the caller.
 */
const SERIES_COLORS = ['#c0f36e', '#6c9bf2', '#ff9e6b', '#d0bcff'] as const;

/** Neutral (outline) hue used for the aggregated overflow series. */
export const CHART_OVERFLOW_COLOR = '#8d937f';

export const CHART_MAX_SERIES = SERIES_COLORS.length;

export const seriesColorAt = (index: number): string => SERIES_COLORS[index] ?? CHART_OVERFLOW_COLOR;

export interface ChartSeries {
  /** Key of this series inside every `ChartPoint` (a plain identifier — recharts reads dotted keys as paths). */
  readonly key: string;
  readonly name: string;
}

export type ChartPoint = { label: string } & Record<string, string | number>;
