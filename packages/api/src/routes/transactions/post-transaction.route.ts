import { Request, Response, Router } from 'express';
import Joi from 'joi';
import { CreateTransactionInput } from '@expense-tracker/shared';
import { transactionsService, utilService } from '../../services';
import { asyncHandler } from '../../middleware/error-handler';

const router = Router({ mergeParams: true });
const createTransactionSchema = Joi.object<CreateTransactionInput>({
  amount: Joi.number().positive().precision(2).required(),
  type: Joi.string().valid('expense', 'income').default('expense'),
  tagIds: Joi.array().items(Joi.string().uuid()).default([]),
  title: Joi.string().max(200).allow(null, '').optional(),
  vaultId: Joi.string().uuid().allow(null).optional(),
  date: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = createTransactionSchema.validate(req.body);
    if (error) return utilService.replyError(res, error.message);

    const saved = await transactionsService.create(req.user!.userId, value as CreateTransactionInput);
    return utilService.replyCreated(res, saved);
  }),
);

export default router;
