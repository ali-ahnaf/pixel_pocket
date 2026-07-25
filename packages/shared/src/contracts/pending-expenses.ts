/**
 * Review queue for Gmail bank-alert matches. Only a pointer to the Gmail
 * message plus its subject line is persisted; the email body is re-fetched on
 * demand and never stored, since the AI parse now runs client-side with the
 * user's own key. `subject` is null for rows enqueued before it was captured.
 */
export interface PendingGmailExpenseDto {
  id: string;
  gmailMessageId: string;
  vaultId: string;
  vaultName: string;
  subject: string | null;
  guidanceHint: string | null;
}

/** Returned only by the on-demand re-fetch endpoint; never persisted. */
export interface PendingExpenseEmailDto {
  from: string;
  subject: string;
  bodyText: string;
  emailDate: string;
}
