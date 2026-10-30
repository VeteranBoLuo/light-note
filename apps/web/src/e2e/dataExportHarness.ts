import { createApp, h } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import Settings from '@/view/settings/Settings.vue';
import { useUserStore } from '@/store';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import { bookmarkStore } from '@/store';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
// ?state=running|completed|partial|failed|expired（缺省为从未备份）；?reason=disk 让失败显示空间不足；
// ?files=0 无文件，?files=huge 文件超出暂存空间（一键备份不含文件）。
const state = params.get('state');
const fullOptions = { types: ['notes', 'bookmarks', 'files'], noteFormat: 'original', includeImages: true };
let task: any =
  state && state !== 'never'
    ? {
        id: 'test-task',
        status: state,
        stage: state === 'running' ? 'files' : 'ready',
        options: fullOptions,
        total: 312,
        completed: state === 'running' ? 186 : state === 'partial' ? 312 : 312,
        failed: state === 'partial' ? 2 : 0,
        expiresAt: new Date(Date.now() + (state === 'expired' ? -3600000 : 86400000)).toISOString(),
        canDownload: ['completed', 'partial'].includes(state),
        archiveBytes: ['completed', 'partial'].includes(state) ? 1.3 * 1024 ** 3 : undefined,
        errorCode: state === 'failed' && params.get('reason') === 'disk' ? 'DATA_EXPORT_DISK_FULL' : undefined,
      }
    : null;
const noFiles = params.get('files') === '0';
const hugeFiles = params.get('files') === 'huge';
const summary = {
  notes: 128,
  bookmarks: 156,
  files: noFiles ? 0 : hugeFiles ? 1616 : 28,
  fileBytes: noFiles ? 0 : (hugeFiles ? 12.06 : 1.2) * 1024 ** 3,
  filesFit: !hugeFiles,
  lastBackup:
    state === 'expired'
      ? { at: new Date(Date.now() - 2 * 86400000).toISOString(), total: 312, types: fullOptions.types, status: 'completed', count: 1 }
      : null,
};
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let data: any = task;
  if (url.endsWith('/summary')) data = summary;
  if (url.endsWith('/create')) {
    task = {
      id: 'test-task',
      status: 'running',
      stage: 'notes',
      options: { types: body.types, noteFormat: body.noteFormat, includeImages: body.includeImages },
      total: 312,
      completed: 36,
      failed: 0,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      canDownload: false,
    };
    data = task;
  }
  if (url.endsWith('/cancel')) {
    task = { ...task, status: 'cancelled', canDownload: false };
    data = task;
  }
  if (url.endsWith('/failures')) data = [{ title: '图片未能完整下载的笔记', code: 'DATA_EXPORT_IMAGE_FAILED' }];
  return { data: { status: 200, data, msg: 'ok' }, status: 200, statusText: 'OK', headers: {}, config };
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
await router.push({ path: '/settings', query: { section: params.get('section') || 'export' } });
const app = createApp({ setup: () => () => h('main', { style: 'width:100%;height:100vh;display:flex;' }, [h(Settings, { style: "width:100%;" })]) });
const pinia = createPinia();
app.use(pinia);
app.use(router);
const user = useUserStore(pinia);
user.setUserInfo({ id: 'export-acceptance', role: 'user', preferences: { theme: params.get('theme') || 'day', noteViewMode: 'card' } });
bookmarkStore(pinia).screenWidth = window.innerWidth;
window.addEventListener('resize', () => { bookmarkStore(pinia).screenWidth = window.innerWidth; });
app.use(
  createI18n({
    legacy: false,
    locale: params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN',
    messages: { 'zh-CN': zh, 'en-US': en },
  }),
);
app.use(globalDirect);
app.mount('#app');
