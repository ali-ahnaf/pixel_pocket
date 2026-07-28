export interface SetOAuthCredentialsInput {
  clientId: string;
  clientSecret: string;
}

/**
 * Status-only response. Never carries the decrypted client id/secret or tokens
 * back to the client — this resource is write-only from the UI's perspective.
 * `configured` = a client id/secret is stored; `connected` = the user has
 * completed the Gmail consent flow and a refresh token is held.
 */
export interface OAuthCredentialsStatusDto {
  configured: boolean;
  connected: boolean;
  googleEmail?: string;
  /**
   * True once a stored refresh token was rejected as expired/revoked: the client
   * id and secret are still valid, but the user must re-run the consent flow.
   */
  reconnectRequired: boolean;
}

/**
 * Response of the authorize endpoint: the Google consent URL the browser should
 * be redirected to, pre-built with the user's own client id and a signed state.
 */
export interface AuthorizeUrlDto {
  url: string;
}

/** A single Gmail label the user can pick for the bank-alert watch. */
export interface GmailLabelDto {
  id: string;
  name: string;
}

/**
 * Current Gmail push-watch state for the settings UI. `watching` is true while an
 * unexpired `users.watch` registration is held; `expiry` is its ISO deadline (the
 * renewal cron keeps it fresh); `labelIds` are the labels currently watched
 * (derived from the union of the user's per-vault watchers).
 */
export interface GmailWatchStatusDto {
  watching: boolean;
  expiry: string | null;
  labelIds: string[];
}
