import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import feedbackScreenshot from '@/assets/img/help/bookmark_mg.jpg';
import OpinionsPage from '@/components/personCenter/opinions/OpinionsMobile.vue';
import BViewer from '@/components/base/Viewer/BViewer.vue';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import globalDirect from '@/config/globalDirect';
import request from '@/http/request';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// 隔离夹具只模拟反馈接口，不连接数据库、账号或第三方服务。
const params = new URLSearchParams(location.search);
const state = params.get('state') || 'default';
const lang = params.get('locale') || 'zh-CN';
const image = feedbackScreenshot;
const items =
  state === 'empty'
    ? []
    : [
        {
          id: 'feedback-1',
          userId: 'fixture-user',
          type: lang === 'zh-CN' ? '功能故障' : 'Function Fault',
          content:
            lang === 'zh-CN'
              ? '在书签管理页修改标签后，列表没有立即更新，需要刷新页面才能看到结果。'
              : 'After editing tags in bookmark management, the list does not update until I refresh the page.',
          imgArray: JSON.stringify([image]),
          status: state === 'unread' ? 'replied' : 'viewed',
          replyViewed: state === 'unread' ? 0 : 1,
          createTime: '2026-11-03 16:40:00',
          replyTime: '2026-11-04 10:20:00',
          replyContent:
            lang === 'zh-CN'
              ? '谢谢你的反馈，已经确认是列表更新不及时的问题。后续会调整刷新逻辑，让修改后的标签直接出现在列表中。有进一步进展，我会在这里回复你。'
              : 'Thank you for the detailed report. We will adjust the refresh behavior so updated tags appear in the list immediately. We will share further progress here.',
        },
        {
          id: 'feedback-2',
          userId: 'fixture-user',
          type: lang === 'zh-CN' ? '产品建议' : 'Product Suggestion',
          content:
            lang === 'zh-CN'
              ? '希望首页增加「最近使用」分组，方便快速打开常用书签。'
              : 'A recently used section would help me quickly open my favorite bookmarks.',
          imgArray: '[]',
          status: 'pending',
          replyViewed: 0,
          createTime: '2026-11-02 09:15:00',
        },
      ];
if (state === 'many') {
  for (let i = 3; i <= 45; i++)
    items.push({ ...items[1], id: `feedback-${i}`, content: `反馈 ${i}：${items[1].content}` });
}
let failed = false;
const calls: { url: string; data: any }[] = [];
request.defaults.adapter = async (config) => {
  const url = config.url || '';
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  calls.push({ url, data: body });
  let data: any = {};
  let status = 200;
  if (params.has('slow')) await new Promise((resolve) => setTimeout(resolve, 600));
  if (url.endsWith('/getOpinionList')) {
    if (state === 'error' && !failed) {
      failed = true;
      status = 500;
    }
    const offset = ((body.currentPage || 1) - 1) * (body.pageSize || 20);
    data = {
      items: items.slice(offset, offset + (body.pageSize || 20)),
      total: items.length,
      summary: {
        pendingTotal: items.filter((item) => item.status === 'pending').length,
        repliedTotal: items.filter((item) => item.status === 'replied').length,
        viewedTotal: items.filter((item) => item.status === 'viewed').length,
      },
    };
  }
  if (url.endsWith('/recordOpinion')) {
    if (params.has('submitError') && !failed) {
      failed = true;
      status = 500;
    } else
      items.unshift({
        ...body,
        id: 'submitted',
        userId: 'fixture-user',
        status: 'pending',
        replyViewed: 0,
        createTime: '2026-11-04 17:20:00',
      });
  }
  if (url.endsWith('/markOpinionReplyViewed')) {
    let affectedRows = 0;
    for (const item of items) {
      if (body.ids?.includes(item.id) && item.status === 'replied') {
        item.status = 'viewed';
        item.replyViewed = 1;
        affectedRows++;
      }
    }
    data = { affectedRows };
  }
  return {
    data: { status, data, msg: status === 200 ? '' : '暂时无法完成，请重试' },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  };
};
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.body.style.cssText = 'display:block;margin:0';
document.getElementById('app')!.style.cssText = 'width:100%;height:100vh';
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/opinions', component: OpinionsPage },
    { path: '/home', component: { template: '<div>Home</div>' } },
  ],
});
const app = createApp({ render: () => h('div', [h(RouterView), bookmark.viewerKey ? h(BViewer) : null]) });
app.use(createPinia());
app.use(createI18n({ legacy: false, locale: lang, messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(router);
const bookmark = bookmarkStore();
useUserStore().$patch({ id: 'fixture-user', role: 'user', unreadOpinionReplyTotal: state === 'unread' ? 1 : 0 });
function syncViewport() {
  bookmark.screenWidth = innerWidth;
  applyUiDensity(params.get('density'), bookmark.isMobileDevice);
  document.documentElement.classList.toggle(
    'light-note-mobile-rendering',
    params.get('renderProfile') === 'mobile' || bookmark.isMobileDevice,
  );
}
syncViewport();
window.addEventListener('resize', syncViewport);
globalDirect(app);
await router.push({ path: '/opinions', query: params.get('tab') === 'history' ? { tab: 'history' } : {} });
await router.isReady();
app.mount('#app');
Object.assign(window, {
  opinionFixture: { calls, setDensity: (value: string) => applyUiDensity(value, bookmark.isMobileDevice) },
});
