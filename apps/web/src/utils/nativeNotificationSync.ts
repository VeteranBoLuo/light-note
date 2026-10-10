import { postAndroidMessage } from './androidBridge';

export interface NativeNotificationReply {
  ok: boolean;
  huaweiToken?: string;
  enabled?: boolean;
  since?: string;
  open?: boolean;
}
export type NativeNotificationState =
  'idle' | 'checking' | 'connecting' | 'connected' | 'disabled' | 'retrying' | 'unavailable';

export interface HuaweiBinding {
  id: string;
  generation: string;
  userId: string;
}
interface Cursor {
  time: string;
  id: string;
  until: string;
}
export interface NativeNotificationPage {
  owner: string;
  since: string;
  items: {
    id: string;
    time: string;
    remote?: boolean;
    todo?: boolean;
    chat?: boolean;
    title?: string;
    body?: string;
  }[];
  cursor: Cursor | null;
}
declare global {
  interface Window {
    __lightNoteNativeNotificationResult?: (raw: unknown) => void;
  }
}
// getRandomValues remains available in LAN HTTP WebViews used by device previews.
const requestId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
const pending = new Map<string, (reply: NativeNotificationReply) => void>();
export function nativeNotificationMessage(payload: Record<string, unknown>): Promise<NativeNotificationReply> {
  window.__lightNoteNativeNotificationResult = (raw) => {
    if (!raw || typeof raw !== 'object') return;
    const reply = raw as NativeNotificationReply & { token: string };
    pending.get(reply.token)?.(reply);
  };
  return new Promise((resolve) => {
    const token = requestId();
    const timeout = setTimeout(() => settle({ ok: false }), 2000);
    const settle = (reply: NativeNotificationReply) => {
      clearTimeout(timeout);
      pending.delete(token);
      resolve(reply);
    };
    pending.set(token, settle);
    if (!postAndroidMessage({ ...payload, type: 'nativeNotifications', token })) settle({ ok: false });
  });
}

/** One owner/generation per runtime; late responses never cross logout or an account switch. */
export function createNativeNotificationSync(deps: {
  bridge: (payload: Record<string, unknown>) => Promise<NativeNotificationReply>;
  fetch: (input: {
    since: string | null;
    cursor: Cursor | null;
    huaweiBinding?: HuaweiBinding;
  }) => Promise<NativeNotificationPage>;
  remote?: {
    bind: (token: string) => Promise<HuaweiBinding>;
    activate: (binding: HuaweiBinding) => Promise<void>;
    unbind: (binding: HuaweiBinding) => Promise<void>;
  };
  open: () => void;
  refreshUnread: () => Promise<void>;
  onState?: (state: NativeNotificationState, owner: string) => void;
}) {
  let owner = '',
    epoch = '',
    generation = 0;
  let remoteBinding: HuaweiBinding | undefined;
  let remoteToken = '';
  let remoteNextAt = 0;
  let failures = 0;
  let startedAt = Date.now();
  let connectionState: NativeNotificationState = 'idle';
  function report(state: NativeNotificationState) {
    connectionState = state;
    deps.onState?.(state, owner);
  }
  function nextDelay() {
    if (!owner) return 60000;
    if (connectionState === 'connected') return 15000;
    if (connectionState === 'disabled' && Date.now() - startedAt >= 30000) return 15000;
    if (failures) return Math.max(1000, Math.min(15000, remoteNextAt - Date.now()));
    const elapsed = Date.now() - startedAt;
    return elapsed < 30000 ? 1000 : elapsed < 120000 ? 5000 : 15000;
  }
  function retry() {
    remoteNextAt = 0;
    failures = 0;
    startedAt = Date.now();
  }
  function failed() {
    const delay = [1000, 2000, 5000, 10000, 30000, 60000][Math.min(failures++, 5)];
    remoteNextAt = Date.now() + delay;
    report('retrying');
  }
  let cursor: Cursor | null = null;
  let busy: number | null = null;
  let knownIds = new Set<string>();
  let sweepIds = new Set<string>();
  function setOwner(next: string) {
    if (owner === next) {
      if (!next) void deps.bridge({ action: 'clear' });
      return;
    }
    const shouldClear = !next || Boolean(owner);
    if (remoteBinding) void deps.remote?.unbind(remoteBinding).catch(() => {});
    remoteBinding = undefined;
    remoteToken = '';
    retry();
    owner = next;
    epoch = requestId();
    generation++;
    cursor = null;
    report(owner ? 'checking' : 'idle');
    knownIds.clear();
    sweepIds.clear();
    // Clear even while a previous fetch/bridge call is pending.
    if (shouldClear) void deps.bridge({ action: 'clear' });
  }
  function pause() {
    owner = '';
    epoch = '';
    remoteBinding = undefined;
    remoteToken = '';
    retry();
    generation++;
    cursor = null;
    report(owner ? 'checking' : 'idle');
    knownIds.clear();
    sweepIds.clear();
  }
  async function tick({ syncNotifications = true } = {}) {
    if (!owner || busy === generation) return;
    const active = generation,
      uid = owner,
      nonce = epoch;
    const current = () => generation === active;
    busy = active;
    try {
      const state = await deps
        .bridge({ action: 'bind', owner: uid, epoch: nonce })
        .catch(() => ({ ok: false }) as NativeNotificationReply);
      if (!current()) return;
      if (!state.ok) {
        remoteNextAt = 0;
        report('unavailable');
        return;
      }
      if (state.open) deps.open();
      if (!state.enabled) {
        const previous = remoteBinding;
        remoteBinding = undefined;
        remoteToken = '';
        if (previous) void deps.remote?.unbind(previous).catch(() => {});
        failures = 0;
        remoteNextAt = 0;
        report('disabled');
        return;
      }
      if (connectionState === 'disabled') retry();
      if (deps.remote && state.huaweiToken) {
        if (remoteToken !== state.huaweiToken) {
          remoteBinding = undefined;
          remoteToken = state.huaweiToken;
          retry();
        }
        if (Date.now() >= remoteNextAt) {
          if (!remoteBinding) report('connecting');
          try {
            const binding = await deps.remote.bind(state.huaweiToken);
            if (!current() || binding.userId !== uid) {
              await deps.remote.unbind(binding);
              if (current()) failed();
              return;
            }
            await deps.remote.activate(binding);
            if (!current()) {
              await deps.remote.unbind(binding);
              return;
            }
            remoteBinding = binding;
            failures = 0;
            remoteNextAt = Date.now() + 60000;
            report('connected');
          } catch (error) {
            if (!current()) return;
            // Do not present a stale successful check as the current connection state.
            // Keep the last binding for deduplication on transient network failures.
            failed();
            if ((error as { invalidToken?: boolean })?.invalidToken) {
              remoteBinding = undefined;
              await deps.bridge({ action: 'resetRemote', owner: uid, epoch: nonce });
            }
          }
        }
      } else if (!state.huaweiToken) {
        remoteBinding = undefined;
        remoteToken = '';
        // Old/non-Huawei shells also return no token: never claim remote support from permission alone.
        report(Date.now() - startedAt < 120000 ? 'connecting' : 'unavailable');
      }
      if (!current() || !syncNotifications) return;
      const page = await deps.fetch({
        since: state.since || null,
        cursor,
        ...(remoteBinding ? { huaweiBinding: remoteBinding } : {}),
      });
      if (!current() || page.owner !== uid) return;
      if (page.items.some(({ id }) => !knownIds.has(id))) {
        // Reuse the notification center's authoritative count before displaying the system alert.
        // A failed refresh must not suppress delivery; ordinary unread polling remains the fallback.
        try {
          await deps.refreshUnread();
        } catch {
          /* Keep delivery independent of the badge request. */
        }
        if (!current()) return;
      }
      const receipt = await deps.bridge({
        action: 'deliver',
        owner: uid,
        epoch: nonce,
        since: page.since,
        items: page.items,
      });
      if (!current() || !receipt.ok) return;
      for (const { id } of page.items) {
        knownIds.add(id);
        sweepIds.add(id);
      }
      if (!page.cursor) {
        // Keep only the latest completed sweep, rather than accumulating IDs for the page lifetime.
        knownIds = sweepIds;
        sweepIds = new Set();
      }
      cursor = page.cursor;
    } finally {
      if (busy === active) busy = null;
    }
  }
  return { setOwner, pause, tick, retry, nextDelay };
}
