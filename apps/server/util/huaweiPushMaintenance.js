import { createHash } from 'node:crypto';

const failure = (code) => Object.assign(new Error(code), { code });

// A feature-flag rollback must not remove cleanup tombstones and revive dormant clients.
export async function pruneInactivePushSubscriptions(db) {
  try {
    return await db.query(
      "DELETE FROM browser_push_subscriptions WHERE active IN (0,2) AND (retired_reason IS NULL OR retired_reason <> 'legacy_cleanup') AND enabled_at < DATE_SUB(NOW(), INTERVAL 7 DAY) LIMIT 1000",
    );
  } catch (error) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') throw error;
    // Before the explicit migration there can be no cleanup markers.
    return db.query(
      'DELETE FROM browser_push_subscriptions WHERE active IN (0,2) AND enabled_at < DATE_SUB(NOW(), INTERVAL 7 DAY) LIMIT 1000',
    );
  }
}

export async function previewLegacyHuaweiCleanup(db, userId, keepIds, { lock = false } = {}) {
  if (
    typeof userId !== 'string' ||
    !userId ||
    !Array.isArray(keepIds) ||
    !keepIds.length ||
    keepIds.length > 20 ||
    new Set(keepIds).size !== keepIds.length
  )
    throw failure('HUAWEI_CLEANUP_SELECTION_INVALID');
  const [rows] = await db.query(
    "SELECT id,generation,active,installation_id FROM browser_push_subscriptions WHERE user_id=? AND endpoint LIKE 'huawei:%' AND active IN (1,2) ORDER BY id" +
      (lock ? ' FOR UPDATE' : ''),
    [userId],
  );
  if (!keepIds.every((id) => rows.some((row) => row.id === id && Number(row.active) === 1)))
    throw failure('HUAWEI_CLEANUP_KEEP_INVALID');
  const candidates = rows.filter((row) => !row.installation_id && !keepIds.includes(row.id));
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify({
        userId,
        keep: [...keepIds].sort(),
        rows: rows.map((row) => [row.id, row.generation, Number(row.active), row.installation_id]),
      }),
    )
    .digest('hex');
  return { candidates, fingerprint, activeCount: rows.length, keepCount: keepIds.length };
}

export async function applyLegacyHuaweiCleanup(db, userId, keepIds, expectedFingerprint) {
  if (!/^[a-f\d]{64}$/.test(expectedFingerprint || '')) throw failure('HUAWEI_CLEANUP_FINGERPRINT_REQUIRED');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[owner]] = await connection.query('SELECT id FROM user WHERE id=? AND del_flag=0 FOR UPDATE', [userId]);
    if (!owner) throw failure('PUSH_ACCOUNT_UNAVAILABLE');
    const plan = await previewLegacyHuaweiCleanup(connection, userId, keepIds, { lock: true });
    if (plan.fingerprint !== expectedFingerprint) throw failure('HUAWEI_CLEANUP_STATE_CHANGED');
    for (const row of plan.candidates) {
      // Keep only the hash tombstone; a dormant legacy client cannot reactivate it.
      const [updated] = await connection.query(
        "UPDATE browser_push_subscriptions SET active=0,retired_reason='legacy_cleanup',endpoint='huawei:retired',p256dh='',auth='' WHERE id=? AND user_id=? AND generation=? AND active IN(1,2) AND installation_id IS NULL",
        [row.id, userId, row.generation],
      );
      if (updated.affectedRows !== 1) throw failure('HUAWEI_CLEANUP_STATE_CHANGED');
      await connection.query(
        "UPDATE browser_push_jobs SET status='cancelled',lease_until=NULL WHERE subscription_id=? AND generation=? AND status IN('pending','sending')",
        [row.id, row.generation],
      );
    }
    await connection.commit();
    return { retiredCount: plan.candidates.length, keptCount: plan.keepCount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
