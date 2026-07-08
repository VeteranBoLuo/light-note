<template>
  <div v-if="g" class="growth-card">
    <div class="gc-top">
      <div class="gc-badge" :class="`tier-${tier}`">
        <span class="gc-lv">Lv.{{ g.level }}</span>
      </div>
      <div class="gc-meta">
        <div class="gc-name">
          {{ g.name }}
          <span v-if="g.isMax" class="gc-max">{{ t('growth.max') }}</span>
        </div>
        <div class="gc-exp">{{ t('growth.totalExp', { n: g.exp.toLocaleString('en-US') }) }}</div>
      </div>
      <button class="gc-checkin" :class="{ done: g.checkedInToday }" :disabled="g.checkedInToday || checking" @click="onCheckin">
        {{ g.checkedInToday ? t('growth.checkedIn') : t('growth.checkin') }}
      </button>
    </div>

    <div v-if="!g.isMax" class="gc-progress" :title="`${g.progress}%`">
      <div class="gc-progress-fill" :style="{ width: g.progress + '%' }"></div>
    </div>
    <div v-if="!g.isMax" class="gc-tonext">{{ t('growth.toNext', { n: g.expToNext.toLocaleString('en-US') }) }}</div>

    <div class="gc-perks">
      <div class="gc-perk">
        <span class="gc-perk-label">{{ t('growth.space') }}</span>
        <b class="gc-perk-val">{{ spaceLabel }}</b>
      </div>
      <div class="gc-perk">
        <span class="gc-perk-label">{{ t('growth.aiQuota') }}</span>
        <b class="gc-perk-val">{{ tokenLabel }}</b>
      </div>
      <div class="gc-perk">
        <span class="gc-perk-label">{{ t('growth.streak') }}</span>
        <b class="gc-perk-val">{{ t('growth.daysVal', { n: g.streak }) }}</b>
      </div>
    </div>

    <div class="gc-earn">
      <div class="gc-earn-head">{{ t('growth.earnTitle') }}</div>
      <div class="gc-earn-list">
        <div class="gc-earn-item"><span>{{ t('growth.earnCheckin') }}</span><b>+5~10</b></div>
        <div class="gc-earn-item"><span>{{ t('growth.earnCreate') }}</span><b>+10~15</b></div>
        <div class="gc-earn-item"><span>{{ t('growth.earnFirst') }}</span><b>+30</b></div>
        <div class="gc-earn-item"><span>{{ t('growth.earnProfile') }}</span><b>+20</b></div>
        <div class="gc-earn-item"><span>{{ t('growth.earnTag') }}</span><b>+2</b></div>
      </div>
    </div>

    <RankLadder />
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import RankLadder from '@/components/growth/RankLadder.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';

  const { t } = useI18n();
  const { growth: g, load, doCheckin, markRead } = useGrowth();
  const checking = ref(false);

  onMounted(async () => {
    await load();
    // 进成长页即视为查看升级通知:提示 + 标记已读(清红点)
    if (g.value?.hasUnreadLevelUp) {
      message.success(t('growth.leveledUp', { lv: g.value.level, name: g.value.name }));
      markRead();
    }
  });

  // 段位分 5 档配色,越高越"贵重"(荣誉感)
  const tier = computed(() => {
    const l = g.value?.level || 1;
    return l >= 13 ? 5 : l >= 10 ? 4 : l >= 7 ? 3 : l >= 4 ? 2 : 1;
  });

  const spaceLabel = computed(() => {
    const mb = g.value?.spaceMb || 0;
    return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  });
  const tokenLabel = computed(() => (g.value?.aiTokenDaily || 0).toLocaleString('en-US'));

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
          recordOperation({ module: '成长', operation: `每日签到（连续 ${res.data.streak} 天，+${res.data.expGained}）` });
          if (res.data.leveledUp && res.data.growth) {
            message.success(t('growth.leveledUp', { lv: res.data.growth.level, name: res.data.growth.name }));
            recordOperation({ module: '成长', operation: `升级到 Lv.${res.data.growth.level} ${res.data.growth.name}` });
          }
        }
      }
      // 游客:后端返回 status 'preview',request 拦截已统一弹注册引导,这里无需处理
    } catch (err) {
      console.error('签到失败:', err);
    } finally {
      checking.value = false;
    }
  }
</script>

<style scoped lang="less">
  .growth-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .gc-top {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .gc-badge {
    flex: 0 0 auto;
    width: 52px;
    height: 52px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    box-shadow: 0 8px 18px -10px rgba(0, 0, 0, 0.5);
  }
  .gc-lv {
    font-size: 15px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  /* 段位分档配色 */
  .tier-1 {
    background: linear-gradient(135deg, #6b7280, #9ca3af);
  }
  .tier-2 {
    background: linear-gradient(135deg, #2563eb, #38bdf8);
  }
  .tier-3 {
    background: linear-gradient(135deg, #7c3aed, #a855f7);
  }
  .tier-4 {
    background: linear-gradient(135deg, #d97706, #fbbf24);
  }
  .tier-5 {
    background: linear-gradient(135deg, #db2777, #f43f5e, #fb923c);
  }
  .gc-meta {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .gc-name {
    font-size: 16px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .gc-max {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 999px;
    color: #fff;
    background: linear-gradient(135deg, #f43f5e, #fb923c);
  }
  .gc-exp {
    font-size: 12.5px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  .gc-checkin {
    flex: 0 0 auto;
    padding: 8px 18px;
    border-radius: 10px;
    border: none;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
    background: linear-gradient(135deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 76%, #4b46cc));
    box-shadow: 0 8px 18px -12px color-mix(in srgb, var(--primary-color) 80%, transparent);
    transition:
      transform 0.15s,
      opacity 0.15s;
  }
  .gc-checkin:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  .gc-checkin.done,
  .gc-checkin:disabled {
    background: color-mix(in srgb, var(--card-border-color) 40%, transparent);
    color: var(--desc-color);
    cursor: default;
    box-shadow: none;
  }
  .gc-progress {
    height: 8px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 45%, transparent);
    overflow: hidden;
  }
  .gc-progress-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 60%, #22d3ee));
    transition: width 0.4s ease;
  }
  .gc-tonext {
    font-size: 12px;
    color: var(--desc-color);
    margin-top: -6px;
  }
  .gc-perks {
    display: flex;
    gap: 10px;
  }
  .gc-perk {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
  }
  .gc-perk-label {
    font-size: 11.5px;
    color: var(--desc-color);
  }
  .gc-perk-val {
    font-size: 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .gc-earn {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gc-earn-head {
    font-size: 12px;
    font-weight: 600;
    color: var(--desc-color);
    letter-spacing: 0.03em;
  }
  .gc-earn-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 16px;
  }
  .gc-earn-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    padding: 6px 0;
    border-bottom: 1px dashed color-mix(in srgb, var(--card-border-color) 30%, transparent);
  }
  .gc-earn-item b {
    color: var(--primary-color);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  @media (max-width: 560px) {
    .gc-earn-list {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 560px) {
    .gc-perks {
      flex-direction: column;
    }
    .gc-perk {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }
  }
</style>
