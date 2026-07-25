import { Request, Response, Router } from 'express';
import { UserPreferenceDto } from '@expense-tracker/shared';
import { preferencesService, utilService } from '../../services';
import { asyncHandler } from '../../middleware/error-handler';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const preference = await preferencesService.getOrCreate(req.user!.userId);
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
