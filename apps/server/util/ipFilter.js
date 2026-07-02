// 判断是否为本地/回环 IP(健康检查、SSR、本地调试等内部请求)。
// 用于 api_logs / operation_logs / conversion_events 的源头过滤,避免本地噪声污染日志与漏斗。
export function isLocalIp(ip) {
  if (!ip) return false;
  const s = String(ip).trim().toLowerCase();
  return s === '::1' || s === 'localhost' || s.startsWith('127.') || s.startsWith('::ffff:127.');
}
