import pool from '../db/index.js';
import { isLocalIp } from './ipFilter.js';

// 「自己人」流量过滤:开发者本人在自己设备上测试(登录/登出/游客浏览等)不该污染
// api 日志 / 操作日志 / 转化漏斗。按浏览器指纹白名单(前端 fingerprint 头)跳过记录。
//
// 白名单存 log_exclude 表(root 在个人中心增删),进程内缓存一份 Set;增删时刷新。
// 注意:缓存在单进程内维护(pm2 fork 单实例)。若将来改 cluster 多实例,需加定时刷新或广播。
// 指纹是浏览器特征哈希、非绝对唯一:极小概率误伤同型号浏览器的其他用户(小站可接受,列表可随时删)。

let excludedFingerprints = new Set();
let excludedDeviceIds = new Set();

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
}

export async function refreshLogExclude() {
  try {
    const [rows] = await pool.query('SELECT fingerprint, device_id FROM log_exclude');
    excludedFingerprints = new Set(rows.map((r) => r.fingerprint).filter(Boolean));
    excludedDeviceIds = new Set(rows.map((r) => r.device_id).filter(Boolean));
  } catch (e) {
    console.error('刷新日志白名单缓存失败:', e.message); // 保留旧缓存,不影响记录主流程
  }
}

export async function initLogExclude() {
  await ensureLogExcludeTable();
  await refreshLogExclude();
}

// 是否「自己人」流量:本地/回环 IP,或指纹命中白名单 → api/操作/转化三条链路都跳过记录
export function isSelfTraffic(req) {
  if (isLocalIp(req?.ip)) return true;
  const fp = req?.headers?.['fingerprint'];
  const deviceId = req?.headers?.['x-log-device-id'];
  return Boolean(
    (deviceId && excludedDeviceIds.has(String(deviceId))) ||
    (fp && excludedFingerprints.has(String(fp))),
  );
}

export async function listLogExclude() {
  const [rows] = await pool.query(
    'SELECT fingerprint, device_id, note, create_time FROM log_exclude ORDER BY create_time DESC',
  );
  return rows;
}

export async function addLogExclude(fingerprint, deviceId = '', note = '') {
  await pool.query(
    `INSERT INTO log_exclude (fingerprint, device_id, note) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE device_id = COALESCE(VALUES(device_id), device_id), note = COALESCE(VALUES(note), note)`, [
    fingerprint,
    deviceId || null,
    note || null,
  ]);
  await refreshLogExclude();
}

export async function removeLogExclude(fingerprint) {
  await pool.query('DELETE FROM log_exclude WHERE fingerprint = ?', [fingerprint]);
  await refreshLogExclude();
}
