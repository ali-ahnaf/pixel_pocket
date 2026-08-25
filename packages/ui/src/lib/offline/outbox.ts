import type { CreateDebtInput, CreateTransactionInput, DebtDto, TransactionDto } from '@expense-tracker/shared';

/**
 * A queue of writes made while the browser had no network, replayed by
 * `OfflineSync` when it comes back.
 *
 * This is deliberately NOT a generic HTTP replay queue: it is a closed union of
 * exactly two known operations, so a queued entry can never misfire on an
 * unrelated endpoint and every payload can be reasoned about (and rendered as a
 * placeholder row) without inspecting a serialized request.
 */

export const OUTBOX_STORAGE_KEY = 'pp_outbox';

/** Dispatched on `window` whenever the queue changes, so the offline banner can show how much is waiting. */
export const OUTBOX_CHANGED_EVENT = 'pp:outbox-changed';

/** Ids of rows that only exist in the outbox are prefixed so the UI can disable server-only actions. */
export const OFFLINE_ID_PREFIX = 'offline:';

export type OutboxEntry =
  | { id: string; kind: 'create-transaction'; userId: string; queuedAt: string; payload: CreateTransactionInput & { clientRequestId: string } }
  | { id: string; kind: 'create-debt'; userId: string; queuedAt: string; payload: CreateDebtInput & { clientRequestId: string } };

/** What a call site provides: the queue owns the id, the timestamp and the `clientRequestId`. */
export type OutboxEntryInput = { kind: 'create-transaction'; userId: string; payload: CreateTransactionInput } | { kind: 'create-debt'; userId: string; payload: CreateDebtInput };

export function isOfflineId(id: string): boolean {
  return id.startsWith(OFFLINE_ID_PREFIX);
}

function read(): OutboxEntry[] {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(OUTBOX_STORAGE_KEY);
  if (raw === null) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: OutboxEntry[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Out of quota: the write is lost, but throwing here would break the form
    // the user just submitted. The queue stays consistent either way.
  }
  window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT));
}

function newId(): string {
  // randomUUID needs a secure context; fall back so a plain-HTTP dev host still works.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Append an entry to the queue. The generated id doubles as the payload's
 * `clientRequestId`, which is what makes the replay idempotent server-side.
 */
export function enqueue(entry: OutboxEntryInput): OutboxEntry {
  const id = newId();
  const queued = { ...entry, id, queuedAt: new Date().toISOString(), payload: { ...entry.payload, clientRequestId: id } } as OutboxEntry;
  write([...read(), queued]);
  return queued;
}

/** Every queued entry, oldest first — replay order. */
export function peekAll(): OutboxEntry[] {
  return read();
}

export function remove(id: string): void {
  write(read().filter((entry) => entry.id !== id));
}

/** Drop the whole queue. Called on sign-out and on a 401 so a second user on the device never replays the first user's writes. */
export function clearOutbox(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(OUTBOX_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT));
}

/**
 * Queued dues as `DebtDto`s so the list can render them like any other row.
 * Every field of a due is known client-side, so these are complete apart from
 * the id, which is prefixed to mark the row as not-yet-on-the-server.
 */
export function pendingDebts(userId: string): DebtDto[] {
  return read()
    .filter((entry): entry is Extract<OutboxEntry, { kind: 'create-debt' }> => entry.kind === 'create-debt' && entry.userId === userId)
    .map((entry) => ({
      id: `${OFFLINE_ID_PREFIX}${entry.id}`,
      userId: entry.userId,
      title: entry.payload.title,
      amount: entry.payload.amount,
      type: entry.payload.type,
      notes: entry.payload.notes ?? null,
      dueDate: entry.payload.dueDate ?? null,
      createdAt: new Date(entry.queuedAt),
      completed: false,
      discarded: false,
    }))
    .reverse();
}

/**
 * Queued transactions as `TransactionDto`s. Tags and the vault name are not in
 * the payload (only ids are), so those render empty until the entry syncs and
 * the real row is fetched.
 */
export function pendingTransactions(userId: string): TransactionDto[] {
  return read()
    .filter((entry): entry is Extract<OutboxEntry, { kind: 'create-transaction' }> => entry.kind === 'create-transaction' && entry.userId === userId)
    .map((entry) => ({
      id: `${OFFLINE_ID_PREFIX}${entry.id}`,
      userId: entry.userId,
      title: entry.payload.title ?? null,
      amount: entry.payload.amount,
      type: entry.payload.type ?? 'expense',
      date: entry.payload.date ?? entry.queuedAt.slice(0, 10),
      vaultId: entry.payload.vaultId ?? null,
      vault: null,
      tags: [],
      isCommitted: true,
      createdAt: entry.queuedAt,
      updatedAt: entry.queuedAt,
    }))
    .reverse();
}
