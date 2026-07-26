import { Vault } from '../entities/Vault.entity';
import type { User } from '../entities/User.entity';
import { AppError } from '../errors/app-error';
import type { UsersRepository } from '../repositories/users.repository';
import type { VaultsRepository } from '../repositories/vaults.repository';
import { VaultsService } from '../services/vaults.service';

jest.mock('../services', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type UsersRepositoryMock = jest.Mocked<Pick<UsersRepository, 'findById'>>;
type VaultsRepositoryMock = jest.Mocked<Pick<VaultsRepository, 'findManyForUser' | 'findOneForUser' | 'createEntity' | 'save' | 'remove' | 'setDefault'>>;

const buildUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  avatar: 'avatar.png',
  password: 'secret',
  disableAiPrompt: false,
  hasOnboarded: false,
  expenses: [],
  vaults: [],
  tags: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: new Date(),
  ...overrides,
});

const buildVault = (overrides: Partial<Vault> = {}): Vault =>
  ({
    id: 'vault-1',
    userId: 'user-1',
    name: 'My Vault',
    description: 'Stored value',
    icon: 'safe',
    backgroundColor: '#ffffff',
    monthlyBudget: 100,
    isDefault: false,
    ...overrides,
  }) as Vault;

describe('VaultsService', () => {
  let users: UsersRepositoryMock;
  let vaults: VaultsRepositoryMock;
  let service: VaultsService;

  beforeEach(() => {
    users = {
      findById: jest.fn(),
    } as UsersRepositoryMock;

    vaults = {
      findManyForUser: jest.fn(),
      findOneForUser: jest.fn(),
      createEntity: jest.fn((data) => data as Vault),
      save: jest.fn(),
      remove: jest.fn(),
      setDefault: jest.fn(),
    } as unknown as VaultsRepositoryMock;

    service = new VaultsService(vaults as unknown as VaultsRepository, users as unknown as UsersRepository);
  });

  describe('list', () => {
    it('returns the user vaults from the repository', async () => {
      const vaultsForUser = [buildVault(), buildVault({ id: 'vault-2', name: 'Other Vault' })];
      vaults.findManyForUser.mockResolvedValue(vaultsForUser);

      const result = await service.list('user-1');

      expect(vaults.findManyForUser).toHaveBeenCalledWith('user-1');
      expect(result).toBe(vaultsForUser);
    });

    it('returns an empty array when the user has no vaults', async () => {
      vaults.findManyForUser.mockResolvedValue([]);

      const result = await service.list('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    it('throws a 404 AppError when the user does not exist', async () => {
      users.findById.mockResolvedValue(null);

      await expect(service.create('user-1', { name: 'New Vault' })).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
      });

      expect(vaults.createEntity).not.toHaveBeenCalled();
      expect(vaults.save).not.toHaveBeenCalled();
    });

    it('creates and saves a vault with defaults for missing optional fields', async () => {
      const user = buildUser();
      users.findById.mockResolvedValue(user);
      const saved = buildVault({ id: 'vault-1', userId: user.id, isDefault: false });
      vaults.save.mockResolvedValue(saved);

      const result = await service.create(user.id, { name: 'New Vault' });

      expect(vaults.createEntity).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          name: 'New Vault',
          description: '',
          icon: null,
          backgroundColor: null,
          monthlyBudget: null,
          isDefault: false,
        }),
      );
      expect(vaults.save).toHaveBeenCalledTimes(1);
      expect(result).toBe(saved);
    });
  });

  describe('update', () => {
    it('throws a 404 AppError when the vault does not exist', async () => {
      vaults.findOneForUser.mockResolvedValue(null);

      await expect(service.update('user-1', 'vault-1', { name: 'Updated Name' })).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
      });
      expect(vaults.save).not.toHaveBeenCalled();
    });

    it('updates only provided fields and saves the vault', async () => {
      const existingVault = buildVault({ name: 'Original', description: 'Original desc', icon: 'old', backgroundColor: '#000000', monthlyBudget: 50 });
      vaults.findOneForUser.mockResolvedValue(existingVault);
      vaults.save.mockResolvedValue(existingVault);

      const result = await service.update('user-1', existingVault.id, {
        name: 'Updated Name',
        monthlyBudget: 150,
      });

      expect(existingVault.name).toBe('Updated Name');
      expect(existingVault.monthlyBudget).toBe(150);
      expect(existingVault.description).toBe('Original desc');
      expect(existingVault.icon).toBe('old');
      expect(existingVault.backgroundColor).toBe('#000000');
      expect(vaults.save).toHaveBeenCalledWith(existingVault);
      expect(result).toBe(existingVault);
    });
  });

  describe('remove', () => {
    it('throws a 404 AppError when the vault does not exist', async () => {
      vaults.findOneForUser.mockResolvedValue(null);

      await expect(service.remove('user-1', 'vault-1')).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
      });
      expect(vaults.remove).not.toHaveBeenCalled();
    });

    it('removes the vault when it exists', async () => {
      const existingVault = buildVault();
      vaults.findOneForUser.mockResolvedValue(existingVault);
      vaults.remove.mockResolvedValue(existingVault);

      await service.remove('user-1', existingVault.id);

      expect(vaults.remove).toHaveBeenCalledWith(existingVault);
    });
  });

  describe('setDefault', () => {
    it('throws a 404 AppError when the vault does not exist', async () => {
      vaults.findOneForUser.mockResolvedValue(null);

      await expect(service.setDefault('user-1', 'vault-1')).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
      });
      expect(vaults.setDefault).not.toHaveBeenCalled();
    });

    it('marks the chosen vault as default and returns it as default', async () => {
      const existingVault = buildVault({ isDefault: false });
      vaults.findOneForUser.mockResolvedValue(existingVault);
      vaults.setDefault.mockResolvedValue(undefined);

      const result = await service.setDefault('user-1', existingVault.id);

      expect(vaults.setDefault).toHaveBeenCalledWith('user-1', existingVault.id);
      expect(result).toEqual(expect.objectContaining({ id: existingVault.id, isDefault: true }));
    });
  });
});
