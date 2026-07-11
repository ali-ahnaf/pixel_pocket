import Joi from 'joi';
import { asyncHandler } from '../../middleware/error-handler';
import { utilService } from '../../services';
import {AdventureItemService} from '../../services/adventure_items.service';
import { Router } from 'express';
const router = Router({ mergeParams: true });

router.delete('/:itemId', asyncHandler(async (req, res) => {

  const {itemId} = req.params;
  const adventureItem = new AdventureItemService();

  const delete_items = await adventureItem.deleteAdventureItemById(itemId);
  return utilService.replyOk(res, delete_items);

}))

export default router;