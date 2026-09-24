import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { densityCssVariables, type UiDensity } from '@/config/uiDensity';
import globalDirect from '@/config/globalDirect';
import { RoleEnum } from '@/config/bookmarkCfg';
import request from '@/http/request';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { bookmarkStore, useUserStore } from '@/store';
import TranslationWorkbench from '@/view/toolbox/TranslationWorkbench.vue';
import TranslationResult from '@/view/toolbox/components/TranslationResult.vue';
import SaveAsNoteHost from '@/components/noteLibrary/save/SaveAsNoteHost.vue';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import { openSaveAsNote } from '@/composables/useSaveAsNote';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search);
document.documentElement.style.height = '100%';
document.body.style.cssText = 'display:block;margin:0;height:100%';
document.getElementById('app')!.style.cssText = 'width:100%;height:100%';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const density = (params.get('density') || 'standard') as UiDensity;
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
for (const [key, value] of Object.entries(
  densityCssVariables(params.get('renderProfile') === 'mobile' ? 'standard' : density),
))
  document.documentElement.style.setProperty(key, value);
let attempts = 0;
const deletedHistory = new Set<string>();
const fixtureAdapter: NonNullable<typeof request.defaults.adapter> = async (config) => {
  let data: any = [];
  if (config.url?.endsWith('/translation/stream')) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: string, data: unknown) =>
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        emit('start', { jobId: 'visual-job' });
        const count = params.has('slow') ? 80 : 8;
        for (let step = 1; step <= count; step++) {
          await new Promise((resolve) => setTimeout(resolve, params.has('slow') ? 350 : 160));
          if (config.signal?.aborted) {
            controller.close();
            return;
          }
          emit('snapshot', {
            original: pair.original,
            content: pair.translated.slice(0, Math.ceil((pair.translated.length * step) / count)),
          });
        }
        if (params.has('streamError'))
          emit('error', {
            code: 'AI_TRANSLATION_OUTPUT_INVALID',
            message: 'Incomplete',
            status: 502,
            definitive: true,
          });
        else
          emit('complete', {
            id: 'visual-artifact',
            jobId: 'visual-job',
            title: '知识库 · 简体中文译文',
            version: 1,
            content: pair.translated,
            meta: { translation: { segments: [pair] } },
            save: params.has('saved') ? { targetId: 'saved-note', targetAvailability: 'available' } : {},
          });
        controller.close();
      },
    });
    return { data: stream, status: 200, statusText: 'OK', headers: {}, config };
  }
  if (config.url?.endsWith('/translation/history')) {
    const cursor = Number(config.params?.cursor || 0);
    const keyword = String(config.params?.keyword || '');
    const records = params.has('history')
      ? Array.from({ length: 75 }, (_, index) => ({
          id: String(index + 1),
          toolId: 'translation',
          status: 'succeeded',
          preview:
            index === 0
              ? 'Knowledge work: a practical guide to building a personal library'
              : '翻译示例 ' + (index + 1),
          targetLanguage: index % 2 ? 'en' : 'zh-CN',
          createdAt: '2026-09-24T09:30:00Z',
        })).filter((item) => item.preview.includes(keyword) && !deletedHistory.has(item.id))
      : [];
    data = {
      items: records.slice(cursor, cursor + 30),
      nextCursor: cursor + 30 < records.length ? String(cursor + 30) : null,
    };
  }
  if (config.url?.endsWith('/translation/history/delete')) {
    const payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    if (payload.all) payload.jobIds = Array.from({ length: 75 }, (_, index) => String(index + 1));
    for (const id of payload.jobIds) deletedHistory.add(id);
    data = { deletedIds: payload.jobIds, cleared: payload.all === true };
  } else if (config.url?.includes('/translation/history/')) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    data = {
      job: { id: config.url.split('/').pop(), status: 'succeeded', artifact: { id: 'visual-artifact' } },
      original: pair.original,
      options: { sourceLanguage: 'en', targetLanguage: 'zh-CN', question: '' },
    };
  }
  if (config.url?.endsWith('/cancel')) data = { status: 'cancelled' };
  if (config.url?.includes('/artifacts/'))
    data = {
      id: 'visual-artifact',
      version: 1,
      title: '示例译文',
      content: pair.translated,
      meta: { translation: { segments: [pair] } },
      save: params.has('saved') ? { targetId: 'saved-note', targetAvailability: 'available' } : {},
    };
  if (config.url?.includes('/artifacts/') && config.url.endsWith('/save'))
    data = { targetId: 'saved-note' };
  if (config.url?.endsWith('/quotes'))
    data = {
      id: 'quote',
      inputSummary: {
        translation: { characters: 3120, segments: 2, estimatedTokens: 21000, partial: params.has('partial') },
      },
      billingMedium: 'ai_quota',
    };
  if (config.url?.endsWith('/jobs')) data = { id: 'job' };
  if (config.url?.includes('queryTagList')) data = [{ id: 'tag1', name: '知识管理' }];
  if (config.url?.includes('workspaces')) data = [];
  if (config.url?.includes('queryNoteTree'))
    data = { items: [{ id: 'parent', title: '研究资料', parentId: null, depth: 1, children: [] }], maxDepth: 10 };
  return { data: { status: 200, data }, status: 200, statusText: 'OK', headers: {}, config };
};
request.interceptors.request.use((config) => {
  config.adapter = fixtureAdapter;
  return config;
});
const pair = {
  id: '1',
  original:
    '# Building a knowledge base\n\nSave ideas with their sources.\n\n| Step | Purpose |\n| --- | --- |\n| Capture | Retain context |\n\n`const source = "original";`',
  translated:
    '# 建设知识库\n\n保存想法及其来源。\n\n| 步骤 | 目的 |\n| --- | --- |\n| 收集 | 保留上下文 |\n\n`const source = "original";`',
};
const mode = ref<'translationOnly' | 'bilingual'>('bilingual');
const open = () =>
  openSaveAsNote({
    sourceKey: 'visual-source',
    title: '知识库实践指南 · 简体中文译文',
    type: 'markdown',
    personalThoughts: params.has('community'),
    description: params.has('community')
      ? '来自社区 · 作者：轻笺用户 · 保存当前公开内容快照'
      : '本次保存形式：双语对照',
    notice: params.has('community') ? '2 张图片将复制到你的云空间，并占用存储空间。' : '',
    save: async () => {
      attempts++;
      if (params.has('error') && attempts === 1) throw new Error('response lost');
      return { noteId: 'saved-note' };
    },
  });
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/toolbox/translation', component: TranslationWorkbench },
    { path: '/:pathMatch(.*)*', component: { render: () => h('p', '已打开笔记 / 后台任务') } },
  ],
});
await router.push('/toolbox/translation');
const pinia = createPinia();
const app = createApp({
  render: () => [
    params.has('result')
      ? h('div', { style: 'padding:24px;max-width:1100px;margin:auto' }, [
          h(TranslationResult, {
            modelValue: mode.value,
            'onUpdate:modelValue': (value: any) => (mode.value = value),
            content: pair.translated,
            pairs: [pair],
          }),
        ])
      : h(RouterView),
    ...(!params.has('stream') ? [h(BButton, { onClick: open }, () => '保存为笔记（验收入口）')] : []),
    h(SaveAsNoteHost),
  ],
});
app.use(pinia);
app.use(router);
app.use(
  createI18n({
    legacy: false,
    locale: params.get('lang') === 'en' ? 'en-US' : 'zh-CN',
    messages: { 'zh-CN': zh, 'en-US': en },
  }),
);
useUserStore(pinia).setUserInfo({
  id: 'visual-user',
  role: RoleEnum.USER,
  userName: '验收',
  alias: '验收',
  preferences: { theme, lang: 'zh-CN', noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = innerWidth;
globalDirect(app);
app.mount('#app');
if (params.has('dialog')) void open();
