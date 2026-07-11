import { Request, Response, Router } from 'express';
import {  utilService } from '../../services';
const router = Router({ mergeParams: true });
import {AdventureService} from "../../services/adventure.service"

router.get('/', async (req: Request, res: Response) => {

  const {userId} = req.params;
  const adventure = new AdventureService();
  const result = await adventure.findAllAdventuresByUserId(userId);
  return utilService.replyCreated(res, result);

})

export default  router ;