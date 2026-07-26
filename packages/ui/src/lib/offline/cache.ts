/**
 * A deliberately tiny read-through cache for a handful of reference GETs.
 *
 * Scope is an explicit allow-list: only the tags, vaults and debts lists are
 * cached, because those are what the two offline-capable forms (log a
 * transaction, create a due) need in order to be filled in with no network.
 * Nothing else is stored — in particular no month-by-month transaction history.
 *
 * `localStorage` is used rather than IndexedDB so reads stay synchronous and no
 * dependency is added; the cached payload is a few KB, far below the ~5 MB budget.
 *
 * Privacy: this persists due titles/amounts in plaintext, alongside the existing
 * `pocket_pixel_profile` entry. It is cleared on sign-out and on a 401.
 */

const CACHE_PREFIX = 'pp_cache:';

// Only these GETs are cached. Everything else stays online-only.
const CACHEABLE: readonly RegExp[] = [/\/users\/[^/]+\/tags$/, /\/users\/[^/]+\/vaults$/, /\/users\/[^/]+\/debts(\?|$)/];

export function isCacheable(url: string): boolean {
  return CACHEABLE.some((pattern) => pattern.test(url));
}

export function readCache<T>(url: string): T | null {
  if (typeof window === 'undefined') return null;

  const raw = window.localStorage.getItem(`${CACHE_PREFIX}${url}`);
  if (raw === null) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    // A corrupt entry is worthless; drop it so it can be rewritten.
    window.localStorage.removeItem(`${CACHE_PREFIX}${url}`);
    return null;
  }
}

export function writeCache<T>(url: string, data: T): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(`${CACHE_PREFIX}${url}`, JSON.stringify(data));
  } catch {
    // Quota exceeded (or storage disabled) — the cache is an optimisation, so
    // failing to write must never break the request that produced the data.
  }
}

/** Drop every cached response. Called on sign-out and on a 401. */
export function clearCache(): void {
  if (typeof window === 'undefined') return;

  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (key !== null && key.startsWith(CACHE_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => window.localStorage.removeItem(key));
}
