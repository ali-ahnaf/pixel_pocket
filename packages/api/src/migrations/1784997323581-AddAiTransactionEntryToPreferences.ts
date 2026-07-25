import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `user_preferences.aiTransactionEntryEnabled`, which decides whether the
 * "log resource" modal opens on the AI prompt box or straight on the manual
 * transaction form. Defaults to 0 so existing users keep manual entry.
 *
 * SQLite can add a NOT NULL column with a constant default in place, but cannot
 * drop one — hence the temp-table rebuild in `down`.
 */
export class AddAiTransactionEntryToPreferences1784997323581 implements MigrationInterface {
  name = 'AddAiTransactionEntryToPreferences1784997323581';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_preferences" ADD COLUMN "aiTransactionEntryEnabled" boolean NOT NULL DEFAULT (0)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_user_preferences" ("createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "showIncome" boolean NOT NULL DEFAULT (0), "showExpense" boolean NOT NULL DEFAULT (0), "pushEnabled" boolean NOT NULL DEFAULT (0), CONSTRAINT "UQ_b6202d1cacc63a0b9c8dac2abd4" UNIQUE ("userId"), CONSTRAINT "FK_b6202d1cacc63a0b9c8dac2abd4" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_user_preferences"("createdAt", "updatedAt", "deletedAt", "id", "userId", "showIncome", "showExpense", "pushEnabled") SELECT "createdAt", "updatedAt", "deletedAt", "id", "userId", "showIncome", "showExpense", "pushEnabled" FROM "user_preferences"`,
    );
    await queryRunner.query(`DROP TABLE "user_preferences"`);
    await queryRunner.query(`ALTER TABLE "temporary_user_preferences" RENAME TO "user_preferences"`);
  }
}
