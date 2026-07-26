import { DataSource, FindManyOptions, IsNull, Not, Repository } from 'typeorm';
import { DebtStatus } from '@expense-tracker/shared';
import { AppDataSource } from '../data-source';
import { Debt } from '../entities/Debt.entity';

/**
 * Data-access layer for debts (dues). The TypeORM repository is resolved lazily
 * per call so a different DataSource can be injected in tests.
 */
export class DebtsRepository {
  constructor(private readonly dataSource: DataSource = AppDataSource) {}

  private get repo(): Repository<Debt> {
    return this.dataSource.getRepository(Debt);
  }

  findManyForUser(userId: string, status: DebtStatus = 'incomplete'): Promise<Debt[]> {
    const options: FindManyOptions<Debt> = { where: { userId }, order: { createdAt: 'DESC' } };

    if (status === 'completed') {
      // Applied and discarded dues are both soft-deleted; return only those,
      // most recently settled/discarded first.
      options.where = { userId, deletedAt: Not(IsNull()) };
      options.order = { deletedAt: 'DESC' };
      options.withDeleted = true;
    } else if (status === 'all') {
      options.withDeleted = true;
    }

    return this.repo.find(options);
  }

  findOneForUser(userId: string, id: string): Promise<Debt | null> {
    return this.repo.findOneBy({ userId, id });
  }

  /**
   * Look up a due by the client-generated idempotency key. Used to make a
   * replayed offline create return the original row instead of inserting a
   * duplicate. Soft-deleted dues count: the user may have applied or discarded
   * the due between the first attempt and the replay.
   */
  findOneByClientRequestId(userId: string, clientRequestId: string): Promise<Debt | null> {
    return this.repo.findOne({ where: { userId, clientRequestId }, withDeleted: true });
  }

  createEntity(data: Partial<Debt>): Debt {
    return this.repo.create(data);
  }

  save(debt: Debt): Promise<Debt> {
    return this.repo.save(debt);
  }

  remove(debt: Debt): Promise<Debt> {
    return this.repo.softRemove(debt);
  }
}
