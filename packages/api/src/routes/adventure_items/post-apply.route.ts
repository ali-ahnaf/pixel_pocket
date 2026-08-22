import Joi from 'joi';
import { asyncHandler } from '../../middleware/error-handler';
import { utilService } from '../../services';
import {AdventureItemService} from '../../services/adventure_items.service';
import { Router } from 'express';
const router = Router({ mergeParams: true });

const adventureItemSchema = Joi.object({
  name: Joi.string().optional(),
  amount: Joi.number().optional(),

})

router.post("/" , asyncHandler(async (req,
                                                      res) => {

  const {error,value} =  adventureItemSchema.validate(req.body);
  const{adventureId}=req.params;
  if(error) return utilService.replyError(res, error.message);
  const adventureItem = new AdventureItemService();

  const result= await adventureItem.createAdventureItem({...value,adventureId:adventureId});
  return utilService.replyCreated(res, result);

}))


export default router;