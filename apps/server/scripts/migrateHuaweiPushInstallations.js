import {
  assertHuaweiPushInstallationSchema,
  installHuaweiPushInstallationSchema,
} from '../util/huaweiPushInstallationSchema.js';

const apply = process.argv.includes('--apply');
if (!apply) {
  process.env.ALLOW_REMOTE_DATABASE_READS = 'true';
  process.env.ALLOW_REMOTE_DATABASE_WRITES = 'false';
}
const { default: pool } = await import('../db/index.js');
try {
  if (apply) await installHuaweiPushInstallationSchema(pool);
  await assertHuaweiPushInstallationSchema(pool);
  console.log('[huawei-push-installations] schema ready; no historical bindings changed');
} catch (error) {
  console.error(
    '[huawei-push-installations] code=%s',
    /^[A-Z_0-9]+$/.test(error?.code || '') ? error.code : 'SCHEMA_NOT_READY',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
  process.exit(process.exitCode || 0);
}
