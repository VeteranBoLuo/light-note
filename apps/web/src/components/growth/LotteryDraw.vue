<template>
  <div class="lt" :class="{ 'is-mobile': bookmark.isMobile, 'is-narrow': bookmark.isMobileDevice }">
    <header class="lt-header">
      <div class="lt-heading"
        ><h2 id="lottery-title">{{ t('growth.lotteryTitle') }}</h2
        ><p>{{ t('growth.lotterySubtitle') }}</p></div
      >
      <div class="lt-wallet"
        ><span>{{ t('growth.myPoints') }}</span
        ><strong v-if="lottery">{{ points.toLocaleString(locale) }}</strong
        ><BLoading v-else inline loading
      /></div>
      <BButton class="lt-history-button" @click="records?.open()"
        ><SvgIcon :src="icon.noteDetail.history" :size="17" />{{ t('growth.lotteryHistoryTitle') }}</BButton
      >
      <BButton v-if="!bookmark.isMobile" type="text" @click="goBackpack"
        >{{ t('growth.inventoryTitle') }}<SvgIcon :src="icon.arrow_right" :size="15"
      /></BButton>
    </header>
    <BTabs v-model:active-tab="activePoolMode" class="lt-pool-tabs" variant="line" :options="poolModeOptions" />
    <div v-if="!lottery && !lotteryError" class="lt-state"
      ><BLoading inline loading :title="t('growth.lotteryLoading')"
    /></div>
    <div v-else-if="!lottery" class="lt-state" role="alert"
      >{{ t('growth.lotteryLoadFailed') }}<BButton @click="loadLottery">{{ t('common.retry') }}</BButton></div
    >
    <div v-else class="lt-layout">
      <section class="lt-machine" :aria-busy="rolling || undefined" aria-labelledby="lottery-title">
        <div class="lt-machine-head"
          ><strong>{{
            t(activePoolMode === 'free' ? 'growth.lotteryFreePoolTab' : 'growth.lotteryPaidPoolTab')
          }}</strong>
          <BButton v-if="canSkip" type="text" class="lt-skip" @click="presentation.skip()">
            <SvgIcon :src="icon.growth.skip" :size="16" />{{ t('growth.lotterySkipAnimation') }}
          </BButton>
          <span v-else>{{
            activePoolMode === 'free'
              ? t('growth.lotteryLevelBenefit', { level: lottery.level })
              : t('growth.lotteryPityPoolHint', { n: pityEvery })
          }}</span></div
        >
        <LotteryRevealStage
          :phase="visiblePhase"
          :results="visibleResults"
          :drawing-times="drawingTimes"
          :motion-reduced="motionReduced || animationSkipped"
          :narrow="bookmark.isMobileDevice"
          :idle-title="idleTitle"
          :idle-hint="t(activePoolMode === 'free' ? 'growth.lotteryStageIdleHint' : 'growth.lotteryPaidIdleHint')"
          :delivery="resultDelivery"
          :retry-allowed="canRetry"
          @retry="retryDraw"
          @history="records?.open()"
          @backpack="goBackpack"
        />
        <div
          v-if="activePoolCountsPity"
          class="lt-pity-panel"
          :class="{ 'is-triggered': pityTriggered && lastMode === activePoolMode }"
        >
          <div
            ><strong>{{
              pityTriggered && lastMode === activePoolMode
                ? t('growth.lotteryPityTriggered')
                : t('growth.lotteryPityLeft', { n: pityRemaining })
            }}</strong
            ><span>{{ pityCurrent }}/{{ pityEvery }}</span></div
          >
          <div
            class="lt-progress"
            role="progressbar"
            :aria-label="t('growth.lotteryPaidPityTitle')"
            :aria-valuenow="pityCurrent"
            :aria-valuemax="pityEvery"
            aria-valuemin="0"
            ><span :style="{ width: `${pityPercent}%` }"></span
          ></div>
          <small>{{ t('growth.lotteryPaidPityOnly') }}</small>
        </div>
        <div class="lt-draw-options">
          <template v-if="activePoolMode === 'free'">
            <BButton
              class="lt-draw-button lt-draw-button--free"
              type="primary"
              :loading="rolling"
              :disabled="readOnly || !canFree"
              @click="onDraw(1, true)"
              >{{
                t(
                  rolling
                    ? 'growth.lotteryFreeDrawAction'
                    : isVisitor
                      ? 'growth.lotteryVisitorTip'
                      : freeDaily === 0
                        ? 'growth.lotteryFreeLocked'
                        : freeRemaining > 0
                          ? 'growth.lotteryFreeDrawAction'
                          : 'growth.lotteryFreeUsedUp',
                )
              }}</BButton
            >
            <p
              >{{ t('growth.lotteryTodayAvailability', { remaining: freeRemaining, total: freeDaily }) }} ·
              {{
                t(lottery.free.countsPaidPity ? 'growth.lotteryFreeCountsPity' : 'growth.lotteryFreeDoesNotCountPity')
              }}</p
            >
          </template>
          <template v-else>
            <div class="lt-paid-actions">
              <BButton
                class="lt-draw-button lt-draw-button--paid"
                type="primary"
                :loading="rolling && drawingTimes === 1"
                :disabled="readOnly || !canDraw(1)"
                @click="onDraw(1)"
                >{{ t('growth.lotteryDrawOne') }} ·
                {{ t('growth.lotteryCostLabel', { n: lottery.paid.singleCost.toLocaleString(locale) }) }}</BButton
              >
              <BButton
                class="lt-draw-button lt-draw-button--ten"
                :loading="rolling && drawingTimes === 10"
                :disabled="readOnly || !canDraw(10)"
                @click="onDraw(10)"
                >{{ t('growth.lotteryDrawTen') }} ·
                {{ t('growth.lotteryCostLabel', { n: lottery.paid.tenCost.toLocaleString(locale) }) }}</BButton
              >
            </div>
            <p v-if="points < lottery.paid.singleCost">{{ t('growth.shopInsufficient') }}</p>
          </template>
          <p v-if="drawError" class="lt-draw-error" role="alert">{{ drawError }}</p>
          <p v-if="readOnly">{{ t('growth.adminContextActionUnavailable') }}</p>
          <p v-else-if="isVisitor">{{ t('growth.lotteryVisitorTip') }}</p>
          <p v-else-if="!activeModeEnabled">{{ t('growth.lotteryModeMaintenance') }}</p>
        </div>
        <footer class="lt-machine-footer"
          ><SvgIcon :src="icon.growth.ai" :size="17" /><span>{{ t('growth.lotteryAutoCreditHint') }}</span></footer
        >
      </section>
      <section class="lt-side" :aria-label="t('growth.lotteryPoolTitle')">
        <header class="lt-pool-head"
          ><h3>{{ t(activePoolMode === 'free' ? 'growth.lotteryFreePoolTitle' : 'growth.lotteryPaidPoolTitle') }}</h3>
          <BButton type="text" :aria-expanded="showOdds" aria-controls="lottery-odds" @click="showOdds = !showOdds"
            >{{ t('growth.lotteryOdds')
            }}<SvgIcon :src="icon.noteTree.chevron" :size="14" :class="{ 'is-open': showOdds }" /></BButton
        ></header>
        <div class="lt-pool-columns"
          ><span>{{ t('growth.lotteryOddsPrize') }}</span
          ><span>{{ t('growth.lotteryNormalOdds') }}</span
          ><span v-if="showOdds && activePoolCountsPity">{{ t('growth.lotteryPityOdds') }}</span></div
        >
        <div
          v-for="prize in activePool"
          :key="prize.id"
          class="lt-pool-item"
          :class="{ 'show-pity': showOdds && activePoolCountsPity }"
        >
          <div
            ><SvgIcon :src="prizeIcon(prize)" :size="21" /><span
              >{{ label(prize)
              }}<small v-if="prize.rare" class="lt-prize-rare">{{ t('growth.lotteryPityPoolBadge') }}</small></span
            ></div
          >
          <span>{{ formatRate(prize.normalRate ?? prize.rate) }}</span
          ><span v-if="showOdds && activePoolCountsPity">{{
            prize.pityRate ? formatRate(prize.pityRate) : t('growth.lotteryPityNotApplicable')
          }}</span>
        </div>
        <p class="lt-pool-note">{{ t('growth.lotteryPermanentHint') }}</p>
        <p v-if="showOdds" id="lottery-odds" class="lt-pool-note">{{
          t(activePoolCountsPity ? 'growth.lotteryPityExplanation' : 'growth.lotteryFreePoolHint', { n: pityEvery })
        }}</p>
        <p v-if="showOdds && activePoolHasMakeupCard && lottery.paid.overflowPolicy" class="lt-pool-note">{{
          t('growth.lotteryOverflowPolicy', {
            max: lottery.paid.overflowPolicy.maxInventory,
            points: lottery.paid.overflowPolicy.compensationPoints,
          })
        }}</p>
      </section>
    </div>
    <LotteryRecords ref="records" :revision="historyRevision" />
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useGrowth, type LotteryPrize } from '@/composables/useGrowth';
  import { bookmarkStore, useUserStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import LotteryRecords from './LotteryRecords.vue';
  import LotteryRevealStage from './LotteryRevealStage.vue';
  import { useLotteryReveal } from './useLotteryReveal';
  import { prizeIcon, prizeLabel } from '@/utils/lotteryPresentation';
  import { isAmbiguousPointsEconomyFailure } from '@/utils/pointsEconomyRequest';
  import icon from '@/config/icon';
  import { recordOperation } from '@/api/commonApi';

  const { t, locale } = useI18n();
  const router = useRouter();
  const props = withDefaults(defineProps<{ readOnly?: boolean }>(), { readOnly: false });
  const emit = defineEmits<{ 'focus-header': [] }>();
  const readOnly = computed(() => props.readOnly);
  const { lottery, lotteryError, loadLottery, draw } = useGrowth();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const records = ref<InstanceType<typeof LotteryRecords> | null>(null);
  const historyRevision = ref(0);
  const presentation = useLotteryReveal();
  const {
    phase: revealPhase,
    results: revealed,
    busy: rolling,
    skipped: animationSkipped,
    motionReduced,
  } = presentation;
  const drawingTimes = ref(1);
  const drawError = ref('');
  const retryAllowed = ref(false);
  const pityTriggered = ref(false);
  const showOdds = ref(false);
  const activePoolMode = ref<'free' | 'paid'>('free');
  const lastMode = ref<'free' | 'paid'>('free');
  const visibleResults = computed(() => (lastMode.value === activePoolMode.value ? revealed.value : []));
  const visiblePhase = computed(() => (lastMode.value === activePoolMode.value ? revealPhase.value : 'idle'));
  const unresolved = computed(() => revealPhase.value === 'uncertain' && retryAllowed.value);
  const canSkip = computed(() => rolling.value && !animationSkipped.value && !motionReduced.value);
  const isVisitor = computed(() => !user.id || user.id === 'visitor');
  const canRetry = computed(() => unresolved.value && !rolling.value && !readOnly.value && !isVisitor.value);
  const points = computed(() => lottery.value?.points || 0);
  const freeDaily = computed(() => lottery.value?.free.daily || 0);
  const freeRemaining = computed(() => lottery.value?.free.remaining || 0);
  const pityEvery = computed(() => lottery.value?.paid.pityEvery || 10);
  const pityRemaining = computed(() => lottery.value?.paid.toPity || pityEvery.value);
  const pityCurrent = computed(() => Math.max(0, pityEvery.value - pityRemaining.value));
  const pityPercent = computed(() => Math.min(100, (pityCurrent.value / pityEvery.value) * 100));
  const canFree = computed(
    () =>
      !rolling.value &&
      !unresolved.value &&
      !isVisitor.value &&
      Boolean(lottery.value?.free.enabled) &&
      freeRemaining.value > 0,
  );
  const poolModeOptions = computed(() => [
    { key: 'free', label: t('growth.lotteryFreePoolTab'), disabled: rolling.value || unresolved.value },
    { key: 'paid', label: t('growth.lotteryPaidPoolTab'), disabled: rolling.value || unresolved.value },
  ]);
  const activePool = computed(() =>
    activePoolMode.value === 'free' ? lottery.value?.free.pool || [] : lottery.value?.paid.pool || [],
  );
  const activePoolCountsPity = computed(
    () => activePoolMode.value === 'paid' || Boolean(lottery.value?.free.countsPaidPity),
  );
  const activePoolHasMakeupCard = computed(() => activePool.value.some((prize) => prize.kind === 'card'));
  const activeModeEnabled = computed(() =>
    activePoolMode.value === 'free' ? Boolean(lottery.value?.free.enabled) : Boolean(lottery.value?.paid.enabled),
  );
  const resultDelivery = computed(() =>
    t(
      visibleResults.value.every((prize) => prize.kind === 'ai_pack')
        ? 'growth.lotteryAiCredited'
        : 'growth.lotteryRewardsDelivered',
    ),
  );
  const label = (prize: LotteryPrize) => prizeLabel(prize, t, locale.value);
  const idleTitle = computed(() =>
    t(
      activePoolMode.value === 'free'
        ? freeRemaining.value > 0
          ? 'growth.lotteryStageIdleTitle'
          : freeDaily.value > 0
            ? 'growth.lotteryFreeUsedUp'
            : 'growth.lotteryFreeLocked'
        : 'growth.lotteryPaidIdle',
    ),
  );
  const formatRate = (rate?: number) =>
    `${Number(rate || 0)
      .toFixed(2)
      .replace(/\.00$/, '')}%`;
  const goBackpack = () => router.push({ path: '/growth', query: { section: 'rewards', reward: 'inventory' } });
  function canDraw(times: number) {
    if (rolling.value || unresolved.value || isVisitor.value || !lottery.value) return false;
    return (
      lottery.value.paid.enabled &&
      points.value >= (times === 10 ? lottery.value.paid.tenCost : lottery.value.paid.singleCost)
    );
  }
  let generation = 0;
  watch(
    () => [user.id, user.adminContext?.id].join('|'),
    () => {
      ++generation;
      presentation.reset();
      drawError.value = '';
      retryAllowed.value = false;
      pityTriggered.value = false;
    },
  );
  watch(
    () => lottery.value?.free.daily,
    (daily) => {
      if (daily === 0 && !rolling.value && !unresolved.value) activePoolMode.value = 'paid';
    },
    { immediate: true },
  );
  onBeforeUnmount(() => {
    ++generation;
  });
  function retryDraw() {
    if (canRetry.value) void onDraw(drawingTimes.value, lastMode.value === 'free', true);
  }
  async function onDraw(times: number, free = false, retry = false) {
    if (retry ? !canRetry.value : readOnly.value || (free ? !canFree.value : !canDraw(times))) return;
    const requestGeneration = ++generation;
    presentation.begin();
    drawingTimes.value = times;
    drawError.value = '';
    retryAllowed.value = false;
    pityTriggered.value = false;
    lastMode.value = free ? 'free' : 'paid';
    emit('focus-header');
    try {
      const res = await draw(times, free);
      if (requestGeneration !== generation) return;
      if (res?.status === 200 && res.data?.ok) {
        const results = Array.isArray(res.data.results) ? res.data.results : [];
        presentation.accept(results);
        pityTriggered.value = Boolean(res.data.pityTriggered || results.some((prize) => prize.guaranteed));
        historyRevision.value++;
        recordOperation({
          module: '成长',
          operation: `积分抽奖 ${free ? '免费抽' : times === 10 ? '十连' : '单抽'}（-${res.data.cost} 积分）`,
        });
      } else if (res?.data?.code === 'IDEMPOTENCY_RESULT_PENDING') {
        retryAllowed.value = true;
        presentation.uncertain();
      } else {
        presentation.reset();
        drawError.value =
          res?.status === 409 && res.data?.refresh
            ? t('growth.economyCatalogChanged')
            : res?.data?.msg || res?.msg || t('growth.lotteryDrawFailed');
      }
    } catch (error) {
      if (requestGeneration !== generation) return;
      if (isAmbiguousPointsEconomyFailure(error)) {
        retryAllowed.value = true;
        presentation.uncertain();
      } else {
        presentation.reset();
        drawError.value = t('growth.lotteryDrawFailed');
      }
    }
  }
  onMounted(loadLottery);
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';
  .lt {
    display: flex;
    flex-direction: column;
    gap: .ui-space(20px) [];
    color: var(--text-color);
  }
  .lt-header {
    display: flex;
    align-items: center;
    gap: .ui-space(16px) [];
  }
  .lt-heading {
    flex: 1;
    min-width: 0;
  }
  .lt-heading h2 {
    margin: 0;
    font-size: .ui-font(24px) [];
    font-weight: 700;
  }
  .lt-heading p {
    margin: .ui-space(6px) [] 0 0;
    font-size: .ui-font(13px) [];
    color: var(--desc-color);
  }
  .lt-header .b_btn {
    gap: .ui-space(6px) [];
    flex-shrink: 0;
  }
  .lt-wallet {
    display: flex;
    align-items: baseline;
    gap: .ui-space(8px) [];
    font-size: .ui-font(13px) [];
    white-space: nowrap;
  }
  .lt-wallet span {
    color: var(--desc-color);
  }
  .lt-wallet strong {
    font-size: .ui-font(19px) [];
    font-variant-numeric: tabular-nums;
  }
  .lt-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: .ui-space(18px) [];
  }
  .lt-machine,
  .lt-side {
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    min-width: 0;
  }
  .lt-machine {
    background: var(--workspace-content);
    padding: .ui-space(20px) [];
    display: flex;
    flex-direction: column;
  }
  .lt-machine-head {
    min-height: .ui-control(32px) [];
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: .ui-space(12px) [];
    font-size: .ui-font(15px) [];
  }
  .lt-machine-head > span {
    color: var(--chip-pin-fg);
    font-size: .ui-font(12px) [];
    text-align: right;
  }
  .lt-prize-rare {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--primary-color);
    color: var(--chip-pin-fg);
    border-radius: 4px;
    padding: .ui-space(2px) [] .ui-space(4px) [];
    font-size: .ui-font(10px) [];
    font-weight: 500;
    line-height: 1.2;
  }
  .lt-pity-panel {
    border: 1px solid var(--workspace-border);
    background: var(--workspace-content);
    border-radius: 10px;
    padding: .ui-space(12px) [];
    margin-bottom: .ui-space(14px) [];
  }
  .lt-pity-panel > div:first-child {
    display: flex;
    justify-content: space-between;
    gap: .ui-space(8px) [];
    font-size: .ui-font(13px) [];
  }
  .lt-pity-panel small {
    color: var(--desc-color);
    font-size: .ui-font(11px) [];
  }
  .lt-pity-panel.is-triggered {
    border-color: var(--primary-color);
  }
  .lt-progress {
    height: .ui-layout(8px) [];
    background: var(--workspace-divider);
    border-radius: 4px;
    margin: .ui-space(8px) [] 0;
    overflow: hidden;
  }
  .lt-progress > span {
    height: 100%;
    display: block;
    background: var(--primary-color);
    border-radius: inherit;
  }
  .lt-machine-head .lt-skip {
    gap: .ui-space(6px) [];
    font-size: .ui-font(12px) [];
  }
  .lt-draw-options .lt-draw-error {
    color: var(--danger-color);
  }
  .lt-draw-options {
    text-align: center;
  }
  .lt-draw-button {
    min-height: .ui-control(44px) [];
    height: auto;
    white-space: normal;
  }
  .lt-draw-button--free {
    width: 70%;
    margin-inline: auto;
  }
  .lt-paid-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: .ui-space(10px) [];
  }
  .lt-paid-actions .lt-draw-button {
    width: 100%;
  }
  .lt-draw-options p {
    margin: .ui-space(8px) [] 0 0;
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.6;
  }
  .lt-machine-footer {
    display: flex;
    gap: .ui-space(6px) [];
    align-items: center;
    justify-content: center;
    border-top: 1px solid var(--workspace-divider);
    padding-top: .ui-space(14px) [];
    margin-top: .ui-space(16px) [];
    font-size: .ui-font(12px) [];
    color: var(--desc-color);
  }
  .lt-machine-footer > :first-child {
    flex-shrink: 0;
    color: var(--primary-color);
  }
  .lt-side {
    background: var(--workspace-content);
    padding: .ui-space(18px) [];
  }
  .lt-pool-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: .ui-space(8px) [];
    margin-bottom: .ui-space(12px) [];
  }
  .lt-pool-head h3 {
    margin: 0;
    font-size: .ui-font(16px) [];
  }
  .lt-pool-head .b_btn {
    gap: .ui-space(4px) [];
    font-size: .ui-font(12px) [];
  }
  .lt-pool-head .is-open {
    transform: rotate(180deg);
  }
  .lt-pool-columns {
    display: flex;
    gap: .ui-space(10px) [];
    color: var(--desc-color);
    font-size: .ui-font(11px) [];
    padding-bottom: .ui-space(6px) [];
  }
  .lt-pool-columns > :first-child {
    flex: 1;
  }
  .lt-pool-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: .ui-space(12px) [];
    align-items: center;
    padding: .ui-space(15px) [] 0;
    border-top: 1px solid var(--workspace-divider);
    font-size: .ui-font(14px) [];
  }
  .lt-pool-item.show-pity {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }
  .lt-pool-item > div {
    display: flex;
    gap: .ui-space(10px) [];
    align-items: center;
    min-width: 0;
  }
  .lt-pool-item > div > :first-child {
    color: var(--primary-color);
    flex-shrink: 0;
  }
  .lt-pool-item > div > span {
    display: flex;
    align-items: center;
    gap: .ui-space(6px) [];
    flex-wrap: wrap;
  }
  .lt-pool-note {
    font-size: .ui-font(12px) [];
    line-height: 1.6;
    color: var(--desc-color);
    border-top: 1px solid var(--workspace-divider);
    padding-top: .ui-space(12px) [];
    margin: 0;
  }
  .lt-pool-note + .lt-pool-note {
    margin-top: .ui-space(10px) [];
  }
  .lt-state {
    display: flex;
    gap: .ui-space(12px) [];
    justify-content: center;
    align-items: center;
    padding: .ui-space(48px) [] 0;
    color: var(--desc-color);
  }
  .is-narrow .lt-layout {
    grid-template-columns: 1fr;
  }
  .is-mobile.lt {
    gap: .ui-space(14px) [];
  }
  .is-mobile .lt-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: .ui-space(8px) [];
  }
  .is-mobile .lt-heading h2 {
    font-size: .ui-font(21px) [];
  }
  .is-mobile .lt-heading p {
    display: none;
  }
  .is-mobile .lt-wallet {
    grid-row: 2;
    grid-column: 1 / -1;
  }
  .is-mobile .lt-history-button {
    grid-row: 1;
    grid-column: 2;
    font-size: .ui-font(12px) [];
  }
  .is-mobile .lt-machine,
  .is-mobile .lt-side {
    padding: .ui-space(14px) [];
  }
  .is-mobile .lt-draw-button--free {
    width: 100%;
  }
  .is-mobile .lt-paid-actions {
    gap: .ui-space(8px) [];
  }
  .is-mobile .lt-draw-button {
    font-size: .ui-font(12px) [];
    line-height: 1.4;
    padding-left: .ui-space(8px) [];
    padding-right: .ui-space(8px) [];
  }
  .is-mobile .lt-pool-item {
    padding: .ui-space(12px) [] 0;
    font-size: .ui-font(13px) [];
  }
</style>
