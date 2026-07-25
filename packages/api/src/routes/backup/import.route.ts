import express, { ErrorRequestHandler, Request, Response, Router } from 'express';
import { RecurringDto, TagDto, User, UserPreferenceDto, VaultDto } from '@expense-tracker/shared';
import Joi from 'joi';
import { asyncHandler } from '../../middleware/error-handler';
import { backupService, logger, utilService } from '../../services';
import { BACKUP_FILE_CONTENT_TYPE, BACKUP_MAX_FILE_SIZE_BYTES, BackupDebtDto, BackupPayload, BackupRecurringSkipDto, BackupTransactionDto } from '../../types/backup';

const router = Router({ mergeParams: true });

function isPayloadTooLargeError(error: unknown): boolean {
  return error instanceof Error && (('status' in error && error.status === 413) || ('statusCode' in error && error.statusCode === 413));
}

const backupPayloadTooLargeHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (isPayloadTooLargeError(error)) {
    logger.warn('Backup import payload exceeds maximum size', {
      message: error instanceof Error ? error.message : undefined,
      statusCode: 413,
    });
    utilService.replyError(res, 'Backup file exceeds the maximum allowed size', 413);
    return;
  }

  next(error);
};

const tagValidateSchema = Joi.object<TagDto>({
  id: Joi.string().uuid().required(),
  userId: Joi.string().uuid().required(),
  name: Joi.string().max(100).required(),
  icon: Joi.string().max(100).allow(null).required(),
  backgroundColor: Joi.string().max(50).allow(null).required(),
});

const importDataSchema = Joi.object<BackupPayload>({
  appVersion: Joi.string().required(),
  exportedAt: Joi.string().isoDate().required(),
  data: Joi.object({
    user: Joi.object<User>({
      id: Joi.string().uuid().required(),
      name: Joi.string().max(100).required(),
      email: Joi.string().email().max(255).required(),
      avatar: Joi.string().required(),
      disableAiPrompt: Joi.boolean(),
    }).required(),
    debts: Joi.array()
      .items(
        Joi.object<BackupDebtDto>({
          id: Joi.string().uuid().required(),
          userId: Joi.string().uuid().required(),
          title: Joi.string().max(200).required(),
          amount: Joi.number().positive().precision(2).required(),
          type: Joi.string().valid('expense', 'income').required(),
          notes: Joi.string().allow(null, '').max(2000).optional(),
          dueDate: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .allow(null)
            .required(),
          createdAt: Joi.string().isoDate().required(),
          completed: Joi.boolean(),
          discarded: Joi.boolean(),
        }),
      )
      .min(0)
      .required(),
    vaults: Joi.array()
      .items(
        Joi.object<VaultDto>({
          id: Joi.string().uuid().required(),
          userId: Joi.string().uuid().required(),
          name: Joi.string().max(100).required(),
          description: Joi.string().max(255).allow('').required(),
          icon: Joi.string().max(100).allow(null).required(),
          backgroundColor: Joi.string().max(50).allow(null).required(),
          isDefault: Joi.boolean().required(),
          monthlyBudget: Joi.number().positive().precision(2).allow(null).required(),
        }),
      )
      .min(0)
      .required(),
    transactions: Joi.array()
      .items(
        Joi.object<BackupTransactionDto>({
          id: Joi.string().uuid().required(),
          userId: Joi.string().uuid().required(),
          title: Joi.string().max(200).allow(null, '').required(),
          amount: Joi.number().positive().precision(2).required(),
          type: Joi.string().valid('expense', 'income').required(),
          date: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required(),
          vaultId: Joi.string().uuid().allow(null).required(),
          vault: Joi.object({
            id: Joi.string().uuid().required(),
            name: Joi.string().max(100).required(),
            icon: Joi.string().max(100).allow(null).required(),
          })
            .allow(null)
            .required(),
          tags: Joi.array().items(tagValidateSchema).min(0).required(),
          // Accepted for backward compatibility with backups exported before the
          // column was dropped; the value is discarded.
          isCommitted: Joi.boolean().optional().strip(),
          createdAt: Joi.string().isoDate().required(),
          updatedAt: Joi.string().isoDate().required(),
          sourceRecurringId: Joi.string().uuid().allow(null).required(),
        }),
      )
      .min(0)
      .required(),
    recurrings: Joi.array()
      .items(
        Joi.object<RecurringDto>({
          id: Joi.string().uuid().required(),
          userId: Joi.string().uuid().required(),
          title: Joi.string().max(200).allow(null, '').required(),
          amount: Joi.number().positive().precision(2).required(),
          type: Joi.string().valid('expense', 'income').required(),
          date: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .allow(null)
            .required(),
          interval: Joi.string().valid('daily', 'weekly', 'monthly', 'yearly').required(),
          startDate: Joi.string().isoDate().required(),
          endDate: Joi.string().isoDate().allow(null).required(),
          vaultId: Joi.string().uuid().allow(null).required(),
          createdAt: Joi.string().isoDate().required(),
          updatedAt: Joi.string().isoDate().required(),
          deletedAt: Joi.string().isoDate().allow(null).required(),
          tagIds: Joi.array().items(Joi.string().uuid()).unique().required(),
          tags: Joi.array().items(tagValidateSchema).min(0).required(),
        }),
      )
      .min(0)
      .required(),
    recurringSkips: Joi.array()
      .items(
        Joi.object<BackupRecurringSkipDto>({
          recurringId: Joi.string().uuid().required(),
          date: Joi.string()
            .pattern(/^\d{4}-\d{2}-\d{2}$/)
            .required(),
          userId: Joi.string().uuid().required(),
        }),
      )
      .min(0)
      .required(),
    preference: Joi.object<UserPreferenceDto>({
      showIncome: Joi.boolean().required(),
      showExpense: Joi.boolean().required(),
    }).required(),
    tags: Joi.array().items(tagValidateSchema).min(0).required(),
  }).required(),
});

router.post(
  '/import',
  express.raw({ type: [BACKUP_FILE_CONTENT_TYPE, 'application/octet-stream'], limit: BACKUP_MAX_FILE_SIZE_BYTES }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return utilService.replyError(res, 'Backup file is required');
    }

    const parsedBackup = backupService.parseBackupFile(req.body);
    const { error, value } = importDataSchema.validate(parsedBackup, {
      stripUnknown: { objects: true },
    });
    if (error) return utilService.replyError(res, error.message);

    const saved = await backupService.importData(req.user!.userId, value);
    return utilService.replyOk(res, saved);
  }),
);

router.use(backupPayloadTooLargeHandler);

export default router;
