'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { Card } from '@/components/Card';
import { profileApi } from '@/lib/api';

interface GmailReconnectBannerProps {
  userId: string | null;
}

/**
 * Warns that Google expired (or the user revoked) the stored Gmail refresh token,
 * which the API detects on its next refresh and reports as `reconnectRequired`.
 * Until the user re-runs the consent flow no bank alerts are imported, so this is
 * deliberately not dismissible. Renders nothing in every other state.
 */
export function GmailReconnectBanner({ userId }: GmailReconnectBannerProps): JSX.Element | null {
  const [reconnectRequired, setReconnectRequired] = useState(false);

  const fetchStatus = useCallback((): void => {
    if (!userId) return;
    profileApi
      .getOAuthCredentialsStatus(userId)
      .then((status) => setReconnectRequired(status.reconnectRequired))
      // A status lookup failure is not worth its own banner — the panel just stays hidden.
      .catch(() => setReconnectRequired(false));
  }, [userId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  if (!userId || !reconnectRequired) return null;

  return (
    <Card className="flex flex-col gap-3 !p-4 bg-surface-container border-error">
      <div className="flex items-center gap-2 border-b-4 border-black pb-2">
        <AlertTriangle className="w-4 h-4 text-error" />
        <h3 className="font-label-caps text-error uppercase">Gmail Disconnected</h3>
      </div>

      <p className="font-body-sm text-on-surface">Google expired the connection. Reconnect to resume importing bank alerts.</p>

      <Link
        href="/settings/google-oauth"
        className="flex items-center justify-between gap-2 bg-surface p-3 border-4 border-dashed border-error hover:bg-error-container/20 active:translate-y-0.5 transition-colors"
      >
        <span className="font-label-caps text-on-surface uppercase">Reconnect</span>
        <ChevronRight className="w-4 h-4 shrink-0 text-error" />
      </Link>
    </Card>
  );
}
