<template>
  <div v-if="ranks.length" class="rank-ladder">
    <div class="rl-head">{{ t('growth.rankLadder') }}</div>
    <div class="rl-colhead">
      <span></span>
      <span>{{ t('growth.colRank') }}</span>
      <span class="rl-colhead-r">{{ t('growth.colExp') }}</span>
      <span class="rl-colhead-r">{{ t('growth.colPerks') }}</span>
    </div>
    <div ref="listEl" class="rl-list">
      <div
        v-for="r in ranks"
        :key="r.level"
        class="rl-row"
        :class="{ cur: r.level === curLevel, done: r.level < curLevel }"
      >
        <span class="rl-lv" :style="{ background: TIER_GRADIENTS[tierOf(r.level)] }">{{ r.level }}</span>
        <span class="rl-name">
          {{ t('growth.ranks.' + r.level) }}
          <span v-if="r.level === maxLevel" class="rl-max">{{ t('growth.max') }}</span>
        </span>
        <span class="rl-exp">{{ r.cumExp.toLocaleString('en-US') }}</span>
        <span class="rl-perk">
          {{ fmtMb(r.spaceMb) }} · {{ fmtToken(r.aiTokenDaily) }} · {{ r.trashDays >= 3650 ? t('growth.trashForever') : t('growth.trashDays', { days: r.trashDays }) }}<span v-if="r.freeDraws" class="rl-free">· 🎟️{{ r.freeDraws }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { tierOf, TIER_GRADIENTS } from '@/config/growthTier';

  const { t } = useI18n();
  const { growth, ranks, load, loadRanks } = useGrowth();
  const listEl = ref<HTMLElement | null>(null);

  onMounted(async () => {
    await Promise.all([load(), loadRanks()]);
  });

  const curLevel = computed(() => growth.value?.level || 1);
  const maxLevel = computed(() => ranks.value.length || 15);

  function fmtMb(mb: number) {
    return mb >= 1024 ? `${+(mb / 1024).toFixed(1)}G` : `${mb}M`;
  }
  function fmtToken(n: number) {
    return n >= 1000 ? `${n / 1000}k` : String(n);
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
    gap: 8px;
    margin-top: 16px;
  }
  .rl-head {
    font-size: 12px;
    font-weight: 600;
    color: var(--desc-color);
    letter-spacing: 0.03em;
  }
  .rl-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 264px;
    overflow-y: auto;
    padding-right: 4px;
  }
  .rl-colhead {
    display: grid;
    grid-template-columns: 24px 1fr auto auto;
    align-items: center;
    gap: 10px;
    padding: 0 8px 6px;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--desc-color);
    opacity: 0.75;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 45%, transparent);
    margin-bottom: 4px;
  }
  .rl-colhead-r {
    text-align: right;
  }
  .rl-row {
    display: grid;
    grid-template-columns: 24px 1fr auto auto;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: 8px;
    font-size: 12.5px;
    transition: background 0.15s;
  }
  .rl-row.done {
    opacity: 0.55;
  }
  .rl-row.cur {
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 40%, transparent);
    opacity: 1;
  }
  .rl-lv {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
  }
  .rl-name {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }
  .rl-max {
    font-size: 10px;
    font-weight: 600;
    padding: 0 6px;
    border-radius: 999px;
    color: #fff;
    background: linear-gradient(135deg, #f43f5e, #fb923c);
  }
  .rl-exp {
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  .rl-perk {
    color: var(--desc-color);
    font-size: 11px;
    white-space: nowrap;
  }
  .rl-free {
    color: #d97706;
    font-weight: 600;
    margin-left: 2px;
  }
</style>
