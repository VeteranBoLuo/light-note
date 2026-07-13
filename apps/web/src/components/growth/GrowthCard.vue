<template>
  <div v-if="g" class="growth-card">
    <div class="gc-main">
    <div class="gc-top">
      <div class="gc-badge" :style="{ background: TIER_GRADIENTS[tier] }">
        <span class="gc-lv">Lv.{{ g.level }}</span>
      </div>
      <div class="gc-meta">
        <div class="gc-name">
          {{ t('growth.ranks.' + g.level) }}
          <span v-if="g.isMax" class="gc-max">{{ t('growth.max') }}</span>
        </div>
        <div class="gc-exp">
          {{ t('growth.totalExp', { n: g.exp.toLocaleString('en-US') }) }}
          <span class="gc-points">· 🪙 {{ (g.points || 0).toLocaleString('en-US') }} {{ t('growth.points') }}</span>
        </div>
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
        <span v-if="(g.spaceBonusMb || 0) > 0" class="gc-perk-bonus">{{ t('growth.spaceBonusTag', { n: bonusSpaceLabel }) }}</span>
      </div>
      <div class="gc-perk">
        <span class="gc-perk-label">{{ t('growth.aiQuota') }}</span>
        <b class="gc-perk-val">{{ tokenLabel }}</b>
      </div>
      <div class="gc-perk">
        <span class="gc-perk-label">{{ t('growth.trashRetain') }}</span>
        <b class="gc-perk-val">{{ (g.trashDays || 30) >= 3650 ? t('growth.trashForever') : t('growth.daysVal', { n: g.trashDays || 30 }) }}</b>
      </div>
      <div class="gc-perk">
        <span class="gc-perk-label">{{ t('growth.streak') }}</span>
        <b class="gc-perk-val">{{ t('growth.daysVal', { n: g.streak }) }}</b>
      </div>
    </div>

    <!-- 补签卡:展示张数和获取说明;补签操作在下方日历 -->
    <div class="gc-protect">
      <span class="gc-protect-info">🎫 {{ t('growth.protectCard') }} × {{ g.protectCards || 0 }}</span>
      <span class="gc-protect-hint">{{ t('growth.protectCardHint') }}</span>
    </div>

    <!-- 每日经验:展示今日已得 / 每日上限,到顶给出提示 -->
    <div v-if="!g.isMax" class="gc-daily">
      <div class="gc-daily-head">
        <span>{{ t('growth.dailyTitle') }}</span>
        <span class="gc-daily-num" :class="{ full: g.dailyCapReached }">{{ g.dailyExp }} / {{ g.dailyCap }}</span>
      </div>
      <div class="gc-daily-bar">
        <div class="gc-daily-fill" :class="{ full: g.dailyCapReached }" :style="{ width: dailyPercent + '%' }"></div>
      </div>
      <div v-if="g.dailyCapReached" class="gc-daily-tip">{{ t('growth.dailyReached') }}</div>
    </div>

    <!-- 满级:不再获取经验,左栏改放签到日历,撑满留白且不与下方「数据统计」重复 -->
    <SigninCalendar
      v-if="g.isMax"
      class="gc-calendar"
      wide
      :checkin-days="stats?.checkinDays || []"
      :checked-in-today="g.checkedInToday"
      :streak="g.streak"
    />
    <div v-else class="gc-earn">
      <div class="gc-earn-head">{{ t('growth.earnTitle') }}</div>
      <div class="gc-earn-list">
        <div class="gc-earn-item"><span>{{ t('growth.earnCheckin') }}</span><b>+5~10</b></div>
        <div class="gc-earn-item"><span>{{ t('growth.earnCreate') }}</span><b>+10~15</b></div>
        <div class="gc-earn-item"><span>{{ t('growth.earnFirst') }}</span><b>+30</b></div>
        <div class="gc-earn-item"><span>{{ t('growth.earnProfile') }}</span><b>+20</b></div>
      </div>
    </div>
    </div>

    <RankLadder class="gc-ladder" />
  </div>

  <LevelUpOverlay v-if="lvUp" :level="lvUp.level" :name="lvUp.name" @close="lvUp = null" />
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import RankLadder from '@/components/growth/RankLadder.vue';
  import LevelUpOverlay from '@/components/growth/LevelUpOverlay.vue';
  import SigninCalendar from '@/components/growth/SigninCalendar.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';
  import { tierOf, TIER_GRADIENTS } from '@/config/growthTier';

  const { t } = useI18n();
  const { growth: g, dashboard, load, loadDashboard, doCheckin, useProtectCard, markRead } = useGrowth();
  const checking = ref(false);
  const lvUp = ref<{ level: number; name: string } | null>(null); // 升级动画数据

  onMounted(async () => {
    await load(true); // 强制拉最新(升级是后端异步发生,不 force 会读到升级前的缓存)
    // 进成长页即视为查看升级通知:提示 + 标记已读(清红点)
    if (g.value?.hasUnreadLevelUp) {
      lvUp.value = { level: g.value.level, name: g.value.name }; // 之前升级未看过 → 进页补一次庆祝动画
      markRead();
    }
  });

  // 段位分档:tier 计算收口在 config/growthTier
  const tier = computed(() => tierOf(g.value?.level || 1));
  // 满级时用数据统计摘要替代「怎么获取经验」;数据取自成长页已加载的共享看板(useGrowth 单例)
  const stats = computed(() => dashboard.value?.stats || null);

  const fmtMb = (mb: number) => (mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`);
  const spaceLabel = computed(() => fmtMb(g.value?.spaceMb || 0));
  const bonusSpaceLabel = computed(() => fmtMb(g.value?.spaceBonusMb || 0)); // 已扩容部分,单独标注
  const tokenLabel = computed(() => (g.value?.aiTokenDaily || 0).toLocaleString('en-US'));
  // 今日经验进度百分比(0-100)
  const dailyPercent = computed(() => {
    const cap = g.value?.dailyCap || 0;
    if (!cap) return 0;
    return Math.min(100, Math.round(((g.value?.dailyExp || 0) / cap) * 100));
  });

  async function onCheckin() {
    if (checking.value || g.value?.checkedInToday) return;
    checking.value = true;
    try {
      const res = await doCheckin();
      if (res?.status === 200 && res.data?.ok) {
        if (res.data.already) {
          message.info(t('growth.alreadyChecked'));
        } else {
          const pts = res.data.pointsEarned || 0;
          if (pts > 0) {
            message.success(t('growth.checkinSuccessPts', { n: res.data.expGained, p: pts }));
          } else {
            message.success(t('growth.checkinSuccess', { n: res.data.expGained }));
          }
          recordOperation({ module: '成长', operation: `每日签到（连续 ${res.data.streak} 天，经验+${res.data.expGained}、积分+${pts}）` });
          if (res.data.leveledUp && res.data.growth) {
            lvUp.value = { level: res.data.growth.level, name: res.data.growth.name }; // 触发升级庆祝动画
            markRead(); // 签到升级当场已看动画 → 立即标记已读,避免刷新页面重复弹
            recordOperation({ module: '成长', operation: `升级到 Lv.${res.data.growth.level} ${res.data.growth.name}` });
          }
          // 连签里程碑大奖:额外弹一条庆祝并记录(奖励含积分/永久存储/补签卡)
          if (res.data.milestone) {
            const m = res.data.milestone;
            const parts = [`+${m.points} ${t('growth.points')}`];
            if (m.storageMb) parts.push(`+${m.storageMb}MB`);
            if (m.cards) parts.push(`+${m.cards} ${t('growth.milestoneCardUnit')}`);
            message.success(t('growth.streakMilestoneToast', { days: m.days, reward: parts.join(' · ') }));
            recordOperation({
              module: '成长',
              operation: `连签里程碑 ${m.days} 天达成（+${m.points}积分${m.storageMb ? '、+' + m.storageMb + 'MB' : ''}${m.cards ? '、+' + m.cards + '补签卡' : ''}）`,
            });
          }
        }
        // 签到后刷新看板:同页的「今日任务」签到项、签到日历、数据统计随之更新,无需手动刷新
        loadDashboard();
      }
      // 游客:后端返回 status 'preview',request 拦截已统一弹注册引导,这里无需处理
    } catch (err) {
      console.error('签到失败:', err);
    } finally {
      checking.value = false;
    }
  }

  const usingCard = ref(false);
  async function onUseCard() {
    if (usingCard.value) return;
    usingCard.value = true;
    try {
      const res = await useProtectCard();
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('growth.protectCardOk', { n: res.data.streak }));
        recordOperation({ module: '成长', operation: `使用补签卡（连签续至 ${res.data.streak} 天）` });
        loadDashboard();
      } else {
        message.info(t('growth.protectCardFail'));
      }
    } catch (err) {
      console.error('补签失败:', err);
    } finally {
      usingCard.value = false;
    }
  }
</script>

<style scoped lang="less">
  .growth-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .gc-main {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
  }
  /* 大屏两栏:左信息 + 右段位路线,消除单列居中的两侧留白 */
  @media (min-width: 900px) {
    .growth-card {
      flex-direction: row;
      align-items: flex-start;
      gap: 28px;
    }
    .gc-main {
      flex: 1 1 auto;
    }
    .gc-ladder {
      flex: 0 0 320px;
      width: 320px;
    }
    .gc-ladder :deep(.rank-ladder) {
      margin-top: 0;
    }
    .gc-ladder :deep(.rl-list) {
      max-height: 460px;
    }
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
  .gc-title-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 1px 8px;
    border-radius: 999px;
    color: #fff;
    background: linear-gradient(135deg, var(--primary-color), #22d3ee);
    white-space: nowrap;
  }
  .gc-exp {
    font-size: 12.5px;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  .gc-points {
    color: #d97706;
    font-weight: 600;
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
    flex-wrap: wrap;
    gap: 10px;
  }
  .gc-perk {
    flex: 1 1 calc(25% - 8px);
    min-width: 88px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 10px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
  }
  .gc-protect {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
    padding: 8px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, #f59e0b 8%, var(--background-color));
    border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
    font-size: 12.5px;
  }
  .gc-protect-info {
    font-weight: 600;
  }
  .gc-protect-btn {
    margin-left: auto;
    padding: 4px 12px;
    border-radius: 999px;
    border: none;
    background: linear-gradient(135deg, #f59e0b, #f97316);
    color: #fff;
    font-size: 12px;
    cursor: pointer;
  }
  .gc-protect-btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .gc-protect-hint {
    margin-left: auto;
    color: var(--desc-color);
    font-size: 11px;
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
  .gc-perk-bonus {
    font-size: 10.5px;
    font-weight: 600;
    color: #d97706;
    margin-top: 1px;
  }
  /* 每日经验 */
  .gc-daily {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .gc-daily-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: var(--desc-color);
  }
  .gc-daily-num {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    color: var(--text-color);
  }
  .gc-daily-num.full {
    color: var(--primary-color);
  }
  .gc-daily-bar {
    height: 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 45%, transparent);
    overflow: hidden;
  }
  .gc-daily-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #34d399, #22d3ee);
    transition: width 0.4s ease;
  }
  .gc-daily-fill.full {
    background: linear-gradient(90deg, var(--primary-color), #f43f5e);
  }
  .gc-daily-tip {
    font-size: 11.5px;
    color: var(--primary-color);
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
