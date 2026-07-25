import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1784996635799 implements MigrationInterface {
    name = 'Migration1784996635799'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_expenses" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "title" varchar(200), "amount" decimal(10,2) NOT NULL DEFAULT (0), "type" varchar NOT NULL DEFAULT ('expense'), "date" date, "interval" varchar, "startDate" date, "endDate" date, "deletedAt" datetime, "vaultId" varchar, "sourceRecurringId" varchar, "createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), CONSTRAINT "FK_e0d76d9858620c98a05e7785ef7" FOREIGN KEY ("vaultId") REFERENCES "vaults" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, CONSTRAINT "FK_3d211de716f0f14ea7a8a4b1f2c" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_expenses"("id", "userId", "title", "amount", "type", "date", "interval", "startDate", "endDate", "deletedAt", "vaultId", "sourceRecurringId", "createdAt", "updatedAt") SELECT "id", "userId", "title", "amount", "type", "date", "interval", "startDate", "endDate", "deletedAt", "vaultId", "sourceRecurringId", "createdAt", "updatedAt" FROM "expenses"`);
        await queryRunner.query(`DROP TABLE "expenses"`);
        await queryRunner.query(`ALTER TABLE "temporary_expenses" RENAME TO "expenses"`);
        await queryRunner.query(`CREATE TABLE "temporary_user_preferences" ("createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "showIncome" boolean NOT NULL DEFAULT (0), "showExpense" boolean NOT NULL DEFAULT (0), "pushEnabled" boolean NOT NULL DEFAULT (0), CONSTRAINT "UQ_b6202d1cacc63a0b9c8dac2abd4" UNIQUE ("userId"), CONSTRAINT "FK_b6202d1cacc63a0b9c8dac2abd4" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_user_preferences"("createdAt", "updatedAt", "deletedAt", "id", "userId", "showIncome", "showExpense", "pushEnabled") SELECT "createdAt", "updatedAt", "deletedAt", "id", "userId", "showIncome", "showExpense", "pushEnabled" FROM "user_preferences"`);
        await queryRunner.query(`DROP TABLE "user_preferences"`);
        await queryRunner.query(`ALTER TABLE "temporary_user_preferences" RENAME TO "user_preferences"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_preferences" RENAME TO "temporary_user_preferences"`);
        await queryRunner.query(`CREATE TABLE "user_preferences" ("createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "showIncome" boolean NOT NULL DEFAULT (0), "showExpense" boolean NOT NULL DEFAULT (0), "pushEnabled" boolean NOT NULL DEFAULT (0), "puterModel" varchar, CONSTRAINT "UQ_b6202d1cacc63a0b9c8dac2abd4" UNIQUE ("userId"), CONSTRAINT "FK_b6202d1cacc63a0b9c8dac2abd4" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "user_preferences"("createdAt", "updatedAt", "deletedAt", "id", "userId", "showIncome", "showExpense", "pushEnabled") SELECT "createdAt", "updatedAt", "deletedAt", "id", "userId", "showIncome", "showExpense", "pushEnabled" FROM "temporary_user_preferences"`);
        await queryRunner.query(`DROP TABLE "temporary_user_preferences"`);
        await queryRunner.query(`ALTER TABLE "expenses" RENAME TO "temporary_expenses"`);
        await queryRunner.query(`CREATE TABLE "expenses" ("id" varchar PRIMARY KEY NOT NULL, "userId" varchar NOT NULL, "title" varchar(200), "amount" decimal(10,2) NOT NULL DEFAULT (0), "type" varchar NOT NULL DEFAULT ('expense'), "date" date, "interval" varchar, "startDate" date, "endDate" date, "deletedAt" datetime, "vaultId" varchar, "sourceRecurringId" varchar, "createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "isCommitted" boolean NOT NULL DEFAULT (1), CONSTRAINT "FK_e0d76d9858620c98a05e7785ef7" FOREIGN KEY ("vaultId") REFERENCES "vaults" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, CONSTRAINT "FK_3d211de716f0f14ea7a8a4b1f2c" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "expenses"("id", "userId", "title", "amount", "type", "date", "interval", "startDate", "endDate", "deletedAt", "vaultId", "sourceRecurringId", "createdAt", "updatedAt") SELECT "id", "userId", "title", "amount", "type", "date", "interval", "startDate", "endDate", "deletedAt", "vaultId", "sourceRecurringId", "createdAt", "updatedAt" FROM "temporary_expenses"`);
        await queryRunner.query(`DROP TABLE "temporary_expenses"`);
    }

}
