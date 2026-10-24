import { createApp, h, nextTick, reactive, type SetupContext } from 'vue';
import { createI18n } from 'vue-i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import zhCN from '@/i18n/locales/zh-CN';
import enUS from '@/i18n/locales/en-US';
import DailyBriefCard from './DailyBriefCard.vue';

const mocks = vi.hoisted(() => ({
  visitor: vi.fn(),
  get: vi.fn(),
  ensure: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
  open: vi.fn(),
}));
vi.mock('@/api/dailyBriefApi', () => ({
  getVisitorBrief: mocks.visitor,
  getDailyBrief: mocks.get,
  ensureDailyBrief: mocks.ensure,
  refreshDailyBrief: mocks.refresh,
}));
vi.mock('@/components/base/SvgIcon/src/SvgIcon.vue', () => ({ default: { render: () => null } }));
vi.mock('@/components/base/BasicComponents/BModal/BModal.vue', () => ({
  default: {
    inheritAttrs: false,
    props: ['visible'],
    setup:
      (props: { visible: boolean }, { slots }: SetupContext) =>
      () =>
        props.visible ? slots.default?.() : null,
  },
}));
vi.mock('@/utils/openBookmark', () => ({ openBookmarkUrl: mocks.open }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  vi.resetAllMocks();
});

function mount(locale = 'zh-CN', compact = false, formal = false) {
  const props = reactive({ eligible: formal, ownerKey: formal ? 'owner' : 'visitor', readOnly: false, compact });
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
  it('compact preview shows the complete recommendation and opens the supporting details', async () => {
    const { host } = mount('zh-CN', true);
    await vi.waitFor(() =>
      expect(host.querySelector('.daily-brief-card__preview-recommendation p')?.textContent).toBe(
        sample.brief.recommendation,
      ),
    );
    expect(host.querySelector('.daily-brief-card__preview-recommendation strong')?.textContent).toBe('浏览建议');
    expect(host.textContent).not.toContain('实际资料关联');
    host.querySelector<HTMLButtonElement>('.daily-brief-card__view-brief')!.click();
    await nextTick();
    expect(host.querySelectorAll('.daily-brief-insight')).toHaveLength(4);
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
  it('compact preview omits the recommendation panel when no suggestion exists', async () => {
    mocks.visitor.mockResolvedValueOnce({
      status: 200,
      data: {
        ...sample,
        brief: { ...sample.brief, recommendation: '' },
      },
    });
    const { host } = mount('zh-CN', true);
    await vi.waitFor(() => expect(host.textContent).toContain(sample.brief.headline));
    expect(host.querySelector('.daily-brief-card__preview-recommendation')).toBeNull();
    expect(host.querySelector('.daily-brief-card__view-brief')).not.toBeNull();
  });
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
  it('opens a bookmark through the shared preference and reuse entry point', async () => {
    mocks.visitor.mockResolvedValueOnce({
      status: 200,
      data: {
        ...sample,
        brief: {
          ...sample.brief,
          insights: [
            {
              id: 'bookmark',
              factIds: [],
              text: '相关资料',
              sources: [
                { type: 'bookmark', id: 'bookmark-fixture', title: '资料', url: 'https://example.com/article' },
              ],
            },
          ],
        },
      },
    });
    const { host } = mount();
    await vi.waitFor(() => expect(host.querySelector('.daily-brief-insight__sources button')).not.toBeNull());
    expect(mocks.open).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>('.daily-brief-insight__sources button')!.click();
    expect(mocks.open).toHaveBeenCalledExactlyOnceWith('https://example.com/article', {
      resourceId: 'bookmark-fixture',
    });
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

const formalState = (brief: any) => ({
  status: 200,
  data: {
    featureEnabled: true,
    enabled: true,
    status: 'ready',
    date: '2026-10-22',
    timezone: 'Asia/Shanghai',
    brief,
    stale: false,
    shouldGenerate: false,
  },
});
const focusedBrief = {
  version: 2,
  date: '2026-10-22',
  generatedBy: 'facts',
  headline: '',
  recommendation: '',
  insights: [
    {
      id: 'todo_one',
      factIds: ['todo_due_today'],
      text: '今天截止 · 10-22 15:00：提交报销材料',
      sources: [{ type: 'todo', id: 'one', title: '提交报销材料' }],
    },
    {
      id: 'workshop_result',
      factIds: ['workshop_result'],
      text: '选型报告有新的结论',
      sources: [{ type: 'toolbox_task', id: 'job', title: '选型报告' }],
    },
  ],
};
describe('正式简报的重点与安静状态', () => {
  it.each([false, true])('零新增只显示一次，平静日不出现空详情，compact=%s', async (compact) => {
    const sections = [
      {
        id: 'new_content',
        items: ['bookmark', 'note', 'file'].map((type) => ({ id: `${type}_created_today`, count: 0 })),
      },
    ];
    mocks.get.mockResolvedValue(formalState({ ...focusedBrief, headline: '今天暂无新增资源', sections }));
    const { host, props } = mount('zh-CN', compact, true);
    await vi.waitFor(() => expect(host.textContent).toContain('今天暂无新增资源'));
    expect(host.textContent?.match(/今天暂无新增资源/g)).toHaveLength(1);
    expect(host.textContent).toContain('提交报销材料');
    mocks.get.mockResolvedValue(
      formalState({
        ...focusedBrief,
        headline: '今天暂无新增资源，也没有需要特别关注的事项。',
        insights: [],
        sections,
      }),
    );
    props.ownerKey = 'another-owner';
    await vi.waitFor(() => expect(host.textContent).toContain('今天暂无新增资源，也没有需要特别关注的事项。'));
    expect(host.textContent?.match(/今天暂无新增资源/g)).toHaveLength(1);
    expect(host.querySelector('.daily-brief-card__view-brief')).toBeNull();
    expect(host.querySelector('.daily-brief-card__recommendation:not(.daily-brief-card__advice-status)')).toBeNull();
    expect(host.querySelectorAll('.daily-brief-insight')).toHaveLength(0);
  });
  it.each([false, true])('五类共存时失败最先可见，整理合并且所有入口保留，compact=%s', async (compact) => {
    const failure = {
      id: 'workshop_attention',
      factIds: ['workshop_attention'],
      text: '工坊成果保存失败：资料摘要',
      sources: [{ type: 'toolbox_task', id: 'failed-job', title: '资料摘要' }],
    };
    mocks.get.mockResolvedValue(
      formalState({
        ...focusedBrief,
        insights: [
          failure,
          focusedBrief.insights[0],
          {
            id: 'workshop_due',
            factIds: ['workshop_due'],
            text: '项目今天到期',
            sources: [{ type: 'research_workspace', id: 'project', title: '研究' }],
          },
          focusedBrief.insights[1],
          {
            id: 'organize_summary',
            factIds: ['organize_ai_pending', 'organize_pending', 'organize_untagged'],
            text: '3 条建议待审核，4 项资料待整理，510 项资源无标签。',
          },
        ],
        sections: [
          {
            id: 'organize',
            items: [
              { id: 'organize_ai_pending', count: 3 },
              { id: 'organize_pending', count: 4 },
              { id: 'organize_untagged', count: 510 },
            ],
          },
        ],
      }),
    );
    const { host } = mount('zh-CN', compact, true);
    await vi.waitFor(() => expect(host.textContent).toContain(failure.text));
    if (compact) {
      expect(host.querySelector('.daily-brief-card__headline')?.textContent).toBe(failure.text);
      host.querySelector<HTMLButtonElement>('.daily-brief-card__view-brief')!.click();
      await nextTick();
    }
    expect([...host.querySelectorAll('.daily-brief-insight__marker')].map((node) => node.textContent?.trim())).toEqual([
      '提醒',
      '待办',
      '项目',
      '成果',
      '整理',
    ]);
    expect(host.querySelectorAll('.daily-brief-insight__organize-actions button')).toHaveLength(3);
    host.querySelector<HTMLButtonElement>('.daily-brief-insight__sources button')!.click();
    expect(mocks.push).toHaveBeenLastCalledWith({ path: '/toolbox/task/failed-job' });
    expect(host.textContent).toContain('选型报告有新的结论');
  });
  it.each([
    ['organize_ai_pending', '更新前建议'],
    ['file_created_today', '处理建议'],
  ])('仅当建议依据变化时标记旧建议：%s', async (changedId, expectedLabel) => {
    const response = formalState({
      ...focusedBrief,
      recommendation: '先核对本轮整理建议。',
      recommendationKind: 'action',
      recommendationFactIds: ['organize_ai_pending'],
    });
    Object.assign(response.data, { stale: true, staleFactIds: [changedId] });
    mocks.get.mockResolvedValue(response);
    const { host } = mount('zh-CN', false, true);
    await vi.waitFor(() =>
      expect(host.querySelector('.daily-brief-card__recommendation strong')?.textContent).toBe(expectedLabel),
    );
  });
  it.each([false, true])('新增概览与有依据的处理建议共存，compact=%s', async (compact) => {
    const brief = {
      ...focusedBrief,
      headline: '今天新增 1 个文件',
      recommendation: '先核对本轮建议，再查看哪些资料仍需整理。',
      recommendationKind: 'action',
      recommendationFactIds: ['organize_ai_pending'],
      sections: [{ id: 'new_content', items: [{ id: 'file_created_today', count: 1 }] }],
    };
    mocks.get.mockResolvedValue(formalState(brief));
    const { host } = mount('zh-CN', compact, true);
    await vi.waitFor(() => expect(host.textContent).toContain(brief.headline));
    expect(host.textContent).toContain('处理建议');
    expect(host.textContent).toContain(brief.recommendation);
    if (compact) {
      host.querySelector<HTMLButtonElement>('.daily-brief-card__view-brief')!.click();
      await nextTick();
    }
    expect(host.querySelectorAll('.daily-brief-insight')).toHaveLength(2);
    expect(host.querySelector('.daily-brief-card__recommendation strong')?.textContent).toBe('处理建议');
  });
  it('仅有今日新增也保留概览，没有空详情或凑出的建议', async () => {
    mocks.get.mockResolvedValue(
      formalState({
        ...focusedBrief,
        headline: '今天新增 1 篇笔记',
        insights: [],
        sections: [{ id: 'new_content', items: [{ id: 'note_created_today', count: 1 }] }],
      }),
    );
    const { host } = mount('zh-CN', true, true);
    await vi.waitFor(() => expect(host.textContent).toContain('今天新增 1 篇笔记'));
    expect(host.querySelector('.daily-brief-card__view-brief')).toBeNull();
    expect(host.querySelector('.daily-brief-card__preview-recommendation')).toBeNull();
  });
  it('成果背景按文本展示，旧产物没有背景时也正常显示', async () => {
    const context = '《报告 <b>标题</b>》已生成，尚未保存。';
    mocks.get.mockResolvedValue(
      formalState({
        ...focusedBrief,
        insights: focusedBrief.insights.map((item, i) => (i === 1 ? { ...item, context } : item)),
      }),
    );
    const { host } = mount('zh-CN', false, true);
    await vi.waitFor(() => expect(host.querySelector('.daily-brief-insight__context')?.textContent).toBe(context));
    expect(host.querySelector('.daily-brief-insight__context b')).toBeNull();
    expect(host.textContent).toContain('选型报告有新的结论');
  });
  it.each([false, true])('整理汇总与待办、成果共存，三个整理入口准确，compact=%s', async (compact) => {
    const brief = {
      ...focusedBrief,
      insights: [
        ...focusedBrief.insights,
        { id: 'review', factIds: ['organize_ai_pending'], text: '有 3 条 AI 整理建议待审核。' },
        {
          id: 'resources',
          factIds: ['organize_pending', 'organize_untagged'],
          text: '4 项资料待整理；510 项资源尚无标签。',
        },
      ],
      sections: [
        {
          id: 'organize',
          items: [
            {
              id: 'organize_ai_pending',
              count: 3,
              route: '/organize?issue=ai_suggestions&review=pending&runId=old-run&resourceType=bookmark',
            },
            { id: 'organize_pending', count: 4 },
            { id: 'organize_untagged', count: 510 },
          ],
        },
      ],
    };
    mocks.get.mockResolvedValue(formalState(brief));
    const { host } = mount('zh-CN', compact, true);
    await vi.waitFor(() => expect(host.textContent).toContain('提交报销材料'));
    if (compact) {
      host.querySelector<HTMLButtonElement>('.daily-brief-card__view-brief')!.click();
      await nextTick();
    }
    expect(host.querySelectorAll('.daily-brief-insight')).toHaveLength(3);
    expect(host.textContent).toContain('选型报告有新的结论');
    expect(host.textContent).toContain('有 3 条 AI 整理建议待审核。');
    expect(
      [...host.querySelectorAll('.daily-brief-insight__marker')].map((marker) => marker.textContent?.trim()),
    ).toEqual(['待办', '成果', '整理']);
    const organizing = [...host.querySelectorAll('.daily-brief-insight')].filter((row) =>
      row.textContent?.includes('有 3 条 AI 整理建议待审核。'),
    );
    expect(organizing).toHaveLength(1);
    expect(organizing[0].textContent).toContain('4 项资料待整理；510 项资源尚无标签。');
    const actions = host.querySelectorAll<HTMLButtonElement>('.daily-brief-insight__organize-actions button');
    expect(actions).toHaveLength(3);
    const targets = [brief.sections[0].items[0].route, '/organize?issue=pending', '/organize?issue=untagged'];
    actions.forEach((button, index) => {
      button.click();
      expect(mocks.push).toHaveBeenLastCalledWith(targets[index]);
    });
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
  it('英文使用完整类别名称，同类整理合并后仍显示事实变化提示', async () => {
    const brief = {
      ...focusedBrief,
      insights: [
        ...focusedBrief.insights,
        { id: 'ai-review', text: '3 suggestions to review.', factIds: ['organize_ai_pending'] },
        { id: 'resources', text: '4 pending resources.', factIds: ['organize_pending'] },
      ],
    };
    const response = formalState(brief);
    Object.assign(response.data, { stale: true, staleFactIds: ['organize_ai_pending'] });
    mocks.get.mockResolvedValue(response);
    const { host } = mount('en-US', false, true);
    await vi.waitFor(() => expect(host.querySelectorAll('.daily-brief-insight')).toHaveLength(3));
    expect(
      [...host.querySelectorAll('.daily-brief-insight__marker')].map((marker) => marker.textContent?.trim()),
    ).toEqual(['Tasks', 'Result', 'Organize']);
    const group = host.querySelectorAll('.daily-brief-insight')[2];
    expect(group.textContent).toContain('3 suggestions to review. 4 pending resources.');
    expect(group.querySelector('.daily-brief-insight__changed')?.textContent).toBe('Data changed');
  });
  it('一项待办与其他报告共存，任务入口定位准确，无强制建议或清单总数', async () => {
    mocks.get.mockResolvedValue(formalState(focusedBrief));
    const { host } = mount('zh-CN', false, true);
    await vi.waitFor(() => expect(host.querySelectorAll('.daily-brief-insight')).toHaveLength(2));
    expect(host.querySelector('.daily-brief-card__recommendation:not(.daily-brief-card__advice-status)')).toBeNull();
    expect(host.textContent).toContain('选型报告有新的结论');
    expect(host.textContent).not.toContain('查看全部');
    host.querySelector<HTMLButtonElement>('.daily-brief-insight__sources button')!.click();
    expect(mocks.push).toHaveBeenLastCalledWith({ path: '/inbox', query: { tab: 'todo', todoId: 'one' } });
  });
  it('移动摘要直接显示最近的重要事项，详情保留其他报告', async () => {
    mocks.get.mockResolvedValue(formalState(focusedBrief));
    const { host } = mount('zh-CN', true, true);
    await vi.waitFor(() =>
      expect(host.querySelector('.daily-brief-card__headline')?.textContent).toContain('提交报销材料'),
    );
    expect(host.querySelector('.daily-brief-card__preview-recommendation')).toBeNull();
    host.querySelector<HTMLButtonElement>('.daily-brief-card__view-brief')!.click();
    await nextTick();
    expect(host.querySelectorAll('.daily-brief-insight')).toHaveLength(2);
  });
  it.each([false, true])('无重点只展示短句，不显示建议或空详情入口，compact=%s', async (compact) => {
    mocks.get.mockResolvedValue(formalState({ ...focusedBrief, headline: '今天暂无需特别关注的事项', insights: [] }));
    const { host } = mount('zh-CN', compact, true);
    await vi.waitFor(() => expect(host.textContent).toContain('今天暂无需特别关注的事项'));
    expect(host.querySelector('.daily-brief-card__recommendation:not(.daily-brief-card__advice-status)')).toBeNull();
    expect(host.querySelector('.daily-brief-card__preview-recommendation')).toBeNull();
    expect(host.querySelector('.daily-brief-card__view-brief')).toBeNull();
    expect(mocks.ensure).not.toHaveBeenCalled();
  });
});

it('移动端初次失败仍可打开详情重试，不与平静日空态混淆', async () => {
  mocks.get.mockResolvedValue({
    status: 200,
    data: { ...formalState(null).data, status: 'failed', lastErrorCode: 'DATABASE_ERROR' },
  });
  mocks.refresh.mockResolvedValue(formalState(focusedBrief));
  const { host } = mount('zh-CN', true, true);
  await vi.waitFor(() => expect(host.querySelector('.daily-brief-card__view-brief')).not.toBeNull());
  host.querySelector<HTMLButtonElement>('.daily-brief-card__view-brief')!.click();
  await nextTick();
  const retry = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    b.textContent?.includes('重新生成'),
  );
  expect(retry).toBeTruthy();
  retry!.click();
  await vi.waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
});

it('旧缓存尚未更新时也最多展示一条待办，保留其他报告', async () => {
  const old = {
    ...focusedBrief,
    headline: '有 4 项一次性待办需要留意',
    insights: [
      focusedBrief.insights[0],
      { ...focusedBrief.insights[0], id: 'todo_old', text: '另一条旧待办' },
      focusedBrief.insights[1],
    ],
  };
  mocks.get.mockResolvedValue(formalState(old));
  const { host } = mount('zh-CN', false, true);
  await vi.waitFor(() => expect(host.querySelectorAll('.daily-brief-insight')).toHaveLength(2));
  expect(host.textContent).not.toContain('另一条旧待办');
  expect(host.textContent).not.toContain('有 4 项一次性待办');
  expect(host.textContent).toContain('选型报告有新的结论');
});

it.each([
  ['no_value', '暂无需要补充的建议'],
  ['no_evidence', '暂无可分析的资料正文。'],
  ['deferred', 'AI 建议等待分析。'],
  ['failed', 'AI 建议生成失败'],
])('手动检查区分建议状态 %s，状态位于底部 AI 建议区', async (adviceStatus, hint) => {
  const response = formalState({ ...focusedBrief, adviceStatus, recommendation: '' });
  mocks.get.mockResolvedValue(response);
  mocks.refresh.mockResolvedValue(response);
  const { host } = mount('zh-CN', false, true);
  await vi.waitFor(() => expect(host.querySelectorAll('.daily-brief-insight')).toHaveLength(2));
  host.querySelector<HTMLButtonElement>('.daily-brief-card__update')!.click();
  await vi.waitFor(() => expect(host.textContent).toContain(hint));
  expect(
    host.querySelector(
      adviceStatus === 'failed' ? '.daily-brief-card__refresh-error' : '.daily-brief-card__advice-status',
    )?.textContent,
  ).toContain(hint);
  expect(host.querySelector('.daily-brief-card__header')?.textContent).not.toContain(hint);
  expect(host.querySelector('.daily-brief-card__recommendation:not(.daily-brief-card__advice-status)')).toBeNull();
});

it('自动更新等待分析时说明原因，无需先点刷新，显示底部状态', async () => {
  mocks.get.mockResolvedValue(formalState({ ...focusedBrief, adviceStatus: 'deferred', recommendation: '' }));
  const { host } = mount('zh-CN', false, true);
  await vi.waitFor(() => expect(host.textContent).toContain('AI 建议等待分析。'));
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(host.querySelector('.daily-brief-card__recommendation:not(.daily-brief-card__advice-status)')).toBeNull();
});

it.each([
  ['no_value', '暂无需要补充的建议', 'No additional suggestions needed.'],
  ['no_evidence', '暂无可分析的资料正文。', 'No readable text available for analysis.'],
  ['deferred', 'AI 建议等待分析。', 'AI suggestion awaiting analysis.'],
  ['not_evaluated', 'AI 建议尚未分析。', 'AI suggestion not yet analyzed.'],
  ['paused', '今日自动分析已达上限，可手动刷新。', 'Automatic analysis limit reached. Refresh manually.'],
  ['failed', 'AI 建议生成失败', 'AI suggestion failed.'],
])('重新进入时保留 %s 状态，不依赖手动刷新', async (adviceStatus, zh, en) => {
  for (const [locale, hint] of [
    ['zh-CN', zh],
    ['en-US', en],
  ]) {
    for (const compact of [false, true]) {
      mocks.get.mockResolvedValue(formalState({ ...focusedBrief, adviceStatus, recommendation: '' }));
      const { host } = mount(locale, compact, true);
      await vi.waitFor(() => expect(host.textContent).toContain(hint));
      expect(
        host.querySelector(
          adviceStatus === 'failed' ? '.daily-brief-card__refresh-error' : '.daily-brief-card__advice-status',
        )?.textContent,
      ).toContain(hint);
      expect(host.querySelector('.daily-brief-card__header')?.textContent).not.toContain(hint);
      expect(mocks.refresh).not.toHaveBeenCalled();
      expect(
        host.querySelector(
          '.daily-brief-card__recommendation:not(.daily-brief-card__advice-status),.daily-brief-card__preview-recommendation:not(.daily-brief-card__advice-status)',
        ),
      ).toBeNull();
      cleanup?.();
      cleanup = undefined;
    }
  }
});

it.each(['deferred', 'failed'])('从 %s 更新为无建议后显示已分析，不残留等待或失败', async (adviceStatus) => {
  mocks.get.mockResolvedValue(formalState({ ...focusedBrief, adviceStatus, recommendation: '' }));
  mocks.refresh.mockResolvedValue(formalState({ ...focusedBrief, adviceStatus: 'no_value', recommendation: '' }));
  const { host } = mount('zh-CN', false, true);
  await vi.waitFor(() =>
    expect(host.textContent).toContain(adviceStatus === 'deferred' ? 'AI 建议等待分析。' : 'AI 建议生成失败'),
  );
  host.querySelector<HTMLButtonElement>('.daily-brief-card__update')!.click();
  await vi.waitFor(() => expect(host.textContent).toContain('暂无需要补充的建议'));
  expect(host.textContent).not.toContain('AI 建议等待分析');
  expect(host.textContent).not.toContain('AI 建议生成失败');
});

it.each(['deferred', 'paused', 'failed'])('更新 %s 时保留无建议结果，重进页面仍可见', async (adviceStatus) => {
  mocks.get.mockResolvedValue(
    formalState({
      ...focusedBrief,
      adviceStatus,
      recommendation: '',
      lastAdviceResult: { adviceStatus: 'no_value', recommendation: '' },
    }),
  );
  for (const compact of [false, true]) {
    const { host } = mount('zh-CN', compact, true);
    await vi.waitFor(() => expect(host.textContent).toContain('暂无需要补充的建议'));
    expect(host.textContent).not.toContain('等待分析');
    if (adviceStatus === 'failed') expect(host.textContent).toContain('本次建议更新未成功，保留上次结果。');
    cleanup?.();
    cleanup = undefined;
  }
});

it.each(['deferred', 'failed'])('更新 %s 时保留已有建议，完成后替换旧结果', async (adviceStatus) => {
  mocks.get.mockResolvedValue(
    formalState({
      ...focusedBrief,
      adviceStatus,
      recommendation: '',
      lastAdviceResult: {
        adviceStatus: 'ready',
        recommendation: '核对附件是否包含在导出范围。',
        recommendationKind: 'ai',
      },
    }),
  );
  mocks.refresh.mockResolvedValue(formalState({ ...focusedBrief, adviceStatus: 'no_value', recommendation: '' }));
  const { host } = mount('zh-CN', false, true);
  await vi.waitFor(() => expect(host.textContent).toContain('核对附件是否包含在导出范围。'));
  expect(host.textContent).not.toContain('等待分析');
  host.querySelector<HTMLButtonElement>('.daily-brief-card__update')!.click();
  await vi.waitFor(() => expect(host.textContent).toContain('暂无需要补充的建议'));
  expect(host.textContent).not.toContain('核对附件是否包含在导出范围。');
  expect(host.textContent).not.toContain('本次建议更新未成功');
});

it('切换账号立即清除上个账号保存的建议结果', async () => {
  mocks.get.mockResolvedValue(
    formalState({
      ...focusedBrief,
      adviceStatus: 'deferred',
      recommendation: '',
      lastAdviceResult: { adviceStatus: 'ready', recommendation: '仅属于账号甲的建议' },
    }),
  );
  const { host, props } = mount('zh-CN', false, true);
  await vi.waitFor(() => expect(host.textContent).toContain('仅属于账号甲的建议'));
  mocks.get.mockResolvedValue(
    formalState({
      ...focusedBrief,
      adviceStatus: 'no_value',
      recommendation: '',
      lastAdviceResult: { adviceStatus: 'no_value', recommendation: '' },
    }),
  );
  props.ownerKey = 'another-account';
  await nextTick();
  expect(host.textContent).not.toContain('仅属于账号甲的建议');
  await vi.waitFor(() => expect(host.textContent).toContain('暂无需要补充的建议'));
});
