import { asyncHandler } from '../../middleware/error-handler';
import { utilService } from '../../services';
import {AdventureItemService} from '../../services/adventure_items.service';
import { Router } from 'express';
const router = Router({ mergeParams: true });

router.get('/', asyncHandler(async (req, res) => {
  const {adventureId} = req.params;
  const adventureItem = new AdventureItemService();
  const result = await adventureItem.findAllAdventureItems(adventureId);

  return utilService.replyOk(res, result);

}))

export default router;