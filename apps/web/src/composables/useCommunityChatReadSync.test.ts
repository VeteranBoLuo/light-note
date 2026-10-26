import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref } from 'vue';
const send = vi.hoisted(() => vi.fn());
vi.mock('@/api/communityChatApi', () => ({ markCommunityChatRoomRead: send }));
import { useCommunityChatReadSync } from './useCommunityChatReadSync';

function deferred() {
  let resolve!: (value: any) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<any>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const ok = { status: 200, data: { unreadCount: 0 } };
const cleanups: (() => void)[] = [];
function harness() {
  send.mockReset();
  const owner = ref('alice'),
    room = ref('general'),
    active = ref(true),
    onRead = vi.fn();
  let accountGeneration = 0;
  const scope = effectScope();
  const sync = scope.run(() =>
    useCommunityChatReadSync({
      scope: () => JSON.stringify([owner.value, room.value, active.value, accountGeneration]),
      canSync: () => active.value,
      onRead,
    }),
  )!;
  cleanups.push(() => scope.stop());
  return { ...sync, owner, room, active, onRead, scope, newSession: () => accountGeneration++ };
}
afterEach(() => {
  cleanups.splice(0).forEach((stop) => stop());
});

describe('room read synchronization', () => {
  it('shares identical in-flight requests and skips an already acknowledged cursor', async () => {
    const h = harness(),
      pending = deferred();
    send.mockReturnValue(pending.promise);
    const first = h.markRead('general', 'm1'),
      duplicate = h.markRead('general', 'm1');
    expect(first).toBe(duplicate);
    await Promise.resolve();
    expect(send).toHaveBeenCalledOnce();
    pending.resolve(ok);
    await first;
    await h.markRead('general', 'm1');
    expect(send).toHaveBeenCalledOnce();
    expect(h.onRead).toHaveBeenCalledExactlyOnceWith('general', 'm1');
  });

  it('sends a new cursor without waiting for a slow old one; reversed responses cannot restore the old cursor', async () => {
    const h = harness(),
      older = deferred(),
      newer = deferred();
    send.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const a = h.markRead('general', 'm1');
    await Promise.resolve();
    const b = h.markRead('general', 'm2');
    await Promise.resolve();
    expect(send).toHaveBeenCalledTimes(2);
    newer.resolve(ok);
    await b;
    older.resolve(ok);
    await a;
    await h.markRead('general', 'm2');
    expect(send).toHaveBeenCalledTimes(2);
    expect(h.onRead).toHaveBeenCalledOnce();
  });

  it.each(['reject', 'business', 'throw'])(
    'clears failed requests and allows retry after %s failure',
    async (failure) => {
      const h = harness();
      if (failure === 'throw')
        send.mockImplementationOnce(() => {
          throw Error('offline');
        });
      else if (failure === 'reject') send.mockRejectedValueOnce(Error('offline'));
      else send.mockResolvedValueOnce({ status: 500 });
      await h.markRead('general', 'm1');
      expect(h.onRead).not.toHaveBeenCalled();
      send.mockResolvedValueOnce(ok);
      await h.markRead('general', 'm1');
      expect(send).toHaveBeenCalledTimes(2);
      expect(h.onRead).toHaveBeenCalledOnce();
    },
  );

  it('a failed newest cursor remains retryable when an older request later succeeds', async () => {
    const h = harness(),
      older = deferred();
    send.mockReturnValueOnce(older.promise).mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce(ok);
    const a = h.markRead('general', 'm1');
    await Promise.resolve();
    await h.markRead('general', 'm2');
    older.resolve(ok);
    await a;
    expect(h.onRead).not.toHaveBeenCalled();
    await h.markRead('general', 'm2');
    expect(h.onRead).toHaveBeenCalledOnce();
  });

  it('aborts on A → B → A and ignores the first A response and cleanup', async () => {
    const h = harness(),
      old = deferred(),
      fresh = deferred();
    send.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const a = h.markRead('general', 'm1');
    await Promise.resolve();
    const signal = send.mock.calls[0][2].signal;
    h.owner.value = 'bob';
    h.owner.value = 'alice';
    expect(signal.aborted).toBe(true);
    const next = h.markRead('general', 'm1');
    await Promise.resolve();
    old.resolve(ok);
    await a;
    expect(h.onRead).not.toHaveBeenCalled();
    expect(h.markRead('general', 'm1')).toBe(next);
    fresh.resolve(ok);
    await next;
    expect(h.onRead).toHaveBeenCalledOnce();
  });

  it('never dispatches a queued old cursor after an immediate account switch', async () => {
    const h = harness();
    send.mockResolvedValue(ok);
    const pending = h.markRead('general', 'm1');
    h.owner.value = 'bob';
    await pending;
    expect(send).not.toHaveBeenCalled();
    expect(h.onRead).not.toHaveBeenCalled();
  });

  it('a renewed session with the same identity cannot reuse or acknowledge the old request', async () => {
    const h = harness(),
      old = deferred();
    send.mockReturnValueOnce(old.promise).mockResolvedValueOnce(ok);
    const pending = h.markRead('general', 'm1');
    await Promise.resolve();
    h.newSession();
    await h.markRead('general', 'm1');
    old.resolve(ok);
    await pending;
    expect(send).toHaveBeenCalledTimes(2);
    expect(h.onRead).toHaveBeenCalledOnce();
  });

  it('switching rooms aborts old work and allows the same cursor value in the new room', async () => {
    const h = harness(),
      old = deferred();
    send.mockReturnValueOnce(old.promise).mockResolvedValueOnce(ok);
    const pending = h.markRead('general', 'm1');
    await Promise.resolve();
    h.room.value = 'other';
    await h.markRead('other', 'm1');
    old.resolve(ok);
    await pending;
    expect(h.onRead).toHaveBeenCalledExactlyOnceWith('other', 'm1');
  });

  it.each(['inactive', 'unmount'])('ignores late results after %s and aborts the request', async (kind) => {
    const h = harness(),
      old = deferred();
    send.mockReturnValue(old.promise);
    const pending = h.markRead('general', 'm1');
    await Promise.resolve();
    const signal = send.mock.calls[0][2].signal;
    if (kind === 'inactive') h.active.value = false;
    else h.scope.stop();
    expect(signal.aborted).toBe(true);
    old.resolve(ok);
    await pending;
    expect(h.onRead).not.toHaveBeenCalled();
    if (kind === 'unmount') {
      await h.markRead('general', 'm2');
      expect(send).toHaveBeenCalledOnce();
    }
  });

  it('a valid read response with newer unread messages must not clear the room badge', async () => {
    const h = harness();
    send.mockResolvedValue({ status: 200, data: { unreadCount: 1 } });
    await h.markRead('general', 'm1');
    await h.markRead('general', 'm1');
    expect(send).toHaveBeenCalledOnce();
    expect(h.onRead).not.toHaveBeenCalled();
  });

  it('deduplicates the null cursor used by a fully recalled window', async () => {
    const h = harness(),
      pending = deferred();
    send.mockReturnValue(pending.promise);
    const first = h.markRead('general', null),
      duplicate = h.markRead('general', null);
    expect(first).toBe(duplicate);
    await Promise.resolve();
    pending.resolve(ok);
    await first;
    expect(send.mock.calls[0][1]).toBeNull();
  });
});
