const ACTION_CENTER_PATHS = new Set(['/admin/actionCenter', '/actionCenter']);

export function normalizeAdminActionCenterReturnTo(value: unknown) {
  const target = String(value || '').trim();
  if (!target || target.length > 1_000 || target.startsWith('//') || target.includes('://')) return '';
  const path = target.split(/[?#]/u)[0];
  return ACTION_CENTER_PATHS.has(path) ? target : '';
}
