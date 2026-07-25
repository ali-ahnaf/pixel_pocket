'use client';

import { RefreshCw } from 'lucide-react';
import type { OpenRouterUsage } from '@/lib/ai/openrouter';

interface UsagePanelProps {
  usage: OpenRouterUsage | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

/** OpenRouter credits are denominated in USD (1 credit === $1). */
function formatCredits(value: number): string {
  return `$${value.toFixed(4)}`;
}

function UsageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-4 border-black bg-surface-container p-3">
      <span className="font-mono text-label-caps text-on-surface-variant uppercase">{label}</span>
      <span className="font-mono text-label-caps text-on-surface uppercase">{value}</span>
    </div>
  );
}

export function UsagePanel({ usage, loading, error, onRefresh }: UsagePanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-headline-sm text-primary uppercase tracking-wider">Usage</h3>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-2 border-4 border-black bg-surface-container px-3 py-2 font-mono text-label-caps uppercase text-on-surface hover:text-primary disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <p className="text-[12px] text-on-surface-variant">Spend reported by OpenRouter for the saved key. Fetched directly from your browser — nothing is stored on our server.</p>

      {error && <p className="font-mono text-label-caps text-error uppercase border-4 border-black bg-surface-container p-3">{error}</p>}

      {loading && !usage && <p className="text-[12px] text-on-surface-variant">Loading usage…</p>}

      {usage && (
        <div className="flex flex-col gap-2">
          <UsageRow label="Key" value={usage.label} />
          <UsageRow label="Spent (this key)" value={formatCredits(usage.keyUsage)} />
          <UsageRow label="Key limit" value={usage.keyLimit === null ? 'Unlimited' : formatCredits(usage.keyLimit)} />
          {usage.keyLimitRemaining !== null && <UsageRow label="Limit remaining" value={formatCredits(usage.keyLimitRemaining)} />}
          {usage.totalUsage !== null && <UsageRow label="Spent (account)" value={formatCredits(usage.totalUsage)} />}
          {usage.totalCredits !== null && usage.totalUsage !== null && <UsageRow label="Credits left" value={formatCredits(usage.totalCredits - usage.totalUsage)} />}
          {usage.isFreeTier && <UsageRow label="Tier" value="Free" />}
        </div>
      )}
    </div>
  );
}
