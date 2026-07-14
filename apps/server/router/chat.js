import express from 'express';
const router = express.Router();

import * as chatHandle from '../router_handle/chatHandle.js';
import { agentChat, confirmAgentTool, rejectAgentTool } from '../router_handle/agentHandle.js';
import * as aiQuota from '../util/aiQuota.js';
import { resultData } from '../util/common.js';

router.post('/agent', agentChat);
router.post('/agent/confirm', confirmAgentTool);
router.post('/agent/confirm/reject', rejectAgentTool);
// AI 今日额度状态(供助手展示「已用 / 剩余」);root/本机自测豁免返回 { exempt:true }
router.post('/aiQuota', async (req, res) => {
  try {
    const quotaUser = req.billingUser || req.user;
    const ctx = { userId: quotaUser?.id || 'visitor', userRole: quotaUser?.role || 'visitor' };
    res.send(resultData(await aiQuota.getStatus(req, ctx)));
  } catch (e) {
    console.error('获取 AI 额度失败:', e.message);
    res.send(resultData(null, 500, '获取额度失败'));
  }
});
router.post('/generateBookmarkMeta', chatHandle.generateBookmarkMeta);
router.post('/generateBookmarkDescription', chatHandle.generateBookmarkDescription);
router.post('/generateTagIcon', chatHandle.generateTagIcon);

export default router;
