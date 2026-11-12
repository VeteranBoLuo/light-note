import pool from '../db/index.js';
import { INTERNAL_ROLES } from './internalRoles.js';
import { isLocalIp } from './ipFilter.js';

// 「自己人」流量过滤:开发者在自己设备上以游客身份测试(登出后浏览、走注册流程等)不该污染
// api 日志 / 操作日志 / 转化漏斗 / 权益事件。
// root/test 登录态的请求会把所带的浏览器稳定设备 ID 自动登记为内部设备;之后同设备的未登录或
// 非内部账号流量直接跳过记录。内部账号登录态本身照常记录,由后台「隐藏内部账号」在查询时过滤。
//
// 内部设备存 log_exclude_devices,进程内缓存 Set。旧的 log_exclude 指纹表已停用,保留表与数据但不再读写。
// 注意:缓存在单进程内维护(pm2 fork 单实例)。若将来改 cluster 多实例,需加定时刷新或广播。
// 设备 ID 是浏览器 localStorage 里的随机标识,只用于日志过滤,不参与认证、权限或设备信任判断。

// 与会话设备标识同一格式;不合规的值既不登记也不匹配。
const DEVICE_ID_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

let internalDeviceIds = new Set();
const pendingEnrollments = new Set();

function readDeviceId(req) {
  const headers = req?.headers || {};
  for (const name of ['x-log-device-id', 'x-device-id']) {
    const raw = headers[name];
    const value = String(Array.isArray(raw) ? raw[0] || '' : raw || '').trim();
    if (DEVICE_ID_PATTERN.test(value)) return value;
  }
  return '';
}

const isInternalSession = (req) => Boolean(req?.user?.isAuthenticated && INTERNAL_ROLES.includes(req.user.role));

async function ensureInternalDeviceTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS log_exclude_devices (
      device_id VARCHAR(128) NOT NULL,
      fingerprint VARCHAR(128) NOT NULL,
      create_time TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (device_id),
      KEY idx_log_exclude_devices_fingerprint (fingerprint)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='日志白名单稳定设备标识'
  `);
}

export async function refreshLogExclude() {
  try {
    const [rows] = await pool.query('SELECT device_id FROM log_exclude_devices');
    internalDeviceIds = new Set(rows.map((r) => r.device_id).filter(Boolean));
  } catch (e) {
    console.error('刷新内部设备缓存失败:', e.message); // 保留旧缓存,不影响记录主流程
  }
}

export async function initLogExclude() {
  await ensureInternalDeviceTable();
  await refreshLogExclude();
}

// 内部账号登录态请求:把所带设备 ID 登记为内部设备。先查进程内缓存,已登记或正在写入时不碰数据库。
// 本地/回环请求来自开发环境,其设备 ID 属于 localhost 源,登记了也匹配不到线上流量,直接跳过。
export function rememberInternalDevice(req) {
  if (isLocalIp(req?.ip) || !isInternalSession(req)) return;
  const deviceId = readDeviceId(req);
  if (!deviceId || internalDeviceIds.has(deviceId) || pendingEnrollments.has(deviceId)) return;
  pendingEnrollments.add(deviceId);
  pool
    .query('INSERT IGNORE INTO log_exclude_devices (device_id, fingerprint) VALUES (?, ?)', [deviceId, ''])
    .then(() => internalDeviceIds.add(deviceId))
    .catch((error) => console.error('登记内部设备失败:', error.message))
    .finally(() => pendingEnrollments.delete(deviceId));
}

// 是否「自己人」流量:本地/回环 IP,或内部设备上的非内部账号流量 → api/操作/转化/权益链路都跳过记录。
// 内部账号登录态照常记录,root 仍能在 API 日志里查到自己的请求。
export function isSelfTraffic(req) {
  if (isLocalIp(req?.ip)) return true;
  if (isInternalSession(req)) return false;
  const deviceId = readDeviceId(req);
  return Boolean(deviceId && internalDeviceIds.has(deviceId));
}
