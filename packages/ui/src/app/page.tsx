'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useDisplaySettings } from '@/hooks/useDisplaySettings';
import { useOnboarding } from '@/hooks/useOnboarding';
import {
  Button,
  Card,
  ProgressBar,
  LogResourceModal,
  AppBar,
  BottomNavBar,
  DesktopSidebar,
  EditTransactionModal,
  AdjustBalanceModal,
  GmailReconnectBanner,
  PendingExpensesPanel,
  OnboardingWalkthrough,
} from '@/components';
import { iconMapper } from '@/lib/iconMapper';
import { profileApi } from '@/lib/api';
import { formatCurrency, formatDate, formatTime } from '@/lib/helpers/formatters';
import type { User, VaultDto, TagDto, TransactionDto, OccurrenceDto } from '@expense-tracker/shared';
import { Package, ChevronLeft, ChevronRight, ChevronDown, Plus, X, Check, Repeat, Eye, EyeOff, ArrowUpDown, Search } from 'lucide-react';

const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

function getTransactionIconName(tx: TransactionDto): string {
  if (tx.type === 'expense') {
    return tx.tags?.[0]?.icon || tx.vault?.icon || 'ShoppingCart';
  }
  return tx.vault?.icon || 'CircleDollarSign';
}

function getTransactionCategory(tx: TransactionDto): string {
  return tx.tags?.[0]?.name || (tx.type === 'income' ? 'Income' : 'Expense');
}

function getTransactionTitle(tx: TransactionDto): string {
  return tx.title || (tx.type === 'income' ? 'Unnamed Income' : 'Unnamed Expense');
}

function getOccurrenceIconName(o: OccurrenceDto): string {
  if (o.type === 'expense') return o.tags?.[0]?.icon || o.vault?.icon || 'ShoppingCart';
  return o.vault?.icon || 'CircleDollarSign';
}

function getOccurrenceCategory(o: OccurrenceDto): string {
  return o.tags?.[0]?.name || (o.type === 'income' ? 'Income' : 'Expense');
}

function getOccurrenceTitle(o: OccurrenceDto): string {
  return o.title || (o.type === 'income' ? 'Unnamed Income' : 'Unnamed Expense');
}

function TagChips({ tags, muted = false }: { tags: TagDto[]; muted?: boolean }) {
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {tags.map((tag) => (
        <span key={tag.id} className={`font-label-caps text-[9px] uppercase px-1 py-0.5 border border-dashed border-outline text-on-surface leading-none inline-block ${muted ? 'opacity-70' : ''}`}>
          {tag.name}
        </span>
      ))}
    </div>
  );
}

function MaskedValue({ show, colorClass, children }: { show: boolean; colorClass: string; children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  if (show) return <span className={`font-label-caps ${colorClass}`}>{children}</span>;
  return (
    <span className="flex items-center gap-1.5">
      <span className={`font-label-caps ${colorClass}`}>{revealed ? children : '*****'}</span>
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        aria-label={revealed ? 'Hide value' : 'Reveal value'}
        className="text-outline hover:text-on-surface active:translate-y-px transition-transform"
      >
        {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </span>
  );
}

interface TransactionCardProps {
  occ: OccurrenceDto;
  isApplying: boolean;
  onApply: (occ: OccurrenceDto) => void;
  onSkip: (occ: OccurrenceDto) => void;
}

function TransactionCard({ occ, isApplying, onApply, onSkip }: TransactionCardProps) {
  const OccIcon = iconMapper(getOccurrenceIconName(occ));
  const tagBg = occ.tags?.[0]?.backgroundColor;
  return (
    <div className="flex items-center gap-4 bg-surface/40 p-3 border-4 border-dashed border-outline/60 hover:bg-surface-container-highest/50 transition-colors">
      <div
        className={`h-10 w-10 border-2 border-dashed border-outline/70 flex items-center justify-center shrink-0 opacity-70 ${!tagBg ? (occ.type === 'income' ? 'bg-primary-container/40' : 'bg-error-container/40') : ''}`}
        style={tagBg ? { backgroundColor: tagBg, opacity: 0.5 } : undefined}
      >
        <OccIcon />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-body-sm font-bold text-on-surface/70 truncate">{getOccurrenceTitle(occ)}</p>
        </div>
        {occ.tags?.length ? <TagChips tags={occ.tags} muted /> : <p className="text-[14px] text-on-surface-variant/70 truncate">{getOccurrenceCategory(occ)}</p>}
        {occ.vault?.name && (
          <span className="font-label-caps text-[9px] uppercase px-1 py-0.5 border border-dashed border-outline bg-surface-container/50 text-outline leading-none inline-block mt-0.5">
            {occ.vault.name}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <p className={`font-label-caps opacity-70 ${occ.type === 'income' ? 'text-primary' : 'text-error'}`}>
          {occ.type === 'income' ? '+' : '-'}
          {formatCurrency(occ.amount)}
        </p>
        <p className="font-body-sm text-outline text-[10px]">{formatDate(occ.date)}</p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onApply(occ)}
            disabled={isApplying}
            className="font-label-caps text-[10px] uppercase bg-primary text-on-primary border-2 border-black px-2 py-1 hover:bg-primary/90 active:translate-y-px transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isApplying ? 'Applying…' : 'Apply'}
          </button>
          <button
            onClick={() => onSkip(occ)}
            disabled={isApplying}
            aria-label="Discard ghost entry"
            title="Discard"
            className="flex items-center justify-center bg-surface text-on-surface border-2 border-black h-[26px] w-[26px] hover:bg-error hover:text-on-error active:translate-y-px transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { showIncome, showExpense } = useDisplaySettings();
  const userId = user?.id ?? null;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdjustBalanceOpen, setIsAdjustBalanceOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<TransactionDto | null>(null);

  const handleNetYieldClick = () => {
    if (selectedVaultFilter.length !== 1) {
      setToastMessage('Please select a single vault to adjust balance.');
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }
    setIsAdjustBalanceOpen(true);
  };
  const [profile, setProfile] = useState<User | null>(null);
  const { isActive: isWalkthroughOpen, complete: completeWalkthrough } = useOnboarding(userId, profile?.hasOnboarded);
  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [occurrences, setOccurrences] = useState<OccurrenceDto[]>([]);
  const [applyingOccurrence, setApplyingOccurrence] = useState<string | null>(null);
  const [pendingTx, setPendingTx] = useState<string | null>(null);
  const [vaults, setVaults] = useState<VaultDto[]>([]);
  const [selectedVaultFilter, setSelectedVaultFilter] = useState<string[]>([]);
  const [vaultDropdownOpen, setVaultDropdownOpen] = useState(false);
  const vaultDropdownRef = useRef<HTMLDivElement>(null);
  const didInitVaultFilter = useRef(false);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [selectedTagFilter, setSelectedTagFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const tagDropdownRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refetchKey, setRefetchKey] = useState(0);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [sortField, setSortField] = useState<'date' | 'amount'>('date');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  useEffect(() => {
    if (!userId) return;
    setIsLoading(true);
    Promise.all([
      profileApi.getUser(userId),
      profileApi.getTransactions(userId, selectedMonth + 1, selectedYear),
      profileApi.getVaults(userId),
      profileApi.getRecurringOccurrences(userId, selectedMonth + 1, selectedYear),
      profileApi.getTags(userId),
    ])
      .then(([user, txs, vaultList, occs, tagList]) => {
        setProfile(user);
        setTransactions(txs);
        setVaults(vaultList);
        if (!didInitVaultFilter.current) {
          didInitVaultFilter.current = true;
          const primaryVault = vaultList.find((v) => v.isDefault);
          if (primaryVault) setSelectedVaultFilter([primaryVault.id]);
        }
        setOccurrences(occs);
        setTags(tagList);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [userId, selectedMonth, selectedYear, refetchKey]);

  const handleTransactionSuccess = useCallback(() => setRefetchKey((k) => k + 1), []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (vaultDropdownRef.current && !vaultDropdownRef.current.contains(e.target as Node)) {
        setVaultDropdownOpen(false);
      }
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(e.target as Node)) {
        setTagDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else setSelectedMonth((m) => m - 1);
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else setSelectedMonth((m) => m + 1);
  };

  const matchesVault = (vaultId: string | null) => selectedVaultFilter.length === 0 || selectedVaultFilter.includes(vaultId ?? '');
  const matchesTag = (txTags: { id: string }[]) => selectedTagFilter.length === 0 || txTags.some((t) => selectedTagFilter.includes(t.id));
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchesSearch = (item: { title: string | null; vault: { name: string } | null; tags: { name: string }[] }) => {
    if (!normalizedSearch) return true;
    const haystack = [item.title ?? '', item.vault?.name ?? '', ...item.tags.map((t) => t.name)];
    return haystack.some((value) => value.toLowerCase().includes(normalizedSearch));
  };
  const filteredDrops = transactions
    .filter((t) => matchesVault(t.vaultId) && matchesTag(t.tags) && matchesSearch(t))
    .slice()
    .sort((a, b) => {
      const byDate = sortOrder === 'desc' ? b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt) : a.date.localeCompare(b.date) || a.updatedAt.localeCompare(b.updatedAt);
      if (sortField === 'amount') {
        const byAmount = sortOrder === 'desc' ? b.amount - a.amount : a.amount - b.amount;
        return byAmount || byDate;
      }
      return byDate;
    });
  const filteredOccurrences = occurrences.filter((o) => matchesVault(o.vaultId) && matchesTag(o.tags) && matchesSearch(o));

  const handleApplyOccurrence = async (occ: OccurrenceDto) => {
    if (!userId) return;
    const key = `${occ.recurringId}:${occ.date}`;
    setApplyingOccurrence(key);
    try {
      await profileApi.applyRecurringOccurrence(userId, occ.recurringId, occ.date);
      setRefetchKey((k) => k + 1);
    } catch (err) {
      console.error(err);
    } finally {
      setApplyingOccurrence(null);
    }
  };

  const handleSkipOccurrence = async (occ: OccurrenceDto) => {
    if (!userId) return;
    const key = `${occ.recurringId}:${occ.date}`;
    setOccurrences((prev) => prev.filter((o) => `${o.recurringId}:${o.date}` !== key));
    try {
      await profileApi.skipRecurringOccurrence(userId, occ.recurringId, occ.date);
    } catch (err) {
      console.error(err);
      setRefetchKey((k) => k + 1);
    }
  };
  const handleCommitTransaction = async (tx: TransactionDto) => {
    if (!userId) return;
    setPendingTx(tx.id);
    try {
      await profileApi.commitTransaction(userId, tx.id);
      setTransactions((prev) => prev.map((t) => (t.id === tx.id ? { ...t, isCommitted: true } : t)));
    } catch (err) {
      console.error(err);
    } finally {
      setPendingTx(null);
    }
  };

  const handleDiscardTransaction = async (tx: TransactionDto) => {
    if (!userId) return;
    setPendingTx(tx.id);
    setTransactions((prev) => prev.filter((t) => t.id !== tx.id));
    try {
      await profileApi.discardTransaction(userId, tx.id);
    } catch (err) {
      console.error(err);
      setRefetchKey((k) => k + 1);
    } finally {
      setPendingTx(null);
    }
  };

  const totalIncome = filteredDrops.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = filteredDrops.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const netYield = totalIncome - totalExpenses;
  const budgetProgress = totalIncome > 0 ? Math.min((totalExpenses / totalIncome) * 100, 100) : 0;
  const selectedVaults = selectedVaultFilter.length === 0 ? vaults : vaults.filter((v) => selectedVaultFilter.includes(v.id));
  const selectedVaultsTotalBudget = selectedVaults.reduce((sum, v) => sum + (v.monthlyBudget || 0), 0);
  const selectedVaultsSpent = transactions
    .filter((t) => (selectedVaultFilter.length === 0 || selectedVaultFilter.includes(t.vaultId ?? '')) && t.type === 'expense')
    .reduce((sum, t) => sum + (t.amount || 0), 0);
  const selectedVaultsUsagePercent = selectedVaultsTotalBudget > 0 ? Math.min((selectedVaultsSpent / selectedVaultsTotalBudget) * 100, 100) : 0;

  return (
    <div className="bg-background text-on-background font-body-lg min-h-screen flex flex-col md:flex-row overflow-x-hidden selection:bg-primary selection:text-on-primary">
      <AppBar />

      {/* NavigationDrawer (Web) */}
      <DesktopSidebar name={profile?.name} email={profile?.email} avatar={profile?.avatar} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col w-full md:h-screen relative px-3 md:px-0 pb-24 md:pb-0 overflow-y-auto lg:overflow-hidden overflow-x-hidden">
        <div className="w-full p-margin-mobile md:p-8 md:pb-0 md:pt-0 md:pl-1 md:pr-1 flex flex-col gap-stack-md lg:h-full lg:min-h-0">
          {/* Month Selector */}
          <section
            data-tour="month-selector"
            className="flex justify-between items-center bg-surface-container border-4 border-black p-4 shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5)]"
          >
            <Button onClick={handlePrevMonth} variant="ghost" className="p-2 w-10 h-10 text-primary bg-surface hover:bg-surface-container-highest">
              <ChevronLeft />
            </Button>
            <div className="text-center flex flex-col items-center justify-center min-h-[60px]">
              <h2 className="font-headline-md text-primary tracking-tight">
                {MONTH_NAMES[selectedMonth]} {selectedYear}
              </h2>
              {(selectedMonth !== now.getMonth() || selectedYear !== now.getFullYear()) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedMonth(now.getMonth());
                    setSelectedYear(now.getFullYear());
                  }}
                  className="mt-1 font-label-caps text-[10px] border-2 border-primary text-primary hover:bg-primary/10 h-6 px-2 bg-surface leading-none"
                >
                  Current Month
                </Button>
              )}
            </div>
            <Button onClick={handleNextMonth} variant="ghost" className="p-2 w-10 h-10 text-primary bg-surface hover:bg-surface-container-highest">
              <ChevronRight />
            </Button>
          </section>

          <GmailReconnectBanner userId={userId} />

          <PendingExpensesPanel userId={userId} />

          {/* Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-stack-md lg:flex-1 lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto]">
            {/* Summary Card */}
            <Card data-tour="status-card" className="lg:col-span-1 flex flex-col gap-4 !p-4">
              <h3 className="font-label-caps text-outline uppercase border-b-4 border-black pb-2">Status</h3>

              {isLoading ? (
                <div className="flex flex-col gap-2 animate-pulse">
                  <div className="h-5 bg-surface-container-highest rounded w-3/4" />
                  <div className="h-5 bg-surface-container-highest rounded w-3/4" />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="font-body-sm text-on-surface">Loot Gained</span>
                    <MaskedValue show={showIncome} colorClass="text-primary">
                      +{formatCurrency(totalIncome)}
                    </MaskedValue>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-body-sm text-on-surface">Gold Spent</span>
                    <MaskedValue show={showExpense} colorClass="text-error">
                      -{formatCurrency(totalExpenses)}
                    </MaskedValue>
                  </div>
                </div>
              )}

              <div className="mt-auto pt-4 border-t-4 border-black">
                <div className="flex justify-between items-end">
                  <span className="font-label-caps text-outline uppercase">Net Yield</span>
                  {isLoading ? (
                    <div className="h-7 bg-surface-container-highest rounded w-24 animate-pulse" />
                  ) : (
                    <button
                      type="button"
                      onClick={handleNetYieldClick}
                      className={`group cursor-pointer font-headline-md text-right focus:outline-none focus:ring-2 focus:ring-primary px-2 py-1 -mr-2 rounded transition-all hover:bg-surface-container-highest border border-transparent hover:border-primary/40 flex items-center gap-1.5 ${
                        netYield >= 0 ? 'text-primary' : 'text-error'
                      }`}
                      aria-label="Adjust balance"
                      title="Click to adjust balance"
                    >
                      <span className="group-hover:underline">
                        {netYield >= 0 ? '+' : '-'}
                        {formatCurrency(Math.abs(netYield))}
                      </span>
                    </button>
                  )}
                </div>
                <div className="mt-4">
                  <ProgressBar value={isLoading ? 0 : budgetProgress} max={100} variant="primary" />
                </div>

                {selectedVaultsTotalBudget > 0 && (
                  <div className="mt-4 pt-4 border-t border-black">
                    <div className="flex justify-between mb-1">
                      <span className="font-label-caps text-[10px] text-outline">Budget Usage ({formatCurrency(selectedVaultsTotalBudget)})</span>
                      <span className="font-label-caps text-[10px] text-on-surface">{selectedVaultsUsagePercent.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-surface-container-highest h-2 rounded-full overflow-hidden">
                      <div className="bg-primary h-full" style={{ width: `${selectedVaultsUsagePercent}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Transactions List */}
            <Card className="lg:col-span-2 flex flex-col gap-4 !p-4 bg-surface-container lg:min-h-0 lg:overflow-hidden">
              <div className="flex justify-between items-center border-b-4 border-black pb-2">
                <h3 className="font-label-caps text-outline uppercase">Recent Drops</h3>
                <div className="flex items-center gap-2">
                  <div ref={sortDropdownRef} className="relative">
                    <button
                      onClick={() => setSortDropdownOpen((o) => !o)}
                      aria-label="Choose sort field"
                      className="flex items-center justify-center gap-1 w-20 h-7 font-label-caps text-[10px] uppercase bg-surface border-2 border-black text-on-surface px-2 hover:bg-surface-container-highest active:translate-y-px transition-transform"
                    >
                      {sortField === 'date' ? 'Date' : 'Amount'}
                      <ChevronDown size={10} className={`transition-transform ${sortDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {sortDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-50 border-2 border-black bg-surface shadow-[4px_4px_0_0_rgba(0,0,0,1)] flex flex-col">
                        {(['date', 'amount'] as const).map((field) => (
                          <button
                            key={field}
                            onClick={() => {
                              setSortField(field);
                              setSortDropdownOpen(false);
                            }}
                            className={`font-label-caps text-[10px] uppercase text-left px-3 py-2 transition-colors border-b border-black last:border-b-0 ${sortField === field ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface-container-highest'}`}
                          >
                            {field === 'date' ? 'Date' : 'Amount'}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
                    aria-label={sortField === 'date' ? 'Sort by date' : 'Sort by amount'}
                    title={sortField === 'date' ? (sortOrder === 'desc' ? 'Newest first' : 'Oldest first') : sortOrder === 'desc' ? 'Largest first' : 'Smallest first'}
                    className="flex items-center justify-center gap-1 w-20 h-7 font-label-caps text-[10px] uppercase bg-surface border-2 border-black text-on-surface px-2 hover:bg-surface-container-highest active:translate-y-px transition-transform"
                  >
                    <ArrowUpDown size={10} className={`transition-transform ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-outline pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search transactions"
                  placeholder="Search drops..."
                  className="w-full font-label-caps text-[10px] uppercase bg-surface border-2 border-black text-on-surface pl-7 pr-7 py-1.5 placeholder:text-outline focus:outline-none focus:bg-surface-container-highest"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface transition-colors">
                    <X size={12} />
                  </button>
                )}
              </div>

              <div data-tour="drop-filters" className="grid grid-cols-2 gap-2">
                <div ref={vaultDropdownRef} className="relative">
                  <button
                    onClick={() => setVaultDropdownOpen((o) => !o)}
                    className="flex items-center justify-between gap-1.5 w-full font-label-caps text-[10px] uppercase bg-surface border-2 border-black text-on-surface px-2 py-1.5 hover:bg-surface-container-highest active:translate-y-px transition-transform"
                  >
                    <span className="truncate">
                      {selectedVaultFilter.length === 0
                        ? 'All Vaults'
                        : selectedVaultFilter.length === 1
                          ? (vaults.find((v) => v.id === selectedVaultFilter[0])?.name ?? 'All Vaults')
                          : `${selectedVaultFilter.length} Vaults`}
                    </span>
                    <ChevronDown size={10} className={`shrink-0 transition-transform ${vaultDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {vaultDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 border-2 border-black bg-surface shadow-[4px_4px_0_0_rgba(0,0,0,1)] flex flex-col max-h-64 overflow-y-auto">
                      <button
                        onClick={() => {
                          setSelectedVaultFilter([]);
                          setVaultDropdownOpen(false);
                        }}
                        className={`font-label-caps text-[10px] uppercase text-left px-3 py-2 transition-colors border-b border-black ${selectedVaultFilter.length === 0 ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface-container-highest'}`}
                      >
                        All Vaults
                      </button>
                      {vaults.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => {
                            setSelectedVaultFilter((prev) => (prev.includes(v.id) ? prev.filter((id) => id !== v.id) : [...prev, v.id]));
                          }}
                          className={`font-label-caps text-[10px] uppercase text-left px-3 py-2 transition-colors border-b border-black last:border-b-0 ${selectedVaultFilter.includes(v.id) ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface-container-highest'}`}
                        >
                          {v.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div ref={tagDropdownRef} className="relative">
                  <button
                    onClick={() => setTagDropdownOpen((o) => !o)}
                    className="flex items-center justify-between gap-1.5 w-full font-label-caps text-[10px] uppercase bg-surface border-2 border-black text-on-surface px-2 py-1.5 hover:bg-surface-container-highest active:translate-y-px transition-transform"
                  >
                    <span className="truncate">
                      {selectedTagFilter.length === 0
                        ? 'All Tags'
                        : selectedTagFilter.length === 1
                          ? (tags.find((t) => t.id === selectedTagFilter[0])?.name ?? 'All Tags')
                          : `${selectedTagFilter.length} Tags`}
                    </span>
                    <ChevronDown size={10} className={`shrink-0 transition-transform ${tagDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {tagDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 border-2 border-black bg-surface shadow-[4px_4px_0_0_rgba(0,0,0,1)] flex flex-col max-h-64 overflow-y-auto">
                      <button
                        onClick={() => {
                          setSelectedTagFilter([]);
                          setTagDropdownOpen(false);
                        }}
                        className={`font-label-caps text-[10px] uppercase text-left px-3 py-2 transition-colors border-b border-black ${selectedTagFilter.length === 0 ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface-container-highest'}`}
                      >
                        All Tags
                      </button>
                      {tags.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            setSelectedTagFilter((prev) => (prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]));
                          }}
                          className={`font-label-caps text-[10px] uppercase text-left px-3 py-2 transition-colors border-b border-black last:border-b-0 ${selectedTagFilter.includes(t.id) ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface-container-highest'}`}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div data-tour="drops-list" className="flex flex-col gap-4 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:pr-1">
                {isLoading ? (
                  <div className="flex flex-col gap-3 animate-pulse">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-4 bg-surface p-3 border-4 border-black">
                        <div className="h-10 w-10 bg-surface-container-highest border-2 border-black shrink-0" />
                        <div className="flex-1 flex flex-col gap-2">
                          <div className="h-4 bg-surface-container-highest rounded w-2/3" />
                          <div className="h-3 bg-surface-container-highest rounded w-1/3" />
                        </div>
                        <div className="h-4 bg-surface-container-highest rounded w-16 shrink-0" />
                      </div>
                    ))}
                  </div>
                ) : filteredDrops.length === 0 && filteredOccurrences.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <Package className="text-outline opacity-40" size={48} />
                    <p className="font-label-caps text-outline uppercase">{normalizedSearch ? 'No matching drops' : 'No drops this month'}</p>
                    <p className="font-body-sm text-on-surface-variant">{normalizedSearch ? 'Try a different search term' : 'Log a transaction to get started'}</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {filteredDrops.map((tx) => {
                      const TxIcon = iconMapper(getTransactionIconName(tx));
                      const tagBg = tx.tags?.[0]?.backgroundColor;
                      return (
                        <div
                          key={tx.id}
                          className={`flex items-center gap-4 p-3 border-4 transition-colors cursor-pointer shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5)] ${
                            tx.isCommitted ? 'bg-surface border-black hover:bg-surface-container-highest' : 'bg-secondary-container/20 border-dashed border-secondary hover:bg-secondary-container/30'
                          }`}
                          onClick={() => setEditingTransaction(tx)}
                        >
                          <div
                            className={`h-10 w-10 flex items-center justify-center shrink-0 ${tx.isCommitted ? 'border-2 border-black' : 'border-2 border-dashed border-secondary'} ${!tagBg ? (tx.type === 'income' ? 'bg-primary-container' : 'bg-error-container') : ''}`}
                            style={tagBg ? { backgroundColor: tagBg } : undefined}
                          >
                            <TxIcon />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-body-sm font-bold text-on-surface truncate">{getTransactionTitle(tx)}</p>
                              {!tx.isCommitted && <span className="font-label-caps text-[8px] uppercase px-1 py-0.5 bg-secondary text-on-secondary leading-none shrink-0">Pending</span>}
                            </div>
                            {tx.tags?.length ? <TagChips tags={tx.tags} /> : <p className="text-[14px] text-on-surface-variant truncate">{getTransactionCategory(tx)}</p>}
                            {tx.vault?.name && (
                              <span className="font-label-caps text-[9px] uppercase px-1 py-0.5 border border-black bg-surface-container text-outline leading-none inline-block mt-0.5">
                                {tx.vault.name}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <p className={`font-label-caps ${tx.type === 'income' ? 'text-primary' : 'text-error'}`}>
                              {tx.type === 'income' ? '+' : '-'}
                              {formatCurrency(tx.amount)}
                            </p>
                            <p className="font-body-sm text-outline text-[10px]">{formatDate(tx.date)}</p>
                            {tx.isCommitted ? (
                              <p className="font-body-sm text-outline text-[10px]">{formatTime(tx.updatedAt)}</p>
                            ) : (
                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => handleCommitTransaction(tx)}
                                  disabled={pendingTx === tx.id}
                                  aria-label="Commit transaction"
                                  title="Commit"
                                  className="flex items-center justify-center bg-primary text-on-primary border-2 border-black h-[26px] w-[26px] hover:bg-primary/90 active:translate-y-px transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  onClick={() => handleDiscardTransaction(tx)}
                                  disabled={pendingTx === tx.id}
                                  aria-label="Discard transaction"
                                  title="Discard"
                                  className="flex items-center justify-center bg-surface text-on-surface border-2 border-black h-[26px] w-[26px] hover:bg-error hover:text-on-error active:translate-y-px transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {filteredOccurrences.map((occ) => {
                      const key = `${occ.recurringId}:${occ.date}`;
                      return <TransactionCard key={key} occ={occ} isApplying={applyingOccurrence === key} onApply={handleApplyOccurrence} onSkip={handleSkipOccurrence} />;
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>

      <BottomNavBar />

      {/* FAB */}
      <div className="fixed bottom-24 md:bottom-8 right-4 md:right-8 z-50">
        <Button
          onClick={() => setIsModalOpen(true)}
          variant="primary"
          className="h-16 w-16 flex items-center justify-center rounded-none relative focus:outline-none !p-0 shadow-[4px_4px_0_0_rgba(0,0,0,1)] hover:translate-y-0.5 hover:shadow-[2px_2px_0_0_rgba(0,0,0,1)] active:translate-y-1 active:shadow-none transition-all"
        >
          <Plus className="w-8 h-8 font-bold" />
        </Button>
      </div>

      <LogResourceModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={handleTransactionSuccess} userId={userId} selectedMonth={selectedMonth} selectedYear={selectedYear} />
      <EditTransactionModal isOpen={!!editingTransaction} onClose={() => setEditingTransaction(null)} onSuccess={handleTransactionSuccess} userId={userId} transaction={editingTransaction} />
      <AdjustBalanceModal
        isOpen={isAdjustBalanceOpen}
        onClose={() => setIsAdjustBalanceOpen(false)}
        onSuccess={handleTransactionSuccess}
        userId={userId}
        currentNetYield={netYield}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        vaultId={selectedVaultFilter.length === 1 ? selectedVaultFilter[0] : null}
      />

      <OnboardingWalkthrough isOpen={isWalkthroughOpen} onFinish={completeWalkthrough} playerName={profile?.name} hasDrops={filteredDrops.length > 0 || filteredOccurrences.length > 0} />

      {toastMessage && (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-surface-container border-4 border-black p-4 shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5),8px_8px_0_rgba(0,0,0,0.4)] flex items-center gap-3 animate-bounce">
          <span className="font-label-caps text-xs text-error font-bold">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-on-surface hover:text-primary">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
