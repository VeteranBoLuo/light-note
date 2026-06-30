import express from 'express';
const router = express.Router();

import * as chatHandle from '../router_handle/chatHandle.js';
import { agentChat } from '../router_handle/agentHandle.js';

router.post('/receiveMessage', chatHandle.receiveMessage);
router.post('/agent', agentChat);
router.post('/generateBookmarkMeta', chatHandle.generateBookmarkMeta);
router.post('/generateBookmarkDescription', chatHandle.generateBookmarkDescription);
router.post('/generateTagIcon', chatHandle.generateTagIcon);

export default router;
