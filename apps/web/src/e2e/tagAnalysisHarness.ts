import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import type { InternalAxiosRequestConfig } from 'axios';
import type { AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
import globalDirect from '@/config/globalDirect';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import TagAnalysisHarness from './TagAnalysisHarness.vue';

type VisualState = 'success' | 'partial' | 'loading' | 'error' | 'empty';

const params = new URLSearchParams(window.location.search);
const requestedState = params.get('state');
const state: VisualState = ['success', 'partial', 'loading', 'error', 'empty'].includes(String(requestedState))
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
  const empty = state === 'empty';
  const partial = state === 'partial';
  return {
    protocolVersion: 1,
    requestId: String(payload.requestId),
    skillId: 'tag.analyze',
    skillVersion: 1,
    status: 'completed',
    threadId: null,
    scopeDigest: null,
    result: {
      kind: 'grounded_markdown',
      content: empty
        ? '当前标签下没有可供分析的可靠正文。'
        : '## 整体结论\n\n当前资料主要围绕图标资源、开放 API 与开发工具展开，形成了“素材获取—接口接入—开发验证”的工作链路。[1]\n\n## 重要发现\n\n- 图标资源覆盖检索、下载和站点图标生成。[1]\n- API 资料适合进一步按认证方式和调用场景整理。[2]\n- 建议把重复工具合并，并为缺少正文的书签补充网页存档。[3]',
    },
    sources: empty
      ? []
      : [
          { sourceId: 'bookmark:1', title: '图标资源' },
          { sourceId: 'note:2', title: 'API 接入说明' },
          { sourceId: 'file:3', title: '开发工具清单' },
        ],
    coverage: {
      complete: !partial && !empty,
      warnings: partial
        ? [
            'bookmark_page_content_unavailable:bookmark:4',
            'resource_content_truncated:note:5',
            'file_not_parsed:file:6',
          ]
        : empty
          ? ['note_empty:note:1']
          : [],
      requestedResources: 46,
      analyzedResources: empty ? 0 : partial ? 43 : 46,
      unreadableResources: empty ? 46 : partial ? 3 : 0,
      metadataOnlyResources: partial ? 5 : 0,
      truncatedResources: partial ? 2 : 0,
      strategy: 'direct',
      batchCount: 1,
    },
    availableActions: [],
    receipt: { resourceCount: 46, modelCalled: !empty, writeCommitted: false },
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
        skills: { tag: true },
        archive: { readonly: true },
        availableSkills: [{ id: 'tag.analyze', version: 1, domain: 'tag', effect: 'read' }],
      },
    });
  }
  if (config.url === '/api/ai/skills/execute') {
    if (state === 'loading') await new Promise(() => {});
    if (state === 'error') {
      throw Object.assign(new Error('AI 服务暂时无法处理本次材料，请稍后重试。'), {
        code: 'AI_PROVIDER_REQUEST_INVALID',
        config,
      });
    }
    return axiosResponse(config, {
      status: 200,
      msg: 'ok',
      data: completedResponse(parsePayload(config.data)),
    });
  }
  throw Object.assign(new Error(`Unexpected visual fixture request: ${config.url || ''}`), {
    code: 'VISUAL_FIXTURE_UNEXPECTED_REQUEST',
    config,
  });
};

const app = createApp(TagAnalysisHarness);
app.use(createPinia());
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
