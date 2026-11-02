import { beforeEach, expect, it, vi } from 'vitest';
import {
  createNativeNotificationSync,
  type HuaweiBinding,
  type HuaweiInstallation,
  type NativeNotificationReply,
} from './nativeNotificationSync';
import { createNativePushBindingStore } from './nativePushBindingStore';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
function fixture() {
  let token = 'provider-token-a';
  let identity: HuaweiInstallation = {
    id: 'install-a',
    key: 'a'.repeat(64),
    revision: 1,
    packageName: 'app.test',
    pushAppId: '123',
    deviceLabel: 'phone',
    identityKind: 'scoped',
  };
  const receipts = new Map<string, HuaweiBinding>();
  const bridge = vi.fn(async (input: Record<string, unknown>): Promise<NativeNotificationReply> => {
    if (input.action === 'bind')
      return { ok: true, enabled: true, huaweiToken: token, pushProtocolVersion: 2, installation: { ...identity } };
    if (input.action === 'receiptRead') return { ok: true, binding: receipts.get(String(input.owner)) };
    if (input.action === 'receiptSave') {
      if (input.revision !== identity.revision) return { ok: false, superseded: true };
      receipts.set(String(input.owner), input.binding as HuaweiBinding);
    }
    if (input.action === 'receiptRemove') {
      const current = receipts.get(String(input.owner)),
        binding = input.binding as HuaweiBinding;
      if (current?.id === binding.id && current?.generation === binding.generation)
        receipts.delete(String(input.owner));
    }
    return { ok: true };
  });
  const binding = { id: 'device', generation: 'generation', userId: 'alice' };
  const remote = {
    bind: vi.fn(async (_token: string, _previous?: HuaweiBinding, _installation?: HuaweiInstallation) => binding),
    activate: vi.fn(async (_binding: HuaweiBinding) => {}),
    unbind: vi.fn(async (_binding: HuaweiBinding) => {}),
  };
  const onState = vi.fn();
  const deps = {
    bridge,
    remote,
    onState,
    bindingStore: createNativePushBindingStore(localStorage),
    fetch: vi.fn(async () => ({ owner: 'alice', since: '', items: [], cursor: null })),
    open: vi.fn(),
    refreshUnread: vi.fn(async () => {}),
  };
  const sync = createNativeNotificationSync(deps);
  sync.setOwner('alice');
  return {
    sync,
    deps,
    bridge,
    remote,
    receipts,
    binding,
    onState,
    rotate: () => {
      token = 'provider-token-b';
      identity = { ...identity, revision: identity.revision + 1 };
    },
  };
}
it('uses native receipts before activation and restores them after web runtime recreation', async () => {
  const f = fixture();
  f.remote.activate.mockImplementation(async () => {
    expect(f.receipts.get('alice')).toEqual(f.binding);
  });
  await f.sync.tick();
  expect(f.remote.bind.mock.calls[0][2]).toMatchObject({ id: 'install-a', revision: 1 });
  f.sync.pause();
  const reloaded = createNativeNotificationSync(f.deps);
  reloaded.setOwner('alice');
  await reloaded.tick();
  expect(f.remote.bind.mock.lastCall?.[1]).toEqual(f.binding);
  expect(f.onState).toHaveBeenLastCalledWith('connected', 'alice');
});
it('does not require web localStorage when native persistence is available', async () => {
  const f = fixture();
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('web storage unavailable');
  });
  await f.sync.tick();
  expect(f.remote.activate).toHaveBeenCalledOnce();
  expect(f.receipts.get('alice')).toEqual(f.binding);
});
it('keeps pending native receipts after a lost activation response and retries safely', async () => {
  const f = fixture();
  f.remote.activate.mockRejectedValueOnce(new Error('lost response'));
  await f.sync.tick();
  expect(f.receipts.get('alice')).toEqual(f.binding);
  f.sync.retry();
  await f.sync.tick();
  expect(f.remote.bind.mock.lastCall?.[1]).toEqual(f.binding);
  expect(f.onState).toHaveBeenLastCalledWith('connected', 'alice');
});
it('does not mistake an optional legacy cleanup failure for failed native receipt storage', async () => {
  const f = fixture();
  await f.sync.tick();
  f.remote.bind.mockRejectedValueOnce(Object.assign(new Error('expired'), { staleBinding: true }));
  vi.spyOn(f.deps.bindingStore, 'remove').mockImplementation(() => {
    throw new Error('web storage unavailable');
  });
  f.sync.retry();
  await f.sync.tick();
  expect(f.receipts.size).toBe(0);
  expect(f.onState).toHaveBeenLastCalledWith('retrying', 'alice');
  f.sync.retry();
  await f.sync.tick();
  expect(f.onState).toHaveBeenLastCalledWith('connected', 'alice');
});
it('does not activate a response superseded by a token change during the API request', async () => {
  const f = fixture();
  f.remote.bind.mockImplementationOnce(async () => {
    f.rotate();
    return f.binding;
  });
  await f.sync.tick();
  expect(f.remote.activate).not.toHaveBeenCalled();
  expect(f.receipts.size).toBe(0);
  await f.sync.tick();
  expect(f.remote.bind.mock.lastCall?.[2]?.revision).toBe(2);
  expect(f.remote.activate).toHaveBeenCalledOnce();
});
it('ignores an old account receipt read before any remote mutation', async () => {
  const f = fixture();
  let finish!: (reply: NativeNotificationReply) => void;
  f.bridge.mockImplementationOnce(async () => ({
    ok: true,
    enabled: true,
    huaweiToken: 'token',
    pushProtocolVersion: 2,
    installation: { id: 'i' } as HuaweiInstallation,
  }));
  f.bridge.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = f.sync.tick();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  f.sync.setOwner('bob');
  finish({ ok: true, binding: f.binding });
  await pending;
  expect(f.remote.bind).not.toHaveBeenCalled();
});
it('automatically confirms a new installation only after rechecking the live native epoch and token', async () => {
  const f = fixture();
  f.remote.bind.mockRejectedValueOnce(Object.assign(new Error('challenge'), { challengeCurrentId: null }));
  await f.sync.tick();
  expect(f.remote.bind).toHaveBeenCalledTimes(2);
  expect(f.remote.bind.mock.lastCall?.[2]).toMatchObject({ expectedCurrentId: null, id: 'install-a', revision: 1 });
  expect(f.bridge.mock.calls.filter(([input]) => input.action === 'bind')).toHaveLength(2);
  expect(f.remote.activate).toHaveBeenCalledOnce();
});
it('does not complete an installation challenge after a token or account changes', async () => {
  for (const change of ['token', 'account']) {
    const f = fixture();
    f.remote.bind.mockImplementationOnce(async () => {
      if (change === 'token') f.rotate();
      else f.sync.setOwner('bob');
      throw Object.assign(new Error('challenge'), { challengeCurrentId: null });
    });
    await f.sync.tick();
    expect(f.remote.bind).toHaveBeenCalledOnce();
    expect(f.remote.activate).not.toHaveBeenCalled();
  }
});
