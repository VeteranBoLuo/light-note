import express from 'express';
import * as aiQuota from '../util/aiQuota.js';
import { getUserAiUsage } from '../util/aiUsageService.js';
import { resultData } from '../util/common.js';
import { aiUsageReadRateLimiter } from '../util/requestRateLimit.js';

const router = express.Router();

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

// AI 用量明细只按实际支付额度的登录账号查询，不返回问题、标题、URL、正文或错误原文。
router.post('/aiUsage', aiUsageReadRateLimiter, async (req, res) => {
  const quotaUser = req.billingUser || req.user;
  if (!quotaUser?.id || quotaUser.id === 'visitor' || quotaUser.role === 'visitor') {
    return res.status(401).send(resultData({ code: 'AI_USAGE_AUTH_REQUIRED' }, 401, '登录后才能查看 AI 用量明细'));
  }
  try {
    return res.send(resultData(await getUserAiUsage(quotaUser.id, req.body || {})));
  } catch (error) {
    const status = Number(error?.status || 503);
    const code = String(error?.code || 'AI_USAGE_STORE_UNAVAILABLE');
    if (status >= 500) console.error('[ai-usage] query failed code=%s', code);
    return res
      .status(status)
      .send(resultData({ code }, status, status === 401 ? error.message : 'AI 用量明细暂不可用'));
  }
});

export default router;
