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
import { assertPointsEconomyActivationReady } from './util/pointsEconomyOperations.js';
import { ensureGrowthTaskSchema } from './util/growthTaskSchema.js';
import { ensureGrowthCenterSchema } from './util/growthCenterSchema.js';
import { assertPointsEarningActivationReady, getPointsEarningRuntime } from './util/pointsEarningPolicy.js';
import { getPointsCampaignRuntime } from './util/pointsCampaignService.js';
import { generateGrowthNudges } from './util/growth.js';
import { ensureBookmarkSnapshotTable } from './util/snapshot.js';
import { ensureBookmarkHealthTable } from './util/linkHealth.js';
import { startTodoReminderScheduler } from './util/todoReminder.js';
import { startTodoReminderV2Scheduler } from './util/todoReminderV2.js';
import { startTodoSeriesScheduler } from './util/todoSeriesScheduler.js';
import { getTodoPlanFeatureState } from './util/todoPlanFeature.js';
import { startEmailDeliveryLogCleanupScheduler } from './util/emailDelivery.js';
import { earlyAnonymousRateLimiter, globalRateLimiter } from './util/requestRateLimit.js';
import { ensureFeatureRequestTables } from './util/featureRequestSchema.js';
import { ensureAiDocumentSchema } from './util/aiDocumentSchema.js';
import { ensureFilePreviewSchema } from './util/filePreviewSchema.js';
import { ensureNoteTreeSchema } from './util/noteTreeSchema.js';
import { startAiProductEventRetentionScheduler } from './util/aiProductTelemetry.js';
import { startAiResponseRecoveryCleanupScheduler } from './util/aiResponseRecoveryService.js';
import { startAiExecutionRecoveryScheduler } from './util/aiExecution/recovery.js';
import { getAiArtifactRetentionConfig, startAiArtifactRetentionScheduler } from './util/aiArtifactRetention.js';
import { startAiBalanceSnapshotScheduler } from './util/agent/providerBalanceSnapshot.js';
import { stableAgentErrorCode } from './util/agent/logSafety.js';
import { getUploadStaticDirectories } from './util/bookmarkIconStorage.js';
import { startAccountDeletionCleanupScheduler } from './util/accountDeletion.js';
import { startOperationalLogRetentionScheduler } from './util/operationalLogRetention.js';
import { requestTraceMiddleware } from './util/requestTrace.js';
import { ensureResourceGovernanceSchema } from './util/resourceGovernanceSchema.js';
import { ensureCommunityChatSchema } from './util/communityChatSchema.js';
import { registerCommunityChatRealtimeHub } from './util/communityChat/realtimeHub.js';
import { startCommunityChatImageCleanupScheduler } from './util/services/communityChatImageService.js';
import { startCommunityChatCustomStickerCleanupScheduler } from './util/services/communityChatCustomStickerService.js';
import { ensureAfdianSupportOrderPurposeBackfill, ensureAfdianSupportSchema } from './util/afdianSupportSchema.js';
import { ensureAfdianSupportRewardSchema } from './util/afdianSupportRewardSchema.js';
import { ensureAfdianSupportPackageSchema } from './util/afdianSupportPackageSchema.js';
import { startAfdianReconciliationScheduler } from './util/afdianSupportService.js';
import { ensureAiBonusWalletSchema } from './util/aiBonusWalletSchema.js';

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import pool from './db/index.js';

// 获取 __dirname 的 ES 模块等效写法
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
console.log('Loaded env from: 【.env】');

// 建立一个Express服务器
const app = express();
app.set('trust proxy', 1);
app.use(requestTraceMiddleware);
// 在 Body 解析、鉴权和安全正则之前提供高上限的匿名来源保护，先挡住明显资源耗尽流量。
app.use(earlyAnonymousRateLimiter);
app.use(bodyParser.json({ limit: '10mb', extended: true }));
//  解析请求体中的JSON数据
app.use(express.json());

// 还原可信登录态
app.use(authMiddleware);
// 管理员预览/维护上下文采用显式语义策略；未声明接口默认拒绝。
app.use(adminRoutePolicyMiddleware);
// 账号封禁只拦业务访问，登录/退出等入口继续放行
app.use(accountBanMiddleware);
// 日志记录中间件
app.use(logFunction);
// 全站兜底限流按真实操作者分桶，避免一个页面的并发初始化请求或同一网络下的用户互相误伤。
// 登录、注册等高风险接口仍在各自路由保留更严格的独立限制。
app.use(globalRateLimiter);
// 路由感知的安全检测放在限流之后，避免过量请求先消耗正则、画像和事件计算。
app.use(attackMonitor);

const allRouter = [
  ...baseRouter,
  {
    path: '/files',
    router: express.static('/www/wwwroot/files'), // 设置静态文件目录,
  },
];
allRouter.forEach((item) => {
  app.use(item.path, item.router);
});
// 本地预览时 Worker 可把 favicon 写入临时目录；线上仍回退到既有上传目录。
// 多次挂载利用 express.static 的 fallthrough，找不到时继续尝试下一个目录。
for (const directory of getUploadStaticDirectories(process.env)) {
  app.use('/uploads', express.static(directory));
}

startSessionMaintenance();
// 安全策略与复核接口依赖新增列和策略表，启动监听前先完成幂等迁移，避免首批请求撞上半初始化 Schema。
try {
  await ensureSecurityTables();
} catch (err) {
  console.error('安全模块初始化失败 code=%s，终止启动', stableAgentErrorCode(err));
  process.exit(1);
}
ensureNotificationTable().catch((err) => console.error('通知表初始化失败 code=%s', stableAgentErrorCode(err)));
// 白名单缓存必须在开始接请求前加载完:否则重启后的空窗期(异步加载未完成)会漏过滤、记下本该跳过的自己人日志(如部署后立刻用白名单设备操作)
await initLogExclude().catch((err) => console.error('日志白名单初始化失败 code=%s', stableAgentErrorCode(err)));
// 成长中心读取接口必须保持纯只读，因此相关 Schema 在监听 HTTP 前完成，而不是在 GET 内兜底建表。
try {
  await ensurePointsSchema();
  await ensureAiBonusWalletSchema();
  await assertPointsEconomyActivationReady();
  await ensureGrowthTaskSchema();
  await ensureGrowthCenterSchema();
  await assertPointsEarningActivationReady({
    db: pool,
    runtime: getPointsEarningRuntime(),
    campaignRuntime: getPointsCampaignRuntime(),
  });
} catch (err) {
  console.error('成长中心 Schema 初始化失败 code=%s，终止启动', stableAgentErrorCode(err));
  process.exit(1);
}
try {
  await ensureAfdianSupportSchema();
  await ensureAfdianSupportRewardSchema();
  await ensureAfdianSupportPackageSchema();
  await ensureAfdianSupportOrderPurposeBackfill();
} catch (err) {
  console.error('爱发电支持模块 Schema 初始化失败 code=%s，终止启动', stableAgentErrorCode(err));
  process.exit(1);
}
ensureNoteTreeSchema().catch((err) => console.error('笔记页面树初始化失败 code=%s', stableAgentErrorCode(err)));
ensureBookmarkSnapshotTable().catch((err) => console.error('书签快照表初始化失败 code=%s', stableAgentErrorCode(err)));
ensureBookmarkHealthTable().catch((err) => console.error('书签健康表初始化失败 code=%s', stableAgentErrorCode(err)));
ensureFeatureRequestTables().catch((err) =>
  console.error('共建轻笺数据表初始化失败 code=%s', stableAgentErrorCode(err)),
);
ensureAiDocumentSchema().catch((err) => console.error('AI 文档数据表初始化失败 code=%s', stableAgentErrorCode(err)));
ensureFilePreviewSchema().catch((err) => console.error('文件预览数据表初始化失败 code=%s', stableAgentErrorCode(err)));
// 治理接口必须先有完整快照/审计表；这里只做幂等 Schema 就绪，不在 HTTP 进程执行任何扫描或清理。
await ensureResourceGovernanceSchema().catch((err) => {
  console.error('资源治理 Schema 初始化失败 code=%s，治理接口将失败关闭', stableAgentErrorCode(err));
});
ensureCommunityChatSchema()
  .then(() => {
    startCommunityChatImageCleanupScheduler().catch((err) =>
      console.error('社区客厅图片清理调度启动失败 code=%s', stableAgentErrorCode(err)),
    );
    startCommunityChatCustomStickerCleanupScheduler().catch((err) =>
      console.error('社区客厅自定义表情清理调度启动失败 code=%s', stableAgentErrorCode(err)),
    );
  })
  .catch((err) => console.error('社区客厅基础数据表初始化失败 code=%s', stableAgentErrorCode(err)));
startAiProductEventRetentionScheduler().catch((err) =>
  console.error('AI 产品事件清理调度启动失败 code=%s', stableAgentErrorCode(err)),
);
startAiResponseRecoveryCleanupScheduler().catch((err) =>
  console.error('AI 响应恢复清理调度启动失败 code=%s', stableAgentErrorCode(err)),
);
startAiExecutionRecoveryScheduler().catch((err) =>
  console.error('AI Execution 租约回收调度启动失败 code=%s', stableAgentErrorCode(err)),
);
const aiArtifactRetentionConfig = getAiArtifactRetentionConfig();
if (!aiArtifactRetentionConfig.enabledDomains.length && aiArtifactRetentionConfig.invalidDomains.length) {
  console.warn(
    'AI 产物保留清理配置无效 code=AI_ARTIFACT_RETENTION_CONFIG_INVALID domains=%s',
    aiArtifactRetentionConfig.invalidDomains.join(','),
  );
}
if (aiArtifactRetentionConfig.enabledDomains.length) {
  startAiArtifactRetentionScheduler().catch((err) =>
    console.error('AI 产物保留清理调度启动失败 code=%s', stableAgentErrorCode(err)),
  );
}
startAiBalanceSnapshotScheduler();
startAccountDeletionCleanupScheduler().catch((err) =>
  console.error('账号注销清理调度启动失败 code=%s', stableAgentErrorCode(err)),
);
startOperationalLogRetentionScheduler();
startAfdianReconciliationScheduler();

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
if (getTodoPlanFeatureState().schedulerEnabled) {
  startTodoReminderV2Scheduler();
  startTodoSeriesScheduler();
} else {
  console.log('[todo-plan-v2] scheduler disabled by feature flag');
}
startEmailDeliveryLogCleanupScheduler();

// 启动 Express 服务器
// 全局兜底:fire-and-forget 漏 catch 或深层依赖异常时留痕,避免 Node 默认行为下无声崩溃(进程守护由 PM2 负责)。
// unhandledRejection 只记录不退出;uncaughtException 后进程状态不可信,记录后退出交给 PM2 拉起。
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandledRejection code=%s', stableAgentErrorCode(reason));
});
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaughtException code=%s', stableAgentErrorCode(err));
  process.exit(1);
});

let listeningReported = false;
const server = app.listen(9001, () => {
  listeningReported = true;
  console.log('服务器已启动：' + new Date().toLocaleString('zh-CN'));
});
registerCommunityChatRealtimeHub(server);

// 端口占用必须是一眼可读的错误。否则它会落进上面的 uncaughtException 兜底,
// 被 stableAgentErrorCode 脱敏成一个看不出原因的码,表现为"重启完前端还连着旧进程"。
// 双栈绑定下 Node 可能先对一个地址族触发 listening、再对另一个报 EADDRINUSE,
// 因此上面那行成功日志可能已经打出去了,这里必须显式否认它,不能让人以为启动成功。
server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    if (listeningReported) console.error('[启动失败] 上一行「服务器已启动」是误报，进程即将退出。');
    console.error('[启动失败] 端口 9001 已被占用，多半是上一个 dev server 还在跑。');
    console.error('           查看占用：lsof -nP -iTCP:9001 -sTCP:LISTEN');
    console.error('           结束占用：pnpm free:server-port');
    process.exit(1);
  }
  console.error('[启动失败] code=%s', stableAgentErrorCode(error));
  process.exit(1);
});
