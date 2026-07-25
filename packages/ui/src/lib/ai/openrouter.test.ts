import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchUsage } from './openrouter';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe('fetchUsage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('merges per-key usage with account-wide credits', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/key')) {
        return jsonResponse({ data: { label: 'pocket-pixel', usage: 1.25, limit: 10, limit_remaining: 8.75, is_free_tier: false } });
      }
      return jsonResponse({ data: { total_credits: 20, total_usage: 4.5 } });
    });

    const usage = await fetchUsage('sk-or-test');

    expect(usage).toEqual({
      label: 'pocket-pixel',
      keyUsage: 1.25,
      keyLimit: 10,
      keyLimitRemaining: 8.75,
      isFreeTier: false,
      totalCredits: 20,
      totalUsage: 4.5,
    });

    const [keyUrl, keyInit] = fetchMock.mock.calls[0];
    expect(String(keyUrl)).toBe('https://openrouter.ai/api/v1/key');
    expect((keyInit?.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test');
  });

  it('falls back to null totals when the credits endpoint fails', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).endsWith('/key')) {
        return jsonResponse({ data: { label: 'pocket-pixel', usage: 0, limit: null, limit_remaining: null, is_free_tier: true } });
      }
      return jsonResponse({ error: { message: 'no access' } }, false, 403);
    });

    const usage = await fetchUsage('sk-or-test');

    expect(usage.totalCredits).toBeNull();
    expect(usage.totalUsage).toBeNull();
    expect(usage.keyLimit).toBeNull();
    expect(usage.isFreeTier).toBe(true);
  });

  it("surfaces OpenRouter's error message when the key endpoint fails", async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).endsWith('/key')) {
        return jsonResponse({ error: { message: 'No auth credentials found' } }, false, 401);
      }
      return jsonResponse({ data: {} });
    });

    await expect(fetchUsage('bad-key')).rejects.toThrow('No auth credentials found');
  });
});
