import { UpdateUserPreferenceInput } from '@expense-tracker/shared';
import { UserPreference } from '../entities/UserPreference.entity';
import { PreferencesRepository } from '../repositories/preferences.repository';
import { preferencesRepository } from '../repositories';
import { logger } from '.';

export type { UpdateUserPreferenceInput };

/**
 * Business logic for user preferences. A row is created lazily the first time a
 * user reads or updates their preferences. The repository is injected (defaults
 * to the shared singleton) so the service can be unit-tested against a mock.
 */
export class PreferencesService {
  constructor(private readonly preferences: PreferencesRepository = preferencesRepository) {}

  async getOrCreate(userId: string): Promise<UserPreference> {
    const existing = await this.preferences.findByUserId(userId);
    if (existing) return existing;

    const created = this.preferences.createEntity({ userId, showIncome: false, showExpense: false, pushEnabled: false, aiTransactionEntryEnabled: false });
    return this.preferences.save(created);
  }

  async update(userId: string, input: UpdateUserPreferenceInput): Promise<UserPreference> {
    const preference = await this.getOrCreate(userId);

    if (input.showIncome !== undefined) preference.showIncome = input.showIncome;
    if (input.showExpense !== undefined) preference.showExpense = input.showExpense;
    if (input.pushEnabled !== undefined) preference.pushEnabled = input.pushEnabled;
    if (input.aiTransactionEntryEnabled !== undefined) preference.aiTransactionEntryEnabled = input.aiTransactionEntryEnabled;

    const saved = await this.preferences.save(preference);
    logger.info('Updated user preferences', { userId });
    return saved;
  }
}
