import { h } from 'vue';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import globalDirect from '@/config/globalDirect';
import { RoleEnum } from '@/config/bookmarkCfg';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { bookmarkStore, useUserStore } from '@/store';
import ToolboxTask from '@/view/toolbox/ToolboxTask.vue';
import '@/assets/css/index.less';

const params = new URLSearchParams(window.location.search);
const state = ['queued', 'retrying', 'processing', 'success', 'partial', 'failed'].includes(params.get('state') || '')
  ? String(params.get('state'))
  : 'partial';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const now = new Date('2026-08-29T01:20:00+08:00').toISOString();

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', window.innerWidth <= 600);
document.body.dataset.visualState = state;

function jobFixture() {
  const terminal = ['success', 'partial', 'failed'].includes(state);
  const status =
    state === 'success'
      ? 'succeeded'
      : state === 'partial'
        ? 'partial_succeeded'
        : state === 'failed'
          ? 'failed'
          : state === 'retrying'
            ? 'queued'
            : state;
  return {
    id: 'visual-toolbox-job',
    toolId: 'research_brief',
    status,
    stage:
      state === 'queued'
        ? 'queued'
        : state === 'retrying'
          ? 'retrying'
          : state === 'processing'
            ? 'generating'
            : state === 'failed'
              ? 'failed'
              : 'completed',
    billing: {
      medium: 'points',
      status: terminal ? (state === 'failed' ? 'released' : 'settled') : 'reserved',
      quotedPoints: 28,
      actualPoints: state === 'failed' ? 0 : state === 'partial' ? 20 : terminal ? 28 : 0,
      refundedPoints: state === 'failed' ? 28 : state === 'partial' ? 8 : 0,
    },
    save: { status: 'unsaved' },
    error:
      state === 'failed'
        ? { code: 'TOOLBOX_PROVIDER_FAILED', message: '工具任务处理失败，系统将自动重试' }
        : state === 'retrying'
          ? { code: 'AI_GATEWAY_TIMEOUT', message: '遇到临时问题，正在自动重试；无需重新提交任务。' }
          : null,
    artifact:
      state === 'success' || state === 'partial'
        ? {
            id: 'visual-toolbox-artifact',
            type: 'research_brief',
            title: '小团队知识库方案研究简报',
            contentType: 'markdown',
            version: 1,
          }
        : null,
    artifactState: state === 'success' || state === 'partial' ? 'ready' : 'none',
    canCancel: state === 'queued',
    createdAt: now,
    updatedAt: now,
    startedAt: state === 'queued' ? null : now,
    completedAt: terminal ? now : null,
  };
}

function artifactFixture() {
  const partial = state === 'partial';
  return {
    id: 'visual-toolbox-artifact',
    jobId: 'visual-toolbox-job',
    toolId: 'research_brief',
    type: 'research_brief',
    version: 1,
    title: '小团队知识库方案研究简报',
    content: [
      '> 草稿已生成 · 待核验',
      '',
      '# 核心判断',
      '',
      '对于十人以内、重视部署可控性的团队，优先选择维护成本可预测的方案 [1]。如果更看重协作生态，再评估托管服务 [2]。',
      '',
      '## 判断依据',
      '',
      '- 自托管方案的数据边界更清晰，但需要承担升级与备份成本。[1]',
      '- 托管方案上线更快，但长期成本与数据迁移能力需要单独核验。[2] [3]',
      '',
      '> 建议先用两周试点验证权限、检索质量和导出能力。',
      '',
      '代码示例中的 `rows[1]` 应继续保留。',
    ].join('\n'),
    contentType: 'markdown',
    sources: [
      {
        id: 'note:note-a',
        resourceType: 'note',
        resourceId: 'note-a',
        title: '自建知识库评估记录',
        excerpt: '记录了部署、人力、备份和权限模型的评估结论。',
        locator: { type: 'section', value: '部署与维护成本' },
        coverage: { complete: true, status: 'ready', includedChars: 1680, warnings: [] },
      },
      {
        id: 'bookmark:bookmark-b',
        resourceType: 'bookmark',
        resourceId: 'bookmark-b',
        title: '协作平台产品说明',
        excerpt: '书签保存了标题、网址与摘要，但未保存完整网页正文。',
        locator: { type: 'metadata', value: '书签信息' },
        coverage: {
          complete: false,
          status: 'metadata_only',
          includedChars: 426,
          warnings: ['bookmark_page_content_unavailable'],
        },
      },
      {
        id: 'file:file-c',
        resourceType: 'file',
        resourceId: 'file-c',
        title: '迁移成本清单.pdf',
        excerpt: '列出了导出、附件迁移和权限重建的检查项。',
        locator: { root: '/private/internal/path', fileName: 'source.pdf' },
        coverage: { complete: true, status: 'ready', includedChars: 932, warnings: [] },
      },
    ],
    coverage: {
      complete: !partial,
      requestedResources: partial ? 4 : 3,
      representedResources: 3,
      warnings: partial
        ? [
            'bookmark_page_content_unavailable:bookmark:bookmark-b',
            'file_parsing_in_progress:file:4f1f4a77-2b93-46f7-8fd0-bf4277e120ee',
          ]
        : [],
      resources: [
        {
          type: 'note',
          id: 'note-a',
          title: '自建知识库评估记录',
          status: 'ready',
          includedChars: 1680,
          warnings: [],
          coverageComplete: true,
        },
        {
          type: 'bookmark',
          id: 'bookmark-b',
          title: '协作平台产品说明',
          status: partial ? 'metadata_only' : 'ready',
          includedChars: 426,
          warnings: partial ? ['bookmark_page_content_unavailable'] : [],
          coverageComplete: !partial,
        },
        {
          type: 'file',
          id: 'file-c',
          title: '迁移成本清单.pdf',
          status: 'ready',
          includedChars: 932,
          warnings: [],
          coverageComplete: true,
        },
        ...(partial
          ? [
              {
                type: 'file',
                id: '4f1f4a77-2b93-46f7-8fd0-bf4277e120ee',
                title: '试点反馈汇总.pdf',
                status: 'parsing',
                includedChars: 0,
                warnings: ['file_parsing_in_progress'],
                coverageComplete: false,
              },
            ]
          : []),
      ],
    },
    meta: { draftState: 'needs_verification', sourceCount: 3 },
    save: { status: 'unsaved' },
    createdAt: now,
    expiresAt: new Date('2026-11-27T01:20:00+08:00').toISOString(),
  };
}

function response(config: any, data: unknown) {
  return {
    data: { status: 200, msg: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: null,
  };
}

request.defaults.adapter = async (config) => {
  if (config.url === '/api/toolbox/jobs/visual-toolbox-job') return response(config, jobFixture());
  if (config.url === '/api/toolbox/artifacts/visual-toolbox-artifact') return response(config, artifactFixture());
  if (config.url === '/api/toolbox/artifacts/visual-toolbox-artifact/save') {
    return response(config, { status: 'saved', targetType: 'note', targetId: 'visual-note', idempotent: false });
  }
  if (config.url === '/api/growth/me') {
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
  throw Object.assign(new Error(`Unexpected toolbox visual fixture request: ${config.url || ''}`), {
    code: 'VISUAL_FIXTURE_UNEXPECTED_REQUEST',
  });
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/toolbox/task/:jobId', component: ToolboxTask },
    { path: '/:pathMatch(.*)*', component: { render: () => null } },
  ],
});
await router.push('/toolbox/task/visual-toolbox-job');

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
