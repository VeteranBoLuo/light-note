import { createApp, defineComponent } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { InternalAxiosRequestConfig } from 'axios';
import type { AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
import globalDirect from '@/config/globalDirect';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import BookmarkAiHarness from './BookmarkAiHarness.vue';

type VisualState = 'success' | 'loading' | 'error' | 'empty';

const params = new URLSearchParams(window.location.search);
const requestedState = params.get('state');
const state: VisualState = ['success', 'loading', 'error', 'empty'].includes(String(requestedState))
  ? (requestedState as VisualState)
  : 'success';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', window.innerWidth <= 600);
document.body.dataset.visualState = state;

function parsePayload(value: unknown) {
  if (typeof value !== 'string') return (value || {}) as Record<string, unknown>;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function completedResponse(payload: Record<string, unknown>): AiSkillResponse {
  const hasSource = state !== 'empty';
  return {
    protocolVersion: 1,
    requestId: String(payload.requestId),
    skillId: 'bookmark.summarize_page',
    skillVersion: 1,
    status: 'completed',
    threadId: null,
    scopeDigest: null,
    result: {
      kind: 'grounded_markdown',
      content: hasSource
        ? '## 页面要点\n\n这份设计规范说明了组件复用、主题适配与移动端回退策略。[1]\n\n- 交互控件统一复用 B 系列组件\n- 关键状态同时使用实色描边或图标表达\n- PC 与移动端都要覆盖浅色和深色主题'
        : '当前书签没有可用于总结的网页存档或可靠元数据，请先刷新书签存档后重试。',
    },
    sources: hasSource ? [{ sourceId: 'bookmark:visual-bookmark', title: 'Light Note AI 设计规范' }] : [],
    coverage: {
      complete: hasSource,
      warnings: hasSource ? [] : ['bookmark_content_unavailable:bookmark:visual-bookmark'],
    },
    availableActions: [],
    receipt: { resourceCount: 1, modelCalled: hasSource, writeCommitted: false },
    error: null,
  };
}

function axiosResponse(config: InternalAxiosRequestConfig, data: unknown) {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: null,
  };
}

request.defaults.adapter = async (config) => {
  if (config.url === '/api/common/recordAiEvent') {
    return axiosResponse(config, { status: 200, msg: 'ok', data: null });
  }
  if (config.url === '/api/ai/skills/config') {
    return axiosResponse(config, {
      status: 200,
      msg: 'ok',
      data: {
        protocolVersion: 1,
        kernelEnabled: true,
        skills: { bookmark: true },
        archive: { readonly: true },
        availableSkills: [{ id: 'bookmark.summarize_page', version: 1, domain: 'bookmark', effect: 'read' }],
      },
    });
  }
  if (config.url === '/api/ai/skills/execute') {
    if (state === 'loading') await new Promise(() => {});
    if (state === 'error') {
      throw Object.assign(new Error('暂时无法读取该书签的网页存档，请稍后重试。'), {
        code: 'BOOKMARK_CONTENT_UNAVAILABLE',
        config,
      });
    }
    return axiosResponse(config, {
      status: 200,
      msg: 'ok',
      data: completedResponse(parsePayload(config.data)),
    });
  }
  if (config.url === '/api/note/addNote') {
    document.body.dataset.noteCreated = 'true';
    return axiosResponse(config, { status: 200, msg: 'ok', data: { id: 'visual-note' } });
  }
  throw Object.assign(new Error(`Unexpected visual fixture request: ${config.url || ''}`), {
    code: 'VISUAL_FIXTURE_UNEXPECTED_REQUEST',
    config,
  });
};

const EmptyRoute = defineComponent({ template: '<span class="bookmark-ai-harness__route" aria-hidden="true"></span>' });
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: EmptyRoute },
    { path: '/noteLibrary/:id', component: EmptyRoute },
  ],
});
await router.push('/');
await router.isReady();

const app = createApp(BookmarkAiHarness);
app.use(createPinia());
app.use(router);
app.use(
  createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'zh-CN',
    messages: { 'zh-CN': zhCN, 'en-US': enUS },
  }),
);
globalDirect(app);
app.mount('#app');
