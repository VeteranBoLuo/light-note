import { postAndroidMessage } from './androidBridge';

export interface NativeNotificationReply {
  ok: boolean;
  huaweiToken?: string;
  enabled?: boolean;
  since?: string;
  open?: boolean;
}
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
  items: { id: string; time: string; remote?: boolean; todo?: boolean; chat?: boolean; title?: string; body?: string }[];
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
}) {
  let owner = '',
    epoch = '',
    generation = 0;
  let remoteBinding: HuaweiBinding | undefined;
  let remoteToken = '';
  let remoteCheckedAt = 0;
  let cursor: Cursor | null = null;
  let busy: number | null = null;
  let supported: boolean | null = null;
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
    remoteCheckedAt = 0;
    owner = next;
    epoch = requestId();
    generation++;
    cursor = null;
    supported = null;
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
    remoteCheckedAt = 0;
    generation++;
    cursor = null;
    supported = null;
    knownIds.clear();
    sweepIds.clear();
  }
  async function tick() {
    if (!owner || supported === false || busy === generation) return;
    const active = generation,
      uid = owner,
      nonce = epoch;
    const current = () => generation === active;
    busy = active;
    try {
      const state = await deps.bridge({ action: 'bind', owner: uid, epoch: nonce });
      if (!current()) return;
      supported = state.ok;
      if (!state.ok) return;
      if (state.open) deps.open();
      if (!state.enabled) return;
      if (
        deps.remote &&
        state.huaweiToken &&
        (remoteToken !== state.huaweiToken || Date.now() - remoteCheckedAt > 60000)
      ) {
        if (remoteToken !== state.huaweiToken) remoteBinding = undefined;
        try {
          const binding = await deps.remote.bind(state.huaweiToken);
          if (!current() || binding.userId !== uid) {
            await deps.remote.unbind(binding);
            return;
          }
          await deps.remote.activate(binding);
          if (!current()) {
            await deps.remote.unbind(binding);
            return;
          }
          remoteBinding = binding;
          remoteToken = state.huaweiToken;
          remoteCheckedAt = Date.now();
        } catch (error) {
          if (!current()) return;
          if ((error as { invalidToken?: boolean })?.invalidToken) {
            remoteBinding = undefined;
            await deps.bridge({ action: 'resetRemote', owner: uid, epoch: nonce });
          }
          remoteToken = state.huaweiToken;
          remoteCheckedAt = Date.now();
        }
      } else if (!state.huaweiToken) {
        remoteBinding = undefined;
        remoteToken = '';
      }
      if (!current()) return;
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
  return { setOwner, pause, tick };
}
