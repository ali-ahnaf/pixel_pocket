import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1785269556024 implements MigrationInterface {
    name = 'Migration1785269556024'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "adventure_items" ("createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "id" varchar PRIMARY KEY NOT NULL, "adventureId" varchar NOT NULL, "name" varchar(100) NOT NULL, "amount" decimal(10,2) NOT NULL, "adventure_id" varchar)`);
        await queryRunner.query(`CREATE TABLE "adventures" ("createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "id" varchar PRIMARY KEY NOT NULL, "userId" varchar(100) NOT NULL, "name" varchar(100) NOT NULL, "description" varchar(255), "icon" varchar(100), "backgroundColor" varchar(50), "startDate" date, "EndDate" date, "isComplete" boolean)`);
        await queryRunner.query(`CREATE TABLE "temporary_adventure_items" ("createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "id" varchar PRIMARY KEY NOT NULL, "adventureId" varchar NOT NULL, "name" varchar(100) NOT NULL, "amount" decimal(10,2) NOT NULL, "adventure_id" varchar, CONSTRAINT "FK_34a4f04e234c7c8de167ce68a8a" FOREIGN KEY ("adventure_id") REFERENCES "adventures" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_adventure_items"("createdAt", "updatedAt", "deletedAt", "id", "adventureId", "name", "amount", "adventure_id") SELECT "createdAt", "updatedAt", "deletedAt", "id", "adventureId", "name", "amount", "adventure_id" FROM "adventure_items"`);
        await queryRunner.query(`DROP TABLE "adventure_items"`);
        await queryRunner.query(`ALTER TABLE "temporary_adventure_items" RENAME TO "adventure_items"`);
        await queryRunner.query(`CREATE TABLE "temporary_adventures" ("createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "id" varchar PRIMARY KEY NOT NULL, "userId" varchar(100) NOT NULL, "name" varchar(100) NOT NULL, "description" varchar(255), "icon" varchar(100), "backgroundColor" varchar(50), "startDate" date, "EndDate" date, "isComplete" boolean, CONSTRAINT "FK_e744bb588bcc9e882914ce98aff" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_adventures"("createdAt", "updatedAt", "deletedAt", "id", "userId", "name", "description", "icon", "backgroundColor", "startDate", "EndDate", "isComplete") SELECT "createdAt", "updatedAt", "deletedAt", "id", "userId", "name", "description", "icon", "backgroundColor", "startDate", "EndDate", "isComplete" FROM "adventures"`);
        await queryRunner.query(`DROP TABLE "adventures"`);
        await queryRunner.query(`ALTER TABLE "temporary_adventures" RENAME TO "adventures"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "adventures" RENAME TO "temporary_adventures"`);
        await queryRunner.query(`CREATE TABLE "adventures" ("createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "id" varchar PRIMARY KEY NOT NULL, "userId" varchar(100) NOT NULL, "name" varchar(100) NOT NULL, "description" varchar(255), "icon" varchar(100), "backgroundColor" varchar(50), "startDate" date, "EndDate" date, "isComplete" boolean)`);
        await queryRunner.query(`INSERT INTO "adventures"("createdAt", "updatedAt", "deletedAt", "id", "userId", "name", "description", "icon", "backgroundColor", "startDate", "EndDate", "isComplete") SELECT "createdAt", "updatedAt", "deletedAt", "id", "userId", "name", "description", "icon", "backgroundColor", "startDate", "EndDate", "isComplete" FROM "temporary_adventures"`);
        await queryRunner.query(`DROP TABLE "temporary_adventures"`);
        await queryRunner.query(`ALTER TABLE "adventure_items" RENAME TO "temporary_adventure_items"`);
        await queryRunner.query(`CREATE TABLE "adventure_items" ("createdAt" datetime DEFAULT (datetime('now')), "updatedAt" datetime DEFAULT (datetime('now')), "deletedAt" datetime, "id" varchar PRIMARY KEY NOT NULL, "adventureId" varchar NOT NULL, "name" varchar(100) NOT NULL, "amount" decimal(10,2) NOT NULL, "adventure_id" varchar)`);
        await queryRunner.query(`INSERT INTO "adventure_items"("createdAt", "updatedAt", "deletedAt", "id", "adventureId", "name", "amount", "adventure_id") SELECT "createdAt", "updatedAt", "deletedAt", "id", "adventureId", "name", "amount", "adventure_id" FROM "temporary_adventure_items"`);
        await queryRunner.query(`DROP TABLE "temporary_adventure_items"`);
        await queryRunner.query(`DROP TABLE "adventures"`);
        await queryRunner.query(`DROP TABLE "adventure_items"`);
    }

}
