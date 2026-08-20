<template>
  <div class="dq">
    <div class="dq-head">
      <span class="dq-title-wrap"
        ><span class="dq-title">{{ t('growth.dashTasks') }}</span
        ><small>{{ t('growth.dailyResetTime') }}</small></span
      >
      <span class="dq-count" :class="{ allDone }">{{ doneCount }}/{{ quests.length }}</span>
    </div>
    <div class="dq-list">
      <div v-for="q in quests" :key="q.key" class="dq-item" :class="{ done: q.done }">
        <span class="dq-check">
          <SvgIcon v-if="q.done" :src="icon.filterPanel.check" size="13" />
        </span>
        <span class="dq-label">
          {{ questLabel(q) }}
          <small v-if="q.countedEvent" class="dq-counted">
            {{ t('growth.questCountedEvent', { type: activityTypeLabel(q.countedEvent.type) }) }}
          </small>
        </span>
        <span v-if="q.target && !q.done" class="dq-prog">{{ q.cur ?? 0 }}/{{ q.target }}</span>
        <BButton
          v-if="!q.done && q.key !== 'checkin' && !readOnly"
          size="small"
          class="dq-go"
          v-click-log="{ module: '成长', operation: `前往日常任务-${q.key}` }"
          @click="$emit('go', q.key)"
        >
          {{ t('growth.tasksGoTo') }}
        </BButton>
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

    <aside v-if="showExperienceSources && quests.length" class="dq-exp-guide" role="note">
      <div class="dq-exp-guide-head">
        <span class="dq-exp-guide-icon"><SvgIcon :src="icon.message.info" size="15" /></span>
        <span class="dq-exp-guide-copy">
          <b>{{ t('growth.questExperienceTitle') }}</b>
          <small v-if="hasExperienceRewards">{{ t('growth.questExperienceRule') }}</small>
        </span>
      </div>
      <div v-if="hasExperienceRewards" class="dq-exp-guide-list">
        <span class="dq-exp-guide-item">
          <span>{{ t('growth.questExperienceCheckin') }}</span>
          <b>{{ t('growth.questExperienceCheckinValue') }}</b>
        </span>
        <span class="dq-exp-guide-item">
          <span>{{ t('growth.questExperienceCreate') }}</span>
          <b>{{ t('growth.questExperienceCreateValue') }}</b>
        </span>
        <span class="dq-exp-guide-item">
          <span>{{ t('growth.questExperienceStage') }}</span>
          <b>{{ t('growth.questExperienceStageValue', { values: experienceStageValues }) }}</b>
        </span>
      </div>
      <div
        v-if="hasExperienceRewards && safeDailyCap > 0"
        class="dq-exp-cap"
        :class="{ reached: isDailyCapReached }"
        role="status"
      >
        <div class="dq-exp-cap-head">
          <span>{{ t('growth.questExperienceDailyCap') }}</span>
          <b>{{
            t('growth.questExperienceDailyProgress', {
              current: safeDailyExp,
              cap: safeDailyCap,
            })
          }}</b>
        </div>
        <BProgress
          :percent="dailyCapPercent"
          size="small"
          :aria-label="
            t('growth.questExperienceDailyProgress', {
              current: safeDailyExp,
              cap: safeDailyCap,
            })
          "
        />
        <small>{{
          isDailyCapReached
            ? t('growth.questExperienceDailyCapReached', { cap: safeDailyCap })
            : t('growth.questExperienceDailyCapRule', { cap: safeDailyCap })
        }}</small>
      </div>
      <p v-if="hasExperienceRewards" class="dq-exp-guide-footnote">
        {{ t('growth.questExperienceCreateHint') }}
      </p>
      <p v-else class="dq-exp-guide-disabled">{{ t('growth.questExperienceUnavailable') }}</p>
    </aside>

    <div v-if="showClaimAction && bonus.claimable" class="dq-bonus claimable">
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
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const props = withDefaults(
    defineProps<{
      quests: Quest[];
      bonus: QuestBonus;
      claiming?: boolean;
      readOnly?: boolean;
      showExperienceSources?: boolean;
      showClaimAction?: boolean;
      dailyExp?: number;
      dailyCap?: number;
      dailyCapReached?: boolean;
    }>(),
    {
      readOnly: false,
      showExperienceSources: false,
      showClaimAction: true,
      dailyExp: 0,
      dailyCap: 0,
      dailyCapReached: false,
    },
  );
  defineEmits<{ (e: 'claim'): void; (e: 'go', key: string): void }>();
  const { t, te } = useI18n();

  const QUEST_LABEL_KEYS: Record<string, string> = {
    checkin: 'growth.quest_checkin',
    create: 'growth.quest_create',
    exp30: 'growth.quest_exp30',
    daily_note: 'growth.quest_daily_note',
    daily_bookmark: 'growth.quest_daily_bookmark',
    daily_file: 'growth.quest_daily_file',
    daily_todo_create: 'growth.quest_daily_todo_create',
    daily_todo: 'growth.quest_daily_todo',
    daily_organize: 'growth.quest_daily_organize',
    knowledge_action_1: 'growth.quest_knowledge_action_1',
    knowledge_action_2: 'growth.quest_knowledge_action_2',
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
  const experienceStageValues = computed(() =>
    stages.value
      .map((stage) => Number(stage.exp || 0))
      .filter((exp) => exp > 0)
      .map((exp) => `+${exp}`)
      .join(' / '),
  );
  const hasExperienceRewards = computed(() => Boolean(experienceStageValues.value));
  const safeDailyExp = computed(() => Math.max(0, Number(props.dailyExp) || 0));
  const safeDailyCap = computed(() => Math.max(0, Number(props.dailyCap) || 0));
  const dailyCapPercent = computed(() =>
    safeDailyCap.value > 0 ? Math.min(100, Math.round((safeDailyExp.value / safeDailyCap.value) * 100)) : 0,
  );
  const isDailyCapReached = computed(
    () => props.dailyCapReached || (safeDailyCap.value > 0 && safeDailyExp.value >= safeDailyCap.value),
  );

  function stageReward(stage: { exp: number; points: number }) {
    if (!stage.exp) return t('growth.questStageRewardPoints', { p: stage.points });
    return t('growth.questStageRewardMixed', { n: stage.exp, p: stage.points });
  }

  function questLabel(q: Quest): string {
    const key = QUEST_LABEL_KEYS[q.key];
    return key && te(key) ? t(key) : t('growth.questUnknown');
  }
  function activityTypeLabel(type: string) {
    const key = `growth.questActivityType.${type}`;
    return te(key) ? t(key) : type;
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
  .dq-title-wrap {
    display: flex;
    flex-direction: column;
  }
  .dq-title-wrap small {
    margin-top: 2px;
    color: var(--primary-color);
    font-size: 10.5px;
    font-weight: 500;
  }
  .dq-go {
    flex: 0 0 auto;
    color: var(--primary-color);
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
    border: 1px solid color-mix(in srgb, var(--primary-color) 14%, var(--surface-border-color));
    background: color-mix(in srgb, var(--primary-color) 4%, var(--card-background));
    transition:
      background 0.2s,
      border-color 0.2s;
  }
  .dq-check {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid var(--surface-border-color);
    color: var(--desc-color);
    background: var(--card-background);
  }
  .dq-item.done .dq-check {
    border-color: var(--success-color);
    color: var(--success-color);
  }
  .dq-label {
    flex: 1 1 auto;
    font-size: 13px;
    color: var(--text-color);
  }
  .dq-counted {
    display: block;
    margin-top: 2px;
    color: var(--desc-color);
    font-size: 10.5px;
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
    color: var(--success-color);
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
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
  }
  .dq-stage-dot {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    border: 1px solid currentColor;
    border-radius: 50%;
    color: var(--desc-color);
    background: var(--card-background);
  }
  .dq-stage.claimable .dq-stage-dot,
  .dq-stage.claimable .dq-stage-state {
    color: var(--warning-color);
  }
  .dq-stage.claimed .dq-stage-dot,
  .dq-stage.claimed .dq-stage-state {
    color: var(--success-color);
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
  .dq-exp-guide {
    display: flex;
    flex-direction: column;
    gap: 9px;
    padding: 11px 12px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: var(--background-color);
  }
  .dq-exp-guide-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .dq-exp-guide-icon {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    border: 1px solid var(--primary-color);
    border-radius: 50%;
    color: var(--primary-color);
  }
  .dq-exp-guide-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
  }
  .dq-exp-guide-copy b {
    color: var(--text-color);
    font-size: 12px;
  }
  .dq-exp-guide-copy small,
  .dq-exp-guide-disabled {
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.45;
  }
  .dq-exp-guide-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }
  .dq-exp-guide-item {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
    padding: 7px 8px;
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    color: var(--desc-color);
    font-size: 10.5px;
  }
  .dq-exp-guide-item b {
    color: var(--primary-color);
    font-size: 11px;
    line-height: 1.45;
  }
  .dq-exp-guide-footnote,
  .dq-exp-guide-disabled {
    margin: 0;
  }
  .dq-exp-guide-footnote {
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.45;
  }
  .dq-exp-cap {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 9px 10px;
    border: 1px solid var(--primary-color);
    border-radius: 8px;
    background: var(--card-background);
  }
  .dq-exp-cap.reached {
    border-color: var(--warning-color);
  }
  .dq-exp-cap-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: var(--text-color);
    font-size: 11px;
    font-weight: 600;
  }
  .dq-exp-cap-head b {
    color: var(--primary-color);
    font-variant-numeric: tabular-nums;
  }
  .dq-exp-cap.reached .dq-exp-cap-head b {
    color: var(--warning-color);
  }
  .dq-exp-cap small {
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.45;
  }
  .dq-bonus {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
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
    .dq-exp-guide-list {
      grid-template-columns: 1fr;
    }
    .dq-exp-guide-item {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .dq-exp-guide-item b {
      max-width: 68%;
      text-align: right;
    }
  }
</style>
