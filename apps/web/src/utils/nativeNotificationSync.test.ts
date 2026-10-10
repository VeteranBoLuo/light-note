import { describe, expect, it, vi } from 'vitest';
import { createNativeNotificationSync, type NativeNotificationPage } from './nativeNotificationSync';
const since = '2026-10-08 12:00:00.000000';
function setup() {
  const bridge = vi.fn(async (_input: Record<string, unknown>) => ({ ok: true, enabled: true, since }));
  const fetch = vi.fn(async (): Promise<NativeNotificationPage> => ({
    owner: 'alice',
    since,
    items: [],
    cursor: null,
  }));
  const open = vi.fn();
  const refreshUnread = vi.fn(async () => {});
  const sync = createNativeNotificationSync({ bridge, fetch, open, refreshUnread });
  sync.setOwner('alice');
  return { sync, bridge, fetch, open, refreshUnread };
}
describe('native notification synchronization', () => {
  it('refreshes the badge before delivery, without refreshing again for repeated sweeps', async () => {
    const { sync, bridge, fetch, refreshUnread } = setup();
    fetch.mockResolvedValue({ owner: 'alice', since, items: [{ id: 'first', time: since }], cursor: null });
    await sync.tick();
    expect(refreshUnread).toHaveBeenCalledOnce();
    expect(refreshUnread.mock.invocationCallOrder[0]).toBeLessThan(bridge.mock.invocationCallOrder[1]);
    await sync.tick();
    expect(refreshUnread).toHaveBeenCalledOnce();
    fetch.mockResolvedValue({ owner: 'alice', since, items: [{ id: 'late-commit', time: since }], cursor: null });
    await sync.tick();
    expect(refreshUnread).toHaveBeenCalledTimes(2);
  });
  it('keeps deduplication across pages of a repeated sweep', async () => {
    const { sync, fetch, refreshUnread } = setup();
    const pages: NativeNotificationPage[] = [
      {
        owner: 'alice',
        since,
        items: [{ id: 'first', time: since }],
        cursor: { id: 'first', time: since, until: since },
      },
      { owner: 'alice', since, items: [{ id: 'second', time: since }], cursor: null },
    ];
    for (const page of [...pages, ...pages]) {
      fetch.mockResolvedValueOnce(page);
      await sync.tick();
    }
    expect(refreshUnread).toHaveBeenCalledTimes(2);
  });
  it('does not refresh for empty or mismatched pages', async () => {
    const { sync, fetch, refreshUnread } = setup();
    await sync.tick();
    fetch.mockResolvedValue({ owner: 'bob', since, items: [{ id: 'other', time: since }], cursor: null });
    await sync.tick();
    expect(refreshUnread).not.toHaveBeenCalled();
  });
  it('delivers even if badge refresh fails', async () => {
    const { sync, bridge, fetch, refreshUnread } = setup();
    refreshUnread.mockRejectedValueOnce(new Error('offline'));
    fetch.mockResolvedValue({ owner: 'alice', since, items: [{ id: 'first', time: since }], cursor: null });
    await sync.tick();
    expect(bridge.mock.calls.at(-1)?.[0].action).toBe('deliver');
  });
  it('discards delivery when the account changes during badge refresh', async () => {
    const { sync, bridge, fetch, refreshUnread } = setup();
    fetch.mockResolvedValue({ owner: 'alice', since, items: [{ id: 'first', time: since }], cursor: null });
    refreshUnread.mockImplementationOnce(async () => {
      sync.setOwner('bob');
    });
    await sync.tick();
    expect(bridge.mock.calls.filter(([p]) => p.action === 'deliver')).toHaveLength(0);
    sync.setOwner('alice');
    await sync.tick();
    expect(refreshUnread).toHaveBeenCalledTimes(2);
  });
  it('binds before reading; retains native dedup baseline on page reload', async () => {
    const { sync, bridge, fetch } = setup();
    await sync.tick();
    expect(bridge.mock.calls[0][0]).toMatchObject({ action: 'bind', owner: 'alice' });
    expect(fetch).toHaveBeenCalledWith({ since, cursor: null });
    expect(bridge.mock.calls[1][0]).toMatchObject({ action: 'deliver', owner: 'alice', since });
  });
  it('never fetches for unsupported shells or disabled permission', async () => {
    for (const state of [
      { ok: false, enabled: false, since },
      { ok: true, enabled: false, since },
    ]) {
      const { sync, bridge, fetch } = setup();
      bridge.mockResolvedValue(state);
      await sync.tick();
      expect(fetch).not.toHaveBeenCalled();
    }
  });
  it('clears on logout and discards a previous account fetch even after switching back', async () => {
    const { sync, bridge, fetch } = setup();
    let resolve!: (value: NativeNotificationPage) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const old = sync.tick();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    sync.setOwner('bob');
    sync.setOwner('alice');
    resolve({ owner: 'alice', since, items: [], cursor: null });
    await old;
    expect(bridge.mock.calls.filter(([p]) => p.action === 'deliver')).toHaveLength(0);
    sync.setOwner('');
    await sync.tick();
    expect(bridge.mock.calls.at(-1)?.[0]).toEqual({ action: 'clear' });
  });
  it('does not deliver a mismatched server owner', async () => {
    const { sync, bridge, fetch } = setup();
    fetch.mockResolvedValue({ owner: 'bob', since, items: [], cursor: null });
    await sync.tick();
    expect(bridge).toHaveBeenCalledTimes(1);
  });
  it('advances a page only after native acknowledgement, retries failed batches', async () => {
    const { sync, bridge, fetch } = setup();
    const cursor = { id: 'x', time: since, until: since };
    fetch.mockResolvedValue({ owner: 'alice', since, items: [], cursor });
    bridge
      .mockResolvedValueOnce({ ok: true, enabled: true, since })
      .mockResolvedValueOnce({ ok: false, enabled: true, since });
    await sync.tick();
    await sync.tick();
    expect(fetch.mock.calls.map(() => null)).toHaveLength(2);
    expect(fetch).toHaveBeenLastCalledWith({ since, cursor: null });
    await sync.tick();
    expect(fetch).toHaveBeenLastCalledWith({ since, cursor });
  });
  it('opens notification center through the router callback even when permission is disabled', async () => {
    const { sync, bridge, open, fetch } = setup();
    bridge.mockResolvedValue({ ok: true, enabled: false, since, open: true } as never);
    await sync.tick();
    expect(open).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('pauses while identity is unknown and ignores the pending response', async () => {
    const { sync, bridge, fetch } = setup();
    let resolve!: (value: NativeNotificationPage) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const old = sync.tick();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    sync.pause();
    resolve({ owner: 'alice', since, items: [], cursor: null });
    await old;
    await sync.tick();
    expect(bridge.mock.calls.filter(([p]) => p.action === 'deliver')).toHaveLength(0);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not run two simultaneous pulls for the same owner', async () => {
    const { sync, fetch } = setup();
    await Promise.all([sync.tick(), sync.tick()]);
    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe('Huawei binding lifecycle', () => {
  it('activates the account binding before asking the server to suppress local duplicates', async () => {
    const binding = { id: 'device', generation: 'g', userId: 'alice' };
    const remote = { bind: vi.fn(async () => binding), activate: vi.fn(async () => {}), unbind: vi.fn(async () => {}) };
    const bridge = vi.fn(async () => ({ ok: true, enabled: true, since, huaweiToken: 'device-token' }));
    const fetch = vi.fn(async () => ({ owner: 'alice', since, items: [], cursor: null }));
    const sync = createNativeNotificationSync({ bridge, fetch, remote, open: vi.fn(), refreshUnread: vi.fn() });
    sync.setOwner('alice');
    await sync.tick();
    expect(fetch).toHaveBeenCalledWith({ since, cursor: null, huaweiBinding: binding });
    expect(remote.activate.mock.invocationCallOrder[0]).toBeLessThan(fetch.mock.invocationCallOrder[0]);
    await sync.tick();
    expect(remote.bind).toHaveBeenCalledOnce();
    sync.setOwner('');
    expect(remote.unbind).toHaveBeenCalledWith(binding);
    expect(bridge).toHaveBeenLastCalledWith({ action: 'clear' });
  });
  it('does not activate a late response after logout', async () => {
    const binding = { id: 'device', generation: 'g', userId: 'alice' };
    let finish!: (value: typeof binding) => void;
    const remote = {
      bind: vi.fn(
        () =>
          new Promise<typeof binding>((resolve) => {
            finish = resolve;
          }),
      ),
      activate: vi.fn(async () => {}),
      unbind: vi.fn(async () => {}),
    };
    const bridge = vi.fn(async () => ({ ok: true, enabled: true, since, huaweiToken: 'device-token' }));
    const fetch = vi.fn(async () => ({ owner: 'alice', since, items: [], cursor: null }));
    const sync = createNativeNotificationSync({ bridge, fetch, remote, open: vi.fn(), refreshUnread: vi.fn() });
    sync.setOwner('alice');
    const pending = sync.tick();
    await vi.waitFor(() => expect(remote.bind).toHaveBeenCalledOnce());
    sync.setOwner('');
    finish(binding);
    await pending;
    expect(remote.activate).not.toHaveBeenCalled();
    expect(remote.unbind).toHaveBeenCalledWith(binding);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('notification connection readiness and recovery', () => {
  function connection() {
    const binding = { id: 'device', generation: 'g', userId: 'alice' };
    const remote = { bind: vi.fn(async () => binding), activate: vi.fn(async () => {}), unbind: vi.fn(async () => {}) };
    const bridge = vi.fn<
      (_input: Record<string, unknown>) => Promise<import('./nativeNotificationSync').NativeNotificationReply>
    >(async () => ({ ok: true, enabled: true, since, huaweiToken: 'token' }));
    const fetch = vi.fn(async () => ({ owner: 'alice', since, items: [], cursor: null }));
    const onState = vi.fn();
    const sync = createNativeNotificationSync({
      bridge,
      fetch,
      remote,
      onState,
      open: vi.fn(),
      refreshUnread: vi.fn(),
    });
    sync.setOwner('alice');
    return { sync, bridge, fetch, remote, onState, binding };
  }
  it('only reports connected after the activation acknowledgement', async () => {
    const { sync, remote, onState } = connection();
    let finish!: () => void;
    remote.activate.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
    );
    const task = sync.tick();
    await vi.waitFor(() => expect(remote.activate).toHaveBeenCalledOnce());
    expect(onState).toHaveBeenLastCalledWith('connecting', 'alice');
    finish();
    await task;
    expect(onState).toHaveBeenLastCalledWith('connected', 'alice');
  });
  it('detects a delayed token without waiting for the normal notification polling interval', async () => {
    const { sync, bridge, remote, fetch, onState } = connection();
    bridge.mockResolvedValueOnce({ ok: true, enabled: true, huaweiToken: '' });
    await sync.tick({ syncNotifications: false });
    expect(sync.nextDelay()).toBe(1000);
    expect(remote.bind).not.toHaveBeenCalled();
    await sync.tick({ syncNotifications: false });
    expect(remote.bind).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(onState).toHaveBeenLastCalledWith('connected', 'alice');
    expect(sync.nextDelay()).toBe(15000);
  });
  it('recovers from a bridge timeout instead of permanently disabling synchronization', async () => {
    const { sync, bridge, onState } = connection();
    bridge.mockResolvedValueOnce({ ok: false });
    await sync.tick();
    expect(onState).toHaveBeenLastCalledWith('unavailable', 'alice');
    await sync.tick();
    expect(onState).toHaveBeenLastCalledWith('connected', 'alice');
  });
  it('revalidates an existing connection immediately after the bridge recovers', async () => {
    const { sync, bridge, remote, onState } = connection();
    await sync.tick();
    bridge.mockResolvedValueOnce({ ok: false });
    await sync.tick();
    expect(onState).toHaveBeenLastCalledWith('unavailable', 'alice');
    await sync.tick();
    expect(remote.activate).toHaveBeenCalledTimes(2);
    expect(onState).toHaveBeenLastCalledWith('connected', 'alice');
  });
  it('backs off failed registration and lets a network recovery retry immediately', async () => {
    let now = 100000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const { sync, remote, onState } = connection();
      remote.bind.mockRejectedValue(new Error('offline'));
      for (const delay of [1000, 2000, 5000, 10000, 30000, 60000, 60000]) {
        const calls = remote.bind.mock.calls.length;
        await sync.tick();
        expect(remote.bind).toHaveBeenCalledTimes(calls + 1);
        expect(onState).toHaveBeenLastCalledWith('retrying', 'alice');
        await sync.tick();
        expect(remote.bind).toHaveBeenCalledTimes(calls + 1);
        now += delay;
      }
      remote.bind.mockResolvedValue({ id: 'device', generation: 'g', userId: 'alice' });
      sync.retry();
      await sync.tick();
      expect(onState).toHaveBeenLastCalledWith('connected', 'alice');
    } finally {
      clock.mockRestore();
    }
  });
  it('does not report success when activation fails and resumes activation on retry', async () => {
    const { sync, remote, onState, fetch } = connection();
    remote.activate.mockRejectedValueOnce(new Error('timeout'));
    await sync.tick();
    expect(onState).toHaveBeenLastCalledWith('retrying', 'alice');
    expect(fetch.mock.calls[0]).toEqual([{ since, cursor: null }]);
    sync.retry();
    await sync.tick();
    expect(remote.activate).toHaveBeenCalledTimes(2);
    expect(onState).toHaveBeenLastCalledWith('connected', 'alice');
  });
  it('resets provider-invalid tokens and never passes that binding to notification synchronization', async () => {
    const { sync, remote, bridge, fetch } = connection();
    remote.bind.mockRejectedValueOnce(Object.assign(new Error('invalid'), { invalidToken: true }));
    await sync.tick();
    expect(bridge).toHaveBeenCalledWith(expect.objectContaining({ action: 'resetRemote', owner: 'alice' }));
    expect(fetch).toHaveBeenCalledWith({ since, cursor: null });
    sync.retry();
    await sync.tick();
    expect(remote.activate).toHaveBeenCalledOnce();
  });
  it('clears ready state when permission is removed and reconnects when restored', async () => {
    const { sync, remote, bridge, onState, binding } = connection();
    await sync.tick();
    bridge.mockResolvedValueOnce({ ok: true, enabled: false });
    await sync.tick();
    expect(remote.unbind).toHaveBeenCalledWith(binding);
    expect(onState).toHaveBeenLastCalledWith('disabled', 'alice');
    await sync.tick();
    expect(onState).toHaveBeenLastCalledWith('connected', 'alice');
  });
  it('keeps permission pending checks fast initially, then reduces the check rate', async () => {
    let now = 100000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const { sync, bridge, remote } = connection();
      bridge.mockResolvedValue({ ok: true, enabled: false });
      await sync.tick();
      expect(sync.nextDelay()).toBe(1000);
      now += 31000;
      await sync.tick();
      expect(sync.nextDelay()).toBe(15000);
      expect(remote.bind).not.toHaveBeenCalled();
    } finally {
      clock.mockRestore();
    }
  });
  it('does not claim background support when no token arrives', async () => {
    let now = 100000;
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      const { sync, bridge, onState } = connection();
      bridge.mockResolvedValue({ ok: true, enabled: true, huaweiToken: '' });
      await sync.tick({ syncNotifications: false });
      now += 125000;
      await sync.tick({ syncNotifications: false });
      expect(onState).toHaveBeenLastCalledWith('unavailable', 'alice');
      expect(sync.nextDelay()).toBe(15000);
    } finally {
      clock.mockRestore();
    }
  });
  it('does not restore connected state from an old activation after an account switch', async () => {
    const { sync, remote, onState } = connection();
    let finish!: () => void;
    remote.activate.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          finish = r;
        }),
    );
    const task = sync.tick();
    await vi.waitFor(() => expect(remote.activate).toHaveBeenCalledOnce());
    sync.setOwner('bob');
    finish();
    await task;
    expect(onState).toHaveBeenLastCalledWith('checking', 'bob');
    expect(remote.unbind).toHaveBeenCalledOnce();
    sync.pause();
    expect(onState).toHaveBeenLastCalledWith('idle', '');
  });
});
