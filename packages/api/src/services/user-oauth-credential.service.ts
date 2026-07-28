import { AuthorizeUrlDto, OAuthCredentialsStatusDto, SetOAuthCredentialsInput } from '@expense-tracker/shared';
import { UserOAuthCredential } from '../entities/UserOAuthCredential.entity';
import { UserOAuthCredentialRepository } from '../repositories/user-oauth-credential.repository';
import { userOAuthCredentialRepository } from '../repositories';
import { AppError } from '../errors/app-error';
import { decrypt, encrypt } from '../utils/oauth-credentials-encryption.util';
import { buildAuthorizeUrl, exchangeCodeForTokens, extractEmailFromIdToken, refreshTokens, signOAuthState, verifyOAuthState, type GoogleTokenResult } from '../utils/google-oauth.util';
import { logger } from '.';

export type { SetOAuthCredentialsInput };

/**
 * Business logic for per-user Google OAuth. The repository is a pure persistence
 * layer (never encrypts/decrypts), so this service is the only place `encrypt()`
 * / `decrypt()` is called around a read or write. It owns two things:
 *  - the client id/secret the user brings (write-only from the UI), and
 *  - the access/refresh tokens obtained after the user runs the consent flow.
 *
 * Reads decrypt only what they need: `getStatus` never decrypts anything, the
 * authorize/callback/refresh methods decrypt the specific fields they use.
 */
export class UserOAuthCredentialService {
  constructor(private readonly credentials: UserOAuthCredentialRepository = userOAuthCredentialRepository) {}

  async setCredentials(userId: string, input: SetOAuthCredentialsInput): Promise<UserOAuthCredential> {
    const googleClientIdEncrypted = encrypt(input.clientId);
    const googleClientSecretEncrypted = encrypt(input.clientSecret);

    const existing = await this.credentials.findByUserId(userId);
    if (existing) {
      existing.googleClientIdEncrypted = googleClientIdEncrypted;
      existing.googleClientSecretEncrypted = googleClientSecretEncrypted;
      const saved = await this.credentials.save(existing);
      logger.info('Updated Google OAuth credentials', { userId });
      return saved;
    }

    const created = this.credentials.createEntity({ userId, googleClientIdEncrypted, googleClientSecretEncrypted });
    const saved = await this.credentials.save(created);
    logger.info('Created Google OAuth credentials', { userId });
    return saved;
  }

  async getStatus(userId: string): Promise<OAuthCredentialsStatusDto> {
    const existing = await this.credentials.findByUserId(userId);
    if (!existing) return { configured: false, connected: false, reconnectRequired: false };
    return {
      configured: true,
      connected: existing.googleRefreshTokenEncrypted !== null,
      googleEmail: existing.googleEmail ?? undefined,
      // A kept email with no refresh token only happens when `refreshAccessToken`
      // dropped an expired/revoked token — `disconnectGmail` nulls both.
      reconnectRequired: existing.googleEmail !== null && existing.googleRefreshTokenEncrypted === null,
    };
  }

  /** Builds the Google consent URL for this user's own client id + a signed state. */
  async getAuthorizeUrl(userId: string): Promise<AuthorizeUrlDto> {
    const existing = await this.credentials.findByUserId(userId);
    if (!existing) throw new AppError('Google OAuth client not configured', 400);

    const clientId = decrypt(existing.googleClientIdEncrypted);
    const url = buildAuthorizeUrl({ clientId, state: signOAuthState(userId) });
    return { url };
  }

  /**
   * Handles the fixed-redirect callback: verifies the signed state to recover the
   * user id, exchanges the code for tokens using that user's own client, and
   * stores the tokens encrypted. Returns the user id so the route can redirect.
   */
  async handleOAuthCallback(code: string, state: string): Promise<{ userId: string }> {
    const userId = verifyOAuthState(state);

    const existing = await this.credentials.findByUserId(userId);
    if (!existing) throw new AppError('Google OAuth client not configured', 400);

    const clientId = decrypt(existing.googleClientIdEncrypted);
    const clientSecret = decrypt(existing.googleClientSecretEncrypted);

    const tokens = await exchangeCodeForTokens({ clientId, clientSecret, code });

    existing.googleAccessTokenEncrypted = encrypt(tokens.accessToken);
    if (tokens.refreshToken) existing.googleRefreshTokenEncrypted = encrypt(tokens.refreshToken);
    existing.googleTokenExpiry = new Date(Date.now() + tokens.expiresIn * 1000);
    existing.googleEmail = extractEmailFromIdToken(tokens.idToken) ?? existing.googleEmail;

    await this.credentials.save(existing);
    logger.info('Connected Gmail via OAuth callback', { userId });
    return { userId };
  }

  /**
   * Trades the stored refresh token for a fresh access token, persists it, and
   * returns the plaintext access token. Google may omit a new refresh token on
   * refresh, so the existing one is kept in that case.
   */
  async refreshAccessToken(userId: string): Promise<string> {
    const existing = await this.credentials.findByUserId(userId);
    if (!existing || !existing.googleRefreshTokenEncrypted) throw new AppError('Gmail not connected', 400);

    const clientId = decrypt(existing.googleClientIdEncrypted);
    const clientSecret = decrypt(existing.googleClientSecretEncrypted);
    const refreshToken = decrypt(existing.googleRefreshTokenEncrypted);

    let tokens: GoogleTokenResult;
    try {
      tokens = await refreshTokens({ clientId, clientSecret, refreshToken });
    } catch (err) {
      // Google answers invalid_grant when the refresh token is expired or revoked. It will
      // never succeed again, so drop it — keeping it makes every later push retry a dead
      // token. googleEmail and the client id/secret stay so getStatus can tell "expired"
      // apart from "never connected" and the user can re-consent without re-entering them.
      if (!(err instanceof AppError) || err.code !== 'invalid_grant') throw err;

      existing.googleAccessTokenEncrypted = null;
      existing.googleRefreshTokenEncrypted = null;
      existing.googleTokenExpiry = null;
      await this.credentials.save(existing);

      logger.warn('Google refresh token expired or revoked, reconnect required', { userId });
      throw new AppError('Gmail connection expired, please reconnect', 401);
    }

    existing.googleAccessTokenEncrypted = encrypt(tokens.accessToken);
    if (tokens.refreshToken) existing.googleRefreshTokenEncrypted = encrypt(tokens.refreshToken);
    existing.googleTokenExpiry = new Date(Date.now() + tokens.expiresIn * 1000);

    await this.credentials.save(existing);
    logger.info('Refreshed Google access token', { userId });
    return tokens.accessToken;
  }

  /**
   * Performs an authenticated Google API request on behalf of the user, applying
   * the refresh-on-401 strategy: use the stored access token; if Google answers
   * 401, refresh once and retry. Reused by the Gmail polling/history phase.
   */
  async authorizedGoogleFetch(userId: string, url: string, init: RequestInit = {}): Promise<Response> {
    const existing = await this.credentials.findByUserId(userId);
    if (!existing || !existing.googleAccessTokenEncrypted) throw new AppError('Gmail not connected', 400);

    const request = (accessToken: string): Promise<Response> => fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}` } });

    const response = await request(decrypt(existing.googleAccessTokenEncrypted));
    if (response.status !== 401) return response;

    logger.info('Google API returned 401, refreshing access token', { userId });
    const freshToken = await this.refreshAccessToken(userId);
    return request(freshToken);
  }

  /** Disconnects Gmail: clears the tokens but keeps the user's client id/secret. */
  async disconnectGmail(userId: string): Promise<void> {
    const existing = await this.credentials.findByUserId(userId);
    if (!existing) return;

    existing.googleAccessTokenEncrypted = null;
    existing.googleRefreshTokenEncrypted = null;
    existing.googleTokenExpiry = null;
    existing.googleEmail = null;

    await this.credentials.save(existing);
    logger.info('Disconnected Gmail', { userId });
  }
}
