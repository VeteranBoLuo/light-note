import { createApp, h, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import { bookmarkStore, useUserStore, cloudSpaceStore } from '@/store';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
const p = new URLSearchParams(location.search);
const theme = p.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', p.get('renderProfile') === 'mobile');
const canvas = document.createElement('canvas');
canvas.width = 600;
canvas.height = 360;
const ctx = canvas.getContext('2d')!;
ctx.fillStyle = '#d9e7df';
ctx.fillRect(0, 0, 600, 360);
ctx.fillStyle = '#39634e';
ctx.font = '32px sans-serif';
ctx.fillText('压缩预览 · 720 px', 55, 145);
ctx.font = '22px sans-serif';
ctx.fillText('独立 WebP，小图与原图分离', 55, 195);
const small = canvas.toDataURL('image/webp', 0.76);
const states = ['ready', 'processing', 'failed', 'unsupported'] as const;
const metrics = { batches: 0, items: 0, unexpected: 0 };
(window as any).__imagePreviewMetrics = metrics;
request.defaults.adapter = async (config) => {
  if (config.url?.endsWith('/image-previews/resolve')) {
    const items = JSON.parse(config.data || '{}').items;
    metrics.batches++;
    metrics.items += items.length;
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        status: 200,
        data: items.map((item: any) => {
          const state = states[Number(item.sourceId.split('-').at(-1)) % 4];
          return {
            ...item,
            status: state,
            assetId: item.sourceId,
            url: state === 'ready' ? small : null,
            expiresAt: Date.now() + 600000,
          };
        }),
      },
    };
  }
  metrics.unexpected++;
  throw new Error('UNEXPECTED_IMAGE_FIXTURE_REQUEST');
};
const pinia = createPinia();
setActivePinia(pinia);
const { default: NoteCard } = await import('@/components/noteLibrary/library/NoteCard.vue');
const { default: FieldList } = await import('@/components/cloudSpace/fieldList.vue');
const Editor = p.has('editor') ? (await import('@/components/noteLibrary/detail/Editor.vue')).default : null;
const editorContent = ref(`<p>前文</p><p><img src="${small}" width="120" height="72"></p><p>后文</p>`);
const app = createApp({
  render: () =>
    h('main', { style: 'padding:20px;max-width:1400px;margin:auto' }, [
      ...(Editor
        ? [
            h('h2', '实际编辑器删图验收'),
            h('div', { style: 'height:360px' }, [
              h(Editor, {
                type: 'html',
                content: editorContent.value,
                imageUploadMode: 'base64',
                'onUpdate:content': (v: string) => {
                  editorContent.value = v;
                },
              }),
            ]),
            h(
              'output',
              { id: 'editor-image-count' },
              `正文图片数：${(editorContent.value.match(/<img\b/g) || []).length}`,
            ),
          ]
        : []),
      h('h2', '笔记库卡片'),
      h(
        'section',
        { class: 'fixture-note-grid' },
        states.map((state, i) =>
          h(NoteCard, {
            note: {
              id: `note-${i}`,
              title: `笔记 · ${state}`,
              type: 'html',
              tags: [],
              previewSummary: '图片从保存后的正文解析。',
              previewTextBeforeImage: '默认、处理中、失败与不支持状态',
              previewImageUrl: 'legacy-marker',
              imagePreview: { sourceType: 'note', sourceId: `note-${i}` },
            },
          }),
        ),
      ),
      h('h2', { style: 'margin-top:30px' }, '云空间卡片'),
      h(FieldList, { batchMode: false, viewMode: 'card' }),
    ]),
});
app
  .use(pinia)
  .use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] }))
  .use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
useUserStore(pinia).setUserInfo({
  id: 'image-fixture',
  role: 'user',
  alias: '预览验收',
  preferences: { theme, lang: 'zh-CN', noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = window.innerWidth;
cloudSpaceStore(pinia).fileList = states.map((state, i) => ({
  id: `cloud-${i}`,
  fileName: `图片-${state}.png`,
  fileType: 'image/png',
  category: 'image',
  fileSize: 2000000,
  fileUrl: '/original-must-not-be-requested.png',
  uploadTime: '2026-09-08 12:00',
  folderName: '',
  tags: [],
}));
cloudSpaceStore(pinia).loading = false;
globalDirect(app);
app.mount('#app');
const style = document.createElement('style');
style.textContent =
  'html,body,#app{height:auto;min-height:100%;display:block;overflow:visible}body{margin:0}.fixture-note-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}@media(max-width:700px){.fixture-note-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}';
document.head.append(style);

const diagnostics = document.createElement('output');
diagnostics.id = 'preview-diagnostics';
diagnostics.style.cssText = 'display:block;overflow-wrap:anywhere;margin-top:20px';
document.querySelector('main')!.append(diagnostics);
setInterval(() => {
  diagnostics.textContent = JSON.stringify({
    ...metrics,
    originalRequests: performance.getEntriesByType('resource').filter((e) => e.name.includes('original-must-not'))
      .length,
  });
}, 1000);
