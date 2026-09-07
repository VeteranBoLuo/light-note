import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
import DailyBriefCard from './DailyBriefCard.vue';

const mocks = vi.hoisted(() => ({ get: vi.fn(), ensure: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock('@/api/dailyBriefApi', () => ({
  getDailyBrief: mocks.get,
  ensureDailyBrief: mocks.ensure,
  refreshDailyBrief: mocks.refresh,
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => null } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.resetAllMocks();
});

function mount(locale = 'zh-CN') {
  const props = reactive({ eligible: false, ownerKey: 'visitor', readOnly: false });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(DailyBriefCard, props) });
  app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zhCN, 'en-US': enUS } }));
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return { host, props };
}

describe('今日简报游客示例', () => {
  it('游客只保留待办与无标签整理入口，不读取或生成简报', async () => {
    const { host } = mount();
    expect(host.textContent).toContain('串联待办、收藏与笔记');
    expect(host.textContent).not.toContain('示例');
    expect(host.querySelectorAll('.daily-brief-insight')).toHaveLength(4);
    expect(host.querySelectorAll('button')).toHaveLength(2);
    const actions = host.querySelectorAll<HTMLButtonElement>('.daily-brief-insight__organize-actions button');
    const targets = ['/inbox?tab=todo', '/organize?issue=untagged'];
    actions.forEach((button, index) => {
      button.click();
      expect(mocks.push).toHaveBeenLastCalledWith(targets[index]);
    });
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    await nextTick();
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('英文游客内容显示正常简报说明', () => {
    const { host } = mount('en-US');
    expect(host.textContent).toContain('Connect tasks, bookmarks and notes');
    expect(host.textContent).not.toContain('Sample');
    expect(Array.from(host.querySelectorAll('button'), (button) => button.textContent?.trim())).toEqual([
      'View tasks',
      'Organize untagged content',
    ]);
  });
  it('登录后移除示例，退出登录后不泄露上一账号正文', async () => {
    mocks.get.mockResolvedValue({
      status: 200,
      data: {
        enabled: true,
        featureEnabled: true,
        status: 'ready',
        shouldGenerate: false,
        brief: { version: 2, headline: '账号私有简报', insights: [], recommendation: '账号建议' },
      },
    });
    const { host, props } = mount();
    props.eligible = true;
    props.ownerKey = 'user-1';
    await vi.waitFor(() => expect(host.textContent).toContain('账号私有简报'));
    expect(host.textContent).not.toContain('串联待办、收藏与笔记');
    props.eligible = false;
    props.ownerKey = 'visitor';
    await nextTick();
    expect(host.textContent).toContain('串联待办、收藏与笔记');
    expect(host.textContent).not.toContain('示例');
    expect(host.textContent).not.toContain('账号私有简报');
  });
  it('管理员只读默认态不显示游客示例或登录入口', async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { enabled: false, featureEnabled: true, brief: null } });
    const { host, props } = mount();
    props.readOnly = true;
    props.eligible = true;
    props.ownerKey = 'admin-preview';
    await vi.waitFor(() => expect(host.textContent).toContain('管理员预览只展示已保存结果'));
    expect(host.textContent).not.toContain('串联待办、收藏与笔记');
    expect(host.querySelector('button')).toBeNull();
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
