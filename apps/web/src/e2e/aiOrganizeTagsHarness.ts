import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import globalDirect from '@/config/globalDirect';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import AiOrganizeTagsHarness from './AiOrganizeTagsHarness.vue';

type VisualState = 'mixed' | 'existing';

const params = new URLSearchParams(window.location.search);
const state: VisualState = params.get('state') === 'existing' ? 'existing' : 'mixed';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const resourceType = params.get('resourceType') === 'note' ? 'note' : 'bookmark';

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', window.innerWidth <= 720);
document.body.dataset.visualState = state;

function response(config: any, data: any) {
  return Promise.resolve({
    data: { status: 200, msg: '', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: {},
  });
}

request.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  if (url.endsWith('/api/bookmark/ai/organize/quote')) {
    return response(config, {
      candidateTotal: 1,
      batchCap: 1,
      batchIds: ['visual-bookmark-1'],
      canRun: true,
      requestIds: [],
      requestedTotal: 0,
    });
  }
  if (url.endsWith('/api/bookmark/ai/organize/run')) {
    return response(config, {
      ok: true,
      partial: false,
      failedItems: 0,
      processed: 1,
      suggestions: [
        {
          id: 'visual-bookmark-1',
          url: 'https://example.com/knowledge-graph',
          currentName: resourceType === 'note' ? '知识图谱整理方法' : '知识图谱实践指南',
          currentDesc: '',
          suggestName: '',
          suggestDesc: '',
          matchedTags: [{ id: 'tag-ai', name: '人工智能' }],
          newTags: state === 'mixed' ? ['知识图谱', '语义检索'] : [],
        },
      ],
    });
  }
  return response(config, { ok: true });
};

const app = createApp(AiOrganizeTagsHarness, { resourceType });
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

let attempts = 0;
function enterReviewState() {
  const startButton = [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    button.textContent?.includes(locale === 'zh-CN' ? '开始打标签' : 'Start tagging'),
  );
  if (startButton) {
    startButton.click();
    return;
  }
  attempts += 1;
  if (attempts < 60) window.setTimeout(enterReviewState, 50);
}

window.setTimeout(enterReviewState, 0);
