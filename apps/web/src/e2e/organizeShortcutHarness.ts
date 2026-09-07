import { createApp, defineComponent, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { useResourceSelection, useResourceSelectionRuntime } from '@/composables/useResourceSelection';
import { bookmarkStore } from '@/store';
import Workspace from '@/view/organize/OrganizeSuggestionWorkspace.vue';
import Center from '@/view/organize/OrganizeCenter.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import type { RunOptions, SuggestionRun } from '@/api/organizeSuggestionApi';
import '@/assets/css/index.less';

// 本地验收只使用固定资料和内存响应，不访问数据库或模型。
const params = new URLSearchParams(location.search);
const counters = ref({ previews: 0, starts: 0 });
const type = params.get('type') === 'bookmark' ? 'bookmark' : 'note';
const state = params.get('state') || 'success';
const resources = Array.from({ length: 25 }, (_, i) => ({ type, id: String(i), title: `验收资料 ${i + 1}` }));
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
let run: SuggestionRun | null = null;
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
  let data: unknown = [];
  if (url.endsWith('/batchSelectionPreview')) data = { resolvedItems: resources, unavailableItems: [] };
  else if (url.endsWith('/previews')) {
    counters.value.previews++;
    await new Promise((resolve) => setTimeout(resolve, state === 'loading' ? 5000 : 100));
    if (state === 'error' && counters.value.previews === 1) throw new Error('范围确认暂不可用，请重试');
    run = {
      id: 'fixture-run',
      status: 'preview',
      options: body as RunOptions,
      summary: {
        total: state === 'empty' ? 0 : 25,
        types: { [type]: state === 'empty' ? 0 : 25 },
        ruleTotal: null,
        aiTotal: null,
        skipped: 0,
        files: { parsed: 0, metadata: 0 },
        estimatedTokensLower: null,
        estimatedTokensUpper: null,
        aiEnabled: true,
      },
    };
    data = run;
  } else if (url.endsWith('/start')) {
    counters.value.starts++;
    run = { ...run!, status: 'completed' };
    data = run;
  } else if (url.endsWith('/runs')) data = run?.status === 'completed' ? [run] : [];
  else if (url.includes('/runs/'))
    data = {
      ...run,
      items: [
        {
          id: 'fixture-item',
          resource: { ...resources[0], tags: [{ id: 'old', name: '已有标签' }], source: { folder: '' }, guards: {} },
          aiStatus: 'completed',
          ruleStatus: 'completed',
          suggestions: [
            {
              id: 'suggestion',
              kind: 'tags',
              status: 'pending',
              before: [{ id: 'old', name: '已有标签' }],
              after: [{ id: 'new', name: '开发工具' }],
              reason: '根据资料内容建议的核心主题标签',
            },
          ],
        },
      ],
      nextCursor: null,
    };
  else if (url.includes('resolve')) data = { items: resources };
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, data } };
};
const Source = defineComponent({
  setup() {
    const visible = ref(resources.slice(0, 12));
    const selection = useResourceSelection(type === 'note' ? 'notes' : 'bookmarks', visible, type);
    selection.mode.value = true;
    selection.selectVisible(true);
    visible.value = resources.slice(12);
    selection.selectVisible(true);
    return () =>
      h('main', { style: 'padding:32px' }, [
        h('h1', `${type === 'note' ? '笔记' : '书签'}批量入口验收`),
        h('p', '已跨页选择 25 项；标签追加模式'),
        h(BButton, { onClick: () => selection.openOrganize() }, () => '智能打标签'),
      ]);
  },
});
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: Source },
    { path: '/organize', component: params.has('center') ? Center : Workspace },
  ],
});
const app = createApp({
  setup() {
    useResourceSelectionRuntime();
    const bookmark = bookmarkStore();
    const sync = () => {
      bookmark.screenWidth = innerWidth;
      bookmark.screenHeight = innerHeight;
    };
    sync();
    window.addEventListener('resize', sync);
    return () =>
      h('div', [
        h(
          'p',
          { style: 'margin:0;padding:8px', role: 'status' },
          `预检 ${counters.value.previews} 次 · 启动 ${counters.value.starts} 次`,
        ),
        h(RouterView),
      ]);
  },
});
app.use(createPinia());
app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
globalDirect(app);
await router.isReady();
app.mount('#app');
