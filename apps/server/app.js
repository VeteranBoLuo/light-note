import express from 'express';
import bodyParser from 'body-parser';
import { logFunction } from './util/log.js';
import { baseRouter } from './util/common.js';
import { accountBanMiddleware, authMiddleware, startSessionMaintenance } from './util/auth.js';
import { attackMonitor, ensureSecurityTables } from './util/security/index.js';
import { cleanupAllExpiredTrash } from './router_handle/trashHandle.js';
import rateLimit from 'express-rate-limit';

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
// 账号封禁只拦业务访问，登录/退出等入口继续放行
app.use(accountBanMiddleware);
// 安全防护与攻击事件采集
app.use(attackMonitor);
// 日志记录中间件
app.use(logFunction);
// 全局速率限制：120次/分钟（与安全中心高频检测阈值一致）
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

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

// 启动 Express 服务器
app.listen(9001, () => {
  console.log('服务器已启动：' + new Date().toLocaleString('zh-CN'));
});
