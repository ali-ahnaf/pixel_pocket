import { describe, it, expect, beforeEach, vi } from 'vitest';

// ApiClient builds its own axios instance in the constructor; hand it a stub so
// each test can decide what the transport does.
const requestMock = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
  default: { create: () => ({ request: requestMock }) },
}));

import ApiClient, { NetworkError } from './ApiClient';

/** An axios transport failure: the request never reached the server, so there is no `response`. */
const transportFailure = (): Error => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

/** An answered request that failed: the server responded, so `response` is set. */
const serverFailure = (status: number) => ({ response: { status, data: { message: 'Boom' } } });

describe('ApiClient offline behaviour', () => {
  let client: ApiClient;

  beforeEach(() => {
    window.localStorage.clear();
    requestMock.mockReset();
    client = new ApiClient('/api');
  });

  it('caches an allow-listed GET and serves it when the network is gone', async () => {
    const vaults = [{ id: 'vault-1', name: 'Main Stash' }];
    requestMock.mockResolvedValueOnce({ data: vaults });

    await expect(client.get('/users/user-1/vaults')).resolves.toEqual(vaults);

    requestMock.mockRejectedValueOnce(transportFailure());

    await expect(client.get('/users/user-1/vaults')).resolves.toEqual(vaults);
  });

  it('still throws on a server error, so a real failure is never masked by stale data', async () => {
    requestMock.mockResolvedValueOnce({ data: [{ id: 'vault-1' }] });
    await client.get('/users/user-1/vaults');

    requestMock.mockRejectedValueOnce(serverFailure(500));

    await expect(client.get('/users/user-1/vaults')).rejects.toEqual({ message: 'Boom' });
  });

  it('throws a NetworkError when the transport fails and nothing is cached', async () => {
    requestMock.mockRejectedValueOnce(transportFailure());

    await expect(client.get('/users/user-1/vaults')).rejects.toBeInstanceOf(NetworkError);
  });

  it('does not cache a GET outside the allow-list', async () => {
    requestMock.mockResolvedValueOnce({ data: [{ id: 'tx-1' }] });
    await client.get('/users/user-1/transactions?month=6&year=2026');

    requestMock.mockRejectedValueOnce(transportFailure());

    await expect(client.get('/users/user-1/transactions?month=6&year=2026')).rejects.toBeInstanceOf(NetworkError);
  });

  it('reports a transport failure on a write as a NetworkError so the caller can queue it', async () => {
    requestMock.mockRejectedValueOnce(transportFailure());

    await expect(client.post('/users/user-1/transactions', { amount: 12 })).rejects.toBeInstanceOf(NetworkError);
  });
});
