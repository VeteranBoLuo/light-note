import { beforeEach, expect, it, vi } from 'vitest';
import {
  createNativeNotificationSync,
  type NativeNotificationReply,
  type HuaweiBinding,
} from './nativeNotificationSync';
import { createNativePushBindingStore } from './nativePushBindingStore';

const old = { id: 'old-device', generation: 'old-g', userId: 'alice' };
const next = { id: 'new-device', generation: 'new-g', userId: 'alice' };
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
function fixture() {
  const bindingStore = createNativePushBindingStore(localStorage);
  const bridge = vi.fn(async (): Promise<NativeNotificationReply> => ({
    ok: true,
    enabled: true,
    huaweiToken: 'old-token',
  }));
  const remote = {
    bind: vi.fn(async (_token: string, _previous?: HuaweiBinding) => old),
    activate: vi.fn(async () => {}),
    unbind: vi.fn(async () => {}),
  };
  const fetch = vi.fn(async (_input: unknown) => ({ owner: 'alice', since: '', items: [], cursor: null }));
  const onState = vi.fn();
  const deps = { bridge, remote, bindingStore, fetch, onState, open: vi.fn(), refreshUnread: vi.fn() };
  const sync = createNativeNotificationSync(deps);
  sync.setOwner('alice');
  return { sync, deps, bridge, remote, bindingStore, onState, fetch };
}
it('passes the old receipt during rotation and saves the replacement before activation', async () => {
  const { sync, bridge, remote, bindingStore } = fixture();
  await sync.tick();
  bridge.mockResolvedValue({ ok: true, enabled: true, huaweiToken: 'new-token' });
  remote.bind.mockResolvedValue(next);
  remote.activate.mockImplementation(async () => {
    expect(bindingStore.read('alice')).toEqual(next);
  });
  await sync.tick();
  expect(remote.bind).toHaveBeenLastCalledWith('new-token', old);
  expect(bindingStore.read('alice')).toEqual(next);
});
it('restores a pending replacement after reload and retries activation without losing its receipt', async () => {
  const { sync, deps, bridge, remote, bindingStore, onState } = fixture();
  await sync.tick();
  bridge.mockResolvedValue({ ok: true, enabled: true, huaweiToken: 'new-token' });
  remote.bind.mockResolvedValue(next);
  remote.activate.mockRejectedValueOnce(new Error('timeout'));
  await sync.tick();
  expect(onState).toHaveBeenLastCalledWith('retrying', 'alice');
  expect(bindingStore.read('alice')).toEqual(next);
  sync.pause();
  const reloaded = createNativeNotificationSync(deps);
  reloaded.setOwner('alice');
  await reloaded.tick();
  expect(remote.bind).toHaveBeenLastCalledWith('new-token', next);
  expect(onState).toHaveBeenLastCalledWith('connected', 'alice');
});
it('retains an old receipt after a failed rotation without suppressing foreground delivery for another token', async () => {
  const { sync, bridge, remote, fetch, bindingStore } = fixture();
  await sync.tick();
  bridge.mockResolvedValue({ ok: true, enabled: true, huaweiToken: 'new-token' });
  remote.bind.mockRejectedValueOnce(new Error('offline'));
  await sync.tick();
  expect(bindingStore.read('alice')).toEqual(old);
  expect(fetch.mock.lastCall?.[0]).not.toHaveProperty('huaweiBinding');
  sync.retry();
  remote.bind.mockResolvedValue(next);
  await sync.tick();
  expect(remote.bind).toHaveBeenLastCalledWith('new-token', old);
});
it('keeps offline logout receipts scoped to their account and reconciles them on the next login', async () => {
  const { sync, remote, bindingStore } = fixture();
  await sync.tick();
  remote.unbind.mockRejectedValueOnce(new Error('offline'));
  sync.setOwner('');
  await Promise.resolve();
  expect(bindingStore.read('alice')).toEqual(old);
  sync.setOwner('bob');
  remote.bind.mockResolvedValue({ ...next, userId: 'bob' });
  await sync.tick();
  expect(remote.bind).toHaveBeenLastCalledWith('old-token', undefined);
  sync.setOwner('alice');
  remote.bind.mockResolvedValue(next);
  await sync.tick();
  expect(remote.bind).toHaveBeenLastCalledWith('old-token', old);
});
it.each(['deviceLimit', 'accountRequired', 'serviceDisabled'])(
  'reports %s and slows permanent failures while allowing explicit retry',
  async (connectionState) => {
    const { sync, remote, onState } = fixture();
    remote.bind.mockRejectedValue(Object.assign(new Error('rejected'), { connectionState }));
    await sync.tick();
    expect(onState).toHaveBeenLastCalledWith(connectionState, 'alice');
    await sync.tick();
    expect(remote.bind).toHaveBeenCalledOnce();
    sync.retry();
    await sync.tick();
    expect(remote.bind).toHaveBeenCalledTimes(2);
  },
);
it('discards a stale receipt and reconnects without trying to retire an unrelated generation', async () => {
  const { sync, remote, bindingStore } = fixture();
  bindingStore.save(old);
  remote.bind.mockRejectedValueOnce(Object.assign(new Error('expired'), { staleBinding: true }));
  await sync.tick();
  expect(bindingStore.read('alice')).toBeUndefined();
  sync.retry();
  await sync.tick();
  expect(remote.bind).toHaveBeenLastCalledWith('old-token', undefined);
});
it('does not bind or activate remotely when the installation cannot persist a receipt', async () => {
  const { sync, remote, onState } = fixture();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new Error('storage full');
  });
  await sync.tick();
  expect(onState).toHaveBeenLastCalledWith('storageUnavailable', 'alice');
  expect(remote.bind).not.toHaveBeenCalled();
  expect(remote.activate).not.toHaveBeenCalled();
});
it('shows a token change as connecting until the replacement is actually activated', async () => {
  const { sync, bridge, remote, onState } = fixture();
  await sync.tick();
  bridge.mockResolvedValue({ ok: true, enabled: true, huaweiToken: 'new-token' });
  let finish!: (value: HuaweiBinding) => void;
  remote.bind.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const task = sync.tick();
  await vi.waitFor(() => expect(remote.bind).toHaveBeenCalledTimes(2));
  expect(onState).toHaveBeenLastCalledWith('connecting', 'alice');
  finish(next);
  await task;
  expect(onState).toHaveBeenLastCalledWith('connected', 'alice');
});
