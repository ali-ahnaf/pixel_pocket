import { Request, Response, Router } from 'express';
import Joi from 'joi';
import { usersService, utilService } from '../../services';
import { UpdateUserInput } from '@expense-tracker/shared';
import { asyncHandler } from '../../middleware/error-handler';

const router = Router();
const updateUserSchema = Joi.object<UpdateUserInput>({
  name: Joi.string().max(100),
  email: Joi.string().email().max(255),
  avatar: Joi.string().max(255).allow(''),
  disableAiPrompt: Joi.boolean(),
  hasOnboarded: Joi.boolean(),
}).min(1);

router.put(
  '/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const { error, value } = updateUserSchema.validate(req.body);
    if (error) return utilService.replyError(res, error.message);

    const saved = await usersService.update(req.user!.userId, value as UpdateUserInput);
    return utilService.replyOk(res, saved);
  }),
);

export default router;
