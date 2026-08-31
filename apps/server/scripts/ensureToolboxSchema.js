import pool from '../db/index.js';
import { ensureToolboxSchema } from '../util/toolboxSchema.js';

try {
  await ensureToolboxSchema(pool);
  console.log('[toolbox-schema] Schema 已幂等就绪');
} catch (error) {
  console.error('[toolbox-schema] Schema 初始化失败:', error?.message || error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
