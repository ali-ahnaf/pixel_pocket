import { Request, Response, Router } from 'express';
import Joi from 'joi';
import { UserPreferenceDto } from '@expense-tracker/shared';
import { preferencesService, utilService } from '../../services';
import { UpdateUserPreferenceInput } from '../../services/preferences.service';
import { asyncHandler } from '../../middleware/error-handler';

const router = Router({ mergeParams: true });

const updatePreferencesSchema = Joi.object<UpdateUserPreferenceInput>({
  showIncome: Joi.boolean(),
  showExpense: Joi.boolean(),
  pushEnabled: Joi.boolean(),
  aiTransactionEntryEnabled: Joi.boolean(),
}).min(1);

router.put(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = updatePreferencesSchema.validate(req.body);
    if (error) return utilService.replyError(res, error.message);

    const preference = await preferencesService.update(req.user!.userId, value as UpdateUserPreferenceInput);
    const dto: UserPreferenceDto = {
      showIncome: preference.showIncome,
      showExpense: preference.showExpense,
      pushEnabled: preference.pushEnabled,
      aiTransactionEntryEnabled: preference.aiTransactionEntryEnabled,
    };
    return utilService.replyOk(res, dto);
  }),
);

export default router;
