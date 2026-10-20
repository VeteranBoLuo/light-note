import { createApp, h, reactive } from 'vue';
import { createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import axios from 'axios';
import request from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import inboxStore from '@/store/inbox';
import type { GrowthTask, GrowthTasksData } from '@/composables/useGrowth';
import GrowthTasks from '@/components/growth/GrowthTasks.vue';
import QuickCaptureModal from '@/components/inbox/QuickCaptureModal.vue';
import { applyUiDensity } from '@/composables/useUiDensity';
import globalDirect from '@/config/globalDirect';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';

// 只挂载真实组件；所有业务读取和写入都由本地夹具响应，不能接入真实后端。
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const scenario = params.get('scenario') || 'new';
const full = params.get('view') === 'full';
applyUiDensity(params.get('density'), mobile);
document.documentElement.dataset.theme = theme;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);

const calls = reactive<Array<{ method: string; path: string }>>([]);
const keys = ['profile_avatar', 'first_note', 'first_bookmark', 'first_todo', 'first_file', 'first_organize'];
const allTasks: GrowthTask[] = keys.map((taskKey) => ({
  taskKey,
  titleKey: `growth.tasks.${({ profile_avatar: 'profileAvatar', first_note: 'firstNote', first_bookmark: 'firstBookmark', first_todo: 'firstTodo', first_file: 'firstFile', first_organize: 'firstOrganize' } as Record<string, string>)[taskKey]}.title`,
  descriptionKey: `growth.tasks.${({ profile_avatar: 'profileAvatar', first_note: 'firstNote', first_bookmark: 'firstBookmark', first_todo: 'firstTodo', first_file: 'firstFile', first_organize: 'firstOrganize' } as Record<string, string>)[taskKey]}.description`,
  status: 'pending',
  rewardExp: taskKey === 'first_file' ? 30 : 50,
  completed: false,
  claimed: false,
  claimable: false,
  completedAt: null,
  claimedAt: null,
}));
if (scenario === 'claimable') Object.assign(allTasks[0], { status: 'completed', completed: true, claimable: true });
if (scenario === 'existing') Object.assign(allTasks[4], { status: 'completed', completed: true, claimed: true });
if (scenario === 'files')
  allTasks.slice(0, 3).forEach((task) => Object.assign(task, { status: 'completed', completed: true, claimed: true }));
const data: GrowthTasksData = {
  allTasks,
  tasks: allTasks.filter((task) => !task.claimed).slice(0, 3),
  completedTasks: allTasks.filter((task) => task.claimed),
  totalCount: 6,
  completedCount: allTasks.filter((task) => task.completed).length,
  claimedCount: allTasks.filter((task) => task.claimed).length,
  claimableCount: allTasks.filter((task) => task.claimable).length,
  remainingCount: allTasks.filter((task) => !task.completed).length,
  activeCount: allTasks.filter((task) => !task.claimed).length,
};

request.defaults.adapter = async (config) => {
  const path = String(config.url || '');
  calls.push({ method: String(config.method || 'get'), path });
  let body: Record<string, any> = {};
  try {
    body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  } catch {
    /* fixture */
  }
  let result: unknown = {};
  if (path.includes('getNoteTreeFeatures'))
    result = { features: { noteTreeRead: true, noteTreeWrite: true, noteTreeMobile: true } };
  else if (
    /queryNoteList|queryNoteTree|queryNoteTagList|queryNoteTemplates|queryNoteBreadcrumb|queryTagList/u.test(path)
  )
    result = { items: [], total: 0, hasMore: false };
  if (/queryNoteTagList|queryNoteTemplates|queryNoteBreadcrumb|queryTagList/u.test(path)) result = [];
  if (path.endsWith('/api/todo/plan-v2/config')) result = { remindersEnabled: false, lists: [], projects: [] };
  if (path.includes('/count'))
    result = { total: 0, overdue: 0, dueToday: 0, dueWeek: 0, bookmark: 0, note: 0, file: 0 };
  if (path.endsWith('/api/bookmark/resolveUrl'))
    result = { url: body.url, canonicalUrl: body.url, state: 'valid', candidates: [] };
  if (path.endsWith('/api/bookmark/addBookmark')) result = { id: 'fixture-bookmark', name: 'example.com' };
  if (path.endsWith('/api/file/managedUploadBatch'))
    result = (body.items || []).map(({ operation, payload }: any) => ({
      status: 200,
      data:
        operation === 'prepareManagedUpload'
          ? { objectKey: `fixture/${payload.fileName}`, uploadUrl: '/__growth-upload-fixture__/file' }
          : { fileId: 'fixture-file', filename: payload.filename || '资料.txt', status: '已上传' },
    }));
  const failed = params.get('save') === 'failed' && /addBookmark|managedUploadBatch/u.test(path);
  return {
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { status: failed ? 500 : 200, data: result, msg: failed ? '夹具：保存失败，请重试' : '' },
  };
};
const fixtureAdapter = request.defaults.adapter as (config: any) => Promise<any>;
axios.defaults.adapter = async (config) => {
  if (!String(config.url).startsWith('/__growth-upload-fixture__/')) return fixtureAdapter(config);
  return { config, status: 200, statusText: 'OK', headers: {}, data: null };
};

const pinia = createPinia();
useUserStore(pinia).setUserInfo({
  id: 'growth-entry-fixture',
  role: 'user',
  alias: 'Fixture',
  preferences: { lang: locale, theme, noteViewMode: 'card' },
});
bookmarkStore(pinia).screenWidth = mobile ? 390 : window.innerWidth;
const inbox = inboxStore(pinia);
const tasks = {
  render: () =>
    h(
      'main',
      {
        style: {
          maxWidth: 'var(--ui-layout-760, 760px)',
          padding: 'var(--ui-space-20, 20px)',
          margin: '0 auto',
          color: 'var(--text-color)',
        },
      },
      h(GrowthTasks, {
        data: scenario === 'loading' ? null : data,
        compact: !full,
        maxVisible: full ? 6 : mobile ? 3 : 2,
        readOnly: scenario === 'readonly',
        showViewAll: true,
      }),
    ),
};
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/workbenches', component: tasks },
    { path: '/growth', component: tasks },
    { path: '/manage/editBookmark/:id', component: () => import('@/view/manage/BookmarkEditMg.vue') },
    { path: '/noteLibrary', component: () => import('@/view/noteLibrary/NoteLibrary.vue') },
    {
      path: '/noteLibrary/add',
      component: {
        render: () =>
          h('p', { id: 'fixture-note-editor' }, `进入现有新建编辑器：${router.currentRoute.value.query.type}`),
      },
    },
  ],
});
const app = createApp({
  render: () =>
    h('div', { style: { width: '100%', height: '100vh', background: 'var(--background-color)' } }, [
      h(RouterView),
      inbox.quickCaptureVisible
        ? h(QuickCaptureModal, {
            visible: true,
            'onUpdate:visible': (value: boolean) => {
              inbox.quickCaptureVisible = value;
            },
          })
        : null,
      h(
        'output',
        {
          id: 'fixture-route',
          style: { display: 'block', padding: 'var(--ui-space-8, 8px)', fontSize: 'var(--ui-font-12, 12px)' },
        },
        router.currentRoute.value.fullPath,
      ),
      h('output', { id: 'fixture-calls', hidden: true }, JSON.stringify(calls)),
    ]),
});
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale, fallbackLocale: 'zh-CN', messages: { 'zh-CN': zhCN, 'en-US': enUS } }));
globalDirect(app);
await router.push(full ? '/growth?section=tasks#growth-tasks' : '/workbenches');
await router.isReady();
app.mount('#app');
