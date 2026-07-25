import '../env';
import { GmailLabelDto, GmailWatchStatusDto } from '@expense-tracker/shared';
import { AppError } from '../errors/app-error';
import { UserOAuthCredential } from '../entities/UserOAuthCredential.entity';
import { UserOAuthCredentialRepository } from '../repositories/user-oauth-credential.repository';
import { ProcessedGmailMessageRepository } from '../repositories/processed-gmail-message.repository';
import { VaultGmailWatchersRepository } from '../repositories/vault-gmail-watchers.repository';
import { VaultsRepository } from '../repositories/vaults.repository';
import { userOAuthCredentialRepository, processedGmailMessageRepository, vaultGmailWatchersRepository, vaultsRepository } from '../repositories';
import { UserOAuthCredentialService } from './user-oauth-credential.service';
import { PendingGmailExpenseService } from './pending-gmail-expense.service';
import { PushService } from './push.service';
import { PubSubNotification } from '../utils/gmail-webhook.util';
import { extractMessageContent } from '../utils/gmail-message.util';
import { userOAuthCredentialService, pendingGmailExpenseService, pushService, logger } from '.';

/** Base for all `users.me` Gmail REST calls; reused by the history-diff phase. */
export const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/** How many recent messages to re-baseline from when the stored historyId is too old. */
const HISTORY_FALLBACK_LIMIT = 25;

/** A single MIME node of a Gmail message payload (headers + inline/base64 body). */
export interface GmailMessagePart {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

/** A `format=full` Gmail message. Only the fields the parsers read are typed. */
export interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

interface GmailHistoryResponse {
  history?: { messagesAdded?: { message?: { id?: string } }[] }[];
  nextPageToken?: string;
  historyId?: string;
}

interface GmailWatchResponse {
  /** The mailbox's current history id — the baseline the first diff runs from. */
  historyId?: string;
  /** When the watch lapses, as epoch milliseconds in a string (~7 days out). */
  expiration?: string;
}

/**
 * Gmail push-notification lifecycle. Every Gmail API call goes through
 * `authorizedGoogleFetch` (bearer + refresh-on-401), and all token
 * encrypt/decrypt stays inside `UserOAuthCredentialService` — this service only
 * touches the plaintext watch-bookkeeping columns (`gmailHistoryId`,
 * `gmailWatchExpiry`) via the repository. The watched-label set is derived from
 * the user's `VaultGmailWatcher` rows, and a matching message is enqueued as a
 * `PendingGmailExpense` pointer via `PendingGmailExpenseService` — no email body
 * is stored and no AI runs server-side; the user parses it client-side later,
 * with their own OpenRouter key.
 */
export class GmailService {
  constructor(
    private readonly oauth: UserOAuthCredentialService = userOAuthCredentialService,
    private readonly credentials: UserOAuthCredentialRepository = userOAuthCredentialRepository,
    private readonly processedMessages: ProcessedGmailMessageRepository = processedGmailMessageRepository,
    private readonly watchers: VaultGmailWatchersRepository = vaultGmailWatchersRepository,
    private readonly pendingExpenses: PendingGmailExpenseService = pendingGmailExpenseService,
    private readonly vaults: VaultsRepository = vaultsRepository,
    private readonly push: PushService = pushService,
  ) {}

  /** The user's watched-label set: the de-duplicated union of their watcher labels. */
  private async getWatchedLabelIds(userId: string): Promise<string[]> {
    const watchers = await this.watchers.findManyForUser(userId);
    return [...new Set(watchers.map((watcher) => watcher.gmailLabelId))];
  }

  /** Lists the user's Gmail labels so the settings UI can offer a picker. */
  async listLabels(userId: string): Promise<GmailLabelDto[]> {
    const response = await this.oauth.authorizedGoogleFetch(userId, `${GMAIL_API_BASE}/labels`);
    if (!response.ok) throw new AppError(`Gmail labels request failed: HTTP ${response.status}`, 502);

    const data = (await response.json()) as { labels?: { id?: string; name?: string }[] };
    return (data.labels ?? [])
      .filter((label): label is { id: string; name: string } => typeof label.id === 'string' && typeof label.name === 'string')
      .map((label) => ({ id: label.id, name: label.name }));
  }

  /** Current watch state for the settings UI (watching + expiry + watched labels). */
  async getWatchStatus(userId: string): Promise<GmailWatchStatusDto> {
    const credential = await this.credentials.findByUserId(userId);
    const expiry = credential?.gmailWatchExpiry ?? null;
    return {
      watching: !!expiry && expiry.getTime() > Date.now(),
      expiry: expiry ? expiry.toISOString() : null,
      labelIds: await this.getWatchedLabelIds(userId),
    };
  }

  /**
   * Re-syncs the single mailbox watch with the derived label union after a
   * watcher is created, updated or removed. A non-empty union (re)starts the
   * watch; an empty union stops any live watch. Called by `VaultWatchersService`.
   */
  async resyncWatch(userId: string): Promise<void> {
    const labelIds = await this.getWatchedLabelIds(userId);
    if (labelIds.length === 0) {
      const credential = await this.credentials.findByUserId(userId);
      if (credential?.gmailWatchExpiry) await this.stopWatch(userId);
      return;
    }
    await this.startWatch(userId);
  }

  /**
   * Registers a Gmail `users.watch` on the user's watched label union, pointing
   * at the app-owned Pub/Sub topic. Persists the returned `historyId` (diff
   * baseline) and `expiration` (renewal deadline) so the webhook and the daily
   * renewal cron can pick them up.
   */
  async startWatch(userId: string): Promise<{ historyId: string; expiry: Date }> {
    const credential = await this.credentials.findByUserId(userId);
    if (!credential) throw new AppError('Google OAuth client not configured', 400);

    const labelIds = await this.getWatchedLabelIds(userId);
    if (labelIds.length === 0) throw new AppError('Attach at least one Gmail label to a vault to watch', 400);

    const topicName = process.env.GMAIL_PUBSUB_TOPIC;
    if (!topicName) throw new AppError('Gmail Pub/Sub topic is not configured', 500);

    // Backfill the connected mailbox address so push notifications can route back
    // to this user by `emailAddress`. Sourced from the Gmail profile (not the
    // id_token) so it stays correct even when the OAuth scopes omit `openid email`.
    const profileResponse = await this.oauth.authorizedGoogleFetch(userId, `${GMAIL_API_BASE}/profile`);
    if (!profileResponse.ok) throw new AppError(`Gmail profile request failed: HTTP ${profileResponse.status}`, 502);
    const profile = (await profileResponse.json()) as { emailAddress?: string };
    if (profile.emailAddress) credential.googleEmail = profile.emailAddress;

    const response = await this.oauth.authorizedGoogleFetch(userId, `${GMAIL_API_BASE}/watch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicName, labelIds, labelFilterBehavior: 'INCLUDE' }),
    });

    const data = (await response.json().catch(() => ({}))) as GmailWatchResponse;
    if (!response.ok || !data.historyId || !data.expiration) {
      throw new AppError(`Gmail watch request failed: HTTP ${response.status}`, 502);
    }

    credential.gmailHistoryId = data.historyId;
    credential.gmailWatchExpiry = new Date(Number(data.expiration));
    await this.credentials.save(credential);

    logger.info('Started Gmail watch', { userId, expiry: credential.gmailWatchExpiry.toISOString() });
    return { historyId: data.historyId, expiry: credential.gmailWatchExpiry };
  }

  /**
   * Stops the active Gmail watch and clears the local expiry so the renewal cron
   * skips this user. A 404 (no active watch) is treated as already-stopped.
   */
  async stopWatch(userId: string): Promise<void> {
    const credential = await this.credentials.findByUserId(userId);
    if (!credential) return;

    const response = await this.oauth.authorizedGoogleFetch(userId, `${GMAIL_API_BASE}/stop`, { method: 'POST' });
    if (!response.ok && response.status !== 404) {
      throw new AppError(`Gmail stop request failed: HTTP ${response.status}`, 502);
    }

    credential.gmailWatchExpiry = null;
    await this.credentials.save(credential);
    logger.info('Stopped Gmail watch', { userId });
  }

  /**
   * Entry point for a verified Pub/Sub push. Routes the notification to its user
   * by connected Gmail address, ignores anything not strictly newer than the
   * stored baseline, then runs the history diff and advances `gmailHistoryId`
   * only once processing succeeds. Never throws for processing failures — the
   * webhook must ack (2xx) or Pub/Sub retries; the processed-message ledger keeps
   * replays idempotent.
   */
  async handlePushNotification(notification: PubSubNotification): Promise<void> {
    const credential = await this.credentials.findByGoogleEmail(notification.emailAddress);
    if (!credential) {
      logger.info('Gmail push for unknown mailbox, dropping', { emailAddress: notification.emailAddress });
      return;
    }

    const incoming = Number(notification.historyId);
    const stored = credential.gmailHistoryId ? Number(credential.gmailHistoryId) : 0;
    if (!Number.isFinite(incoming) || incoming <= stored) {
      logger.debug('Gmail push historyId not newer than stored, skipping', { userId: credential.userId, incoming, stored });
      return;
    }

    try {
      await this.processHistory(credential, credential.gmailHistoryId);
      credential.gmailHistoryId = notification.historyId;
      await this.credentials.save(credential);
    } catch (err) {
      logger.error('Gmail push processing failed', { userId: credential.userId, err });
      // Swallowed on purpose: a non-2xx would trigger a Pub/Sub retry storm; the
      // next push re-diffs from the un-advanced baseline and the ledger dedupes.
    }
  }

  /**
   * Diffs the mailbox from `startHistoryId` forward: collects the ids of messages
   * added under the watched labels, fetches each in full, and hands them to the
   * parser/transaction step. A null baseline means the watch was just started and
   * there is nothing to diff yet.
   */
  private async processHistory(credential: UserOAuthCredential, startHistoryId: string | null): Promise<void> {
    if (!startHistoryId) return;

    const labelIds = await this.getWatchedLabelIds(credential.userId);
    if (labelIds.length === 0) return;

    const messageIds = await this.collectAddedMessageIds(credential.userId, startHistoryId, labelIds);
    if (messageIds.length === 0) return;

    const messages = await this.fetchMessages(credential.userId, messageIds);
    for (const message of messages) {
      await this.handleMessage(credential.userId, message);
    }
  }

  /**
   * Walks the History API from `startHistoryId` for each watched label, paging to
   * the end, and returns the de-duplicated set of added message ids. If Gmail
   * reports the stored history id as too old (404), falls back to a bounded list
   * of the label's most recent messages so the pipeline re-baselines instead of
   * silently losing mail.
   */
  private async collectAddedMessageIds(userId: string, startHistoryId: string, labelIds: string[]): Promise<string[]> {
    const ids = new Set<string>();

    for (const labelId of labelIds) {
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({ startHistoryId, historyTypes: 'messageAdded', labelId });
        if (pageToken) params.set('pageToken', pageToken);

        const response = await this.oauth.authorizedGoogleFetch(userId, `${GMAIL_API_BASE}/history?${params.toString()}`);
        if (response.status === 404) {
          const recent = await this.listRecentMessageIds(userId, labelId);
          recent.forEach((id) => ids.add(id));
          pageToken = undefined;
          break;
        }
        if (!response.ok) throw new AppError(`Gmail history request failed: HTTP ${response.status}`, 502);

        const data = (await response.json()) as GmailHistoryResponse;
        for (const record of data.history ?? []) {
          for (const added of record.messagesAdded ?? []) {
            if (added.message?.id) ids.add(added.message.id);
          }
        }
        pageToken = data.nextPageToken;
      } while (pageToken);
    }

    return [...ids];
  }

  /** Bounded `messages.list` by label, used to re-baseline after a too-old historyId. */
  private async listRecentMessageIds(userId: string, labelId: string, limit = HISTORY_FALLBACK_LIMIT): Promise<string[]> {
    const params = new URLSearchParams({ labelIds: labelId, maxResults: String(limit) });
    const response = await this.oauth.authorizedGoogleFetch(userId, `${GMAIL_API_BASE}/messages?${params.toString()}`);
    if (!response.ok) throw new AppError(`Gmail messages.list failed: HTTP ${response.status}`, 502);

    const data = (await response.json()) as { messages?: { id?: string }[] };
    return (data.messages ?? []).map((m) => m.id).filter((id): id is string => typeof id === 'string');
  }

  /**
   * Fetches each message in full. A bank-alert push carries only a handful of new
   * messages, so a bounded parallel fan-out of `format=full` GETs gives the same
   * round-trip savings as Gmail's multipart batch endpoint with far less parsing
   * fragility. Swap in a real `/batch/gmail/v1` call if per-push volume grows.
   */
  private async fetchMessages(userId: string, messageIds: string[]): Promise<GmailMessage[]> {
    const results = await Promise.all(messageIds.map((id) => this.fetchMessage(userId, id)));
    return results.filter((m): m is GmailMessage => m !== null);
  }

  private async fetchMessage(userId: string, id: string): Promise<GmailMessage | null> {
    const response = await this.oauth.authorizedGoogleFetch(userId, `${GMAIL_API_BASE}/messages/${id}?format=full`);
    if (response.status === 404) return null;
    if (!response.ok) throw new AppError(`Gmail messages.get failed: HTTP ${response.status}`, 502);
    const result = (await response.json()) as GmailMessage;
    return result;
  }

  /**
   * Turns one fetched Gmail message into a pending review item, idempotently: a
   * message already in the ledger is skipped **before any work**, so a Pub/Sub
   * replay never double-enqueues. The message is matched to a vault watcher by
   * label **and subject**; on a match, only a pointer (`gmailMessageId` +
   * `vaultId` + `subject` + `guidanceHint`) is enqueued via `PendingGmailExpenseService` — no
   * email body is stored and no AI runs server-side (the email is re-fetched and
   * parsed client-side, with the user's own OpenRouter key, when they review the
   * pending item). No matching watcher falls straight through to `record` so the
   * message isn't re-processed.
   */
  private async handleMessage(userId: string, message: GmailMessage): Promise<void> {
    if (await this.processedMessages.exists(userId, message.id)) return;

    const content = extractMessageContent(message);
    const watcher = await this.matchWatcher(userId, message.labelIds ?? [], content.subject);
    if (watcher) {
      await this.pendingExpenses.enqueue(userId, {
        gmailMessageId: message.id,
        vaultId: watcher.vaultId,
        subject: content.subject || null,
        guidanceHint: watcher.guidanceHint,
      });

      const vault = await this.vaults.findOneForUser(userId, watcher.vaultId);
      await this.push.notify(userId, {
        title: 'Pending expense to review',
        body: `A new email in ${vault?.name ?? 'your vault'} is ready to review`,
        url: '/transactions',
      });
    }

    await this.processedMessages.record(userId, message.id);
  }

  /**
   * The vault watcher to fire for a message, matched by label + subject. A label
   * may be shared across vaults, so among the watchers whose `gmailLabelId` is on
   * the message the subject disambiguates: a watcher with a `subjectFilter`
   * matches only when the subject contains it (case-insensitive); a watcher
   * without one is a catch-all for its label. A specific subject match wins over a
   * catch-all, and within each group the earliest-created watcher wins
   * deterministically (rows come back in `createdAt` order).
   */
  private async matchWatcher(userId: string, labelIds: string[], subject: string): Promise<{ vaultId: string; guidanceHint: string | null } | null> {
    if (labelIds.length === 0) return null;
    const watchers = await this.watchers.findManyForUser(userId);
    const candidates = watchers.filter((watcher) => labelIds.includes(watcher.gmailLabelId));
    if (candidates.length === 0) return null;

    const subjectLower = subject.toLowerCase();
    const specific = candidates.find((watcher) => watcher.subjectFilter && subjectLower.includes(watcher.subjectFilter.toLowerCase()));
    return specific ?? candidates.find((watcher) => !watcher.subjectFilter) ?? null;
  }
}
