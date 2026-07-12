<template>
  <div class="wc">
    <div class="wc-head">
      <div class="wc-title">📆 {{ t('growth.weeklyTitle') }}</div>
      <div class="wc-sub">{{ t('growth.weeklySubtitle') }}</div>
    </div>
    <div class="wc-list">
      <div v-for="c in challenges" :key="c.key" class="wc-item" :class="{ done: c.done }">
        <span class="wc-icon">{{ ICONS[c.key] || '🎯' }}</span>
        <div class="wc-main">
          <div class="wc-name">
            {{ nameOf(c.key) }}
            <span class="wc-target">{{ c.cur }}/{{ c.target }}</span>
          </div>
          <div class="wc-bar"><div class="wc-fill" :style="{ width: pct(c) + '%' }"></div></div>
        </div>
        <div class="wc-action">
          <button v-if="c.claimable" class="wc-claim" :disabled="claimingKey === c.key" @click="onClaim(c)">
            🪙 {{ t('growth.weeklyClaim', { n: c.reward }) }}
          </button>
          <span v-else-if="c.claimed" class="wc-claimed">✓ {{ t('growth.weeklyClaimed') }}</span>
          <span v-else class="wc-reward">🪙 {{ c.reward }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth, type WeeklyChallenge } from '@/composables/useGrowth.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';

  const { t, te } = useI18n();
  const { weekly, loadWeekly, claimWeekly } = useGrowth();

  const ICONS: Record<string, string> = { wk_bookmark: '📚', wk_note: '📝', wk_checkin: '📅' };
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
    if (claimingKey.value) return;
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

  onMounted(loadWeekly);
</script>

<style scoped lang="less">
  .wc {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .wc-title {
    font-size: 15px;
    font-weight: 700;
  }
  .wc-sub {
    margin-top: 3px;
    font-size: 12px;
    color: var(--desc-color);
  }
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
    font-size: 22px;
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
    font-size: 11.5px;
    font-weight: 700;
    color: #16a34a;
  }
  .wc-reward {
    font-size: 12px;
    font-weight: 600;
    color: #d97706;
  }
</style>
