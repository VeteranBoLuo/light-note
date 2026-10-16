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
const fileCount = Math.min(5000, Math.max(1, Number(params.get('count')) || 60));
const items = Array.from({ length: params.has('empty') ? 0 : fileCount }, (_, i) => ({
  id: params.has('numericIds') ? i + 1 : String(i + 1),
  fileName: `滚动验收资料 ${i + 1}.${params.has('preview') ? 'txt' : 'zip'}`,
  fileUrl: params.has('preview')
    ? `data:text/plain;charset=utf-8,${encodeURIComponent('批量预览验收内容 ' + (i + 1))}`
    : '',
  fileType: params.has('preview') ? 'text/plain' : 'application/zip',
  fileSize: 1024,
  uploadTime: '2026-09-11 12:00:00',
  tags: [],
  folderName: '',
}));
let uploadedCount = 0;
request.defaults.adapter = async (config) => {
  const url = String(config.url);
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  let data: any = {};
  if (url.endsWith('/queryFiles')) {
    if (params.has('slow')) await new Promise((resolve) => setTimeout(resolve, 1500));
    const files = items;
    const page = Math.max(1, Number(body.currentPage) || 1);
    const pageSize = params.has('paged') ? Math.max(1, Number(body.pageSize) || 48) : files.length;
    const start = (page - 1) * pageSize;
    data = {
      items: files.slice(start, start + pageSize),
      total: files.length,
      page,
      hasMore: start + pageSize < files.length,
    };
  } else if (url.endsWith('/getFileInfo')) data = items.find((item) => String(item.id) === String(body.id));
  else if (url.endsWith('/checkFileNames')) data = [];
  else if (url.endsWith('/uploadFiles')) {
    data = body.files.map((file: any, index: number) => ({
      filename: file.fileName,
      fileType: file.fileType,
      objectKey: `fixture/${uploadedCount + index + 1}`,
      // 验收脚本拦截本地 PUT，不接触真实对象存储。
      uploadUrl: `${location.origin}/__cloud-upload-fixture__/${uploadedCount + index + 1}`,
      headers: {},
    }));
  } else if (url.endsWith('/confirmUpload')) {
    data = body.files.map((file: any) => {
      const id = `uploaded-${++uploadedCount}`;
      items.unshift({ ...file, id, uploadTime: '2026-10-13 12:00:00', tags: [], folderName: '' });
      return { filename: file.fileName, fileId: id, status: '已上传' };
    });
  } else if (url.endsWith('/queryFolder')) data = { items: [], allFileCount: items.length };
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
