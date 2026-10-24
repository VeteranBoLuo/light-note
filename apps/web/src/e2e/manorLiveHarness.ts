import './manorPerformanceProbe';
import { createApp, h, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import { createI18n } from 'vue-i18n';
import { createManor, executeManorCommand, MANOR_VERSION, manorModel as M, MANOR_SPECIES, type ManorContext, type ManorState } from '@lightnote/shared/manor';
import request from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import { setLocale } from '@/i18n';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import KnowledgeManor from '@/view/manor/KnowledgeManor.vue';
import '@/assets/css/index.less';

// Every API request in this page is resolved in memory. No credentials, production DB or providers.
const params = new URLSearchParams(location.search), pinia = createPinia();
setActivePinia(pinia);
const user = useUserStore(pinia), bookmark = bookmarkStore(pinia);
user.$patch({ id: 'manor-fixture-a', role: params.get('role') === 'visitor' ? 'visitor' : params.get('role') === 'user' ? 'user' : 'root', adminContext: null });
bookmark.screenWidth = innerWidth;
const mobile = params.get('renderProfile') === 'mobile' || bookmark.isMobile;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
applyUiDensity(params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard', mobile);
const locale = params.get('locale') === 'en-US' ? 'en-US' : 'zh-CN'; setLocale(locale);
const account = ref(user.id), balance = ref(60), requests = ref(0);
const trace = ref('');
let clock = new Date('2026-10-24T02:00:00Z'), loseResponse = false;
const saves = new Map<string, { state: ManorState; revision: number; receipts: Map<string, { result: unknown; hash: string }> }>();
const fixtureKey = () => `manor-fixture:${params.get('scenario') || 'garden'}:${user.id}`;
const persist = () => {
  const save = saves.get(user.id);
  if (save) sessionStorage.setItem(fixtureKey(), JSON.stringify({ ...save, receipts: [...save.receipts] }));
};
const ctx = (points: number): ManorContext & { random: () => number } => ({
  now: clock, points, calendar: { dayKey: '20261024', weekKey: '202643', utcOffsetMinutes: 480 },
  dailyDone: [true, true, false], random: () => 0,
});
const get = () => {
  if (!saves.has(user.id)) {
    const stored = sessionStorage.getItem(fixtureKey());
    if (stored) {
      const save = JSON.parse(stored);
      saves.set(user.id, { ...save, receipts: new Map(save.receipts) });
      return saves.get(user.id)!;
    }
    let state = createManor(ctx(user.id.endsWith('b') ? 20 : 60));
    if (params.get('scenario') !== 'first' && user.id.endsWith('a')) {
      state = executeManorCommand(state, { action: 'adopt', args: [] }, ctx(320)).state;
      state.xp = M.RULES.levels[7] + 40; state.guide = null; state.water = 30;
      state.seeds = { radish: 3, carrot: 2, tomato: 1, corn: 2 };
      for (const kind of ['clown', 'blue', 'moonjelly']) M.addFish(state, kind);
      M.place(state, 1, 0, MANOR_SPECIES);
      M.plant(state, 0, 'carrot'); M.water(state, [0]);
      M.plant(state, 1, 'tomato'); M.water(state, [1]);
      state.plots[0].next = state.now - 1;
      state.plots[1].next = state.now - 1;
      state.wallet = 320;
      if (params.get('scenario') === 'cast-pending') state = executeManorCommand(state, { action: 'beginCast', args: ['bait'] }, ctx(320)).state;
    }
    saves.set(user.id, { state, revision: 0, receipts: new Map() });
    persist();
  }
  return saves.get(user.id)!;
};
const snapshot = (result?: unknown) => {
  const save = get(); balance.value = save.state.wallet;
  return { version: MANOR_VERSION, revision: save.revision, state: structuredClone(save.state), result,
    quests: [{ key: 'checkin', done: true }, { key: 'daily_note', done: true }, { key: 'daily_bookmark', done: false }] };
};
request.defaults.adapter = async config => {
  requests.value++;
  const path = new URL(config.url || '', 'http://fixture.invalid').pathname;
  trace.value = path;
  let data: unknown;
  if (path.endsWith('/manor/commands')) {
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    trace.value = `command:${body.action}`;
    const save = get(), prior = save.receipts.get(body.requestId), hash = JSON.stringify([body.action, body.args]);
    if (prior) data = prior.hash === hash ? { status: 200, data: { ...snapshot(prior.result), replayed: true } } : { status: 409, data: { code: 'MANOR_REQUEST_CONFLICT' } };
    else if (body.revision !== save.revision) data = { status: 409, data: { code: 'MANOR_REVISION_CONFLICT' } };
    else {
      const next = executeManorCommand(save.state, body, ctx(save.state.wallet));
      save.state = next.state; save.revision++; save.receipts.set(body.requestId, { result: next.result, hash });
      persist();
      data = { status: 200, data: snapshot(next.result) };
      if (loseResponse) { loseResponse = false; throw { code: 'ERR_NETWORK', config, message: 'Network Error' }; }
    }
  } else if (path.endsWith('/manor')) data = { status: 200, data: snapshot() };
  else if (path.endsWith('/me')) data = { status: 200, data: { level: 1, points: get().state.wallet, features: { manor: params.get('feature') !== 'off' && user.role === 'root' } } };
  else if (path.endsWith('/inventory')) data = { status: 200, data: { assets: { points: get().state.wallet }, items: [] } };
  else data = { status: 200, data: {} };
  return { data, status: 200, statusText: 'OK', headers: {}, config };
};
const Entry = params.get('entry') === 'true' ? (mobile
  ? (await import('@/components/mobile/MobileTopBar.vue')).default
  : (await import('@/components/home/navigation/RightArea.vue')).default) : null;
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/knowledge-manor', name: 'knowledgeManor', component: KnowledgeManor },
  { path: '/app', component: { render: () => Entry ? h('div', { style: { position:'relative', minHeight:'var(--ui-control-56, 56px)' } }, [h(Entry)]) : h('p', '已返回轻笺 · 隔离夹具') } },
  { path: '/growth', component: { render: () => h('p', '成长中心 · 隔离夹具') } },
] });
await router.push(Entry ? '/app' : '/knowledge-manor');
createApp({ render: () => h('div', { style: { height: '100%', display: 'flex', flexDirection: 'column' } }, [
  params.get('controls') === 'hidden' ? null : h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', background: '#fff', color: '#222' } }, [
    h('strong', `隔离验收 ${account.value} · ${balance.value} 积分 · ${requests.value} 请求`),
    h('span', `${trace.value} · casting:${String(get().state.casting)} · first:${String(get().state.firstCompanionPending)}`),
    h('button', { onClick: () => { user.$patch({ id: user.id.endsWith('a') ? 'manor-fixture-b' : 'manor-fixture-a' }); account.value = user.id; } }, '切换账号'),
    h('button', { onClick: () => { loseResponse = true; } }, '下次回包丢失'),
  ]), h('div', { style: { flex: '1', minHeight: '0' } }, [h(RouterView)]),
]) }).use(pinia).use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, 'en-US': en } })).use(router).mount('#app');
