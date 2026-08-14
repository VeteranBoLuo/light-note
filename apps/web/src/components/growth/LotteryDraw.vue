<template>
  <div class="lt">
    <header class="lt-header">
      <div class="lt-heading">
        <span class="lt-heading__icon" aria-hidden="true">
          <SvgIcon :src="icon.growth.reward" :size="25" />
        </span>
        <div>
          <h2 id="lottery-title" class="lt-title">{{ t('growth.lotteryTitle') }}</h2>
          <p class="lt-subtitle">{{ t('growth.lotterySubtitle') }}</p>
        </div>
      </div>

      <div class="lt-wallet" :aria-label="t('growth.myPoints')">
        <div class="lt-wallet__copy">
          <span>{{ t('growth.myPoints') }}</span>
          <strong v-if="lottery">
            <SvgIcon :src="icon.growth.coin" :size="18" aria-hidden="true" />
            {{ points.toLocaleString('en-US') }}
          </strong>
          <BLoading v-else inline :loading="true" />
        </div>
        <span v-if="lottery" class="lt-wallet__level">{{
          t('growth.lotteryLevelBenefit', { level: lottery.level })
        }}</span>
      </div>
    </header>

    <div v-if="!lottery && (lotteryLoading || !lotteryError)" class="lt-loading">
      <BLoading inline :loading="true" :title="t('growth.lotteryLoading')" />
    </div>

    <div v-else-if="lotteryError && !lottery" class="lt-loading lt-loading--error" role="alert">
      <SvgIcon :src="icon.message.warning" :size="24" aria-hidden="true" />
      <strong>{{ t('growth.lotteryLoadFailed') }}</strong>
      <BButton size="small" @click="loadLottery">{{ t('common.retry') }}</BButton>
    </div>

    <div v-else class="lt-layout">
      <section class="lt-machine" aria-labelledby="lottery-title">
        <div class="lt-machine__head">
          <div>
            <span class="lt-kicker">{{ t('growth.lotteryStageKicker') }}</span>
            <strong>{{ t('growth.lotteryRewardDelivery') }}</strong>
          </div>
          <span
            v-if="activePoolCountsPity"
            class="lt-pity-badge"
            :class="{ 'is-due': isPityDue, 'is-triggered': pityTriggered }"
          >
            <SvgIcon
              :src="isPityDue || pityTriggered ? icon.growth.reward : icon.growth.level"
              :size="15"
              aria-hidden="true"
            />
            {{
              pityTriggered
                ? t('growth.lotteryPityTriggered')
                : isPityDue
                  ? t('growth.lotteryPityNow')
                  : t('growth.lotteryPityLeft', { n: pityRemaining })
            }}
          </span>
          <span v-else class="lt-pity-badge lt-pity-badge--free">
            <SvgIcon :src="icon.growth.checkin" :size="15" aria-hidden="true" />
            {{ t('growth.lotteryFreeNoPityBadge') }}
          </span>
        </div>

        <div
          class="lt-stage"
          :class="{ 'is-rolling': rolling, 'has-result': revealed.length }"
          :aria-busy="rolling || undefined"
          aria-live="polite"
        >
          <span class="lt-stage__glow lt-stage__glow--one" aria-hidden="true"></span>
          <span class="lt-stage__glow lt-stage__glow--two" aria-hidden="true"></span>
          <span class="lt-stage__orbit" aria-hidden="true"></span>

          <div v-if="rolling" class="lt-rolling">
            <div class="lt-prize-core is-rolling" aria-hidden="true">
              <span class="lt-prize-core__halo"></span>
              <SvgIcon :src="icon.growth.reward" :size="48" />
            </div>
            <strong>{{ t('growth.lotteryRolling') }}</strong>
            <span>{{ t('growth.lotteryStageIdleHint') }}</span>
          </div>

          <div v-else-if="revealed.length" class="lt-results">
            <div class="lt-results__heading" :class="{ 'is-best': hitBest }">
              <SvgIcon :src="icon.growth.reward" :size="19" aria-hidden="true" />
              <strong>{{ hitBest ? t('growth.lotteryBestHit') : t('growth.lotteryResultTitle') }}</strong>
              <span v-if="pityTriggered" class="lt-results__pity-status">
                {{ t('growth.lotteryPityTriggered') }}
              </span>
            </div>
            <div class="lt-prizes" :class="{ 'is-single': revealed.length === 1 }">
              <div
                v-for="(prize, index) in revealed"
                :key="`${prize.id}-${index}`"
                class="lt-prize"
                :class="[{ 'is-rare': prize.rare, 'is-guaranteed': prize.guaranteed }, `is-${prizeTone(prize)}`]"
                :style="{ animationDelay: `${index * 70}ms` }"
              >
                <span class="lt-prize__icon" aria-hidden="true">
                  <SvgIcon :src="prizeIcon(prize)" :size="25" />
                </span>
                <span class="lt-prize__name">{{ prizeLabel(prize) }}</span>
                <span v-if="prize.compensated" class="lt-prize__compensation">
                  {{ t('growth.lotteryOverflowCompensated', { n: prize.amount }) }}
                </span>
                <span v-if="prize.guaranteed" class="lt-prize__rare is-guaranteed">
                  {{ t('growth.lotteryPityHitBadge') }}
                </span>
                <span v-else-if="prize.rare" class="lt-prize__rare">{{ t('growth.lotteryRare') }}</span>
              </div>
            </div>
          </div>

          <div v-else class="lt-idle">
            <div class="lt-prize-core" aria-hidden="true">
              <span class="lt-prize-core__halo"></span>
              <SvgIcon :src="icon.growth.reward" :size="52" />
            </div>
            <strong>{{ t('growth.lotteryStageIdleTitle') }}</strong>
            <span>{{ t('growth.lotteryStageIdleHint') }}</span>
          </div>
        </div>

        <div
          v-if="activePoolCountsPity"
          class="lt-pity-panel"
          :class="{ 'is-due': isPityDue, 'is-triggered': pityTriggered }"
        >
          <span class="lt-pity-panel__icon" aria-hidden="true">
            <SvgIcon :src="isPityDue || pityTriggered ? icon.growth.reward : icon.growth.level" :size="20" />
          </span>
          <div class="lt-pity-panel__body">
            <div class="lt-pity-panel__copy">
              <strong>{{ t('growth.lotteryPityTitle') }}</strong>
              <span>{{ pityStatusText }}</span>
            </div>
            <div
              class="lt-progress"
              role="progressbar"
              :aria-label="t('growth.lotteryPityTitle')"
              aria-valuemin="0"
              :aria-valuemax="pityEvery"
              :aria-valuenow="pityCurrent"
            >
              <span :style="{ width: `${pityPercent}%` }"></span>
            </div>
          </div>
          <strong class="lt-pity-panel__count">{{ pityCurrent }}/{{ pityEvery }}</strong>
        </div>

        <div
          class="lt-draw-options"
          :class="{ 'has-no-free': freeDaily <= 0 }"
          :aria-label="t('growth.lotteryDrawOptions')"
        >
          <BButton
            v-if="freeDaily > 0"
            class="lt-draw-button lt-draw-button--free"
            type="success"
            :disabled="readOnly || !canFree"
            :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
            @click="onDraw(1, true)"
          >
            <span class="lt-draw-button__icon" aria-hidden="true">
              <SvgIcon :src="icon.growth.reward" :size="21" />
            </span>
            <span class="lt-draw-button__copy">
              <strong>{{ t('growth.lotteryFreeDraw') }}</strong>
              <small>{{
                freeRemaining > 0 ? t('growth.lotteryFreeLeft', { n: freeRemaining }) : t('growth.lotteryFreeUsedUp')
              }}</small>
            </span>
          </BButton>

          <BButton
            class="lt-draw-button lt-draw-button--paid"
            type="primary"
            :disabled="readOnly || !canDraw(1)"
            :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
            @click="onDraw(1)"
          >
            <span class="lt-draw-button__icon" aria-hidden="true">
              <SvgIcon :src="icon.growth.coin" :size="21" />
            </span>
            <span class="lt-draw-button__copy">
              <strong>{{ t('growth.lotteryDrawOne') }}</strong>
              <small>{{ lottery?.paid.singleCost }} {{ t('growth.points') }}</small>
            </span>
          </BButton>

          <BButton
            class="lt-draw-button lt-draw-button--paid lt-draw-button--ten"
            type="primary"
            :disabled="readOnly || !canDraw(10)"
            :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
            @click="onDraw(10)"
          >
            <span class="lt-draw-button__icon" aria-hidden="true">
              <SvgIcon :src="icon.growth.reward" :size="21" />
            </span>
            <span class="lt-draw-button__copy">
              <strong>{{ t('growth.lotteryDrawTen') }}</strong>
              <small>{{ lottery?.paid.tenCost }} {{ t('growth.points') }}</small>
            </span>
            <span v-if="tenSavings > 0" class="lt-draw-button__save">
              {{ t('growth.lotteryTenSave', { n: tenSavings }) }}
            </span>
          </BButton>
        </div>

        <p v-if="lottery?.points !== undefined && !hasEnoughAny && !isVisitor" class="lt-tip">
          {{ t('growth.shopInsufficient') }}
        </p>
        <p v-if="lottery && !activeModeEnabled" class="lt-tip">{{ t('growth.lotteryMaintenance') }}</p>
        <p v-if="isVisitor" class="lt-tip">{{ t('growth.lotteryVisitorTip') }}</p>
      </section>

      <aside class="lt-side">
        <section class="lt-side-card lt-benefit-card">
          <div class="lt-side-card__head">
            <span class="lt-side-card__icon" :class="{ 'is-locked': freeDaily <= 0 }" aria-hidden="true">
              <SvgIcon :src="freeDaily > 0 ? icon.growth.checkin : icon.growth.lock" :size="20" />
            </span>
            <div>
              <strong>{{ t('growth.lotteryFreeTitle') }}</strong>
              <span>{{ t('growth.lotteryLevelBenefit', { level: lottery?.level || 0 }) }}</span>
            </div>
          </div>

          <template v-if="freeDaily > 0">
            <div class="lt-benefit-card__value">
              <strong
                >{{ freeRemaining }}<small>/{{ freeDaily }}</small></strong
              >
              <span>{{ t('growth.lotteryTodayAvailability', { remaining: freeRemaining, total: freeDaily }) }}</span>
            </div>
            <div
              class="lt-progress lt-progress--free"
              role="progressbar"
              :aria-label="t('growth.lotteryFreeTitle')"
              aria-valuemin="0"
              :aria-valuemax="freeDaily"
              :aria-valuenow="freeRemaining"
            >
              <span :style="{ width: `${freePercent}%` }"></span>
            </div>
            <p>{{ t('growth.lotteryFreeDaily', { n: freeDaily }) }}</p>
          </template>
          <p v-else class="lt-benefit-card__locked">{{ t('growth.lotteryFreeLocked') }}</p>
        </section>

        <section class="lt-side-card lt-pool-card">
          <div class="lt-side-card__head lt-pool-card__head">
            <span class="lt-side-card__icon" aria-hidden="true">
              <SvgIcon :src="icon.growth.reward" :size="20" />
            </span>
            <div>
              <strong>{{ t('growth.lotteryPoolTitle') }}</strong>
              <span>{{ activePoolHint }}</span>
            </div>
          </div>

          <BTabs
            v-model:active-tab="activePoolMode"
            class="lt-pool-tabs"
            variant="segment"
            :options="poolModeOptions"
          />

          <div v-if="activePool.length" class="lt-pool-grid">
            <div
              v-for="prize in activePool"
              :key="prize.id"
              class="lt-pool-item"
              :class="[{ 'is-rare': prize.rare }, `is-${prizeTone(prize)}`]"
            >
              <span class="lt-pool-item__icon" aria-hidden="true">
                <SvgIcon :src="prizeIcon(prize)" :size="20" />
              </span>
              <span class="lt-pool-item__copy">
                <strong>{{ prizeLabel(prize) }}</strong>
                <small v-if="prize.rare" class="lt-pool-item__pity-badge">
                  {{ t('growth.lotteryPityPoolBadge') }}
                </small>
              </span>
            </div>
          </div>

          <BButton
            class="lt-odds-toggle"
            v-click-log="{ module: '成长', operation: '查看抽奖概率说明' }"
            :aria-expanded="showOdds"
            aria-controls="lottery-odds"
            @click="showOdds = !showOdds"
          >
            <span>{{ showOdds ? t('growth.lotteryOddsHide') : t('growth.lotteryOdds') }}</span>
            <SvgIcon
              class="lt-odds-toggle__icon"
              :class="{ 'is-open': showOdds }"
              :src="icon.noteTree.chevron"
              :size="16"
              aria-hidden="true"
            />
          </BButton>

          <div v-if="showOdds && lottery" id="lottery-odds" class="lt-odds">
            <div class="lt-odds__header" :class="{ 'is-two-column': !activePoolCountsPity }" aria-hidden="true">
              <span>{{ t('growth.lotteryOddsPrize') }}</span>
              <strong>{{ t('growth.lotteryNormalOdds') }}</strong>
              <strong v-if="activePoolCountsPity">{{ t('growth.lotteryPityOdds') }}</strong>
            </div>
            <div
              v-for="prize in activePool"
              :key="prize.id"
              class="lt-odds__row"
              :class="{ 'is-rare': prize.rare, 'is-two-column': !activePoolCountsPity }"
            >
              <span>
                <SvgIcon :src="prizeIcon(prize)" :size="15" aria-hidden="true" />
                {{ prizeLabel(prize) }}
                <small v-if="prize.rare" class="lt-odds__pity-badge">
                  {{ t('growth.lotteryPityPoolBadge') }}
                </small>
              </span>
              <strong>{{ formatRate(prize.normalRate ?? prize.rate) }}</strong>
              <strong v-if="activePoolCountsPity">
                {{ prize.pityRate ? formatRate(prize.pityRate) : t('growth.lotteryPityNotApplicable') }}
              </strong>
            </div>
            <p v-if="activePoolMode === 'free'" class="lt-odds__note">
              {{
                lottery.free.countsPaidPity
                  ? t('growth.lotteryFreeCountsPity')
                  : t('growth.lotteryFreeDoesNotCountPity')
              }}
            </p>
            <p v-if="activePoolHasMakeupCard && lottery.paid.overflowPolicy" class="lt-odds__note">
              {{
                t('growth.lotteryOverflowPolicy', {
                  max: lottery.paid.overflowPolicy.maxInventory,
                  points: lottery.paid.overflowPolicy.compensationPoints,
                })
              }}
            </p>
          </div>
        </section>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth, type LotteryPrize } from '@/composables/useGrowth.ts';
  import { useUserStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon.ts';
  import { recordOperation } from '@/api/commonApi.ts';

  const { t } = useI18n();
  const props = withDefaults(defineProps<{ readOnly?: boolean }>(), { readOnly: false });
  const emit = defineEmits<{ 'focus-header': [] }>();
  const readOnly = computed(() => props.readOnly);
  const { lottery, lotteryLoading, lotteryError, loadLottery, draw } = useGrowth();

  const rolling = ref(false);
  const revealed = ref<LotteryPrize[]>([]);
  const hitBest = ref(false);
  const pityTriggered = ref(false);
  const showOdds = ref(false);
  const activePoolMode = ref<'free' | 'paid'>('free');

  const user = useUserStore();
  const isVisitor = computed(() => !user.id || user.id === 'visitor');
  const points = computed(() => lottery.value?.points || 0);
  const freeDaily = computed(() => lottery.value?.free.daily || 0);
  const freeRemaining = computed(() => lottery.value?.free.remaining || 0);
  const freePercent = computed(() =>
    freeDaily.value > 0 ? Math.min(100, Math.max(0, (freeRemaining.value / freeDaily.value) * 100)) : 0,
  );
  const pityEvery = computed(() => lottery.value?.paid.pityEvery || 10);
  const pityRemaining = computed(() => lottery.value?.paid.toPity || pityEvery.value);
  const pityCurrent = computed(() => Math.max(0, pityEvery.value - pityRemaining.value));
  const pityPercent = computed(() => Math.min(100, (pityCurrent.value / pityEvery.value) * 100));
  const isPityDue = computed(() => Boolean(lottery.value && pityRemaining.value <= 1));
  const pityStatusText = computed(() => {
    if (pityTriggered.value) {
      return t('growth.lotteryPityTriggeredNext', { current: pityCurrent.value, total: pityEvery.value });
    }
    if (isPityDue.value) return t('growth.lotteryPityNow');
    return t('growth.lotteryPityProgress', { current: pityCurrent.value, total: pityEvery.value });
  });
  const tenSavings = computed(() =>
    lottery.value ? Math.max(0, lottery.value.paid.singleCost * 10 - lottery.value.paid.tenCost) : 0,
  );
  const hasEnoughAny = computed(() => Boolean(lottery.value && points.value >= lottery.value.paid.singleCost));
  const canFree = computed(
    () => !rolling.value && !isVisitor.value && Boolean(lottery.value?.free.enabled) && freeRemaining.value > 0,
  );
  const poolModeOptions = computed(() => [
    { key: 'free', label: t('growth.lotteryFreePoolTab') },
    { key: 'paid', label: t('growth.lotteryPaidPoolTab') },
  ]);
  const activePool = computed(() =>
    activePoolMode.value === 'free' ? lottery.value?.free.pool || [] : lottery.value?.paid.pool || [],
  );
  const activePoolCountsPity = computed(
    () => activePoolMode.value === 'paid' || Boolean(lottery.value?.free.countsPaidPity),
  );
  const activePoolHasMakeupCard = computed(() => activePool.value.some((prize) => prize.kind === 'card'));
  const activePoolHint = computed(() =>
    activePoolMode.value === 'free' && !activePoolCountsPity.value
      ? t('growth.lotteryFreePoolHint')
      : t('growth.lotteryPoolHint', { n: pityEvery.value }),
  );
  const activeModeEnabled = computed(() =>
    activePoolMode.value === 'free' ? Boolean(lottery.value?.free.enabled) : Boolean(lottery.value?.paid.enabled),
  );

  function canDraw(times: number) {
    if (rolling.value || isVisitor.value || !lottery.value) return false;
    const cost = times === 10 ? lottery.value.paid.tenCost : lottery.value.paid.singleCost;
    return lottery.value.paid.enabled && lottery.value.points >= cost;
  }

  const fmtMb = (mb: number) => (mb >= 1024 ? `${+(mb / 1024).toFixed(1)}GB` : `${mb}MB`);
  const formatRate = (rate?: number) =>
    `${Number(rate || 0)
      .toFixed(2)
      .replace(/\.00$/, '')}%`;

  function prizeIcon(prize: LotteryPrize) {
    return (
      {
        points: icon.growth.coin,
        storage: icon.growth.storage,
        card: icon.growth.checkin,
        ai_pack: icon.growth.ai,
      }[prize.kind] || icon.growth.reward
    );
  }

  function prizeTone(prize: LotteryPrize) {
    return (
      {
        points: 'points',
        storage: 'storage',
        card: 'card',
        ai_pack: 'ai',
      }[prize.kind] || 'reward'
    );
  }

  function prizeLabel(prize: LotteryPrize) {
    if (prize.kind === 'points') return t('growth.prizePoints', { n: prize.amount });
    if (prize.kind === 'storage') return t('growth.prizeStorage', { n: fmtMb(prize.amount) });
    if (prize.kind === 'card') return t('growth.prizeCard', { n: prize.amount });
    if (prize.kind === 'ai_pack') return t('growth.prizeAiPack');
    return prize.name;
  }

  async function onDraw(times: number, free = false) {
    if (readOnly.value || (free ? !canFree.value : !canDraw(times))) return;
    rolling.value = true;
    revealed.value = [];
    hitBest.value = false;
    pityTriggered.value = false;
    try {
      activePoolMode.value = free ? 'free' : 'paid';
      // 滚动容器由成长页持有；统一让父页面把“积分抽奖”标题与余额留在视野内。
      // 禁止在这里对舞台调用 scrollIntoView，否则会越过标题，回到用户反馈的图一位置。
      emit('focus-header');
      const res = await draw(times, free);
      // 保留最短揭晓时长，避免网络响应过快导致舞台动画闪烁。
      await new Promise((resolve) => setTimeout(resolve, 650));
      if (res?.status === 200 && res.data?.ok) {
        revealed.value = res.data.results || [];
        pityTriggered.value = Boolean(res.data.pityTriggered || revealed.value.some((prize) => prize.guaranteed));
        hitBest.value = revealed.value.some((prize) => prize.kind === 'storage' && prize.amount >= 512);
        recordOperation({
          module: '成长',
          operation: `积分抽奖 ${free ? '免费抽' : times === 10 ? '十连' : '单抽'}（-${res.data.cost} 积分）${
            pityTriggered.value ? ' · 触发保底' : ''
          }`,
        });
      } else if (res?.status === 409 && res.data?.refresh) {
        message.warning(t('growth.economyCatalogChanged'));
      } else {
        message.error(res?.data?.msg || t('growth.shopInsufficient'));
      }
    } catch (error) {
      console.error('抽奖失败:', error);
    } finally {
      rolling.value = false;
    }
  }

  onMounted(() => {
    loadLottery();
  });
</script>

<style scoped lang="less">
  .lt {
    --lt-accent-fg: var(--chip-pin-fg, #5146d9);
    --lt-accent-bg: var(--chip-pin-bg, #eeecff);
    --lt-accent-border: var(--chip-pin-border, #d9d4ff);
    --lt-gold-fg: var(--warning-color, #a05f00);
    --lt-gold-bg: var(--chip-pending-bg, #fff3df);
    --lt-gold-border: var(--chip-pending-border, #f3d4a1);
    display: flex;
    flex-direction: column;
    gap: 22px;
    color: var(--text-color);
  }

  .lt-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }

  .lt-heading {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 14px;
  }

  .lt-heading__icon {
    width: 48px;
    height: 48px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--lt-accent-border);
    border-radius: 15px;
    color: var(--lt-accent-fg);
    background: var(--lt-accent-bg);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.48);
  }

  .lt-title {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .lt-subtitle {
    max-width: 620px;
    margin: 5px 0 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.55;
  }

  .lt-wallet {
    min-width: 194px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 11px 13px 11px 15px;
    border: 1px solid var(--lt-gold-border);
    border-radius: 15px;
    background: var(--lt-gold-bg);
  }

  .lt-wallet__copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .lt-wallet__copy > span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .lt-wallet__copy strong {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--lt-gold-fg);
    font-size: 20px;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
  }

  .lt-wallet__level {
    padding: 4px 8px;
    border: 1px solid var(--lt-gold-border);
    border-radius: 999px;
    color: var(--lt-gold-fg);
    background: var(--background-color);
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .lt-loading {
    min-height: 420px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--workbench-subcard-bg);
  }

  .lt-loading--error {
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: var(--warning-color, #a05f00);
  }

  .lt-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(270px, 318px);
    align-items: start;
    gap: 18px;
  }

  .lt-machine,
  .lt-side-card {
    border: 1px solid var(--surface-border-color);
    background: var(--surface-raised-background, var(--background-color));
    box-shadow: var(--surface-raised-shadow);
  }

  .lt-machine {
    min-width: 0;
    padding: 20px;
    border-radius: 22px;
  }

  .lt-machine__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 14px;
  }

  .lt-machine__head > div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .lt-machine__head strong {
    font-size: 12px;
    font-weight: 500;
    color: var(--desc-color);
  }

  .lt-kicker {
    color: var(--lt-accent-fg);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .lt-pity-badge {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid var(--lt-accent-border);
    border-radius: 999px;
    color: var(--lt-accent-fg);
    background: var(--lt-accent-bg);
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .lt-pity-badge.is-due,
  .lt-pity-badge.is-triggered {
    border-color: var(--lt-gold-border);
    color: var(--lt-gold-fg);
    background: var(--lt-gold-bg);
  }

  .lt-stage {
    isolation: isolate;
    position: relative;
    min-height: 320px;
    display: grid;
    overflow: hidden;
    place-items: center;
    padding: 26px;
    border: 1px solid var(--lt-accent-border);
    border-radius: 20px;
    background:
      radial-gradient(circle at 50% 10%, rgba(97, 92, 237, 0.18), transparent 42%),
      linear-gradient(155deg, var(--background-color) 0%, var(--lt-accent-bg) 52%, var(--background-color) 100%);
  }

  .lt-stage.has-result {
    align-items: stretch;
  }

  .lt-stage__glow {
    position: absolute;
    z-index: -1;
    width: 180px;
    height: 180px;
    border-radius: 50%;
    background: rgba(97, 92, 237, 0.1);
    filter: blur(4px);
  }

  .lt-stage__glow--one {
    top: -95px;
    left: -55px;
  }

  .lt-stage__glow--two {
    right: -70px;
    bottom: -110px;
  }

  .lt-stage__orbit {
    position: absolute;
    z-index: -1;
    width: 220px;
    height: 220px;
    border: 1px solid rgba(97, 92, 237, 0.22);
    border-radius: 50%;
    transform: rotate(-18deg) scaleY(0.45);
  }

  .lt-idle,
  .lt-rolling {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
  }

  .lt-idle > strong,
  .lt-rolling > strong {
    margin-top: 5px;
    font-size: 16px;
    font-weight: 800;
  }

  .lt-idle > span,
  .lt-rolling > span {
    color: var(--desc-color);
    font-size: 12px;
  }

  .lt-prize-core {
    position: relative;
    width: 94px;
    height: 94px;
    display: grid;
    place-items: center;
    border: 1px solid var(--lt-accent-border);
    border-radius: 30px;
    color: var(--lt-accent-fg);
    background: var(--background-color);
    box-shadow: 0 18px 40px -24px rgba(65, 59, 190, 0.7);
    transform: rotate(-4deg);
  }

  .lt-prize-core__halo {
    position: absolute;
    inset: 7px;
    border: 1px dashed var(--lt-accent-border);
    border-radius: 24px;
  }

  .lt-prize-core.is-rolling {
    animation: lt-shake 0.55s infinite ease-in-out;
  }

  .lt-results {
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 14px;
  }

  .lt-results__heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 7px;
    color: var(--lt-accent-fg);
    font-size: 15px;
  }

  .lt-results__heading.is-best {
    color: var(--lt-gold-fg);
  }

  .lt-results__pity-status {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 2px 8px;
    border: 1px solid var(--lt-gold-border);
    border-radius: 999px;
    color: var(--lt-gold-fg);
    background: var(--lt-gold-bg);
    font-size: 10px;
    font-weight: 800;
  }

  .lt-prizes {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }

  .lt-prizes.is-single {
    max-width: 220px;
    grid-template-columns: 1fr;
    align-self: center;
  }

  .lt-prize {
    position: relative;
    min-width: 0;
    min-height: 96px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 10px 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--workbench-subcard-bg);
    text-align: center;
    animation: lt-pop 0.4s both cubic-bezier(0.2, 0.9, 0.3, 1.35);
  }

  .lt-prize.is-rare {
    border-color: var(--lt-gold-border);
    background: var(--lt-gold-bg);
    box-shadow: 0 14px 24px -22px rgba(160, 95, 0, 0.9);
  }

  .lt-prize.is-guaranteed {
    border-width: 2px;
    border-color: var(--lt-gold-fg);
  }

  .lt-prize__icon,
  .lt-pool-item__icon {
    display: grid;
    place-items: center;
    color: var(--lt-accent-fg);
  }

  .lt-prize.is-points .lt-prize__icon,
  .lt-pool-item.is-points .lt-pool-item__icon {
    color: var(--lt-gold-fg);
  }

  .lt-prize.is-storage .lt-prize__icon,
  .lt-pool-item.is-storage .lt-pool-item__icon {
    color: var(--info-color, #2a63d6);
  }

  .lt-prize.is-ai .lt-prize__icon,
  .lt-pool-item.is-ai .lt-pool-item__icon {
    color: var(--success-color, #1a7d4a);
  }

  .lt-prize.is-rare .lt-prize__icon,
  .lt-pool-item.is-rare .lt-pool-item__icon {
    color: var(--lt-gold-fg);
  }

  .lt-prize__name {
    min-width: 0;
    color: var(--text-color);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .lt-prize__compensation {
    color: var(--success-color, #1a7d4a);
    font-size: 9px;
    font-weight: 700;
    line-height: 1.35;
  }

  .lt-prize__rare {
    padding: 2px 6px;
    border: 1px solid var(--lt-gold-border);
    border-radius: 999px;
    color: var(--lt-gold-fg);
    background: var(--background-color);
    font-size: 9px;
    font-weight: 800;
  }

  .lt-prize__rare.is-guaranteed {
    border-color: var(--lt-gold-fg);
    color: var(--background-color);
    background: var(--lt-gold-fg);
  }

  .lt-pity-panel {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    padding: 12px 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--workbench-subcard-bg);
  }

  .lt-pity-panel.is-due,
  .lt-pity-panel.is-triggered {
    border-color: var(--lt-gold-border);
    background: var(--lt-gold-bg);
  }

  .lt-pity-badge--free {
    border-color: var(--success-color, #1a7d4a);
    color: var(--success-color, #1a7d4a);
    background: var(--workbench-subcard-bg);
  }

  .lt-pity-panel__icon,
  .lt-side-card__icon {
    width: 36px;
    height: 36px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid var(--lt-accent-border);
    border-radius: 11px;
    color: var(--lt-accent-fg);
    background: var(--lt-accent-bg);
  }

  .lt-pity-panel.is-due .lt-pity-panel__icon,
  .lt-pity-panel.is-triggered .lt-pity-panel__icon {
    border-color: var(--lt-gold-border);
    color: var(--lt-gold-fg);
    background: var(--background-color);
  }

  .lt-pity-panel__body {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .lt-pity-panel__copy {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }

  .lt-pity-panel__copy strong {
    font-size: 12px;
  }

  .lt-pity-panel__copy span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .lt-pity-panel__count {
    color: var(--lt-accent-fg);
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  .lt-pity-panel.is-due .lt-pity-panel__count,
  .lt-pity-panel.is-triggered .lt-pity-panel__count {
    color: var(--lt-gold-fg);
  }

  .lt-progress {
    height: 6px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--surface-border-color);
  }

  .lt-progress > span {
    height: 100%;
    display: block;
    min-width: 0;
    border-radius: inherit;
    background: var(--primary-color);
    transition: width 0.35s ease;
  }

  .lt-pity-panel.is-due .lt-progress > span,
  .lt-pity-panel.is-triggered .lt-progress > span {
    background: var(--lt-gold-fg);
  }

  .lt-draw-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-top: 14px;
  }

  .lt-draw-options.has-no-free {
    grid-template-columns: repeat(2, minmax(0, 220px));
    justify-content: center;
  }

  .lt-draw-options :deep(.lt-draw-button.b_btn) {
    position: relative;
    width: 100%;
    height: 64px;
    min-width: 0;
    justify-content: flex-start;
    gap: 10px;
    padding: 0 14px;
    overflow: hidden;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 14px;
    line-height: 1.2;
    box-shadow: none;
  }

  .lt-draw-options :deep(.lt-draw-button--free.b_btn) {
    border-color: var(--chip-success-border, #bee1ca) !important;
    color: var(--chip-success-fg, #1a7d4a);
    background: var(--chip-success-bg, #eef8f2);
  }

  .lt-draw-options :deep(.lt-draw-button--paid.b_btn) {
    border-color: var(--primary-color) !important;
    color: #fff;
    background: linear-gradient(135deg, #514ad8 0%, #6f69ee 100%);
  }

  .lt-draw-options :deep(.lt-draw-button--ten.b_btn) {
    background: linear-gradient(135deg, #4841c9 0%, #6f69ee 72%, #847ff4 100%);
  }

  .lt-draw-options :deep(.lt-draw-button.b_btn:not(.disabled):hover) {
    transform: translateY(-1px);
    filter: brightness(1.03);
  }

  .lt-draw-button__icon {
    width: 34px;
    height: 34px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.16);
  }

  .lt-draw-button--free .lt-draw-button__icon {
    background: var(--background-color);
  }

  .lt-draw-button__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }

  .lt-draw-button__copy strong {
    font-size: 13px;
    font-weight: 800;
  }

  .lt-draw-button__copy small {
    max-width: 100%;
    overflow: hidden;
    font-size: 10px;
    opacity: 0.82;
    text-overflow: ellipsis;
  }

  .lt-draw-button__save {
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 2px 5px;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 999px;
    color: #fff;
    background: rgba(255, 255, 255, 0.16);
    font-size: 8px;
    font-weight: 800;
  }

  .lt-tip {
    margin: 10px 0 0;
    color: var(--lt-accent-fg);
    font-size: 12px;
    text-align: center;
  }

  .lt-side {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .lt-side-card {
    padding: 16px;
    border-radius: 18px;
  }

  .lt-side-card__head {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .lt-side-card__head > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .lt-side-card__head strong {
    font-size: 13px;
    font-weight: 800;
  }

  .lt-side-card__head span:not(.lt-side-card__icon) {
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.35;
  }

  .lt-side-card__icon.is-locked {
    border-color: var(--surface-border-color);
    color: var(--desc-color);
    background: var(--workbench-subcard-bg);
  }

  .lt-benefit-card__value {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 10px;
    margin: 18px 0 10px;
  }

  .lt-benefit-card__value strong {
    color: var(--lt-accent-fg);
    font-size: 28px;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .lt-benefit-card__value strong small {
    color: var(--desc-color);
    font-size: 13px;
  }

  .lt-benefit-card__value > span,
  .lt-benefit-card p {
    color: var(--desc-color);
    font-size: 10px;
  }

  .lt-progress--free > span {
    background: var(--success-color, #1a7d4a);
  }

  .lt-benefit-card p {
    margin: 9px 0 0;
    line-height: 1.45;
  }

  .lt-benefit-card__locked {
    padding: 13px 0 0;
  }

  .lt-pool-card__head {
    margin-bottom: 14px;
  }

  .lt-pool-tabs.tab-container {
    margin-bottom: 12px;
    border-radius: 10px;
  }

  .lt-pool-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  .lt-pool-item {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workbench-subcard-bg);
  }

  .lt-pool-item.is-rare {
    border-color: var(--lt-gold-border);
    background: var(--lt-gold-bg);
  }

  .lt-pool-item__icon {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    border-radius: 9px;
    background: var(--background-color);
  }

  .lt-pool-item__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .lt-pool-item__copy strong {
    overflow: hidden;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lt-pool-item__copy small {
    color: var(--lt-gold-fg);
    font-size: 9px;
    font-weight: 800;
  }

  .lt-pool-item__pity-badge,
  .lt-odds__pity-badge {
    width: fit-content;
    padding: 1px 5px;
    border: 1px solid var(--lt-gold-border);
    border-radius: 999px;
    color: var(--lt-gold-fg);
    background: var(--background-color);
    font-size: 8px;
    font-weight: 800;
    line-height: 1.35;
    white-space: nowrap;
  }

  .lt-odds-toggle {
    width: 100%;
    height: 36px;
    display: flex;
    justify-content: space-between;
    margin-top: 12px;
    padding: 0 10px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 10px;
    color: var(--text-color);
    background: var(--workbench-subcard-bg);
    font-size: 11px;
    font-weight: 700;
  }

  .lt-odds-toggle__icon {
    color: var(--desc-color);
    transition: transform 0.2s ease;
  }

  .lt-odds-toggle__icon.is-open {
    transform: rotate(180deg);
  }

  .lt-odds {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
    padding: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--background-color);
  }

  .lt-odds__row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 54px 54px;
    align-items: center;
    gap: 10px;
    color: var(--desc-color);
    font-size: 10px;
  }

  .lt-odds__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 54px 54px;
    gap: 10px;
    padding-bottom: 5px;
    border-bottom: 1px solid var(--surface-border-color);
    color: var(--desc-color);
    font-size: 9px;
  }

  .lt-odds__row.is-two-column,
  .lt-odds__header.is-two-column {
    grid-template-columns: minmax(0, 1fr) 70px;
  }

  .lt-odds__header strong,
  .lt-odds__row > strong {
    text-align: right;
  }

  .lt-odds__row > span {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .lt-odds__pity-badge {
    flex: 0 0 auto;
  }

  .lt-odds__row strong {
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }

  .lt-odds__row.is-rare,
  .lt-odds__row.is-rare strong {
    color: var(--lt-gold-fg);
    font-weight: 700;
  }

  .lt-odds__note {
    margin: 2px 0 0;
    color: var(--desc-color);
    font-size: 9px;
    line-height: 1.45;
  }

  @keyframes lt-shake {
    0%,
    100% {
      transform: rotate(-8deg) translateY(0);
    }
    50% {
      transform: rotate(8deg) translateY(-7px) scale(1.04);
    }
  }

  @keyframes lt-pop {
    0% {
      opacity: 0;
      transform: translateY(10px) scale(0.72);
    }
    100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @media (max-width: 1040px) {
    .lt-layout {
      grid-template-columns: 1fr;
    }

    .lt-side {
      display: grid;
      grid-template-columns: minmax(220px, 0.7fr) minmax(0, 1.3fr);
    }

    .lt-pool-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .lt {
      gap: 16px;
    }

    .lt-header {
      align-items: stretch;
      gap: 12px;
    }

    .lt-heading__icon {
      width: 42px;
      height: 42px;
      border-radius: 13px;
    }

    .lt-title {
      font-size: 18px;
    }

    .lt-subtitle {
      font-size: 12px;
    }

    .lt-wallet {
      min-width: 130px;
      flex-direction: column;
      align-items: flex-end;
      justify-content: center;
      gap: 4px;
      padding: 8px 10px;
    }

    .lt-wallet__copy {
      align-items: flex-end;
    }

    .lt-wallet__copy strong {
      font-size: 17px;
    }

    .lt-wallet__level {
      padding: 2px 6px;
    }

    .lt-machine {
      padding: 14px;
      border-radius: 18px;
    }

    .lt-stage {
      min-height: 280px;
      padding: 18px;
      border-radius: 17px;
    }

    .lt-prizes {
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 6px;
    }

    .lt-prize {
      min-height: 76px;
      gap: 5px;
      padding: 8px 4px;
    }

    .lt-draw-options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .lt-draw-options:not(.has-no-free) > :first-child {
      grid-column: 1 / -1;
    }

    .lt-draw-options.has-no-free {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .lt-draw-options :deep(.lt-draw-button.b_btn) {
      min-height: 58px;
    }

    .lt-side {
      display: flex;
    }

    .lt-pool-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 520px) {
    .lt-header {
      align-items: center;
      flex-direction: row;
      gap: 8px;
    }

    .lt-heading {
      flex: 1;
      gap: 9px;
    }

    .lt-heading__icon {
      width: 38px;
      height: 38px;
      border-radius: 12px;
    }

    .lt-title {
      font-size: 17px;
      white-space: nowrap;
    }

    .lt-subtitle {
      display: none;
    }

    .lt-wallet {
      width: auto;
      min-width: 104px;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
      padding: 6px 8px;
    }

    .lt-wallet__copy {
      align-items: flex-end;
    }

    .lt-wallet__copy > span {
      display: none;
    }

    .lt-wallet__copy strong {
      font-size: 16px;
    }

    .lt-wallet__level {
      padding: 1px 5px;
      font-size: 9px;
    }

    .lt-machine__head {
      align-items: center;
      flex-direction: row;
      margin-bottom: 10px;
    }

    .lt-machine {
      padding: 10px;
    }

    .lt-machine__head > div {
      flex: 1;
    }

    .lt-machine__head strong {
      display: none;
    }

    .lt-kicker {
      font-size: 11px;
    }

    .lt-pity-badge {
      min-height: 26px;
      align-self: auto;
      justify-content: center;
      padding: 0 8px;
      font-size: 10px;
    }

    .lt-stage {
      min-height: 210px;
      padding: 10px;
    }

    .lt-results {
      gap: 10px;
    }

    .lt-results__heading {
      gap: 5px;
      font-size: 13px;
    }

    .lt-results__pity-status {
      min-height: 21px;
      padding: 1px 6px;
      font-size: 9px;
    }

    .lt-prize {
      min-height: 72px;
      gap: 4px;
      padding: 7px 3px;
      border-radius: 10px;
    }

    .lt-prize__name {
      font-size: 9px;
      line-height: 1.2;
    }

    .lt-prize__rare {
      padding: 1px 4px;
      font-size: 8px;
    }

    .lt-prize-core {
      width: 76px;
      height: 76px;
      border-radius: 24px;
    }

    .lt-idle > strong,
    .lt-rolling > strong {
      font-size: 14px;
    }

    .lt-idle > span,
    .lt-rolling > span {
      font-size: 10px;
    }

    .lt-pity-panel {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 10px;
      padding: 10px;
    }

    .lt-pity-panel__icon {
      width: 32px;
      height: 32px;
    }

    .lt-pity-panel__copy {
      align-items: flex-start;
      flex-direction: column;
      gap: 2px;
    }

    .lt-pity-panel__count {
      display: none;
    }

    .lt-draw-options :deep(.lt-draw-button.b_btn) {
      gap: 7px;
      padding: 0 10px;
    }

    .lt-draw-button__icon {
      width: 30px;
      height: 30px;
    }

    .lt-draw-button__save {
      display: none;
    }
  }

  @media (max-width: 380px) {
    .lt-prizes {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  :global(.disable-animations .lt .lt-prize),
  :global(.disable-animations .lt .lt-prize-core),
  :global(.disable-animations .lt .lt-progress > span),
  :global(.disable-animations .lt .lt-odds-toggle__icon) {
    animation: none !important;
    transition: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .lt-prize,
    .lt-prize-core,
    .lt-progress > span,
    .lt-odds-toggle__icon {
      animation: none;
      transition: none;
    }
  }
</style>
