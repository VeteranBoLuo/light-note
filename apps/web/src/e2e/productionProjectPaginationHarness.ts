import { createApp, defineComponent, h, ref } from 'vue';
import { createI18n } from 'vue-i18n';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { ProductionProjectType } from '@lightnote/shared/production-project-protocol';
import globalDirect from '@/config/globalDirect';
import { RoleEnum } from '@/config/bookmarkCfg';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { bookmarkStore, useUserStore } from '@/store';
import ToolboxDocumentProjects from '@/view/toolbox/ToolboxDocumentProjects.vue';
import ToolboxPresentationProjects from '@/view/toolbox/ToolboxPresentationProjects.vue';
import ToolboxWorkbookProjects from '@/view/toolbox/ToolboxWorkbookProjects.vue';
import ToolboxProjectVersions from '@/view/toolbox/components/ToolboxProjectVersions.vue';
import type { ToolboxProjectRevisionSummary, ToolboxProjectSummary } from '@/api/toolboxProjects';
import '@/assets/css/index.less';

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const state = ['populated', 'empty', 'error'].includes(params.get('state') || '')
  ? String(params.get('state'))
  : 'populated';
const studio = ['document', 'presentation', 'workbook', 'versions'].includes(params.get('studio') || '')
  ? String(params.get('studio'))
  : 'document';
const projectType = (studio === 'versions' ? 'document' : studio) as ProductionProjectType;

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle(
  'light-note-mobile-rendering',
  params.get('renderProfile') === 'mobile' || window.innerWidth <= 767,
);
document.body.dataset.visualState = `${studio}-${state}-${theme}`;

function projectFixture(index: number, type: ProductionProjectType): ToolboxProjectSummary {
  const copy = {
    document: ['产品策略文档', '研究纪要', '发布说明'],
    presentation: ['季度复盘演示', '产品提案', '研究汇报'],
    workbook: ['经营分析工作簿', '项目预算', '实验数据'],
  }[type];
  return {
    id: `${type}-project-${String(index).padStart(2, '0')}`,
    projectType: type,
    title: `${copy[index % copy.length]} ${index}`,
    metadata: {
      description: '',
      tags: [],
      locale: null,
      templateId: null,
      coverResourceId: null,
      extensions: {},
    },
    status: 'active',
    currentRevision: index + 4,
    currentRevisionId: `${type}-revision-${index + 4}`,
    version: index + 4,
    lastOpenedAt: '2026-08-30T10:30:00.000Z',
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: new Date(Date.UTC(2026, 7, 30, 10, 30 - index)).toISOString(),
    trashedAt: null,
  };
}

function revisionFixture(revision: number): ToolboxProjectRevisionSummary {
  return {
    id: `revision-${revision}`,
    projectId: 'visual-project',
    projectType: 'document',
    revision,
    changeKind: revision % 7 === 0 ? 'named' : 'autosave',
    label: revision === 5 ? '正式发布前确认版' : revision % 7 === 0 ? `里程碑 ${revision}` : null,
    sourceRevisionId: null,
    createdAt: new Date(Date.UTC(2026, 7, 30, 10, revision)).toISOString(),
    contentHash: `${revision}`.padStart(64, '0'),
  };
}

function response(config: any, data: unknown, status = 200) {
  return {
    data: { status, msg: status === 200 ? 'ok' : 'fixture error', data },
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {},
    config,
    request: null,
  };
}

request.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  if (url === '/api/toolbox/projects' && String(config.method).toLowerCase() === 'get') {
    if (state === 'error') return response(config, { code: 'VISUAL_PROJECT_ERROR' }, 500);
    if (state === 'empty') return response(config, { items: [], nextCursor: null });
    const type = String(config.params?.type || projectType) as ProductionProjectType;
    const cursor = String(config.params?.cursor || '');
    if (cursor) {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      return response(config, {
        items: Array.from({ length: 5 }, (_, index) => projectFixture(index + 25, type)),
        nextCursor: null,
      });
    }
    return response(config, {
      items: Array.from({ length: 24 }, (_, index) => projectFixture(index + 1, type)),
      nextCursor: `${type}-page-2`,
    });
  }
  if (url === '/api/growth/me') return response(config, {});
  throw Object.assign(new Error(`Unexpected production project visual fixture request: ${url}`), {
    code: 'VISUAL_FIXTURE_UNEXPECTED_REQUEST',
  });
};

const listComponents = {
  document: ToolboxDocumentProjects,
  presentation: ToolboxPresentationProjects,
  workbook: ToolboxWorkbookProjects,
};

const VersionHarness = defineComponent({
  setup() {
    const revisions = ref(Array.from({ length: 30 }, (_, index) => revisionFixture(35 - index)));
    const loadingMore = ref(false);
    const hasMore = ref(true);
    async function loadMore() {
      if (loadingMore.value || !hasMore.value) return;
      loadingMore.value = true;
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      revisions.value.push(...Array.from({ length: 5 }, (_, index) => revisionFixture(5 - index)));
      hasMore.value = false;
      loadingMore.value = false;
    }
    return () =>
      h('main', { class: 'pagination-version-harness' }, [
        h('section', { class: 'pagination-version-harness__panel' }, [
          h(ToolboxProjectVersions, {
            items: revisions.value,
            loading: false,
            hasMore: hasMore.value,
            loadingMore: loadingMore.value,
            error: false,
            naming: false,
            currentRevision: 35,
            restoringRevision: null,
            onLoadMore: loadMore,
          }),
        ]),
      ]);
  },
});

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/visual', component: { render: () => null } },
    {
      path: '/toolbox/project/documents/:projectId',
      name: 'toolboxDocumentProject',
      component: { render: () => null },
    },
    {
      path: '/toolbox/project/presentations/:projectId',
      name: 'toolboxPresentationProject',
      component: { render: () => null },
    },
    {
      path: '/toolbox/project/workbooks/:projectId',
      name: 'toolboxWorkbookProject',
      component: { render: () => null },
    },
    { path: '/toolbox', name: 'toolbox', component: { render: () => null } },
  ],
});
await router.push('/visual');

const pinia = createPinia();
const selected = studio === 'versions' ? VersionHarness : listComponents[projectType];
const app = createApp({ render: () => h(selected) });
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

const style = document.createElement('style');
style.textContent = `
  .pagination-version-harness {
    min-height: 100vh;
    padding: 32px;
    color: var(--text-color);
    background: var(--background-color);
  }
  .pagination-version-harness__panel {
    width: min(440px, 100%);
    height: min(760px, calc(100vh - 64px));
    margin: 0 auto;
    padding: 18px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--surface-panel-bg, var(--background-color));
  }
  @media (max-width: 600px) {
    .pagination-version-harness { padding: 0; }
    .pagination-version-harness__panel {
      width: 100%;
      height: 100vh;
      border: 0;
      border-radius: 0;
    }
  }
`;
document.head.append(style);
