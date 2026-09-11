import pool from '../db/index.js';
import { resultData } from '../util/common.js';
import { createReadOnlyPool } from '../util/readOnlyDatabase.js';
import { generateCoreUsageReport } from '../util/services/coreUsageReport.js';
import { getOperationalLogRetentionConfig } from '../util/operationalLogRetention.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';

// Reuse the HTTP pool without leaving its connections in session-level read-only mode.
const readOnly = createReadOnlyPool(pool, { transactionOnly: true });
let pending = null;

export async function getAdminCoreUsageReport(req, res) {
  if (req.user?.role !== 'root' || req.adminContext)
    return res.send(resultData(null, 403, '仅管理员本人可查看核心使用报告'));
  const days = req.body?.days ?? 7;
  if (![7, 30, 90].includes(days)) return res.send(resultData(null, 400, '报告观察范围无效'));
  // At most one report per process. Identical concurrent requests share the same work.
  if (pending && pending.days !== days) return res.send(resultData(null, 409, '已有报告正在生成，请稍后重试'));
  try {
    if (!pending) {
      const job = { days, promise: null };
      job.promise = generateCoreUsageReport(readOnly, {
        days,
        storageOffset: '+08:00', // Existing application DATETIME storage contract; checked by the report.
        conversionRetentionDays: getOperationalLogRetentionConfig().retentionDays,
      }).finally(() => {
        if (pending === job) pending = null;
      });
      pending = job;
    }
    const report = await pending.promise;
    // Query timings are diagnostic output for the CLI, not part of the product surface.
    const { timings, ...data } = report;
    return res.send(resultData(data));
  } catch (error) {
    console.warn('[admin-core-usage] failed code=%s', stableAgentErrorCode(error));
    return res.send(resultData(null, 500, '核心使用报告暂不可用，请稍后重试'));
  }
}
