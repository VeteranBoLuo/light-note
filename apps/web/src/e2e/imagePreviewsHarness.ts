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
const audioMode = p.get('audio') === 'true';
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
const tallCanvas = document.createElement('canvas');
tallCanvas.width = 600;
tallCanvas.height = 2400;
const tallContext = tallCanvas.getContext('2d')!;
for (const [i, label] of ['顶部 TOP', '中部 MIDDLE', '底部 BOTTOM'].entries()) {
  tallContext.fillStyle = ['#d9e7df', '#e8dfba', '#bcd5e8'][i];
  tallContext.fillRect(0, i * 800, 600, 800);
  tallContext.fillStyle = '#243d40';
  tallContext.font = '40px sans-serif';
  tallContext.fillText(label, 50, i * 800 + 160);
}
const tallOriginal = tallCanvas.toDataURL('image/png');
const cropCanvas = document.createElement('canvas');
cropCanvas.width = 480;
cropCanvas.height = 720;
cropCanvas.getContext('2d')!.drawImage(tallCanvas, 0, 0, 600, 900, 0, 0, 480, 720);
const tallThumbnail = cropCanvas.toDataURL('image/webp');
const states = ['ready', 'processing', 'failed', 'unsupported', 'failed', 'ready'] as const;
const metrics = { batches: 0, items: 0, unexpected: 0, retries: 0 };
const retried = new Set<string>();
const firstPreviewRequest = new Map<string, number>();
const uploadDelayMs = p.get('slowUpload') === 'quick' ? 3000 : 70000;
(window as any).__imagePreviewMetrics = metrics;
const adminItems = ['source', 'resource_limit', 'service'].map((failureKind, i) => ({
  id: String(101 + i),
  source: 'file_preview',
  status: 'attention',
  rawStatus: 'failed',
  title: ['源文件缺失示例', '资源受限示例', '服务异常示例'][i],
  ownerLabel: '验收用户',
  ownerTeam: '文件预览服务',
  attempts: 3,
  failureKind,
  errorCode: ['IMAGE_SOURCE_MISSING', 'IMAGE_RESOURCE_LIMIT', 'IMAGE_STORAGE_UNAVAILABLE'][i],
  slaState: 'overdue',
  overdueMinutes: 90,
  updatedAt: '2026-09-09T02:00:00Z',
  canRetry: false,
}));
request.defaults.adapter = async (config) => {
  if (config.url?.endsWith('/common/getAdminActionCenter'))
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        status: 200,
        data: {
          work: { total: 0, items: [], sources: [] },
          jobs: {
            attention: 3,
            running: 0,
            waiting: 0,
            completed24h: 8,
            items: adminItems,
            sources: [
              {
                source: 'file_preview',
                label: '文件预览',
                total: 3,
                attention: 3,
                running: 0,
                waiting: 0,
                completed24h: 8,
                overdue: 3,
              },
            ],
          },
          sla: { overdue: 3, returnedCount: 3 },
          unavailableSources: [],
        },
      },
    };
  if (config.url?.endsWith('/common/getAdminFilePreviewDiagnostic')) {
    const item = adminItems.find((row) => row.id === JSON.parse(config.data).id)!;
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: {
        status: 200,
        data: {
          file: { id: '1', name: item.title, size: 1000, ownerLabel: '验收用户' },
          job: {
            id: item.id,
            status: 'failed',
            health: 'attention',
            attentionReason: 'processing_failed',
            attempts: 3,
            errorCode: item.errorCode,
          },
          artifact: {
            id: '1',
            status: 'failed',
            strategy: 'image_thumbnail',
            strategyVersion: 2,
            formatId: 'card',
            artifactSize: 0,
          },
        },
      },
    };
  }
  if (config.url?.endsWith('/image-previews/retry')) {
    const { source } = JSON.parse(config.data || '{}');
    retried.add(source.sourceId);
    metrics.retries++;
    return {
      config,
      status: 200,
      statusText: 'OK',
      headers: {},
      data: { status: 200, data: { ...source, status: 'ready', url: small, expiresAt: Date.now() + 600000 } },
    };
  }
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
          const index = Number(item.sourceId.split('-').at(-1));
          if (!firstPreviewRequest.has(item.sourceId)) firstPreviewRequest.set(item.sourceId, Date.now());
          const slowUploadReady =
            p.has('slowUpload') && index === 1 && Date.now() - firstPreviewRequest.get(item.sourceId)! >= uploadDelayMs;
          const state = retried.has(item.sourceId) || slowUploadReady ? 'ready' : states[index % states.length];
          return {
            ...item,
            status: state,
            errorCode: state === 'failed' ? (index === 4 ? 'IMAGE_STORAGE_UNAVAILABLE' : 'IMAGE_SOURCE_MISSING') : null,
            retryable: state === 'failed' && index === 4,
            presentation: index === 5 ? 'long_top' : 'full',
            assetId: item.sourceId,
            url: state === 'ready' ? (index === 5 ? tallThumbnail : small) : null,
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
const ActionCenter = p.has('admin')
  ? (await import('@/view/admin/components/actionCenter/ActionCenter.vue')).default
  : null;
const { default: FilePreview } = await import('@/components/FilePreview.vue');
const opened = ref(false);
const openedFile = ref<any>();
const { default: FieldList } = await import('@/components/cloudSpace/fieldList.vue');
const Editor = p.has('editor') ? (await import('@/components/noteLibrary/detail/Editor.vue')).default : null;
const editorContent = ref(`<p>前文</p><p><img src="${small}" width="120" height="72"></p><p>后文</p>`);
const app = createApp({
  render: () =>
    h('main', { style: 'padding:20px;max-width:1400px;margin:auto' }, [
      ...(ActionCenter ? [h(ActionCenter)] : []),
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
      h('h2', { id: 'cloud-cards', style: 'margin-top:30px' }, '云空间卡片'),
      h(FieldList, {
        batchMode: false,
        viewMode: 'card',
        onPreviewFile: (file: any) => {
          openedFile.value = { ...file, fileUrl: String(file.id).endsWith('-5') ? tallOriginal : small };
          opened.value = true;
        },
      }),
      h(FilePreview, {
        visible: opened.value,
        fileInfo: openedFile.value,
        'onUpdate:visible': (v: boolean) => {
          opened.value = v;
        },
      }),
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
  fileName: audioMode ? `音频-${state}.mp3` : `图片-${state}.png`,
  fileType: audioMode ? 'audio/mpeg' : 'image/png',
  category: audioMode ? 'audio' : 'image',
  fileSize: p.has('originalFallback') && i === 3 ? 10 * 1024 * 1024 : 2000000,
  fileUrl: p.has('originalFallback') && i !== 4 ? small : '/original-must-not-be-requested.png',
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
