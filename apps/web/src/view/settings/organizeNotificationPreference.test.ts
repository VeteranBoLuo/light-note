import { afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  id: 'owner',
  role: 'user',
  preferences: { notificationsOrganize: true, lang: 'zh-CN' },
}));
const save = vi.hoisted(() => vi.fn());
vi.mock('@/store', () => ({ useUserStore: () => state }));
vi.mock('@/api/userApi.ts', () => ({ default: { updateUserInfo: save } }));
vi.mock('@/i18n', () => ({ setLocale: vi.fn() }));
import { updatePreference } from '@/utils/savePreference';
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  state.preferences.notificationsOrganize = true;
});
describe('整理通知偏好复用通用保存入口', () => {
  it('关闭设置持久化到服务端', async () => {
    save.mockResolvedValueOnce({ status: 200 });
    await updatePreference({ notificationsOrganize: false });
    expect(JSON.parse(save.mock.calls.at(-1)[0].preferences).notificationsOrganize).toBe(false);
    expect(state.preferences.notificationsOrganize).toBe(false);
  });
  it('保存失败恢复开关，不误导用户已经关闭', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    save.mockRejectedValueOnce(new Error('offline'));
    await expect(updatePreference({ notificationsOrganize: false })).rejects.toThrow('offline');
    expect(state.preferences.notificationsOrganize).toBe(true);
    expect(JSON.parse(localStorage.getItem('preferences') || '{}').notificationsOrganize).toBe(true);
  });
});
