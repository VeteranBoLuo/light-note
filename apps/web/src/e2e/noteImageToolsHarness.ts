import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import Editor from '@/components/noteLibrary/detail/Editor.vue';
import i18n, { setLocale } from '@/i18n';
import { bookmarkStore, useUserStore } from '@/store';
import globalDirect from '@/config/globalDirect';
import { applyUiDensity } from '@/composables/useUiDensity';
import request from '@/http/request';
import '@/assets/css/index.less';

const params = new URLSearchParams(location.search);
const textSelection = params.has('textSelection');
const largeImage = params.has('largeImage');
const theme = params.get('theme') === 'night' ? 'night' : 'day';
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN';
await setLocale(locale);
document.documentElement.dataset.theme = theme;
document.documentElement.lang = locale;
document.documentElement.classList.toggle('light-note-mobile-rendering', params.get('renderProfile') === 'mobile');
request.defaults.adapter = async (config) => ({
  data: { status: 200, data: {}, msg: '' },
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { render: () => null } }],
});
const pinia = createPinia();
const app = createApp({
  setup() {
    const store = bookmarkStore();
    const user = useUserStore();
    user.preferences.theme = theme;
    const syncViewport = () => {
      store.screenWidth = innerWidth;
      store.screenHeight = innerHeight;
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    applyUiDensity(params.get('density'), !store.isDesktop);
    const src = largeImage
      ? 'data:image/svg+xml,' +
        encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1600"><rect width="800" height="1600" fill="#dce8fa"/><text x="40" y="80" font-size="32" fill="#344767">Large image fixture</text></svg>',
        )
      : '/brand-scenes/autumn-vista.webp';
    const content = ref(
      textSelection
        ? '<h2>选区菜单验收</h2>' +
            Array.from(
              { length: 45 },
              (_, index) => `<p>第 ${index + 1} 行：全选和滚动后，菜单保持在正文可视区域内。</p>`,
            ).join('')
        : `<h2>图片与文字</h2><p>图片之前的内容</p><p><img src="${src}" alt="窗边阅读" title="阅读角落" width="${largeImage ? 1200 : 320}"></p><p>图片之后的内容</p>`,
    );
    return () =>
      h(
        'main',
        {
          style: `height:100vh;max-width:100%;overflow:hidden;${textSelection || largeImage ? 'display:flex;flex-direction:column;padding:120px 80px 24px;box-sizing:border-box' : ''}`,
        },
        [
          h(Editor, {
            content: content.value,
            'onUpdate:content': (value: string) => {
              content.value = value;
            },
            readonly: params.has('readonly'),
            imageUploadMode: 'base64',
            context: 'template',
            type: 'html',
          }),
        ],
      );
  },
});
app.use(pinia);
app.use(i18n);
app.use(router);
globalDirect(app);
await router.isReady();
app.mount('#app');
