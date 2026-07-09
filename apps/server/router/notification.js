import express from 'express';
import * as notificationHandle from '../router_handle/notificationHandle.js';

const router = express.Router();

router.post('/list', notificationHandle.list);
router.post('/unreadCount', notificationHandle.unreadCount);
router.post('/markRead', notificationHandle.markRead);
router.post('/markAllRead', notificationHandle.markAllRead);
router.post('/send', notificationHandle.send);

export default router;
