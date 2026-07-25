import { DataSource, Repository } from 'typeorm';
import { AppDataSource } from '../data-source';
import { PendingGmailExpense } from '../entities/PendingGmailExpense.entity';

/** Fields needed to enqueue a pointer — the subject line, never the email body/content. */
export interface PendingGmailExpenseFields {
  gmailMessageId: string;
  vaultId: string;
  subject: string | null;
  guidanceHint: string | null;
}

/**
 * Data-access layer for the Gmail bank-alert review queue. Only the pointer
 * columns (`gmailMessageId`, `vaultId`, `subject`, `guidanceHint`) are ever
 * read/written here — the email body is never persisted. The TypeORM repository is
 * resolved lazily per call so the class can be built before the DataSource
 * initializes and a different DataSource can be injected in tests.
 */
export class PendingGmailExpenseRepository {
  constructor(private readonly dataSource: DataSource = AppDataSource) {}

  private get repo(): Repository<PendingGmailExpense> {
    return this.dataSource.getRepository(PendingGmailExpense);
  }

  /** Lists a user's pending pointers with the `vault` relation loaded for the DTO's `vaultName`. */
  findManyForUser(userId: string): Promise<PendingGmailExpense[]> {
    return this.repo.find({ where: { userId }, relations: ['vault'], order: { createdAt: 'ASC' } });
  }

  findByIdForUser(userId: string, id: string): Promise<PendingGmailExpense | null> {
    return this.repo.findOne({ where: { userId, id } });
  }

  /**
   * Idempotent insert respecting the `(userId, gmailMessageId)` unique index:
   * the index counts soft-deleted rows too, so a prior (possibly resolved)
   * row for the same message must be detected before inserting rather than
   * relying on a caught constraint violation. Returns `null` when a row
   * already exists (enqueue is a no-op on replay).
   */
  async insertIfNotExists(userId: string, fields: PendingGmailExpenseFields): Promise<PendingGmailExpense | null> {
    const existing = await this.repo.findOne({ where: { userId, gmailMessageId: fields.gmailMessageId }, withDeleted: true });
    if (existing) return null;

    const created = this.repo.create({ userId, ...fields });
    return this.repo.save(created);
  }

  /** Soft-deletes the pending row, scoped to its owning user. */
  softDelete(userId: string, id: string): Promise<unknown> {
    return this.repo.softDelete({ id, userId });
  }
}
