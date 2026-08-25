import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import type { InternalAxiosRequestConfig } from 'axios';
import globalDirect from '@/config/globalDirect';
import request from '@/http/request';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';
import ResourceTagPickerHarness from './ResourceTagPickerHarness.vue';

const params = new URLSearchParams(window.location.search);
const requestedView = params.get('view');
const view =
  requestedView === 'tag' || requestedView === 'inline' || requestedView === 'todo' ? requestedView : 'resource';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const zoom = ['0.9', '1.1'].includes(String(params.get('zoom'))) ? String(params.get('zoom')) : '';

document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.style.zoom = zoom;
document.documentElement.classList.toggle('light-note-mobile-rendering', window.innerWidth <= 600);
document.body.dataset.tagIconSearchRequests = '0';

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
  if (config.url === '/api/search/global') {
    const requestData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
    const keyword = String(requestData.keyword || '')
      .trim()
      .toLowerCase();
    const allItems = [
      { id: 'bookmark-1', type: 'bookmark', title: 'Litterbox 临时文件托管', description: '' },
      { id: 'bookmark-2', type: 'bookmark', title: 'codex 雷达', description: '' },
      { id: 'bookmark-3', type: 'bookmark', title: '知乎问题页面', description: '' },
      { id: 'bookmark-4', type: 'bookmark', title: '百度一下，你就知道', description: '' },
      { id: 'bookmark-5', type: 'bookmark', title: 'OSCHINA 开源社区', description: '' },
      { id: 'note-1', type: 'note', title: '未命名文档', description: '', path: '工作区' },
      { id: 'note-2', type: 'note', title: 'app', description: '', path: '平台文档' },
      { id: 'file-1', type: 'file', title: '产品说明.pdf', description: '' },
    ];
    const items = keyword ? allItems.filter((item) => item.title.toLowerCase().includes(keyword)) : allItems;
    return axiosResponse(config, {
      status: 200,
      msg: 'ok',
      data: { keyword, items, groups: [], total: items.length, page: 1, pageSize: 12, hasMore: false },
    });
  }
  if (config.url === '/api/tagIcon/search') {
    document.body.dataset.tagIconSearchRequests = String(Number(document.body.dataset.tagIconSearchRequests || 0) + 1);
    return axiosResponse(config, {
      status: 200,
      msg: 'ok',
      data: {
        icons: ['mdi:book-open-page-variant', 'mdi:bookmark-outline'],
        keywords: ['reading', 'book'],
        translatedQuery: 'reading book',
        page: 0,
        hasMore: false,
        cached: false,
        aiExpanded: true,
      },
    });
  }
  if (config.url === '/api/common/recordOperationLogs') {
    return axiosResponse(config, { status: 200, msg: 'ok', data: null });
  }
  throw Object.assign(new Error(`Unexpected visual fixture request: ${config.url || ''}`), {
    code: 'VISUAL_FIXTURE_UNEXPECTED_REQUEST',
    config,
  });
};

const app = createApp(ResourceTagPickerHarness, { view });
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
