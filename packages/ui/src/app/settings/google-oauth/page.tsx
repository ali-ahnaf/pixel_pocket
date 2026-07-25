'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, ArrowLeft, CheckCircle2, Mail, Bell } from 'lucide-react';
import type { GmailLabelDto, GmailWatchStatusDto, TagDto, VaultDto, VaultGmailWatcherDto } from '@expense-tracker/shared';
import { AppBar, BottomNavBar, DesktopSidebar } from '@/components';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { useAuth } from '@/hooks/useAuth';
import { profileApi } from '@/lib/api';
import { VaultWatcherCard } from './VaultWatcherCard';

export default function GoogleOAuthSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [configured, setConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | undefined>(undefined);
  const [statusLoading, setStatusLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Gmail bank-alert watch (per-vault watchers)
  const [labels, setLabels] = useState<GmailLabelDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [vaults, setVaults] = useState<VaultDto[]>([]);
  const [watchers, setWatchers] = useState<VaultGmailWatcherDto[]>([]);
  const [watchStatus, setWatchStatus] = useState<GmailWatchStatusDto | null>(null);
  const [watchLoading, setWatchLoading] = useState(false);

  // Surface the outcome of the OAuth callback redirect (?connected=1 / ?error=...).
  useEffect(() => {
    if (searchParams.get('connected') === '1') setConnected(true);
    const callbackError = searchParams.get('error');
    if (callbackError) setError(`Gmail connection failed: ${callbackError}`);
  }, [searchParams]);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    setStatusLoading(true);

    profileApi
      .getOAuthCredentialsStatus(user.id)
      .then((status) => {
        if (cancelled) return;
        setConfigured(status.configured);
        setConnected((prev) => prev || status.connected);
        setGoogleEmail(status.googleEmail);
      })
      .catch((err) => {
        if (!cancelled) setError(profileApi.parseError(err));
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const validate = (): string | null => {
    if (!clientId.trim()) return 'Client ID required';
    if (!clientSecret.trim()) return 'Client Secret required';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!user?.id) {
      setError('You must be signed in to configure Google OAuth');
      return;
    }

    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      const status = await profileApi.setOAuthCredentials(user.id, { clientId, clientSecret });
      setConfigured(status.configured);
      setSuccess(true);
      setClientId('');
      setClientSecret('');
    } catch (err) {
      const message = profileApi.parseError(err);
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleConnectGmail = async (): Promise<void> => {
    if (!user?.id) {
      setError('You must be signed in to connect Gmail');
      return;
    }

    setError(null);
    setConnecting(true);

    try {
      const { url } = await profileApi.getGoogleAuthorizeUrl(user.id);
      window.location.href = url;
    } catch (err) {
      setError(profileApi.parseError(err));
      setConnecting(false);
    }
  };

  // Load the watch state, labels, vaults and per-vault watchers once Gmail is
  // connected. Reused as the refresh callback after a watcher is saved/removed.
  const loadWatchData = useCallback(async (): Promise<void> => {
    if (!user?.id) return;

    setWatchLoading(true);
    try {
      const [status, labelList, vaultList, watcherList, tagList] = await Promise.all([
        profileApi.getGmailWatchStatus(user.id),
        profileApi.getGmailLabels(user.id),
        profileApi.getVaults(user.id),
        profileApi.getVaultWatchers(user.id),
        profileApi.getTags(user.id),
      ]);
      setWatchStatus(status);
      setLabels(labelList);
      setVaults(vaultList);
      setWatchers(watcherList);
      setTags(tagList);
    } catch (err) {
      setError(profileApi.parseError(err));
    } finally {
      setWatchLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!connected) return;
    void loadWatchData();
  }, [connected, loadWatchData]);

  return (
    <div className="bg-background text-on-background font-body-lg min-h-screen flex flex-col md:flex-row overflow-x-hidden selection:bg-primary selection:text-on-primary">
      <AppBar />

      <DesktopSidebar />

      <main className="flex-1 flex flex-col w-full md:h-screen relative px-3 md:px-0 pb-24 md:pb-0 overflow-y-auto overflow-x-hidden">
        <div className="w-full p-margin-mobile md:p-8 flex flex-col gap-stack-md">
          <div className="mt-2 bg-surface-container-high border-4 border-black shadow-[6px_6px_0_0_rgba(0,0,0,1)]">
            {/* Header */}
            <div className="px-6 py-4 border-b-4 border-black bg-surface-container flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              <h2 className="font-headline-sm text-primary uppercase tracking-wider">Setup Google OAuth</h2>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="px-6 py-6 flex flex-col gap-5">
              <p className="text-[12px] text-on-surface-variant">
                Bring your own Google OAuth client to enable Google sign-in for your account. Your Client Secret is encrypted at rest and is never shown again after saving.
              </p>

              {!statusLoading && configured && (
                <p className="flex items-center gap-2 font-mono text-label-caps text-primary uppercase border-4 border-black bg-surface-container p-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Already configured
                </p>
              )}

              <Input
                label="Client ID"
                type="text"
                value={clientId}
                placeholder={configured ? '••••••••••••••••' : undefined}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setError(null);
                }}
                autoComplete="off"
                name="google-oauth-client-id"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                spellCheck={false}
              />

              <Input
                label="Client Secret"
                type="password"
                value={clientSecret}
                placeholder={configured ? '••••••••••••••••' : undefined}
                onChange={(e) => {
                  setClientSecret(e.target.value);
                  setError(null);
                }}
                autoComplete="new-password"
                name="google-oauth-client-secret"
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                spellCheck={false}
                error={error || undefined}
              />

              {success && <p className="font-mono text-label-caps text-primary uppercase border-4 border-black bg-surface-container p-3">Google OAuth credentials saved</p>}

              <Button type="submit" disabled={saving} className="w-full py-3" variant="primary">
                {saving ? 'Saving…' : 'Save Credentials'}
              </Button>
            </form>

            {/* Gmail connection — only meaningful once a client id/secret is stored */}
            {!statusLoading && configured && (
              <div className="px-6 py-6 border-t-4 border-black flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-primary" />
                  <h3 className="font-headline-sm text-primary uppercase tracking-wider">Gmail Connection</h3>
                </div>

                <p className="text-[12px] text-on-surface-variant">
                  Grant read-only access to your Gmail so bank alert emails can be scanned for transactions. You will be redirected to Google to approve the {'gmail.readonly'} scope.
                </p>

                {connected ? (
                  <p className="flex items-center gap-2 font-mono text-label-caps text-primary uppercase border-4 border-black bg-surface-container p-3">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {googleEmail ? `Connected as ${googleEmail}` : 'Gmail connected'}
                  </p>
                ) : null}

                <Button type="button" onClick={handleConnectGmail} disabled={connecting} className="w-full py-3" variant="primary">
                  {connecting ? 'Redirecting…' : connected ? 'Reconnect Gmail' : 'Connect Gmail'}
                </Button>
              </div>
            )}

            {/* Bank-alert watch — attach a Gmail label per vault; AI extracts the transaction */}
            {!statusLoading && connected && (
              <div className="px-6 py-6 border-t-4 border-black flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Bell className="w-5 h-5 text-primary" />
                  <h3 className="font-headline-sm text-primary uppercase tracking-wider">Bank Alert Watch</h3>
                </div>

                <p className="text-[12px] text-on-surface-variant">
                  Attach a Gmail label to a vault. AI reads each matching email and fills in the transaction — amount, title, type and tags — automatically.
                </p>

                {watchStatus?.watching ? (
                  <p className="flex items-center gap-2 font-mono text-label-caps text-primary uppercase border-4 border-black bg-surface-container p-3">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Watching{watchStatus.expiry ? ` · renews by ${new Date(watchStatus.expiry).toLocaleDateString()}` : ''}
                  </p>
                ) : (
                  <p className="font-mono text-label-caps text-on-surface-variant uppercase border-4 border-black bg-surface-container p-3">Not watching</p>
                )}

                {watchLoading ? (
                  <p className="text-[12px] text-on-surface-variant">Loading vaults…</p>
                ) : vaults.length === 0 ? (
                  <p className="text-[12px] text-on-surface-variant">No vaults yet — create a vault first.</p>
                ) : (
                  <div className="flex flex-col gap-4">
                    {vaults.map((vault) => (
                      <VaultWatcherCard
                        key={vault.id}
                        userId={user!.id}
                        vault={vault}
                        watcher={watchers.find((w) => w.vaultId === vault.id)}
                        labels={labels}
                        tags={tags}
                        onChanged={loadWatchData}
                        onError={setError}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      <BottomNavBar />
    </div>
  );
}
