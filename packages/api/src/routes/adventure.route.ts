import { Router } from 'express';
const router = Router({ mergeParams: true });
import adventureItemCreate from './adventure/post-apply.route';
import adventureItemUpdate from './adventure/put-adventure.route';
import deleteAdventureItemRoute from './adventure/delete-adventure.route'
import getAdventureItemDetail from './adventure/get-adventure.route'
import getAllAdventures from './adventure/get-all-adventure.route'

router.use(adventureItemCreate);
router.use(adventureItemUpdate);
router.use(deleteAdventureItemRoute);
router.use(getAdventureItemDetail);
router.use(getAllAdventures);

export default router;

