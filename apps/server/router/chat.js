import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import * as aiQuota from '../util/aiQuota.js';
import { resultData } from '../util/common.js';
import * as aiConversationHandle from '../router_handle/aiConversationHandle.js';

const router = express.Router();

// 旧会话已经降级为只读档案。列表、查看、导出与删除仍服务用户的数据权利，
// 但不再保留任何创建、续聊、恢复、反馈、记忆、变更集或 Agent 工具入口。
const aiArchiveDeleteLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (req) => {
    const actor = req.billingUser || req.user || {};
    return actor.isAuthenticated && actor.role !== 'visitor' && actor.id
      ? `ai-archive-delete:user:${actor.id}`
      : `ai-archive-delete:ip:${ipKeyGenerator(req.ip || 'unknown')}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).send(
      resultData(
        {
          code: 'RATE_LIMITED',
          retryAfter:
            req.rateLimit?.resetTime instanceof Date
              ? Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000))
              : 0,
        },
        429,
        '操作过于频繁，请稍后再试',
      ),
    ),
});

router.post('/conversations/list', aiConversationHandle.listConversations);
router.post('/conversations/get', aiConversationHandle.getConversation);
router.post('/conversations/delete', aiArchiveDeleteLimiter, aiConversationHandle.removeConversation);
router.post('/conversations/clear', aiArchiveDeleteLimiter, aiConversationHandle.clearConversations);
router.post('/conversations/clear-all-data', aiArchiveDeleteLimiter, aiConversationHandle.clearAllAiData);
router.post('/conversations/export', aiConversationHandle.exportConversations);

// AI 今日额度状态供设置页展示；所有角色均受统一 Execution 额度约束。
router.post('/aiQuota', async (req, res) => {
  try {
    const quotaUser = req.billingUser || req.user;
    const context = { userId: quotaUser?.id || 'visitor', userRole: quotaUser?.role || 'visitor' };
    return res.send(resultData(await aiQuota.getStatus(req, context)));
  } catch {
    console.error('获取 AI 额度失败: AI_QUOTA_STATUS_FAILED');
    return res.send(resultData(null, 500, '获取额度失败'));
  }
});

export default router;
