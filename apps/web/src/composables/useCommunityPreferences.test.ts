import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, reactive } from 'vue';
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock('@/api/communityApi', () => ({ getCommunityPreferences: mocks.get, saveCommunityPreferences: mocks.save }));
const user = reactive({ id: 'A', role: 'user', adminContext: null as any });
vi.mock('@/store', () => ({ useUserStore: () => user }));
import { useCommunityPreferences } from './useCommunityPreferences';
const scopes: ReturnType<typeof effectScope>[] = [];
function state() {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(useCommunityPreferences)!;
}
const data = (revision = 0) => ({
  defaultView: 'chat',
  revision,
  availableViews: ['chat'],
  feedEnabled: false,
  protocolVersion: 1,
});
beforeEach(() => {
  user.id = 'A';
  user.role = 'user';
  user.adminContext = null;
  sessionStorage.clear();
  vi.resetAllMocks();
});
afterEach(() => {
  scopes.splice(0).forEach((s) => s.stop());
});
describe('community preferences', () => {
  it('rejects a stale account response including A → B → A', async () => {
    let finish!: (value: any) => void;
    mocks.get.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const s = state();
    const pending = s.load();
    user.id = 'B';
    user.id = 'A';
    finish({ status: 200, data: data(9) });
    await pending;
    expect(s.value.value).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
  it('failure retains only a same-account confirmed preference; an unavailable feed never opens', async () => {
    sessionStorage.setItem('light-note:community-navigation:A', JSON.stringify({ ...data(2), defaultView: 'feed' }));
    mocks.get.mockRejectedValue(new Error('offline'));
    const s = state();
    await s.load();
    expect(s.value.value?.revision).toBe(2);
    expect(s.entryPath.value).toBe('/community/chat');
    expect(s.error.value).toBe('load');
    user.id = 'B';
    expect(s.value.value).toBeNull();
  });
  it('save conflict retains the last known value and reload updates the version', async () => {
    mocks.get.mockResolvedValue({ status: 200, data: data(2) });
    mocks.save.mockResolvedValue({ status: 409 });
    const s = state();
    await s.load();
    await s.save('chat');
    expect(mocks.save).toHaveBeenCalledWith('chat', 2);
    expect(s.value.value?.revision).toBe(2);
    expect(s.error.value).toBe('save');
    mocks.get.mockResolvedValue({ status: 200, data: data(3) });
    await s.load();
    expect(s.value.value?.revision).toBe(3);
  });
  it('guests and admin contexts never read or save personal preferences', async () => {
    user.adminContext = { id: 'preview' };
    const s = state();
    await s.load();
    await s.save('chat');
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('unmount invalidates an in-flight response', async () => {
    let finish!: (value: any) => void;
    mocks.get.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const s = state();
    const pending = s.load();
    scopes[0].stop();
    finish({ status: 200, data: data() });
    await pending;
    expect(s.value.value).toBeNull();
  });
  it('always enters chat regardless of legacy feed preference', async () => {
    mocks.get.mockResolvedValue({
      status: 200,
      data: { ...data(), defaultView: 'feed', feedEnabled: true, availableViews: ['chat', 'feed'] },
    });
    const s = state();
    await s.load();
    expect(s.entryPath.value).toBe('/community/chat');
    mocks.get.mockResolvedValue({
      status: 200,
      data: { ...data(1), defaultView: 'feed', feedEnabled: false, availableViews: ['chat'] },
    });
    await s.load();
    expect(s.entryPath.value).toBe('/community/chat');
    expect(s.value.value.defaultView).toBe('feed');
  });
});
