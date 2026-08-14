<template>
  <div class="wc">
    <div class="wc-head">
      <div class="wc-title"><SvgIcon :src="icon.common.calendar" size="17" />{{ t('growth.weeklyTitle') }}</div>
      <div class="wc-sub">{{ t('growth.weeklySubtitle') }}</div>
      <div class="wc-reset">{{ t('growth.weeklyResetTime') }}</div>
    </div>
    <div v-if="loading && !weekly" class="wc-loading"><BLoading size="small" /></div>
    <div v-else-if="loadError && !weekly" class="wc-error">
      <span>{{ t('growth.weeklyLoadFailed') }}</span><BButton size="small" @click="reload">{{ t('common.retry') }}</BButton>
    </div>
    <div v-else-if="challenges.length" class="wc-list">
      <div v-for="c in challenges" :key="c.key" class="wc-item" :class="{ done: c.done }">
        <span class="wc-icon"><SvgIcon :src="ICONS[c.key] || icon.growth.action" size="21" /></span>
        <div class="wc-main">
          <div class="wc-name">
            {{ nameOf(c.key) }}
            <span class="wc-target">{{ c.cur }}/{{ c.target }}</span>
          </div>
          <div class="wc-bar"><div class="wc-fill" :style="{ width: pct(c) + '%' }"></div></div>
        </div>
        <div class="wc-action">
          <BButton
            v-if="c.claimable"
            class="wc-claim"
            :disabled="readOnly || claimingKey === c.key || claimingRewards"
            :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
            @click="onClaim(c)"
          >
            <SvgIcon :src="icon.growth.coin" size="13" /> {{ t('growth.weeklyClaim', { n: c.reward }) }}
          </BButton>
          <span v-else-if="c.claimed" class="wc-claimed"><SvgIcon :src="icon.message.success" size="13" />{{ t('growth.weeklyClaimed') }}</span>
          <BButton
            v-else-if="!c.done && !readOnly"
            size="small"
            class="wc-go"
            v-click-log="{ module: '成长', operation: `前往每周挑战-${c.key}` }"
            @click="goToChallenge(c)"
          >
            {{ t('growth.tasksGoTo') }}
          </BButton>
          <span v-else class="wc-reward"><SvgIcon :src="icon.growth.coin" size="13" />{{ c.reward }}</span>
        </div>
      </div>
    </div>
    <div v-else class="wc-empty">{{ t('growth.weeklyEmpty') }}</div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth, type WeeklyChallenge } from '@/composables/useGrowth.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { bookmarkStore } from '@/store';
  import { resolvePendingResourcesRoute } from '@/utils/resourceNavigation';
  import { useRouter } from 'vue-router';

  const { t, te } = useI18n();
  const props = withDefaults(defineProps<{ readOnly?: boolean }>(), { readOnly: false });
  const { weekly, loadWeekly, claimWeekly, claimingRewards } = useGrowth();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const loading = ref(true);
  const loadError = ref(false);

  const ICONS: Record<string, string> = {
    wk_bookmark: icon.resource.bookmark,
    wk_note: icon.resource.note,
    wk_checkin: icon.growth.checkin,
    wk_todo: icon.growth.action,
    wk_organize: icon.growth.organize,
  };
  const challenges = computed(() => weekly.value?.challenges || []);

  function nameOf(key: string) {
    const k = 'growth.weeklyName.' + key;
    return te(k) ? t(k) : key;
  }
  function pct(c: WeeklyChallenge) {
    return c.target ? Math.min(100, Math.round((c.cur / c.target) * 100)) : 0;
  }

  const claimingKey = ref<string | null>(null);
  async function onClaim(c: WeeklyChallenge) {
    if (props.readOnly || claimingKey.value || claimingRewards.value) return;
    claimingKey.value = c.key;
    try {
      const res = await claimWeekly(c.key);
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('growth.weeklyClaimOk', { n: res.data.reward }));
        recordOperation({ module: '成长', operation: `领取每周挑战 ${c.key}（+${res.data.reward} 积分）` });
      } else if (res?.data?.msg) {
        message.info(res.data.msg);
      }
    } catch (err) {
      console.error('领取每周挑战失败:', err);
    } finally {
      claimingKey.value = null;
    }
  }

  function goToChallenge(challenge: WeeklyChallenge) {
    if (challenge.metric === 'bookmark') void router.push('/home');
    else if (challenge.metric === 'note') void router.push('/noteLibrary');
    else if (challenge.metric === 'todo') void router.push({ path: '/inbox', query: { tab: 'todo' } });
    else if (challenge.metric === 'organize') {
      void router.push(resolvePendingResourcesRoute(bookmark.isMobile));
    }
    else if (challenge.metric === 'checkin') {
      void router.replace({ query: { ...router.currentRoute.value.query, section: 'overview' } });
    }
  }

  async function reload() {
    loading.value = true;
    loadError.value = false;
    const value = await loadWeekly();
    loadError.value = !value;
    loading.value = false;
  }

  onMounted(reload);
</script>

<style scoped lang="less">
  .wc {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .wc-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 15px;
    font-weight: 700;
  }
  .wc-sub {
    margin-top: 3px;
    font-size: 12px;
    color: var(--desc-color);
  }
  .wc-reset { margin-top: 3px; color: var(--primary-color); font-size: 11px; }
  .wc-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .wc-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--background-color);
    border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
  }
  .wc-item.done {
    border-color: color-mix(in srgb, #f59e0b 45%, transparent);
  }
  .wc-icon {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
  }
  .wc-main {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .wc-name {
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .wc-target {
    font-size: 11.5px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  .wc-bar {
    height: 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 45%, transparent);
    overflow: hidden;
  }
  .wc-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--primary-color), #f59e0b);
    transition: width 0.4s ease;
  }
  .wc-action {
    flex: 0 0 auto;
  }
  .wc-claim {
    padding: 5px 12px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(135deg, #f59e0b, #f97316);
    box-shadow: 0 4px 10px -5px rgba(245, 158, 11, 0.8);
  }
  .wc-claim:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .wc-claimed {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11.5px;
    font-weight: 700;
    color: #16a34a;
  }
  .wc-reward {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: #d97706;
  }
  .wc-go { color: var(--primary-color); }
  .wc-loading, .wc-error, .wc-empty { display: flex; min-height: 90px; align-items: center; justify-content: center; gap: 10px; color: var(--desc-color); font-size: 12px; }
  html.light-note-mobile-rendering .wc-item.done { border-color: #f59e0b; box-shadow: none; }
</style>
