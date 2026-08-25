import { Between, DataSource, FindOptionsWhere, IsNull, Not, Repository } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Expense } from '../entities/Expense.entity';
import { TransactionTag } from '../entities/TransactionTag.entity';

export interface TransactionDateFilter {
  month?: number;
  year?: number;
  allTime?: boolean;
}

/**
 * Data-access layer for transactions (one-off expenses/income) and their tag
 * links. The TypeORM repositories are resolved lazily per call so the class can
 * be constructed before the DataSource is initialized, and so a different
 * DataSource can be injected in tests.
 */
export class TransactionsRepository {
  constructor(private readonly dataSource: DataSource = AppDataSource) {}

  private get repo(): Repository<Expense> {
    return this.dataSource.getRepository(Expense);
  }

  private get tagLinkRepo(): Repository<TransactionTag> {
    return this.dataSource.getRepository(TransactionTag);
  }

  findManyForUser(userId: string, filter: TransactionDateFilter): Promise<Expense[]> {
    const where: FindOptionsWhere<Expense> = { userId, interval: IsNull() };

    if (filter.allTime) {
      where.date = Not(IsNull());
    } else {
      where.date = this.buildMonthRange(filter.month!, filter.year!);
    }

    return this.repo.find({
      where,
      relations: ['transactionTags', 'transactionTags.tag', 'vault'],
      order: { updatedAt: 'DESC' },
    });
  }

  findOneForUser(userId: string, id: string): Promise<Expense | null> {
    return this.repo.findOneBy({ userId, interval: IsNull(), id });
  }

  /**
   * Look up a transaction by the client-generated idempotency key. Used to make
   * a replayed offline create return the original row instead of inserting a
   * duplicate.
   */
  findOneByClientRequestId(userId: string, clientRequestId: string): Promise<Expense | null> {
    return this.repo.findOneBy({ userId, clientRequestId });
  }

  createEntity(data: Partial<Expense>): Expense {
    return this.repo.create(data);
  }

  save(transaction: Expense): Promise<Expense> {
    return this.repo.save(transaction);
  }

  softDelete(id: string): Promise<unknown> {
    return this.repo.softDelete(id);
  }

  /**
   * Permanently remove a transaction and its tag links. Used to discard an
   * uncommitted (e.g. Gmail-imported) expense the user rejects — unlike
   * `softDelete`, no tombstone is kept.
   */
  async hardRemove(id: string): Promise<void> {
    await this.tagLinkRepo.delete({ transactionId: id });
    await this.repo.delete(id);
  }

  /**
   * Replace the tag links for a transaction. The join rows are hard-deleted
   * (not soft-deleted) so the composite primary key can be reinserted without
   * colliding with tombstoned rows.
   */
  async replaceTags(transactionId: string, tagIds: string[]): Promise<void> {
    await this.tagLinkRepo.delete({ transactionId });
    if (tagIds.length > 0) {
      const links = tagIds.map((tagId) => this.tagLinkRepo.create({ transactionId, tagId }));
      await this.tagLinkRepo.save(links);
    }
  }

  private buildMonthRange(month: number, year: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = new Date(year, month, 0);
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(monthEnd.getDate()).padStart(2, '0')}`;
    return Between(startDate, endDate);
  }
}
