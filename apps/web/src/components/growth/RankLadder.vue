<template>
  <div v-if="ranks.length" class="rank-ladder">
    <p class="rl-hint">{{ t(permanentOnly ? 'aiQuotaOneTime.ladderHint' : 'growth.rankLadderHint') }}</p>
    <div class="rl-table" role="table" :aria-label="t('growth.rankLadder')">
      <div class="rl-row rl-row--head" role="row">
        <span role="columnheader">{{ t('growth.colRank') }}</span>
        <span class="rl-num" role="columnheader">{{ t('growth.colExp') }}</span>
        <span class="rl-num" role="columnheader">{{ t('growth.space') }}</span>
        <span class="rl-num" role="columnheader">{{
          t(permanentOnly ? 'growth.overview.aiGiftColumn' : 'growth.overview.aiDailyColumn')
        }}</span>
        <span class="rl-num" role="columnheader">{{ t('growth.trashRetain') }}</span>
        <span class="rl-num" role="columnheader">{{ t('growth.dailySurprise') }}</span>
      </div>
      <div ref="listEl" class="rl-list" role="rowgroup">
        <div
          v-for="r in ranks"
          :key="r.level"
          class="rl-row"
          :class="{ cur: r.level === curLevel, done: r.level < curLevel }"
          role="row"
        >
          <span class="rl-rank" role="cell">
            <span class="rl-lv" :style="{ background: TIER_GRADIENTS[tierOf(r.level)] }">{{ r.level }}</span>
            <span class="rl-name">{{ t('growth.ranks.' + r.level) }}</span>
            <BChip v-if="r.level === curLevel" tone="pin">{{ t('growth.currentRank') }}</BChip>
            <span v-else-if="r.level === maxLevel" class="rl-max">{{ t('growth.max') }}</span>
          </span>
          <span class="rl-num" role="cell">{{ r.cumExp.toLocaleString('en-US') }}</span>
          <span class="rl-num" role="cell">{{ fmtMb(r.spaceMb) }}</span>
          <span
            class="rl-num"
            role="cell"
            :title="
              permanentOnly && r.aiLevelGift
                ? t('aiQuotaOneTime.cumulative', { amount: r.aiLevelGift.cumulativeTokens.toLocaleString('en-US') })
                : undefined
            "
            >{{ permanentOnly ? `+${fmtToken(r.aiLevelGift?.tokens || 0)}` : fmtToken(r.aiTokenDaily) }}</span
          >
          <span class="rl-num" role="cell">{{
            r.trashDays >= 3650 ? t('growth.trashForever') : t('growth.daysVal', { n: r.trashDays })
          }}</span>
          <span class="rl-num rl-draws" :class="{ 'is-empty': !r.freeDraws }" role="cell">
            <template v-if="r.freeDraws"
              ><SvgIcon :src="icon.growth.reward" size="12" />{{ t('growth.timesVal', { n: r.freeDraws }) }}</template
            >
            <template v-else>—</template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { tierOf, TIER_GRADIENTS } from '@/config/growthTier';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const { t, locale } = useI18n();
  const { growth, ranks, load, loadRanks } = useGrowth();
  const listEl = ref<HTMLElement | null>(null);

  onMounted(async () => {
    await Promise.all([load(), loadRanks()]);
  });

  const permanentOnly = computed(
    () => growth.value?.billingMode === 'permanent_only' || ranks.value[0]?.billingMode === 'permanent_only',
  );
  const curLevel = computed(() => growth.value?.level || 1);
  const maxLevel = computed(() => ranks.value.length || 15);

  function fmtMb(mb: number) {
    return mb >= 1024 ? `${+(mb / 1024).toFixed(2)} GB` : `${mb} MB`;
  }
  // 「每日额度」切换为「每级一次性赠礼」前后分别展示对应口径，金额都来自服务端等级表。
  function fmtToken(value: number) {
    return new Intl.NumberFormat(locale.value, { notation: 'compact' }).format(Number(value || 0));
  }

  // 当前段位仅在段位小列表内滚动到可见。scrollIntoView 会继续滚动外层 growth-page，
  // 导致刷新「我的成长」后页面被意外带离顶部。
  function scrollCurrentRankIntoList() {
    const list = listEl.value;
    const current = list?.querySelector<HTMLElement>('.rl-row.cur');
    if (!list || !current) return;
    const listRect = list.getBoundingClientRect();
    const currentRect = current.getBoundingClientRect();
    if (currentRect.top < listRect.top) {
      list.scrollTop += currentRect.top - listRect.top;
    } else if (currentRect.bottom > listRect.bottom) {
      list.scrollTop += currentRect.bottom - listRect.bottom;
    }
  }

  // 当前段位滚动到可见(高段位用户列表靠下)
  watch(
    [ranks, curLevel],
    async () => {
      await nextTick();
      scrollCurrentRankIntoList();
    },
    { flush: 'post' },
  );
</script>

<style scoped lang="less">
  .rank-ladder {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
  }
  .rl-hint {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .rl-table {
    min-width: 0;
  }
  /* 表头与每行共用同一组固定列宽，数字列右对齐并使用等宽数字，保证上下对齐。 */
  .rl-row {
    display: grid;
    grid-template-columns:
      minmax(var(--ui-layout-140, 140px), 1fr) var(--ui-layout-80, 80px) var(--ui-layout-80, 80px)
      var(--ui-layout-80, 80px) var(--ui-layout-80, 80px) var(--ui-layout-80, 80px);
    align-items: center;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-7, 7px) var(--ui-space-10, 10px);
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
  }
  .rl-row--head {
    padding-bottom: var(--ui-space-8, 8px);
    border-bottom-color: var(--surface-divider-color);
    border-radius: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 600;
  }
  .rl-list {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-2, 2px);
    max-height: min(var(--ui-layout-460, 460px), 60vh);
    margin-top: var(--ui-space-4, 4px);
    overflow-y: auto;
  }
  .rl-row.done {
    color: var(--desc-color);
  }
  .rl-row.cur {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }
  .rl-rank {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
  }
  .rl-lv {
    display: flex;
    width: var(--ui-layout-22, 22px);
    height: var(--ui-layout-22, 22px);
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: #fff;
    font-size: var(--ui-font-11, 11px);
    font-weight: 700;
  }
  .rl-name {
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .rl-max {
    padding: 0 var(--ui-space-6, 6px);
    border: 1px solid var(--warning-color);
    border-radius: 999px;
    color: var(--warning-color);
    font-size: var(--ui-font-11, 11px);
    font-weight: 600;
    white-space: nowrap;
  }
  .rl-num {
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  .rl-draws {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--ui-space-3, 3px);
    color: var(--warning-color);
    font-weight: 600;
  }
  .rl-draws.is-empty {
    color: var(--desc-color);
    font-weight: 400;
  }
  @media (max-width: 640px) {
    /* 窄屏保持各列对齐，表格整体可横向滚动，不把段位名称挤成一列。 */
    .rl-table {
      overflow-x: auto;
    }
    .rl-row {
      grid-template-columns:
        minmax(var(--ui-layout-120, 120px), 1fr) var(--ui-layout-64, 64px) var(--ui-layout-64, 64px)
        var(--ui-layout-64, 64px) var(--ui-layout-60, 60px) var(--ui-layout-60, 60px);
      gap: var(--ui-space-8, 8px);
      padding: var(--ui-space-7, 7px) var(--ui-space-6, 6px);
      font-size: var(--ui-font-12, 12px);
      width: max-content;
      min-width: 100%;
    }
    .rl-row--head {
      font-size: var(--ui-font-11, 11px);
    }
  }
</style>
