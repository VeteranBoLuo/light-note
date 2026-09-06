import express from 'express';
import * as workbenchHandle from '../router_handle/workbenchHandle.js';
import { aiActionRateLimiter } from '../util/requestRateLimit.js';

const router = express.Router();

router.post('/summary', workbenchHandle.getWorkbenchSummary);
// 移动端「今日」专用轻量聚合，不跑桌面工作台的趋势/图表/排行查询
router.post('/today', workbenchHandle.getWorkbenchToday);
router.get('/daily-brief', workbenchHandle.getWorkbenchDailyBrief);
router.post('/daily-brief/ensure', aiActionRateLimiter, workbenchHandle.ensureWorkbenchDailyBrief);
router.post('/daily-brief/refresh', aiActionRateLimiter, workbenchHandle.refreshWorkbenchDailyBrief);
router.get('/daily-brief/preference', workbenchHandle.getWorkbenchDailyBriefPreference);
router.put('/daily-brief/preference', workbenchHandle.putWorkbenchDailyBriefPreference);

export default router;
