import { createApp, h } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createMemoryHistory, createRouter } from 'vue-router';
import request from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import globalDirect from '@/config/globalDirect';
import zh from '@/i18n/locales/zh-CN';
import '@/assets/css/index.less';

if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw Error('Local fixture only');
const params = new URLSearchParams(location.search);
const account = params.get('account') === 'b' ? 'b' : 'a';
document.cookie = `sid=${account}; Path=/; SameSite=Lax`;
request.defaults.baseURL = 'http://127.0.0.1:19097';
const OriginalSocket = window.WebSocket;
const events: { type: string; at: number; id?: string }[] = [];
class FixtureSocket extends OriginalSocket {
  constructor(url: string | URL, protocols?: string | string[]) {
    const target = new URL(url);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname)) throw Error('External WebSocket forbidden');
    target.host = '127.0.0.1:19097';
    super(target, protocols);
    this.addEventListener('message', ({ data }) => {
      const event = JSON.parse(data);
      events.push({
        type: event.type,
        at: performance.timeOrigin + performance.now(),
        id: event.payload?.messagePublicId,
      });
    });
  }
}
window.WebSocket = FixtureSocket;
Object.assign(window, {
  chatLatency: {
    events,
    switchAccount(next: 'a' | 'b') {
      if (!['a', 'b'].includes(next)) throw Error('Fixture account required');
      document.cookie = `sid=${next}; Path=/; SameSite=Lax`;
      useUserStore().$patch({ id: next, role: 'user', alias: `隔离测试 ${next}` });
    },
  },
});
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.documentElement.classList.toggle('light-note-mobile-rendering', innerWidth < 768);
document.documentElement.style.height = document.body.style.height = '100%';
document.getElementById('app')!.style.height = '100%';
const pinia = createPinia();
setActivePinia(pinia);
useUserStore().$patch({ id: account, role: 'user', alias: `隔离测试 ${account}` });
const bookmark = bookmarkStore();
bookmark.screenWidth = innerWidth;
bookmark.screenHeight = innerHeight;
const { default: ChatPage } = await import('@/view/communityChat/CommunityChat.vue');
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/community/chat', name: 'communityChat', component: { render: () => null } }],
});
await router.push('/community/chat');
const app = createApp({ render: () => h(ChatPage) });
app
  .use(pinia)
  .use(router)
  .use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh } }));
globalDirect(app);
app.mount('#app');
