<template>
  <div v-if="g" class="wg" @click="goGrowth">
    <div class="wg-left">
      <div class="wg-badge" :style="{ background: tierGradient(g.level) }">
        <span class="wg-lv">Lv.{{ g.level }}</span>
      </div>
      <div class="wg-meta">
        <div class="wg-name">
          {{ g.name }}
          <span v-if="g.isMax" class="wg-max">{{ t('growth.max') }}</span>
        </div>
        <div class="wg-exp">{{ t('growth.totalExp', { n: g.exp.toLocaleString('en-US') }) }}</div>
      </div>
    </div>

    <div class="wg-mid">
      <template v-if="!g.isMax">
        <div class="wg-progress" :title="`${g.progress}%`">
          <div class="wg-progress-fill" :style="{ width: g.progress + '%' }"></div>
        </div>
        <div class="wg-tonext">{{ t('growth.toNext', { n: g.expToNext.toLocaleString('en-US') }) }}</div>
      </template>
      <div v-else class="wg-maxhint">{{ t('workbench.growth.maxHint', '已达满级 · 感谢一路同行') }}</div>
      <div class="wg-streak">🔥 {{ t('growth.streak') }} {{ t('growth.daysVal', { n: g.streak }) }}</div>
    </div>

    <div class="wg-right">
      <button
        class="wg-checkin"
        :class="{ done: g.checkedInToday }"
        :disabled="g.checkedInToday || checking"
        @click.stop="onCheckin"
      >
        {{ g.checkedInToday ? t('growth.checkedIn') : t('growth.checkin') }}
      </button>
      <button v-if="claimable > 0" class="wg-claim" :disabled="claiming" @click.stop="onClaimAll">
        🎁 {{ t('growth.claimAll') }} · {{ claimable }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { tierGradient } from '@/config/growthTier';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';
  import { apiBaseGet, apiBasePost } from '@/http/request.ts';

  const { t } = useI18n();
  const router = useRouter();
  const { growth: g, load, doCheckin } = useGrowth();
  const checking = ref(false);
  const claimable = ref(0);
  const claiming = ref(false);

  async function loadClaimable() {
    try {
      const res = await apiBaseGet('/api/growth/claimable');
      if (res?.status === 200 && res.data) claimable.value = res.data.count || 0;
    } catch {
      /* 忽略 */
    }
  }

  async function onClaimAll() {
    if (claiming.value) return;
    claiming.value = true;
    try {
      const res = await apiBasePost('/api/growth/claimAll');
      if (res?.status === 200 && res.data?.ok) {
        if (res.data.claimed > 0) {
          message.success(t('growth.claimAllOk', { n: res.data.points }));
          recordOperation({ module: '工作台', operation: `一键领取成长奖励（${res.data.claimed} 项,+${res.data.points} 积分）` });
        } else {
          message.info(t('growth.claimAllNone'));
        }
        claimable.value = 0;
        load(true); // 刷新积分余额等
      }
    } catch (err) {
      console.error('一键领取失败:', err);
    } finally {
      claiming.value = false;
    }
  }

  onMounted(() => {
    load(); // 共享单例,首次拉一次即可
    loadClaimable();
  });

  function goGrowth() {
    router.push('/growth');
  }

  async function onCheckin() {
    if (checking.value || g.value?.checkedInToday) return;
    checking.value = true;
    try {
      const res = await doCheckin();
      if (res?.status === 200 && res.data?.ok) {
        if (res.data.already) {
          message.info(t('growth.alreadyChecked'));
        } else {
          message.success(t('growth.checkinSuccess', { n: res.data.expGained }));
          recordOperation({
            module: '工作台',
            operation: `每日签到（连续 ${res.data.streak} 天,+${res.data.expGained}）`,
          });
          if (res.data.leveledUp && res.data.growth) {
            message.success(t('growth.leveledUp', { lv: res.data.growth.level, name: res.data.growth.name }));
          }
        }
      }
      // 游客:doCheckin 后端返回 'preview',request 拦截统一弹注册引导
    } catch (err) {
      console.error('签到失败:', err);
    } finally {
      checking.value = false;
    }
  }
</script>

<style scoped lang="less">
  .wg {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 16px 20px;
    margin-bottom: 16px;
    border-radius: 16px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 55%, transparent);
    background: linear-gradient(
      120deg,
      color-mix(in srgb, var(--primary-color) 10%, var(--workbench-subcard-bg, var(--background-color))),
      var(--workbench-subcard-bg, var(--background-color)) 60%
    );
    cursor: pointer;
    transition:
      transform 0.18s ease,
      box-shadow 0.18s ease;
  }
  .wg:hover {
    transform: translateY(-1px);
    box-shadow: 0 12px 28px -20px color-mix(in srgb, var(--primary-color) 70%, transparent);
  }
  .wg-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
  }
  .wg-badge {
    width: 48px;
    height: 48px;
    border-radius: 13px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow: 0 8px 18px -10px rgba(0, 0, 0, 0.5);
  }
  .wg-lv {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  .wg-meta {
    min-width: 0;
  }
  .wg-name {
    font-size: 15px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .wg-max {
    font-size: 10.5px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 999px;
    color: #fff;
    background: linear-gradient(135deg, #f43f5e, #fb923c);
  }
  .wg-exp {
    font-size: 12px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  .wg-mid {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .wg-progress {
    height: 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 45%, transparent);
    overflow: hidden;
  }
  .wg-progress-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 60%, #22d3ee));
    transition: width 0.4s ease;
  }
  .wg-tonext,
  .wg-maxhint {
    font-size: 12px;
    color: var(--desc-color);
  }
  .wg-streak {
    font-size: 12.5px;
    color: var(--text-color);
    font-weight: 500;
  }
  .wg-right {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 6px;
  }
  .wg-checkin {
    padding: 8px 20px;
    border-radius: 10px;
    border: none;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
    background: linear-gradient(135deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 76%, #4b46cc));
    box-shadow: 0 8px 18px -12px color-mix(in srgb, var(--primary-color) 80%, transparent);
    transition: transform 0.15s;
  }
  .wg-checkin:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  .wg-checkin.done,
  .wg-checkin:disabled {
    background: color-mix(in srgb, var(--card-border-color) 40%, transparent);
    color: var(--desc-color);
    cursor: default;
    box-shadow: none;
  }
  .wg-claim {
    padding: 5px 14px;
    border-radius: 999px;
    border: none;
    font-size: 12px;
    font-weight: 700;
    color: #fff;
    cursor: pointer;
    background: linear-gradient(135deg, #f59e0b, #f97316);
    box-shadow: 0 6px 14px -8px rgba(245, 158, 11, 0.9);
    animation: wg-claim-pulse 1.6s infinite;
  }
  .wg-claim:disabled {
    opacity: 0.6;
    cursor: default;
    animation: none;
  }
  @keyframes wg-claim-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  .wg-more {
    font-size: 12px;
    color: var(--primary-color);
  }
  @media (max-width: 720px) {
    .wg {
      flex-wrap: wrap;
      gap: 12px;
    }
    .wg-mid {
      order: 3;
      flex-basis: 100%;
    }
    .wg-right {
      align-items: flex-start;
    }
  }
</style>
