import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the nullable `subject` column to `pending_gmail_expenses` so the review
 * queue can show what an email is without re-fetching it from Gmail. Existing
 * rows keep a NULL subject. SQLite cannot add a column to a table with foreign
 * keys in place without a rebuild, so the table is recreated the way TypeORM
 * generates it.
 */
export class AddSubjectToPendingGmailExpenses1784992988030 implements MigrationInterface {
  name = 'AddSubjectToPendingGmailExpenses1784992988030';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_pending_gmail_expense_user_message"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_pending_gmail_expenses" ("createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "gmailMessageId" varchar NOT NULL, "vaultId" varchar NOT NULL, "guidanceHint" varchar, "subject" varchar, CONSTRAINT "FK_d2e80eba39aa32b5c0649d348bc" FOREIGN KEY ("vaultId") REFERENCES "vaults" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_29a22dba6353508d809eb685bd8" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_pending_gmail_expenses"("createdAt", "updatedAt", "deletedAt", "id", "userId", "gmailMessageId", "vaultId", "guidanceHint") SELECT "createdAt", "updatedAt", "deletedAt", "id", "userId", "gmailMessageId", "vaultId", "guidanceHint" FROM "pending_gmail_expenses"`,
    );
    await queryRunner.query(`DROP TABLE "pending_gmail_expenses"`);
    await queryRunner.query(`ALTER TABLE "temporary_pending_gmail_expenses" RENAME TO "pending_gmail_expenses"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_pending_gmail_expense_user_message" ON "pending_gmail_expenses" ("userId", "gmailMessageId") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_pending_gmail_expense_user_message"`);
    await queryRunner.query(`ALTER TABLE "pending_gmail_expenses" RENAME TO "temporary_pending_gmail_expenses"`);
    await queryRunner.query(
      `CREATE TABLE "pending_gmail_expenses" ("createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "gmailMessageId" varchar NOT NULL, "vaultId" varchar NOT NULL, "guidanceHint" varchar, CONSTRAINT "FK_d2e80eba39aa32b5c0649d348bc" FOREIGN KEY ("vaultId") REFERENCES "vaults" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_29a22dba6353508d809eb685bd8" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "pending_gmail_expenses"("createdAt", "updatedAt", "deletedAt", "id", "userId", "gmailMessageId", "vaultId", "guidanceHint") SELECT "createdAt", "updatedAt", "deletedAt", "id", "userId", "gmailMessageId", "vaultId", "guidanceHint" FROM "temporary_pending_gmail_expenses"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_pending_gmail_expenses"`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_pending_gmail_expense_user_message" ON "pending_gmail_expenses" ("userId", "gmailMessageId") `);
  }
}
