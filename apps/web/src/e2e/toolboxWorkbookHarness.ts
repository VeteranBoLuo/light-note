import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import type {
  ProductionProjectDto,
  ProductionProjectRevisionDto,
  ProductionWorkbookContentV1,
} from '@lightnote/shared/production-project-protocol';
import globalDirect from '@/config/globalDirect';
import { RoleEnum } from '@/config/bookmarkCfg';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { useUserStore } from '@/store';
import ToolboxWorkbookProjects from '@/view/toolbox/ToolboxWorkbookProjects.vue';
import ToolboxWorkbookProjectEditor from '@/view/toolbox/ToolboxWorkbookProjectEditor.vue';
import '@/assets/css/index.less';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const view = params.get('view') === 'list' ? 'list' : 'editor';
const scenario = params.get('scenario') || 'base';
const now = '2026-08-30T10:30:00.000Z';

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', window.innerWidth <= 767);
document.body.dataset.visualState = `${view}-${theme}`;

const workbookFixture: ProductionWorkbookContentV1 = {
  type: 'workbook',
  schemaVersion: 1,
  sheets: [
    {
      id: 'budget',
      name: locale === 'zh-CN' ? '预算' : 'Budget',
      cells: {
        A1: { value: locale === 'zh-CN' ? '类别' : 'Category' },
        B1: { value: locale === 'zh-CN' ? '预算' : 'Planned' },
        C1: { value: locale === 'zh-CN' ? '实际' : 'Actual' },
        D1: { value: locale === 'zh-CN' ? '差额' : 'Variance' },
        A2: { value: locale === 'zh-CN' ? '软件与服务' : 'Software and services' },
        B2: { value: 1200 },
        C2: { value: 860 },
        D2: { value: 340, formula: 'B2-C2' },
        A3: { value: locale === 'zh-CN' ? '内容与推广' : 'Content and marketing' },
        B3: { value: 2000 },
        C3: { value: 1550 },
        D3: { value: 450, formula: 'B3-C3' },
        A5: { value: locale === 'zh-CN' ? '合计' : 'Total' },
        B5: { value: 3200, formula: 'SUM(B2:B4)' },
        C5: { value: 2410, formula: 'SUM(C2:C4)' },
        D5: { value: 790, formula: 'B5-C5' },
        AB120: { value: locale === 'zh-CN' ? '跨过 Z 列仍可达' : 'Reachable beyond column Z' },
        AZ900: { value: locale === 'zh-CN' ? '稀疏远端数据' : 'Sparse remote data' },
      },
      extensions: {},
    },
    {
      id: 'records',
      name: locale === 'zh-CN' ? '记录' : 'Records',
      cells: {
        A1: { value: locale === 'zh-CN' ? '日期' : 'Date' },
        B1: { value: locale === 'zh-CN' ? '说明' : 'Description' },
      },
      extensions: {},
    },
  ],
  activeSheetId: 'budget',
  extensions: {},
};

if (scenario === 'csv-limit') {
  workbookFixture.sheets[0]!.cells.XFD1048576 = {
    value: locale === 'zh-CN' ? 'Excel 最后一个单元格' : 'Final Excel cell',
  };
}

let projectFixture: ProductionProjectDto = {
  id: `visual-workbook-${scenario}`,
  projectType: 'workbook',
  title: locale === 'zh-CN' ? '年度预算与实际支出' : 'Annual budget and actuals',
  metadata: {
    description: '',
    tags: [],
    locale,
    templateId: 'workbook-budget',
    coverResourceId: null,
    extensions: {},
  },
  status: 'active',
  version: 3,
  currentRevision: 3,
  currentRevisionId: 'visual-revision-3',
  lastOpenedAt: now,
  createdAt: '2026-08-28T08:00:00.000Z',
  updatedAt: now,
  trashedAt: null,
};

let revisionFixture: ProductionProjectRevisionDto = {
  id: 'visual-revision-3',
  projectId: projectFixture.id,
  projectType: 'workbook',
  revision: 3,
  changeKind: 'autosave',
  label: null,
  content: workbookFixture,
  sourceRevisionId: null,
  createdAt: now,
};

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

function requestBody(config: { data?: unknown }) {
  if (typeof config.data !== 'string') return (config.data || {}) as Record<string, unknown>;
  return JSON.parse(config.data) as Record<string, unknown>;
}

request.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  const method = String(config.method || 'get').toLocaleLowerCase();
  if (url === '/api/toolbox/projects' && method === 'get') {
    return response(config, { items: [projectFixture] });
  }
  if (url === '/api/toolbox/projects' && method === 'post') {
    const input = requestBody(config);
    projectFixture = {
      ...projectFixture,
      title: String(input.title || projectFixture.title),
      metadata: { ...projectFixture.metadata, ...((input.metadata || {}) as ProductionProjectDto['metadata']) },
      version: 1,
      currentRevision: 1,
      currentRevisionId: 'visual-revision-1',
    };
    revisionFixture = {
      ...revisionFixture,
      id: 'visual-revision-1',
      revision: 1,
      changeKind: input.changeKind === 'import' ? 'import' : 'create',
      content: input.content as ProductionWorkbookContentV1,
    };
    return response(config, { project: projectFixture, revision: revisionFixture, resources: [] }, 201);
  }
  if (url.endsWith('/revisions') && method === 'get') {
    return response(config, {
      items: [
        {
          id: revisionFixture.id,
          projectId: projectFixture.id,
          projectType: 'workbook',
          revision: revisionFixture.revision,
          changeKind: revisionFixture.changeKind,
          label: locale === 'zh-CN' ? '预算结构确认' : 'Budget structure confirmed',
          sourceRevisionId: null,
          createdAt: now,
        },
      ],
    });
  }
  if (url.endsWith('/revisions') && method === 'post') {
    const input = requestBody(config);
    projectFixture = {
      ...projectFixture,
      version: projectFixture.version + 1,
      currentRevision: projectFixture.currentRevision + 1,
      currentRevisionId: `visual-revision-${projectFixture.currentRevision + 1}`,
      updatedAt: now,
    };
    revisionFixture = {
      ...revisionFixture,
      id: projectFixture.currentRevisionId,
      revision: projectFixture.currentRevision,
      changeKind: String(input.changeKind || 'autosave') as ProductionProjectRevisionDto['changeKind'],
      label: input.label == null ? null : String(input.label),
      content: input.content as ProductionWorkbookContentV1,
    };
    return response(config, { project: projectFixture, revision: revisionFixture, resources: [] }, 201);
  }
  if (url.includes('/revisions/') && url.endsWith('/restore') && method === 'post') {
    return response(config, { project: projectFixture, revision: revisionFixture, resources: [] }, 201);
  }
  if (url.endsWith('/open') && method === 'post') return response(config, projectFixture);
  if (url === `/api/toolbox/projects/${projectFixture.id}` && method === 'patch') {
    const input = requestBody(config);
    projectFixture = {
      ...projectFixture,
      title: input.title == null ? projectFixture.title : String(input.title),
      version: projectFixture.version + 1,
    };
    return response(config, projectFixture);
  }
  if (url === `/api/toolbox/projects/${projectFixture.id}` && method === 'get') {
    return response(config, { project: projectFixture, revision: revisionFixture, resources: [] });
  }
  throw Object.assign(new Error(`Unexpected workbook visual fixture request: ${method} ${url}`), {
    code: 'VISUAL_FIXTURE_UNEXPECTED_REQUEST',
  });
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/toolbox',
      name: 'toolboxHome',
      component: { render: () => h('div', 'Toolbox') },
      meta: { mobileShell: 'toolbox' },
    },
    {
      path: '/toolbox/project/workbooks',
      name: 'toolboxWorkbookProjects',
      component: ToolboxWorkbookProjects,
      meta: { mobileShell: 'toolbox' },
    },
    {
      path: '/toolbox/project/workbooks/:projectId',
      name: 'toolboxWorkbookProject',
      component: ToolboxWorkbookProjectEditor,
      meta: { mobileShell: 'toolbox' },
    },
  ],
});
await router.push(
  view === 'list'
    ? { name: 'toolboxWorkbookProjects' }
    : { name: 'toolboxWorkbookProject', params: { projectId: projectFixture.id } },
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
globalDirect(app);
app.mount('#app');
