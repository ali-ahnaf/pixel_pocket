import { AppError } from '../errors/app-error';
import type { User } from '../entities/User.entity';
import type { UsersRepository } from '../repositories/users.repository';
import { UsersService } from '../services/users.service';

jest.mock('../services', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type UsersRepositoryMock = jest.Mocked<Pick<UsersRepository, 'findById' | 'findByEmail' | 'createEntity' | 'save'>>;

const buildUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    avatar: 'avatar.png',
    password: 'hashed-password',
    disableAiPrompt: false,
    hasOnboarded: false,
    ...overrides,
  }) as User;

describe('UsersService', () => {
  let users: UsersRepositoryMock;
  let service: UsersService;

  beforeEach(() => {
    users = {
      findById: jest.fn(),
      findByEmail: jest.fn(),
      createEntity: jest.fn((data) => data as User),
      save: jest.fn(),
    };
    service = new UsersService(users as unknown as UsersRepository);
  });

  // getById
  describe('getById', () => {
    it('returns the user when found', async () => {
      const user = buildUser();
      users.findById.mockResolvedValue(user);

      const result = await service.getById('user-1');

      expect(result).toBe(user);
      expect(users.findById).toHaveBeenCalledWith('user-1');
    });

    it('throws a 404 AppError when the user does not exist', async () => {
      users.findById.mockResolvedValue(null);

      await expect(service.getById('unknown-id')).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
      });
    });
  });

  // create
  describe('create', () => {
    const input = { name: 'Ada Lovelace', email: 'ada@example.com' };

    it('saves and returns a new user when the email is not taken', async () => {
      users.findByEmail.mockResolvedValue(null);
      const saved = buildUser();
      users.save.mockResolvedValue(saved);

      const result = await service.create(input);

      // The entity was created with the right fields
      expect(users.createEntity).toHaveBeenCalledWith(expect.objectContaining({ name: input.name, email: input.email }));
      expect(users.save).toHaveBeenCalledTimes(1);
      expect(result).toBe(saved);
    });

    it('throws a 409 AppError and does not save when the email is already taken', async () => {
      users.findByEmail.mockResolvedValue(buildUser());

      await expect(service.create(input)).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 409,
      });
      expect(users.save).not.toHaveBeenCalled();
    });
  });

  // update
  describe('update', () => {
    it('throws a 404 AppError when the user does not exist', async () => {
      users.findById.mockResolvedValue(null);

      await expect(service.update('unknown-id', { name: 'New Name' })).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 404,
      });
      expect(users.save).not.toHaveBeenCalled();
    });

    it('throws a 409 AppError when the new email is already used by another user', async () => {
      const currentUser = buildUser({ id: 'user-1', email: 'ada@example.com' });
      const otherUser = buildUser({ id: 'user-2', email: 'other@example.com' });

      users.findById.mockResolvedValue(currentUser);
      users.findByEmail.mockResolvedValue(otherUser); // email belongs to someone else

      await expect(service.update('user-1', { email: 'other@example.com' })).rejects.toMatchObject({
        constructor: AppError,
        statusCode: 409,
      });
      expect(users.save).not.toHaveBeenCalled();
    });

    it('allows a user to keep their existing email (no duplicate check fired)', async () => {
      const user = buildUser({ email: 'ada@example.com' });
      users.findById.mockResolvedValue(user);
      users.save.mockResolvedValue(user);

      await service.update('user-1', { email: 'ada@example.com' });

      // findByEmail must NOT be called when the email hasn't changed
      expect(users.findByEmail).not.toHaveBeenCalled();
      expect(users.save).toHaveBeenCalledTimes(1);
    });

    it('only mutates the fields that were provided', async () => {
      const user = buildUser({ name: 'Ada Lovelace', email: 'ada@example.com', avatar: 'old.png' });
      users.findById.mockResolvedValue(user);
      users.save.mockResolvedValue(user);

      await service.update('user-1', { name: 'Grace Hopper' });

      // name updated, email and avatar left alone
      expect(user.name).toBe('Grace Hopper');
      expect(user.email).toBe('ada@example.com');
      expect(user.avatar).toBe('old.png');
    });

    it('saves and returns the updated user on a successful update', async () => {
      const user = buildUser();
      const saved = buildUser({ name: 'Grace Hopper', avatar: 'new.png' });

      users.findById.mockResolvedValue(user);
      users.findByEmail.mockResolvedValue(null); // new email is free
      users.save.mockResolvedValue(saved);

      const result = await service.update('user-1', {
        name: 'Grace Hopper',
        email: 'grace@example.com',
        avatar: 'new.png',
      });

      expect(users.save).toHaveBeenCalledTimes(1);
      expect(result).toBe(saved);
    });

    it('updates disableAiPrompt when provided', async () => {
      const user = buildUser();
      const saved = buildUser({ disableAiPrompt: true });

      users.findById.mockResolvedValue(user);
      users.save.mockResolvedValue(saved);

      const result = await service.update('user-1', { disableAiPrompt: true });

      expect(result).toBe(saved);
    });

    it('does not change disableAiPrompt when omitted', async () => {
      const user = buildUser();

      users.findById.mockResolvedValue(user);
      users.save.mockResolvedValue(user);

      await service.update('user-1', { name: 'Grace Hopper' });

      expect(user.disableAiPrompt).toBe(false);
    });

    it('marks the user as onboarded when provided', async () => {
      const user = buildUser();

      users.findById.mockResolvedValue(user);
      users.save.mockImplementation(async (entity: User) => entity);

      await service.update('user-1', { hasOnboarded: true });

      expect(user.hasOnboarded).toBe(true);
    });

    it('does not change hasOnboarded when omitted', async () => {
      const user = buildUser({ hasOnboarded: true });

      users.findById.mockResolvedValue(user);
      users.save.mockResolvedValue(user);

      await service.update('user-1', { name: 'Grace Hopper' });

      expect(user.hasOnboarded).toBe(true);
    });
  });
});
