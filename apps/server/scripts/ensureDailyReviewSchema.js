import pool from '../db/index.js';
import { ensureDailyReviewSchema } from '../util/dailyReviewSchema.js';

try {
  await ensureDailyReviewSchema();
  console.log('[daily-review-schema] Schema 已幂等就绪');
} catch (error) {
  console.error('[daily-review-schema] Schema 初始化失败:', error?.message || error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
