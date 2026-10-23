import pool from '../db/index.js';
import redisClient from '../util/redisClient.js';
import { preparePointsEarningC8 } from '../util/pointsEarningC8Preparation.js';

try {
  if (process.argv.slice(2).some((argument) => argument !== '--apply')) throw new Error('INVALID_ARGUMENT');
  const apply = process.argv.includes('--apply');
  const result = await preparePointsEarningC8({ apply });
  console.log('[points-earning-c8] %s %s', apply ? 'prepared' : 'read-only preview', JSON.stringify(result));
} catch (error) {
  const code = /^(POINTS_EARNING_C8_[A-Z_]+|INVALID_ARGUMENT)$/.test(error.message || '')
    ? error.message
    : error.code || 'PREPARATION_FAILED';
  console.error('[points-earning-c8] preparation failed code=%s', code);
  process.exitCode = 1;
} finally {
  await pool.end();
  if (redisClient.isOpen) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.destroy?.();
    }
  } else {
    redisClient.destroy?.();
  }
}
