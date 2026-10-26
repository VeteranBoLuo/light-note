// Counts/timestamps only; account data, URLs and request payloads stay at the caller.
export type ActivityKind = 'foreground' | 'incremental' | 'background';
export interface RequestActivity {
  foreground: number;
  incremental: number;
  background: number;
  oldestIncrementalAt: number | null;
}
const requests = new Map<object, { kind: ActivityKind; startedAt: number }>();
const listeners = new Set<(state: RequestActivity, kind: ActivityKind, phase: 'start' | 'end') => void>();
export function requestActivitySnapshot(): RequestActivity {
  const state: RequestActivity = { foreground: 0, incremental: 0, background: 0, oldestIncrementalAt: null };
  for (const { kind, startedAt } of requests.values()) {
    state[kind]++;
    if (kind === 'incremental') state.oldestIncrementalAt = Math.min(state.oldestIncrementalAt ?? startedAt, startedAt);
  }
  return state;
}
const notify = (kind: ActivityKind, phase: 'start' | 'end') => {
  const state = requestActivitySnapshot();
  for (const listener of listeners) {
    try {
      listener(state, kind, phase);
    } catch {
      /* Observers cannot break a business request. */
    }
  }
};
export const activeRequestCount = () => requests.size;
export function beginRequestActivity(request: object, kind: ActivityKind = 'foreground') {
  if (requests.has(request)) return;
  requests.set(request, { kind, startedAt: Date.now() });
  notify(kind, 'start');
}
export function endRequestActivity(request?: object) {
  const record = request && requests.get(request);
  if (!request || !record) return;
  requests.delete(request);
  notify(record.kind, 'end');
}
export function subscribeRequestActivity(
  listener: (state: RequestActivity, kind: ActivityKind, phase: 'start' | 'end') => void,
) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function holdRequestActivity(kind: ActivityKind = 'foreground') {
  const token = {};
  beginRequestActivity(token, kind);
  return () => endRequestActivity(token);
}
/** Covers the full body/operation, including cancellation and errors. */
export const holdForegroundActivity = () => holdRequestActivity('foreground');
export async function withRequestActivity<T>(kind: ActivityKind, operation: () => Promise<T>): Promise<T> {
  const release = holdRequestActivity(kind);
  try {
    return await operation();
  } finally {
    release();
  }
}
export const withForegroundActivity = <T>(operation: () => Promise<T>) => withRequestActivity('foreground', operation);
