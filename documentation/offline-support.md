# Offline support plan (narrow scope)

Goal: exactly two things work with no network, nothing else.

1. **Create a transaction** from [LogResourceModal.tsx](../packages/ui/src/components/LogResourceModal.tsx).
2. **Create a debt** from [AddDebtModal.tsx](../packages/ui/src/components/AddDebtModal.tsx) / [debts/page.tsx](../packages/ui/src/app/debts/page.tsx).

Everything else keeps its current online-only behaviour.

## 1. Does creating a transaction work offline today? No.

[`handleSubmit`](../packages/ui/src/components/LogResourceModal.tsx#L244-L268) calls `profileApi.createTransaction`, axios rejects with a transport error, and there is **no `catch`** — only `try/finally`. So offline the user sees: spinner flips back to `RECORD`, modal stays open, fields keep their values, nothing saved, an unhandled promise rejection in the console. No error message at all.

Two more things break in that modal before submit even happens:

- On open it fires `getTags` and `getVaults` ([lines 81-92](../packages/ui/src/components/LogResourceModal.tsx#L81-L92)) with `.then()` and no `.catch()`. Offline → both reject → tag list empty, `vaults.length === 0` so the vault picker is not rendered at all, and any submit would post `vaultId: null`.
- The AI prompt path calls `getAiCredentialStatus` and then OpenRouter — both need the network.

Debts are simpler: `AddDebtModal` is pure UI with no fetching, and `handleCreate` ([debts/page.tsx:74-78](../packages/ui/src/app/debts/page.tsx#L74-L78)) needs the server's returned `DebtDto` only to prepend it to the list — a value we can construct locally.

Also relevant: the service worker precaches only `/` ([sw.js](../packages/ui/public/sw.js)), so a cold offline launch straight into `/debts/` renders the wrong shell.

## 2. Design

Two mechanisms, both tiny and both scoped by an explicit allow-list:

- **Reference cache** — cache GET responses for `/tags`, `/vaults`, `/debts` only, so the two forms can be filled in offline and the debts list is not blank.
- **Outbox** — a typed queue of exactly two operations (`create-transaction`, `create-debt`), replayed when the browser comes back online. Not a generic HTTP replay queue: a closed union of two known payloads is far easier to reason about and impossible to misfire on an unrelated endpoint.

### 2.1 `packages/ui/src/lib/offline/cache.ts` (new)

```ts
const CACHE_PREFIX = 'pp_cache:';
// Only these GETs are cached. Everything else stays online-only.
const CACHEABLE = [/\/users\/[^/]+\/tags$/, /\/users\/[^/]+\/vaults$/, /\/users\/[^/]+\/debts(\?|$)/];

isCacheable(url: string): boolean
readCache<T>(url: string): T | null
writeCache<T>(url: string, data: T): void   // swallow QuotaExceededError
clearCache(): void                          // called on sign-out and on 401
```

`localStorage`, synchronous, no new dependency. Payload is a few KB (tags, vaults, debts) — nowhere near the 5 MB budget, and no month-by-month transaction history is stored.

**Privacy note:** debt titles/amounts now persist in `localStorage` in plaintext, alongside the existing `pocket_pixel_profile` entry. Consistent with what the app already does, but it is a real widening — call it out before merging. Encrypting with the session DEK (`src/lib/crypto/dek-session.ts`) is possible but makes the cache async and roughly doubles this phase.

### 2.2 `packages/ui/src/lib/offline/outbox.ts` (new)

```ts
export type OutboxEntry =
  | { id: string; kind: 'create-transaction'; userId: string; queuedAt: string; payload: CreateTransactionInput & { clientRequestId: string } }
  | { id: string; kind: 'create-debt';        userId: string; queuedAt: string; payload: CreateDebtInput & { clientRequestId: string } };

enqueue(entry: Omit<OutboxEntry, 'id' | 'queuedAt'>): OutboxEntry
peekAll(): OutboxEntry[]
remove(id: string): void
pendingDebts(userId: string): DebtDto[]              // synthetic DTOs for list rendering
pendingTransactions(userId: string): TransactionDto[]
```

Stored as one JSON array under `pp_outbox`, FIFO. `id` = `crypto.randomUUID()`, reused as `clientRequestId`.

### 2.3 `ApiClient.ts` — ~15 lines

- On a successful `GET` whose url `isCacheable` → `writeCache`.
- In `catch`, before the 401 branch: `GET` + `isCacheable` + **no `error.response`** (transport failure, not a 4xx/5xx) → return `readCache(url)` if present. A real server error still throws, so genuine failures are not masked.
- `handleUnauthorized()` and `useAuth.signOut` also call `clearCache()` + clear the outbox, so a second user on the device never inherits the first user's data.

Writes are **not** touched here — queueing lives in the two call sites, which know what a successful result should look like.

### 2.4 `useOnlineStatus.ts` (new hook)

`navigator.onLine` seed + `online`/`offline` listeners. Used by the modal to switch to offline mode and by the banner.

### 2.5 `LogResourceModal.tsx`

- Wrap the open-time `getTags`/`getVaults` calls in `.catch(() => undefined)` — with 2.3 they resolve from cache offline; the catch just stops the unhandled rejection when there is no cache yet.
- When offline: force manual entry (`manualEntry = true`), hide the AI toggle and prompt box — the OpenRouter path cannot work without a network, and failing loudly there is correct.
- When offline: hide the `CREATE: <TAG>` affordance and skip tag creation in `handleKeyDown`. Creating a tag offline is **out of scope**; cached existing tags stay selectable.
- `handleSubmit`: add the missing `catch`. If offline (or the request fails with no `error.response`) → `outbox.enqueue({ kind: 'create-transaction', userId, payload })`, then run the existing success path (clear fields, `onSuccess?.()`, `onClose()`) and surface a `SAVED OFFLINE — WILL SYNC` note. On a real server error, show `profileApi.parseError(err)` and keep the modal open.

### 2.6 `debts/page.tsx`

`handleCreate`: same shape. On offline/transport failure, enqueue and prepend a locally built `DebtDto`:

```ts
{ id: `offline:${entry.id}`, userId, title, amount, type, notes, dueDate, createdAt: new Date(), completed: false, discarded: false }
```

Every field is known client-side, so the list renders identically to an online create. `fetchData` merges `outbox.pendingDebts(userId)` on top of the fetched/cached list so the item survives a reload while still queued. Guard the row actions (apply / edit / discard) for ids starting with `offline:` — those need the server.

### 2.7 `OfflineSync.tsx` (new, mounted once in `layout.tsx`)

On the `online` event (and once at mount if the queue is non-empty), replay `peekAll()` **sequentially, in order**:

- 2xx → `remove(entry.id)`.
- 4xx → drop the entry and toast; the server rejected it, retrying forever is worse.
- transport failure → stop, leave the rest queued for the next `online`.

After the queue drains, dispatch `pp:offline-synced`; `page.tsx` and `debts/page.tsx` listen and bump their existing `refetchKey` / call `fetchData`.

Also add an offline banner in `AppBar` (`OFFLINE — CHANGES WILL SYNC LATER`) so stale numbers don't read as a bug.

### 2.8 Service worker — 2 lines

`public/sw.js`: add the exported route shells to `PRECACHE_URLS` and bump `CACHE_VERSION` to `v4`:

```js
const PRECACHE_URLS = ['/', '/debts/', '/manifest.json', /* …existing icons… */];
```

Trailing slashes required (`next.config.js` sets `trailingSlash: true`). Keep the SW's existing `/api` bypass — API data is handled in JS where it is testable and clearable on sign-out.

## 3. Duplicate-write risk — read before shipping

If a queued request actually reached the server but the response was lost, replay creates a **duplicate transaction or debt**. Fix it in the same change, not later:

- Client sends `clientRequestId` (the outbox entry id) in both create payloads.
- `packages/shared/src/contracts/transactions.ts` + `debts.ts`: add `clientRequestId?: string` to `CreateTransactionInput` / `CreateDebtInput`, then `npm run build:shared`.
- **Joi rejects unknown keys by default** — both [post-transaction.route.ts](../packages/api/src/routes/transactions/post-transaction.route.ts) and [post-debt.route.ts](../packages/api/src/routes/debts/post-debt.route.ts) must add `clientRequestId: Joi.string().uuid().optional()` or every queued write 400s.
- `Expense.entity.ts` and `Debt.entity.ts`: nullable, unique `clientRequestId` column → `npm run migration:generate` then `npm run migration:run`.
- `transactions.service.ts` / `debts.service.ts`: if a row with that `clientRequestId` exists for the user, return it instead of inserting.

Without this, the honest position is that a flaky network can double-post.

## 4. Files touched

| File | Change |
| --- | --- |
| `ui/src/lib/offline/cache.ts` | new (~50 lines) |
| `ui/src/lib/offline/outbox.ts` | new (~80 lines) |
| `ui/src/hooks/useOnlineStatus.ts` | new (~15 lines) |
| `ui/src/components/OfflineSync.tsx` | new (~60 lines) |
| `ui/src/lib/api/ApiClient.ts` | ~15 lines |
| `ui/src/components/LogResourceModal.tsx` | offline branch in `handleSubmit`, hide AI + tag-create |
| `ui/src/app/debts/page.tsx` | offline branch in `handleCreate`, merge pending |
| `ui/src/app/layout.tsx`, `AppBar.tsx` | mount sync + banner |
| `ui/public/sw.js` | `PRECACHE_URLS` + version bump |
| shared contracts, 2 API routes, 2 entities, 1 migration, 2 services | `clientRequestId` idempotency |

## 5. Verification

- Vitest: `outbox.test.ts` (enqueue/peek/remove/pending DTO shape), `cache.test.ts` (allow-list, quota), an `ApiClient` test proving a transport failure on `/vaults` resolves from cache while a 500 still throws.
- Extend the existing [LogResourceModal.test.tsx](../packages/ui/src/components/LogResourceModal.test.tsx): with `navigator.onLine === false`, submitting enqueues one entry, closes the modal, and calls `onSuccess`.
- Jest (API): creating twice with the same `clientRequestId` returns the same row, not two.
- Playwright `e2e/offline.spec.ts`: sign in online, `context.setOffline(true)`, log a transaction and a debt, `setOffline(false)`, assert both appear server-side after sync and the outbox is empty.

## 6. Explicitly out of scope

Offline tag creation, AI prompt parsing, editing/deleting transactions or debts, applying debts, applying/skipping recurring occurrences, stats, profile, settings, Gmail/OAuth, sign-in/sign-up. These keep failing as they do now.
