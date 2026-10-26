import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick, reactive } from 'vue';
const mocks = vi.hoisted(() => ({ get: vi.fn(), log: vi.fn(), user: {} as any }));
vi.mock('@/api/commonApi', () => ({ recordOperation: mocks.log }));
vi.mock('./useUser', () => ({ default: () => mocks.user }));
vi.mock('@/api/publicResources', () => ({ publicGet: mocks.get }));
import { usePublicResourceScope } from './publicResourceScope';
beforeEach(() => {
  setActivePinia(createPinia());
  mocks.user = reactive({ id: 'one', role: 'user', adminContext: null, adminPreview: false });
  mocks.get.mockReset();
  mocks.log.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
});
describe('全站搜索会话范围', () => {
  it('只记录手动且实际变化的范围，不为恢复、切号、URL 或代管记日志', () => {
    const scope = usePublicResourceScope();
    scope.setIncluded(true, { remember: true });
    scope.setIncluded(true, { remember: true });
    scope.restoreIncluded();
    scope.setIncluded(false);
    mocks.user.id = 'two';
    mocks.user.adminContext = { id: 'context' };
    scope.setIncluded(true, { remember: true });
    expect(mocks.log.mock.calls).toEqual([[{ module: '公开管理', operation: '开启包含全站公开资源' }]]);
    mocks.user.adminContext = null;
    scope.setIncluded(true, { remember: true });
    scope.setIncluded(false, { remember: true });
    expect(mocks.log).toHaveBeenLastCalledWith({ module: '公开管理', operation: '关闭包含全站公开资源' });
  });
  const key = (id: string) => `light-note:public-search:included:v1:${encodeURIComponent(id)}`;
  it('仅手动切换写入，重新创建会话分别恢复开启和关闭', () => {
    let scope = usePublicResourceScope();
    scope.setIncluded(true, { remember: true });
    expect(localStorage.getItem(key('one'))).toBe('1');
    setActivePinia(createPinia());
    scope = usePublicResourceScope();
    expect(scope.included).toBe(true);
    scope.setIncluded(false, { remember: true });
    setActivePinia(createPinia());
    expect(usePublicResourceScope().included).toBe(false);
    expect(localStorage.getItem(key('one'))).toBe('0');
  });
  it('账号、退出登录及代管隔离；回到本人恢复其选择', () => {
    const scope = usePublicResourceScope();
    scope.setIncluded(true, { remember: true });
    mocks.user.id = 'two';
    expect(scope.included).toBe(false);
    scope.setIncluded(false, { remember: true });
    mocks.user.id = 'one';
    expect(scope.included).toBe(true);
    mocks.user.adminContext = { id: 'context' };
    scope.setIncluded(false, { remember: true });
    expect(scope.included).toBe(false);
    expect(localStorage.getItem(key('one'))).toBe('1');
    mocks.user.adminContext = null;
    expect(scope.included).toBe(true);
    mocks.user.adminPreview = true;
    expect(scope.included).toBe(false);
    mocks.user.adminPreview = false;
    expect(scope.included).toBe(true);
    mocks.user.id = '';
    scope.setIncluded(false, { remember: true });
    expect(scope.included).toBe(false);
    mocks.user.id = 'one';
    expect(scope.included).toBe(true);
  });
  it('URL 恢复只改变当前范围，不覆盖手动偏好', () => {
    const scope = usePublicResourceScope();
    scope.setIncluded(true, { remember: true });
    scope.setIncluded(false);
    expect(scope.included).toBe(false);
    expect(localStorage.getItem(key('one'))).toBe('1');
    scope.restoreIncluded();
    expect(scope.included).toBe(true);
    scope.setIncluded(false, { remember: true });
    scope.setIncluded(true);
    expect(localStorage.getItem(key('one'))).toBe('0');
  });
  it('功能不可用和读取失败只禁用运行状态，不写回关闭偏好', async () => {
    const scope = usePublicResourceScope();
    scope.setIncluded(true, { remember: true });
    mocks.get.mockResolvedValueOnce({ enabled: false });
    await scope.ensure();
    expect(scope.included).toBe(false);
    expect(localStorage.getItem(key('one'))).toBe('1');
    mocks.get.mockRejectedValueOnce(new Error('offline'));
    await scope.ensure(true);
    expect(scope.included).toBe(false);
    mocks.get.mockResolvedValueOnce({ enabled: true });
    await scope.ensure(true);
    expect(scope.included).toBe(true);
  });
  it('无效存储及存储被禁用时安全回退，当前会话仍可切换', () => {
    localStorage.setItem(key('one'), 'invalid');
    const scope = usePublicResourceScope();
    expect(scope.included).toBe(false);
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    try {
      scope.restoreIncluded();
      expect(() => scope.setIncluded(true, { remember: true })).not.toThrow();
      expect(scope.included).toBe(true);
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });
  it('首次关闭，同一会话共享，切号及代管同步清空', async () => {
    const scope = usePublicResourceScope();
    expect(scope.included).toBe(false);
    scope.setIncluded(true);
    expect(usePublicResourceScope().included).toBe(true);
    mocks.user.id = 'two';
    expect(scope.included).toBe(false);
    scope.setIncluded(true);
    mocks.user.adminContext = { id: 'ctx' };
    expect(scope.included).toBe(false);
    expect(scope.eligible).toBe(false);
    scope.setIncluded(true);
    expect(scope.included).toBe(false);
  });
  it('旧账号的能力响应不能恢复新账号范围', async () => {
    let finish!: (value: any) => void;
    mocks.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const scope = usePublicResourceScope(),
      pending = scope.ensure();
    mocks.user.id = 'two';
    finish({ enabled: true, submissionsEnabled: true, aiEnabled: true, moderationEnabled: false });
    await pending;
    expect(scope.caps.enabled).toBe(false);
    expect(scope.loaded).toBe(false);
  });
  it('关闭功能及游客不会继续发公开请求', async () => {
    mocks.get.mockResolvedValue({
      enabled: false,
      submissionsEnabled: false,
      aiEnabled: false,
      moderationEnabled: false,
    });
    const scope = usePublicResourceScope();
    scope.setIncluded(true);
    await scope.ensure();
    expect(scope.included).toBe(false);
    mocks.user.role = 'visitor';
    await nextTick();
    await scope.ensure();
    expect(mocks.get).toHaveBeenCalledTimes(1);
  });
});
