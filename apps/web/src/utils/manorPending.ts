import type { ManorCommand } from '@lightnote/shared/manor';

const storageKey = (owner: string) => `ln:manor-pending:${owner}`;
export function readPendingManorCommand(owner: string): ManorCommand | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey(owner)) || 'null');
    if (!value || typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(value.requestId)
      || typeof value.version !== 'string' || !Number.isSafeInteger(value.revision) || value.revision < 0
      || typeof value.action !== 'string' || !Array.isArray(value.args) || JSON.stringify(value.args).length > 2048) return null;
    return value;
  } catch { return null; }
}
export function savePendingManorCommand(owner: string, command: ManorCommand | null) {
  try {
    if (command) sessionStorage.setItem(storageKey(owner), JSON.stringify(command));
    else sessionStorage.removeItem(storageKey(owner));
  } catch { /* In-memory pending requests still prevent duplicate commands in this session. */ }
}
export function isUncertainManorResult(error: unknown) {
  const value = error as { code?: string; status?: number; receiptUnconfirmed?: boolean };
  if(value?.receiptUnconfirmed===true)return true;
  return ['OFFLINE','REQUEST_TIMEOUT','NETWORK_ERROR','ECONNRESET'].includes(String(value?.code || ''))
    || Number(value?.status) === 429
    || Number(value?.status) >= 500;
}
