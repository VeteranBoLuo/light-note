import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { getManorAttention } from '@/api/growthApi.ts';
import { useGrowth } from '@/composables/useGrowth.ts';
import { useUserStore } from '@/store';
import { showManorEntry } from '@/utils/manorAccess';

/** 服务端只统计现在就能收的东西：每日任务水滴（已扣水桶余量）、成熟地块和等级礼物。 */
export interface ManorAttention {
  fresh: boolean;
  water: number;
  ripe: number;
  rewards: number;
  /** 每完成一项每日任务得到的水滴与全部完成的额外水滴，供每日任务卡说明规则。 */
  perTask: number;
  bonus: number;
}

/** 路由切换时的复读间隔：完成任务后换个页面就能看到提醒，又不会每次跳转都请求。 */
const ROUTE_REFRESH_MS = 60 * 1000;

// 顶栏入口、手机顶栏和每日任务卡共用一份；记下所属账号，切换账号后旧值立即失效。
const state = ref<{ owner: string; value: ManorAttention | null } | null>(null);
let ownerId = '';
let generation = 0;
let inFlight: Promise<void> | null = null;
let loadedAt = 0;

/**
 * 静默刷新，不打扰用户：网络失败时保留旧值，服务端拒绝（如庄园关闭）时清空。
 * force 用于离开庄园等明确会改变结果的时机。
 */
export function refreshManorAttention(force = false): Promise<void> {
  const uid = useUserStore().id || '';
  if (uid !== ownerId) {
    ownerId = uid;
    generation += 1;
    state.value = null;
    inFlight = null;
    loadedAt = 0;
  }
  if (!uid) return Promise.resolve();
  if (inFlight) return inFlight;
  if (!force && Date.now() - loadedAt < ROUTE_REFRESH_MS) return Promise.resolve();
  const sequence = generation;
  inFlight = getManorAttention()
    .then((res) => {
      if (sequence !== generation) return;
      state.value = { owner: uid, value: res?.status === 200 && res.data ? (res.data as ManorAttention) : null };
      loadedAt = Date.now();
    })
    .catch(() => undefined)
    .finally(() => {
      if (sequence === generation) inFlight = null;
    });
  return inFlight;
}

export function useManorAttention() {
  const { t, locale } = useI18n();
  const user = useUserStore();
  const { growth } = useGrowth();
  const attention = computed(() => (state.value && state.value.owner === user.id ? state.value.value : null));
  /** 每日任务卡只在庄园入口可见时说明水滴；数据由顶栏入口负责读取，这里复用同一份结果。 */
  const visibleAttention = computed(() =>
    attention.value && showManorEntry(growth.value, user.adminContext, locale.value) ? attention.value : null,
  );
  /** 入口提醒的原因，按「新开放 → 水滴 → 收获 → 等级礼物」排列，空数组表示没有要提醒的。 */
  const reasons = computed(() => {
    const value = attention.value;
    if (!value) return [];
    if (value.fresh) return [t('manor.attention.fresh')];
    return [
      value.water > 0 ? t('manor.attention.water', { n: value.water }) : '',
      value.ripe > 0 ? t('manor.attention.ripe', { n: value.ripe }) : '',
      value.rewards > 0 ? t('manor.attention.rewards') : '',
    ].filter(Boolean);
  });
  const entryLabel = computed(() => [t('manor.title'), ...reasons.value].join(' · '));
  return { attention, visibleAttention, reasons, entryLabel, refresh: refreshManorAttention };
}
