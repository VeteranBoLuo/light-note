import { postAndroidMessage } from './androidBridge';
import type { NativePushBindingStore } from './nativePushBindingStore';

export interface NativeNotificationReply {
  ok: boolean;
  huaweiToken?: string;
  enabled?: boolean;
  systemEnabled?: boolean;
  settingsAvailable?: boolean;
  pushSupport?: NativePushSupport;
  since?: string;
  open?: boolean;
}
export type NativeNotificationState =
  | 'idle'
  | 'checking'
  | 'connecting'
  | 'connected'
  | 'disabled'
  | 'retrying'
  | 'unavailable'
  | 'deviceLimit'
  | 'accountRequired'
  | 'serviceDisabled'
  | 'storageUnavailable';

export type NativePushSupport = 'supported' | 'unsupported' | 'unknown';

export interface NativeNotificationDeviceState {
  systemEnabled: boolean | null;
  settingsAvailable: boolean;
  pushSupport?: NativePushSupport;
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
    bind: (token: string, previousBinding?: HuaweiBinding) => Promise<HuaweiBinding>;
    activate: (binding: HuaweiBinding) => Promise<void>;
    unbind: (binding: HuaweiBinding) => Promise<void>;
  };
  bindingStore?: NativePushBindingStore;
  open: () => void;
  refreshUnread: () => Promise<void>;
  onState?: (state: NativeNotificationState, owner: string) => void;
  onDeviceState?: (state: NativeNotificationDeviceState | null, owner: string) => void;
}) {
  let owner = '',
    epoch = '',
    generation = 0;
  let remoteBinding: HuaweiBinding | undefined;
  let remoteToken = '';
  let boundToken = '';
  let remoteActivated = false;
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
  function failed(error?: unknown) {
    const delay = [1000, 2000, 5000, 10000, 30000, 60000][Math.min(failures++, 5)];
    const state = (error as { connectionState?: NativeNotificationState })?.connectionState;
    const specific =
      state && ['deviceLimit', 'accountRequired', 'serviceDisabled', 'storageUnavailable'].includes(state);
    remoteNextAt = Date.now() + (specific ? 60000 : delay);
    report(specific ? state : 'retrying');
  }
  async function unbind(binding: HuaweiBinding) {
    await deps.remote?.unbind(binding);
    deps.bindingStore?.remove(binding);
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
    if (remoteBinding) void unbind(remoteBinding).catch(() => {});
    remoteBinding = undefined;
    remoteToken = '';
    boundToken = '';
    remoteActivated = false;
    retry();
    owner = next;
    deps.onDeviceState?.(null, owner);
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
    deps.onDeviceState?.(null, owner);
    epoch = '';
    remoteBinding = undefined;
    remoteToken = '';
    boundToken = '';
    remoteActivated = false;
    retry();
    generation++;
    cursor = null;
    report(owner ? 'checking' : 'idle');
    knownIds.clear();
    sweepIds.clear();
  }
  async function tick({ syncNotifications = true, online = true } = {}) {
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
        deps.onDeviceState?.(null, uid);
        remoteNextAt = 0;
        report('unavailable');
        return;
      }
      deps.onDeviceState?.(
        {
          systemEnabled: typeof state.systemEnabled === 'boolean' ? state.systemEnabled : null,
          settingsAvailable: state.settingsAvailable === true,
          pushSupport:
            state.pushSupport === 'supported' || state.pushSupport === 'unsupported' ? state.pushSupport : 'unknown',
        },
        uid,
      );
      if (state.open) deps.open();
      // Keep the previous binding until online cleanup can run; no API requests while offline.
      if (!online) {
        if (!state.enabled) report('disabled');
        return;
      }
      if (!state.enabled) {
        remoteToken = '';
        boundToken = '';
        remoteActivated = false;
        try {
          const previous = remoteBinding || deps.bindingStore?.read(uid);
          if (previous) {
            await unbind(previous);
            if (current()) remoteBinding = undefined;
          }
        } catch {
          /* Preserve the receipt for the next online check. */
        }
        if (!current()) return;
        failures = 0;
        remoteNextAt = 0;
        report('disabled');
        return;
      }
      if (connectionState === 'disabled') retry();
      if (deps.remote && state.huaweiToken) {
        if (remoteToken !== state.huaweiToken) {
          remoteToken = state.huaweiToken;
          retry();
          report('connecting');
        }
        if (Date.now() >= remoteNextAt) {
          if (!remoteBinding) report('connecting');
          try {
            remoteBinding ||= deps.bindingStore?.read(uid);
            const binding = await deps.remote.bind(state.huaweiToken, remoteBinding);
            if (!current() || binding.userId !== uid) {
              await unbind(binding);
              if (current()) failed();
              return;
            }
            // Save before activation: a reload or lost activation response must retain the replacement receipt.
            remoteActivated =
              remoteActivated &&
              remoteBinding?.id === binding.id &&
              remoteBinding.generation === binding.generation &&
              boundToken === state.huaweiToken;
            remoteBinding = binding;
            boundToken = state.huaweiToken;
            deps.bindingStore?.save(binding);
            await deps.remote.activate(binding);
            // Account changes already unbind the saved receipt. A page unload keeps background delivery alive.
            if (!current()) return;
            remoteBinding = binding;
            remoteActivated = true;
            failures = 0;
            remoteNextAt = Date.now() + 60000;
            report('connected');
          } catch (error) {
            if (!current()) return;
            // Do not present a stale successful check as the current connection state.
            // Keep the last binding for deduplication on transient network failures.
            failed(error);
            if ((error as { staleBinding?: boolean })?.staleBinding && remoteBinding) {
              try {
                deps.bindingStore?.remove(remoteBinding);
              } catch (storageError) {
                failed(storageError);
              }
              remoteBinding = undefined;
              boundToken = '';
              remoteActivated = false;
            }
            if ((error as { invalidToken?: boolean })?.invalidToken) {
              remoteActivated = false;
              // Keep the old receipt to retire it atomically when the native SDK returns a fresh token.
              await deps.bridge({ action: 'resetRemote', owner: uid, epoch: nonce });
            }
          }
        }
      } else if (!state.huaweiToken) {
        remoteToken = '';
        boundToken = '';
        // Old/non-Huawei shells also return no token: never claim remote support from permission alone.
        report(Date.now() - startedAt < 120000 ? 'connecting' : 'unavailable');
      }
      if (!current() || !syncNotifications) return;
      const page = await deps.fetch({
        since: state.since || null,
        cursor,
        ...(remoteBinding && remoteActivated && boundToken === state.huaweiToken
          ? { huaweiBinding: remoteBinding }
          : {}),
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
