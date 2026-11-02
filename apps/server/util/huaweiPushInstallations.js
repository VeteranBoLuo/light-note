import { createHash, randomUUID } from 'node:crypto';
import { huaweiSubscription } from './huaweiPushPolicy.js';

export const huaweiInstallationsEnabled = (env = process.env) => env.HUAWEI_PUSH_INSTALLATION_V2_ENABLED === 'true';
const failure = (code) => Object.assign(new Error(code), { code });
const uuid = (value) => typeof value === 'string' && /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/.test(value);

export function validateHuaweiInstallation(value, env = process.env) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !uuid(value.id) ||
    typeof value.key !== 'string' ||
    !/^[a-f\d]{64}$/.test(value.key) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    !['scoped', 'installation'].includes(value.identityKind) ||
    typeof value.packageName !== 'string' ||
    !/^[a-zA-Z][a-zA-Z\d_]*(?:\.[a-zA-Z][a-zA-Z\d_]*)+$/.test(value.packageName) ||
    value.packageName.length > 128 ||
    typeof value.pushAppId !== 'string' ||
    !/^\d{1,32}$/.test(value.pushAppId) ||
    typeof value.deviceLabel !== 'string' ||
    value.deviceLabel.length > 96 ||
    /[\x00-\x1f\x7f]/.test(value.deviceLabel)
  )
    throw failure('INVALID_HUAWEI_INSTALLATION');
  if (Object.hasOwn(value, 'expectedCurrentId') && value.expectedCurrentId !== null && !uuid(value.expectedCurrentId))
    throw failure('INVALID_HUAWEI_INSTALLATION');
  if (
    value.pushAppId !== env.HUAWEI_PUSH_APP_ID ||
    value.packageName !== (env.HUAWEI_PUSH_PACKAGE_NAME || 'top.boluo66.lightnote')
  )
    throw failure('HUAWEI_PUSH_APPLICATION_MISMATCH');
  return value;
}

export async function bindLegacyHuaweiInstallation(userId, token, db) {
  const subscription = huaweiSubscription(token);
  const hash = createHash('sha256').update(subscription.endpoint).digest('hex');
  const [[row]] = await db.query(
    "SELECT s.*, EXISTS(SELECT 1 FROM browser_push_jobs j WHERE j.subscription_id=s.id AND j.status='invalid') AS invalid FROM browser_push_subscriptions s WHERE endpoint_hash = ? AND user_id = ?",
    [hash, userId],
  );
  if (Number(row?.active) === 3 || Number(row?.invalid) === 1 || row?.retired_reason === 'legacy_cleanup')
    throw failure('PUSH_SUBSCRIPTION_INVALID');
  if (!row || ![1, 2].includes(Number(row.active))) throw failure('HUAWEI_PUSH_CLIENT_UPGRADE_REQUIRED');
  return { id: row.id, generation: row.generation, userId };
}

async function retire(connection, rows, reason) {
  for (const row of rows) {
    await connection.query(
      'UPDATE browser_push_subscriptions SET active = IF(active = 3,3,0), retired_reason = ? WHERE id = ? AND generation = ?',
      [reason, row.id, row.generation],
    );
    await connection.query(
      "UPDATE browser_push_jobs SET status = 'cancelled', lease_until = NULL WHERE subscription_id = ? AND generation = ? AND status IN ('pending','sending')",
      [row.id, row.generation],
    );
  }
}

// Installation epochs are separate from transport endpoints: an endpoint may be reused,
// but an uninstalled epoch must never take ownership back from a newer installation.
export async function bindHuaweiInstallation(userId, token, raw, db, env = process.env) {
  if (!huaweiInstallationsEnabled(env)) throw failure('HUAWEI_PUSH_INSTALLATION_UNAVAILABLE');
  const installation = validateHuaweiInstallation(raw, env);
  const subscription = huaweiSubscription(token);
  const hash = createHash('sha256').update(subscription.endpoint).digest('hex');
  const scope = [userId, installation.pushAppId];
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[owner]] = await connection.query('SELECT id FROM user WHERE id = ? AND del_flag = 0 FOR UPDATE', [userId]);
    if (!owner) throw failure('PUSH_ACCOUNT_UNAVAILABLE');
    const [[epoch]] = await connection.query(
      'SELECT * FROM huawei_push_installations WHERE user_id = ? AND provider_app_id = ? AND installation_id = ? FOR UPDATE',
      [...scope, installation.id],
    );
    if (epoch && (Number(epoch.active) !== 1 || epoch.device_key !== installation.key))
      throw failure('PUSH_INSTALLATION_RETIRED');
    if (epoch && Number(epoch.native_revision) > installation.revision) throw failure('PUSH_INSTALLATION_SUPERSEDED');
    const [[existing]] = await connection.query(
      "SELECT s.*, EXISTS(SELECT 1 FROM browser_push_jobs j WHERE j.subscription_id = s.id AND j.status = 'invalid') AS invalid FROM browser_push_subscriptions s WHERE endpoint_hash = ? FOR UPDATE",
      [hash],
    );
    if (Number(existing?.active) === 3 || Number(existing?.invalid) === 1) throw failure('PUSH_SUBSCRIPTION_INVALID');
    if (existing && existing.user_id !== userId) throw failure('HUAWEI_PUSH_TOKEN_OWNER_MISMATCH');
    if (existing?.retired_reason === 'legacy_cleanup') throw failure('PUSH_SUBSCRIPTION_INVALID');
    if (existing?.installation_id && existing.installation_id !== installation.id) {
      const [[previousDevice]] = await connection.query(
        'SELECT device_key FROM huawei_push_installations WHERE user_id = ? AND provider_app_id = ? AND installation_id = ?',
        [userId, existing.provider_app_id, existing.installation_id],
      );
      if (previousDevice?.device_key !== installation.key) throw failure('HUAWEI_PUSH_TOKEN_OWNER_MISMATCH');
    }
    const [oldEpochs] = await connection.query(
      'SELECT installation_id FROM huawei_push_installations WHERE user_id = ? AND provider_app_id = ? AND device_key = ? AND active = 1 FOR UPDATE',
      [...scope, installation.key],
    );
    if (!epoch) {
      const currentInstallationId = oldEpochs[0]?.installation_id ?? null;
      // An unknown epoch must complete a round trip before it can replace a device.
      // An in-flight first request from an uninstalled app cannot complete this step.
      if (!Object.hasOwn(installation, 'expectedCurrentId'))
        throw Object.assign(failure('PUSH_INSTALLATION_CHALLENGE_REQUIRED'), { currentInstallationId });
      if (installation.expectedCurrentId !== currentInstallationId) throw failure('PUSH_INSTALLATION_SUPERSEDED');
    }
    for (const old of oldEpochs) {
      if (old.installation_id === installation.id) continue;
      const [bindings] = await connection.query(
        'SELECT id, generation FROM browser_push_subscriptions WHERE user_id = ? AND provider_app_id = ? AND installation_id = ? AND active IN (1,2) FOR UPDATE',
        [...scope, old.installation_id],
      );
      await retire(connection, bindings, 'reinstalled');
      await connection.query(
        'UPDATE huawei_push_installations SET active = 0 WHERE user_id = ? AND provider_app_id = ? AND installation_id = ?',
        [...scope, old.installation_id],
      );
    }
    const [current] = await connection.query(
      'SELECT id, generation, endpoint_hash, active FROM browser_push_subscriptions WHERE user_id = ? AND provider_app_id = ? AND installation_id = ? AND active IN (1,2) FOR UPDATE',
      [...scope, installation.id],
    );
    if (
      epoch &&
      Number(epoch.native_revision) === installation.revision &&
      current.some((row) => row.endpoint_hash !== hash)
    )
      throw failure('PUSH_INSTALLATION_SUPERSEDED');
    await retire(
      connection,
      current.filter((row) => row.id !== existing?.id),
      'token_rotated',
    );
    if (!epoch) {
      await connection.query(
        'INSERT INTO huawei_push_installations (user_id,provider_app_id,installation_id,device_key,package_name,identity_kind,device_label,native_revision) VALUES (?,?,?,?,?,?,?,?)',
        [
          ...scope,
          installation.id,
          installation.key,
          installation.packageName,
          installation.identityKind,
          installation.deviceLabel,
          installation.revision,
        ],
      );
    } else {
      await connection.query(
        'UPDATE huawei_push_installations SET native_revision = ?, device_label = ?, last_seen_at = NOW(6) WHERE user_id = ? AND provider_app_id = ? AND installation_id = ?',
        [installation.revision, installation.deviceLabel, ...scope, installation.id],
      );
    }
    // Exact-token upgrades adopt legacy records without consuming another slot.
    const reuse =
      existing &&
      [1, 2].includes(Number(existing.active)) &&
      (!existing.installation_id || existing.installation_id === installation.id);
    const [[count]] = await connection.query(
      "SELECT COUNT(*) total FROM browser_push_subscriptions WHERE user_id = ? AND active IN (1,2) AND endpoint LIKE 'huawei:%'",
      [userId],
    );
    if (!reuse && Number(count.total) >= 20) throw failure('PUSH_DEVICE_LIMIT');
    const id = existing?.id || randomUUID();
    const generation = reuse ? existing.generation : randomUUID();
    if (existing) {
      await connection.query(
        'UPDATE browser_push_subscriptions SET endpoint = ?, generation = ?, installation_id = ?, provider_app_id = ?, retired_reason = NULL, active = ?, enabled_at = IF(?,enabled_at,NOW(6)) WHERE id = ? AND user_id = ?',
        [
          subscription.endpoint,
          generation,
          installation.id,
          installation.pushAppId,
          reuse ? existing.active : 2,
          Number(Boolean(reuse)),
          id,
          userId,
        ],
      );
    } else {
      await connection.query(
        "INSERT INTO browser_push_subscriptions (id,user_id,endpoint_hash,endpoint,p256dh,auth,generation,locale,active,installation_id,provider_app_id) VALUES (?,?,?,?,'','',?,'zh-CN',2,?,?)",
        [id, userId, hash, subscription.endpoint, generation, installation.id, installation.pushAppId],
      );
    }
    await connection.commit();
    return { id, generation, userId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
