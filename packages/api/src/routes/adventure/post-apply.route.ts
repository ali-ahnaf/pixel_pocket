import { Request, Response, Router } from 'express';
import {Adventure} from '@expense-tracker/shared/src/contracts/adventure';
import Joi from 'joi';
import { asyncHandler } from '../../middleware/error-handler';
import { utilService } from '../../services';
const router = Router({ mergeParams: true });
import {AdventureService} from "../../services/adventure.service"

const adventureSchema = Joi.object<Adventure>({
  name: Joi.string(),
  description: Joi.string(),
  icon: Joi.string(),
  backgroundColor: Joi.string(),
  startDate:Joi.string(),
  endDate:Joi.string(),
  isComplete: Joi.boolean(),
})

router.post("/" , asyncHandler(async (req,
                                                      res) => {
   const {error,value} =  adventureSchema.validate(req.body);
   if(error) return utilService.replyError(res, error.message);
   const adventure = new AdventureService();
   const result = await adventure.create({...value,userId:req.user?.userId || null});
   return utilService.replyCreated(res, result);

}))



export default router;
