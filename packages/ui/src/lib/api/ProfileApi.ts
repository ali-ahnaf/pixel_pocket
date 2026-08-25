import type {
  User,
  UpdateUserInput,
  VaultDto,
  TagDto,
  TransactionDto,
  OccurrenceDto,
  RecurringDto,
  DebtDto,
  DebtStatus,
  ChangePasswordPayload,
  UserPreferenceDto,
  UpdateUserPreferenceInput,
  OAuthCredentialsStatusDto,
  SetOAuthCredentialsInput,
  AuthorizeUrlDto,
  GmailLabelDto,
  GmailWatchStatusDto,
  VaultGmailWatcherDto,
  SetVaultGmailWatcherInput,
  PushSubscriptionInput,
  PushSubscriptionDto,
  AiCredentialStatusDto,
  SetAiCredentialInput,
  SetAiModelInput,
  PendingGmailExpenseDto,
  PendingExpenseEmailDto,
  CreateTransactionInput,
  CreateDebtInput,
} from '@expense-tracker/shared';
import ApiClient from './ApiClient';

export default class ProfileApi extends ApiClient {
  constructor(baseURL: string) {
    super(baseURL);
  }

  getUser(userId: string): Promise<User> {
    return this.get<User>(`/users/${userId}`);
  }

  updateUser(userId: string, data: UpdateUserInput): Promise<User> {
    return this.put<User>(`/users/${userId}`, data);
  }

  changePassword(userId: string, data: ChangePasswordPayload): Promise<void> {
    return this.put<void>(`/users/${userId}/password`, data);
  }

  // Preferences
  getPreferences(userId: string): Promise<UserPreferenceDto> {
    return this.get<UserPreferenceDto>(`/users/${userId}/preferences`);
  }

  updatePreferences(userId: string, data: UpdateUserPreferenceInput): Promise<UserPreferenceDto> {
    return this.put<UserPreferenceDto>(`/users/${userId}/preferences`, data);
  }

  // Web Push subscriptions
  subscribePush(userId: string, input: PushSubscriptionInput): Promise<PushSubscriptionDto> {
    return this.post<PushSubscriptionDto>(`/users/${userId}/push-subscriptions`, input);
  }

  unsubscribePush(userId: string, endpoint: string): Promise<void> {
    return this.delete<void>(`/users/${userId}/push-subscriptions`, { data: { endpoint } });
  }

  // Google OAuth credentials (write-only from the client's perspective)
  getOAuthCredentialsStatus(userId: string): Promise<OAuthCredentialsStatusDto> {
    return this.get<OAuthCredentialsStatusDto>(`/users/${userId}/oauth-credentials`);
  }

  setOAuthCredentials(userId: string, data: SetOAuthCredentialsInput): Promise<OAuthCredentialsStatusDto> {
    return this.put<OAuthCredentialsStatusDto>(`/users/${userId}/oauth-credentials`, data);
  }

  getGoogleAuthorizeUrl(userId: string): Promise<AuthorizeUrlDto> {
    return this.get<AuthorizeUrlDto>(`/users/${userId}/oauth-credentials/authorize`);
  }

  // Gmail bank-alert watch
  getGmailLabels(userId: string): Promise<GmailLabelDto[]> {
    return this.get<GmailLabelDto[]>(`/users/${userId}/oauth-credentials/gmail/labels`);
  }

  getGmailWatchStatus(userId: string): Promise<GmailWatchStatusDto> {
    return this.get<GmailWatchStatusDto>(`/users/${userId}/oauth-credentials/gmail/watch`);
  }

  // Per-vault Gmail watchers (label + AI extraction guidance)
  getVaultWatchers(userId: string): Promise<VaultGmailWatcherDto[]> {
    return this.get<VaultGmailWatcherDto[]>(`/users/${userId}/vault-watchers`);
  }

  setVaultWatcher(userId: string, vaultId: string, input: SetVaultGmailWatcherInput): Promise<VaultGmailWatcherDto> {
    return this.put<VaultGmailWatcherDto>(`/users/${userId}/vault-watchers/${vaultId}`, input);
  }

  deleteVaultWatcher(userId: string, vaultId: string): Promise<void> {
    return this.delete<void>(`/users/${userId}/vault-watchers/${vaultId}`);
  }

  // Gmail pending-expense queue (pointers only; email body is re-fetched live and never persisted)
  getPendingExpenses(userId: string): Promise<PendingGmailExpenseDto[]> {
    return this.get<PendingGmailExpenseDto[]>(`/users/${userId}/pending-expenses`);
  }

  getPendingExpenseEmail(userId: string, id: string): Promise<PendingExpenseEmailDto> {
    return this.get<PendingExpenseEmailDto>(`/users/${userId}/pending-expenses/${id}/email`);
  }

  deletePendingExpense(userId: string, id: string): Promise<void> {
    return this.delete<void>(`/users/${userId}/pending-expenses/${id}`);
  }

  // Vaults
  getVaults(userId: string): Promise<VaultDto[]> {
    return this.get<VaultDto[]>(`/users/${userId}/vaults`);
  }

  createVault(userId: string, data: { name: string; description: string; icon?: string; backgroundColor?: string; monthlyBudget?: number | null }): Promise<VaultDto> {
    return this.post<VaultDto>(`/users/${userId}/vaults`, data);
  }

  updateVault(userId: string, vaultId: string, data: { name?: string; description?: string; icon?: string | null; backgroundColor?: string | null; monthlyBudget?: number | null }): Promise<VaultDto> {
    return this.put<VaultDto>(`/users/${userId}/vaults/${vaultId}`, data);
  }

  deleteVault(userId: string, vaultId: string): Promise<void> {
    return this.delete<void>(`/users/${userId}/vaults/${vaultId}`);
  }

  setDefaultVault(userId: string, vaultId: string): Promise<VaultDto> {
    return this.put<VaultDto>(`/users/${userId}/vaults/${vaultId}/set-default`);
  }

  // OpenRouter AI credentials (E2E-encrypted key blobs, owner-only)
  getAiCredentialStatus(userId: string): Promise<AiCredentialStatusDto> {
    return this.get<AiCredentialStatusDto>(`/users/${userId}/ai-credentials`);
  }

  setAiCredential(userId: string, data: SetAiCredentialInput): Promise<AiCredentialStatusDto> {
    return this.put<AiCredentialStatusDto>(`/users/${userId}/ai-credentials`, data);
  }

  setAiModel(userId: string, data: SetAiModelInput): Promise<AiCredentialStatusDto> {
    return this.put<AiCredentialStatusDto>(`/users/${userId}/ai-credentials/model`, data);
  }

  // Tags
  getTags(userId: string): Promise<TagDto[]> {
    return this.get<TagDto[]>(`/users/${userId}/tags`);
  }

  createTag(userId: string, data: { name: string; icon?: string; backgroundColor?: string }): Promise<TagDto> {
    return this.post<TagDto>(`/users/${userId}/tags`, data);
  }

  updateTag(userId: string, tagId: string, data: { name?: string; icon?: string | null; backgroundColor?: string | null }): Promise<TagDto> {
    return this.put<TagDto>(`/users/${userId}/tags/${tagId}`, data);
  }

  deleteTag(userId: string, tagId: string): Promise<void> {
    return this.delete<void>(`/users/${userId}/tags/${tagId}`);
  }

  // Transactions
  getTransactions(userId: string, month: number, year: number): Promise<TransactionDto[]> {
    return this.get<TransactionDto[]>(`/users/${userId}/transactions?month=${month}&year=${year}`);
  }

  getAllTransactions(userId: string): Promise<TransactionDto[]> {
    return this.get<TransactionDto[]>(`/users/${userId}/transactions?period=all`);
  }

  createTransaction(userId: string, data: CreateTransactionInput): Promise<{ id: string }> {
    return this.post<{ id: string }>(`/users/${userId}/transactions`, data);
  }

  updateTransaction(
    userId: string,
    transactionId: string,
    data: { amount?: number; type?: string; tagIds?: string[]; title?: string | null; vaultId?: string | null; date?: string },
  ): Promise<TransactionDto> {
    return this.put<TransactionDto>(`/users/${userId}/transactions/${transactionId}`, data);
  }

  deleteTransaction(userId: string, transactionId: string): Promise<void> {
    return this.delete<void>(`/users/${userId}/transactions/${transactionId}`);
  }

  commitTransaction(userId: string, transactionId: string): Promise<TransactionDto> {
    return this.post<TransactionDto>(`/users/${userId}/transactions/${transactionId}/commit`, {});
  }

  discardTransaction(userId: string, transactionId: string): Promise<void> {
    return this.post<void>(`/users/${userId}/transactions/${transactionId}/discard`, {});
  }

  // Recurring quests
  getRecurringQuests(userId: string): Promise<RecurringDto[]> {
    return this.get<RecurringDto[]>(`/users/${userId}/recurring`);
  }

  getRecurringOccurrences(userId: string, month: number, year: number): Promise<OccurrenceDto[]> {
    return this.get<OccurrenceDto[]>(`/users/${userId}/recurring/occurrences?month=${month}&year=${year}`);
  }

  applyRecurringOccurrence(userId: string, questId: string, date: string): Promise<{ id: string }> {
    return this.post<{ id: string }>(`/users/${userId}/recurring/${questId}/apply`, { date });
  }

  skipRecurringOccurrence(userId: string, questId: string, date: string): Promise<void> {
    return this.post<void>(`/users/${userId}/recurring/${questId}/skip`, { date });
  }

  createRecurringQuest(
    userId: string,
    data: { title: string; amount: number; type: string; interval: string; startDate?: string | null; endDate?: string | null; tagIds?: string[]; vaultId?: string | null },
  ): Promise<RecurringDto> {
    return this.post<RecurringDto>(`/users/${userId}/recurring`, data);
  }

  updateRecurringQuest(
    userId: string,
    questId: string,
    data: { title?: string; amount?: number; type?: string; interval?: string; startDate?: string | null; endDate?: string | null; tagIds?: string[]; vaultId?: string | null },
  ): Promise<RecurringDto> {
    return this.put<RecurringDto>(`/users/${userId}/recurring/${questId}`, data);
  }

  deleteRecurringQuest(userId: string, questId: string): Promise<void> {
    return this.delete<void>(`/users/${userId}/recurring/${questId}`);
  }

  // Debts (dues)
  getDebts(userId: string, status: DebtStatus = 'incomplete'): Promise<DebtDto[]> {
    return this.get<DebtDto[]>(`/users/${userId}/debts?status=${status}`);
  }

  createDebt(userId: string, data: CreateDebtInput): Promise<DebtDto> {
    return this.post<DebtDto>(`/users/${userId}/debts`, data);
  }

  updateDebt(userId: string, debtId: string, data: { title?: string; amount?: number; type?: 'expense' | 'income'; notes?: string | null; dueDate?: string | null }): Promise<DebtDto> {
    return this.put<DebtDto>(`/users/${userId}/debts/${debtId}`, data);
  }

  deleteDebt(userId: string, debtId: string): Promise<void> {
    return this.delete<void>(`/users/${userId}/debts/${debtId}`);
  }

  applyDebt(userId: string, debtId: string, vaultId: string | null, skipTransaction?: boolean): Promise<{ id: string }> {
    return this.post<{ id: string }>(`/users/${userId}/debts/${debtId}/apply`, skipTransaction === undefined ? { vaultId } : { vaultId, skipTransaction });
  }
}
