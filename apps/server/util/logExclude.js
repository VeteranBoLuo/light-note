import pool from '../db/index.js';
import { isLocalIp } from './ipFilter.js';

// 「自己人」流量过滤:开发者本人在自己设备上测试(登录/登出/游客浏览等)不该污染
// api 日志 / 操作日志 / 转化漏斗。稳定设备 ID 优先，浏览器指纹负责兼容旧记录并自动登记稳定 ID。
//
// 白名单主体存 log_exclude，多个稳定设备标识存 log_exclude_devices(root 在后台增删)，进程内缓存 Set。
// 注意:缓存在单进程内维护(pm2 fork 单实例)。若将来改 cluster 多实例,需加定时刷新或广播。
// 指纹是浏览器特征哈希、非绝对唯一:极小概率误伤同型号浏览器的其他用户(小站可接受,列表可随时删)。

let excludedFingerprints = new Set();
let excludedDeviceIds = new Set();
const pendingDeviceEnrollments = new Set();

const normalizeIdentifier = (value) => String(value || '').trim().slice(0, 128);

async function ensureDeviceIdColumn() {
  const [rows] = await pool.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'log_exclude' AND COLUMN_NAME = 'device_id' LIMIT 1`,
  );
  if (!rows.length) {
    await pool.query('ALTER TABLE log_exclude ADD COLUMN device_id VARCHAR(128) DEFAULT NULL AFTER fingerprint');
  }
  const [indexes] = await pool.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'log_exclude' AND INDEX_NAME = 'uniq_log_exclude_device_id' LIMIT 1`,
  );
  if (!indexes.length) await pool.query('ALTER TABLE log_exclude ADD UNIQUE KEY uniq_log_exclude_device_id (device_id)');
}

async function ensureStableDeviceTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_exclude_devices (
      device_id VARCHAR(128) NOT NULL,
      fingerprint VARCHAR(128) NOT NULL,
      create_time TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (device_id),
      KEY idx_log_exclude_devices_fingerprint (fingerprint)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='日志白名单稳定设备标识'
  `);
  // 兼容已经通过旧版“升级”按钮写入 log_exclude.device_id 的记录。
  await pool.query(`
    INSERT IGNORE INTO log_exclude_devices (device_id, fingerprint)
    SELECT device_id, fingerprint FROM log_exclude
    WHERE device_id IS NOT NULL AND device_id <> ''
  `);
  // 新表接管稳定标识后清空旧单值列，避免删除/重绑后在下次启动时被旧值重新回填。
  await pool.query("UPDATE log_exclude SET device_id = NULL WHERE device_id IS NOT NULL AND device_id <> ''");
}

export async function ensureLogExcludeTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_exclude (
      fingerprint VARCHAR(128) NOT NULL,
      note VARCHAR(255) DEFAULT NULL,
      create_time TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (fingerprint)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='日志白名单:自己人设备指纹,免记 api/操作/转化'
  `);
  await ensureDeviceIdColumn();
  await ensureStableDeviceTable();
}

export async function refreshLogExclude() {
  try {
    const [[rows], [stableDevices]] = await Promise.all([
      pool.query('SELECT fingerprint FROM log_exclude'),
      pool.query('SELECT device_id FROM log_exclude_devices'),
    ]);
    excludedFingerprints = new Set(rows.map((r) => r.fingerprint).filter(Boolean));
    excludedDeviceIds = new Set(stableDevices.map((r) => r.device_id).filter(Boolean));
  } catch (e) {
    console.error('刷新日志白名单缓存失败:', e.message); // 保留旧缓存,不影响记录主流程
  }
}

// 已在旧指纹白名单中的浏览器一旦携带稳定设备 ID，就自动完成稳定化。
// 首次请求仍由指纹命中过滤；写入成功后即使指纹因升级/屏幕变化漂移，也继续通过设备 ID 过滤。
function enrollStableDevice(fingerprint, deviceId) {
  if (!fingerprint || !deviceId || excludedDeviceIds.has(deviceId) || pendingDeviceEnrollments.has(deviceId)) return;
  pendingDeviceEnrollments.add(deviceId);
  pool
    .query(
      `INSERT INTO log_exclude_devices (device_id, fingerprint) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE fingerprint = VALUES(fingerprint)`,
      [deviceId, fingerprint],
    )
    .then(() => excludedDeviceIds.add(deviceId))
    .catch((error) => console.error('自动稳定日志白名单失败:', error.message))
    .finally(() => pendingDeviceEnrollments.delete(deviceId));
}

export async function initLogExclude() {
  await ensureLogExcludeTable();
  await refreshLogExclude();
}

// 是否「自己人」流量:本地/回环 IP,或指纹命中白名单 → api/操作/转化三条链路都跳过记录
export function isSelfTraffic(req) {
  if (isLocalIp(req?.ip)) return true;
  const fingerprint = normalizeIdentifier(req?.headers?.['fingerprint']);
  const deviceId = normalizeIdentifier(req?.headers?.['x-log-device-id']);
  if (deviceId && excludedDeviceIds.has(deviceId)) return true;
  if (!fingerprint || !excludedFingerprints.has(fingerprint)) return false;
  enrollStableDevice(fingerprint, deviceId);
  return true;
}

export async function listLogExclude() {
  const [[rows], [devices]] = await Promise.all([
    pool.query('SELECT fingerprint, note, create_time FROM log_exclude ORDER BY create_time DESC'),
    pool.query('SELECT fingerprint, device_id FROM log_exclude_devices ORDER BY create_time ASC'),
  ]);
  const devicesByFingerprint = new Map();
  for (const device of devices) {
    const ids = devicesByFingerprint.get(device.fingerprint) || [];
    ids.push(device.device_id);
    devicesByFingerprint.set(device.fingerprint, ids);
  }
  return rows.map((row) => ({
    ...row,
    device_ids: Array.from(new Set(devicesByFingerprint.get(row.fingerprint) || [])),
  }));
}

export async function addLogExclude(fingerprint, deviceId = '', note = '') {
  const normalizedFingerprint = normalizeIdentifier(fingerprint);
  const normalizedDeviceId = normalizeIdentifier(deviceId);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT INTO log_exclude (fingerprint, note) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE note = COALESCE(VALUES(note), note)`,
      [normalizedFingerprint, note || null],
    );
    if (normalizedDeviceId) {
      await connection.query(
        `INSERT INTO log_exclude_devices (device_id, fingerprint) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE fingerprint = VALUES(fingerprint)`,
        [normalizedDeviceId, normalizedFingerprint],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await refreshLogExclude();
}

export async function removeLogExclude(fingerprint) {
  const normalizedFingerprint = normalizeIdentifier(fingerprint);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query('DELETE FROM log_exclude_devices WHERE fingerprint = ?', [normalizedFingerprint]);
    await connection.query('DELETE FROM log_exclude WHERE fingerprint = ?', [normalizedFingerprint]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  await refreshLogExclude();
}
