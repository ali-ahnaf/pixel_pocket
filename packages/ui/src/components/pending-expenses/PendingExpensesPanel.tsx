'use client';

import { useCallback, useEffect, useState } from 'react';
import { Inbox, ChevronRight } from 'lucide-react';
import type { PendingGmailExpenseDto, TagDto } from '@expense-tracker/shared';
import { Card } from '@/components/Card';
import { Badge } from '@/components/Badge';
import { profileApi } from '@/lib/api';
import { PendingExpenseDetailModal } from './PendingExpenseDetailModal';

interface PendingExpensesPanelProps {
  userId: string | null;
  onTransactionCreated?: () => void;
}

/**
 * Gmail bank-alert review queue: fetched once the user is authenticated,
 * showing the stored email subject with the vault name as a chip plus the
 * guidance hint per pointer (no email body — that is re-fetched live on
 * click). Clicking an item opens the parse/dismiss flow. See
 * documentation/openrouter-ai-migration.md (T12).
 */
export function PendingExpensesPanel({ userId, onTransactionCreated }: PendingExpensesPanelProps): JSX.Element | null {
  const [items, setItems] = useState<PendingGmailExpenseDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [selected, setSelected] = useState<PendingGmailExpenseDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPending = useCallback((): void => {
    if (!userId) return;
    Promise.all([profileApi.getPendingExpenses(userId), profileApi.getTags(userId)])
      .then(([pending, tagList]) => {
        setItems(pending);
        setTags(tagList);
      })
      .catch((err) => setError(profileApi.parseError(err)));
  }, [userId]);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const handleResolved = (id: string, transactionCreated: boolean): void => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    setSelected(null);
    if (transactionCreated) onTransactionCreated?.();
  };

  if (!userId || (items.length === 0 && !error)) return null;

  return (
    <>
      <Card className="flex flex-col gap-3 !p-4 bg-surface-container border-secondary">
        <div className="flex items-center justify-between border-b-4 border-black pb-2">
          <h3 className="font-label-caps text-outline uppercase flex items-center gap-2">
            <Inbox className="w-4 h-4" />
            Pending Expenses
          </h3>
          {items.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {items.length}
            </Badge>
          )}
        </div>

        {error && <p className="font-mono text-label-caps text-error uppercase">{error}</p>}

        {items.length > 0 && (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelected(item)}
                className="flex items-center justify-between gap-2 bg-surface p-3 border-4 border-dashed border-secondary hover:bg-secondary-container/20 active:translate-y-0.5 transition-colors text-left"
              >
                <div className="min-w-0 flex flex-col gap-1">
                  <p className="font-body-sm font-bold text-on-surface truncate">{item.subject ?? 'No subject'}</p>
                  <Badge variant="secondary" className="text-[10px] self-start max-w-full truncate">
                    {item.vaultName}
                  </Badge>
                  {item.guidanceHint && <p className="text-[11px] text-on-surface-variant truncate">{item.guidanceHint}</p>}
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 text-outline" />
              </button>
            ))}
          </div>
        )}
      </Card>

      <PendingExpenseDetailModal isOpen={!!selected} onClose={() => setSelected(null)} userId={userId} item={selected} tags={tags} onResolved={handleResolved} />
    </>
  );
}
