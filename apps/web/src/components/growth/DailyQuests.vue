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
        <span class="dq-label">
          {{ questLabel(q) }}
          <span v-if="q.random" class="dq-random">{{ t('growth.questRandomTag') }}</span>
        </span>
        <span v-if="q.target && !q.done" class="dq-prog">{{ q.cur ?? 0 }}/{{ q.target }}</span>
        <span v-else-if="q.done" class="dq-tag">{{ t('growth.questDone') }}</span>
      </div>
    </div>

    <div class="dq-stages">
      <div
        v-for="stage in stages"
        :key="stage.key"
        class="dq-stage"
        :class="{ claimable: stage.claimable, claimed: stage.claimed }"
      >
        <span class="dq-stage-dot"
          ><SvgIcon :src="stage.claimed ? icon.filterPanel.check : icon.growth.reward" size="14"
        /></span>
        <span class="dq-stage-main">
          <b>{{ t('growth.questStageTitle', { n: stage.required, total: quests.length || 3 }) }}</b>
          <small>{{ stageReward(stage) }}</small>
        </span>
        <span class="dq-stage-state">
          {{
            stage.claimed
              ? t('growth.questStageClaimed')
              : stage.claimable
                ? t('growth.questStageReady')
                : `${doneCount}/${stage.required}`
          }}
        </span>
      </div>
    </div>

    <div v-if="bonus.claimable" class="dq-bonus claimable">
      <span class="dq-bonus-text">{{ t('growth.questAvailableReward') }}</span>
      <BButton
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
  const { t, te } = useI18n();

  const QUEST_LABEL_KEYS: Record<string, string> = {
    checkin: 'growth.quest_checkin',
    create: 'growth.quest_create',
    exp30: 'growth.quest_exp30',
    daily_note: 'growth.quest_daily_note',
    daily_bookmark: 'growth.quest_daily_bookmark',
    daily_file: 'growth.quest_daily_file',
    daily_todo: 'growth.quest_daily_todo',
    daily_organize: 'growth.quest_daily_organize',
  };

  const doneCount = computed(() => props.quests.filter((q) => q.done).length);
  const allDone = computed(() => props.quests.length > 0 && doneCount.value === props.quests.length);

  /*
   * 奖励文案。满级的 root 经验不入账(后端把 bonus.exp 置 0),说「可领 +0 经验」等于白说,
   * 这时只报积分 —— 那 30 积分才是它真正能拿到的东西。
   */
  const stages = computed(
    () =>
      props.bonus.stages || [
        {
          key: 'complete',
          required: props.quests.length || 3,
          exp: props.bonus.exp,
          points: props.bonus.points,
          claimed: props.bonus.claimed,
          claimable: props.bonus.claimable,
        },
      ],
  );

  function stageReward(stage: { exp: number; points: number }) {
    if (!stage.exp) return t('growth.questStageRewardPoints', { p: stage.points });
    return t('growth.questStageRewardMixed', { n: stage.exp, p: stage.points });
  }

  function questLabel(q: Quest): string {
    const key = QUEST_LABEL_KEYS[q.key];
    return key && te(key) ? t(key) : t('growth.questUnknown');
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
  .dq-random {
    display: inline-flex;
    margin-left: 6px;
    padding: 1px 6px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    font-size: 10px;
    font-weight: 700;
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
  .dq-stages {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .dq-stage {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 9px 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: var(--background-color);
  }
  .dq-stage.claimable {
    border-color: #d97706;
    background: rgba(245, 158, 11, 0.08);
  }
  .dq-stage.claimed {
    border-color: #16a34a;
  }
  .dq-stage-dot {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    border-radius: 50%;
    color: #d97706;
    background: rgba(245, 158, 11, 0.12);
  }
  .dq-stage.claimed .dq-stage-dot {
    color: #16a34a;
    background: rgba(22, 163, 74, 0.12);
  }
  .dq-stage-main {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }
  .dq-stage-main b {
    font-size: 12px;
  }
  .dq-stage-main small {
    color: var(--desc-color);
    font-size: 10.5px;
  }
  .dq-stage-state {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 10.5px;
    font-weight: 700;
  }
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
  @media (max-width: 520px) {
    .dq-stages {
      grid-template-columns: 1fr;
    }
  }
</style>
