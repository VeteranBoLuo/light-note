<template>
  <div class="points-center">
    <div v-if="loading && !summary" class="points-center-state">
      <BLoading :loading="true" inline :title="t('common.loading')" />
    </div>
    <div v-else-if="error && !summary" class="points-center-state points-center-state--error">
      <span>{{ t('growth.pointsCenterLoadFailed') }}</span>
      <BButton size="small" @click="load">{{ t('common.retry') }}</BButton>
    </div>

    <template v-else-if="summary">
      <header class="points-center-hero">
        <div>
          <span class="points-center-kicker">{{ t('growth.pointsCenterBalance') }}</span>
          <strong>{{ formatNumber(summary.balance) }}</strong>
        </div>
        <p>{{ t('growth.pointsCenterSubtitle') }}</p>
      </header>

      <section class="points-center-metrics" :aria-label="t('growth.pointsCenterPace')">
        <article>
          <span>{{ t('growth.pointsCenterTodayStable') }}</span>
          <b>+{{ formatNumber(summary.today?.stableEarned) }}</b>
        </article>
        <article>
          <span>{{ t('growth.pointsCenterWeekStable') }}</span>
          <b>+{{ formatNumber(summary.week?.stableEarned) }}</b>
        </article>
        <article>
          <span>{{ t('growth.pointsCenterWeekRandom') }}</span>
          <b>+{{ formatNumber(summary.week?.randomEarned) }}</b>
        </article>
        <article>
          <span>{{ t('growth.pointsCenterSpent28') }}</span>
          <b class="is-spent">-{{ formatNumber(summary.last28Days?.spent) }}</b>
        </article>
      </section>

      <div class="points-center-grid">
        <section class="points-center-card points-goal-card">
          <div class="points-center-heading">
            <div>
              <h3>{{ t('growth.pointsCenterGoal') }}</h3>
              <p>{{ t('growth.pointsCenterGoalHint') }}</p>
            </div>
          </div>
          <div class="points-goal-controls">
            <BSelect
              v-model:value="goalItemId"
              :options="goalOptions"
              :disabled="readOnly || saving"
              :placeholder="t('growth.pointsCenterGoalChoose')"
              show-search
              allow-clear
            />
            <BButton
              type="primary"
              :loading="saving"
              :disabled="readOnly || saving || !goalItemId"
              @click="saveGoal(true)"
            >
              {{ t('growth.pointsCenterGoalSave') }}
            </BButton>
            <BButton v-if="summary.goal?.enabled" :disabled="readOnly || saving" @click="saveGoal(false)">
              {{ t('growth.pointsCenterGoalDisable') }}
            </BButton>
          </div>

          <div v-if="summary.goal?.enabled" class="points-goal-progress">
            <div class="points-goal-title">
              <strong>{{ goalName }}</strong>
              <span v-if="summary.goal?.unavailable" class="points-goal-unavailable">
                {{ t('growth.pointsCenterGoalUnavailable') }}
              </span>
              <span v-else>{{ formatNumber(summary.goal?.balance) }} / {{ formatNumber(summary.goal?.price) }}</span>
            </div>
            <BProgress :percent="summary.goal?.progress || 0" size="small" />
            <div class="points-goal-meta">
              <span>{{ t('growth.pointsCenterGoalShortfall', { n: formatNumber(summary.goal?.shortfall) }) }}</span>
              <span v-if="summary.goal?.estimate">
                {{
                  t('growth.pointsCenterGoalEstimate', {
                    min: summary.goal.estimate.minDays,
                    max: summary.goal.estimate.maxDays,
                  })
                }}
              </span>
            </div>
            <p v-if="summary.goal?.estimate" class="points-goal-disclaimer">
              {{ t('growth.pointsCenterGoalDisclaimer') }}
            </p>
            <p v-else-if="summary.lowPressureMode" class="points-goal-disclaimer">
              {{ t('growth.pointsCenterGoalLowPressure') }}
            </p>
          </div>
          <p v-else class="points-goal-empty">{{ t('growth.pointsCenterGoalEmpty') }}</p>
        </section>

        <section class="points-center-card">
          <div class="points-center-heading">
            <div>
              <h3>{{ t('growth.pointsCenterSources') }}</h3>
              <p>{{ t('growth.pointsCenterSourcesHint') }}</p>
            </div>
          </div>
          <div v-if="positiveSources.length" class="points-source-list">
            <div v-for="source in positiveSources" :key="`${source.reason}:${source.key}`" class="points-source-item">
              <div class="points-source-title">
                <span>{{ sourceLabel(source) }}</span>
                <b>{{ source.amount > 0 ? '+' : '' }}{{ formatNumber(source.amount) }}</b>
              </div>
              <BProgress :percent="sourcePercent(source.amount)" size="small" />
            </div>
          </div>
          <p v-else class="points-goal-empty">{{ t('growth.pointsCenterSourcesEmpty') }}</p>
        </section>
      </div>

      <section class="points-center-card points-rules-card">
        <div class="points-center-heading">
          <div>
            <h3>{{ t('growth.pointsCenterHowToEarn') }}</h3>
            <p>{{ t('growth.pointsCenterRulesHint') }}</p>
          </div>
          <span class="points-policy-version">{{ summary.policyVersion }}</span>
        </div>
        <div class="points-rules-grid">
          <article>
            <span>{{ t('growth.pointsCenterRuleCheckin') }}</span>
            <b>{{ checkinRule }}</b>
            <small>{{ t('growth.pointsCenterRuleStable') }}</small>
          </article>
          <article>
            <span>{{ t('growth.pointsCenterRuleDaily') }}</span>
            <b>{{ dailyRule }}</b>
            <small>{{ t('growth.pointsCenterRuleKnowledge') }}</small>
          </article>
          <article>
            <span>{{ t('growth.pointsCenterRuleWeekly') }}</span>
            <b>{{
              formatNumber(
                summary.earningRules?.weekly?.reduce((sum: number, item: any) => sum + Number(item.reward || 0), 0),
              )
            }}</b>
            <small>{{ t('growth.pointsCenterRuleStable') }}</small>
          </article>
          <article>
            <span>{{ t('growth.pointsCenterRuleRandom') }}</span>
            <b>{{ t('growth.pointsCenterRuleUncertain') }}</b>
            <small>{{ t('growth.pointsCenterRuleRandomHint') }}</small>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import growthApi from '@/api/growthApi.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';

  const props = withDefaults(defineProps<{ readOnly?: boolean }>(), { readOnly: false });
  const { t, te } = useI18n();
  const summary = ref<any>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref(false);
  const goalItemId = ref<string | null>(null);

  const goalOptions = computed(() =>
    (summary.value?.goalOptions || []).map((item: any) => ({
      value: item.id,
      label: `${item.name} · ${formatNumber(item.cost)} ${t('growth.points')}`,
    })),
  );
  const positiveSources = computed(() =>
    (summary.value?.sources || []).filter((item: any) => Number(item.amount || 0) !== 0).slice(0, 8),
  );
  const sourceTotal = computed(() =>
    positiveSources.value.reduce((sum: number, item: any) => sum + Math.abs(Number(item.amount || 0)), 0),
  );
  const goalName = computed(
    () =>
      summary.value?.goal?.item?.name ||
      goalOptions.value.find((item: any) => item.value === summary.value?.goal?.itemId)?.label ||
      t('growth.pointsCenterGoalUnavailable'),
  );
  const checkinRule = computed(() => {
    const rule = summary.value?.earningRules?.checkin;
    return rule ? `${rule.base}～${rule.maximum}` : '—';
  });
  const dailyRule = computed(
    () => (summary.value?.earningRules?.daily || []).map((item: any) => item.points).join(' + ') || '—',
  );

  function formatNumber(value: unknown) {
    return Number(value || 0).toLocaleString('zh-CN');
  }
  function sourcePercent(amount: unknown) {
    return sourceTotal.value ? (Math.abs(Number(amount || 0)) / sourceTotal.value) * 100 : 0;
  }
  function sourceLabel(source: any) {
    const reasonKey = `growth.pointsReason.${source.reason}`;
    const key = `growth.pointsCenterSource.${source.key}`;
    if (te(key)) return t(key);
    if (te(reasonKey)) return t(reasonKey);
    return source.reason;
  }

  async function load() {
    loading.value = true;
    error.value = false;
    try {
      const response = await growthApi.getPointsSummary();
      if (response?.status !== 200) throw new Error('POINTS_CENTER_LOAD_FAILED');
      summary.value = response.data;
      goalItemId.value = response.data?.goal?.itemId || null;
    } catch (loadError) {
      console.error('积分中心加载失败:', loadError);
      error.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function saveGoal(enabled: boolean) {
    if (props.readOnly || saving.value || (enabled && !goalItemId.value)) return;
    saving.value = true;
    try {
      const response = await growthApi.updatePointsGoal({ itemId: goalItemId.value, enabled });
      if (response?.status !== 200 || !response.data?.ok) throw new Error('POINTS_GOAL_SAVE_FAILED');
      message.success(t('growth.pointsCenterGoalSaved'));
      await load();
    } catch (saveError) {
      console.error('积分目标保存失败:', saveError);
      message.error(t('growth.pointsCenterGoalSaveFailed'));
    } finally {
      saving.value = false;
    }
  }

  onMounted(load);
</script>

<style scoped lang="less">
  .points-center {
    display: flex;
    min-height: 360px;
    flex-direction: column;
    gap: 16px;
  }
  .points-center-state {
    display: flex;
    min-height: 320px;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--desc-color);
  }
  .points-center-hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 20px;
    padding: 20px;
    border: 1px solid var(--primary-color);
    border-radius: 15px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--primary-color) 13%, var(--workbench-subcard-bg)),
      var(--workbench-subcard-bg)
    );
  }
  .points-center-hero > div {
    display: grid;
    gap: 5px;
  }
  .points-center-hero strong {
    color: var(--primary-color);
    font-size: clamp(30px, 5vw, 44px);
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .points-center-hero p {
    max-width: 420px;
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
    text-align: right;
  }
  .points-center-kicker {
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-center-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .points-center-metrics article {
    display: grid;
    gap: 6px;
    padding: 14px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--workbench-subcard-bg);
  }
  .points-center-metrics span {
    color: var(--desc-color);
    font-size: 11.5px;
  }
  .points-center-metrics b {
    color: var(--success-color);
    font-size: 19px;
    font-variant-numeric: tabular-nums;
  }
  .points-center-metrics b.is-spent {
    color: var(--danger-color);
  }
  .points-center-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
    gap: 16px;
  }
  .points-center-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 14px;
    padding: 17px;
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    background: var(--workbench-subcard-bg);
  }
  .points-center-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .points-center-heading h3 {
    margin: 0;
    color: var(--text-color);
    font-size: 15px;
  }
  .points-center-heading p {
    margin: 4px 0 0;
    color: var(--desc-color);
    font-size: 11.5px;
    line-height: 1.5;
  }
  .points-goal-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
  }
  .points-goal-progress {
    display: grid;
    gap: 9px;
    padding: 13px;
    border: 1px solid var(--card-border-color);
    border-radius: 11px;
    background: var(--background-color);
  }
  .points-goal-title,
  .points-goal-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .points-goal-title span,
  .points-goal-meta {
    color: var(--desc-color);
    font-size: 11.5px;
  }
  .points-goal-unavailable {
    color: var(--danger-color) !important;
  }
  .points-goal-disclaimer,
  .points-goal-empty {
    margin: 0;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.55;
  }
  .points-source-list {
    display: grid;
    gap: 11px;
  }
  .points-source-item {
    display: grid;
    gap: 5px;
  }
  .points-source-title {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: var(--desc-color);
    font-size: 11.5px;
  }
  .points-source-title b {
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }
  .points-policy-version {
    flex: none;
    padding: 4px 8px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    font-size: 10px;
  }
  .points-rules-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .points-rules-grid article {
    display: grid;
    gap: 5px;
    padding: 12px;
    border-radius: 10px;
    background: var(--background-color);
  }
  .points-rules-grid span,
  .points-rules-grid small {
    color: var(--desc-color);
    font-size: 10.5px;
  }
  .points-rules-grid b {
    color: var(--primary-color);
    font-size: 17px;
  }
  @media (max-width: 760px) {
    .points-center-hero {
      align-items: flex-start;
      flex-direction: column;
    }
    .points-center-hero p {
      text-align: left;
    }
    .points-center-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .points-center-grid {
      grid-template-columns: 1fr;
    }
    .points-rules-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .points-goal-controls {
      grid-template-columns: 1fr 1fr;
    }
    .points-goal-controls :first-child {
      grid-column: 1 / -1;
    }
  }
  html.light-note-mobile-rendering .points-center-hero,
  html.light-note-mobile-rendering .points-center-card,
  html.light-note-mobile-rendering .points-center-metrics article {
    box-shadow: none;
  }
</style>
