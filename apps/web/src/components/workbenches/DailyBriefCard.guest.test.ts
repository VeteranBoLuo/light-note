import { createApp, h, nextTick, reactive } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
import DailyBriefCard from './DailyBriefCard.vue';

const mocks = vi.hoisted(() => ({ visitor: vi.fn(), get: vi.fn(), ensure: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock('@/api/dailyBriefApi', () => ({
  getVisitorBrief: mocks.visitor,
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

const sample = {
  kind: 'visitor_example',
  dataDate: '2026-09-09',
  stale: false,
  brief: {
    version: 2,
    generatedBy: 'example',
    headline: '来自实际示例的标题',
    insights: [
      {
        id: 'sample-todo',
        factIds: ['todo_due_today', 'workshop_due'],
        text: '实际行动',
        sources: [{ type: 'research_workspace', id: 'project-real', title: '研究项目' }],
      },
      { id: 'sample-content', factIds: ['visitor_content'], text: '形式展示' },
      { id: 'sample-connection', factIds: ['resource_connection'], text: '实际资料关联' },
      { id: 'sample-organize', factIds: ['organize_untagged', 'organize_pending'], text: '整理真实资料' },
    ],
    recommendation: '浏览建议',
  },
};
beforeEach(() => mocks.visitor.mockResolvedValue({ status: 200, data: sample }));
describe('今日简报游客示例', () => {
  it('reads the visitor API and uses verified project and organize links without AI generation', async () => {
    const { host } = mount();
    await vi.waitFor(() => expect(host.querySelectorAll('.daily-brief-insight')).toHaveLength(4));
    expect(host.textContent).toContain('2026-09-09');
    const project = host.querySelector<HTMLButtonElement>('.daily-brief-insight__sources button');
    project?.click();
    expect(mocks.push).toHaveBeenLastCalledWith({
      path: '/toolbox/research_workspace',
      query: { workspace: 'project-real' },
    });
    const actions = host.querySelectorAll<HTMLButtonElement>('.daily-brief-insight__organize-actions button');
    const targets = ['/inbox?tab=todo', '/organize?issue=untagged', '/organize?issue=pending'];
    actions.forEach((b, i) => {
      b.click();
      expect(mocks.push).toHaveBeenLastCalledWith(targets[i]);
    });
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('shows a retry on initial failure, preserves saved content on refresh failure', async () => {
    mocks.visitor.mockRejectedValueOnce(new Error('network'));
    const { host } = mount();
    await vi.waitFor(() => expect(host.textContent).toContain('暂时无法加载'));
    host.querySelector<HTMLButtonElement>('.daily-brief-card__state button')?.click();
    await vi.waitFor(() => expect(host.textContent).toContain(sample.brief.headline));
  });
  it('reads examples for administrator visitor preview, never the formal brief', async () => {
    const { host, props } = mount();
    Object.assign(props, { eligible: true, readOnly: true, visitor: true, ownerKey: 'admin-visitor' });
    await vi.waitFor(() => expect(host.textContent).toContain(sample.brief.headline));
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('removes private content immediately when switching identities', async () => {
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
    props.eligible = false;
    props.ownerKey = 'visitor';
    await nextTick();
    expect(host.textContent).not.toContain('账号私有简报');
    await vi.waitFor(() => expect(host.textContent).toContain(sample.brief.headline));
  });
  it('管理员预览允许进入整理列表且不生成或刷新简报', async () => {
    mocks.get.mockResolvedValue({
      status: 200,
      data: {
        enabled: true,
        featureEnabled: true,
        status: 'ready',
        shouldGenerate: false,
        brief: {
          version: 2,
          headline: '预览简报',
          recommendation: '',
          insights: [{ id: 'organize', factIds: ['organize_untagged'], text: '19 条无标签内容' }],
          sections: [{ id: 'organize', items: [{ id: 'organize_untagged', count: 19 }] }],
        },
      },
    });
    const { host, props } = mount();
    Object.assign(props, { eligible: true, readOnly: true, ownerKey: 'admin-preview' });
    await vi.waitFor(() => expect(host.querySelector('.daily-brief-insight__organize-actions button')).not.toBeNull());
    host.querySelector<HTMLButtonElement>('.daily-brief-insight__organize-actions button')!.click();
    expect(mocks.push).toHaveBeenCalledWith('/organize?issue=untagged');
    expect(props.readOnly).toBe(true);
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it('administrator formal-account preview remains passive and shows only saved results', async () => {
    mocks.get.mockResolvedValue({ status: 200, data: { enabled: false, featureEnabled: true, brief: null } });
    const { host, props } = mount();
    Object.assign(props, { eligible: true, readOnly: true, ownerKey: 'admin-preview' });
    await vi.waitFor(() => expect(host.textContent).toContain('管理员预览只展示已保存结果'));
    expect(host.querySelector('button')).toBeNull();
    expect(mocks.ensure).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
