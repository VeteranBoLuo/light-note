import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const apply = process.argv.includes('--apply');
if (!apply) {
  process.env.ALLOW_REMOTE_DATABASE_READS = 'true';
  process.env.ALLOW_REMOTE_DATABASE_WRITES = 'false';
}
const { default: pool } = await import('../db/index.js');
const { previewLegacyHuaweiCleanup, applyLegacyHuaweiCleanup, reconcileLegacyHuaweiCleanup } =
  await import('../util/huaweiPushMaintenance.js');
const argument = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const watch = process.argv.includes('--watch');
const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
try {
  const planPath = argument('single-device-plan');
  if (watch && (!apply || !planPath || !argument('receipt')))
    throw Object.assign(new Error(), { code: 'HUAWEI_CLEANUP_WATCH_ARGUMENTS_REQUIRED' });
  if (planPath) {
    if (!path.isAbsolute(planPath) || argument('user-id') || process.argv.some((arg) => arg.startsWith('--keep-id=')))
      throw Object.assign(new Error(), { code: 'HUAWEI_CLEANUP_PLAN_ARGUMENTS_INVALID' });
    const stat = await fs.stat(planPath);
    if (!stat.isFile() || stat.mode & 0o077)
      throw Object.assign(new Error(), { code: 'HUAWEI_CLEANUP_PLAN_NOT_PRIVATE' });
    const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
    if (
      plan.providerAppId !== process.env.HUAWEI_PUSH_APP_ID ||
      plan.packageName !== process.env.HUAWEI_PUSH_PACKAGE_NAME
    )
      throw Object.assign(new Error(), { code: 'HUAWEI_CLEANUP_APPLICATION_MISMATCH' });
    const receiptPath = argument('receipt');
    if (receiptPath && !path.isAbsolute(receiptPath))
      throw Object.assign(new Error(), { code: 'HUAWEI_CLEANUP_RECEIPT_PATH_INVALID' });
    const deadline = Date.now() + 7 * 24 * 60 * 60 * 1000;
    let previousStatus;
    do {
      if (controller.signal.aborted) break;
      const result = await reconcileLegacyHuaweiCleanup(pool, plan, { apply });
      const receipt = { ...result, checkedAt: new Date().toISOString(), dryRun: !apply };
      if (receiptPath) {
        const temporary = receiptPath + '.tmp';
        await fs.writeFile(temporary, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
        await fs.rename(temporary, receiptPath);
      }
      const currentStatus = JSON.stringify(result);
      if (currentStatus !== previousStatus) console.log(JSON.stringify(receipt));
      previousStatus = currentStatus;
      if (!watch || result.status !== 'waiting') break;
      if (Date.now() >= deadline) throw Object.assign(new Error(), { code: 'HUAWEI_CLEANUP_WAIT_EXPIRED' });
      await delay(30000, undefined, { signal: controller.signal });
    } while (!controller.signal.aborted);
  } else {
    const userId = argument('user-id');
    const keepIds = process.argv.filter((arg) => arg.startsWith('--keep-id=')).map((arg) => arg.slice(10));
    if (apply) console.log(JSON.stringify(await applyLegacyHuaweiCleanup(pool, userId, keepIds, argument('expected'))));
    else {
      const plan = await previewLegacyHuaweiCleanup(pool, userId, keepIds);
      console.log(
        JSON.stringify({
          dryRun: true,
          activeHuaweiCount: plan.activeCount,
          keepCount: plan.keepCount,
          retireCount: plan.candidates.length,
          fingerprint: plan.fingerprint,
          candidateRefs: plan.candidates.map((row) => row.id.slice(0, 8)),
        }),
      );
    }
  }
} catch (error) {
  if (error?.name !== 'AbortError') {
    console.error(
      '[huawei-push-cleanup] code=%s',
      /^[A-Z_0-9]+$/.test(error?.code || '') ? error.code : 'CLEANUP_FAILED',
    );
    process.exitCode = 1;
  }
} finally {
  process.removeListener('SIGTERM', stop);
  process.removeListener('SIGINT', stop);
  await pool.end();
  process.exit(process.exitCode || 0);
}
