import { Entity, PrimaryGeneratedColumn, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './User.entity';
import { Vault } from './Vault.entity';
import { BaseEntity } from './BaseEntity';

/**
 * Gmail bank-alert review queue. Stores only a pointer to a Gmail message —
 * `gmailMessageId` plus the matched watcher's `vaultId` and `guidanceHint` —
 * and the message `subject`, kept so the review list can identify an item
 * without a Gmail round-trip. The email body/content is never stored: it is
 * re-fetched from Gmail (via the user's OAuth token) on demand at parse time
 * and never persisted.
 *
 * A user can have many pending rows (unlike `UserAiCredential`), so `userId`
 * is not unique here. The `(userId, gmailMessageId)` unique index guards
 * idempotency alongside the `ProcessedGmailMessage` ledger — a replayed
 * message must not enqueue a second pending row.
 *
 * No `status` column: the row is soft-deleted (`BaseEntity.deletedAt`) on
 * resolve (parsed into a transaction) or dismiss.
 */
@Entity('pending_gmail_expenses')
@Index('IDX_pending_gmail_expense_user_message', ['userId', 'gmailMessageId'], { unique: true })
export class PendingGmailExpense extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  gmailMessageId: string;

  @Column({ type: 'varchar' })
  vaultId: string;

  /** Nullable: rows enqueued before the subject was captured have none. */
  @Column({ type: 'varchar', nullable: true })
  subject: string | null;

  @Column({ type: 'varchar', nullable: true })
  guidanceHint: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Vault, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vaultId' })
  vault: Vault;
}
