<template>
  <section
    id="growth-checkin"
    class="today-panel"
    :class="{ 'today-panel--stacked': stacked }"
    :aria-busy="loading"
    :aria-label="t('growth.overview.todayTitle')"
  >
    <header class="today-panel__head">
      <div class="today-panel__title">
        <h2>{{ t('growth.overview.todayTitle') }}</h2>
        <span>{{ todayLabel }}</span>
      </div>
      <div class="today-panel__meta">
        <span class="today-panel__exp" :title="t('growth.todayExpCapHint')">
          <span>{{ t('growth.overview.dailyExp') }}</span>
          <span class="today-panel__exp-value"
            ><b>{{ dailyExp }}</b
            >/{{ dailyCap }}</span
          >
          <BProgress
            v-if="!stacked"
            class="today-panel__exp-bar"
            :percent="dailyPercent"
            size="small"
            :show-info="false"
            :aria-label="t('growth.questExperienceDailyProgress', { current: dailyExp, cap: dailyCap })"
          />
        </span>
        <GrowthClaimReceipt v-if="receipt && !stacked" :receipt="receipt" @dismiss="$emit('dismiss-receipt')" />
        <BButton
          v-if="showClaimAll && claimableCount > 0 && !stacked"
          :type="claimIsPrimary ? 'primary' : undefined"
          size="small"
          class="today-panel__claim"
          :class="{ 'is-secondary': !claimIsPrimary }"
          :loading="claiming"
          :disabled="readOnly || claiming"
          :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
          @click="$emit('claim-all')"
        >
          <SvgIcon :src="icon.growth.reward" size="15" />
          {{ t('growth.claimAllCount', { n: claimableCount }) }}
        </BButton>
      </div>
    </header>

    <div v-if="loading && !quests.length" class="today-panel__state"><BLoading inline loading /></div>
    <div v-else-if="error && !quests.length" class="today-panel__state today-panel__state--error" role="alert">
      <span>{{ t('growth.dashboardLoadFailed') }}</span>
      <BButton size="small" @click="$emit('retry')">{{ t('common.retry') }}</BButton>
    </div>
    <template v-else>
      <div class="today-panel__quests" :style="{ '--quest-columns': String(Math.max(1, tiles.length)) }">
        <div
          v-for="tile in tiles"
          :key="tile.key"
          class="today-quest"
          :class="{ 'is-done': tile.done, 'is-checkin': tile.isCheckin, 'is-cta': tile.isCheckin && !tile.done }"
        >
          <GrowthTaskIcon :task-key="tile.isCheckin ? 'checkin' : tile.key" :completed="tile.done" />
          <span class="today-quest__copy">
            <b>{{ tile.label }}</b>
            <small v-if="tile.done" class="today-quest__done">
              <SvgIcon :src="icon.filterPanel.check" size="12" />{{
                tile.isCheckin ? t('growth.checkedIn') : t('growth.questDone')
              }}
            </small>
            <small v-else-if="tile.isCheckin">{{ checkinHint }}</small>
            <small v-else>{{ tile.progress }}</small>
          </span>
          <BButton
            v-if="tile.isCheckin && !tile.done"
            type="primary"
            size="small"
            class="today-quest__action"
            :loading="checking"
            :disabled="readOnly || checking"
            :title="readOnly ? t('growth.adminContextActionUnavailable') : ''"
            v-click-log="{ module: '成长', operation: '概览签到' }"
            @click="$emit('checkin')"
          >
            {{ t('growth.checkin') }}
          </BButton>
          <BButton
            v-else-if="!tile.done && !tile.isCheckin && !readOnly"
            type="text"
            size="small"
            class="today-quest__go"
            v-click-log="{ module: '成长', operation: `前往日常任务-${tile.key}` }"
            @click="$emit('quest', tile.key)"
          >
            {{ t('growth.tasksGoTo') }}<SvgIcon :src="icon.arrow_right" size="12" />
          </BButton>
        </div>
      </div>

      <div class="today-track" :class="{ 'today-track--stacked': stacked }">
        <span class="today-track__rail" aria-hidden="true"></span>
        <span class="today-track__fill" aria-hidden="true" :style="{ width: `${trackPercent}%` }"></span>
        <template v-for="node in trackNodes" :key="node.step">
          <BButton
            v-if="node.stage && node.stage.claimable && !node.stage.claimed && !readOnly"
            type="text"
            class="today-track__node is-gift is-ready"
            :class="{ 'is-end': node.end }"
            :style="{ left: `${node.left}%` }"
            :disabled="claiming"
            :aria-label="`${t('growth.questStageReady')} ${node.label}`"
            v-click-log="{ module: '成长', operation: '领取日常任务阶段奖励' }"
            @click="$emit('claim-stage')"
          >
            <span class="today-track__dot"><SvgIcon :src="icon.growth.reward" size="13" /></span>
            <span class="today-track__label"
              ><b>{{ t('growth.questStageReady') }}</b
              >{{ stacked ? '' : node.label }}</span
            >
          </BButton>
          <span
            v-else
            class="today-track__node"
            :class="{
              'is-gift': node.stage,
              'is-reached': node.reached,
              'is-ready': node.stage?.claimable && !node.stage?.claimed,
              'is-claimed': node.stage?.claimed,
              'is-end': node.end,
            }"
            :style="{ left: `${node.left}%` }"
          >
            <span class="today-track__dot">
              <SvgIcon
                v-if="node.stage?.claimed || (!node.stage && node.reached)"
                :src="icon.filterPanel.check"
                size="11"
              />
              <SvgIcon v-else-if="node.stage" :src="icon.growth.reward" size="13" />
              <template v-else>{{ node.step }}</template>
            </span>
            <span class="today-track__label">
              <b v-if="node.stage?.claimed">{{ t('growth.questStageClaimed') }}</b>
              <b v-else-if="node.stage?.claimable">{{ t('growth.questStageReady') }}</b>
              {{ stacked ? '' : node.label }}
            </span>
          </span>
        </template>
      </div>
      <div v-if="stacked && stageLegend.length" class="today-track__legend">
        <span v-for="item in stageLegend" :key="item.key">
          <SvgIcon :src="icon.growth.reward" size="13" />{{ item.text }}
        </span>
      </div>
      <GrowthClaimReceipt
        v-if="receipt && stacked"
        class="today-panel__receipt-block"
        :receipt="receipt"
        block
        @dismiss="$emit('dismiss-receipt')"
      />
      <BButton
        v-if="stacked && showClaimAll && claimableCount > 0"
        :type="claimIsPrimary ? 'primary' : undefined"
        class="today-panel__claim today-panel__claim--block"
        :class="{ 'is-secondary': !claimIsPrimary }"
        :loading="claiming"
        :disabled="readOnly || claiming"
        @click="$emit('claim-all')"
      >
        <SvgIcon :src="icon.growth.reward" size="15" />
        {{ t('growth.claimAllCount', { n: claimableCount }) }}
      </BButton>

      <div class="today-habit">
        <div class="today-streak">
          <span class="today-streak__icon" aria-hidden="true"><SvgIcon :src="icon.growth.streak" size="20" /></span>
          <span>
            <span class="today-streak__num"
              ><b>{{ streak }}</b
              ><span>{{ t('growth.overview.streakUnit') }}</span></span
            >
            <small>{{ streakSummary }}</small>
          </span>
        </div>

        <ol class="today-week" :aria-label="t('growth.overview.weekLabel')">
          <li
            v-for="day in week"
            :key="day.key"
            class="today-week__day"
            :class="[`is-${day.state}`, { 'is-today': day.isToday }]"
            :title="weekDayTitle(day)"
          >
            <span class="today-week__mark">
              <SvgIcon v-if="day.state === 'checked'" :src="icon.filterPanel.check" size="12" />
              <template v-else>{{ day.date }}</template>
            </span>
            <span class="today-week__name">{{
              day.isToday ? t('growth.overview.today') : weekdayLabel(day.weekday)
            }}</span>
          </li>
        </ol>

        <div v-if="nextMilestone" class="today-milestone">
          <div class="today-milestone__top">
            <b>{{ t('growth.overview.milestoneTitle', { n: nextMilestone.days }) }}</b>
            <span>{{ t('growth.overview.milestoneLeft', { n: nextMilestone.days - streak }) }}</span>
          </div>
          <div class="today-milestone__reward">{{ milestoneReward }}</div>
          <BProgress
            :percent="(streak / nextMilestone.days) * 100"
            size="small"
            :show-info="false"
            :aria-label="t('growth.overview.milestoneTitle', { n: nextMilestone.days })"
          />
        </div>
        <div v-else-if="milestones.length" class="today-milestone today-milestone--done">
          <b>{{ t('growth.overview.milestoneAllDone') }}</b>
        </div>
        <div v-else class="today-milestone" aria-hidden="true"></div>

        <div class="today-calendar">
          <BButton
            size="small"
            class="today-calendar__btn"
            v-click-log="{ module: '成长', operation: '打开签到日历' }"
            @click="$emit('open-calendar')"
          >
            <SvgIcon :src="icon.growth.checkin" size="14" />{{ t('growth.calTitle') }}
          </BButton>
          <small v-if="makeupCount > 0 && protectCards > 0" class="is-warning">{{
            t('growth.overview.makeupHint', { n: makeupCount, cards: protectCards })
          }}</small>
          <small v-else-if="protectCards > 0">{{ t('growth.overview.cardsHint', { n: protectCards }) }}</small>
        </div>
      </div>

      <div v-if="nextStep || manor" class="today-next">
        <template v-if="nextStep">
          <GrowthTaskIcon :task-key="nextStep.key" compact />
          <span class="today-next__tag">{{
            nextStep.kind === 'starter' ? t('growth.overview.starterTag') : t('growth.overview.weeklyTag')
          }}</span>
          <span class="today-next__title">{{ nextStepTitle }}</span>
          <span v-if="nextStepReward" class="today-next__reward">{{ nextStepReward }}</span>
          <BButton
            v-if="!readOnly"
            size="small"
            class="today-next__go"
            v-click-log="{ module: '成长', operation: `概览下一步-${nextStep.key}` }"
            @click="$emit('next-step')"
          >
            {{ lowPressure ? t('growth.nextActionExplore') : t('growth.nextActionGo') }}
          </BButton>
        </template>
        <BButton
          v-if="manor"
          type="text"
          class="today-next__manor"
          :disabled="readOnly"
          v-click-log="{ module: '成长', operation: '每日任务前往庄园' }"
          @click="$emit('manor')"
        >
          <SvgIcon :src="icon.manor.entry" size="18" />
          <span
            >{{ t('growth.questManorTitle') }}：{{
              stacked ? t('growth.overview.manorShort', { n: manor.perTask }) : manorRule
            }}</span
          >
          <b v-if="manor.water > 0">{{ t('growth.questManorCollect', { n: manor.water }) }}</b>
          <SvgIcon :src="icon.arrow_right" size="12" />
        </BButton>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import GrowthTaskIcon from '@/components/growth/GrowthTaskIcon.vue';
  import GrowthClaimReceipt from '@/components/growth/GrowthClaimReceipt.vue';
  import icon from '@/config/icon.ts';
  import type { Growth, Quest, QuestBonus, StreakMilestone } from '@/composables/useGrowth.ts';
  import type { ManorAttention } from '@/composables/useManorAttention';
  import type { ClaimReceiptState } from '@/composables/useGrowthClaimFeedback';
  import {
    buildWeekStrip,
    pickNextStreakMilestone,
    type OverviewNextStep,
    type WeekStripDay,
  } from '@/utils/growthOverview';

  const props = withDefaults(
    defineProps<{
      growth: Growth | null;
      quests: Quest[];
      bonus: QuestBonus;
      checkinDays: string[];
      totalCheckins: number;
      maxStreak: number;
      milestones: StreakMilestone[];
      claimableCount?: number;
      /** 最近一次在概览领取的回执，原位展示后由页面定时清除。 */
      receipt?: ClaimReceiptState | null;
      showClaimAll?: boolean;
      nextStep?: OverviewNextStep | null;
      manor?: ManorAttention | null;
      loading?: boolean;
      error?: boolean;
      readOnly?: boolean;
      lowPressure?: boolean;
      claiming?: boolean;
      checking?: boolean;
      stacked?: boolean;
    }>(),
    {
      claimableCount: 0,
      receipt: null,
      showClaimAll: true,
      nextStep: null,
      manor: null,
      loading: false,
      error: false,
      readOnly: false,
      lowPressure: false,
      claiming: false,
      checking: false,
      stacked: false,
    },
  );
  defineEmits<{
    checkin: [];
    'claim-all': [];
    'claim-stage': [];
    quest: [key: string];
    'next-step': [];
    'open-calendar': [];
    manor: [];
    retry: [];
    'dismiss-receipt': [];
  }>();
  const { t, te, locale } = useI18n();

  const QUEST_LABEL_KEYS: Record<string, string> = {
    checkin: 'growth.overview.checkinTitle',
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
  function questLabel(key: string) {
    const label = QUEST_LABEL_KEYS[key];
    return label && te(label) ? t(label) : t('growth.questUnknown');
  }

  const signed = computed(() => Boolean(props.growth?.checkedInToday));
  const streak = computed(() => Math.max(0, Number(props.growth?.streak || 0)));
  const dailyExp = computed(() => Math.max(0, Number(props.growth?.dailyExp || 0)));
  const dailyCap = computed(() => Math.max(0, Number(props.growth?.dailyCap || 0)));
  const dailyPercent = computed(() => (dailyCap.value ? Math.min(100, (dailyExp.value / dailyCap.value) * 100) : 0));
  const protectCards = computed(() => Number(props.growth?.protectCards || 0));
  const makeupCount = computed(() => (props.growth?.makeupDays || []).length);
  // 同一时间只保留一个实心主按钮：未签到时主操作是签到，签到后才轮到一键领取。
  const claimIsPrimary = computed(() => signed.value || props.readOnly);

  const todayLabel = computed(() => {
    const date = new Intl.DateTimeFormat(locale.value, { month: 'long', day: 'numeric', weekday: 'short' }).format(
      new Date(),
    );
    return `${date} · ${t('growth.dailyResetTime')}`;
  });

  // 签到始终作为当天第一步；旧策略的任务表里没有签到项时也单独保留入口。
  const tiles = computed(() => {
    const list = props.quests.map((quest) => ({
      key: quest.key,
      label: questLabel(quest.key),
      isCheckin: quest.key === 'checkin',
      done: quest.key === 'checkin' ? quest.done || signed.value : quest.done,
      progress: `${Math.min(quest.cur ?? 0, quest.target ?? 1)}/${quest.target ?? 1}`,
    }));
    if (!list.some((item) => item.isCheckin)) {
      list.unshift({ key: 'checkin', label: questLabel('checkin'), isCheckin: true, done: signed.value, progress: '' });
    }
    return list;
  });
  const checkinHint = computed(() =>
    props.totalCheckins > 0 || streak.value > 0
      ? t('growth.overview.checkinStreakDay', { n: streak.value + 1 })
      : t('growth.overview.checkinFirst'),
  );

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
  const questTotal = computed(() => Math.max(1, props.quests.length || Number(props.bonus.total || 0) || 3));
  const questDone = computed(() => props.quests.filter((quest) => quest.done).length);
  const trackPercent = computed(() => Math.min(100, (questDone.value / questTotal.value) * 100));
  function stageReward(stage: { exp: number; points: number }) {
    return stage.exp
      ? t('growth.questStageRewardMixed', { n: stage.exp, p: stage.points })
      : t('growth.questStageRewardPoints', { p: stage.points });
  }
  // 每档写明是「完成几项」时额外发放的奖励，最后一档也不用「全部完成」，避免被读成全天合计。
  function stageTitle(required: number) {
    return t('growth.overview.stageCount', { n: required });
  }
  const trackNodes = computed(() =>
    Array.from({ length: questTotal.value }, (_, index) => {
      const step = index + 1;
      const stage = stages.value.find((item) => item.required === step) || null;
      return {
        step,
        stage,
        left: (step / questTotal.value) * 100,
        end: step === questTotal.value,
        reached: questDone.value >= step,
        label: stage ? `${stageTitle(step)} · ${stageReward(stage)}` : stageTitle(step),
      };
    }),
  );
  const stageLegend = computed(() =>
    stages.value.map((stage) => ({ key: stage.key, text: `${stageTitle(stage.required)}：${stageReward(stage)}` })),
  );

  const week = computed(() =>
    buildWeekStrip({
      now: new Date(),
      checkinDays: props.checkinDays,
      makeupDays: props.growth?.makeupDays,
      checkedInToday: signed.value,
      streak: streak.value,
    }),
  );
  const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];
  const WEEKDAYS_EN = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  function weekdayLabel(weekday: number) {
    return (locale.value.startsWith('zh') ? WEEKDAYS_ZH : WEEKDAYS_EN)[weekday];
  }
  function weekDayTitle(day: WeekStripDay) {
    if (day.state === 'checked') return t('growth.calCheckedLegend');
    if (day.state === 'makeup') return t('growth.overview.weekMakeup');
    return '';
  }
  const streakSummary = computed(() =>
    props.totalCheckins > 0
      ? t('growth.overview.streakSummary', { total: props.totalCheckins, max: Math.max(props.maxStreak, streak.value) })
      : t('growth.overview.streakEmpty'),
  );

  const nextMilestone = computed(() => pickNextStreakMilestone(props.milestones, streak.value));
  function formatStorage(mb: number) {
    return mb >= 1024 ? `${+(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  }
  const milestoneReward = computed(() => {
    const milestone = nextMilestone.value;
    if (!milestone) return '';
    const parts = [t('growth.overview.rewardPoints', { n: milestone.points.toLocaleString('en-US') })];
    if (milestone.storageMb)
      parts.push(t('growth.overview.rewardStorage', { size: formatStorage(milestone.storageMb) }));
    if (milestone.cards) parts.push(t('growth.overview.rewardCards', { n: milestone.cards }));
    return parts.join(' · ');
  });

  const nextStepTitle = computed(() => {
    const step = props.nextStep;
    if (!step) return '';
    if (step.kind === 'starter') {
      const key = `growth.nextActions.${step.key}`;
      return t('growth.overview.starterTitle', { title: te(key) ? t(key) : t('growth.nextActionTypes.growth_task') });
    }
    const key = `growth.weeklyName.${step.key}`;
    return `${te(key) ? t(key) : t('growth.nextActionTypes.weekly_challenge')} ${step.current}/${step.target}`;
  });
  const nextStepReward = computed(() => {
    const step = props.nextStep;
    if (!step) return '';
    if (step.kind === 'starter') return step.exp > 0 ? t('growth.nextActionExpRewardShort', { n: step.exp }) : '';
    return step.points > 0 ? t('growth.nextActionPointsRewardShort', { n: step.points }) : '';
  });
  const manorRule = computed(() =>
    props.manor ? t('growth.questManorRule', { n: props.manor.perTask, bonus: props.manor.bonus }) : '',
  );
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/ui-density.less';

  .today-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .today-panel__head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: .ui-space(8px) [] .ui-space(16px) [];
    margin-bottom: .ui-space(14px) [];
  }
  .today-panel__title {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: .ui-space(4px) [] .ui-space(12px) [];
    min-width: 0;
  }
  .today-panel__title h2 {
    margin: 0;
    font-size: .ui-font(19px) [];
    font-weight: 700;
    color: var(--text-color);
  }
  .today-panel__title span {
    font-size: .ui-font(13px) [];
    color: var(--desc-color);
  }
  .today-panel__meta {
    display: flex;
    align-items: center;
    gap: .ui-space(16px) [];
    margin-left: auto;
  }
  .today-panel__exp {
    display: inline-flex;
    align-items: center;
    gap: .ui-space(4px) [];
    font-size: .ui-font(13px) [];
    color: var(--desc-color);
    white-space: nowrap;
  }
  .today-panel__exp-value {
    margin-left: .ui-space(2px) [];
  }
  .today-panel__exp b {
    color: var(--text-color);
    font-size: .ui-font(14px) [];
  }
  .today-panel__exp-bar {
    width: .ui-layout(88px) [];
    margin-left: .ui-space(6px) [];
  }
  .today-panel__claim.b_btn {
    gap: .ui-space(6px) [];
  }
  .today-panel__claim.b_btn.is-secondary {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: transparent;
  }
  .today-panel__receipt-block {
    margin-top: .ui-space(12px) [];
  }
  .today-panel__claim--block.b_btn {
    width: 100%;
    margin-top: .ui-space(12px) [];
  }
  .today-panel__state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: .ui-space(10px) [];
    min-height: .ui-layout(120px) [];
    color: var(--desc-color);
  }
  .today-panel__state--error {
    color: var(--danger-color);
  }

  .today-panel__quests {
    display: grid;
    grid-template-columns: repeat(var(--quest-columns, 3), minmax(0, 1fr));
    gap: .ui-space(12px) [];
  }
  .today-quest {
    display: flex;
    align-items: center;
    gap: .ui-space(12px) [];
    min-width: 0;
    min-height: .ui-layout(64px) [];
    padding: .ui-space(12px) [] .ui-space(14px) [];
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--surface-card-bg);
  }
  .today-quest.is-cta {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--surface-card-bg));
  }
  .today-quest.is-done {
    background: var(--surface-panel-bg);
  }
  .today-quest__copy {
    display: flex;
    flex-direction: column;
    gap: .ui-space(3px) [];
    min-width: 0;
  }
  .today-quest__copy b {
    overflow: hidden;
    color: var(--text-color);
    font-size: .ui-font(14px) [];
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .today-quest__copy small {
    display: inline-flex;
    align-items: center;
    gap: .ui-space(3px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .today-quest__copy small.today-quest__done {
    color: var(--success-color);
    font-weight: 600;
  }
  .today-quest__action.b_btn,
  .today-quest__go.b_btn {
    flex: 0 0 auto;
    margin-left: auto;
  }
  .today-quest__go.b_btn {
    gap: .ui-space(2px) [];
    color: var(--primary-color);
    font-weight: 600;
  }

  .today-track {
    position: relative;
    height: .ui-layout(48px) [];
    margin: .ui-space(14px) [] 0 0;
  }
  .today-track__rail,
  .today-track__fill {
    position: absolute;
    top: .ui-space(11px) [];
    left: 0;
    height: .ui-space(5px) [];
    border-radius: 999px;
  }
  .today-track__rail {
    right: 0;
    background: var(--hover-background);
  }
  .today-track__fill {
    background: var(--primary-color);
    transition: width 0.4s ease;
  }
  .today-track__node,
  .today-track__node.b_btn {
    position: absolute;
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: .ui-space(4px) [];
    height: auto;
    padding: 0;
    border: 0;
    background: transparent;
    transform: translateX(-50%);
    line-height: normal;
  }
  .today-track__node.is-end {
    align-items: flex-end;
    transform: translateX(-100%);
  }
  .today-track__dot {
    display: grid;
    width: .ui-layout(26px) [];
    height: .ui-layout(26px) [];
    place-items: center;
    border: 2px solid var(--card-border-color);
    border-radius: 50%;
    background: var(--surface-card-bg);
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    font-weight: 700;
    box-sizing: border-box;
  }
  .today-track__node.is-reached .today-track__dot {
    border-color: var(--primary-color);
    background: var(--primary-color);
    color: #fff;
  }
  .today-track__node.is-gift.is-reached .today-track__dot,
  .today-track__node.is-ready .today-track__dot {
    border-color: var(--warning-color);
    background: var(--surface-card-bg);
    color: var(--warning-color);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--warning-color) 16%, transparent);
  }
  .today-track__node.is-claimed .today-track__dot {
    border-color: var(--success-color);
    background: var(--surface-card-bg);
    color: var(--success-color);
    box-shadow: none;
  }
  .today-track__node.b_btn.is-ready:hover .today-track__dot {
    background: color-mix(in srgb, var(--warning-color) 12%, var(--surface-card-bg));
  }
  .today-track__label {
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    white-space: nowrap;
  }
  .today-track__label b {
    margin-right: .ui-space(4px) [];
    color: var(--warning-color);
  }
  .today-track__node.is-claimed .today-track__label b {
    color: var(--success-color);
  }
  .today-track__legend {
    display: flex;
    flex-direction: column;
    gap: .ui-space(3px) [];
    color: var(--warning-color);
    font-size: .ui-font(12px) [];
    font-weight: 600;
  }
  .today-track__legend span {
    display: inline-flex;
    align-items: center;
    gap: .ui-space(4px) [];
  }

  .today-habit {
    display: grid;
    grid-template-columns: minmax(var(--ui-layout-180, 180px), auto) auto minmax(0, 1fr) auto;
    align-items: center;
    gap: .ui-space(16px) [] .ui-space(28px) [];
    margin-top: .ui-space(14px) [];
    padding-top: .ui-space(16px) [];
    border-top: 1px solid var(--surface-divider-color);
  }
  .today-streak {
    display: flex;
    align-items: center;
    gap: .ui-space(12px) [];
    min-width: 0;
  }
  .today-streak__icon {
    display: grid;
    width: .ui-layout(40px) [];
    height: .ui-layout(40px) [];
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--warning-color) 35%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--warning-color) 10%, transparent);
    color: var(--warning-color);
  }
  .today-streak__num {
    display: flex;
    align-items: baseline;
    gap: .ui-space(4px) [];
  }
  .today-streak__num b {
    color: var(--text-color);
    font-size: .ui-font(24px) [];
    font-weight: 700;
    line-height: 1;
  }
  .today-streak__num span {
    color: var(--text-color);
    font-size: .ui-font(13px) [];
    font-weight: 600;
  }
  .today-streak small {
    display: block;
    margin-top: .ui-space(5px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .today-week {
    display: flex;
    gap: .ui-space(8px) [];
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .today-week__day {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: .ui-space(4px) [];
    color: var(--desc-color);
    font-size: .ui-font(11px) [];
  }
  .today-week__mark {
    display: grid;
    width: .ui-layout(28px) [];
    height: .ui-layout(28px) [];
    place-items: center;
    border: 1.5px solid var(--card-border-color);
    border-radius: 50%;
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    box-sizing: border-box;
  }
  .today-week__day.is-checked .today-week__mark {
    border-color: var(--primary-color);
    background: var(--primary-color);
    color: #fff;
  }
  .today-week__day.is-today .today-week__mark {
    border: 2px solid var(--primary-color);
    color: var(--primary-color);
    font-weight: 700;
  }
  .today-week__day.is-today.is-checked .today-week__mark {
    color: #fff;
  }
  .today-week__day.is-today .today-week__name {
    color: var(--primary-color);
    font-weight: 700;
  }
  .today-week__day.is-makeup .today-week__mark {
    border-style: dashed;
    border-color: var(--warning-color);
    color: var(--warning-color);
    font-weight: 700;
  }
  .today-week__day.is-future .today-week__mark {
    border-style: dashed;
    opacity: 0.6;
  }
  .today-milestone {
    min-width: 0;
  }
  .today-milestone__top {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: .ui-space(2px) [] .ui-space(8px) [];
    font-size: .ui-font(13px) [];
  }
  .today-milestone__top b,
  .today-milestone--done b {
    color: var(--text-color);
    font-weight: 600;
    font-size: .ui-font(13px) [];
  }
  .today-milestone__top span {
    color: var(--desc-color);
  }
  .today-milestone__reward {
    margin: .ui-space(4px) [] 0 .ui-space(8px) [];
    color: var(--warning-color);
    font-size: .ui-font(12px) [];
    font-weight: 600;
  }
  .today-milestone :deep(.b-progress) {
    max-width: .ui-layout(360px) [];
  }
  .today-calendar {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: .ui-space(4px) [];
  }
  .today-calendar__btn.b_btn {
    gap: .ui-space(4px) [];
    border-color: color-mix(in srgb, var(--primary-color) 45%, var(--card-border-color));
    color: var(--primary-color);
  }
  .today-calendar small {
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
  }
  .today-calendar small.is-warning {
    color: var(--warning-color);
    font-weight: 600;
  }

  .today-next {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: .ui-space(8px) [] .ui-space(10px) [];
    margin-top: .ui-space(16px) [];
    padding: .ui-space(10px) [] .ui-space(12px) [];
    border: 1px solid var(--surface-divider-color);
    border-radius: 10px;
    background: var(--surface-panel-bg);
  }
  .today-next__tag {
    padding: .ui-space(2px) [] .ui-space(8px) [];
    border: 1px solid color-mix(in srgb, var(--primary-color) 40%, transparent);
    border-radius: 6px;
    color: var(--primary-color);
    font-size: .ui-font(12px) [];
    font-weight: 600;
    white-space: nowrap;
  }
  .today-next__title {
    min-width: 0;
    color: var(--text-color);
    font-size: .ui-font(13px) [];
    font-weight: 600;
  }
  .today-next__reward {
    color: var(--warning-color);
    font-size: .ui-font(12px) [];
    font-weight: 600;
  }
  .today-next__go.b_btn {
    border-color: color-mix(in srgb, var(--primary-color) 45%, var(--card-border-color));
    color: var(--primary-color);
  }
  .today-next__manor.b_btn {
    gap: .ui-space(6px) [];
    height: auto;
    margin-left: auto;
    padding: .ui-space(2px) [] .ui-space(4px) [];
    color: var(--desc-color);
    font-size: .ui-font(12px) [];
    line-height: 1.4;
    white-space: normal;
    text-align: left;
  }
  .today-next__manor.b_btn:hover {
    color: var(--text-color);
  }
  .today-next__manor b {
    color: var(--success-color);
  }

  @media (max-width: 1180px) {
    .today-habit {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .today-milestone {
      grid-column: 1 / -1;
    }
  }

  .today-panel--stacked {
    .today-panel__head {
      margin-bottom: .ui-space(12px) [];
    }
    .today-panel__quests {
      grid-template-columns: minmax(0, 1fr);
      gap: .ui-space(8px) [];
    }
    .today-quest {
      min-height: auto;
      padding: .ui-space(10px) [] .ui-space(12px) [];
    }
    .today-track {
      height: .ui-layout(44px) [];
      margin-right: .ui-space(10px) [];
    }
    .today-habit {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: .ui-space(12px) [];
    }
    .today-week {
      grid-column: 1 / -1;
      justify-content: space-between;
      order: 3;
    }
    .today-milestone {
      grid-column: 1 / -1;
      order: 4;
    }
    .today-calendar {
      order: 2;
    }
    .today-next__manor.b_btn {
      width: 100%;
      margin-left: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .today-track__fill {
      transition: none;
    }
  }
</style>
