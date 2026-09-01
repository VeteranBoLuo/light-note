import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { getToolboxTool, TOOLBOX_TOOL_CATALOG } from '@lightnote/shared/toolbox-protocol';
import globalDirect from '@/config/globalDirect';
import { RoleEnum } from '@/config/bookmarkCfg';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { bookmarkStore, useUserStore } from '@/store';
import ToolboxWorkbench from '@/view/toolbox/ToolboxWorkbench.vue';
import ToolboxHome from '@/view/toolbox/ToolboxHome.vue';
import type { ToolboxHomeWorkspaceSummary, ToolboxWorkspace } from '@/api/toolbox';
import '@/assets/css/index.less';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const state = ['populated', 'empty', 'error'].includes(params.get('state') || '')
  ? String(params.get('state'))
  : 'populated';
const view = ['home', 'detail'].includes(params.get('view') || '') ? String(params.get('view')) : 'list';
const kind = ['research', 'learning', 'writing'].includes(params.get('kind') || '')
  ? String(params.get('kind'))
  : 'research';
const toolId = `${kind}_workspace`;
const now = '2026-08-29T14:30:00.000Z';

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', window.innerWidth <= 767);
document.body.dataset.visualState = `${state}-${view}-${kind}`;

const workspaceFixture: ToolboxWorkspace = {
  id: 'visual-workspace',
  kind: kind as ToolboxWorkspace['kind'],
  title:
    kind === 'learning'
      ? '系统学习产品数据分析'
      : kind === 'writing'
        ? '轻量知识管理产品设计手册'
        : '知识产品长期活跃机制研究',
  description: '',
  goal:
    kind === 'learning'
      ? '建立完整的指标判断框架，并完成一个真实产品的留存分析。'
      : kind === 'writing'
        ? '完成一篇有案例、有方法、可以公开发布的深度长文。'
        : '形成一套有证据、可分期落地，并能持续提升用户回访的产品方案。',
  status: 'active',
  targetDate: '2026-10-15',
  nextStep:
    kind === 'learning'
      ? '用一份真实数据练习 cohort 留存表'
      : kind === 'writing'
        ? '补完“从收藏到推进”的核心案例'
        : '访谈 5 位已沉默用户并归纳第二周退出节点',
  resourceCount: 6,
  openItemCount: 5,
  completedItemCount: 3,
  streakDays: 4,
  lastOpenedAt: now,
  createdAt: '2026-08-18T08:00:00.000Z',
  updatedAt: now,
  completedAt: null,
  resources: [
    { id: 1, type: 'note', resourceId: 'note-1', version: 'v1', title: '用户活跃度问题记录', createdAt: now },
    { id: 2, type: 'bookmark', resourceId: 'bookmark-1', version: 'v1', title: 'NotebookLM 产品说明', createdAt: now },
    {
      id: 3,
      type: 'bookmark',
      resourceId: 'bookmark-2',
      version: 'v1',
      title: 'Readwise 每日回顾机制',
      createdAt: now,
    },
    { id: 4, type: 'file', resourceId: 'file-1', version: 'v1', title: '沉默用户访谈纪要.pdf', createdAt: now },
    { id: 5, type: 'note', resourceId: 'note-2', version: 'v1', title: '工具箱一期观察', createdAt: now },
    { id: 6, type: 'file', resourceId: 'file-2', version: 'v1', title: '行业方案对照表.xlsx', createdAt: now },
  ],
  items: [
    {
      id: 'item-1',
      lane: 'inbox',
      title: kind === 'learning' ? '为什么留存曲线会快速下坠？' : '用户第二周为什么不再回来？',
      content: '需要区分工具价值不足、提醒缺失与收藏任务已经结束三种原因。',
      status: 'in_progress',
      position: 0,
      dueOn: '2026-09-02',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    {
      id: 'item-2',
      lane: 'inbox',
      title: '连续天数是否会制造无意义打卡？',
      content: '',
      status: 'open',
      position: 1,
      dueOn: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    {
      id: 'item-3',
      lane: 'knowledge',
      title: '长期上下文比一次性生成更有回访理由',
      content: '多个相邻产品都把材料、对话与成果保留在持续空间中。',
      status: 'done',
      position: 0,
      dueOn: null,
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    },
    {
      id: 'item-4',
      lane: 'knowledge',
      title: '每次离开前留下下一步能显著降低恢复成本',
      content: '',
      status: 'open',
      position: 1,
      dueOn: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    {
      id: 'item-5',
      lane: 'action',
      title: '完成 5 位沉默用户访谈',
      content: '覆盖注册后 7–30 天未再次访问的用户。',
      status: 'open',
      position: 0,
      dueOn: '2026-09-05',
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    {
      id: 'item-6',
      lane: 'action',
      title: '定义工作区一期活跃指标',
      content: '',
      status: 'open',
      position: 1,
      dueOn: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
  ],
  sessions: [
    {
      id: 'session-1',
      summary: '完成 8 个相邻产品的持续使用机制对照，确认工作区与每日回顾是两条高频路径。',
      nextStep: '访谈 5 位已沉默用户并归纳第二周退出节点',
      durationMinutes: 45,
      createdAt: now,
    },
    {
      id: 'session-2',
      summary: '整理现有工具箱边界，排除继续堆叠低频格式转换工具的方案。',
      nextStep: '收敛三种一期工作区模板',
      durationMinutes: 25,
      createdAt: '2026-08-28T12:10:00.000Z',
    },
    {
      id: 'session-3',
      summary: '确认用户活跃主要集中在注册后的资源收集阶段。',
      nextStep: '调研生产与推进型知识工具',
      durationMinutes: 30,
      createdAt: '2026-08-27T10:20:00.000Z',
    },
  ],
};

const listFixture = [
  workspaceFixture,
  {
    ...workspaceFixture,
    id: 'visual-workspace-2',
    title: kind === 'learning' ? 'AI 产品经理能力地图' : '移动端知识生产体验优化',
    goal: '持续记录问题、证据与验证结果，形成可交付的优化方案。',
    nextStep: '完成移动端深色模式的第一轮走查',
    resourceCount: 4,
    openItemCount: 2,
    completedItemCount: 6,
    updatedAt: '2026-08-28T10:00:00.000Z',
    resources: [],
    items: [],
    sessions: [],
  },
  {
    ...workspaceFixture,
    id: 'visual-workspace-3',
    title: kind === 'writing' ? '知识工具箱发布长文' : '积分经济长期价值研究',
    goal: '找出积分与持续生产行为之间合理、可解释的连接方式。',
    status: 'paused' as const,
    nextStep: '等待一期工作区行为数据',
    resourceCount: 8,
    openItemCount: 1,
    completedItemCount: 4,
    updatedAt: '2026-08-24T09:00:00.000Z',
    resources: [],
    items: [],
    sessions: [],
  },
];

function toHomeWorkspace(value: ToolboxWorkspace): ToolboxHomeWorkspaceSummary {
  return {
    id: value.id,
    kind: value.kind,
    title: value.title,
    status: value.status,
    nextStep: value.nextStep,
    resourceCount: value.resourceCount,
    openItemCount: value.openItemCount,
    completedItemCount: value.completedItemCount,
    lastOpenedAt: value.lastOpenedAt,
    updatedAt: value.updatedAt,
  };
}

const homeWorkspaceFixtures = [
  toHomeWorkspace({
    ...workspaceFixture,
    id: 'visual-learning-workspace',
    kind: 'learning',
    title: '系统学习产品数据分析',
    nextStep: '用一份真实数据练习 cohort 留存表',
  }),
  toHomeWorkspace({
    ...workspaceFixture,
    id: 'visual-research-workspace',
    kind: 'research',
    title: '知识产品长期活跃机制研究',
    nextStep: '访谈 5 位已沉默用户并归纳第二周退出节点',
  }),
  toHomeWorkspace({
    ...workspaceFixture,
    id: 'visual-writing-workspace',
    kind: 'writing',
    title: '轻量知识管理产品设计手册',
    nextStep: '补完“从收藏到推进”的核心案例',
  }),
];

function response(config: any, data: unknown, status = 200) {
  return {
    data: { status, msg: 'ok', data },
    status,
    statusText: 'OK',
    headers: {},
    config,
    request: null,
  };
}

request.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  if (state === 'error' && url.startsWith('/api/toolbox/workspaces')) {
    return response(config, { code: 'VISUAL_WORKSPACE_ERROR' }, 500);
  }
  if (url === '/api/toolbox/catalog') {
    const definition = getToolboxTool(toolId);
    const definitions =
      view === 'home'
        ? TOOLBOX_TOOL_CATALOG.filter((item) => item.availability.enabled)
        : definition
          ? [definition]
          : [];
    return response(config, {
      protocolVersion: 1,
      pricingVersion: 'toolbox-points-v1',
      chargeRule: 'single_medium_per_execution',
      tools: definitions.map((item) => ({
        ...item,
        price:
          item.billingMedium === 'free'
            ? { kind: 'free', currency: null, min: 0, max: 0 }
            : { kind: 'quote', currency: 'points', min: 8, max: 60 },
      })),
    });
  }
  if (url === '/api/toolbox/workspaces' && String(config.method).toLowerCase() === 'get') {
    return response(config, { items: state === 'empty' ? [] : listFixture });
  }
  if (url === '/api/toolbox/workspaces/visual-workspace') return response(config, workspaceFixture);
  if (url.startsWith('/api/toolbox/workspaces/')) return response(config, workspaceFixture);
  if (url === '/api/toolbox/workspaces' && String(config.method).toLowerCase() === 'post') {
    return response(config, workspaceFixture, 201);
  }
  if (url === '/api/growth/me') {
    return response(config, {
      exp: 1200,
      level: 8,
      name: '远行者',
      spaceMb: 2048,
      aiTokenDaily: 0,
      streak: 9,
      points: 1342,
      checkedInToday: true,
      levelStartExp: 1000,
      nextLevelExp: 1500,
      expToNext: 300,
      progress: 40,
      isMax: false,
    });
  }
  if (url === '/api/toolbox/home') {
    return response(config, {
      schemaVersion: 2,
      workspaces: { continue: homeWorkspaceFixtures, recent: homeWorkspaceFixtures },
      tasks: { active: [], ready: [], recent: [] },
    });
  }
  throw Object.assign(new Error(`Unexpected workspace visual fixture request: ${url}`), {
    code: 'VISUAL_FIXTURE_UNEXPECTED_REQUEST',
  });
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/toolbox', component: ToolboxHome },
    { path: '/toolbox/:toolId', component: ToolboxWorkbench },
    { path: '/:pathMatch(.*)*', component: { render: () => null } },
  ],
});
await router.push(
  view === 'home'
    ? { path: '/toolbox' }
    : { path: `/toolbox/${toolId}`, query: view === 'detail' ? { workspace: 'visual-workspace' } : {} },
);

const pinia = createPinia();
const app = createApp({ render: () => h(RouterView) });
app.use(pinia);
app.use(router);
app.use(
  createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, 'en-US': enUS },
  }),
);
const user = useUserStore(pinia);
user.setUserInfo({
  id: 'visual-user',
  role: RoleEnum.USER,
  userName: '视觉验收用户',
  alias: '视觉验收用户',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
globalDirect(app);
app.mount('#app');
