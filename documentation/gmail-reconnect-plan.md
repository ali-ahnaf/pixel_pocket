# Gmail reconnect on expired refresh token — plan

## Background

Every user brings their own Google client id/secret (`user_oauth_credentials`), so every
user's Google Cloud project sits in **Testing** publishing status. Google expires refresh
tokens issued by a Testing-status project after **7 days**. This is not an app-credential
problem — verified against the production snapshot on 2026-07-28:

```
[real refresh token]  400 invalid_grant  "Token has been expired or revoked."
[bogus refresh token] 400 invalid_grant  "Bad Request"
```

The bogus-token probe returned `invalid_grant`, not `invalid_client` — Google
authenticated the stored client id/secret before rejecting the token. The app credentials
are valid; only the user's refresh token is dead.

Observed timeline for `aliahnaf327@gmail.com`: connected 2026-07-20 ~16:00, last
successful refresh 2026-07-26 12:25, first failure 2026-07-28 13:29. The 7-day mark
(2026-07-27 16:00) falls inside the failure window.

**Current behaviour is the actual defect:** the dead refresh token stays in the DB, so
every Gmail push retries it, throws `AppError(502)`, and writes an ERROR log — forever,
with no signal to the user. Publishing status is the user's call; the reconnect path is
needed regardless, since a user revoking access hits the same dead end today.

## Goal

When a refresh fails with `invalid_grant`, clear the dead tokens and surface a
"reconnect Gmail" warning on the home page. Done when:

- a refresh returning `invalid_grant` leaves `googleRefreshTokenEncrypted` null and
  throws a 401 instead of a 502
- `GET /users/:userId/oauth-credentials` reports `reconnectRequired: true`
- the home page renders a dismissible-free warning linking to `/settings/google-oauth`
- `npm run test:api -- user-oauth-credential.service` passes

Explicitly **not** doing: no cron job, no reminder push, no new entity column, no
migration.

## Key design decision — no migration

`reconnectRequired` is derived from columns that already exist:

```ts
reconnectRequired = existing.googleEmail !== null && existing.googleRefreshTokenEncrypted === null
```

This is unambiguous because `disconnectGmail` already nulls `googleEmail` alongside the
tokens (`user-oauth-credential.service.ts:141`). So:

| state | googleEmail | refreshToken | meaning |
| --- | --- | --- | --- |
| never connected | null | null | `configured` only |
| connected | set | set | healthy |
| user disconnected | null | null | back to `configured` only |
| **token died** | **set** | **null** | **reconnect required** |

The expiry path must therefore keep `googleEmail` and the client id/secret, and clear
only the three token columns.

## Steps

Order matters: shared contract → API → rebuild shared → UI.

### 1. `packages/api/src/errors/app-error.ts`

Add an optional `code` so callers can branch on Google's machine-readable error instead
of string-matching the message.

```ts
readonly code?: string;
constructor(message: string, statusCode = 400, code?: string)
```

Optional third param — every existing call site is unaffected.

**Verify:** `npx tsc --noEmit -p packages/api`.

### 2. `packages/api/src/utils/google-oauth.util.ts`

In `postToken`, pass `data.error` through as the AppError code (one line, ~L80):

```ts
throw new AppError(`Google token request failed: ${reason}`, 502, data.error);
```

**Verify:** compiles; existing behaviour (message + 502) unchanged.

### 3. `packages/api/src/services/user-oauth-credential.service.ts`

**`refreshAccessToken`** — wrap only the `refreshTokens` call:

```ts
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
```

(try/catch in a *service* is fine — the CLAUDE.md ban is on routes.)

**`getStatus`** — add the derived field to the existing return:

```ts
reconnectRequired: existing.googleEmail !== null && existing.googleRefreshTokenEncrypted === null,
```

and `reconnectRequired: false` in the no-row early return.

**Verify:** `npm run test:api -- user-oauth-credential.service`.

### 4. `packages/shared/src/contracts/oauth-credentials.ts`

Add to `OAuthCredentialsStatusDto`:

```ts
/** True once a stored refresh token was rejected as expired/revoked: the client id and
 *  secret are still valid, but the user must re-run the consent flow. */
reconnectRequired: boolean;
```

**Verify:** `npm run build:shared`, then `npx tsc --noEmit -p packages/ui`.

### 5. `packages/api/src/services/gmail.service.ts`

In the `handlePushNotification` catch (~L206), demote the expected expiry case so a dead
token stops filling the log with ERROR on every push:

```ts
if (err instanceof AppError && err.statusCode === 401) {
  logger.warn('Gmail push skipped, connection expired', { userId: credential.userId });
} else {
  logger.error('Gmail push processing failed', { userId: credential.userId, err });
}
```

Swallow-and-2xx behaviour is unchanged.

**Verify:** `npm run test:api -- gmail.service`.

### 6. `packages/ui/src/components/GmailReconnectBanner.tsx` (new)

Self-fetching, returns `null` unless `reconnectRequired`. Mirrors `PendingExpensesPanel`
(`userId` prop, `profileApi` in a `useCallback` + `useEffect`, null render when nothing
to show).

```tsx
'use client';
// fetch profileApi.getOAuthCredentialsStatus(userId) -> if (!status.reconnectRequired) return null
// Card, AlertTriangle icon, Link href="/settings/google-oauth"
// copy: "Gmail disconnected — Google expired the connection. Reconnect to resume
//        importing bank alerts." + "Reconnect" link
```

Export from `packages/ui/src/components/index.ts` next to the other panels.

### 7. `packages/ui/src/app/page.tsx`

Two lines: add `GmailReconnectBanner` to the existing `@/components` import (L8), and
render it directly above `<PendingExpensesPanel userId={userId} />` (L361) — same slot,
same `userId`, so the warning sits with the other Gmail surface.

**Verify:** `npm run dev:ui`, load home as a user whose token is dead.

### 8. Tests

Extend `packages/api/src/tests/user-oauth-credential.service.test.ts` (`refreshAccessToken`
describe block, existing mock/factory conventions):

- `invalid_grant` → tokens nulled, `googleEmail` preserved, throws 401
- a non-`invalid_grant` failure → rethrown untouched, tokens preserved
- `getStatus` → `reconnectRequired` true only for email-set + refresh-token-null

**Verify:** `npm run test:api -- user-oauth-credential.service`.

### 9. Prettier

`npx prettier --write` every touched file.

## Files touched

| file | change |
| --- | --- |
| `packages/shared/src/contracts/oauth-credentials.ts` | +1 DTO field |
| `packages/api/src/errors/app-error.ts` | +1 optional ctor param |
| `packages/api/src/utils/google-oauth.util.ts` | +1 arg at the existing throw |
| `packages/api/src/services/user-oauth-credential.service.ts` | try/catch in `refreshAccessToken`, +1 field in `getStatus` |
| `packages/api/src/services/gmail.service.ts` | log-level branch in existing catch |
| `packages/ui/src/components/GmailReconnectBanner.tsx` | new (~40 lines) |
| `packages/ui/src/components/index.ts` | +1 export |
| `packages/ui/src/app/page.tsx` | +1 import symbol, +1 element |
| `packages/api/src/tests/user-oauth-credential.service.test.ts` | +3 cases |

No entity change, no migration, no new route, no new scheduler.

## Caveats

- **This is recovery, not prevention.** In Testing status the token still dies every 7
  days; the banner just makes it visible and one tap to fix. Flipping the OAuth consent
  screen to *In production* (unverified is fine — that only adds a warning interstitial
  and a 100-user cap for the restricted Gmail scope) removes the 7-day expiry entirely.
- **Immediate unblock for the affected user** is unrelated to this work: reconnect Gmail
  from `/settings/google-oauth`.
- `gmailWatchExpiry` is left as-is on expiry. The Gmail-side `users.watch` registration is
  bound to the mailbox rather than the token, so pushes resume on reconnect; if it lapsed
  meanwhile, `gmail-watch-scheduler.ts` renews it on its next daily pass.
- The settings page already keys off `connected`, which flips false the moment the tokens
  are cleared — so the existing reconnect button surfaces with no change there.
