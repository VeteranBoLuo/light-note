import express from 'express';
import bodyParser from 'body-parser';
import { logFunction } from './util/log.js';
import { baseRouter } from './util/common.js';
import { accountBanMiddleware, authMiddleware, startSessionMaintenance } from './util/auth.js';
import { adminRoutePolicyMiddleware } from './util/adminRoutePolicy.js';
import { attackMonitor, ensureSecurityTables, cleanupExpiredSecurityEvents } from './util/security/index.js';
import { cleanupAllExpiredTrash } from './router_handle/trashHandle.js';
import { generateWeeklyReports } from './util/weeklyReport.js';
import { ensureNotificationTable } from './util/notification.js';
import { initLogExclude } from './util/logExclude.js';
import { ensurePointsSchema } from './util/points.js';
import { generateGrowthNudges } from './util/growth.js';
import { ensureBookmarkSnapshotTable } from './util/snapshot.js';
import { ensureBookmarkHealthTable } from './util/linkHealth.js';
import { startTodoReminderScheduler } from './util/todoReminder.js';
import { globalRateLimiter } from './util/requestRateLimit.js';
import { ensureFeatureRequestTables } from './util/featureRequestSchema.js';
import { ensureAiDocumentSchema } from './util/aiDocumentSchema.js';

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import './db/index.js';

// 获取 __dirname 的 ES 模块等效写法
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
console.log('Loaded env from: 【.env】');

// 建立一个Express服务器
const app = express();
app.set('trust proxy', 1);
app.use(bodyParser.json({ limit: '10mb', extended: true }));
//  解析请求体中的JSON数据
app.use(express.json());

// 还原可信登录态
app.use(authMiddleware);
// 管理员预览/维护上下文采用显式语义策略；未声明接口默认拒绝。
app.use(adminRoutePolicyMiddleware);
// 账号封禁只拦业务访问，登录/退出等入口继续放行
app.use(accountBanMiddleware);
// 安全防护与攻击事件采集
app.use(attackMonitor);
// 日志记录中间件
app.use(logFunction);
// 全站兜底限流按真实操作者分桶，避免一个页面的并发初始化请求或同一网络下的用户互相误伤。
// 登录、注册等高风险接口仍在各自路由保留更严格的独立限制。
app.use(globalRateLimiter);

const allRouter = [
  ...baseRouter,
  {
    path: '/files',
    router: express.static('/www/wwwroot/files'), // 设置静态文件目录,
  },
  {
    path: '/uploads',
    router: express.static('/www/wwwroot/images'), // 设置静态文件目录
  },
];
allRouter.forEach((item) => {
  app.use(item.path, item.router);
});

startSessionMaintenance();
ensureSecurityTables().catch((err) => console.error('安全模块初始化失败:', err.message));
ensureNotificationTable().catch((err) => console.error('通知表初始化失败:', err.message));
// 白名单缓存必须在开始接请求前加载完:否则重启后的空窗期(异步加载未完成)会漏过滤、记下本该跳过的自己人日志(如部署后立刻用白名单设备操作)
await initLogExclude().catch((err) => console.error('日志白名单初始化失败:', err.message));
ensurePointsSchema().catch((err) => console.error('积分表初始化失败:', err.message));
ensureBookmarkSnapshotTable().catch((err) => console.error('书签快照表初始化失败:', err.message));
ensureBookmarkHealthTable().catch((err) => console.error('书签健康表初始化失败:', err.message));
ensureFeatureRequestTables().catch((err) => console.error('共建轻笺数据表初始化失败:', err.message));
ensureAiDocumentSchema().catch((err) => console.error('AI 文档数据表初始化失败:', err.message));

// 回收站定时清理（每天凌晨 3:00）
function scheduleTrashCleanup() {
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(3, 0, 0, 0);
  const delay = next.getTime() - now.getTime();

  setTimeout(() => {
    cleanupAllExpiredTrash();
    setInterval(cleanupAllExpiredTrash, 24 * 60 * 60 * 1000);
  }, delay);

  console.log(`[回收站] 定时清理已注册，首次执行: ${next.toLocaleString('zh-CN')}`);
}
scheduleTrashCleanup();

// 安全事件保留期清理（每天凌晨 4:00，错开回收站清理的 3:00，避免同机同时跑）
function scheduleSecurityEventsCleanup() {
  const now = new Date();
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(4, 0, 0, 0);
  const delay = next.getTime() - now.getTime();

  setTimeout(() => {
    cleanupExpiredSecurityEvents();
    setInterval(cleanupExpiredSecurityEvents, 24 * 60 * 60 * 1000);
  }, delay);

  console.log(`[安全] 事件保留期清理已注册，首次执行: ${next.toLocaleString('zh-CN')}`);
}
scheduleSecurityEventsCleanup();

// 成长周报（每周一凌晨 5:00 生成上周报告并推送「系统」通知,错开清理任务的 3:00/4:00）
function scheduleWeeklyReport() {
  const now = new Date();
  const next = new Date(now);
  const daysUntilMonday = (8 - next.getDay()) % 7 || 7; // 下一个周一(getDay: 0=周日,1=周一)
  next.setDate(next.getDate() + daysUntilMonday);
  next.setHours(5, 0, 0, 0);
  const delay = next.getTime() - now.getTime();

  setTimeout(() => {
    generateWeeklyReports();
    setInterval(generateWeeklyReports, 7 * 24 * 60 * 60 * 1000);
  }, delay);

  console.log(`[周报] 定时已注册，首次执行: ${next.toLocaleString('zh-CN')}`);
}
scheduleWeeklyReport();

// 每日 20:00 生成成长提醒(连签将断),晚间提醒当天未签到的用户守住连签
function scheduleGrowthNudges() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(20, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  setTimeout(() => {
    generateGrowthNudges();
    setInterval(generateGrowthNudges, 24 * 60 * 60 * 1000);
  }, next.getTime() - now.getTime());
  console.log(`[成长提醒] 定时已注册,首次执行: ${next.toLocaleString('zh-CN')}`);
}
scheduleGrowthNudges();
startTodoReminderScheduler();

// 启动 Express 服务器
app.listen(9001, () => {
  console.log('服务器已启动：' + new Date().toLocaleString('zh-CN'));
});
