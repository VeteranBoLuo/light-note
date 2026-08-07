<template>
  <div class="dq">
    <div class="dq-head">
      <span class="dq-title">{{ t('growth.dashTasks') }}</span>
      <span class="dq-count" :class="{ allDone }">{{ doneCount }}/{{ quests.length }}</span>
    </div>
    <div class="dq-list">
      <div v-for="q in quests" :key="q.key" class="dq-item" :class="{ done: q.done }">
        <span class="dq-check">
          <SvgIcon v-if="q.done" :src="icon.filterPanel.check" size="13" />
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
          {{ bonusText }}
        </span>
      </div>
      <BButton
        v-if="bonus.claimable"
        class="dq-claim"
        :disabled="readOnly || claiming"
        :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
        @click="$emit('claim')"
      >
        {{ claiming ? t('growth.questClaiming') : t('growth.questClaim') }}
      </BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { Quest, QuestBonus } from '@/composables/useGrowth.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const props = withDefaults(
    defineProps<{ quests: Quest[]; bonus: QuestBonus; claiming?: boolean; readOnly?: boolean }>(),
    { readOnly: false },
  );
  defineEmits<{ (e: 'claim'): void }>();
  const { t } = useI18n();

  const doneCount = computed(() => props.quests.filter((q) => q.done).length);
  const allDone = computed(() => props.quests.length > 0 && doneCount.value === props.quests.length);

  /*
   * 奖励文案。满级的 root 经验不入账(后端把 bonus.exp 置 0),说「可领 +0 经验」等于白说,
   * 这时只报积分 —— 那 30 积分才是它真正能拿到的东西。
   */
  const bonusText = computed(() => {
    const pointsOnly = !props.bonus.exp && props.bonus.points > 0;
    const mixedReward = props.bonus.exp > 0 && props.bonus.points > 0;
    if (props.bonus.claimed) {
      if (pointsOnly) return t('growth.questBonusClaimedPointsOnly', { p: props.bonus.points });
      if (mixedReward) {
        return t('growth.questBonusClaimedMixed', { n: props.bonus.exp, p: props.bonus.points });
      }
      return t('growth.questBonusClaimed', { n: props.bonus.exp });
    }
    if (pointsOnly) return t('growth.questBonusHintPointsOnly', { p: props.bonus.points });
    if (mixedReward) return t('growth.questBonusHintMixed', { n: props.bonus.exp, p: props.bonus.points });
    return t('growth.questBonusHint', { n: props.bonus.exp });
  });

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
