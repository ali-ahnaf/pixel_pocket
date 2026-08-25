import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import { clearCache, isCacheable, readCache, writeCache } from './cache';

describe('offline cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isCacheable', () => {
    it('accepts only the allow-listed reference GETs', () => {
      expect(isCacheable('/api/users/user-1/tags')).toBe(true);
      expect(isCacheable('/api/users/user-1/vaults')).toBe(true);
      expect(isCacheable('/api/users/user-1/debts')).toBe(true);
      expect(isCacheable('/api/users/user-1/debts?status=incomplete')).toBe(true);
    });

    it('rejects everything else, including transaction history and nested tag routes', () => {
      expect(isCacheable('/api/users/user-1/transactions?month=6&year=2026')).toBe(false);
      expect(isCacheable('/api/users/user-1/tags/tag-1')).toBe(false);
      expect(isCacheable('/api/users/user-1/recurring')).toBe(false);
      expect(isCacheable('/api/users/user-1/ai-credentials')).toBe(false);
    });
  });

  it('round-trips a payload and namespaces the storage key', () => {
    writeCache('/api/users/user-1/tags', [{ id: 'tag-1', name: 'FOOD' }]);

    expect(readCache('/api/users/user-1/tags')).toEqual([{ id: 'tag-1', name: 'FOOD' }]);
    expect(window.localStorage.getItem('pp_cache:/api/users/user-1/tags')).not.toBeNull();
  });

  it('returns null for a url that was never cached', () => {
    expect(readCache('/api/users/user-1/vaults')).toBeNull();
  });

  it('drops a corrupt entry instead of throwing', () => {
    window.localStorage.setItem('pp_cache:/api/users/user-1/vaults', '{not json');

    expect(readCache('/api/users/user-1/vaults')).toBeNull();
    expect(window.localStorage.getItem('pp_cache:/api/users/user-1/vaults')).toBeNull();
  });

  it('swallows a quota error so the request that produced the data still succeeds', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    expect(() => writeCache('/api/users/user-1/tags', [1, 2, 3])).not.toThrow();
  });

  it('clears only its own keys', () => {
    writeCache('/api/users/user-1/tags', ['cached']);
    window.localStorage.setItem('pocket_pixel_profile', '{"id":"user-1"}');

    clearCache();

    expect(readCache('/api/users/user-1/tags')).toBeNull();
    expect(window.localStorage.getItem('pocket_pixel_profile')).toBe('{"id":"user-1"}');
  });
});
