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
import AiImageRecognitionHarness from './AiImageRecognitionHarness.vue';

type VisualState = 'success' | 'fallback' | 'uncertain' | 'fallback-uncertain' | 'loading' | 'error';

const params = new URLSearchParams(window.location.search);
const requestedState = params.get('state');
const state: VisualState = ['success', 'fallback', 'uncertain', 'fallback-uncertain', 'loading', 'error'].includes(
  String(requestedState),
)
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

function warningsForState(): string[] {
  if (state === 'fallback') return ['image_recognition_fallback:file:visual-image'];
  if (state === 'uncertain') return ['image_recognition_uncertain:file:visual-image'];
  if (state === 'fallback-uncertain') {
    return ['image_recognition_fallback:file:visual-image', 'image_recognition_uncertain:file:visual-image'];
  }
  return [];
}

function completedResponse(payload: Record<string, unknown>): AiSkillResponse {
  const warnings = warningsForState();
  const usedLocalOcr = warnings.some((warning) => warning.startsWith('image_recognition_fallback:'));
  return {
    protocolVersion: 1,
    requestId: String(payload.requestId),
    skillId: 'file.summarize',
    skillVersion: 1,
    status: 'completed',
    threadId: null,
    scopeDigest: null,
    result: {
      kind: 'grounded_markdown',
      content:
        '## 文件总结\n\n识别到机动车行驶证主页，包含号牌号码、车辆类型、所有人、车辆识别代号和注册日期等字段。请对照原图核验敏感信息。',
    },
    sources: [{ sourceId: 'file:visual-image', title: '行驶证主页.jpg' }],
    coverage: { complete: warnings.length === 0, warnings },
    availableActions: [],
    receipt: {
      resourceCount: 1,
      modelCalled: !usedLocalOcr,
      writeCommitted: false,
    },
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
        skills: { file: true },
        archive: { readonly: true },
        availableSkills: [{ id: 'file.summarize', version: 1, domain: 'file', effect: 'read' }],
      },
    });
  }
  if (config.url === '/api/ai/skills/execute') {
    if (state === 'loading') await new Promise(() => {});
    if (state === 'error') {
      throw Object.assign(new Error('高精度识图与本地 OCR 均暂时不可用，请稍后重试。'), {
        code: 'IMAGE_RECOGNITION_UNAVAILABLE',
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

const app = createApp(AiImageRecognitionHarness);
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
