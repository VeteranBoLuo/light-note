import express from 'express';
const router = express.Router();

import * as chatHandle from '../router_handle/chatHandle.js';
import {
  agentChat,
  confirmAgentTool,
  generateAgentFollowUps,
  prepareAgentToolAction,
  rejectAgentTool,
  respondAgentInteraction,
} from '../router_handle/agentHandle.js';
import * as aiQuota from '../util/aiQuota.js';
import { resultData } from '../util/common.js';
import * as aiDocumentHandle from '../router_handle/aiDocumentHandle.js';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// 只限制“新增一个待解析文件”的用户意图。确认上传、删除附件属于同一次上传的
// 后续步骤，若共用同一个计数桶，会让一次正常上传消耗 2～3 次额度。
const attachmentCreateLimiter = rateLimit({
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
  handler: (req, res) => {
    const resetAt = req.rateLimit?.resetTime;
    const retryAfter = resetAt instanceof Date ? Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000)) : 0;
    return res.status(429).send({
      data: { code: 'RATE_LIMITED', retryAfter },
      status: 429,
      msg: '文件操作过于频繁，请稍后再试',
    });
  },
});

// 结构化附件动作不调用 LLM，但会校验附件/文件夹并写入一次性 Redis 确认。
// 独立限频避免恶意反复点击制造大量待确认令牌，不占用文件上传的额度。
const agentWriteActionLimiter = rateLimit({
  windowMs: 60 * 1000,
  // 准备与确认共享同一个计数桶：正常一次操作消耗 2 次，约允许每分钟完成 20 项写操作。
  limit: 40,
  keyGenerator: (req) => {
    const actor = req.billingUser || req.user || {};
    return actor.isAuthenticated && actor.role !== 'visitor' && actor.id
      ? `ai-action:user:${actor.id}`
      : `ai-action:ip:${ipKeyGenerator(req.ip || 'unknown')}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).send({
      data: {
        code: 'RATE_LIMITED',
        retryAfter:
          req.rateLimit?.resetTime instanceof Date
            ? Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000))
            : 0,
      },
      status: 429,
      msg: 'AI 写操作过于频繁，请稍后再试',
    }),
});

// 回答后的相关问题会自动触发一次短模型调用，不占用户可见 AI 额度；独立限频避免重放 requestId 放大平台成本。
const agentFollowUpLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => {
    const actor = req.billingUser || req.user || {};
    return actor.isAuthenticated && actor.role !== 'visitor' && actor.id
      ? `ai-follow-up:user:${actor.id}`
      : `ai-follow-up:ip:${ipKeyGenerator(req.ip || 'unknown')}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.send({
      data: { code: 'RATE_LIMITED' },
      status: 429,
      msg: '相关问题生成过于频繁，请稍后再试',
    }),
});

router.post('/agent', agentChat);
router.post('/agent/follow-ups', agentFollowUpLimiter, generateAgentFollowUps);
router.post('/agent/actions/prepare', agentWriteActionLimiter, prepareAgentToolAction);
router.post('/agent/interactions/respond', agentWriteActionLimiter, respondAgentInteraction);
router.post('/agent/confirm', agentWriteActionLimiter, confirmAgentTool);
router.post('/agent/confirm/reject', rejectAgentTool);
router.post('/attachments/init', attachmentCreateLimiter, aiDocumentHandle.initTemporaryUpload);
router.post('/attachments/confirm', aiDocumentHandle.confirmTemporaryUpload);
router.post('/attachments/attachCloudFile', attachmentCreateLimiter, aiDocumentHandle.attachCloudFile);
router.post('/attachments/status', aiDocumentHandle.getStatuses);
router.post('/attachments/delete', aiDocumentHandle.removeAttachment);
router.post('/attachments/clearTemporary', aiDocumentHandle.clearTemporaryAttachments);
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
