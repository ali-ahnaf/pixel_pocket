import Joi from 'joi';
import { asyncHandler } from '../../middleware/error-handler';
import { utilService } from '../../services';
import {AdventureItemService} from '../../services/adventure_items.service';
import { Router } from 'express';
const router = Router({ mergeParams: true });

const UpdateAdventureItemSchema = Joi.object({
  name: Joi.string().optional(),
  amount: Joi.number().optional(),
})

router.put("/:itemId", asyncHandler(async (req,res) => {
  const {itemId} = req.params;
  const {error,value} = UpdateAdventureItemSchema.validate(req.body);
  if(error) return utilService.replyError(res, error.message);
  const adventureItem = new AdventureItemService();
  const update_item= await adventureItem.updateAdventureItem(itemId,value);
  return utilService.replyOk(res, update_item);
}))

export  default router;
