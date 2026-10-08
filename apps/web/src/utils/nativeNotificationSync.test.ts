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
  const sync = createNativeNotificationSync({ bridge, fetch, open });
  sync.setOwner('alice');
  return { sync, bridge, fetch, open };
}
describe('native notification synchronization', () => {
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
