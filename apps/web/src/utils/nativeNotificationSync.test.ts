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
    await Promise.resolve();
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
    await Promise.resolve();
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
    await Promise.resolve();
    sync.setOwner('');
    finish(binding);
    await pending;
    expect(remote.activate).not.toHaveBeenCalled();
    expect(remote.unbind).toHaveBeenCalledWith(binding);
    expect(fetch).not.toHaveBeenCalled();
  });
});
