import express from 'express';
import * as aiQuota from '../util/aiQuota.js';
import { resultData } from '../util/common.js';

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

export default router;
