import { createApp, h, reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createI18n } from 'vue-i18n';
import request from '@/http/request';
import { bookmarkStore, useUserStore } from '@/store';
import { applyUiDensity } from '@/composables/useUiDensity';
import { useManorAttention } from '@/composables/useManorAttention';
import DailyQuests from '@/components/growth/DailyQuests.vue';
import type { Quest, QuestBonus } from '@/composables/useGrowth';
import zh from '@/i18n/locales/zh-CN';
import en from '@/i18n/locales/en-US';
import '@/assets/css/index.less';

// 真实顶栏入口与每日任务卡 + 隔离数据：attention=water|fresh|ripe|none 切换庄园提醒，所有请求都在夹具内响应。
const params = new URLSearchParams(location.search);
const mobile = params.get('renderProfile') === 'mobile';
const attention = params.get('attention') || 'water';
const pinia = createPinia();
setActivePinia(pinia);
// admin=true 只需要「正在代管」这一事实：入口与水滴行都应隐藏。
const adminContext = params.get('admin') === 'true' ? ({ id: 'manor-attention-admin' } as never) : null;
useUserStore(pinia).$patch({ id: 'manor-attention-fixture', role: 'user', adminContext });
bookmarkStore(pinia).screenWidth = innerWidth;
document.documentElement.classList.toggle('light-note-mobile-rendering', mobile);
document.documentElement.dataset.theme = params.get('theme') === 'night' ? 'night' : 'day';
document.body.style.cssText = 'display:block;margin:0;background:var(--background-color);color:var(--text-color)';
applyUiDensity(params.get('density') === 'compact' ? 'small' : params.get('density') === 'comfortable' ? 'large' : 'standard', mobile);

const payload = {
  water: { fresh: false, water: 10, ripe: 2, rewards: 0 },
  fresh: { fresh: true, water: 0, ripe: 0, rewards: 0 },
  ripe: { fresh: false, water: 0, ripe: 1, rewards: 1 },
  none: { fresh: false, water: 0, ripe: 0, rewards: 0 },
}[attention] || { fresh: false, water: 0, ripe: 0, rewards: 0 };
request.defaults.adapter = async (config) => {
  const path = String(config.url || '');
  const data = path.endsWith('/growth/manor/attention') ? { ...payload, perTask: 5, bonus: 5 }
    : path.endsWith('/growth/me') ? { level: 3, exp: 40, points: 120, features: { manor: true, growthCenterV2: true } }
      : {};
  return { data: { status: 200, data }, status: 200, statusText: 'OK', headers: {}, config };
};

const quests = reactive<Quest[]>([
  { key: 'checkin', done: true, cur: 1, target: 1 },
  { key: 'daily_note', done: true, cur: 1, target: 1 },
  { key: 'daily_bookmark', done: false, cur: 0, target: 1 },
] as Quest[]);
const bonus = reactive({ exp: 20, points: 10, claimed: false, claimable: false, stages: [
  { key: 'stage2', required: 2, exp: 10, points: 5, claimable: true, claimed: false },
  { key: 'stage3', required: 3, exp: 20, points: 10, claimable: false, claimed: false },
] } as unknown as QuestBonus);

const Entry = mobile ? (await import('@/components/mobile/MobileTopBar.vue')).default : (await import('@/components/home/navigation/RightArea.vue')).default;
const Card = {
  setup() {
    const { visibleAttention } = useManorAttention();
    return () => h(DailyQuests, { quests, bonus, compact: !mobile, manor: visibleAttention.value, showClaimAction: false, readOnly: params.get('admin') === 'true' });
  },
};
const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', name: 'workbenches', component: { render: () => null } }] });
await router.push('/workbenches');
const app = createApp({
  render: () => h('div', [
    h('header', { style: { display: 'flex', alignItems: 'center', minHeight: '56px', padding: mobile ? '0' : '0 16px', borderBottom: '1px solid var(--surface-divider-color)' } }, [h(Entry)]),
    h('main', { style: { maxWidth: mobile ? 'none' : '420px', margin: mobile ? '12px' : '20px auto', padding: '16px', border: '1px solid var(--card-border-color)', borderRadius: '14px', background: 'var(--card-background)' } }, [h(Card)]),
  ]),
});
app.use(pinia).use(router).use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, 'en-US': en } }));
app.directive('click-log', {});
app.mount('#app');
