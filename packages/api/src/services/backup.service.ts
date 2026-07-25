import { RecurringDto, TransactionDto } from '@expense-tracker/shared';
import { gunzipSync, gzipSync } from 'zlib';
import { EntityManager, In, IsNull, Not } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Debt } from '../entities/Debt.entity';
import { Expense } from '../entities/Expense.entity';
import { RecurringOccurrenceSkip } from '../entities/RecurringOccurrenceSkip.entity';
import { Tag } from '../entities/Tag.entity';
import { TransactionTag } from '../entities/TransactionTag.entity';
import { User } from '../entities/User.entity';
import { UserPreference } from '../entities/UserPreference.entity';
import { Vault } from '../entities/Vault.entity';
import { AppError } from '../errors/app-error';
import { debtsService, logger, tagsService, usersService, vaultsService } from '../services';
import { BACKUP_MAX_FILE_SIZE_BYTES, BackupDebtDto, BackupPayload, BackupRecurringSkipDto, BackupTransactionDto } from '../types/backup';
import { DebtsService } from './debts.service';
import { TagsService } from './tags.service';
import { UsersService } from './users.service';
import { VaultsService } from './vaults.service';

type ImportedTagLink = Pick<TransactionTag, 'transactionId' | 'tagId'>;

export class BackupService {
  private readonly appVersion = '1.0';
  private readonly binaryFormatMagic = 'PPBK';
  private readonly binaryFormatVersion = 1;
  private readonly maxDecompressedBackupSizeBytes = BACKUP_MAX_FILE_SIZE_BYTES;

  constructor(
    private readonly users: UsersService = usersService,
    private readonly debts: DebtsService = debtsService,
    private readonly vaults: VaultsService = vaultsService,
    private readonly tags: TagsService = tagsService,
  ) {}

  async exportData(userId: string): Promise<Buffer> {
    const payload = await this.buildBackupPayload(userId);
    const buffer = this.serializeBackupPayload(userId, payload);

    logger.info('Created backup export file', {
      userId,
      sizeBytes: buffer.length,
    });

    return buffer;
  }

  parseBackupFile(file: Buffer): unknown {
    if (!Buffer.isBuffer(file) || file.length <= 5) {
      throw new AppError('Invalid backup file', 400);
    }

    const magic = file.subarray(0, 4).toString('ascii');
    if (magic !== this.binaryFormatMagic) {
      throw new AppError('Unsupported backup file format', 400);
    }

    const formatVersion = file.readUInt8(4);
    if (formatVersion !== this.binaryFormatVersion) {
      throw new AppError(`Unsupported backup file version: ${formatVersion}`, 400);
    }

    try {
      const decompressedPayload = gunzipSync(file.subarray(5), {
        maxOutputLength: this.maxDecompressedBackupSizeBytes,
      });
      const payload = JSON.parse(decompressedPayload.toString('utf8'));
      logger.debug('Parsed backup file', {
        formatVersion,
        sizeBytes: file.length,
        decompressedSizeBytes: decompressedPayload.length,
      });
      return payload;
    } catch (error) {
      logger.warn('Failed to parse backup file', {
        error: error instanceof Error ? error.message : error,
      });
      throw new AppError('Backup file could not be parsed', 400);
    }
  }

  private async buildBackupPayload(userId: string): Promise<BackupPayload> {
    const user = await this.users.getById(userId);
    const debts = await this.listDebtsForBackup(userId);
    const vaults = await this.vaults.list(userId);
    const transactions = await this.listTransactionsForBackup(userId);
    const recurrings = await this.listRecurringsForBackup(userId);
    const recurringSkips = await this.listRecurringSkipsForBackup(userId);
    const preference = await this.listPreferenceForBackup(userId);
    const tags = await this.tags.list(userId);

    return {
      appVersion: this.appVersion,
      exportedAt: new Date().toISOString(),
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          disableAiPrompt: user.disableAiPrompt,
        },
        debts,
        vaults,
        transactions,
        recurrings,
        recurringSkips,
        preference,
        tags,
      },
    };
  }

  async importData(userId: string, dto: BackupPayload): Promise<void> {
    this.validateImportPayload(userId, dto);
    await this.users.getById(userId);

    logger.info('Starting backup import', {
      userId,
      debts: dto.data.debts.length,
      recurrings: dto.data.recurrings.length,
      recurringSkips: dto.data.recurringSkips.length,
      tags: dto.data.tags.length,
      transactions: dto.data.transactions.length,
      vaults: dto.data.vaults.length,
    });

    await AppDataSource.transaction(async (entityManager: EntityManager) => {
      await entityManager.update(
        User,
        { id: userId },
        {
          name: dto.data.user.name,
          email: dto.data.user.email,
          avatar: dto.data.user.avatar,
          disableAiPrompt: dto.data.user.disableAiPrompt ?? false,
        },
      );

      await this.clearExistingBackupData(entityManager, userId);
      await this.saveTags(entityManager, userId, dto);
      await this.saveVaults(entityManager, userId, dto);
      await this.saveTransactions(entityManager, userId, dto);
      await this.saveRecurrings(entityManager, userId, dto);
      await this.saveDebts(entityManager, userId, dto);
      await this.savePreference(entityManager, userId, dto);
      await this.saveTransactionTags(entityManager, dto);
      await this.saveRecurringSkips(entityManager, userId, dto);
    });

    logger.info('Completed backup import', { userId });
  }

  private serializeBackupPayload(userId: string, payload: BackupPayload): Buffer {
    const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf8');
    if (payloadBytes.length > this.maxDecompressedBackupSizeBytes) {
      logger.warn('Backup export exceeds decompressed size limit', {
        userId,
        payloadSizeBytes: payloadBytes.length,
        maxSizeBytes: this.maxDecompressedBackupSizeBytes,
      });
      throw new AppError('Backup data exceeds the maximum supported size', 400);
    }

    const compressedPayload = gzipSync(payloadBytes);
    const file = Buffer.concat([Buffer.from(this.binaryFormatMagic, 'ascii'), Buffer.from([this.binaryFormatVersion]), compressedPayload]);
    if (file.length > BACKUP_MAX_FILE_SIZE_BYTES) {
      logger.warn('Backup export exceeds file size limit', {
        userId,
        sizeBytes: file.length,
        maxSizeBytes: BACKUP_MAX_FILE_SIZE_BYTES,
      });
      throw new AppError('Backup data exceeds the maximum supported size', 400);
    }

    return file;
  }

  private validateImportPayload(userId: string, dto: BackupPayload): void {
    if (dto.appVersion !== this.appVersion) {
      throw new AppError(`Unsupported backup version: ${dto.appVersion}`, 400);
    }

    if (dto.data.user.id !== userId) {
      throw new AppError('Backup user does not match the requested user', 400);
    }

    this.ensureUniqueIds(
      'tags',
      dto.data.tags.map((tag) => tag.id),
    );
    this.ensureUniqueIds(
      'vaults',
      dto.data.vaults.map((vault) => vault.id),
    );
    this.ensureUniqueIds(
      'transactions',
      dto.data.transactions.map((transaction) => transaction.id),
    );
    this.ensureUniqueIds(
      'recurrings',
      dto.data.recurrings.map((recurring) => recurring.id),
    );
    this.ensureUniqueIds(
      'debts',
      dto.data.debts.map((debt) => debt.id),
    );
    this.ensureUniqueIds(
      'recurring skips',
      dto.data.recurringSkips.map((skip) => `${skip.recurringId}:${skip.date}`),
    );

    this.ensureOwnedByUser(
      'tags',
      userId,
      dto.data.tags.map((tag) => tag.userId),
    );
    this.ensureOwnedByUser(
      'vaults',
      userId,
      dto.data.vaults.map((vault) => vault.userId),
    );
    this.ensureOwnedByUser(
      'transactions',
      userId,
      dto.data.transactions.map((transaction) => transaction.userId),
    );
    this.ensureOwnedByUser(
      'recurrings',
      userId,
      dto.data.recurrings.map((recurring) => recurring.userId),
    );
    this.ensureOwnedByUser(
      'debts',
      userId,
      dto.data.debts.map((debt) => debt.userId),
    );
    this.ensureOwnedByUser(
      'recurring skips',
      userId,
      dto.data.recurringSkips.map((skip) => skip.userId),
    );

    const tagIds = new Set(dto.data.tags.map((tag) => tag.id));
    const vaultIds = new Set(dto.data.vaults.map((vault) => vault.id));
    const recurringIds = new Set(dto.data.recurrings.map((recurring) => recurring.id));

    for (const transaction of dto.data.transactions) {
      this.ensureVaultExists('transactions', transaction.id, transaction.vaultId, vaultIds);
      if (transaction.sourceRecurringId && !recurringIds.has(transaction.sourceRecurringId)) {
        throw new AppError(`Transaction ${transaction.id} references an unknown recurring source`, 400);
      }
      for (const tag of transaction.tags) {
        if (!tagIds.has(tag.id)) {
          throw new AppError(`Transaction ${transaction.id} references an unknown tag`, 400);
        }
      }
    }

    for (const recurring of dto.data.recurrings) {
      this.ensureVaultExists('recurrings', recurring.id, recurring.vaultId, vaultIds);
      for (const tagId of this.normalizeTagIds(recurring.tagIds)) {
        if (!tagIds.has(tagId)) {
          throw new AppError(`Recurring ${recurring.id} references an unknown tag`, 400);
        }
      }
    }

    for (const skip of dto.data.recurringSkips) {
      if (!recurringIds.has(skip.recurringId)) {
        throw new AppError(`Recurring skip ${skip.recurringId}:${skip.date} references an unknown recurring`, 400);
      }
    }
  }

  private ensureUniqueIds(label: string, ids: string[]): void {
    if (new Set(ids).size !== ids.length) {
      throw new AppError(`Backup ${label} contains duplicate ids`, 400);
    }
  }

  private ensureOwnedByUser(label: string, userId: string, recordUserIds: string[]): void {
    if (recordUserIds.some((recordUserId) => recordUserId !== userId)) {
      throw new AppError(`Backup ${label} contains records for a different user`, 400);
    }
  }

  private ensureVaultExists(label: string, recordId: string, vaultId: string | null, vaultIds: Set<string>): void {
    if (vaultId && !vaultIds.has(vaultId)) {
      throw new AppError(`${label} ${recordId} references an unknown vault`, 400);
    }
  }

  private async listExistingExpenseIds(entityManager: EntityManager, userId: string): Promise<string[]> {
    const expenses = await entityManager.find(Expense, {
      select: { id: true },
      where: { userId },
      withDeleted: true,
    });

    return expenses.map((expense) => expense.id);
  }

  private async clearExistingBackupData(entityManager: EntityManager, userId: string): Promise<void> {
    const existingExpenseIds = await this.listExistingExpenseIds(entityManager, userId);

    if (existingExpenseIds.length > 0) {
      await entityManager.softDelete(TransactionTag, { transactionId: In(existingExpenseIds) });
    }

    await entityManager.softDelete(RecurringOccurrenceSkip, { userId });
    await entityManager.softDelete(Expense, { userId });
    await entityManager.softDelete(Debt, { userId });
    await entityManager.softDelete(Vault, { userId });
    await entityManager.softDelete(Tag, { userId });
    await entityManager.softDelete(UserPreference, { userId });

    logger.debug('Soft deleted existing backup data before import', {
      userId,
      existingExpenses: existingExpenseIds.length,
    });
  }

  private async saveTags(entityManager: EntityManager, userId: string, dto: BackupPayload): Promise<void> {
    if (dto.data.tags.length === 0) return;

    await entityManager.save(
      Tag,
      dto.data.tags.map((tag) =>
        Object.assign(new Tag(), {
          id: tag.id,
          userId,
          name: tag.name,
          icon: tag.icon ?? null,
          backgroundColor: tag.backgroundColor ?? null,
          deletedAt: null,
        }),
      ),
    );
  }

  private async saveVaults(entityManager: EntityManager, userId: string, dto: BackupPayload): Promise<void> {
    if (dto.data.vaults.length === 0) return;

    await entityManager.save(
      Vault,
      dto.data.vaults.map((vault) =>
        Object.assign(new Vault(), {
          id: vault.id,
          userId,
          name: vault.name,
          description: vault.description,
          icon: vault.icon ?? null,
          backgroundColor: vault.backgroundColor ?? null,
          isDefault: vault.isDefault,
          monthlyBudget: vault.monthlyBudget ?? null,
          deletedAt: null,
        }),
      ),
    );
  }

  private async saveTransactions(entityManager: EntityManager, userId: string, dto: BackupPayload): Promise<void> {
    if (dto.data.transactions.length === 0) return;

    await entityManager.save(
      Expense,
      dto.data.transactions.map((transaction) =>
        Object.assign(new Expense(), {
          id: transaction.id,
          userId,
          title: transaction.title,
          amount: transaction.amount,
          type: transaction.type,
          date: transaction.date,
          interval: null,
          startDate: null,
          endDate: null,
          vaultId: transaction.vaultId ?? null,
          sourceRecurringId: transaction.sourceRecurringId ?? null,
          createdAt: new Date(transaction.createdAt),
          updatedAt: new Date(transaction.updatedAt),
          deletedAt: null,
        }),
      ),
    );
  }

  private async saveRecurrings(entityManager: EntityManager, userId: string, dto: BackupPayload): Promise<void> {
    if (dto.data.recurrings.length === 0) return;

    await entityManager.save(
      Expense,
      dto.data.recurrings.map((recurring) =>
        Object.assign(new Expense(), {
          id: recurring.id,
          userId,
          title: recurring.title,
          amount: recurring.amount,
          type: recurring.type,
          date: recurring.date ?? null,
          interval: recurring.interval,
          startDate: recurring.startDate,
          endDate: recurring.endDate ?? null,
          vaultId: recurring.vaultId ?? null,
          sourceRecurringId: null,
          createdAt: new Date(recurring.createdAt),
          updatedAt: new Date(recurring.updatedAt),
          deletedAt: recurring.deletedAt ? new Date(recurring.deletedAt) : null,
        }),
      ),
    );
  }

  private async saveDebts(entityManager: EntityManager, userId: string, dto: BackupPayload): Promise<void> {
    if (dto.data.debts.length === 0) return;

    await entityManager.save(
      Debt,
      dto.data.debts.map((debt) =>
        Object.assign(new Debt(), {
          id: debt.id,
          userId,
          title: debt.title,
          amount: debt.amount,
          type: debt.type,
          notes: debt.notes ?? null,
          dueDate: debt.dueDate,
          completed: debt.completed ?? false,
          createdAt: new Date(debt.createdAt),
          deletedAt: debt.completed || debt.discarded ? new Date(dto.exportedAt) : null,
        }),
      ),
    );
  }

  private async savePreference(entityManager: EntityManager, userId: string, dto: BackupPayload): Promise<void> {
    const existingPreference = await entityManager.findOne(UserPreference, {
      where: { userId },
      withDeleted: true,
    });

    await entityManager.save(
      UserPreference,
      Object.assign(new UserPreference(), {
        id: existingPreference?.id,
        userId,
        showIncome: dto.data.preference.showIncome,
        showExpense: dto.data.preference.showExpense,
        pushEnabled: dto.data.preference.pushEnabled,
        deletedAt: null,
      }),
    );
  }

  private async saveTransactionTags(entityManager: EntityManager, dto: BackupPayload): Promise<void> {
    const links = this.buildImportedTagLinks(dto.data.transactions, dto.data.recurrings);
    if (links.length === 0) return;

    await entityManager.save(
      TransactionTag,
      links.map((link) =>
        Object.assign(new TransactionTag(), {
          transactionId: link.transactionId,
          tagId: link.tagId,
          deletedAt: null,
        }),
      ),
    );
  }

  private async saveRecurringSkips(entityManager: EntityManager, userId: string, dto: BackupPayload): Promise<void> {
    if (dto.data.recurringSkips.length === 0) return;

    await entityManager.save(
      RecurringOccurrenceSkip,
      dto.data.recurringSkips.map((skip) =>
        Object.assign(new RecurringOccurrenceSkip(), {
          recurringId: skip.recurringId,
          date: skip.date,
          userId,
          deletedAt: null,
        }),
      ),
    );
  }

  private async listPreferenceForBackup(userId: string): Promise<BackupPayload['data']['preference']> {
    const preference = await AppDataSource.getRepository(UserPreference).findOneBy({ userId });

    return {
      showIncome: preference?.showIncome ?? false,
      showExpense: preference?.showExpense ?? false,
      pushEnabled: preference?.pushEnabled ?? false,
    };
  }

  private buildImportedTagLinks(transactions: TransactionDto[], recurrings: RecurringDto[]): ImportedTagLink[] {
    const dedupedLinks = new Map<string, ImportedTagLink>();

    for (const transaction of transactions) {
      for (const tag of transaction.tags) {
        dedupedLinks.set(`${transaction.id}:${tag.id}`, {
          transactionId: transaction.id,
          tagId: tag.id,
        });
      }
    }

    for (const recurring of recurrings) {
      for (const tagId of this.normalizeTagIds(recurring.tagIds)) {
        dedupedLinks.set(`${recurring.id}:${tagId}`, {
          transactionId: recurring.id,
          tagId,
        });
      }
    }

    return [...dedupedLinks.values()];
  }

  private normalizeTagIds(tagIds?: string[] | null): string[] {
    if (!Array.isArray(tagIds)) {
      return [];
    }

    return [...new Set(tagIds.filter(Boolean))];
  }

  private async listDebtsForBackup(userId: string): Promise<BackupDebtDto[]> {
    const debts = await this.debts.list(userId, 'all');

    return debts.map((debt) => ({
      ...debt,
      createdAt: debt.createdAt.toISOString(),
    }));
  }

  private async listTransactionsForBackup(userId: string): Promise<BackupTransactionDto[]> {
    const transactions = await AppDataSource.getRepository(Expense).find({
      where: { userId, interval: IsNull(), date: Not(IsNull()) },
      relations: ['transactionTags', 'transactionTags.tag', 'vault'],
      order: { updatedAt: 'DESC' },
    });

    return transactions.map((transaction) => ({
      id: transaction.id,
      userId: transaction.userId,
      title: transaction.title,
      amount: parseFloat(String(transaction.amount)),
      type: transaction.type,
      date: transaction.date,
      vaultId: transaction.vaultId,
      vault: transaction.vault ? { id: transaction.vault.id, name: transaction.vault.name, icon: transaction.vault.icon } : null,
      tags: transaction.transactionTags?.map((transactionTag) => transactionTag.tag).filter((tag): tag is Tag => Boolean(tag)) ?? [],
      isCommitted: true,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
      sourceRecurringId: transaction.sourceRecurringId ?? null,
    }));
  }

  private async listRecurringsForBackup(userId: string): Promise<RecurringDto[]> {
    const recurrings = await AppDataSource.getRepository(Expense).find({
      where: { userId, interval: Not(IsNull()) },
      relations: ['transactionTags', 'transactionTags.tag', 'vault'],
      order: { title: 'ASC' },
      withDeleted: true,
    });

    return recurrings.map((recurring) => ({
      ...recurring,
      tagIds: recurring.transactionTags?.map((transactionTag) => transactionTag.tagId) ?? [],
      tags: recurring.transactionTags?.map((transactionTag) => transactionTag.tag).filter((tag): tag is Tag => Boolean(tag)) ?? [],
      createdAt: recurring.createdAt.toISOString(),
      updatedAt: recurring.updatedAt.toISOString(),
      deletedAt: recurring.deletedAt ? recurring.deletedAt.toISOString() : null,
    }));
  }

  private async listRecurringSkipsForBackup(userId: string): Promise<BackupRecurringSkipDto[]> {
    const skips = await AppDataSource.getRepository(RecurringOccurrenceSkip).find({
      where: { userId },
      order: { recurringId: 'ASC', date: 'ASC' },
    });

    return skips.map((skip) => ({
      recurringId: skip.recurringId,
      date: skip.date,
      userId: skip.userId,
    }));
  }
}
