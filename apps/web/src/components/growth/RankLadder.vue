<template>
  <div v-if="ranks.length" class="rank-ladder">
    <div class="rl-head">{{ t('growth.rankLadder') }}</div>
    <div ref="listEl" class="rl-list">
      <div
        v-for="r in ranks"
        :key="r.level"
        class="rl-row"
        :class="{ cur: r.level === curLevel, done: r.level < curLevel }"
      >
        <span class="rl-lv" :class="`tier-${tierOf(r.level)}`">{{ r.level }}</span>
        <span class="rl-name">
          {{ r.name }}
          <span v-if="r.level === maxLevel" class="rl-max">{{ t('growth.max') }}</span>
        </span>
        <span class="rl-exp">{{ r.cumExp.toLocaleString('en-US') }}</span>
        <span class="rl-perk">{{ fmtMb(r.spaceMb) }} · {{ fmtToken(r.aiTokenDaily) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useGrowth } from '@/composables/useGrowth.ts';

  const { t } = useI18n();
  const { growth, ranks, load, loadRanks } = useGrowth();
  const listEl = ref<HTMLElement | null>(null);

  onMounted(async () => {
    await Promise.all([load(), loadRanks()]);
  });

  const curLevel = computed(() => growth.value?.level || 1);
  const maxLevel = computed(() => ranks.value.length || 15);

  function tierOf(l: number) {
    return l >= 13 ? 5 : l >= 10 ? 4 : l >= 7 ? 3 : l >= 4 ? 2 : 1;
  }
  function fmtMb(mb: number) {
    return mb >= 1024 ? `${+(mb / 1024).toFixed(1)}G` : `${mb}M`;
  }
  function fmtToken(n: number) {
    return n >= 1000 ? `${n / 1000}k` : String(n);
  }

  // 当前段位滚动到可见(高段位用户列表靠下)
  watch(
    [ranks, curLevel],
    async () => {
      await nextTick();
      listEl.value?.querySelector('.rl-row.cur')?.scrollIntoView({ block: 'nearest' });
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
</style>
