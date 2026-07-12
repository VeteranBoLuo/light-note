<template>
  <div class="lt">
    <div class="lt-head">
      <div class="lt-head-left">
        <div class="lt-title">🎰 {{ t('growth.lotteryTitle') }}</div>
        <div class="lt-sub">{{ t('growth.lotterySubtitle') }}</div>
      </div>
      <div class="lt-balance">
        <span class="lt-balance-label">{{ t('growth.myPoints') }}</span>
        <span class="lt-balance-num">🪙 {{ (lottery?.points || 0).toLocaleString('en-US') }}</span>
      </div>
    </div>

    <!-- 抽奖台:滚动/揭晓 -->
    <div class="lt-stage" :class="{ rolling }">
      <template v-if="rolling">
        <div class="lt-rolling">
          <div class="lt-roller">🎁</div>
          <div class="lt-rolling-text">{{ t('growth.lotteryRolling') }}</div>
        </div>
      </template>
      <template v-else-if="revealed.length">
        <div class="lt-prizes" :class="{ single: revealed.length === 1 }">
          <div
            v-for="(p, i) in revealed"
            :key="i"
            class="lt-prize"
            :class="{ rare: p.rare, pop: true }"
            :style="{ animationDelay: i * 70 + 'ms' }"
          >
            <div class="lt-prize-icon">{{ prizeIcon(p) }}</div>
            <div class="lt-prize-name">{{ prizeLabel(p) }}</div>
            <span v-if="p.rare" class="lt-prize-rare">{{ t('growth.lotteryRare') }}</span>
          </div>
        </div>
        <div v-if="hitBest" class="lt-best">{{ t('growth.lotteryBestHit') }}</div>
      </template>
      <template v-else>
        <div class="lt-idle">🎲</div>
      </template>
    </div>

    <!-- 保底进度 -->
    <div class="lt-pity">
      <span v-if="lottery && lottery.toPity <= 1" class="lt-pity-now">{{ t('growth.lotteryPityNow') }}</span>
      <span v-else-if="lottery">{{ t('growth.lotteryPityLeft', { n: lottery.toPity }) }}</span>
    </div>

    <!-- 抽奖按钮 -->
    <div class="lt-actions">
      <BButton type="primary" :disabled="!canDraw(1)" :loading="rolling" @click="onDraw(1)">
        {{ t('growth.lotteryDrawOne') }} · 🪙 {{ lottery?.singleCost || 88 }}
      </BButton>
      <BButton type="primary" :disabled="!canDraw(10)" :loading="rolling" @click="onDraw(10)">
        {{ t('growth.lotteryDrawTen') }} · 🪙 {{ lottery?.tenCost || 800 }}
      </BButton>
    </div>
    <div v-if="lottery?.points !== undefined && !hasEnoughAny && !isVisitor" class="lt-tip">{{ t('growth.shopInsufficient') }}</div>
    <div v-if="isVisitor" class="lt-tip">{{ t('growth.lotteryVisitorTip') }}</div>

    <!-- 概率公示 -->
    <button class="lt-odds-toggle" @click="showOdds = !showOdds">
      {{ showOdds ? t('growth.lotteryOddsHide') : t('growth.lotteryOdds') }}
    </button>
    <div v-if="showOdds && lottery" class="lt-odds">
      <div v-for="p in lottery.pool" :key="p.id" class="lt-odds-row" :class="{ rare: p.rare }">
        <span>{{ prizeIcon(p) }} {{ prizeLabel(p) }}</span>
        <span class="lt-odds-rate">{{ p.rate }}%</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth, type LotteryPrize } from '@/composables/useGrowth.ts';
  import { useUserStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { recordOperation } from '@/api/commonApi.ts';

  const { t } = useI18n();
  const { lottery, loadLottery, draw } = useGrowth();

  const rolling = ref(false);
  const revealed = ref<LotteryPrize[]>([]);
  const hitBest = ref(false);
  const showOdds = ref(false);

  const isVisitor = computed(() => !useUserStore().id || useUserStore().id === 'visitor');
  const hasEnoughAny = computed(() => (lottery.value?.points || 0) >= (lottery.value?.singleCost || 88));

  function canDraw(times: number) {
    if (rolling.value || isVisitor.value || !lottery.value) return false;
    const cost = times === 10 ? lottery.value.tenCost : lottery.value.singleCost;
    return lottery.value.points >= cost;
  }

  const fmtMb = (mb: number) => (mb >= 1024 ? `${+(mb / 1024).toFixed(1)}GB` : `${mb}MB`);
  function prizeIcon(p: LotteryPrize) {
    return { points: '🪙', storage: '💾', card: '🎫', ai_pack: '⚡' }[p.kind] || '🎁';
  }
  function prizeLabel(p: LotteryPrize) {
    if (p.kind === 'points') return t('growth.prizePoints', { n: p.amount });
    if (p.kind === 'storage') return t('growth.prizeStorage', { n: fmtMb(p.amount) });
    if (p.kind === 'card') return t('growth.prizeCard', { n: p.amount });
    if (p.kind === 'ai_pack') return t('growth.prizeAiPack');
    return p.name;
  }

  async function onDraw(times: number) {
    if (!canDraw(times)) return;
    rolling.value = true;
    revealed.value = [];
    hitBest.value = false;
    try {
      const res = await draw(times);
      // 悬念:滚动动画至少展示 ~650ms 再揭晓
      await new Promise((r) => setTimeout(r, 650));
      if (res?.status === 200 && res.data?.ok) {
        revealed.value = res.data.results || [];
        // 大奖(512MB 存储)高亮庆祝
        hitBest.value = revealed.value.some((p) => p.kind === 'storage' && p.amount >= 512);
        recordOperation({ module: '成长', operation: `积分抽奖 ${times === 10 ? '十连' : '单抽'}（-${res.data.cost} 积分）` });
      } else {
        message.error(res?.data?.msg || t('growth.shopInsufficient'));
      }
    } catch (err) {
      console.error('抽奖失败:', err);
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
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .lt-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  .lt-title {
    font-size: 16px;
    font-weight: 700;
  }
  .lt-sub {
    margin-top: 4px;
    font-size: 12.5px;
    color: var(--desc-color);
    max-width: 440px;
  }
  .lt-balance {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    padding: 8px 14px;
    border-radius: 12px;
    background: color-mix(in srgb, #f59e0b 10%, var(--background-color));
    border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
    white-space: nowrap;
  }
  .lt-balance-label {
    font-size: 11px;
    color: var(--desc-color);
  }
  .lt-balance-num {
    font-size: 18px;
    font-weight: 800;
    color: #d97706;
    font-variant-numeric: tabular-nums;
  }
  /* 抽奖台 */
  .lt-stage {
    min-height: 130px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px;
    border-radius: 16px;
    background:
      radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--primary-color) 12%, transparent), transparent 70%),
      var(--background-color);
    border: 1px solid color-mix(in srgb, var(--card-border-color) 45%, transparent);
  }
  .lt-idle {
    font-size: 46px;
    opacity: 0.5;
  }
  .lt-rolling {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .lt-roller {
    font-size: 46px;
    animation: lt-shake 0.5s infinite ease-in-out;
  }
  @keyframes lt-shake {
    0%, 100% { transform: rotate(-12deg) scale(1); }
    50% { transform: rotate(12deg) scale(1.15); }
  }
  .lt-rolling-text {
    font-size: 13px;
    color: var(--desc-color);
  }
  .lt-prizes {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    width: 100%;
  }
  .lt-prizes.single {
    grid-template-columns: 1fr;
    max-width: 220px;
  }
  @media (max-width: 560px) {
    .lt-prizes {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .lt-prize {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 6px;
    border-radius: 10px;
    background: var(--workbench-subcard-bg);
    border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
    text-align: center;
  }
  .lt-prize.rare {
    border-color: color-mix(in srgb, #f59e0b 60%, transparent);
    background: color-mix(in srgb, #f59e0b 10%, var(--background-color));
    box-shadow: 0 0 16px -4px color-mix(in srgb, #f59e0b 55%, transparent);
  }
  .lt-prize.pop {
    animation: lt-pop 0.4s both cubic-bezier(0.2, 0.9, 0.3, 1.4);
  }
  @keyframes lt-pop {
    0% { transform: scale(0.4) translateY(10px); opacity: 0; }
    100% { transform: scale(1) translateY(0); opacity: 1; }
  }
  .lt-prize-icon {
    font-size: 24px;
    line-height: 1;
  }
  .lt-prize-name {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-color);
    line-height: 1.3;
  }
  .lt-prize-rare {
    font-size: 9.5px;
    font-weight: 700;
    padding: 0 6px;
    border-radius: 999px;
    color: #fff;
    background: linear-gradient(135deg, #f59e0b, #f97316);
  }
  .lt-best {
    font-size: 14px;
    font-weight: 800;
    color: #d97706;
    animation: lt-pop 0.5s both;
  }
  .lt-pity {
    text-align: center;
    font-size: 12px;
    color: var(--desc-color);
    min-height: 16px;
  }
  .lt-pity-now {
    color: #d97706;
    font-weight: 700;
  }
  .lt-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }
  .lt-actions :deep(.b_btn) {
    min-width: 130px;
  }
  .lt-tip {
    text-align: center;
    font-size: 12px;
    color: var(--primary-color);
  }
  .lt-odds-toggle {
    align-self: center;
    background: transparent;
    border: none;
    color: var(--desc-color);
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    padding: 2px 6px;
  }
  .lt-odds {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--background-color);
    border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
  }
  .lt-odds-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    padding: 3px 0;
  }
  .lt-odds-row.rare {
    color: #d97706;
    font-weight: 600;
  }
  .lt-odds-rate {
    font-variant-numeric: tabular-nums;
  }
</style>
