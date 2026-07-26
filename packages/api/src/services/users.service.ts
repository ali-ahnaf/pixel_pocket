import { UpdateUserInput, CreateUserInput } from '@expense-tracker/shared';
import { User } from '../entities/User.entity';
import { AppError } from '../errors/app-error';
import { UsersRepository } from '../repositories/users.repository';
import { usersRepository } from '../repositories';
import { logger } from '.';

export type { CreateUserInput };

/**
 * Business logic for users. The repository is injected (defaults to the shared
 * singleton) so the service can be unit-tested against a mock.
 */
export class UsersService {
  constructor(private readonly users: UsersRepository = usersRepository) {}

  async getById(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }
    return user;
  }

  async create(input: CreateUserInput): Promise<User> {
    const existing = await this.users.findByEmail(input.email);
    if (existing) {
      throw new AppError('Email already in use', 409);
    }

    const user = this.users.createEntity({ name: input.name, email: input.email });
    const saved = await this.users.save(user);
    logger.info('Created user', { userId: saved.id });
    return saved;
  }

  async update(userId: string, input: UpdateUserInput): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (input.email && input.email !== user.email) {
      const existing = await this.users.findByEmail(input.email);
      if (existing) {
        throw new AppError('Email already in use', 409);
      }
    }

    if (input.name !== undefined) user.name = input.name;
    if (input.email !== undefined) user.email = input.email;
    if (input.avatar !== undefined) user.avatar = input.avatar;
    if (input.disableAiPrompt !== undefined) user.disableAiPrompt = input.disableAiPrompt;
    if (input.hasOnboarded !== undefined) user.hasOnboarded = input.hasOnboarded;

    const saved = await this.users.save(user);
    logger.info('Updated user', { userId: saved.id });
    return saved;
  }
}
