// Counts only; account data, URLs and request payloads never leave the request layer.
type ActivityKind = 'request' | 'foreground';
const requests = new WeakMap<object, ActivityKind>();
const listeners = new Set<(active: number, kind: ActivityKind) => void>();
let active = 0;
const notify = (kind: ActivityKind) => {
  for (const listener of listeners) {
    try {
      listener(active, kind);
    } catch {}
  }
};
export const activeRequestCount = () => active;
export function beginRequestActivity(request: object, kind: ActivityKind = 'request') {
  if (requests.has(request)) return;
  requests.set(request, kind);
  active++;
  notify(kind);
}
export function endRequestActivity(request?: object) {
  const kind = request && requests.get(request);
  if (!request || !kind) return;
  requests.delete(request);
  active--;
  notify(kind);
}
export function subscribeRequestActivity(listener: (active: number, kind: ActivityKind) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Includes direct uploads, module loads and user-triggered streaming bodies. */
export function holdForegroundActivity() {
  const token = {};
  beginRequestActivity(token, 'foreground');
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
