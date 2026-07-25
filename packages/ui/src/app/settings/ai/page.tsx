'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Sparkles, CheckCircle2, ShieldAlert, KeyRound } from 'lucide-react';
import type { AiCredentialStatusDto, SetAiCredentialInput } from '@expense-tracker/shared';
import { AppBar, BottomNavBar, DesktopSidebar } from '@/components';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { useAuth } from '@/hooks/useAuth';
import { useDekSession } from '@/hooks/useDekSession';
import { profileApi } from '@/lib/api';
import { decryptKey, encryptKey } from '@/lib/crypto/ai-key';
import { clearPendingWrapMetadata, getPendingWrapMetadata } from '@/lib/crypto/dek-session';
import { fetchUsage, listModels, type OpenRouterModel, type OpenRouterUsage } from '@/lib/ai/openrouter';
import { ModelPicker } from './ModelPicker';
import { UsagePanel } from './UsagePanel';

export default function AiSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { dek, loading: dekLoading } = useDekSession();

  const [status, setStatus] = useState<AiCredentialStatusDto | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const [usage, setUsage] = useState<OpenRouterUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    setStatusLoading(true);

    profileApi
      .getAiCredentialStatus(user.id)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch((err) => {
        if (!cancelled) setStatusError(profileApi.parseError(err));
      })
      .finally(() => {
        if (!cancelled) setStatusLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);

    listModels()
      .then((result) => {
        if (!cancelled) setModels(result);
      })
      .catch((err) => {
        if (!cancelled) setModelsError(err instanceof Error ? err.message : 'Failed to load OpenRouter models');
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Usage is read straight from OpenRouter with the user's own key, so it needs
  // the DEK to be unlocked in this session before the ciphertext can be opened.
  const loadUsage = useCallback(async (): Promise<void> => {
    if (dekLoading) return;

    if (!status?.hasKey || !status.keyCiphertext || !status.keyIv) {
      setUsage(null);
      setUsageError(null);
      return;
    }

    if (!dek) {
      setUsage(null);
      setUsageError('Encryption key locked — log out and back in to unlock it before viewing usage.');
      return;
    }

    setUsageError(null);
    setUsageLoading(true);

    try {
      const apiKey = await decryptKey(status.keyCiphertext, status.keyIv, dek);
      setUsage(await fetchUsage(apiKey));
    } catch (err) {
      setUsage(null);
      setUsageError(err instanceof Error ? err.message : 'Failed to load OpenRouter usage');
    } finally {
      setUsageLoading(false);
    }
  }, [dek, dekLoading, status?.hasKey, status?.keyCiphertext, status?.keyIv]);

  useEffect(() => {
    void loadUsage();
  }, [loadUsage]);

  const handleSaveKey = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    if (!user?.id) {
      setSaveError('You must be signed in to save an OpenRouter key.');
      return;
    }

    if (!apiKeyInput.trim()) {
      setSaveError('Enter your OpenRouter API key.');
      return;
    }

    if (dekLoading) {
      setSaveError('Still unlocking your encryption key — try again in a moment.');
      return;
    }

    if (!dek) {
      setSaveError('Your encryption key is not unlocked in this session. Please log out and log back in to unlock it, then try again.');
      return;
    }

    setSaveError(null);
    setSaveSuccess(false);
    setSaving(true);

    try {
      const { keyCiphertext, keyIv } = await encryptKey(apiKeyInput.trim(), dek);

      const hasExistingWrappingMetadata = Boolean(status?.salt && status?.wrappedDek && status?.dekIv && status?.kdfIterations);

      let salt: string;
      let kdfIterations: number;
      let dekIv: string;
      let wrappedDek: string;

      if (hasExistingWrappingMetadata && status) {
        // Normal path: a credential row already exists, so the KEK-wrapping
        // metadata (created at login/setup time from the login password) is
        // already on file. Reuse it unchanged — this component only ever
        // touches the key ciphertext + model, never the KEK-wrapping fields.
        salt = status.salt as string;
        kdfIterations = status.kdfIterations as number;
        dekIv = status.dekIv as string;
        wrappedDek = status.wrappedDek as string;
      } else {
        // First-ever save: no UserAiCredential row yet. The login/signup flow
        // (setupOrUnwrapDekAtLogin, @/lib/crypto/dek-login) already generated a
        // fresh DEK + password-derived KEK wrap for this session and stashed
        // the wrap metadata via setPendingWrapMetadata — this is the only
        // place a real (non-throwaway) KEK can be derived, since only the
        // login/signup form ever sees the plaintext password. Consume it here.
        const pending = getPendingWrapMetadata();
        if (!pending) {
          setSaveError('Encryption setup data is missing from this session. Please log out and back in, then try again.');
          setSaving(false);
          return;
        }
        salt = pending.salt;
        kdfIterations = pending.kdfIterations;
        dekIv = pending.dekIv;
        wrappedDek = pending.wrappedDek;
      }

      const payload: SetAiCredentialInput = {
        salt,
        kdfIterations,
        dekIv,
        wrappedDek,
        keyIv,
        keyCiphertext,
        ...(status?.selectedModel ? { selectedModel: status.selectedModel } : {}),
      };

      const updated = await profileApi.setAiCredential(user.id, payload);
      clearPendingWrapMetadata();
      setStatus(updated);
      setApiKeyInput('');
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(profileApi.parseError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSelectModel = async (modelId: string): Promise<void> => {
    if (!user?.id) return;

    setModelError(null);
    setModelSaving(true);

    try {
      const updated = await profileApi.setAiModel(user.id, { selectedModel: modelId });
      setStatus(updated);
    } catch (err) {
      setModelError(profileApi.parseError(err));
    } finally {
      setModelSaving(false);
    }
  };

  return (
    <div className="bg-background text-on-background font-body-lg min-h-screen flex flex-col md:flex-row overflow-x-hidden selection:bg-primary selection:text-on-primary">
      <AppBar />

      <DesktopSidebar />

      <main className="flex-1 flex flex-col w-full md:h-screen relative px-3 md:px-0 pb-24 md:pb-0 overflow-y-auto overflow-x-hidden">
        <div className="w-full p-margin-mobile md:p-8 flex flex-col gap-stack-md">
          <div className="mt-2 bg-surface-container-high border-4 border-black shadow-[6px_6px_0_0_rgba(0,0,0,1)]">
            {/* Header */}
            <div className="px-6 py-4 border-b-4 border-black bg-surface-container flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h2 className="font-headline-sm text-primary uppercase tracking-wider">OpenRouter AI</h2>
            </div>

            {/* Key section */}
            <form onSubmit={handleSaveKey} className="px-6 py-6 flex flex-col gap-5 border-b-4 border-black">
              <p className="text-[12px] text-on-surface-variant">
                Bring your own OpenRouter API key to power expense parsing and the wizard. Your key is encrypted in this browser before it ever leaves your device — our server only ever stores
                ciphertext.
              </p>

              {!statusLoading && (
                <p
                  className={`flex items-center gap-2 font-mono text-label-caps uppercase border-4 border-black p-3 ${
                    status?.hasKey ? 'text-primary bg-surface-container' : 'text-on-surface-variant bg-surface-container'
                  }`}
                >
                  {status?.hasKey ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <KeyRound className="w-4 h-4 shrink-0" />}
                  {status?.hasKey ? 'Key saved' : 'No key saved yet'}
                </p>
              )}

              {statusError && <p className="font-mono text-label-caps text-error uppercase border-4 border-black bg-surface-container p-3">{statusError}</p>}

              {!dekLoading && !dek && (
                <p className="flex items-center gap-2 font-mono text-label-caps text-error uppercase border-4 border-black bg-surface-container p-3">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  Encryption key locked — log out and back in to unlock it before saving a key.
                </p>
              )}

              <Input
                label="OpenRouter API Key"
                type="password"
                value={apiKeyInput}
                placeholder={status?.hasKey ? '••••••••••••••••' : 'sk-or-...'}
                onChange={(e) => {
                  setApiKeyInput(e.target.value);
                  setSaveError(null);
                  setSaveSuccess(false);
                }}
                autoComplete="off"
                error={saveError || undefined}
              />

              {saveSuccess && <p className="font-mono text-label-caps text-primary uppercase border-4 border-black bg-surface-container p-3">OpenRouter key saved</p>}

              <p className="font-mono text-[11px] text-on-surface-variant uppercase border-l-4 border-error pl-3">
                If you reset your password, your saved key cannot be recovered and you&apos;ll need to re-enter it.
              </p>

              <Button type="submit" disabled={saving || dekLoading} className="w-full py-3" variant="primary">
                {saving ? 'Saving…' : 'Save Key'}
              </Button>
            </form>

            {/* Model picker */}
            <div className="px-6 py-6 flex flex-col gap-4">
              <h3 className="font-headline-sm text-primary uppercase tracking-wider">Model</h3>

              <p className="text-[12px] text-on-surface-variant">Pick which OpenRouter model to use. This choice is not secret and is stored as plain text.</p>

              {modelError && <p className="font-mono text-label-caps text-error uppercase border-4 border-black bg-surface-container p-3">{modelError}</p>}

              <ModelPicker models={models} loading={modelsLoading} error={modelsError} selectedModel={status?.selectedModel ?? null} saving={modelSaving} onSelect={handleSelectModel} />
            </div>

            {/* Usage */}
            {status?.hasKey && (
              <div className="px-6 py-6 flex flex-col gap-4 border-t-4 border-black">
                <UsagePanel usage={usage} loading={usageLoading} error={usageError} onRefresh={() => void loadUsage()} />
              </div>
            )}
          </div>
        </div>
      </main>

      <BottomNavBar />
    </div>
  );
}
