import express from 'express';
import * as inboxHandle from '../router_handle/inboxHandle.js';

const router = express.Router();

router.post('/list', inboxHandle.listInbox);
router.post('/count', inboxHandle.countInbox);
router.post('/enqueue', inboxHandle.enqueueInbox);
router.post('/complete', inboxHandle.completeInbox);

export default router;
