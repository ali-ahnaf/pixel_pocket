import { Request, Response, Router } from 'express';
import {Adventure} from '@expense-tracker/shared/src/contracts/adventure';
import Joi from 'joi';
import { asyncHandler } from '../../middleware/error-handler';
import { utilService } from '../../services';
const router = Router({ mergeParams: true });
import {AdventureService} from "../../services/adventure.service"

const UpdateAdventureSchema = Joi.object<Adventure>({
  name: Joi.string().optional(),
  description: Joi.string().optional(),
  icon: Joi.string().optional(),
  backgroundColor: Joi.string().optional(),
  startDate:Joi.string().optional(),
  endDate:Joi.string().optional(),
  isComplete: Joi.boolean().optional(),
})

router.put("/:adventureId",asyncHandler(async (req: Request, res: Response) => {

  const {error,value}= UpdateAdventureSchema.validate(req.body);
  if (error) return utilService.replyError(res, error.message);
  const{adventureId}=req.params;
  const adventure = new AdventureService();
  const update_data = await adventure.update(adventureId,value);
  return utilService.replyCreated(res, update_data);

}))

export default router;


