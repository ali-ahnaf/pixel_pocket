import type { UserPreference } from '../entities/UserPreference.entity';
import type { PreferencesRepository } from '../repositories/preferences.repository';
import { PreferencesService } from '../services/preferences.service';

jest.mock('../services', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type PreferencesRepositoryMock = jest.Mocked<Pick<PreferencesRepository, 'findByUserId' | 'createEntity' | 'save'>>;

const buildPreference = (overrides: Partial<UserPreference> = {}): UserPreference =>
  ({
    id: 'pref-1',
    userId: 'user-1',
    showIncome: false,
    showExpense: false,
    ...overrides,
  }) as UserPreference;

describe('PreferencesService', () => {
  let preferences: PreferencesRepositoryMock;
  let service: PreferencesService;

  beforeEach(() => {
    preferences = {
      findByUserId: jest.fn(),
      createEntity: jest.fn((data) => data as UserPreference),
      save: jest.fn(),
    };
    service = new PreferencesService(preferences as unknown as PreferencesRepository);
  });

  describe('getOrCreate', () => {
    it('returns the existing preference when one exists', async () => {
      const pref = buildPreference({ showIncome: true });
      preferences.findByUserId.mockResolvedValue(pref);

      const result = await service.getOrCreate('user-1');

      expect(result).toBe(pref);
      expect(preferences.createEntity).not.toHaveBeenCalled();
      expect(preferences.save).not.toHaveBeenCalled();
    });

    it('creates a default preference row when none exists', async () => {
      preferences.findByUserId.mockResolvedValue(null);
      const saved = buildPreference();
      preferences.save.mockResolvedValue(saved);

      const result = await service.getOrCreate('user-1');

      expect(preferences.createEntity).toHaveBeenCalledWith({ userId: 'user-1', showIncome: false, showExpense: false, pushEnabled: false, aiTransactionEntryEnabled: false });
      expect(preferences.save).toHaveBeenCalledTimes(1);
      expect(result).toBe(saved);
    });
  });

  describe('update', () => {
    it('updates only the fields that were provided', async () => {
      const pref = buildPreference({ showIncome: false, showExpense: false });
      preferences.findByUserId.mockResolvedValue(pref);
      preferences.save.mockImplementation((p) => Promise.resolve(p));

      await service.update('user-1', { showIncome: true });

      expect(pref.showIncome).toBe(true);
      expect(pref.showExpense).toBe(false);
      expect(preferences.save).toHaveBeenCalledTimes(1);
    });

    it('updates the AI transaction entry flag when provided', async () => {
      const pref = buildPreference({ aiTransactionEntryEnabled: false });
      preferences.findByUserId.mockResolvedValue(pref);
      preferences.save.mockImplementation((p) => Promise.resolve(p));

      await service.update('user-1', { aiTransactionEntryEnabled: true });

      expect(pref.aiTransactionEntryEnabled).toBe(true);
      expect(preferences.save).toHaveBeenCalledTimes(1);
    });

    it('creates a row first when the user has no preferences yet', async () => {
      preferences.findByUserId.mockResolvedValue(null);
      preferences.save.mockImplementation((p) => Promise.resolve(p));

      const result = await service.update('user-1', { showExpense: true });

      // getOrCreate saves the new row, then update saves again with the change applied.
      expect(preferences.createEntity).toHaveBeenCalledTimes(1);
      expect(result.showExpense).toBe(true);
    });
  });
});
