'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X, Coins, ChevronDown, Plus, Package, Sparkles, Send, SlidersHorizontal } from 'lucide-react';
import { iconMapper } from '../lib/iconMapper';
import { profileApi } from '../lib/api';
import { NetworkError } from '../lib/api/ApiClient';
import { enqueue } from '../lib/offline/outbox';
import { TransactionTypeToggle } from './TransactionTypeToggle';
import { useDekSession } from '../hooks/useDekSession';
import { useDisplaySettings } from '../hooks/useDisplaySettings';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { decryptKey } from '../lib/crypto/ai-key';
import { chat, type JsonSchemaResponseFormat } from '../lib/ai/openrouter';
import type { TagDto, VaultDto, ParsedTransaction } from '@expense-tracker/shared';

// What the model returns: tags and vault by name, never by id.
interface ModelTransaction {
  title: string;
  amount: number;
  type: 'expense' | 'income';
  tags: string[];
  vault: string | null;
}

type TransactionPromptOutcome =
  | { status: 'success'; transaction: ParsedTransaction }
  | { status: 'needs-ai-setup'; message: string }
  | { status: 'dek-loading'; message: string }
  | { status: 'dek-unavailable'; message: string }
  | { status: 'unparseable'; message: string };

interface LogResourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  userId: string | null;
  selectedMonth?: number;
  selectedYear?: number;
}

export function LogResourceModal({ isOpen, onClose, onSuccess, userId, selectedMonth, selectedYear }: LogResourceModalProps) {
  const { dek, loading: dekLoading } = useDekSession();
  const { aiTransactionEntryEnabled, loaded: preferencesLoaded } = useDisplaySettings();
  const isOnline = useOnlineStatus();

  // `null` means "follow the preference": AI entry on opens on the prompt, manual
  // entry on opens on the form. The user's toggle (or a successful parse) pins it.
  const [manualEntryOverride, setManualEntryOverride] = useState<boolean | null>(null);
  // The AI path needs OpenRouter, so offline there is nothing to switch to:
  // force the manual form rather than offering a prompt box that cannot work.
  const manualEntry = !isOnline || (aiTransactionEntryEnabled ? (manualEntryOverride ?? false) : true);
  const [promptText, setPromptText] = useState('');
  const [isPrompting, setIsPrompting] = useState(false);
  const [promptResult, setPromptResult] = useState<string | null>(null);
  const [promptNeedsAiSetup, setPromptNeedsAiSetup] = useState(false);

  const [isExpense, setIsExpense] = useState(true);
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tag state
  const [availableTags, setAvailableTags] = useState<TagDto[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<TagDto[]>([]);

  // Vault state
  const [vaults, setVaults] = useState<VaultDto[]>([]);
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const [isVaultDropdownOpen, setIsVaultDropdownOpen] = useState(false);

  const selectedVault = vaults.find((v) => v.id === selectedVaultId) ?? null;

  const suggestions = availableTags.filter((tag) => !selectedTags.some((t) => t.id === tag.id) && tag.name.toLowerCase().includes(tagInput.toLowerCase())).slice(0, 3);

  useEffect(() => {
    if (isOpen) {
      setManualEntryOverride(null);
      setPromptText('');
      setPromptResult(null);
      setPromptNeedsAiSetup(false);
    }
    if (isOpen) setSubmitError(null);
    if (isOpen && userId) {
      // Offline these resolve from the reference cache (see lib/offline/cache);
      // the catch only covers the first-ever open, where there is nothing cached.
      profileApi
        .getTags(userId)
        .then((res) => {
          if (res) setAvailableTags(res);
        })
        .catch(() => undefined);
      profileApi
        .getVaults(userId)
        .then((res) => {
          if (res) {
            setVaults(res);
            const def = res.find((v) => v.isDefault) ?? res[0] ?? null;
            if (def) setSelectedVaultId(def.id);
          }
        })
        .catch(() => undefined);
    }
  }, [isOpen, userId]);

  /**
   * Sends `promptText` to the user's chosen OpenRouter model, constrained to a
   * JSON schema built from `availableTags`/`vaults` so the model can only pick
   * existing tag/vault names, then maps the result back to ids. Throws on
   * network/decrypt/chat failures — caller surfaces those via `profileApi.parseError(err)`.
   */
  const parseTransactionPrompt = async (): Promise<TransactionPromptOutcome> => {
    const status = await profileApi.getAiCredentialStatus(userId!);
    if (!status.hasKey || !status.selectedModel || !status.keyCiphertext || !status.keyIv) {
      return { status: 'needs-ai-setup', message: 'Set up your OpenRouter API key and pick a model in Settings before parsing prompts.' };
    }

    if (dekLoading) {
      return { status: 'dek-loading', message: 'Still unlocking your encryption key — try again in a moment.' };
    }

    if (!dek) {
      return { status: 'dek-unavailable', message: 'Your encryption key is not unlocked in this session. Please log out and log back in to unlock it, then try again.' };
    }

    const apiKey = await decryptKey(status.keyCiphertext, status.keyIv, dek);

    const tagList = availableTags.map((tag) => `- ${tag.name}`).join('\n');
    const vaultList = vaults.map((vault) => vault.name).join(', ');
    const seedPrompt = `This is an expense tracker app. Translate the user's prompt into a transaction.
Only pick existing tag names from this list. Do not create new tags:
${tagList}
User's vaults: ${vaultList}
Only pick a vault when the user explicitly names one from the list. Do not invent a vault, and return null when no vault is mentioned.
"title" should be a short 3-4 word description of the transaction.

prompt: ${promptText.trim()}`;

    // Constrain tags/vault to existing names via an enum so the model cannot
    // invent any. An empty enum is an invalid schema, so fall back to a plain
    // string array (or nullable string) when empty.
    const tagNames = availableTags.map((tag) => tag.name);
    const vaultNames = vaults.map((vault) => vault.name);
    const tagsSchema: Record<string, unknown> = tagNames.length > 0 ? { type: 'array', items: { type: 'string', enum: tagNames } } : { type: 'array', items: { type: 'string' } };
    const vaultSchema: Record<string, unknown> = vaultNames.length > 0 ? { type: ['string', 'null'], enum: [...vaultNames, null] } : { type: ['string', 'null'] };

    const responseFormat: JsonSchemaResponseFormat = {
      type: 'json_schema',
      json_schema: {
        name: 'transaction',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            amount: { type: 'number' },
            type: { type: 'string', enum: ['expense', 'income'] },
            tags: tagsSchema,
            vault: vaultSchema,
          },
          required: ['title', 'amount', 'type', 'tags', 'vault'],
          additionalProperties: false,
        },
      },
    };

    const content = await chat({
      apiKey,
      model: status.selectedModel,
      messages: [{ role: 'user', content: seedPrompt }],
      responseFormat,
    });

    let candidate: ModelTransaction;
    try {
      candidate = JSON.parse(content) as ModelTransaction;
    } catch {
      return { status: 'unparseable', message: 'AI response could not be parsed. Please try again.' };
    }

    // Map tag/vault names back to ids, case-insensitively, dropping anything the model invented.
    const tagIdsByName = new Map(availableTags.map((tag) => [tag.name.toLowerCase(), tag.id]));
    const vaultIdsByName = new Map(vaults.map((vault) => [vault.name.toLowerCase(), vault.id]));

    const tagIds = Array.isArray(candidate.tags)
      ? candidate.tags
          .filter((name): name is string => typeof name === 'string')
          .map((name) => tagIdsByName.get(name.toLowerCase()))
          .filter((id): id is string => typeof id === 'string')
      : [];

    const vaultId = typeof candidate.vault === 'string' ? (vaultIdsByName.get(candidate.vault.toLowerCase()) ?? null) : null;

    return { status: 'success', transaction: { title: candidate.title, amount: candidate.amount, type: candidate.type, tagIds, vaultId } };
  };

  const handleSendPrompt = async () => {
    if (!promptText.trim() || isPrompting || !userId) return;
    setIsPrompting(true);
    setPromptResult(null);
    setPromptNeedsAiSetup(false);

    try {
      const outcome = await parseTransactionPrompt();

      if (outcome.status !== 'success') {
        setPromptResult(outcome.message);
        setPromptNeedsAiSetup(outcome.status === 'needs-ai-setup');
        return;
      }

      const res = outcome.transaction;
      setTitle(res.title);
      setAmount(String(res.amount));
      setIsExpense(res.type === 'expense');
      setSelectedTags(availableTags.filter((tag) => res.tagIds.includes(tag.id)));
      setSelectedVaultId(res.vaultId ?? null);
      setManualEntryOverride(true);
    } catch (err) {
      setPromptResult(profileApi.parseError(err));
      setManualEntryOverride(true);
    } finally {
      setIsPrompting(false);
    }
  };

  const toggleTag = (tag: TagDto) => {
    if (selectedTags.some((t) => t.id === tag.id)) {
      setSelectedTags(selectedTags.filter((t) => t.id !== tag.id));
    } else {
      setSelectedTags([...selectedTags, tag]);
      setTagInput('');
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim() && userId) {
      e.preventDefault();
      const tagName = tagInput.trim().toUpperCase();
      if (selectedTags.some((t) => t.name === tagName)) return;
      const existing = availableTags.find((t) => t.name === tagName);
      if (existing) {
        toggleTag(existing);
      } else if (isOnline) {
        // Creating a tag offline is out of scope: a tag needs a server id before
        // it can be attached to a transaction. Cached tags stay selectable.
        const res = await profileApi.createTag(userId, { name: tagName });
        if (res) {
          setAvailableTags([...availableTags, res]);
          setSelectedTags([...selectedTags, res]);
          setTagInput('');
        }
      }
    }
  };

  const handleSubmit = async () => {
    if (!userId || !amount || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    const now = new Date();
    const isCurrentMonth = selectedMonth === undefined || selectedYear === undefined || (selectedMonth === now.getMonth() && selectedYear === now.getFullYear());
    const date = isCurrentMonth ? undefined : `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
    const payload = {
      amount: parseFloat(amount),
      type: isExpense ? ('expense' as const) : ('income' as const),
      tagIds: selectedTags.map((t) => t.id),
      title: title || undefined,
      vaultId: selectedVaultId ?? null,
      date,
    };

    const finishSuccessfully = () => {
      setAmount('');
      setTitle('');
      setSelectedTags([]);
      setTagInput('');
      onSuccess?.();
      onClose();
    };

    try {
      if (!navigator.onLine) {
        // Don't even attempt the request when the browser knows it is offline.
        enqueue({ kind: 'create-transaction', userId, payload });
        finishSuccessfully();
        return;
      }

      await profileApi.createTransaction(userId, payload);
      finishSuccessfully();
    } catch (err) {
      // The request never reached the server — queue it and replay on reconnect.
      // A real server error (validation, 500) must surface instead: retrying it
      // forever would not help and hiding it would lose the transaction.
      if (err instanceof NetworkError) {
        enqueue({ kind: 'create-transaction', userId, payload });
        finishSuccessfully();
        return;
      }
      setSubmitError(profileApi.parseError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      const timer = setTimeout(() => setIsVisible(true), 20);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      setIsVaultDropdownOpen(false);
      const timer = setTimeout(() => setShouldRender(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  return (
    <>
      {/* Backdrop for Bottom Sheet */}
      <div className={`fixed inset-0 bg-black/70 z-50 transition-opacity duration-300 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />

      {/* Main Container (The Bottom Sheet) */}
      <div
        className={`fixed bottom-0 left-0 right-0 md:left-1/2 md:-translate-x-1/2 z-[60] w-full max-w-md md:max-w-2xl bg-surface-container-high border-4 border-black shadow-[inset_2px_2px_0px_rgba(255,255,255,0.1),_inset_-2px_-2px_0px_rgba(0,0,0,0.4)] flex flex-col mt-auto mx-auto max-h-[90vh] md:max-h-[95vh] overflow-y-auto rounded-t-lg md:rounded-none transition-transform duration-300 ease-in-out ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Top Bar Decor (The "Handle") */}
        <div className="flex justify-center py-2 shrink-0">
          <div className="w-12 h-2 bg-black opacity-40"></div>
        </div>

        {/* Header */}
        <header className="px-4 pt-2 pb-5 shrink-0">
          <div className="flex justify-between items-center">
            <h1 className="font-headline-md text-primary uppercase">LOG NEW RESOURCE</h1>
            <button onClick={onClose} className="w-10 h-10 bg-surface-container-highest border-4 border-black flex items-center justify-center active:translate-y-0.5 active:shadow-none">
              <X className="text-on-surface" />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="px-4 space-y-5 pb-3 overflow-y-auto">
          {preferencesLoaded && !manualEntry && (
            <div className="space-y-3">
              <textarea
                className="w-full h-32 p-4 bg-surface-container-lowest border-4 border-black shadow-[inset_4px_4px_0px_rgba(0,0,0,0.6),_inset_-2px_-2px_0px_rgba(255,255,255,0.05)] font-body-lg text-on-surface focus:outline-none placeholder:text-surface-variant resize-none"
                placeholder="Describe your transaction... e.g. Spent 24 on groceries at the market"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
              <button
                onClick={handleSendPrompt}
                disabled={!promptText.trim() || isPrompting}
                className="w-full h-16 bg-primary-container text-on-primary-container border-4 border-black shadow-[inset_2px_2px_0px_rgba(255,255,255,0.1),_inset_-2px_-2px_0px_rgba(0,0,0,0.4)] active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-4 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={20} />
                <span className="font-headline-md font-black uppercase tracking-wider">{isPrompting ? 'SENDING...' : 'SEND'}</span>
              </button>
              {promptResult && (
                <div className="p-4 bg-surface-container-lowest border-4 border-black shadow-[inset_4px_4px_0px_rgba(0,0,0,0.6)] space-y-2">
                  <p className="font-body-lg text-on-surface whitespace-pre-wrap">{promptResult}</p>
                  {promptNeedsAiSetup && (
                    <Link href="/settings/ai" onClick={onClose} className="inline-block font-label-caps text-primary underline underline-offset-2">
                      GO TO SETTINGS
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Only offered when AI entry is enabled — otherwise there is nothing to switch back to. Offline the AI path cannot run at all. */}
          {preferencesLoaded && aiTransactionEntryEnabled && isOnline && (
            <button
              onClick={() => setManualEntryOverride(!manualEntry)}
              className="w-full h-12 border-4 border-black bg-surface-container-low text-on-surface font-label-caps flex items-center justify-between px-4 active:translate-y-0.5 hover:bg-surface-container-highest transition-colors"
            >
              <span className="flex items-center gap-2">
                {manualEntry ? <Sparkles size={16} /> : <SlidersHorizontal size={16} />}
                MANUAL ENTRY
              </span>
              <span className={`w-12 h-6 border-4 border-black flex items-center transition-colors ${manualEntry ? 'bg-primary justify-end' : 'bg-surface-container-highest justify-start'}`}>
                <span className="w-4 h-4 bg-black" />
              </span>
            </button>
          )}

          {preferencesLoaded && manualEntry && (
            <>
              {/* Name Input */}
              <div className="space-y-2">
                <input
                  className="w-full h-16 px-4 bg-surface-container-lowest border-4 border-black shadow-[inset_4px_4px_0px_rgba(0,0,0,0.6),_inset_-2px_-2px_0px_rgba(255,255,255,0.05)] font-body-lg text-on-surface focus:outline-none placeholder:text-surface-variant"
                  placeholder="e.g. Grocery run"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Amount Input */}
              <div className="space-y-2">
                <div className="relative flex items-center">
                  <div className="absolute left-4 flex items-center pointer-events-none">
                    <Coins className="text-secondary" />
                  </div>
                  <input
                    className="w-full h-16 pl-14 pr-4 bg-surface-container-lowest border-4 border-black shadow-[inset_4px_4px_0px_rgba(0,0,0,0.6),_inset_-2px_-2px_0px_rgba(255,255,255,0.05)] font-headline-md text-secondary placeholder:text-surface-variant focus:outline-none focus:ring-0"
                    placeholder="0.00"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
              </div>

              {/* Transaction Type Toggle */}
              <div className="space-y-2">
                <TransactionTypeToggle isExpense={isExpense} onChange={setIsExpense} />
              </div>

              {/* Source Vault Selection */}
              {vaults.length > 0 && (
                <div className="space-y-2">
                  <div className="relative">
                    <button
                      onClick={() => setIsVaultDropdownOpen(!isVaultDropdownOpen)}
                      className={`w-full h-14 px-4 border-4 border-black flex items-center justify-between font-body-lg transition-all active:translate-y-0.5 active:shadow-none group bg-surface-container-lowest hover:bg-surface-container-low ${
                        isVaultDropdownOpen ? 'ring-4 ring-primary/20' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {selectedVault &&
                          (() => {
                            const VaultIcon = iconMapper(selectedVault.icon || 'Briefcase');
                            return <VaultIcon className="text-primary" size={20} />;
                          })()}
                        <span className="text-primary font-bold">{selectedVault?.name ?? 'Select vault'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-6 bg-black/10 rounded-full" />
                        <ChevronDown className={`text-outline transition-transform duration-300 ${isVaultDropdownOpen ? 'rotate-180' : ''}`} size={20} />
                      </div>
                    </button>

                    {isVaultDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-[65]" onClick={() => setIsVaultDropdownOpen(false)} />
                        <div className="absolute top-[calc(100%+4px)] left-0 right-0 z-[70] bg-surface-container-high border-4 border-black shadow-[8px_8px_0px_rgba(0,0,0,1)]">
                          <div className="max-h-60 overflow-y-auto custom-scrollbar">
                            {vaults.map((vault) => {
                              const VaultIcon = iconMapper(vault.icon || 'Briefcase');
                              return (
                                <button
                                  key={vault.id}
                                  onClick={() => {
                                    setSelectedVaultId(vault.id);
                                    setIsVaultDropdownOpen(false);
                                  }}
                                  className={`w-full h-14 px-4 flex items-center justify-between font-body-lg transition-colors hover:bg-surface-container-highest group ${
                                    selectedVaultId === vault.id ? 'bg-surface-container-highest' : 'bg-surface-container-low'
                                  }`}
                                >
                                  <div className="flex items-center gap-3">
                                    <VaultIcon className={selectedVaultId === vault.id ? 'text-primary' : 'text-outline'} size={20} />
                                    <span className={`font-body-lg uppercase ${selectedVaultId === vault.id ? 'text-primary font-bold' : 'text-on-surface'}`}>{vault.name}</span>
                                  </div>
                                  {selectedVaultId === vault.id && <div className="w-4 h-4 bg-primary border-2 border-black" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Tags Autocomplete Section */}
              <div className="space-y-2">
                <div className="relative">
                  {selectedTags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {selectedTags.map((tag) => {
                        const TagIcon = iconMapper(tag.icon || 'Hash');
                        return (
                          <span
                            key={tag.id}
                            onClick={() => toggleTag(tag)}
                            style={{ backgroundColor: tag.backgroundColor ?? '#64748B' }}
                            className="text-sm text-white font-bold border-4 border-black px-2 py-1 font-label-caps flex items-center gap-2 active:translate-y-0.5 cursor-pointer shadow-[2px_2px_0px_rgba(0,0,0,1)]"
                          >
                            <TagIcon size={12} strokeWidth={3} />
                            {tag.name} <X size={12} strokeWidth={3} />
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <input
                    className="w-full h-12 px-4 bg-surface-container-lowest border-4 border-black shadow-[inset_4px_4px_0px_rgba(0,0,0,0.6),_inset_-2px_-2px_0px_rgba(255,255,255,0.05)] font-body-lg text-on-surface focus:outline-none placeholder:text-surface-variant"
                    placeholder="Search or create tag..."
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />

                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {suggestions.map((tag) => {
                        const SuggestionIcon = iconMapper(tag.icon || 'Hash');
                        const color = tag.backgroundColor ?? '#64748B';
                        return (
                          <span
                            key={tag.id}
                            onClick={() => toggleTag(tag)}
                            style={{ backgroundColor: `${color}20`, borderColor: color }}
                            className="bg-surface-container-highest text-sm border-4 px-2 py-1 font-label-caps font-bold flex items-center gap-2 active:translate-y-0.5 cursor-pointer hover:bg-surface-container-high transition-colors"
                          >
                            <SuggestionIcon size={12} style={{ color }} strokeWidth={3} />
                            <span style={{ color }}>{tag.name}</span>
                            <Plus size={12} style={{ color }} strokeWidth={3} />
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {isOnline && tagInput && !suggestions.some((t) => t.name === tagInput.toUpperCase()) && !selectedTags.some((t) => t.name === tagInput.toUpperCase()) && (
                    <div className="mt-3">
                      <span
                        onClick={() => handleKeyDown({ key: 'Enter', preventDefault: () => {} } as React.KeyboardEvent)}
                        className="bg-surface-container-highest border-4 border-black px-3 py-1 font-label-caps text-primary flex items-center w-fit gap-1 active:translate-y-0.5 cursor-pointer"
                      >
                        CREATE: {tagInput.toUpperCase()} <Plus size={14} />
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {!isOnline && (
                <p className="font-label-caps text-[11px] uppercase text-secondary border-4 border-black bg-surface-container-lowest px-3 py-2">OFFLINE — THIS DROP WILL BE SAVED AND SYNCED LATER</p>
              )}

              {submitError && <p className="font-body-sm text-error border-4 border-error bg-surface-container-lowest px-3 py-2">{submitError}</p>}

              {/* Action Button */}
              <div className="pt-5">
                <button
                  onClick={handleSubmit}
                  disabled={!amount || isSubmitting}
                  className="w-full h-20 bg-primary-container text-on-primary-container border-4 border-black shadow-[inset_2px_2px_0px_rgba(255,255,255,0.1),_inset_-2px_-2px_0px_rgba(0,0,0,0.4)] active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-4 transition-transform group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="font-headline-md font-black uppercase tracking-wider">{isSubmitting ? 'RECORDING...' : 'RECORD'}</span>
                  <Package size={32} />
                </button>
              </div>
            </>
          )}

          {/* Visual Context Footer Decor */}
          <div className="flex justify-between items-center pt-1 opacity-50">
            <div className="flex gap-1">
              <div className="w-4 h-4 bg-error border-4 border-black"></div>
              <div className="w-4 h-4 bg-primary border-4 border-black"></div>
              <div className="w-4 h-4 bg-secondary border-4 border-black"></div>
            </div>
            <p className="font-label-caps text-[10px] text-outline">VER 1.0.42_STABLE</p>
          </div>
        </main>
      </div>
    </>
  );
}
