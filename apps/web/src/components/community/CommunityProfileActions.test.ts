import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zh from '@/i18n/locales/zh-CN';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  operation: vi.fn(),
  user: { id: 'viewer', role: 'user', adminContext: null },
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { props: ['src'], template: '<span aria-hidden="true" />' },
}));
vi.mock('@/store', () => ({ useUserStore: () => mocks.user }));
vi.mock('@/api/communityFeedApi', () => ({ feedGet: mocks.get, feedOperation: mocks.operation }));
const { default: Actions } = await import('./CommunityProfileActions.vue');
let cleanup: () => void;
afterEach(() => {
  cleanup?.();
  vi.clearAllMocks();
});
function mount(preparedProfile?: { isOwn: boolean; following: boolean } | null) {
  const props = reactive({ userPublicId: 'first', preparedProfile });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(Actions, props) });
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, props };
}
describe('CommunityProfileActions', () => {
  it('已准备的状态直接显示，关注成功同步缓存供下次打开使用', async () => {
    const prepared = reactive({ isOwn: false, following: false });
    mocks.operation.mockReturnValue(vi.fn().mockResolvedValue({}));
    const { host } = mount(prepared);
    expect(host.textContent).toContain('公开主页');
    expect(host.querySelector('.b-loading-inline')).toBeNull();
    expect(mocks.get).not.toHaveBeenCalled();
    Array.from(host.querySelectorAll('button')).find(button => button.textContent?.trim() === '关注')!.click();
    await vi.waitFor(() => expect(prepared.following).toBe(true));
    expect(host.textContent).toContain('取消关注');
  });

  it('加载期间保留操作区，失败后可以重试', async () => {
    mocks.get.mockResolvedValueOnce({ feedEnabled: true }).mockRejectedValueOnce(new Error('offline'));
    const { host } = mount();
    const row = host.querySelector('.community-profile-actions');
    expect(row?.getAttribute('aria-busy')).toBe('true');
    await vi.waitFor(() => expect(host.textContent).toContain('重试'));
    expect(host.querySelector('.community-profile-actions')).toBe(row);
    mocks.get.mockResolvedValueOnce({ feedEnabled: true }).mockResolvedValueOnce({ isOwn: false, following: false });
    host.querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() => expect(host.textContent).toContain('公开主页'));
    expect(host.querySelector('.community-profile-actions')).toBe(row);
  });
  it('切换目标后忽略旧资料请求', async () => {
    let resolveOld: (value: unknown) => void = () => {};
    mocks.get.mockImplementation((path: string) =>
      path === 'feed/capabilities'
        ? Promise.resolve({ feedEnabled: true })
        : path === 'profiles/first'
          ? new Promise((resolve) => {
              resolveOld = resolve;
            })
          : Promise.resolve({ isOwn: false, following: false }),
    );
    const { host, props } = mount();
    await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledWith('profiles/first', { summary: 'true' }));
    props.userPublicId = 'second';
    await nextTick();
    await vi.waitFor(() => expect(host.textContent).toContain('关注'));
    resolveOld({ isOwn: true });
    await nextTick();
    await nextTick();
    expect(host.textContent).toContain('关注');
    expect(host.textContent).not.toContain('我的发布');
  });
});
