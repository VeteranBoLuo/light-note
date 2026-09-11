import { createApp, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import { bookmarkStore, useUserStore } from '@/store';
import '@/assets/css/index.less';
const params = new URLSearchParams(location.search);
const pinia = createPinia();
setActivePinia(pinia);
// 使用内存文件驱动真实云空间页面，滚动验收不访问业务服务。
const items = Array.from({ length: 60 }, (_, i) => ({
  id: String(i + 1),
  fileName: `滚动验收资料 ${i + 1}.zip`,
  fileType: 'application/zip',
  fileSize: 1024,
  uploadTime: '2026-09-11 12:00:00',
  tags: [],
  folderName: '',
}));
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  let data: any = {};
  if (url.endsWith('/queryFiles')) {
    if (params.has('slow')) await new Promise((resolve) => setTimeout(resolve, 1500));
    const files = params.has('empty') ? [] : items;
    data = { items: files, total: files.length, page: 1, hasMore: false };
  } else if (url.endsWith('/queryFolder')) data = { items: [], allFileCount: params.has('empty') ? 0 : items.length };
  else if (url.endsWith('/queryTotalFileSize')) data = { totalSizeMB: 1, quotaMB: 1024 };
  return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 200, data } };
};
const { default: Cloud } = await import('@/view/cloudSpace/cloudSpace.vue');
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/cloudSpace', component: Cloud }] });
const bookmark = bookmarkStore();
bookmark.screenWidth = innerWidth;
bookmark.screenHeight = innerHeight;
const user = useUserStore();
user.id = 'scroll-fixture';
user.role = 'user';
user.preferences.theme = params.get('theme') === 'night' ? 'night' : 'day';
user.preferences.cloudView = params.get('view') === 'card' ? 'card' : 'table';
document.documentElement.dataset.theme = user.currentTheme;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
for (const el of [document.documentElement, document.body, document.getElementById('app')!]) {
  el.style.height = '100%';
  el.style.width = '100%';
  el.style.margin = '0';
}
await router.push('/cloudSpace');
const app = createApp({ render: () => h(RouterView) });
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
globalDirect(app);
app.mount('#app');
