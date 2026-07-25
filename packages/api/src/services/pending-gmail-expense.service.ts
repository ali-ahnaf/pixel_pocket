import { PendingGmailExpenseDto, PendingExpenseEmailDto } from '@expense-tracker/shared';
import { PendingGmailExpenseRepository, PendingGmailExpenseFields } from '../repositories/pending-gmail-expense.repository';
import { pendingGmailExpenseRepository } from '../repositories';
import { AppError } from '../errors/app-error';
import { UserOAuthCredentialService } from './user-oauth-credential.service';
import { GMAIL_API_BASE, GmailMessage } from './gmail.service';
import { extractMessageContent } from '../utils/gmail-message.util';
import { userOAuthCredentialService, logger } from '.';

/**
 * Business logic for the Gmail bank-alert review queue. The repository only
 * ever persists the pointer (`gmailMessageId` + `vaultId` + `subject` + `guidanceHint`);
 * the email body is re-fetched from Gmail through the user's OAuth token on
 * demand, here, and returned straight to the caller — it is never written to
 * the DB. `resolve` is the single soft-delete operation used both after a
 * successful client-side parse and on a user dismiss.
 */
export class PendingGmailExpenseService {
  constructor(
    private readonly pending: PendingGmailExpenseRepository = pendingGmailExpenseRepository,
    private readonly oauth: UserOAuthCredentialService = userOAuthCredentialService,
  ) {}

  async list(userId: string): Promise<PendingGmailExpenseDto[]> {
    const rows = await this.pending.findManyForUser(userId);
    return rows.map((row) => ({
      id: row.id,
      gmailMessageId: row.gmailMessageId,
      vaultId: row.vaultId,
      vaultName: row.vault?.name ?? 'Unknown vault',
      subject: row.subject ?? null,
      guidanceHint: row.guidanceHint,
    }));
  }

  /** Re-fetches the Gmail message body on demand for the client-side parse. Persists nothing. */
  async getEmail(userId: string, id: string): Promise<PendingExpenseEmailDto> {
    const row = await this.pending.findByIdForUser(userId, id);
    if (!row) throw new AppError('Pending expense not found', 404);

    const response = await this.oauth.authorizedGoogleFetch(userId, `${GMAIL_API_BASE}/messages/${row.gmailMessageId}?format=full`);
    if (!response.ok) throw new AppError(`Gmail messages.get failed: HTTP ${response.status}`, 502);

    const message = (await response.json()) as GmailMessage;
    const content = extractMessageContent(message);

    return {
      from: content.from,
      subject: content.subject,
      bodyText: content.bodyText,
      emailDate: content.emailDate ?? new Date().toISOString(),
    };
  }

  /** Soft-deletes the pending row, scoped to `userId`. Used both on successful parse and on dismiss. */
  async resolve(userId: string, id: string): Promise<void> {
    const row = await this.pending.findByIdForUser(userId, id);
    if (!row) throw new AppError('Pending expense not found', 404);

    await this.pending.softDelete(userId, id);
    logger.info('Resolved pending Gmail expense', { userId, id });
  }

  /** Idempotent enqueue of a matched watcher's pointer. Called by `GmailService.handleMessage`. */
  async enqueue(userId: string, fields: PendingGmailExpenseFields): Promise<void> {
    const created = await this.pending.insertIfNotExists(userId, fields);
    if (!created) return;

    logger.info('Enqueued pending Gmail expense', { userId, gmailMessageId: fields.gmailMessageId, vaultId: fields.vaultId });
  }
}
