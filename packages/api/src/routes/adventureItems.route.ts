import {Router} from 'express';
const router = Router({mergeParams: true});
import createItems from "./adventure_items/post-apply.route"
import updateAdventureItems from "./adventure_items/put-apply.route"
import deleteAdventureItems from "./adventure_items/delete-adventure.route"
import getAdventureItem from "./adventure_items/get-adventure-item.route"
import getAllAdventureItems from "./adventure_items/get-all-adventure-items.route"

router.use(createItems);
router.use(updateAdventureItems);
router.use(deleteAdventureItems);
router.use(getAdventureItem);
router.use(getAllAdventureItems);


export default router;
