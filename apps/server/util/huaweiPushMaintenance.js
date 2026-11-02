import { createHash } from 'node:crypto';

const failure = (code) => Object.assign(new Error(code), { code });

async function retireLegacyRows(connection, userId, rows) {
  for (const row of rows) {
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
}

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
    await retireLegacyRows(connection, userId, plan.candidates);
    await connection.commit();
    return { retiredCount: plan.candidates.length, keptCount: plan.keepCount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// One-time, explicitly authorized single-device migration. The approved legacy
// snapshot is fixed before waiting for the user's new native registration.
// This is an operator tool, never a policy for ordinary multi-device accounts.
export async function reconcileLegacyHuaweiCleanup(db, plan, { apply = false } = {}) {
  const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/;
  if (
    plan?.version !== 1 ||
    typeof plan.userId !== 'string' ||
    !plan.userId ||
    plan.userId.length > 64 ||
    !/^\d{1,32}$/.test(plan.providerAppId || '') ||
    !/^[a-zA-Z][a-zA-Z\d_]*(?:\.[a-zA-Z][a-zA-Z\d_]*)+$/.test(plan.packageName || '') ||
    !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(plan.notBefore || '') ||
    !Array.isArray(plan.legacy) ||
    !plan.legacy.length ||
    plan.legacy.length > 20 ||
    plan.legacy.some(
      (row) =>
        !uuid.test(row?.id || '') ||
        !uuid.test(row?.generation || '') ||
        !/^[a-f\d]{64}$/.test(row?.endpointHash || ''),
    ) ||
    new Set(plan.legacy.map((row) => row.id)).size !== plan.legacy.length
  )
    throw failure('HUAWEI_CLEANUP_PLAN_INVALID');
  const connection = await db.getConnection();
  const lock = apply ? ' FOR UPDATE' : '';
  try {
    await connection.beginTransaction();
    const [[owner]] = await connection.query('SELECT id FROM user WHERE id=? AND del_flag=0' + lock, [plan.userId]);
    if (!owner) throw failure('PUSH_ACCOUNT_UNAVAILABLE');
    const [heads] = await connection.query(
      'SELECT installation_id,provider_app_id,package_name,identity_kind,last_seen_at>=? AS recent FROM huawei_push_installations WHERE user_id=? AND active=1' +
        lock,
      [plan.notBefore, plan.userId],
    );
    const waiting = async (reason) => {
      await connection.commit();
      return { status: 'waiting', reason, retiredCount: 0 };
    };
    if (!heads.length) return await waiting('current_device_not_registered');
    if (heads.length !== 1) return await waiting('multiple_current_devices');
    const head = heads[0];
    if (head.provider_app_id !== plan.providerAppId || head.package_name !== plan.packageName)
      throw failure('HUAWEI_CLEANUP_APPLICATION_MISMATCH');
    if (!['scoped', 'installation'].includes(head.identity_kind)) throw failure('HUAWEI_CLEANUP_STATE_CHANGED');
    if (!Number(head.recent)) return await waiting('current_registration_not_refreshed');
    const [rows] = await connection.query(
      "SELECT id,generation,endpoint_hash,installation_id,provider_app_id,active FROM browser_push_subscriptions WHERE user_id=? AND endpoint LIKE 'huawei:%' AND active IN(1,2) ORDER BY id" +
        lock,
      [plan.userId],
    );
    const managed = rows.filter((row) => row.installation_id);
    const keep = managed.find(
      (row) => row.installation_id === head.installation_id && row.provider_app_id === head.provider_app_id,
    );
    if (!keep || Number(keep.active) !== 1) return await waiting('current_binding_not_active');
    if (managed.length !== 1) throw failure('HUAWEI_CLEANUP_STATE_CHANGED');
    const approved = new Map(plan.legacy.map((row) => [row.id, row]));
    const candidates = rows.filter((row) => !row.installation_id);
    if (
      candidates.some((row) => {
        const previous = approved.get(row.id);
        return !previous || row.generation !== previous.generation || row.endpoint_hash !== previous.endpointHash;
      })
    )
      throw failure('HUAWEI_CLEANUP_STATE_CHANGED');
    if (apply) await retireLegacyRows(connection, plan.userId, candidates);
    await connection.commit();
    return {
      status: apply ? 'completed' : 'ready',
      retiredCount: apply ? candidates.length : 0,
      retireCount: candidates.length,
      keptCount: 1,
      keptRef: keep.id.slice(0, 8),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
