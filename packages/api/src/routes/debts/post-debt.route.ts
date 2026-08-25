import { Request, Response, Router } from 'express';
import Joi from 'joi';
import { debtsService, utilService } from '../../services';
import { CreateDebtInput } from '../../services/debts.service';
import { asyncHandler } from '../../middleware/error-handler';

const router = Router({ mergeParams: true });

const createDebtSchema = Joi.object<CreateDebtInput>({
  title: Joi.string().max(200).required(),
  amount: Joi.number().positive().precision(2).required(),
  type: Joi.string().valid('expense', 'income').default('expense'),
  notes: Joi.string().allow(null, '').max(2000).optional(),
  dueDate: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .allow(null)
    .optional(),
  // Idempotency key sent by writes that were queued while the client was offline.
  clientRequestId: Joi.string().uuid().optional(),
});

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = createDebtSchema.validate(req.body);
    if (error) return utilService.replyError(res, error.message);

    const saved = await debtsService.create(req.user!.userId, value as CreateDebtInput);
    return utilService.replyCreated(res, saved);
  }),
);

export default router;
