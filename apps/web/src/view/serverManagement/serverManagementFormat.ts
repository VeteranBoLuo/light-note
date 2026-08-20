export function formatBytes(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let amount = bytes;
  let index = 0;
  while (amount >= 1024 && index < units.length - 1) {
    amount /= 1024;
    index += 1;
  }
  return `${amount.toFixed(index === 0 || amount >= 100 ? 0 : 1)} ${units[index]}`;
}

export function formatRate(value: unknown) {
  const formatted = formatBytes(value);
  return formatted === '—' ? formatted : `${formatted}/s`;
}

export function formatPercent(value: unknown) {
  const number = Number(value);
  return value === null || value === undefined || !Number.isFinite(number)
    ? '—'
    : `${number.toFixed(number % 1 === 0 ? 0 : 1)}%`;
}

export function formatDuration(value: unknown, unknownLabel = '—') {
  const seconds = Number(value);
  if (value === null || value === undefined || !Number.isFinite(seconds) || seconds < 0) return unknownLabel;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
