import { postAndroidMessage } from './androidBridge';

export interface NativeNotificationReply {
  ok: boolean;
  enabled?: boolean;
  since?: string;
  open?: boolean;
}
interface Cursor {
  time: string;
  id: string;
  until: string;
}
export interface NativeNotificationPage {
  owner: string;
  since: string;
  items: { id: string; time: string }[];
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
  fetch: (input: { since: string | null; cursor: Cursor | null }) => Promise<NativeNotificationPage>;
  open: () => void;
}) {
  let owner = '',
    epoch = '',
    generation = 0;
  let cursor: Cursor | null = null;
  let busy: number | null = null;
  let supported: boolean | null = null;
  function setOwner(next: string) {
    if (owner === next) {
      if (!next) void deps.bridge({ action: 'clear' });
      return;
    }
    const shouldClear = !next || Boolean(owner);
    owner = next;
    epoch = requestId();
    generation++;
    cursor = null;
    supported = null;
    // Clear even while a previous fetch/bridge call is pending.
    if (shouldClear) void deps.bridge({ action: 'clear' });
  }
  function pause() {
    owner = '';
    epoch = '';
    generation++;
    cursor = null;
    supported = null;
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
      const page = await deps.fetch({ since: state.since || null, cursor });
      if (!current() || page.owner !== uid) return;
      const receipt = await deps.bridge({
        action: 'deliver',
        owner: uid,
        epoch: nonce,
        since: page.since,
        items: page.items,
      });
      if (!current() || !receipt.ok) return;
      cursor = page.cursor;
    } finally {
      if (busy === active) busy = null;
    }
  }
  return { setOwner, pause, tick };
}
