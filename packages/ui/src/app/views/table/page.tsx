'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppBar, BottomNavBar, Button, Card, DesktopSidebar, YearlyTagTable } from '@/components';
import { useAuth } from '@/hooks/useAuth';
import { profileApi } from '@/lib/api';
import { buildYearlyTable, projectableMonths } from '@/lib/views/build-yearly-table';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Package, Table2 } from 'lucide-react';
import type { OccurrenceDto, TagDto, TransactionDto, User, VaultDto } from '@expense-tracker/shared';

const NOW = new Date();
const CURRENT_YEAR = NOW.getFullYear();
const CURRENT_MONTH = NOW.getMonth() + 1;

export default function TabularViewPage() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [profile, setProfile] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<TransactionDto[]>([]);
  const [tags, setTags] = useState<TagDto[]>([]);
  const [vaults, setVaults] = useState<VaultDto[]>([]);
  const [occurrences, setOccurrences] = useState<OccurrenceDto[]>([]);

  const [year, setYear] = useState(CURRENT_YEAR);
  const [selectedVaultId, setSelectedVaultId] = useState<string>('all');
  const [vaultOpen, setVaultOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isProjecting, setIsProjecting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setIsLoading(true);
    Promise.all([profileApi.getUser(userId), profileApi.getAllTransactions(userId), profileApi.getTags(userId), profileApi.getVaults(userId)])
      .then(([userProfile, txs, tagList, vaultList]) => {
        setProfile(userProfile);
        setTransactions(txs);
        setTags(tagList);
        setVaults(vaultList);
        // Land on the user's default vault ("Main Stash") rather than the aggregate view.
        const defaultVault = vaultList.find((vault) => vault.isDefault);
        if (defaultVault) setSelectedVaultId(defaultVault.id);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [userId]);

  // Occurrences are a per-month endpoint, so a year needs one call per month that
  // still has projections (current month onwards) — fired together, never for the past.
  useEffect(() => {
    if (!userId) return;
    const months = projectableMonths(year, NOW);
    if (months.length === 0) {
      setOccurrences([]);
      return;
    }

    let cancelled = false;
    setIsProjecting(true);
    Promise.all(months.map((month) => profileApi.getRecurringOccurrences(userId, month, year)))
      .then((results) => {
        if (!cancelled) setOccurrences(results.flat());
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setIsProjecting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, year]);

  // Offer every year the user has history for, plus next year so projections are useful.
  const availableYears = useMemo(() => {
    const years = transactions.map((t) => Number(t.date.split('-')[0])).filter((y) => Number.isFinite(y));
    const earliest = Math.min(CURRENT_YEAR, ...years);
    const latest = CURRENT_YEAR + 1;
    return Array.from({ length: latest - earliest + 1 }, (_, i) => earliest + i);
  }, [transactions]);

  const minYear = availableYears[0];
  const maxYear = availableYears[availableYears.length - 1];

  const model = useMemo(() => buildYearlyTable({ transactions, occurrences, tags, year, vaultId: selectedVaultId }), [transactions, occurrences, tags, year, selectedVaultId]);

  const selectedVaultName = selectedVaultId === 'all' ? 'All Vaults' : (vaults.find((v) => v.id === selectedVaultId)?.name ?? 'All Vaults');

  return (
    <div className="bg-background text-on-background font-body-lg min-h-screen flex flex-col md:flex-row overflow-x-hidden selection:bg-primary selection:text-on-primary">
      <AppBar />

      <DesktopSidebar name={profile?.name} email={profile?.email} avatar={profile?.avatar} />

      <main className="flex-1 flex flex-col w-full md:h-screen relative px-3 md:px-0 pb-24 md:pb-0 overflow-y-auto overflow-x-hidden" onClick={() => setVaultOpen(false)}>
        <div className="w-full p-margin-mobile md:p-8 flex flex-col gap-stack-md">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b-4 border-surface-container-highest pb-4">
            <div className="mt-2 md:mt-0">
              <h2 className="font-headline-lg text-headline-lg text-primary flex items-center gap-2">
                <Table2 className="w-6 h-6" />
                Tabular View
              </h2>
              <p className="font-body-sm text-on-surface-variant">One year of spend, month by month and tag by tag.</p>
            </div>

            <div className="flex flex-row items-end gap-3 w-full sm:w-auto" onClick={(e) => e.stopPropagation()}>
              {/* Vault Selector */}
              <div className="flex flex-col gap-1 relative z-50 flex-1 min-w-0 sm:flex-none">
                <span className="font-label-caps text-[10px] text-outline uppercase ml-1">Source Vault</span>
                <div className="relative">
                  <Button
                    variant="ghost"
                    aria-haspopup="listbox"
                    aria-expanded={vaultOpen}
                    className="w-full h-12 bg-surface-container text-on-surface font-body-sm py-0 px-2 sm:px-4 border-4 border-black shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5)] hover:bg-surface-container-highest flex items-center gap-2 sm:gap-3 sm:min-w-[160px]"
                    onClick={() => setVaultOpen((open) => !open)}
                  >
                    <Package className="text-primary w-4 h-4 shrink-0" />
                    <span className="flex-grow text-left truncate">{selectedVaultName}</span>
                    <ChevronDown className="w-4 h-4 shrink-0" />
                  </Button>
                  {vaultOpen && (
                    <div role="listbox" className="absolute top-full left-0 w-full bg-surface-container-high border-4 border-black border-t-0 z-50">
                      {[{ id: 'all', name: 'All Vaults' }, ...vaults].map((vault) => (
                        <div
                          key={vault.id}
                          role="option"
                          aria-selected={vault.id === selectedVaultId}
                          className="p-2 hover:bg-primary hover:text-on-primary cursor-pointer font-body-sm"
                          onClick={() => {
                            setSelectedVaultId(vault.id);
                            setVaultOpen(false);
                          }}
                        >
                          {vault.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Year Switcher */}
              <div className="flex flex-col gap-1 flex-1 min-w-0 sm:flex-none">
                <span className="font-label-caps text-[10px] text-outline uppercase ml-1">Cycle</span>
                <div className="flex h-12 items-stretch border-4 border-black bg-surface-container shadow-[inset_2px_2px_0_rgba(255,255,255,0.08),inset_-2px_-2px_0_rgba(0,0,0,0.5)]">
                  <button
                    aria-label="Previous year"
                    disabled={year <= minYear}
                    onClick={() => setYear((y) => Math.max(minYear, y - 1))}
                    className="shrink-0 px-2 hover:bg-primary hover:text-on-primary disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="flex flex-1 items-center justify-center gap-2 px-2 sm:px-4 font-headline-sm text-on-surface">
                    <Calendar className="text-primary w-4 h-4 shrink-0" />
                    {year}
                  </span>
                  <button
                    aria-label="Next year"
                    disabled={year >= maxYear}
                    onClick={() => setYear((y) => Math.min(maxYear, y + 1))}
                    className="shrink-0 px-2 hover:bg-primary hover:text-on-primary disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <Card className="flex flex-col gap-4 !p-3">
            <YearlyTagTable model={model} isLoading={isLoading || isProjecting} currentMonth={year === CURRENT_YEAR ? CURRENT_MONTH : undefined} />
          </Card>
        </div>
      </main>

      <BottomNavBar />
    </div>
  );
}
