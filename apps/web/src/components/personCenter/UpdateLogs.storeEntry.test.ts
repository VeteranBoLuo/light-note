import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, nextTick } from 'vue';
import { createI18n } from 'vue-i18n';

const mocks = vi.hoisted(() => ({
  routerPush: vi.fn(() => Promise.resolve()),
  listUpdateLogs: vi.fn(),
  listManagedUpdateLogs: vi.fn(),
  user: { role: 'visitor' },
  bookmark: { isMobile: false },
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.routerPush }),
}));

vi.mock('@/store', () => ({
  useUserStore: () => mocks.user,
  bookmarkStore: () => mocks.bookmark,
}));

vi.mock('@/api/updateLogApi', () => ({
  createUpdateLogDraft: vi.fn(),
  listManagedUpdateLogs: mocks.listManagedUpdateLogs,
  listUpdateLogs: mocks.listUpdateLogs,
}));

vi.mock('@/utils/common', () => ({
  backRouterPage: vi.fn(),
  noteContentToHtml: vi.fn(() => Promise.resolve('')),
}));

vi.mock('@/components/base/BasicComponents/CommonContainer.vue', () => ({
  default: { template: '<section><slot name="navigation" /><slot /></section>' },
}));

vi.mock('@/components/personCenter/UpdateLogEditor.vue', () => ({
  default: { template: '<div />' },
}));

vi.mock('@/components/mobile/MobileListSurface.vue', () => ({
  default: { template: '<div><slot /></div>' },
}));

vi.mock('@/components/mobile/MobileListRow.vue', () => ({
  default: { template: '<div><slot name="title" /><slot name="subtitle" /><slot name="trailing" /><slot /></div>' },
}));

vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({
  default: { template: '<span />' },
}));

vi.mock('@/components/base/BasicComponents/BMessage/BMessage', () => ({
  default: { error: vi.fn() },
}));

const { default: UpdateLogs } = await import('./UpdateLogs.vue');

let app: ReturnType<typeof createApp> | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
  mocks.user.role = 'visitor';
  mocks.bookmark.isMobile = false;
  mocks.listUpdateLogs.mockResolvedValue({ status: 200, data: { items: [] } });
  mocks.listManagedUpdateLogs.mockResolvedValue({ status: 200, data: { items: [] } });
});

afterEach(() => {
  app?.unmount();
  host?.remove();
  app = undefined;
  host = undefined;
  mocks.routerPush.mockClear();
  mocks.listUpdateLogs.mockReset();
  mocks.listManagedUpdateLogs.mockReset();
});

describe('UpdateLogs resource store entry', () => {
  it('更新日志标题旁打开资源商店', async () => {
    host = document.createElement('div');
    document.body.append(host);
    app = createApp(UpdateLogs);
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': { entitlementStore: { pageTitle: '资源商店' } } },
        missingWarn: false,
        fallbackWarn: false,
      }),
    );
    app.directive('click-log', {});
    app.directive('mermaid', {});
    app.mount(host);

    await vi.waitFor(() => expect(mocks.listUpdateLogs).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(host.querySelector('.changelog-support-card')).toBeNull();
    const mobileAction = host.querySelector<HTMLButtonElement>('button.mobile-changelog-nav__store');
    expect(mobileAction?.getAttribute('aria-label')).toBe('资源商店');
    expect(mobileAction?.textContent?.trim()).toBe('');

    const action = host.querySelector<HTMLButtonElement>('button.logs-intro__store');
    expect(action).not.toBeNull();
    action?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await nextTick();

    expect(mocks.routerPush).toHaveBeenCalledWith('/store');
  });
});

const logEntry = (id: string, title: string, status: 'draft' | 'published', productVersion = '') => ({
  id,
  title,
  status,
  productVersion,
  publishDate: id === 'older' ? '2026-09-18' : id === 'draft' ? '2026-11-20' : '2026-10-30',
  summary: '更新说明',
  tags: [],
  highlights: ['更新内容'],
  contentMarkdown: '',
  imageKeys: [],
});
async function mountVersions(items: ReturnType<typeof logEntry>[], mobile: boolean) {
  mocks.user.role = 'root';
  mocks.bookmark.isMobile = mobile;
  mocks.listManagedUpdateLogs.mockResolvedValue({ status: 200, data: { items } });
  host = document.createElement('div');
  document.body.append(host);
  app = createApp(UpdateLogs);
  app.use(
    createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: {
        'zh-CN': {
          changelog: {
            latest: '最新',
            latestVersion: '最新版本',
            history: '历史更新',
            otherUpdates: '其他更新',
            status: { draft: '草稿' },
          },
        },
      },
      missingWarn: false,
      fallbackWarn: false,
    }),
  );
  app.directive('click-log', {});
  app.directive('mermaid', {});
  app.mount(host);
  await vi.waitFor(() => expect(host?.textContent).toContain(items[0].title));
  await nextTick();
}

describe('UpdateLogs 产品版本与已发布状态', () => {
  it.each([false, true])('草稿不抢占最新，历史空版本保留日期（mobile=%s）', async (mobile) => {
    await mountVersions(
      [
        logEntry('draft', '下次整版', 'draft', '1.1.0'),
        logEntry('milestone', '知识庄园开放', 'published', '1.0.0'),
        logEntry('older', '新版社区上线', 'published'),
      ],
      mobile,
    );
    const latest = host!.querySelector(mobile ? '.mobile-latest-card' : '.log-card.is-latest');
    expect(latest?.textContent).toContain('v1.0.0');
    expect(latest?.textContent).toContain('知识庄园开放');
    expect(latest?.textContent).not.toContain('1.1.0');
    expect(host!.querySelectorAll('.latest-badge')).toHaveLength(1);
    expect(host!.querySelectorAll('.log-version')).toHaveLength(2);
    expect(host!.textContent).toContain('2026-09-18');
    expect(host!.textContent).toContain('草稿');
  });
  it.each([false, true])('正式发布后 1.1.0 才成为最新（mobile=%s）', async (mobile) => {
    await mountVersions(
      [logEntry('draft', '新整版已发布', 'published', '1.1.0'), logEntry('older', '旧记录', 'published')],
      mobile,
    );
    const latest = host!.querySelector(mobile ? '.mobile-latest-card' : '.log-card.is-latest');
    expect(latest?.textContent).toContain('v1.1.0');
    expect(latest?.textContent).toContain('最新');
  });
  it('只有草稿时不展示最新版本卡片', async () => {
    await mountVersions([logEntry('draft', '未发布整版', 'draft', '1.1.0')], true);
    expect(host!.querySelector('.mobile-changelog__latest')).toBeNull();
    expect(host!.querySelector('.latest-badge')).toBeNull();
    expect(host!.textContent).toContain('v1.1.0');
  });
});
