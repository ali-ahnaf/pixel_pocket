'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Mail, Sparkles, Trash2, XCircle } from 'lucide-react';
import type { PendingGmailExpenseDto, PendingExpenseEmailDto, TagDto } from '@expense-tracker/shared';
import { Button } from '@/components/Button';
import { profileApi } from '@/lib/api';
import { useDekSession } from '@/hooks/useDekSession';
import { decryptKey } from '@/lib/crypto/ai-key';
import { extractTransactionFromEmail } from '@/lib/ai/gmail-extractor';

interface PendingExpenseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  item: PendingGmailExpenseDto | null;
  tags: TagDto[];
  onResolved: (id: string, transactionCreated: boolean) => void;
}

/**
 * Bottom sheet for one pending Gmail expense: re-fetches the live email body
 * on open, then lets the user run the client-side AI extractor (the user's
 * own OpenRouter key, never the server) to turn it into a transaction, or
 * dismiss it outright. See documentation/openrouter-ai-migration.md (T12).
 */
export function PendingExpenseDetailModal({ isOpen, onClose, userId, item, tags, onResolved }: PendingExpenseDetailModalProps): JSX.Element | null {
  const { dek, loading: dekLoading } = useDekSession();
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [email, setEmail] = useState<PendingExpenseEmailDto | null>(null);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [needsAiSetup, setNeedsAiSetup] = useState(false);
  const [unmatched, setUnmatched] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    if (isOpen && item) {
      setEmail(null);
      setEmailError(null);
      setParseError(null);
      setNeedsAiSetup(false);
      setUnmatched(false);
      setShouldRender(true);
      const t = setTimeout(() => setIsVisible(true), 20);

      setLoadingEmail(true);
      profileApi
        .getPendingExpenseEmail(userId, item.id)
        .then(setEmail)
        .catch((err) => setEmailError(profileApi.parseError(err)))
        .finally(() => setLoadingEmail(false));

      return () => clearTimeout(t);
    }
    setIsVisible(false);
    const t = setTimeout(() => setShouldRender(false), 300);
    return () => clearTimeout(t);
  }, [isOpen, item, userId]);

  if (!shouldRender || !item) return null;

  const handleParse = async (): Promise<void> => {
    if (!email || parsing) return;
    setParsing(true);
    setParseError(null);
    setNeedsAiSetup(false);
    setUnmatched(false);
    try {
      if (dekLoading) {
        throw new Error('Still unlocking your encryption key — try again in a moment.');
      }
      if (!dek) {
        throw new Error('Your encryption key is not unlocked in this session. Please log out and log back in to unlock it, then try again.');
      }

      const status = await profileApi.getAiCredentialStatus(userId);
      if (!status.hasKey || !status.keyCiphertext || !status.keyIv) {
        setNeedsAiSetup(true);
        throw new Error('Set up your OpenRouter API key in Settings before parsing this email.');
      }
      if (!status.selectedModel) {
        setNeedsAiSetup(true);
        throw new Error('Pick an OpenRouter model in Settings before parsing this email.');
      }

      const apiKey = await decryptKey(status.keyCiphertext, status.keyIv, dek);
      const parsed = await extractTransactionFromEmail({
        apiKey,
        model: status.selectedModel,
        email: { from: email.from, subject: email.subject, bodyText: email.bodyText, emailDate: email.emailDate },
        tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
        guidanceHint: item.guidanceHint,
      });

      if (!parsed) {
        setUnmatched(true);
        return;
      }

      await profileApi.createTransaction(userId, {
        amount: parsed.amount,
        type: parsed.type,
        tagIds: parsed.tagIds,
        title: parsed.title,
        vaultId: item.vaultId,
        date: parsed.date,
      });
      await profileApi.deletePendingExpense(userId, item.id);
      onResolved(item.id, true);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : profileApi.parseError(err));
    } finally {
      setParsing(false);
    }
  };

  const handleDismiss = async (): Promise<void> => {
    if (dismissing) return;
    setDismissing(true);
    setParseError(null);
    try {
      await profileApi.deletePendingExpense(userId, item.id);
      onResolved(item.id, false);
    } catch (err) {
      setParseError(profileApi.parseError(err));
    } finally {
      setDismissing(false);
    }
  };

  return (
    <>
      <div className={`fixed inset-0 bg-black/70 z-[100] transition-opacity duration-300 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />

      <div
        className={`fixed bottom-0 left-0 right-0 md:left-1/2 md:-translate-x-1/2 z-[110] w-full max-w-md bg-surface-container-high border-4 border-black shadow-[inset_2px_2px_0px_rgba(255,255,255,0.1),_inset_-2px_-2px_0px_rgba(0,0,0,0.4)] flex flex-col mt-auto mx-auto max-h-[90vh] overflow-y-auto rounded-t-xl transition-transform duration-300 ease-in-out custom-scrollbar ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="flex justify-center py-2 shrink-0">
          <div className="w-12 h-1.5 bg-black/20 rounded-full" />
        </div>

        <header className="px-6 pt-2 pb-4 shrink-0 border-b-4 border-black/5">
          <div className="flex justify-between items-center">
            <h2 className="font-headline-md text-primary uppercase flex items-center gap-2">
              <Mail className="w-6 h-6" />
              Review Expense
            </h2>
            <button
              onClick={onClose}
              className="w-10 h-10 bg-surface-container-highest border-4 border-black flex items-center justify-center active:translate-y-0.5 hover:bg-error-container hover:text-on-error-container transition-colors"
              aria-label="Close"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
          <span className="mt-2 inline-block font-label-caps text-[10px] uppercase px-2 py-1 border-2 border-black bg-surface-container-highest text-on-surface">{item.vaultName}</span>
          {item.guidanceHint && <p className="mt-2 border-4 border-black bg-surface-container-high px-3 py-2 font-mono text-[11px] text-on-surface-variant">Guidance: {item.guidanceHint}</p>}
        </header>

        <main className="px-6 py-6 pt-4 space-y-5 overflow-y-auto">
          {loadingEmail && <p className="font-label-caps text-[11px] text-on-surface-variant uppercase">Fetching the email…</p>}

          {emailError && <p className="font-mono text-label-caps text-error uppercase border-4 border-black bg-surface-container p-3">{emailError}</p>}

          {email && !loadingEmail && (
            <div className="border-4 border-black bg-surface-container-lowest p-3 space-y-2">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
                <span className="text-on-surface-variant">From</span>
                <span className="text-on-surface truncate">{email.from}</span>
                <span className="text-on-surface-variant">Subject</span>
                <span className="text-on-surface truncate">{email.subject}</span>
              </div>
              <p className="font-mono text-[12px] leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar border-t-2 border-dashed border-outline/40 pt-2">{email.bodyText}</p>
            </div>
          )}

          {parseError && (
            <div className="border-4 border-black bg-surface-container p-3 space-y-2">
              <p className="font-mono text-label-caps text-error uppercase">{parseError}</p>
              {needsAiSetup && (
                <Link href="/settings/ai" onClick={onClose} className="inline-block font-label-caps text-primary underline underline-offset-2">
                  GO TO SETTINGS
                </Link>
              )}
            </div>
          )}

          {unmatched && (
            <div className="border-4 border-black bg-surface-container p-4 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-on-surface-variant" />
              <span className="font-mono text-label-caps text-on-surface-variant uppercase">Not a transaction — dismiss this item</span>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row pt-2">
            <Button variant="primary" className="w-full py-3 flex items-center justify-center gap-2" onClick={handleParse} disabled={!email || parsing || dismissing}>
              <Sparkles className="w-5 h-5" />
              <span className="font-headline-sm uppercase tracking-wider">{parsing ? 'Parsing…' : 'Parse With AI'}</span>
            </Button>
            <Button variant="danger" className="w-full py-3 flex items-center justify-center gap-2" onClick={handleDismiss} disabled={dismissing || parsing}>
              <Trash2 className="w-5 h-5" />
              <span className="font-headline-sm uppercase tracking-wider">{dismissing ? 'Dismissing…' : 'Dismiss'}</span>
            </Button>
          </div>
        </main>
      </div>
    </>
  );
}
