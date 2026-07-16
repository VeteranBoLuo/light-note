import express from 'express';
const router = express.Router();

import * as chatHandle from '../router_handle/chatHandle.js';
import { agentChat, confirmAgentTool, rejectAgentTool } from '../router_handle/agentHandle.js';
import * as aiQuota from '../util/aiQuota.js';
import { resultData } from '../util/common.js';
import * as aiDocumentHandle from '../router_handle/aiDocumentHandle.js';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const attachmentUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 24,
  keyGenerator: (req) => {
    const actor = req.billingUser || req.user || {};
    return actor.isAuthenticated && actor.role !== 'visitor' && actor.id
      ? `ai-document:user:${actor.id}`
      : `ai-document:ip:${ipKeyGenerator(req.ip || 'unknown')}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).send({ data: { code: 'RATE_LIMITED' }, status: 429, msg: '文件操作过于频繁，请稍后再试' }),
});

router.post('/agent', agentChat);
router.post('/agent/confirm', confirmAgentTool);
router.post('/agent/confirm/reject', rejectAgentTool);
router.post('/attachments/init', attachmentUploadLimiter, aiDocumentHandle.initTemporaryUpload);
router.post('/attachments/confirm', attachmentUploadLimiter, aiDocumentHandle.confirmTemporaryUpload);
router.post('/attachments/attachCloudFile', attachmentUploadLimiter, aiDocumentHandle.attachCloudFile);
router.post('/attachments/status', aiDocumentHandle.getStatuses);
router.post('/attachments/delete', attachmentUploadLimiter, aiDocumentHandle.removeAttachment);
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
