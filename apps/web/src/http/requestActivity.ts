// Counts only; account data, URLs and request payloads never leave the request layer.
const requests = new WeakSet<object>();
const listeners = new Set<(active: number) => void>();
let active = 0;
const notify = () => {
  for (const listener of listeners) {
    try {
      listener(active);
    } catch {}
  }
};
export const activeRequestCount = () => active;
export function beginRequestActivity(request: object) {
  if (requests.has(request)) return;
  requests.add(request);
  active++;
  notify();
}
export function endRequestActivity(request?: object) {
  if (!request || !requests.delete(request)) return;
  active--;
  notify();
}
export function subscribeRequestActivity(listener: (active: number) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Includes direct uploads, module loads and user-triggered streaming bodies. */
export function holdForegroundActivity() {
  const token = {};
  beginRequestActivity(token);
  return () => endRequestActivity(token);
}
export async function withForegroundActivity<T>(operation: () => Promise<T>): Promise<T> {
  const release = holdForegroundActivity();
  try {
    return await operation();
  } finally {
    release();
  }
}
