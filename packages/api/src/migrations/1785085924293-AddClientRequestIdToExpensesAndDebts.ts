import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a nullable, unique `clientRequestId` to `expenses` and `debts`. Writes
 * queued while the client is offline carry this client-generated UUID so a
 * replay whose first attempt actually reached the server cannot insert a
 * duplicate row — the service returns the existing row instead.
 */
export class AddClientRequestIdToExpensesAndDebts1785085924293 implements MigrationInterface {
  name = 'AddClientRequestIdToExpensesAndDebts1785085924293';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "temporary_expenses" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "title" varchar(200), "amount" decimal(10,2) NOT NULL DEFAULT (0), "type" varchar NOT NULL DEFAULT ('expense'), "date" date, "interval" varchar, "startDate" date, "endDate" date, "deletedAt" datetime, "vaultId" varchar, "sourceRecurringId" varchar, "createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "clientRequestId" varchar, CONSTRAINT "UQ_f833020de04e8bcfbf00ac86cfe" UNIQUE ("clientRequestId"), CONSTRAINT "FK_3d211de716f0f14ea7a8a4b1f2c" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_e0d76d9858620c98a05e7785ef7" FOREIGN KEY ("vaultId") REFERENCES "vaults" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_expenses"("id", "userId", "title", "amount", "type", "date", "interval", "startDate", "endDate", "deletedAt", "vaultId", "sourceRecurringId", "createdAt", "updatedAt") SELECT "id", "userId", "title", "amount", "type", "date", "interval", "startDate", "endDate", "deletedAt", "vaultId", "sourceRecurringId", "createdAt", "updatedAt" FROM "expenses"`,
    );
    await queryRunner.query(`DROP TABLE "expenses"`);
    await queryRunner.query(`ALTER TABLE "temporary_expenses" RENAME TO "expenses"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_debts" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "title" varchar(200) NOT NULL, "amount" decimal(10,2) NOT NULL DEFAULT (0), "type" varchar NOT NULL DEFAULT ('expense'), "createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "notes" text, "completed" boolean NOT NULL DEFAULT (0), "dueDate" date, "clientRequestId" varchar, CONSTRAINT "UQ_14272a37ffc2934919cb0d2fe1b" UNIQUE ("clientRequestId"), CONSTRAINT "FK_834960a509c776eb841644a9bac" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_debts"("id", "userId", "title", "amount", "type", "createdAt", "updatedAt", "deletedAt", "notes", "completed", "dueDate") SELECT "id", "userId", "title", "amount", "type", "createdAt", "updatedAt", "deletedAt", "notes", "completed", "dueDate" FROM "debts"`,
    );
    await queryRunner.query(`DROP TABLE "debts"`);
    await queryRunner.query(`ALTER TABLE "temporary_debts" RENAME TO "debts"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "debts" RENAME TO "temporary_debts"`);
    await queryRunner.query(
      `CREATE TABLE "debts" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "title" varchar(200) NOT NULL, "amount" decimal(10,2) NOT NULL DEFAULT (0), "type" varchar NOT NULL DEFAULT ('expense'), "createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "notes" text, "completed" boolean NOT NULL DEFAULT (0), "dueDate" date, CONSTRAINT "FK_834960a509c776eb841644a9bac" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "debts"("id", "userId", "title", "amount", "type", "createdAt", "updatedAt", "deletedAt", "notes", "completed", "dueDate") SELECT "id", "userId", "title", "amount", "type", "createdAt", "updatedAt", "deletedAt", "notes", "completed", "dueDate" FROM "temporary_debts"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_debts"`);
    await queryRunner.query(`ALTER TABLE "expenses" RENAME TO "temporary_expenses"`);
    await queryRunner.query(
      `CREATE TABLE "expenses" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "title" varchar(200), "amount" decimal(10,2) NOT NULL DEFAULT (0), "type" varchar NOT NULL DEFAULT ('expense'), "date" date, "interval" varchar, "startDate" date, "endDate" date, "deletedAt" datetime, "vaultId" varchar, "sourceRecurringId" varchar, "createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), CONSTRAINT "FK_3d211de716f0f14ea7a8a4b1f2c" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_e0d76d9858620c98a05e7785ef7" FOREIGN KEY ("vaultId") REFERENCES "vaults" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "expenses"("id", "userId", "title", "amount", "type", "date", "interval", "startDate", "endDate", "deletedAt", "vaultId", "sourceRecurringId", "createdAt", "updatedAt") SELECT "id", "userId", "title", "amount", "type", "date", "interval", "startDate", "endDate", "deletedAt", "vaultId", "sourceRecurringId", "createdAt", "updatedAt" FROM "temporary_expenses"`,
    );
    await queryRunner.query(`DROP TABLE "temporary_expenses"`);
  }
}
