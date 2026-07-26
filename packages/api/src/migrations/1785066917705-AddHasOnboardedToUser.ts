import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `users.hasOnboarded`, the server-side record of whether the user has
 * finished (or skipped) the onboarding walkthrough. Previously this lived in
 * localStorage, so the tour reappeared on every new device/browser.
 *
 * Defaults to 0 so existing users are shown the walkthrough once.
 *
 * SQLite can add a NOT NULL column with a constant default in place, but cannot
 * drop one — hence the temp-table rebuild in `down`.
 */
export class AddHasOnboardedToUser1785066917705 implements MigrationInterface {
  name = 'AddHasOnboardedToUser1785066917705';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN "hasOnboarded" boolean NOT NULL DEFAULT (0)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" RENAME TO "temporary_users"`);
    await queryRunner.query(
      `CREATE TABLE "users" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar(100) NOT NULL, "email" varchar(255) NOT NULL, "avatar" varchar(255) NOT NULL DEFAULT (''), "password" varchar(255), "createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "disableAiPrompt" boolean NOT NULL DEFAULT (0), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"))`,
    );
    await queryRunner.query(
      `INSERT INTO "users"("id", "name", "email", "avatar", "password", "createdAt", "updatedAt", "deletedAt", "disableAiPrompt") SELECT "id", "name", "email", "avatar", "password", "createdAt", "updatedAt", "deletedAt", "disableAiPrompt" FROM "temporary_users"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_users"`);
  }
}
