import axios from 'axios';
import { isIP } from 'node:net';
import pool from '../../db/index.js';

const LOOKUP_TIMEOUT_MS = 1500;
const RETRY_INTERVAL_MS = 60_000;
const MAX_IN_FLIGHT = 4;
const MAX_RECENT_ATTEMPTS = 256;
const LOCATION_FIELDS = ['city', 'province', 'rectangle'];

const errorCode = (error) => {
  const code = typeof error?.code === 'string' ? error.code : error?.name;
  return /^[A-Z0-9_]{1,64}$/i.test(code || '') ? code : 'LOOKUP_FAILED';
};

function normalizeLocation(data) {
  if (
    data?.status !== '1' ||
    !LOCATION_FIELDS.every((field) => {
      const value = data[field];
      return typeof value === 'string'
        ? value.length <= 256
        : Array.isArray(value) && value.every((part) => typeof part === 'string') && value.join('').length <= 256;
    })
  ) {
    throw Object.assign(new Error('IP location unavailable'), { code: 'IP_LOCATION_UNAVAILABLE' });
  }
  return Object.fromEntries(
    LOCATION_FIELDS.map((field) => {
      const value = Array.isArray(data[field]) ? data[field].join('') : data[field];
      return [field, value || (field === 'rectangle' ? '' : '未知')];
    }),
  );
}

/** IP 定位只补充展示信息，不参与会话有效性判断，也不占用认证请求的等待时间。 */
export function createUserIpLocationRefresher({
  db = pool,
  http = axios,
  now = Date.now,
  apiKey = () => process.env.AMAP_API_KEY || '',
  warn = (code) => console.warn('[user-ip-location] refresh failed code=%s', code),
} = {}) {
  const inFlight = new Map();
  const retryAfter = new Map();

  return function refreshUserIpLocation(user, clientIp) {
    const keyValue = apiKey();
    if (!user?.id || Number(user.del_flag || 0) !== 0 || !isIP(clientIp || '') || user.ip === clientIp || !keyValue) {
      return Promise.resolve(false);
    }
    const key = JSON.stringify([user.id, clientIp]);
    if (inFlight.has(key)) return inFlight.get(key);
    if (inFlight.size >= MAX_IN_FLIGHT || (retryAfter.get(key) || 0) > now()) return Promise.resolve(false);
    retryAfter.delete(key);
    if (retryAfter.size >= MAX_RECENT_ATTEMPTS) retryAfter.delete(retryAfter.keys().next().value);
    retryAfter.set(key, now() + RETRY_INTERVAL_MS);

    const task = Promise.resolve()
      .then(async () => {
        const { data } = await http.get('https://restapi.amap.com/v3/ip', {
          params: { ip: clientIp, key: keyValue },
          timeout: LOOKUP_TIMEOUT_MS,
          signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
          maxRedirects: 0,
          maxContentLength: 16 * 1024,
        });
        const location = normalizeLocation(data);
        // 定位期间可能切换网络、停用或注销账号；迟到结果不能覆盖已变更的 IP 或恢复已清理资料。
        const [result] = await db.query(
          {
            sql: 'UPDATE user SET location=?,ip=? WHERE id=? AND del_flag=0 AND (ip <=> ?)',
            timeout: LOOKUP_TIMEOUT_MS,
          },
          [JSON.stringify(location), clientIp, user.id, user.ip ?? null],
        );
        return Number(result.affectedRows || 0) > 0;
      })
      .catch((error) => {
        warn(errorCode(error));
        return false;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
  };
}

export const refreshUserIpLocation = createUserIpLocationRefresher();
