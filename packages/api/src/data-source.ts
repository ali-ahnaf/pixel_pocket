import 'reflect-metadata';
import './env';
import { DataSource } from 'typeorm';
import { User } from './entities/User.entity';
import { Expense } from './entities/Expense.entity';

import { Vault } from './entities/Vault.entity';
import { Tag } from './entities/Tag.entity';
import { TransactionTag } from './entities/TransactionTag.entity';
import { RecurringOccurrenceSkip } from './entities/RecurringOccurrenceSkip.entity';
import { Debt } from './entities/Debt.entity';
import { UserPreference } from './entities/UserPreference.entity';
import { UserOAuthCredential } from './entities/UserOAuthCredential.entity';
import { ProcessedGmailMessage } from './entities/ProcessedGmailMessage.entity';
import { VaultGmailWatcher } from './entities/VaultGmailWatcher.entity';
import { PushSubscription } from './entities/PushSubscription.entity';
import { UserAiCredential } from './entities/UserAiCredential.entity';
import { PendingGmailExpense } from './entities/PendingGmailExpense.entity';
import { Adventure } from './entities/AdventureEntity';
import { AdventureItem } from './entities/AdventureItemsEntity';

const isTsNode = !!(process as any)[Symbol.for('ts-node.register.instance')];

// Single source of truth for the SQLite file location. Consumed by the
// DataSource below and by the R2 backup scheduler.
export const DB_PATH = process.env.NODE_ENV === 'production' ? '/var/www/pocket_pixel/pocket_pixel.sqlite' : 'pocket_pixel.sqlite';

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: DB_PATH,
  entities: [
    User,
    Expense,
    Vault,
    Tag,
    TransactionTag,
    RecurringOccurrenceSkip,
    Debt,
    UserPreference,
    UserOAuthCredential,
    ProcessedGmailMessage,
    VaultGmailWatcher,
    PushSubscription,
    UserAiCredential,
    PendingGmailExpense,
    Adventure,
    AdventureItem
  ],
  migrations: [isTsNode ? 'src/migrations/*.ts' : 'dist/migrations/*.js'],
  synchronize: false,
  logging: false,
});
