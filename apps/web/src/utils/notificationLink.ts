export type NotificationLink = { kind: 'internal' | 'external'; url: string };

/** 通知仅导航至站内路径或 HTTP(S) 地址；同源完整链接保留查询与锚点，交给路由。 */
export function resolveNotificationLink(link: string, origin: string): NotificationLink | null {
  const value = link.trim();
  if (!value || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  if (!value.startsWith('/') && !/^https?:\/\//i.test(value)) return null;
  try {
    const base = new URL(origin);
    const target = new URL(value, base.origin);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return null;
    return target.origin === base.origin
      ? { kind: 'internal', url: target.pathname + target.search + target.hash }
      : { kind: 'external', url: target.href };
  } catch {
    return null;
  }
}
