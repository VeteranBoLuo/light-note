import { createApp, h, onBeforeUnmount, ref } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import '@/assets/css/index.less';
import globalDirect from '@/config/globalDirect';
import { densityCssVariables, resolveUiDensity } from '@/config/uiDensity';
import request from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import BookmarkSnapshotModal from '@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue';
import { bindResourceReuseRuntime, createResourceReuseRuntime } from '@/utils/resourceReuseRuntime';

// Isolated browser fixture: every API request is handled locally; no backend or AI is contacted.
const params = new URLSearchParams(location.search);
const state = params.get('state') || 'restricted';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const mobile = params.get('renderProfile') === 'mobile' || innerWidth <= 767;
const density = resolveUiDensity(params.get('density'), mobile);
document.documentElement.dataset.theme = theme;
document.documentElement.dataset.density = density;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
for (const [name, value] of Object.entries(densityCssVariables(density)))
  document.documentElement.style.setProperty(name, value);
document.documentElement.lang = locale;

let queued = false;
let readsAfterQueue = 0;
let reads = 0;
let submits = 0;
request.defaults.adapter = async (config) => {
  let data: unknown = null;
  if (config.url === '/api/bookmark/snapshot') {
    reads++;
    document.body.dataset.reads = String(reads);
    if (state === 'load-error' && reads === 1) throw new Error('Fixture offline');
    const completed = state === 'success' || (queued && ++readsAfterQueue > 1);
    const transient = ['transient', 'submit-error', 'old-content'].includes(state);
    data = {
      bookmarkUrl: new URL('/e2e/bookmark-archive.html?state=original', location.origin).href,
      title: '关于知识管理的阅读笔记',
      content: completed
        ? '重新读取成功。\n\n正文内容已保存，可继续阅读。'
        : state === 'old-content'
          ? '这是之前保存的正文。\n\n重新读取失败后，它仍然保留，可继续阅读。'
          : null,
      source: 'static_html',
      update_time: state === 'old-content' || completed ? '2026-10-16 10:30:00' : null,
      archiveTask:
        state === 'empty'
          ? null
          : {
              status: completed ? 'succeeded' : queued ? 'pending' : 'failed',
              attempts: transient ? 3 : 1,
              reason_code: completed || queued ? null : transient ? 'TIMEOUT' : 'AUTH_REQUIRED',
              retryable: transient,
            },
    };
  } else if (config.url === '/api/bookmark/archive') {
    submits++;
    document.body.dataset.submits = String(submits);
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (state === 'submit-error' && submits === 1) throw new Error('Fixture offline');
    queued = true;
    data = { ok: true, status: 'pending' };
  } else if (
    !['/api/support/events', '/api/common/recordOperation', '/api/common/recordResourceReuse'].includes(
      config.url || '',
    )
  ) {
    throw new Error(`Unexpected fixture request: ${config.url}`);
  }
  return { data: { status: 200, data }, status: 200, statusText: 'OK', headers: {}, config };
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { render: () => null } }],
});
await router.push('/');
const app = createApp({
  setup() {
    const visible = ref(state !== 'original');
    const reuse = createResourceReuseRuntime({
      report: async (target) => {
        document.body.dataset.reuse = `${target.resourceType}:${target.resourceId}`;
        return true;
      },
    });
    reuse.setOwner(user.role === 'visitor' ? '' : user.id);
    bindResourceReuseRuntime(reuse);
    onBeforeUnmount(() => {
      reuse.dispose();
      bindResourceReuseRuntime(null);
    });
    return () =>
      h(BookmarkSnapshotModal, {
        visible: visible.value,
        bookmarkId: 'archive-fixture',
        'onUpdate:visible': (value: boolean) => {
          visible.value = value;
        },
      });
  },
});
const pinia = createPinia();
app.use(pinia);
const user = useUserStore(pinia);
user.setUserInfo({ id: 'archive-fixture-user', role: params.get('role') === 'visitor' ? 'visitor' : 'user' });
user.preferences = {
  ...user.preferences,
  theme,
  lang: locale,
  openBookmarkIn: params.get('open') === 'current' ? 'current' : 'newTab',
};
bookmarkStore(pinia).screenWidth = innerWidth;
app.use(router);
app.use(createI18n({ legacy: false, locale, fallbackLocale: 'zh-CN', messages: { 'zh-CN': zhCN, 'en-US': enUS } }));
globalDirect(app);
app.mount('#app');
