import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createWebHistory, createRouter } from 'vue-router';
import Editor from '@/components/noteLibrary/detail/Editor.vue';
import NoteReadonlyPreview from '@/components/noteLibrary/library/NoteReadonlyPreview.vue';
import NoteShareReader from '@/view/share/NoteShareReader.vue';
import i18n, { setLocale } from '@/i18n';
import { bookmarkStore, useUserStore } from '@/store';
import globalDirect from '@/config/globalDirect';
import { applyUiDensity } from '@/composables/useUiDensity';
import request from '@/http/request';
import '@/assets/css/index.less';

// Offline fixture: every request stays in this adapter; no user note or live backend is used.
const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
const surface = params.get('surface') || 'editor';
const type = params.get('type') === 'html' ? 'html' : 'markdown';
await setLocale(locale);
document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');

const paragraph = '这是一段用于验证长文目录跳转的示例正文。点击目录后，正文应定位到对应章节。';
const markdown = [
  '# 目录跳转示例',
  '## 目录',
  '- [第一部分 学习计划](#第一部分-学习计划)',
  '- [模块一：数列（基础/进阶）](#模块一数列基础进阶)',
  '- [第二个重复标题](#复习安排-1)',
  '- [自定义锚点](#custom:target)',
  '- [不存在的章节](#missing)',
  '',
  '## 第一部分 学习计划',
  ...Array.from({ length: 20 }, () => `\n${paragraph}\n`),
  '## 模块一：数列（基础/进阶）',
  ...Array.from({ length: 8 }, () => `\n${paragraph}\n`),
  '## 复习安排',
  paragraph,
  '## 复习安排',
  paragraph,
  '<h2 id="custom:target">自定义锚点正文</h2>',
  ...Array.from({ length: 15 }, () => `\n${paragraph}\n`),
].join('\n');
const { Marked } = await import('marked');
const content = ref(type === 'markdown' ? markdown : String(new Marked().parse(markdown)));
const note = {
  id: 'anchor-fixture',
  title: '目录跳转示例',
  type,
  content: content.value,
  revision: 1,
  parentId: null,
  updateTime: null,
};

request.defaults.adapter = async (config) => ({
  data: {
    status: 200,
    data: String(config.url).includes('/share/resolve')
      ? {
          page: note,
          share: {
            id: 'fixture-share',
            rootNoteId: note.id,
            rootTitle: note.title,
            rootType: type,
            scopeType: 'single',
            creatorName: '示例',
            description: '',
            expiresAt: '',
          },
          children: [],
          breadcrumb: [],
          accessTicket: 'offline-fixture',
          ticketExpiresIn: 300,
        }
      : note,
    msg: '',
  },
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});
const router = createRouter({
  history: createWebHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
});
await router.push(`${location.pathname}${location.search}#token=offline-fixture`);
const pinia = createPinia();
const app = createApp({
  setup() {
    const store = bookmarkStore();
    useUserStore().preferences.theme = theme;
    const syncViewport = () => {
      store.screenWidth = innerWidth;
      store.screenHeight = innerHeight;
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    applyUiDensity(params.get('density'), !store.isDesktop);
    return () =>
      h('main', { style: 'width:100%;height:100vh;min-height:0;display:flex;flex-direction:column;overflow:hidden' }, [
        surface === 'share'
          ? h(NoteShareReader)
          : surface === 'preview'
            ? h(NoteReadonlyPreview, { noteId: note.id, seed: note })
            : h(Editor, {
                content: content.value,
                'onUpdate:content': (value: string) => {
                  content.value = value;
                },
                readonly: params.has('readonly'),
                imageUploadMode: 'base64',
                context: 'note',
                type,
              }),
      ]);
  },
});
app.use(pinia);
app.use(i18n);
app.use(router);
globalDirect(app);
await router.isReady();
app.mount('#app');
