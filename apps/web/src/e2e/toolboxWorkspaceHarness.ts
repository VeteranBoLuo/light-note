import { applyBoardOperation } from '@lightnote/shared/workspace-board';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { getToolboxTool, TOOLBOX_TOOL_CATALOG } from '@lightnote/shared/toolbox-protocol';
import globalDirect from '@/config/globalDirect';
import { RoleEnum } from '@/config/bookmarkCfg';
import request from '@/http/request.ts';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { bookmarkStore, useUserStore } from '@/store';
import ToolboxWorkbench from '@/view/toolbox/ToolboxWorkbench.vue';
import DesktopWorkbenchView from '@/view/workbenches/DesktopWorkbenchView.vue';
import MobileTodayView from '@/view/workbenches/MobileTodayView.vue';
import WorkshopProjectEntry from '@/components/workbenches/WorkshopProjectEntry.vue';
import ResourceProjectHost from '@/components/resourceActions/ResourceProjectHost.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import { useProjectResourceAction } from '@/composables/useProjectResourceAction';
import ToolboxHome from '@/view/toolbox/ToolboxHome.vue';
import type { ToolboxHomeWorkspaceSummary, ToolboxWorkspace, ToolboxJob } from '@/api/toolbox';
import '@/assets/css/index.less';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const state = ['populated', 'empty', 'error', 'loading', 'long'].includes(params.get('state') || '')
  ? String(params.get('state'))
  : 'populated';
const view = ['home', 'detail', 'entry', 'join', 'desktop', 'mobile'].includes(params.get('view') || '')
  ? String(params.get('view'))
  : 'list';
const kind = ['research', 'learning', 'writing'].includes(params.get('kind') || '')
  ? String(params.get('kind'))
  : 'research';
const toolId = params.get('tool') || `${kind}_workspace`;
const quotaCase = params.get('quota') || 'normal';
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

if (params.get('legacyLearning') === '1') workspaceFixture.items[0].status = 'done';

if (params.get('boardEmpty') === '1') workspaceFixture.items = [];
if (params.get('emptyLane')) workspaceFixture.items = workspaceFixture.items.filter(item => item.lane !== params.get('emptyLane'));

const boardReceipts = new Map<string, { before: typeof workspaceFixture.items; afterVersion: number; hash: string; focusItemId: string | null }>();
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

if (state === 'long') {
  if (workspaceFixture.items[0]) {
    workspaceFixture.items[0].title = '跨团队持续研究与知识实践：' + 'LongUnbrokenProjectItemTitle'.repeat(6);
    workspaceFixture.items[0].content = '长说明需要在卡片中截断，进入编辑后仍可完整查看。'.repeat(20);
  }
  homeWorkspaceFixtures[0].title =
    '从知识收集到持续研究：建立可复用的产品策略与跨团队协作方法 / A comprehensive research project with a deliberately long title';
  homeWorkspaceFixtures[0].nextStep =
    '梳理现有访谈材料、对照用户的实际工作流程，并将关键结论整理为可验证的研究问题，准备下一轮访谈。';
  homeWorkspaceFixtures[1].nextStep = '';
  homeWorkspaceFixtures[1].resourceCount = 0;
  homeWorkspaceFixtures[1].openItemCount = 0;
}
const homeTaskFixtures = (['processing', 'succeeded', 'failed'] as const).map((status, index): ToolboxJob => ({
  id: `visual-job-${index}`,
  toolId: 'research_brief',
  status,
  stage: status,
  billing: { medium: 'points', status: 'settled', quotedPoints: 8, actualPoints: 8, refundedPoints: 0 },
  save: { status: 'unsaved' },
  error: status === 'failed' ? { code: 'VISUAL_ERROR', message: 'Fixture error' } : null,
  artifact:
    status === 'succeeded'
      ? { id: 'visual-artifact', type: 'note', title: '知识产品研究简报', contentType: 'text/markdown', version: 1 }
      : null,
  artifactState: status === 'succeeded' ? 'ready' : 'none',
  canCancel: status === 'processing',
  startedAt: now,
  completedAt: status === 'processing' ? null : now,
  createdAt: now,
  updatedAt: now,
}));

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

let entryDismissed = false;
request.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  if (
    view === 'home' &&
    state === 'loading' &&
    ['/api/toolbox/home', '/api/toolbox/catalog', '/api/growth/me', '/api/chat/aiQuota'].includes(url)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  if (url === '/api/chat/aiQuota') {
    if (quotaCase === 'unavailable') return response(config, { unavailable: true }, 503);
    if (quotaCase === 'unlimited') return response(config, { exempt: true });
    const remaining = quotaCase === 'zero' ? 0 : quotaCase === 'large' ? 12412000 : 286400;
    return response(config, { used: 0, quota: remaining, remaining, availableRemaining: remaining });
  }

  if (url === '/api/workbench/summary')
    return response(config, {
      today: { todoPendingTotal: 4, inboxPendingTotal: 186 },
      recentNotes: Array.from({ length: 5 }, (_, i) => ({
        id: 'fixture-note-' + i,
        noteTitle: '项目资料与实践记录 ' + (i + 1),
        title: '项目资料与实践记录 ' + (i + 1),
        updatedAt: now,
      })),
      generatedAt: now,
    });
  if (url === '/api/toolbox/knowledge-overview')
    return response(config, {
      scannedAt: now,
      policy: { staleAfterDays: 180, deepNoteDepth: 8 },
      summary: {
        total: 2,
        roots: 2,
        maxDepth: 1,
        tagged: 1,
        linked: 0,
        empty: 1,
        stale: 0,
        invalidParents: 0,
        duplicateGroups: 0,
        duplicateNotes: 0,
        healthScore: 60,
      },
      issueCounts: { empty: 1, untagged: 1 },
      issueTotal: 2,
      issues: [
        { kind: 'empty', severity: 'high', noteId: 'empty-note', title: '待补充的笔记', path: '待补充的笔记' },
        { kind: 'untagged', severity: 'low', noteId: 'untagged-note', title: '未分类笔记', path: '未分类笔记' },
      ],
      recommendations: [
        { code: 'review_empty', count: 1, priority: 'high' },
        { code: 'add_tags', count: 1, priority: 'low' },
      ],
    });
  if (url === '/api/toolbox/project-entry') {
    if (state === 'error') return response(config, {}, 500);
    return response(config, {
      hasProjects: state !== 'empty',
      dismissed: entryDismissed,
      projects: state === 'empty' ? [] : homeWorkspaceFixtures.slice(0, 3),
    });
  }
  if (url === '/api/toolbox/project-entry/dismiss') {
    entryDismissed = true;
    return response(config, { dismissed: true });
  }
  if (url === '/api/search/global') {
    const count = Number(params.get('materials')) || (state === 'empty' ? 0 : 1);
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
    const all = Array.from({ length: count }, (_, i) => ({
      type: ['note', 'bookmark', 'file'][i % 3],
      id: `material-${i}`,
      title: `材料 ${i + 1} · Complete material ${i + 1}`,
      description: 'Fixture',
      tags: [],
    }));
    const matches = all.filter(
      (item) =>
        (!body.types?.length || body.types.includes(item.type)) &&
        (!body.keyword || item.title.toLowerCase().includes(body.keyword.toLowerCase())),
    );
    const start = body.cursor ? Math.max(0, matches.findIndex((item) => item.id === body.cursor.id) + 1) : 0;
    const items = matches.slice(start, start + (body.pageSize || body.limitPerType || 40));
    const last = items.at(-1);
    const hasMore = start + items.length < matches.length;
    return response(config, {
      items,
      groups: [],
      total: matches.length,
      typeTotals: Object.fromEntries(
        ['note', 'bookmark', 'file'].map((type) => [type, matches.filter((item) => item.type === type).length]),
      ),
      hasMore,
      nextCursor:
        hasMore && last
          ? { type: 'all', offset: 0, id: last.id, resourceType: last.type, score: 0, time: '2026-09-08 10:00:00' }
          : null,
    });
  }
  if (state === 'error' && url.startsWith('/api/toolbox/workspaces')) {
    return response(config, { code: 'VISUAL_WORKSPACE_ERROR' }, 500);
  }
  if (url === '/api/toolbox/catalog') {
    if (params.get('catalogState') === 'error') return response(config, { code: 'VISUAL_CATALOG_ERROR' }, 500);
    const definition = getToolboxTool(toolId);
    const definitions = TOOLBOX_TOOL_CATALOG.filter((item) => item.availability.enabled);
    return response(config, {
      ocrUsage: { remainingPages: 50, resetsAt: '2026-09-08T16:00:00Z' },
      ocrPolicy: { maxFiles: 5, maxBytes: 20971520, maxPages: 20, dailyPages: 50 },
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
  const deleteMatch = url.match(/^\/api\/toolbox\/workspaces\/([^/]+)$/);
  if (deleteMatch && String(config.method).toLowerCase() === 'delete') {
    if (params.get('deleteError') === '1') return response(config, { code: 'TOOLBOX_WORKSPACE_DELETE_FAILED' }, 500);
    await new Promise(resolve => setTimeout(resolve, 500));
    const index = listFixture.findIndex(item => item.id === deleteMatch[1]);
    if (index < 0) return response(config, { code: 'TOOLBOX_WORKSPACE_NOT_FOUND' }, 404);
    listFixture.splice(index, 1);
    return response(config, { id: deleteMatch[1] });
  }
  if (url === '/api/toolbox/workspaces' && String(config.method).toLowerCase() === 'get') {
    return response(config, { items: state === 'empty' ? [] : listFixture });
  }
  if (url === '/api/toolbox/workspaces/visual-workspace/board') {
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    const { command, requestId, expectedVersion } = body;
    if (params.get('boardDelay') === '1') await new Promise(resolve => setTimeout(resolve, 800));
    const hash=JSON.stringify({command,expectedVersion});
    const version=workspaceFixture.boardVersion || 0;
    const existing=boardReceipts.get(requestId);
    if(existing && existing.hash!==hash) return response(config,{code:'BOARD_REQUEST_REUSED'},409);
    if(!existing) {
      if(params.get('itemMutation') === 'error') return response(config,{code:'BOARD_OPERATION_FAILED'},500);
      if(params.get('boardConflict') === '1' && version === 0) { workspaceFixture.boardVersion = 1; return response(config,{code:'BOARD_VERSION_CONFLICT'},409); }
      if(expectedVersion!==version) return response(config,{code:'BOARD_VERSION_CONFLICT'},409);
      const before=structuredClone(workspaceFixture.items);
      let focusItemId=null;
      if(command.type==='undo') {
        const receipt=boardReceipts.get(command.undoId);
        if(!receipt||receipt.afterVersion!==version)return response(config,{code:'BOARD_VERSION_CONFLICT'},409);
        workspaceFixture.items=structuredClone(receipt.before);
      } else {
        const applied=applyBoardOperation(workspaceFixture.items,command,{id:crypto.randomUUID(),now:new Date().toISOString()});
        workspaceFixture.items=applied.items;focusItemId=applied.focusItemId;
      }
      workspaceFixture.boardVersion=version+1;
      boardReceipts.set(requestId,{before,afterVersion:version+1,hash,focusItemId});
    }
    workspaceFixture.openItemCount=workspaceFixture.items.filter(x=>x.lane!=='knowledge'&&['open','in_progress'].includes(x.status)).length;
    workspaceFixture.completedItemCount=workspaceFixture.items.filter(x=>x.lane==='action'&&x.status==='done').length;
    const receipt=boardReceipts.get(requestId)!;
    return response(config,{workspace:JSON.parse(JSON.stringify({...workspaceFixture,items:workspaceFixture.items.filter(x=>x.status!=='archived')})),undoId:command.type!=='undo'&&receipt.afterVersion===workspaceFixture.boardVersion?requestId:null,focusItemId:receipt.focusItemId});
  }
  const sourceMatch=url.match(/^\/api\/toolbox\/workspaces\/visual-workspace\/items\/([^/]+)$/);
  if(sourceMatch && String(config.method).toLowerCase()==='get') {
    const item=workspaceFixture.items.find(x=>x.id===sourceMatch[1]);
    return response(config,item||{},item?200:404);
  }
  if (url === '/api/toolbox/workspaces/visual-workspace/items' && String(config.method).toLowerCase() === 'post') {
    const input = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    workspaceFixture.items.push({ ...input, id: `new-${workspaceFixture.items.length}`, status: kind === 'learning' && input.lane === 'knowledge' ? 'done' : 'open', position: workspaceFixture.items.length, createdAt: now, updatedAt: now, completedAt: null });
    return response(config, JSON.parse(JSON.stringify(workspaceFixture)), 201);
  }
  if (params.get('itemMutation') === 'error' && url.includes('/items')) return response(config, { code: 'VISUAL_ITEM_ERROR' }, 500);
  const itemMatch = url.match(/^\/api\/toolbox\/workspaces\/visual-workspace\/items\/([^/]+)$/);
  if (itemMatch && String(config.method).toLowerCase() === 'patch') {
    const item = workspaceFixture.items.find((entry) => entry.id === itemMatch[1]);
    if (item) Object.assign(item, typeof config.data === 'string' ? JSON.parse(config.data) : config.data);
    workspaceFixture.items = workspaceFixture.items.filter((entry) => entry.status !== 'archived');
    return response(config, JSON.parse(JSON.stringify(workspaceFixture)));
  }
  if (url === '/api/toolbox/workspaces/visual-workspace') return response(config, workspaceFixture);
  if (url.startsWith('/api/toolbox/workspaces/')) return response(config, workspaceFixture);
  if (url === '/api/toolbox/workspaces' && String(config.method).toLowerCase() === 'post') {
    return response(config, workspaceFixture, 201);
  }
  if (url === '/api/growth/me') {
    if (quotaCase === 'unavailable') return response(config, {}, 503);
    return response(config, {
      exp: 1200,
      level: 8,
      name: '远行者',
      spaceMb: 2048,
      aiTokenDaily: 0,
      streak: 9,
      points: quotaCase === 'zero' ? 0 : quotaCase === 'large' ? 123456789 : 1342,
      checkedInToday: true,
      levelStartExp: 1000,
      nextLevelExp: 1500,
      expToNext: 300,
      progress: 40,
      isMax: false,
    });
  }
  if (url === '/api/toolbox/home') {
    if (state === 'error') return response(config, { code: 'VISUAL_HOME_ERROR' }, 500);
    return response(config, {
      schemaVersion: 2,
      workspaces: {
        continue: state === 'empty' ? [] : homeWorkspaceFixtures,
        recent: state === 'empty' ? [] : homeWorkspaceFixtures,
      },
      tasks: {
        active: state === 'empty' ? [] : homeTaskFixtures.filter((job) => job.status !== 'succeeded'),
        ready: state === 'empty' ? [] : homeTaskFixtures.filter((job) => job.status === 'succeeded'),
        recent: [],
      },
    });
  }
  if (view === 'desktop' || view === 'mobile') return response(config, {});
  throw Object.assign(new Error(`Unexpected workspace visual fixture request: ${url}`), {
    code: 'VISUAL_FIXTURE_UNEXPECTED_REQUEST',
  });
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/toolbox', name: 'toolboxHome', meta: { mobileShell: 'toolbox' }, component: ToolboxHome },
    {
      path: '/ai-usage',
      name: 'aiUsage',
      component: { render: () => h('p', { 'data-fixture-destination': 'aiUsage' }, 'AI usage destination') },
    },
    {
      path: '/points-usage',
      name: 'pointsUsage',
      component: { render: () => h('p', { 'data-fixture-destination': 'pointsUsage' }, 'Points usage destination') },
    },
    {
      path: '/toolbox/:toolId',
      name: 'toolboxWorkbench',
      meta: { mobileShell: 'toolbox' },
      component: ToolboxWorkbench,
    },
    { path: '/:pathMatch(.*)*', component: { render: () => null } },
  ],
});
// Memory history lacks browser back metadata; mirror it for the shared return guard.
router.afterEach((_to, from) => {
  router.options.history.state.back = from.fullPath;
});
await router.push(
  view === 'home'
    ? { path: '/toolbox', query: params.get('tab') === 'catalog' ? { view: 'catalog' } : {} }
    : { path: `/toolbox/${toolId}`, query: view === 'detail' ? { workspace: 'visual-workspace' } : {} },
);

const pinia = createPinia();
const app = createApp({
  setup() {
    const { joinProject } = useProjectResourceAction();
    return () =>
      h('div', { style: { height: '100%', minHeight: '0' } }, [
        view === 'desktop'
          ? h(DesktopWorkbenchView)
          : view === 'mobile'
            ? h(MobileTodayView)
            : view === 'entry'
              ? h(WorkshopProjectEntry)
              : view === 'join'
                ? h(
                    BButton,
                    {
                      onClick: () => joinProject([{ type: 'note', id: 'visual-note', title: '明确选择的一篇父笔记' }]),
                    },
                    () => '加入项目验收',
                  )
                : h(RouterView),
        h(ResourceProjectHost),
      ]);
  },
});
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
  role: params.get('account') === 'guest' ? RoleEnum.VISITOR : RoleEnum.USER,
  userName: '视觉验收用户',
  alias: '视觉验收用户',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
globalDirect(app);
app.mount('#app');
