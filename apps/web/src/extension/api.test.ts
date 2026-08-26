import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extensionGet, extensionPost } from './api';

const localGet = vi.fn();
const localSet = vi.fn();
const localRemove = vi.fn();

function response(envelope: unknown, httpStatus = 200) {
  return {
    ok: httpStatus >= 200 && httpStatus < 300,
    status: httpStatus,
    json: vi.fn(async () => envelope),
  };
}

describe('浏览器插件 API 会话边界', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localGet.mockImplementation(async (key: string) => ({
      [key]: key === 'lightNoteExtensionSession'
        ? { sid: 'sid-1', deviceId: 'device-1', user: { id: 'user-1' } }
        : 'device-1',
    }));
    vi.stubGlobal('chrome', {
      storage: { local: { get: localGet, set: localSet, remove: localRemove } },
    });
  });

  it('邮箱登录的 401 是表单错误，不误报为现有会话过期', async () => {
    const expired = vi.fn();
    window.addEventListener('light-note-extension-auth-expired', expired, { once: true });
    vi.stubGlobal('fetch', vi.fn(async () => response({ data: null, status: 401, msg: '邮箱或密码错误' })));

    await expect(extensionPost('/api/user/login', { email: 'a@example.com' }, false)).rejects.toMatchObject({
      status: 401,
      message: '邮箱或密码错误',
    });
    expect(localRemove).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  });

  it('受保护请求变成游客时清理 SID 并通知界面恢复登录', async () => {
    const expired = vi.fn();
    window.addEventListener('light-note-extension-auth-expired', expired, { once: true });
    vi.stubGlobal('fetch', vi.fn(async () => response({ data: null, status: 'visitor', msg: '请登录' })));

    await expect(extensionGet('/api/user/me')).rejects.toMatchObject({ code: 'EXTENSION_AUTH_REQUIRED' });
    expect(localRemove).toHaveBeenCalledWith('lightNoteExtensionSession');
    expect(expired).toHaveBeenCalledOnce();
  });
});
