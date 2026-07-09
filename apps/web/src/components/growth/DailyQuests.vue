<template>
  <div class="dq">
    <div class="dq-head">
      <span class="dq-title">{{ t('growth.dashTasks') }}</span>
      <span class="dq-count" :class="{ allDone }">{{ doneCount }}/{{ quests.length }}</span>
    </div>
    <div class="dq-list">
      <div v-for="q in quests" :key="q.key" class="dq-item" :class="{ done: q.done }">
        <span class="dq-check">
          <svg v-if="q.done" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <span class="dq-label">{{ questLabel(q) }}</span>
        <span v-if="q.target && !q.done" class="dq-prog">{{ q.cur ?? 0 }}/{{ q.target }}</span>
        <span v-else-if="q.done" class="dq-tag">{{ t('growth.questDone') }}</span>
      </div>
    </div>

    <!-- 奖励区:未完成→提示;可领→按钮;已领→庆祝 -->
    <div class="dq-bonus" :class="{ claimable: bonus.claimable, claimed: bonus.claimed }">
      <div class="dq-bonus-left">
        <span class="dq-bonus-emoji">{{ bonus.claimed ? '🎉' : '🎁' }}</span>
        <span class="dq-bonus-text">
          {{ bonus.claimed ? t('growth.questBonusClaimed', { n: bonus.exp }) : t('growth.questBonusHint', { n: bonus.exp }) }}
        </span>
      </div>
      <button v-if="bonus.claimable" class="dq-claim" :disabled="claiming" @click="$emit('claim')">
        {{ claiming ? t('growth.questClaiming') : t('growth.questClaim') }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { Quest, QuestBonus } from '@/composables/useGrowth.ts';

  const props = defineProps<{ quests: Quest[]; bonus: QuestBonus; claiming?: boolean }>();
  defineEmits<{ (e: 'claim'): void }>();
  const { t } = useI18n();

  const doneCount = computed(() => props.quests.filter((q) => q.done).length);
  const allDone = computed(() => props.quests.length > 0 && doneCount.value === props.quests.length);

  function questLabel(q: Quest): string {
    if (q.key === 'exp30') return t('growth.questExp', { n: q.target ?? 30 });
    return t(`growth.quest_${q.key}`);
  }
</script>

<style scoped lang="less">
  .dq {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .dq-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .dq-title {
    font-size: 14px;
    font-weight: 700;
  }
  .dq-count {
    font-size: 12px;
    font-weight: 600;
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  .dq-count.allDone {
    color: var(--primary-color);
  }
  .dq-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dq-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 4%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
    transition:
      background 0.2s,
      border-color 0.2s;
  }
  .dq-item.done {
    background: color-mix(in srgb, #34d399 8%, var(--background-color));
    border-color: color-mix(in srgb, #34d399 32%, transparent);
  }
  .dq-check {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid var(--card-border-color);
    color: #fff;
  }
  .dq-item.done .dq-check {
    background: linear-gradient(135deg, #34d399, #22d3ee);
    border-color: transparent;
  }
  .dq-label {
    flex: 1 1 auto;
    font-size: 13px;
    color: var(--text-color);
  }
  .dq-item.done .dq-label {
    color: var(--desc-color);
  }
  .dq-prog {
    font-size: 12px;
    font-weight: 600;
    color: var(--primary-color);
    font-variant-numeric: tabular-nums;
  }
  .dq-tag {
    font-size: 11px;
    font-weight: 600;
    color: #10b981;
  }
  /* 奖励区 */
  .dq-bonus {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px dashed color-mix(in srgb, var(--card-border-color) 55%, transparent);
    background: color-mix(in srgb, var(--primary-color) 3%, transparent);
  }
  .dq-bonus.claimable {
    border-style: solid;
    border-color: color-mix(in srgb, #f59e0b 45%, transparent);
    background: color-mix(in srgb, #f59e0b 10%, transparent);
  }
  .dq-bonus.claimed {
    border-color: color-mix(in srgb, #34d399 40%, transparent);
    background: color-mix(in srgb, #34d399 8%, transparent);
  }
  .dq-bonus-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .dq-bonus-emoji {
    font-size: 18px;
    line-height: 1;
    flex: 0 0 auto;
  }
  .dq-bonus-text {
    font-size: 12.5px;
    color: var(--text-color);
  }
  .dq-claim {
    flex: 0 0 auto;
    padding: 6px 16px;
    border-radius: 8px;
    border: none;
    color: #fff;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    background: linear-gradient(135deg, #f59e0b, #fb923c);
    box-shadow: 0 6px 14px -8px rgba(245, 158, 11, 0.8);
    transition: transform 0.15s;
  }
  .dq-claim:hover:not(:disabled) {
    transform: translateY(-1px);
  }
  .dq-claim:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
