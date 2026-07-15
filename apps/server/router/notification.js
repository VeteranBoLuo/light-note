import express from 'express';
import * as notificationHandle from '../router_handle/notificationHandle.js';

const router = express.Router();

router.post('/list', notificationHandle.list);
router.post('/unreadCount', notificationHandle.unreadCount);
router.post('/markRead', notificationHandle.markRead);
router.post('/markAllRead', notificationHandle.markAllRead);
router.post('/delete', notificationHandle.remove);
router.post('/send', notificationHandle.send);
// 后台通知中心(仅 root):概览 / 发送记录 / 撤回 / 删除
router.post('/admin/stats', notificationHandle.adminStats);
router.post('/admin/list', notificationHandle.adminList);
router.post('/admin/recall', notificationHandle.adminRecall);
router.post('/admin/delete', notificationHandle.adminDelete);

export default router;
