import { Request, Response, Router } from 'express';
import {Adventure} from '@expense-tracker/shared/src/contracts/adventure';
import Joi from 'joi';
import { asyncHandler } from '../../middleware/error-handler';
import { utilService } from '../../services';
const router = Router({ mergeParams: true });
import {AdventureService} from "../../services/adventure.service"
import * as repl from 'node:repl';


router.delete("/:adventureId", asyncHandler(async (req: Request, res: Response) => {
  const {adventureId} = req.params;
  const adventure = new AdventureService();
  const result =await adventure.delete(adventureId)

  return utilService.replyCreated(res, result);
}))

export default router;
