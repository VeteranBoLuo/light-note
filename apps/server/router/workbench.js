import express from 'express';
import * as workbenchHandle from '../router_handle/workbenchHandle.js';

const router = express.Router();

router.post('/summary', workbenchHandle.getWorkbenchSummary);
// 移动端「今日」专用轻量聚合，不跑桌面工作台的趋势/图表/排行查询
router.post('/today', workbenchHandle.getWorkbenchToday);

export default router;
