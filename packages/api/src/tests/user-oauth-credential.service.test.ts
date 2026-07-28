import type { UserOAuthCredential } from '../entities/UserOAuthCredential.entity';
import type { UserOAuthCredentialRepository } from '../repositories/user-oauth-credential.repository';
import { UserOAuthCredentialService } from '../services/user-oauth-credential.service';
import { verifyOAuthState, signOAuthState } from '../utils/google-oauth.util';

jest.mock('../services', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// The mock encryption is reversible so tests can assert both that a value was
// encrypted before a write and decrypted correctly on a read.
jest.mock('../utils/oauth-credentials-encryption.util', () => ({
  encrypt: jest.fn((plaintext: string) => `encrypted(${plaintext})`),
  decrypt: jest.fn((ciphertext: string) => ciphertext.replace(/^encrypted\((.*)\)$/, '$1')),
}));

import { encrypt } from '../utils/oauth-credentials-encryption.util';

type UserOAuthCredentialRepositoryMock = jest.Mocked<Pick<UserOAuthCredentialRepository, 'findByUserId' | 'createEntity' | 'save'>>;

const buildCredential = (overrides: Partial<UserOAuthCredential> = {}): UserOAuthCredential =>
  ({
    id: 'cred-1',
    userId: 'user-1',
    googleClientIdEncrypted: 'encrypted(old-id)',
    googleClientSecretEncrypted: 'encrypted(old-secret)',
    googleAccessTokenEncrypted: null,
    googleRefreshTokenEncrypted: null,
    googleTokenExpiry: null,
    googleEmail: null,
    ...overrides,
  }) as UserOAuthCredential;

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

// A Google id_token is `header.payload.signature`; only the payload is read.
const buildIdToken = (payload: object): string => {
  const encode = (obj: object): string => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.sig`;
};

describe('UserOAuthCredentialService', () => {
  let credentials: UserOAuthCredentialRepositoryMock;
  let service: UserOAuthCredentialService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    credentials = {
      findByUserId: jest.fn(),
      createEntity: jest.fn((data) => data as UserOAuthCredential),
      save: jest.fn((c) => Promise.resolve(c as UserOAuthCredential)),
    };
    service = new UserOAuthCredentialService(credentials as unknown as UserOAuthCredentialRepository);

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('setCredentials', () => {
    it('creates a new row and encrypts both fields when none exists', async () => {
      credentials.findByUserId.mockResolvedValue(null);
      const saved = buildCredential();
      credentials.save.mockResolvedValue(saved);

      const result = await service.setCredentials('user-1', { clientId: 'client-id', clientSecret: 'client-secret' });

      expect(encrypt).toHaveBeenCalledWith('client-id');
      expect(encrypt).toHaveBeenCalledWith('client-secret');
      expect(credentials.createEntity).toHaveBeenCalledWith({
        userId: 'user-1',
        googleClientIdEncrypted: 'encrypted(client-id)',
        googleClientSecretEncrypted: 'encrypted(client-secret)',
      });
      expect(credentials.save).toHaveBeenCalledTimes(1);
      expect(result).toBe(saved);
    });

    it('overwrites the encrypted fields on an existing row', async () => {
      const existing = buildCredential();
      credentials.findByUserId.mockResolvedValue(existing);

      const result = await service.setCredentials('user-1', { clientId: 'new-id', clientSecret: 'new-secret' });

      expect(credentials.createEntity).not.toHaveBeenCalled();
      expect(credentials.save).toHaveBeenCalledTimes(1);
      expect(result.googleClientIdEncrypted).toBe('encrypted(new-id)');
      expect(result.googleClientSecretEncrypted).toBe('encrypted(new-secret)');
    });
  });

  describe('getStatus', () => {
    it('reports connected: false when a client is configured but no refresh token is held', async () => {
      credentials.findByUserId.mockResolvedValue(buildCredential());

      const result = await service.getStatus('user-1');

      expect(result).toEqual({ configured: true, connected: false, googleEmail: undefined, reconnectRequired: false });
    });

    it('reports connected: true with the email once tokens are stored', async () => {
      credentials.findByUserId.mockResolvedValue(buildCredential({ googleRefreshTokenEncrypted: 'encrypted(refresh-1)', googleEmail: 'me@example.com' }));

      const result = await service.getStatus('user-1');

      expect(result).toEqual({ configured: true, connected: true, googleEmail: 'me@example.com', reconnectRequired: false });
    });

    it('reports reconnectRequired: true when the email survived but the refresh token was dropped', async () => {
      credentials.findByUserId.mockResolvedValue(buildCredential({ googleRefreshTokenEncrypted: null, googleEmail: 'me@example.com' }));

      const result = await service.getStatus('user-1');

      expect(result).toEqual({ configured: true, connected: false, googleEmail: 'me@example.com', reconnectRequired: true });
    });

    it('returns configured: false when no row exists', async () => {
      credentials.findByUserId.mockResolvedValue(null);

      const result = await service.getStatus('user-1');

      expect(result).toEqual({ configured: false, connected: false, reconnectRequired: false });
    });
  });

  describe('getAuthorizeUrl', () => {
    it('builds a consent URL with the openid/email/gmail.readonly scopes and a verifiable state', async () => {
      credentials.findByUserId.mockResolvedValue(buildCredential());

      const { url } = await service.getAuthorizeUrl('user-1');
      const parsed = new URL(url);

      expect(parsed.searchParams.get('scope')).toBe('openid email https://www.googleapis.com/auth/gmail.readonly');
      expect(parsed.searchParams.get('client_id')).toBe('old-id');
      expect(parsed.searchParams.get('access_type')).toBe('offline');
      // The user id is recoverable from the signed state.
      expect(verifyOAuthState(parsed.searchParams.get('state')!)).toBe('user-1');
    });

    it('throws when no client is configured', async () => {
      credentials.findByUserId.mockResolvedValue(null);

      await expect(service.getAuthorizeUrl('user-1')).rejects.toThrow('Google OAuth client not configured');
    });
  });

  describe('handleOAuthCallback', () => {
    it('exchanges the code and stores encrypted tokens, expiry and email', async () => {
      const existing = buildCredential();
      credentials.findByUserId.mockResolvedValue(existing);
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          access_token: 'access-1',
          refresh_token: 'refresh-1',
          expires_in: 3600,
          id_token: buildIdToken({ email: 'me@example.com' }),
        }),
      );

      const state = signOAuthState('user-1');
      const result = await service.handleOAuthCallback('the-code', state);

      expect(result).toEqual({ userId: 'user-1' });
      expect(existing.googleAccessTokenEncrypted).toBe('encrypted(access-1)');
      expect(existing.googleRefreshTokenEncrypted).toBe('encrypted(refresh-1)');
      expect(existing.googleEmail).toBe('me@example.com');
      expect(existing.googleTokenExpiry).toBeInstanceOf(Date);
      expect(credentials.save).toHaveBeenCalledWith(existing);
    });

    it('rejects a tampered/invalid state before any token exchange', async () => {
      await expect(service.handleOAuthCallback('the-code', 'not-a-jwt')).rejects.toThrow('Invalid or expired OAuth state');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('refreshAccessToken', () => {
    it('posts grant_type=refresh_token, stores the new access token and keeps the refresh token when omitted', async () => {
      const existing = buildCredential({ googleRefreshTokenEncrypted: 'encrypted(refresh-1)', googleAccessTokenEncrypted: 'encrypted(old-access)' });
      credentials.findByUserId.mockResolvedValue(existing);
      fetchMock.mockResolvedValue(jsonResponse(200, { access_token: 'new-access', expires_in: 3600 }));

      const token = await service.refreshAccessToken('user-1');

      expect(token).toBe('new-access');
      const body = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
      expect(body).toContain('grant_type=refresh_token');
      expect(existing.googleAccessTokenEncrypted).toBe('encrypted(new-access)');
      expect(existing.googleRefreshTokenEncrypted).toBe('encrypted(refresh-1)');
    });

    it('throws when there is no stored refresh token', async () => {
      credentials.findByUserId.mockResolvedValue(buildCredential());

      await expect(service.refreshAccessToken('user-1')).rejects.toThrow('Gmail not connected');
    });

    it('drops the dead tokens and throws 401 when Google answers invalid_grant', async () => {
      const existing = buildCredential({
        googleAccessTokenEncrypted: 'encrypted(old-access)',
        googleRefreshTokenEncrypted: 'encrypted(refresh-1)',
        googleTokenExpiry: new Date(),
        googleEmail: 'me@example.com',
      });
      credentials.findByUserId.mockResolvedValue(existing);
      fetchMock.mockResolvedValue(jsonResponse(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }));

      await expect(service.refreshAccessToken('user-1')).rejects.toMatchObject({ statusCode: 401, message: 'Gmail connection expired, please reconnect' });

      expect(existing.googleAccessTokenEncrypted).toBeNull();
      expect(existing.googleRefreshTokenEncrypted).toBeNull();
      expect(existing.googleTokenExpiry).toBeNull();
      // Kept so getStatus can report reconnectRequired and the user need not re-enter the client.
      expect(existing.googleEmail).toBe('me@example.com');
      expect(existing.googleClientIdEncrypted).toBe('encrypted(old-id)');
      expect(credentials.save).toHaveBeenCalledWith(existing);
    });

    it('rethrows a non-invalid_grant failure and keeps the stored tokens', async () => {
      const existing = buildCredential({ googleAccessTokenEncrypted: 'encrypted(old-access)', googleRefreshTokenEncrypted: 'encrypted(refresh-1)' });
      credentials.findByUserId.mockResolvedValue(existing);
      fetchMock.mockResolvedValue(jsonResponse(500, { error: 'internal_failure' }));

      await expect(service.refreshAccessToken('user-1')).rejects.toMatchObject({ statusCode: 502 });

      expect(existing.googleAccessTokenEncrypted).toBe('encrypted(old-access)');
      expect(existing.googleRefreshTokenEncrypted).toBe('encrypted(refresh-1)');
      expect(credentials.save).not.toHaveBeenCalled();
    });
  });

  describe('authorizedGoogleFetch', () => {
    it('refreshes once on a 401 and retries the request with the fresh token', async () => {
      const existing = buildCredential({ googleAccessTokenEncrypted: 'encrypted(access-1)', googleRefreshTokenEncrypted: 'encrypted(refresh-1)' });
      credentials.findByUserId.mockResolvedValue(existing);

      fetchMock
        .mockResolvedValueOnce(jsonResponse(401, {})) // initial call rejected
        .mockResolvedValueOnce(jsonResponse(200, { access_token: 'fresh-access', expires_in: 3600 })) // token refresh
        .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // retry succeeds

      const response = await service.authorizedGoogleFetch('user-1', 'https://gmail.googleapis.com/x');

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      // The retry used the refreshed bearer token.
      const retryInit = fetchMock.mock.calls[2][1] as RequestInit;
      expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer fresh-access');
      expect(existing.googleAccessTokenEncrypted).toBe('encrypted(fresh-access)');
    });

    it('returns the first response untouched when it is not a 401', async () => {
      const existing = buildCredential({ googleAccessTokenEncrypted: 'encrypted(access-1)' });
      credentials.findByUserId.mockResolvedValue(existing);
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

      const response = await service.authorizedGoogleFetch('user-1', 'https://gmail.googleapis.com/x');

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnectGmail', () => {
    it('clears the tokens but keeps the client id/secret', async () => {
      const existing = buildCredential({
        googleAccessTokenEncrypted: 'encrypted(access-1)',
        googleRefreshTokenEncrypted: 'encrypted(refresh-1)',
        googleTokenExpiry: new Date(),
        googleEmail: 'me@example.com',
      });
      credentials.findByUserId.mockResolvedValue(existing);

      await service.disconnectGmail('user-1');

      expect(existing.googleAccessTokenEncrypted).toBeNull();
      expect(existing.googleRefreshTokenEncrypted).toBeNull();
      expect(existing.googleTokenExpiry).toBeNull();
      expect(existing.googleEmail).toBeNull();
      expect(existing.googleClientIdEncrypted).toBe('encrypted(old-id)');
      expect(credentials.save).toHaveBeenCalledWith(existing);
    });
  });
});
