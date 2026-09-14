// Explicit post-rollout activation; no historical backfill and no automatic startup mutation.
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--apply')) throw new Error('Only --apply is supported');
const apply = args.includes('--apply');
if (!apply) {
  process.env.ALLOW_REMOTE_DATABASE_READS = 'true';
  process.env.ALLOW_REMOTE_DATABASE_WRITES = 'false';
}
const { default: db } = await import('../db/index.js');
try {
  if (apply) {
    await db.query(`UPDATE resource_reuse_metadata
      SET started_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 8 HOUR)
      WHERE id = 1 AND started_at IS NULL`);
  }
  const [rows] = await db.query(
    "SELECT DATE_FORMAT(started_at,'%Y-%m-%d %H:%i:%s.%f') AS startedAt FROM resource_reuse_metadata WHERE id = 1",
  );
  if (rows.length !== 1) throw new Error('REUSE_METADATA_MISSING');
  console.log(JSON.stringify({ applied: apply, coverageStart: rows[0].startedAt, timezone: '+08:00' }));
} catch (error) {
  console.error(
    '[resource-reuse] activation unavailable code=%s',
    /^[A-Z0-9_]+$/.test(error?.code || '') ? error.code : 'REUSE_ACTIVATION_FAILED',
  );
  process.exitCode = 1;
} finally {
  await db.end();
}
