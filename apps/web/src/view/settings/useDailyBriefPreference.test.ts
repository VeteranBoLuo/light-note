import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { getDailyBriefPreference, updateDailyBriefPreference } from '@/api/dailyBriefApi.ts';
import message from '@/components/base/BasicComponents/BMessage/BMessage';
import { useDailyBriefPreference } from './useDailyBriefPreference';

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/api/dailyBriefApi.ts', () => ({
  getDailyBriefPreference: vi.fn(),
  updateDailyBriefPreference: vi.fn(),
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { warning: vi.fn() },
}));

const getPreferenceMock = vi.mocked(getDailyBriefPreference);
const updatePreferenceMock = vi.mocked(updateDailyBriefPreference);
const warningMock = vi.mocked(message.warning);

describe('今日简报设置状态', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('读取期间禁用重复请求，并接受后端返回的默认开启值', async () => {
    let resolveRequest: ((value: any) => void) | undefined;
    getPreferenceMock.mockReturnValueOnce(new Promise((resolve) => (resolveRequest = resolve)) as any);
    const preference = useDailyBriefPreference();

    const firstLoad = preference.load();
    expect(preference.loading.value).toBe(true);
    await preference.load();
    expect(getPreferenceMock).toHaveBeenCalledTimes(1);

    resolveRequest?.({ status: 200, data: { featureEnabled: true, enabled: true } });
    await firstLoad;
    expect(preference.loading.value).toBe(false);
    expect(preference.enabled.value).toBe(true);
    expect(preference.loaded.value).toBe(true);
  });

  it('保存失败时回滚到原状态并使用 BMessage 提示', async () => {
    updatePreferenceMock.mockRejectedValueOnce(new Error('network'));
    const preference = useDailyBriefPreference();

    await preference.setEnabled(false);

    expect(preference.enabled.value).toBe(true);
    expect(preference.error.value).toBe('save');
    expect(warningMock).toHaveBeenCalledWith('settings.ai.dailyBriefSaveFailed');
  });

  it('保存响应缺少偏好字段时保留本次明确选择', async () => {
    updatePreferenceMock.mockResolvedValueOnce({ status: 200, data: {} } as any);
    const preference = useDailyBriefPreference();

    await preference.setEnabled(false);

    expect(preference.enabled.value).toBe(false);
    expect(preference.loaded.value).toBe(true);
  });

  it('功能未开放时不发送保存请求', async () => {
    const preference = useDailyBriefPreference();
    preference.featureEnabled.value = false;

    await preference.setEnabled(false);

    expect(updatePreferenceMock).not.toHaveBeenCalled();
    expect(preference.enabled.value).toBe(true);
  });

  it('自动更新可单独关闭，关闭总开关不重置自动更新选择', async () => {
    updatePreferenceMock.mockResolvedValue({ status: 200, data: {} } as any);
    const preference = useDailyBriefPreference();
    await preference.setAutoUpdate(false);
    expect(updatePreferenceMock).toHaveBeenLastCalledWith(true, false);
    expect(preference.enabled.value).toBe(true);
    expect(preference.autoUpdate.value).toBe(false);
    await preference.setEnabled(false);
    expect(updatePreferenceMock).toHaveBeenLastCalledWith(false, undefined);
    expect(preference.autoUpdate.value).toBe(false);
  });

  it('自动更新保存失败回滚；读取账号偏好不丢失关闭状态', async () => {
    getPreferenceMock.mockResolvedValueOnce({ status: 200, data: { enabled: true, autoUpdate: false } } as any);
    const preference = useDailyBriefPreference();
    await preference.load();
    expect(preference.autoUpdate.value).toBe(false);
    updatePreferenceMock.mockRejectedValueOnce(new Error('network'));
    await preference.setAutoUpdate(true);
    expect(preference.autoUpdate.value).toBe(false);
    expect(preference.enabled.value).toBe(true);
    expect(warningMock).toHaveBeenCalledWith('settings.ai.dailyBriefSaveFailed');
  });

  it('身份切换会重置旧状态并忽略旧身份的迟到响应', async () => {
    const ownerKey = ref('user-1');
    let resolveOldRequest: ((value: any) => void) | undefined;
    getPreferenceMock
      .mockReturnValueOnce(new Promise((resolve) => (resolveOldRequest = resolve)) as any)
      .mockResolvedValueOnce({ status: 200, data: { featureEnabled: true, enabled: false } } as any);
    const preference = useDailyBriefPreference({ ownerKey });

    const oldLoad = preference.load();
    ownerKey.value = 'user-2';
    await nextTick();
    expect(preference.loaded.value).toBe(false);
    expect(preference.enabled.value).toBe(true);

    await preference.load();
    expect(preference.enabled.value).toBe(false);
    expect(preference.loaded.value).toBe(true);

    resolveOldRequest?.({ status: 200, data: { featureEnabled: true, enabled: true } });
    await oldLoad;
    expect(preference.enabled.value).toBe(false);
    expect(preference.loaded.value).toBe(true);
  });

  it('身份切换后旧身份的保存失败不会回滚或提示到新身份', async () => {
    const ownerKey = ref('user-1');
    let rejectOldSave: ((reason?: unknown) => void) | undefined;
    updatePreferenceMock.mockReturnValueOnce(new Promise((_, reject) => (rejectOldSave = reject)) as any);
    const preference = useDailyBriefPreference({ ownerKey });

    const oldSave = preference.setEnabled(false);
    expect(preference.enabled.value).toBe(false);
    ownerKey.value = 'user-2';
    await nextTick();
    expect(preference.enabled.value).toBe(true);
    expect(preference.saving.value).toBe(false);

    rejectOldSave?.(new Error('old account request failed'));
    await oldSave;
    expect(preference.enabled.value).toBe(true);
    expect(preference.error.value).toBe('');
    expect(warningMock).not.toHaveBeenCalled();
  });

  it('只读身份不发送偏好写入，也不制造本地假成功状态', async () => {
    const writable = ref(false);
    const preference = useDailyBriefPreference({ ownerKey: 'admin-preview', writable });

    await preference.setEnabled(false);

    expect(updatePreferenceMock).not.toHaveBeenCalled();
    expect(preference.enabled.value).toBe(true);
    expect(preference.loaded.value).toBe(false);
  });
});
