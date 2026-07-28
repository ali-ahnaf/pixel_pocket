import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import '../env';
import { AppError } from '../errors/app-error';

/**
 * Pure Google OAuth2 helpers for the per-user Gmail flow. This module holds no
 * persistence and no encryption — callers (the service layer) decrypt the
 * user's stored client id/secret first and pass plaintext in here. Every user
 * brings their own OAuth client, but they all share one fixed redirect URI so a
 * single registered callback works for everyone; the user id is carried through
 * the flow in a signed `state` (see `signOAuthState`).
 */

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-prod';
const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:4000';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/** The single fixed redirect URI every user registers in their own Google app. */
export const GOOGLE_REDIRECT_URI = `${APP_BASE_URL}/api/oauth/google/callback`;

/**
 * Where the browser is sent after the callback finishes. In production the API
 * serves the UI from the same origin (so this equals APP_BASE_URL); in dev the
 * Next server runs on a different port, hence the separate override.
 */
export const WEB_BASE_URL = process.env.WEB_BASE_URL || APP_BASE_URL;

const STATE_TTL_SECONDS = 600; // 10 minutes — the consent round-trip is short.

interface OAuthStatePayload {
  userId: string;
  nonce: string;
}

/**
 * Signs a short-lived JWT that carries the user id through the OAuth redirect.
 * Doubles as CSRF protection: the callback rejects any `state` we didn't sign.
 */
export const signOAuthState = (userId: string): string => {
  const payload: OAuthStatePayload = { userId, nonce: crypto.randomBytes(16).toString('hex') };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: STATE_TTL_SECONDS });
};

/** Verifies a `state` produced by `signOAuthState`, returning the user id. */
export const verifyOAuthState = (state: string): string => {
  try {
    const decoded = jwt.verify(state, JWT_SECRET) as OAuthStatePayload;
    if (!decoded.userId) throw new Error('missing userId');
    return decoded.userId;
  } catch {
    throw new AppError('Invalid or expired OAuth state', 400);
  }
};

/** Builds the Google consent URL for the user's own client id. */
export const buildAuthorizeUrl = ({ clientId, state }: { clientId: string; state: string }): string => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: `openid email ${GMAIL_READONLY_SCOPE}`,
    access_type: 'offline', // ask for a refresh token
    prompt: 'consent', // force a refresh token on every authorization
    include_granted_scopes: 'true',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

export interface GoogleTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  idToken?: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
}

const postToken = async (body: Record<string, string>): Promise<GoogleTokenResult> => {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });

  const data = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!response.ok || !data.access_token) {
    const reason = data.error_description || data.error || `HTTP ${response.status}`;
    throw new AppError(`Google token request failed: ${reason}`, 502, data.error);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
    idToken: data.id_token,
  };
};

/** Exchanges an authorization code for access + refresh tokens. */
export const exchangeCodeForTokens = ({ clientId, clientSecret, code }: { clientId: string; clientSecret: string; code: string }): Promise<GoogleTokenResult> =>
  postToken({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

/** Trades a refresh token for a fresh access token (no new refresh token expected). */
export const refreshTokens = ({ clientId, clientSecret, refreshToken }: { clientId: string; clientSecret: string; refreshToken: string }): Promise<GoogleTokenResult> =>
  postToken({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

/**
 * Best-effort extraction of the email from a Google `id_token`. The token is a
 * JWT we just received directly from Google over TLS, so we read (not verify)
 * its payload purely to display "connected as". Returns undefined on any issue.
 */
export const extractEmailFromIdToken = (idToken?: string): string | undefined => {
  if (!idToken) return undefined;
  const parts = idToken.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { email?: string };
    return payload.email;
  } catch {
    return undefined;
  }
};
