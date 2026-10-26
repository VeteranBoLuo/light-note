import { onScopeDispose, watch } from 'vue';
import { markCommunityChatRoomRead } from '@/api/communityChatApi';

/** Room cursors are independent of message delivery and per-message read receipts. */
export function useCommunityChatReadSync(options: {
  scope: () => string;
  canSync: () => boolean;
  onRead: (roomSlug: string, marker: string | null) => void;
}) {
  let activeScope = options.scope();
  let generation = 0;
  let sequence = 0;
  let acknowledgedKey = '';
  let disposed = false;
  const pending = new Map<string, { promise: Promise<void>; controller: AbortController }>();

  function reset(nextScope = options.scope()) {
    generation++;
    activeScope = nextScope;
    acknowledgedKey = '';
    for (const entry of pending.values()) entry.controller.abort();
    pending.clear();
  }
  watch(options.scope, (scope) => reset(scope), { flush: 'sync' });
  onScopeDispose(() => {
    disposed = true;
    reset();
  });

  function markRead(roomSlug: string, marker: string | null): Promise<void> {
    if (disposed || !roomSlug || !options.canSync()) return Promise.resolve();
    const scope = options.scope();
    if (scope !== activeScope) reset(scope);
    const key = JSON.stringify([roomSlug, marker]);
    if (key === acknowledgedKey) return Promise.resolve();
    const existing = pending.get(key);
    if (existing) return existing.promise;
    const requestGeneration = generation;
    const requestSequence = ++sequence;
    const controller = new AbortController();
    const current = () =>
      generation === requestGeneration && options.scope() === scope && !controller.signal.aborted && options.canSync();
    const promise = Promise.resolve()
      .then(async () => {
        // Scope may change before Axios dispatches; never send old cursors under a new session.
        if (!current()) return;
        const response = await markCommunityChatRoomRead(roomSlug, marker, { signal: controller.signal });
        if (response?.status !== 200 || !current() || requestSequence !== sequence) return;
        acknowledgedKey = key;
        // New unseen messages can arrive while this cursor is being committed.
        if (response.data?.unreadCount === 0) options.onRead(roomSlug, marker);
      })
      .catch(() => {
        // Leave the marker unacknowledged; the next ordinary foreground attempt can retry.
      })
      .finally(() => {
        if (pending.get(key)?.promise === promise) pending.delete(key);
      });
    pending.set(key, { promise, controller });
    return promise;
  }
  return { markRead, reset };
}
