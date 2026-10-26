import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, reactive } from 'vue';
const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock('@/api/cloudSpacePreferenceApi', () => ({
  getCloudSpacePreference: mocks.get,
  saveCloudSpacePreference: mocks.save,
}));
const user = reactive({
  id: 'A',
  role: 'user',
  visitorWorkspace: false,
  adminContext: null as any,
  preferences: { cloudIncludeDescendants: false, theme: 'day' },
});
vi.mock('@/store', () => ({ useUserStore: () => user }));
vi.mock('@/utils/savePreference', () => ({
  applyPreferenceLocally: (patch: object) => Object.assign(user.preferences, patch),
}));
import { useCloudFileScope } from './useCloudFileScope';
const scopes: ReturnType<typeof effectScope>[] = [];
function state() {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(useCloudFileScope)!;
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  user.id = 'A';
  user.role = 'user';
  user.adminContext = null;
  user.preferences.cloudIncludeDescendants = false;
});
afterEach(() => scopes.splice(0).forEach((scope) => scope.stop()));
describe('cloud file display scope', () => {
  it('restores the server value on entry and only applies a confirmed save', async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { includeDescendants: true } });
    const s = state();
    await s.load();
    expect(s.includeDescendants.value).toBe(true);
    let finish!: (value: any) => void;
    mocks.save.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = s.save(false);
    expect(s.includeDescendants.value).toBe(true);
    finish({ status: 200, data: { includeDescendants: false } });
    await pending;
    expect(s.includeDescendants.value).toBe(false);
    expect(mocks.save).toHaveBeenCalledWith(false);
    expect(user.preferences.theme).toBe('day');
  });
  it('failed save retains the old preference and retry saves the same intent', async () => {
    mocks.save
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 200, data: { includeDescendants: true } });
    const s = state();
    await s.save(true);
    expect(s.includeDescendants.value).toBe(false);
    expect(s.error.value).toBe('save');
    await s.retry();
    expect(s.includeDescendants.value).toBe(true);
    expect(s.error.value).toBe('');
  });
  it('ignores responses after account A → B → A and unmount', async () => {
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
    finish({ status: 200, data: { includeDescendants: true } });
    await pending;
    expect(s.includeDescendants.value).toBe(false);
    const save = s.save(true);
    scopes[0].stop();
    await save;
    expect(s.includeDescendants.value).toBe(false);
  });
  it('guest preferences stay in this browser and do not leak to another visitor', async () => {
    user.role = 'visitor';
    const s = state();
    await s.load();
    await s.save(true);
    expect(s.includeDescendants.value).toBe(true);
    user.id = 'B';
    expect(s.includeDescendants.value).toBe(false);
    user.id = 'A';
    expect(s.includeDescendants.value).toBe(true);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('does not write account preferences in administrator context', async () => {
    user.adminContext = { id: 'preview', mode: 'readonly' };
    const s = state();
    await s.load();
    await s.save(true);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('load failure blocks writes until a successful retry', async () => {
    mocks.get
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ status: 200, data: { includeDescendants: true } });
    const s = state();
    await s.load();
    await s.save(true);
    expect(mocks.save).not.toHaveBeenCalled();
    await s.retry();
    expect(s.includeDescendants.value).toBe(true);
  });
});
