/**
 * Dispatched on `window` by `OfflineSync` once the outbox has drained, so any
 * mounted page can refetch and replace its locally-built placeholder rows with
 * the real server rows.
 */
export const OFFLINE_SYNCED_EVENT = 'pp:offline-synced';
