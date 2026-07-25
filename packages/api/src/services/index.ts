import { UtilService } from './util.service';
import { Logger } from './logger.service';
import { TransactionsService } from './transactions.service';
import { UsersService } from './users.service';
import { TagsService } from './tags.service';
import { VaultsService } from './vaults.service';
import { DebtsService } from './debts.service';
import { AnalyticsService } from './analytics.service';
import { RecurringService } from './recurring.service';
import { AuthService } from './auth.service';
import { PreferencesService } from './preferences.service';
import { BackupService } from './backup.service';
import { UserOAuthCredentialService } from './user-oauth-credential.service';
import { PushService } from './push.service';
import { GmailService } from './gmail.service';
import { VaultWatchersService } from './vault-watchers.service';
import { UserAiCredentialService } from './user-ai-credential.service';
import { PendingGmailExpenseService } from './pending-gmail-expense.service';

export const utilService = new UtilService();
export const logger = new Logger();
export const transactionsService = new TransactionsService();
export const usersService = new UsersService();
export const tagsService = new TagsService();
export const vaultsService = new VaultsService();
export const debtsService = new DebtsService();
export const analyticsService = new AnalyticsService();
export const recurringService = new RecurringService();
export const authService = new AuthService();
export const preferencesService = new PreferencesService();
export const backupService = new BackupService();
export const userOAuthCredentialService = new UserOAuthCredentialService();
export const pushService = new PushService();
// Must be constructed before `gmailService`: `GmailService`'s constructor default
// captures `pendingGmailExpenseService` by value, so a later definition would leave
// `this.pendingExpenses` undefined and blow up in `handleMessage` at push time.
export const pendingGmailExpenseService = new PendingGmailExpenseService();
export const gmailService = new GmailService();
export const vaultWatchersService = new VaultWatchersService();
export const userAiCredentialService = new UserAiCredentialService();

export {
  UtilService,
  Logger,
  TransactionsService,
  UsersService,
  TagsService,
  VaultsService,
  DebtsService,
  AnalyticsService,
  RecurringService,
  AuthService,
  PreferencesService,
  BackupService,
  UserOAuthCredentialService,
  PushService,
  GmailService,
  VaultWatchersService,
  UserAiCredentialService,
  PendingGmailExpenseService,
};
