export type AdminLoginMethod = 'password' | 'github' | 'unknown';

function readableLocationPart(value: unknown): string {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  if (!normalized || normalized === '[]' || normalized === '{}') return '';
  return normalized;
}

/**
 * 后端历史 location 既可能是普通地区文本，也可能是高德定位 JSON 字符串。
 * 管理界面只展示行政区名称，不暴露 rectangle 等内部定位元数据。
 */
export function formatAdminLocation(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === 'string') {
    const source = value.trim();
    if (!source) return [];
    try {
      return formatAdminLocation(JSON.parse(source));
    } catch {
      return [source];
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return [];

  const location = value as Record<string, unknown>;
  const parts = [location.country, location.province, location.city, location.district]
    .map(readableLocationPart)
    .filter(Boolean);
  return [...new Set(parts)];
}

export function resolveAdminLoginMethod(value: unknown): AdminLoginMethod {
  const method = String(value || '')
    .trim()
    .toLowerCase();
  if (method === 'local' || method === 'email' || method === 'password') return 'password';
  if (method === 'github') return 'github';
  return 'unknown';
}
