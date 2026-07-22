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
          <BPopover
            v-if="!g.isMax"
            v-model:open="earnPopoverOpen"
            trigger="click"
            placement="bottom-left"
            overlay-class-name="gc-earn-popover-panel"
          >
            <BButton
              class="gc-earn-trigger"
              :aria-label="t('growth.earnTitle')"
              :aria-expanded="earnPopoverOpen"
              v-click-log="{ module: '成长', operation: '查看经验获取规则' }"
            >
              <SvgIcon :src="icon.message.info" size="17" />
            </BButton>
            <template #content>
              <div class="gc-earn-popover">
                <div class="gc-earn-popover-head">
                  <span class="gc-earn-popover-title">{{ t('growth.earnTitle') }}</span>
                  <span class="gc-earn-popover-progress">
                    {{ t('growth.dailyTitle') }}
                    <b>{{ (g.dailyExp || 0).toLocaleString('en-US') }} / {{ (g.dailyCap || 0).toLocaleString('en-US') }}</b>
                  </span>
                </div>
                <div class="gc-earn-list">
                  <div class="gc-earn-item"><span>{{ t('growth.earnCheckin') }}</span><b>+5~10</b></div>
                  <div class="gc-earn-item"><span>{{ t('growth.earnCreate') }}</span><b>+10~15</b></div>
                  <div class="gc-earn-item"><span>{{ t('growth.earnFirst') }}</span><b>+30</b></div>
                  <div class="gc-earn-item"><span>{{ t('growth.earnProfile') }}</span><b>+20</b></div>
                </div>
                <div v-if="g.dailyCapReached" class="gc-earn-popover-tip">{{ t('growth.dailyReached') }}</div>
              </div>
            </template>
          </BPopover>
        </div>
        <div class="gc-exp">
          {{ t('growth.totalExp', { n: g.exp.toLocaleString('en-US') }) }}
          <span class="gc-points">· 🪙 {{ (g.points || 0).toLocaleString('en-US') }} {{ t('growth.points') }}</span>
        </div>
      </div>
      <BButton class="gc-checkin" :class="{ done: g.checkedInToday }" :disabled="g.checkedInToday || checking" @click="onCheckin">
        {{ g.checkedInToday ? t('growth.checkedIn') : t('growth.checkin') }}
      </BButton>
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

    <!-- 所有用户共用顶部签到日历，避免普通用户再多一张独立卡片。 -->
    <SigninCalendar
      class="gc-calendar"
      wide
      :checkin-days="stats?.checkinDays || []"
      :checked-in-today="g.checkedInToday"
      :streak="g.streak"
      :makeup-days="g.makeupDays || []"
      @makeup="onUseCard"
    />
    </div>

    <RankLadder class="gc-ladder" />
  </div>

  <LevelUpOverlay v-if="lvUp" :level="lvUp.level" :name="lvUp.name" @close="lvUp = null" />
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import RankLadder from '@/components/growth/RankLadder.vue';
  import LevelUpOverlay from '@/components/growth/LevelUpOverlay.vue';
  import SigninCalendar from '@/components/growth/SigninCalendar.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';
  import icon from '@/config/icon.ts';
  import { tierOf, TIER_GRADIENTS } from '@/config/growthTier';

  const { t } = useI18n();
  const { growth: g, dashboard, load, loadDashboard, doCheckin, useProtectCard, markRead } = useGrowth();
  const emit = defineEmits<{ (event: 'activity-changed'): void }>();
  const checking = ref(false);
  const lvUp = ref<{ level: number; name: string } | null>(null); // 升级动画数据
  const earnPopoverOpen = ref(false);

  // 浮层通过 Teleport 挂到 body 并使用 fixed 定位；页面滚动时收起，
  // 避免触发点已经离开视口后，规则卡被定位逻辑钳在页面顶部。
  function closeEarnPopoverOnScroll() {
    earnPopoverOpen.value = false;
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
        emit('activity-changed');
      }
      // 游客:后端返回 status 'preview',request 拦截已统一弹注册引导,这里无需处理
    } catch (err) {
      console.error('签到失败:', err);
    } finally {
      checking.value = false;
    }
  }

  onMounted(async () => {
    document.addEventListener('scroll', closeEarnPopoverOnScroll, true);
    await load(true); // 强制拉最新(升级是后端异步发生,不 force 会读到升级前的缓存)
    // 进成长页即视为查看升级通知:提示 + 标记已读(清红点)
    if (g.value?.hasUnreadLevelUp) {
      lvUp.value = { level: g.value.level, name: g.value.name }; // 之前升级未看过 → 进页补一次庆祝动画
      markRead();
    }
  });

  onBeforeUnmount(() => {
    document.removeEventListener('scroll', closeEarnPopoverOnScroll, true);
  });

  // 段位分档:tier 计算收口在 config/growthTier
  const tier = computed(() => tierOf(g.value?.level || 1));
  // 签到日历的逐日明细来自成长页已加载的共享看板(useGrowth 单例)。
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

  const usingCard = ref(false);
  async function onUseCard(date: string) {
    if (usingCard.value) return;
    usingCard.value = true;
    try {
      const res = await useProtectCard(date);
      if (res?.status === 200 && res.data?.ok) {
        message.success(t('growth.protectCardOk', { n: res.data.streak }));
        recordOperation({ module: '成长', operation: `使用补签卡补签 ${date}（连签续至 ${res.data.streak} 天）` });
        loadDashboard();
        emit('activity-changed');
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
      align-items: stretch; /* 两栏等高:右侧段位路线撑满左侧高度,不再左高右矮 */
      gap: 28px;
    }
    .gc-main {
      flex: 1 1 auto;
    }
    .gc-ladder {
      flex: 0 0 360px; /* 加宽:容纳「20G · 2000k · 永久 · 🎟️5」不再挤 */
      width: 360px;
      display: flex;
      flex-direction: column;
    }
    .gc-ladder :deep(.rank-ladder) {
      margin-top: 0;
      flex: 1 1 auto;
      min-height: 0;
    }
    .gc-ladder :deep(.rl-list) {
      max-height: none; /* 取消固定高,撑满两栏等高后的剩余空间,内部滚动 */
      flex: 1 1 auto;
      min-height: 0;
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
  .gc-earn-trigger {
    width: 22px;
    min-width: 22px;
    height: 22px !important;
    padding: 0 !important;
    border: 0 !important;
    border-radius: 6px;
    background: transparent !important;
    color: var(--desc-color);
  }
  .gc-earn-trigger:hover {
    color: var(--primary-color);
  }
  .gc-earn-trigger:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--primary-color) 45%, transparent);
    outline-offset: 2px;
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
    height: 36px !important;
    padding: 0 18px !important;
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
  .gc-checkin:hover:not(.disabled) {
    transform: translateY(-1px);
  }
  .gc-checkin.done,
  .gc-checkin.disabled {
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
  .gc-earn-popover {
    width: 100%;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .gc-earn-popover-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 45%, transparent);
  }
  .gc-earn-popover-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-color);
  }
  .gc-earn-popover-progress {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .gc-earn-popover-progress b {
    color: var(--primary-color);
    font-weight: 700;
  }
  .gc-earn-list {
    display: flex;
    flex-direction: column;
  }
  .gc-earn-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
    padding: 7px 0;
    border-bottom: 1px dashed color-mix(in srgb, var(--card-border-color) 30%, transparent);
  }
  .gc-earn-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  .gc-earn-item b {
    color: var(--primary-color);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .gc-earn-popover-tip {
    font-size: 11.5px;
    color: var(--primary-color);
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

<style lang="less">
  /* Teleport 到 body 的面板需要全局选择器；内容样式仍由上方 scoped 样式负责。 */
  .gc-earn-popover-panel {
    box-sizing: border-box;
    width: min(280px, calc(100vw - 24px));
    padding: 12px 14px;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 14px;
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow, 0 14px 32px rgba(15, 23, 42, 0.14));
  }
</style>
