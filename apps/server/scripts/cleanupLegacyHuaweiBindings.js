const apply = process.argv.includes('--apply');
if (!apply) {
  process.env.ALLOW_REMOTE_DATABASE_READS = 'true';
  process.env.ALLOW_REMOTE_DATABASE_WRITES = 'false';
}
const { default: pool } = await import('../db/index.js');
const { previewLegacyHuaweiCleanup, applyLegacyHuaweiCleanup } = await import('../util/huaweiPushMaintenance.js');
const argument = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
try {
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
} catch (error) {
  console.error(
    '[huawei-push-cleanup] code=%s',
    /^[A-Z_0-9]+$/.test(error?.code || '') ? error.code : 'CLEANUP_FAILED',
  );
  process.exitCode = 1;
} finally {
  await pool.end();
  process.exit(process.exitCode || 0);
}
