'use client';
import Link from 'next/link';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Check, Trash2, TrendingDown, TrendingUp, Coins, ChevronDown, CalendarClock } from 'lucide-react';

import { AppBar, BottomNavBar, Button, Card, AddDebtModal, DesktopSidebar, DiscardDebtModal, ApplyDebtModal, QueryParamsProvider, useQueryParams } from '@/components';
import { useAuth } from '@/hooks/useAuth';
import { profileApi } from '@/lib/api';
import { NetworkError } from '@/lib/api/ApiClient';
import { enqueue, isOfflineId, OFFLINE_ID_PREFIX, pendingDebts } from '@/lib/offline/outbox';
import { OFFLINE_SYNCED_EVENT } from '@/lib/offline/sync-events';
import type { DebtDto, VaultDto } from '@expense-tracker/shared';

const DebtTypes = {
  INCOMPLETE: 'incomplete',
  COMPLETED: 'completed',
  ALL: 'all',
} as const;

type DebtType = (typeof DebtTypes)[keyof typeof DebtTypes];

const STATUS_QUERY_PARAM = 'status';

function isDebtType(value: string | null): value is DebtType {
  return value === DebtTypes.INCOMPLETE || value === DebtTypes.COMPLETED || value === DebtTypes.ALL;
}

function formatCurrency(amount: number): string {
  return `⛁ ${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDueDate(dueDate: string): string {
  const [year, month, day] = dueDate.split('-');
  return `${day}/${month}/${year}`;
}

function DebtsContent() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { getParam, setParam } = useQueryParams();
  const statusParam = getParam(STATUS_QUERY_PARAM);
  const status: DebtType = isDebtType(statusParam) ? statusParam : DebtTypes.INCOMPLETE;

  const [debts, setDebts] = useState<DebtDto[]>([]);
  const [vaults, setVaults] = useState<VaultDto[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editDebt, setEditDebt] = useState<DebtDto | null>(null);

  const [applyDebt, setApplyDebt] = useState<DebtDto | null>(null);
  const [applyVaultId, setApplyVaultId] = useState<string>('');
  const [applying, setApplying] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [discardDebt, setDiscardDebt] = useState<DebtDto | null>(null);

  const fetchData = useCallback(async (): Promise<void> => {
    if (!userId) return;
    setIsLoading(true);

    try {
      const [d, v] = await Promise.all([profileApi.getDebts(userId, status), profileApi.getVaults(userId)]);
      // Dues still waiting in the outbox are not on the server yet, so they must
      // be merged on top of the fetched (or cached) list to survive a reload.
      const queued = status === DebtTypes.COMPLETED ? [] : pendingDebts(userId);
      setDebts([...queued, ...d]);
      setVaults(v);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [userId, status]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Once the outbox drains, the queued dues exist server-side — refetch so the
  // placeholder rows are replaced by real ones (with real ids and actions).
  useEffect(() => {
    const onSynced = () => void fetchData();
    window.addEventListener(OFFLINE_SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(OFFLINE_SYNCED_EVENT, onSynced);
  }, [fetchData]);

  const handleCreate = async (data: { title: string; amount: number; type: 'expense' | 'income'; notes: string | null; dueDate: string | null }) => {
    if (!userId) return;

    // Every field of a due is known client-side, so an offline create can render
    // exactly like an online one — only the id marks it as not-yet-synced.
    const queueLocally = () => {
      const entry = enqueue({ kind: 'create-debt', userId, payload: data });
      setDebts((prev) => [
        {
          id: `${OFFLINE_ID_PREFIX}${entry.id}`,
          userId,
          title: data.title,
          amount: data.amount,
          type: data.type,
          notes: data.notes,
          dueDate: data.dueDate,
          createdAt: new Date(),
          completed: false,
          discarded: false,
        },
        ...prev,
      ]);
    };

    if (!navigator.onLine) {
      queueLocally();
      return;
    }

    try {
      const created = await profileApi.createDebt(userId, data);
      setDebts((prev) => [created, ...prev]);
    } catch (err) {
      // Only a transport failure is queued; a server rejection must surface.
      if (!(err instanceof NetworkError)) throw err;
      queueLocally();
    }
  };

  const handleUpdate = async (data: { title: string; amount: number; type: 'expense' | 'income'; notes: string | null; dueDate: string | null }) => {
    if (!userId || !editDebt) return;
    const updated = await profileApi.updateDebt(userId, editDebt.id, data);
    setDebts((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  const openApplyDialog = (debt: DebtDto) => {
    const defaultVault = vaults.find((v) => v.isDefault) ?? vaults[0];
    setApplyVaultId(defaultVault?.id ?? '');
    setApplyDebt(debt);
  };

  const handleApply = async (skipTransaction: boolean) => {
    if (!userId || !applyDebt) return;

    setApplying(true);

    try {
      await profileApi.applyDebt(userId, applyDebt.id, applyVaultId || null, skipTransaction);
      setApplyDebt(null);
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setApplying(false);
    }
  };

  const handleDiscard = async (debt: DebtDto) => {
    if (!userId) return;
    await profileApi.deleteDebt(userId, debt.id);
    await fetchData();
  };

  return (
    <div className="bg-background text-on-background font-body-lg min-h-screen flex flex-col md:flex-row overflow-x-hidden selection:bg-primary selection:text-on-primary">
      <AppBar />

      <DesktopSidebar />

      <main className="flex-1 flex flex-col w-full md:h-screen relative px-3 md:px-0 pb-24 md:pb-0 overflow-y-auto overflow-x-hidden">
        <div className="w-full p-margin-mobile md:p-8 flex flex-col gap-stack-md">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b-4 border-surface-container-highest pb-4">
            <div className="mt-2 md:mt-0">
              <h2 className="font-headline-lg text-headline-lg text-primary">
                <Link href="/" className="text-primary no-underline">
                  Debts
                </Link>
              </h2>
              <p className="font-body-sm text-on-surface-variant">Templates you can apply as expenses or income whenever they come due.</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative w-56">
                <Button
                  variant="primary"
                  onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                  className={`w-full h-14 px-4 border-4 border-black flex items-center justify-between font-body-lg transition-all active:translate-y-0.5 active:shadow-none group bg-surface-container-lowest hover:bg-surface-container-low
                    ${statusDropdownOpen ? 'ring-4 ring-primary/20' : ''}
                  `}
                >
                  <span className="text-primary font-bold">{status.charAt(0).toUpperCase() + status.slice(1)}</span>

                  <div className="flex items-center gap-2">
                    <div className="w-1 h-6 bg-black/10 rounded-full" />
                    <ChevronDown className={`text-outline transition-transform duration-300 ${statusDropdownOpen ? 'rotate-180' : ''}`} size={20} />
                  </div>
                </Button>
                {statusDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-[115]" onClick={() => setStatusDropdownOpen(false)} />

                    <div
                      className={`absolute top-[calc(100%+4px)] left-0 right-0 z-[120] bg-surface-container-high border-4 border-black shadow-[8px_8px_0px_rgba(0,0,0,1)] transition-all duration-200
                  ${statusDropdownOpen ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}
                  `}
                    >
                      <div className="max-h-60 overflow-y-auto">
                        {Object.values(DebtTypes).map((type) => {
                          const isSelected = status === type;

                          return (
                            <button
                              key={type}
                              onClick={() => {
                                setParam(STATUS_QUERY_PARAM, type);
                                setStatusDropdownOpen(false);
                              }}
                              className={`w-full h-14 px-4 flex items-center justify-between font-body-lg transition-colors hover:bg-surface-container-highest group ${
                                isSelected ? 'bg-surface-container-highest' : 'bg-surface-container-low'
                              }`}
                            >
                              <span className={`font-body-lg ${isSelected ? 'text-primary font-bold' : 'text-on-surface'}`}>{type.charAt(0).toUpperCase() + type.slice(1)}</span>

                              {isSelected && <div className="w-4 h-4 bg-primary border-2 border-black" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <Button variant="primary" className="flex h-14 items-center gap-2 whitespace-nowrap" onClick={() => setAddOpen(true)}>
                <Plus className="w-5 h-5" />
                <span className="font-label-caps uppercase tracking-wider whitespace-nowrap">New</span>
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col gap-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-surface-container-highest border-4 border-black" />
              ))}
            </div>
          ) : debts.length === 0 ? (
            <Card className="flex flex-col gap-3 items-center text-center py-12">
              <Coins className="w-12 h-12 text-outline opacity-50" />
              <p className="font-headline-sm text-on-surface">No dues yet.</p>
              <p className="font-body-sm text-on-surface-variant">Create a due to keep a reusable template — apply it whenever the payment lands.</p>
            </Card>
          ) : (
            <div className="flex flex-col gap-3">
              {debts.map((debt) => {
                const isIncome = debt.type === 'income';
                // A due that only exists in the outbox has no server id yet, so
                // editing, applying and discarding it are impossible until it syncs.
                const isQueued = isOfflineId(debt.id);
                return (
                  <Card key={debt.id} className="flex flex-col sm:flex-row sm:items-center gap-3 !p-3">
                    <button
                      type="button"
                      disabled={isQueued}
                      onClick={() => setEditDebt(debt)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer group focus:outline-none"
                      aria-label={`Edit ${debt.title}`}
                    >
                      <div
                        className={`w-12 h-12 shrink-0 border-4 border-black flex items-center justify-center ${isIncome ? 'bg-primary-container text-on-primary-container' : 'bg-error-container text-on-error-container'}`}
                      >
                        {isIncome ? <TrendingUp /> : <TrendingDown />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-headline-sm text-on-surface truncate group-hover:text-primary transition-colors">{debt.title}</span>

                          {debt.completed && <span className="text-xs border-2 border-green-600 text-green-700 px-2 py-0.5 rounded whitespace-nowrap">✓</span>}
                          {debt.discarded && <span className="text-xs border-2 border-error text-error px-2 py-0.5 rounded whitespace-nowrap">✕</span>}
                          {isQueued && <span className="font-label-caps text-[9px] uppercase px-1 py-0.5 bg-secondary text-on-secondary leading-none whitespace-nowrap">Queued</span>}
                        </div>
                        <span className={`font-label-caps text-[11px] uppercase ${isIncome ? 'text-primary' : 'text-error'}`}>
                          {formatCurrency(debt.amount)} · {debt.type}
                        </span>
                        {debt.dueDate && (
                          <span className="font-label-caps text-[11px] uppercase text-on-surface-variant mt-0.5 flex items-center gap-1">
                            <CalendarClock className="w-3 h-3" />
                            Due {formatDueDate(debt.dueDate)}
                          </span>
                        )}
                        {debt.notes && <span className="font-body-sm text-on-surface-variant truncate mt-0.5">{debt.notes}</span>}
                      </div>
                    </button>
                    {!debt.completed && !debt.discarded && !isQueued && (
                      <div className="flex gap-2 shrink-0">
                        <Button variant="primary" size="sm" className="flex items-center gap-1" onClick={() => openApplyDialog(debt)}>
                          <Check className="w-4 h-4" />
                          <span className="font-label-caps uppercase">Apply</span>
                        </Button>
                        <Button variant="danger" size="sm" className="flex items-center gap-1" onClick={() => setDiscardDebt(debt)}>
                          <Trash2 className="w-4 h-4" />
                          <span className="font-label-caps uppercase">Discard</span>
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <BottomNavBar />

      <AddDebtModal isOpen={addOpen} onClose={() => setAddOpen(false)} onSave={handleCreate} />

      <AddDebtModal isOpen={editDebt !== null} onClose={() => setEditDebt(null)} onSave={handleUpdate} debt={editDebt} />

      <DiscardDebtModal isOpen={discardDebt !== null} onClose={() => setDiscardDebt(null)} debtTitle={discardDebt?.title ?? ''} onDiscard={() => discardDebt && handleDiscard(discardDebt)} />

      <ApplyDebtModal
        isOpen={applyDebt !== null}
        onClose={() => setApplyDebt(null)}
        debt={applyDebt}
        vaults={vaults}
        vaultId={applyVaultId}
        onVaultChange={setApplyVaultId}
        onConfirm={handleApply}
        applying={applying}
      />
    </div>
  );
}

export default function DebtsPage() {
  return (
    <QueryParamsProvider>
      <DebtsContent />
    </QueryParamsProvider>
  );
}
