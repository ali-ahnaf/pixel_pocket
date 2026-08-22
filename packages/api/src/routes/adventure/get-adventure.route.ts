import { Request, Response, Router } from 'express';
import {  utilService } from '../../services';
const router = Router({ mergeParams: true });
import {AdventureService} from "../../services/adventure.service"

router.get('/get-detail/:id', async (req: Request, res: Response) => {

  const {id} = req.params;
  const adventure = new AdventureService();
  const result = await adventure.findAdventure(id);
  return utilService.replyCreated(res, result);

})

export default  router ;