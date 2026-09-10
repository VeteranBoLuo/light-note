import { createApp, h, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createI18n } from 'vue-i18n';
import { buildResourceHref } from '@lightnote/shared';
import request from '@/http/request';
import globalDirect from '@/config/globalDirect';
import { bookmarkStore, useUserStore } from '@/store';
import { resolveResourceRoute } from '@/utils/resourceNavigation';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';
// 全部请求使用虚构内存数据，不连接数据库或真实账号。
const params = new URLSearchParams(location.search);
const pinia = createPinia();
setActivePinia(pinia);
useUserStore(pinia).id = 'fixture-owner';
useUserStore(pinia).role = 'user';
bookmarkStore(pinia).screenWidth = innerWidth;
useUserStore(pinia).preferences.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.dataset.theme = params.get('theme') || 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
const refs = [
  ...(['bookmark', 'note', 'file'] as const).map(type => ({type, id: type + '-sample',title: '项目参考资料',available:true,snapshotTitle:'项目参考资料'})),
  {
    type: 'todo' as const,
    id: 'completed',
    title: '已完成的项目核对',
    status: 'completed',
    available: true,
    snapshotTitle: '旧标题',
  },
  {
    type: 'todo' as const,
    id: 'pending',
    title: '准备项目资料',
    status: 'pending',
    available: true,
    snapshotTitle: '准备项目资料',
  },
  { type: 'tag' as const, id: 'topic', title: params.has('longTitle') ? '项目研究与跨团队知识协作的长期参考主题标签示例 LongResourceTitleWithoutSpaces1234567890' : '项目标签', available: true, snapshotTitle: '项目标签' },
  { type: 'tag' as const, id: 'deleted', title: '已删除的标签', available: false, snapshotTitle: '已删除的标签' },
];
request.defaults.adapter = async (config) => {
  const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data || {};
  const items = refs.filter(
    (r) =>
      r.available && (!body.keyword || r.title.includes(body.keyword)) && (!body.types || body.types.includes(r.type)),
  );
  return {
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: { status: 200, data: config.url?.includes('/search/') ? { items, hasMore: false } : [] },
  };
};
const { default: Mention } = await import('@/components/todo/TodoResourceMentionInput.vue');
const { default: Links } = await import('@/components/todo/TodoResourceLinks.vue');
const { default: Editor } = await import('@/components/noteLibrary/detail/Editor.vue');
const value = ref('');
const selected = ref(refs.slice());
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
const app = createApp({
  render: () =>
    h('main', { style: 'max-width:720px;margin:auto;padding:16px' }, [
      h('h2', '待办引用'),
      h(Mention, {
        value: value.value,
        'onUpdate:value': (v: string) => (value.value = v),
        onSelect: (v: any) => {
          if (!selected.value.some((r) => r.type === v.type && r.id === v.id))
            selected.value.push({ ...v, available: true, snapshotTitle: v.title });
        },
        excludeKeys: ['todo:pending'],
      }),
      h(Links, {
        items: selected.value,
        maxVisible: 10,
        onOpen: (r: any) => {
          const target = resolveResourceRoute(r);
          if (target) void router.push(target);
        },
      }),
      h('h2', '笔记引用'),
      h('div', { style: 'height:280px' }, [
        h(Editor, {
          readonly: !params.has('editable') && params.get('format') !== 'markdown',
          type: params.get('format') === 'markdown' ? 'markdown' : 'html',
          content:
            params.get('format') === 'markdown'
              ? refs.map((r) => `[${r.title}](${buildResourceHref(r)})`).join('\n\n')
              : refs.map((r) => `<p><a href="${buildResourceHref(r)}">${r.title}</a></p>`).join(''),
          resourceRefs: refs,
          noteId: 'fixture-note',
        }),
      ]),
      h('output', { id: 'reference-destination' }, router.currentRoute.value.fullPath),
    ]),
});
app.use(pinia);
app.use(router);
app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
app.use(globalDirect);
await router.push('/noteLibrary/fixture-note');
await router.isReady();
app.mount('#app');
const style = document.createElement('style');
style.textContent =
  'html,body{display:block!important;width:100%;height:100%;margin:0!important}#app{width:100%;height:100%}';
document.head.append(style);
