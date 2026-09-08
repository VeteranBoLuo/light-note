import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
const mocks = vi.hoisted(() => ({ user: null as any, write: vi.fn(), locale: vi.fn() }));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/api/userApi.ts', () => ({ default: { updateUserInfo: mocks.write } }));
vi.mock('@/i18n', () => ({ setLocale: mocks.locale }));
function deferred() {
  let resolve!: (value: any) => void, reject!: (error: unknown) => void;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  localStorage.clear();
  mocks.user = reactive({ id: 'one', role: 'user', preferences: { theme: 'day', lang: 'zh-CN' }, adminContext: null });
  mocks.locale.mockResolvedValue(undefined);
  mocks.write.mockResolvedValue({ status: 200 });
});
describe('shared preference queue', () => {
  it('serializes different entrances and sends only the active patch', async () => {
    const first = deferred();
    mocks.write.mockReturnValueOnce(first.promise);
    const { updatePreference, usePreferenceSaveState } = await import('./savePreference');
    const a = updatePreference({ theme: 'night' });
    const b = updatePreference({ cloudView: 'table' });
    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mocks.write.mock.calls[0][0].preferences)).not.toHaveProperty('cloudView');
    expect(usePreferenceSaveState().states.cloudView.phase).toBe('queued');
    first.resolve({ status: 200 });
    await Promise.all([a, b]);
    expect(JSON.parse(mocks.write.mock.calls[1][0].preferences)).toMatchObject({ theme: 'night', cloudView: 'table' });
  });
  it('removes a failed new field without discarding a later edit', async () => {
    const first = deferred();
    mocks.write.mockReturnValueOnce(first.promise);
    const { updatePreference } = await import('./savePreference');
    const a = updatePreference({ resourceSort: 'name' }).catch((e) => e);
    const b = updatePreference({ theme: 'night' });
    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    first.reject(new Error('offline'));
    await a;
    await b;
    expect(mocks.user.preferences).toEqual({ theme: 'night', lang: 'zh-CN' });
    expect(JSON.parse(mocks.write.mock.calls[1][0].preferences)).not.toHaveProperty('resourceSort');
  });
  it('invalidates old jobs even when identity changes A → B → A', async () => {
    const first = deferred();
    mocks.write.mockReturnValueOnce(first.promise);
    const { updatePreference, isPreferenceSaveCancelled, usePreferenceSaveState } = await import('./savePreference');
    const a = updatePreference({ theme: 'night' }).catch((e) => e);
    const b = updatePreference({ resourceSort: 'name' }).catch((e) => e);
    await vi.waitFor(() => expect(mocks.write).toHaveBeenCalledTimes(1));
    mocks.user.id = 'two';
    mocks.user.id = 'one';
    mocks.user.preferences = { theme: 'system', lang: 'zh-CN' };
    first.reject(new Error('late'));
    expect(isPreferenceSaveCancelled(await a)).toBe(true);
    expect(isPreferenceSaveCancelled(await b)).toBe(true);
    expect(mocks.user.preferences.theme).toBe('system');
    expect(Object.keys(usePreferenceSaveState().states)).toHaveLength(0);
    expect(mocks.write).toHaveBeenCalledTimes(1);
  });
  it('supersedes stale retries and retries intact multi-field patches', async () => {
    const { updatePreference, usePreferenceSaveState } = await import('./savePreference');
    mocks.write.mockRejectedValueOnce(new Error('offline'));
    await updatePreference({ notificationsDnd: true, notificationsDndStart: '23:00' }).catch(() => {});
    await usePreferenceSaveState().retry('notificationsDnd');
    expect(mocks.user.preferences.notificationsDndStart).toBe('23:00');
    mocks.write.mockRejectedValueOnce(new Error('offline'));
    await updatePreference({ theme: 'night' }).catch(() => {});
    await updatePreference({ theme: 'system' });
    const count = mocks.write.mock.calls.length;
    await usePreferenceSaveState().retry('theme');
    expect(mocks.write).toHaveBeenCalledTimes(count);
  });
  it('reports session-only persistence for guests when storage is unavailable', async () => {
    mocks.user.id = '';
    mocks.user.role = 'visitor';
    const { updatePreference, usePreferenceSaveState } = await import('./savePreference');
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    await updatePreference({ theme: 'night', homePage: 'bookmark' });
    expect(mocks.user.preferences.homePage).toBeUndefined();
    expect(usePreferenceSaveState().states.theme.persistence).toBe('session');
    expect(mocks.write).not.toHaveBeenCalled();
    storage.mockRestore();
  });
  it('rolls back language when the server rejects and passes an identity guard to the loader', async () => {
    const { updatePreference } = await import('./savePreference');
    mocks.write.mockResolvedValueOnce({ status: 403 });
    await expect(updatePreference({ lang: 'en-US' })).rejects.toThrow();
    expect(mocks.locale.mock.calls.map((c) => c[0])).toEqual(['en-US', 'zh-CN']);
    const guard = mocks.locale.mock.calls[0][1].shouldApply;
    mocks.user.id = 'two';
    expect(guard()).toBe(false);
    expect(mocks.user.preferences.lang).toBe('zh-CN');
  });
});
