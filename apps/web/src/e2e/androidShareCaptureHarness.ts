import { createApp, reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import '@/assets/css/index.less';
import { RoleEnum } from '@/config/bookmarkCfg';
import globalDirect from '@/config/globalDirect';
import request from '@/http/request';
import axios from 'axios';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import { bookmarkStore, useUserStore } from '@/store';
import AndroidShareCaptureHarness from './AndroidShareCaptureHarness.vue';

/**
 * Android 系统分享验收页：用假原生桥模拟 IncomingShareStore 的 share.peek / share.complete / share.finish，
 * 并拦截 /__native-share/ 文件读取，在普通浏览器里走通「原生暂存 → 预填快速添加 → 保存 → 完成」。
 * 参数：scenario=link|files|text-files|text|visitor|admin，theme=night，locale=en-US，renderProfile=mobile。
 */
const params = new URLSearchParams(window.location.search);
const scenario = params.get('scenario') || 'link';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const mobileRendering = params.get('renderProfile') === 'mobile' || window.innerWidth <= 640;
document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobileRendering);

const shareId = 'e'.repeat(32);
const log = reactive<string[]>([]);
const sampleBlobs = await Promise.all([sampleImage(0), sampleImage(1)]);

function manifestFor(name: string) {
  const files = [
    { index: 0, name: 'Screenshot_20261015.png', mimeType: 'image/png', size: sampleBlobs[0].size },
    { index: 1, name: '会议白板.jpg', mimeType: 'image/jpeg', size: sampleBlobs[1].size },
  ];
  if (name === 'bulk')
    return {
      id: shareId,
      text: '',
      subject: '',
      textTruncated: false,
      skippedFiles: 3,
      skippedFileCounts: { count_limit: 1, size_limit: 1, unreadable: 1 },
      skippedFileDetails: [
        { name: '第101张.jpg', reason: 'count_limit' },
        { name: '大视频.mp4', reason: 'size_limit' },
        { name: '已失效.jpg', reason: 'unreadable' },
      ],
      files: Array.from({ length: 100 }, (_, index) => ({
        ...files[index % 2],
        index,
        name: `相册照片_${index + 1}.png`,
      })),
    };
  if (name === 'files') return { id: shareId, text: '', subject: '', textTruncated: false, skippedFiles: 1, files };
  if (name === 'text-files') {
    return {
      id: shareId,
      text: '这张图是今天会议的白板',
      subject: '',
      textTruncated: false,
      skippedFiles: 0,
      files: files.slice(0, 1),
    };
  }
  if (name === 'text') {
    return {
      id: shareId,
      text: '# 读书摘录\n\n知识只有被再次使用，才算真正被保存下来。',
      subject: '',
      textTruncated: false,
      skippedFiles: 0,
      files: [],
    };
  }
  return {
    id: shareId,
    text: 'https://example.com/articles/knowledge-loop',
    subject: '把收藏变成可复用的知识',
    textTruncated: false,
    skippedFiles: 0,
    files: [],
  };
}

let shareSettled = false;
window.LightNoteAndroid = {
  postMessage(raw: string) {
    const message = JSON.parse(raw) as Record<string, string>;
    log.push(`原生桥 ← ${message.type}${message.shareId ? ` (${message.shareId.slice(0, 6)}…)` : ''}`);
    if (message.type === 'share.complete') shareSettled = true;
    if (message.type !== 'share.peek') return;
    const payload = shareSettled
      ? { status: 'none' }
      : { status: 'ready', share: { ...manifestFor(scenario), limits: { files: 100, bytes: 500 * 1024 * 1024 } } };
    setTimeout(() => window.__lightNoteAndroidShareResult?.({ token: message.token, ...payload }), 30);
  },
};

async function sampleImage(index: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.fillStyle = index === 0 ? '#615ced' : '#18a058';
  context.fillRect(0, 0, 64, 64);
  return new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob || new Blob()), 'image/png'));
}

const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const match = /\/__native-share\/([a-f0-9]{32})\/(\d+)$/.exec(url);
  if (!match) return originalFetch(input, init);
  log.push(`读取分享文件 #${match[2]}`);
  return new Response(sampleBlobs[Number(match[2]) % 2], { status: 200, headers: { 'Content-Type': 'image/png' } });
};

axios.defaults.adapter = async (config) => {
  if (!String(config.url).startsWith('/__share-upload-fixture__/')) throw new Error('Unexpected fixture upload');
  log.push(`上传文件 ${config.url}`);
  return { config, status: 200, statusText: 'OK', headers: {}, data: '' };
};
request.defaults.adapter = async (config) => {
  const url = String(config.url || '');
  let body: Record<string, unknown> = {};
  try {
    body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  } catch {
    body = {};
  }
  let data: unknown = null;
  if (url.endsWith('/api/file/managedUploadBatch')) {
    data = (body.items as Array<{ operation: string; payload: Record<string, string> }>).map(
      ({ operation, payload }) => {
        const name = payload.fileName || payload.objectKey;
        if (operation === 'prepareManagedUpload')
          return { status: 200, data: { objectKey: name, uploadUrl: `/__share-upload-fixture__/${name}` } };
        if (operation === 'confirmManagedUpload')
          return { status: 200, data: { fileId: name, filename: name, status: '已上传' } };
        return { status: 200, data: { deleted: true } };
      },
    );
  } else if (url.endsWith('/api/bookmark/resolveUrl')) {
    const matched = /https?:\/\/\S+/.exec(String(body.url || ''));
    data = { state: 'valid', canonicalUrl: matched?.[0] || '' };
  } else if (url.endsWith('/api/bookmark/addBookmark')) {
    log.push(`addBookmark name=${body.name} inboxSource=${body.inboxSource} nameConflict=${body.nameConflict}`);
    data = { id: 'visual-bookmark', name: body.name };
  } else if (url.endsWith('/api/note/addNote')) {
    log.push(`addNote title=${body.title} inboxSource=${body.inboxSource}`);
    data = { id: 'visual-note' };
  }
  return {
    data: { status: 200, msg: 'ok', data },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
    request: null,
  };
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
await router.push('/');

const pinia = createPinia();
setActivePinia(pinia);
const app = createApp(AndroidShareCaptureHarness, { scenario, log });
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
const visitor = scenario === 'visitor';
user.setUserInfo({
  id: visitor ? '' : 'visual-share-user',
  role: visitor ? RoleEnum.VISITOR : RoleEnum.USER,
  userName: visitor ? '游客' : '视觉验收用户',
  alias: visitor ? '游客' : '视觉验收用户',
  preferences: { theme, lang: locale, noteViewMode: 'card' },
});
if (scenario === 'admin') {
  user.adminContext = { id: 'visual-admin-context' } as unknown as typeof user.adminContext;
}
bookmarkStore(pinia).screenWidth = window.innerWidth;

globalDirect(app);
app.mount('#app');
