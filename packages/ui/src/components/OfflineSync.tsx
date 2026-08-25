'use client';

import { useEffect, useRef } from 'react';

import { profileApi } from '@/lib/api';
import { NetworkError } from '@/lib/api/ApiClient';
import { peekAll, remove } from '@/lib/offline/outbox';
import { OFFLINE_SYNCED_EVENT } from '@/lib/offline/sync-events';

/**
 * Drains the offline outbox. Mounted once in the root layout: it renders
 * nothing and only reacts to the browser coming back online (plus one attempt
 * at mount, for the case where the app was closed with entries still queued).
 *
 * Entries are replayed sequentially, in the order they were made, so a queue is
 * never reordered. Each payload carries a `clientRequestId`, so an entry whose
 * first attempt actually reached the server returns the original row instead of
 * creating a duplicate.
 */
export function OfflineSync() {
  const isSyncing = useRef(false);

  useEffect(() => {
    const sync = async (): Promise<void> => {
      if (isSyncing.current) return;
      const entries = peekAll();
      if (entries.length === 0) return;

      isSyncing.current = true;
      let synced = 0;

      try {
        for (const entry of entries) {
          try {
            if (entry.kind === 'create-transaction') {
              await profileApi.createTransaction(entry.userId, entry.payload);
            } else {
              await profileApi.createDebt(entry.userId, entry.payload);
            }
            remove(entry.id);
            synced += 1;
          } catch (err) {
            // Still no network: stop and leave the rest queued for the next
            // `online` event, keeping the replay in order.
            if (err instanceof NetworkError) break;

            // The server answered and rejected it. Retrying forever would never
            // succeed and would block everything behind it, so drop the entry.
            console.error('Dropping unsyncable offline entry', entry.kind, err);
            remove(entry.id);
          }
        }
      } finally {
        isSyncing.current = false;
      }

      if (synced > 0) window.dispatchEvent(new CustomEvent(OFFLINE_SYNCED_EVENT));
    };

    void sync();
    window.addEventListener('online', sync);
    return () => window.removeEventListener('online', sync);
  }, []);

  return null;
}

export default OfflineSync;
