<template>
  <div class="run-summary" :class="{ finished, mobile }">
    <div class="run-review" :class="{ mobile }">
      <div class="review-counts">
        <section class="result-kpi result-primary">
          <h4>{{ t('organizeProgress.pending') }}</h4>
          <strong
            >{{ review?.pending ?? '—' }}<small>{{ t('organizeProgress.suggestionUnit') }}</small></strong
          >
          <p>{{
            review?.outcomes
              ? t('organizeProgress.reviewObjects', { count: review.outcomes.review })
              : t('organizeProgress.reviewAction')
          }}</p>
        </section>
        <section v-if="manualObjects" class="result-kpi">
          <h4>{{ outcomeLabel('manual') }}</h4>
          <strong
            >{{ manualObjects }}<small>{{ t('organizeProgress.itemUnit') }}</small></strong
          >
          <p>{{ t(tagOnly ? 'organizeIcons.manualHint' : 'organizeProgress.manualAction') }}</p>
        </section>
        <section v-if="review?.outcomes?.unfinished" class="result-kpi result-warning">
          <h4>{{ t('organizeProgress.outcomes.unfinished') }}</h4>
          <strong
            >{{ review.outcomes.unfinished }}<small>{{ t('organizeProgress.itemUnit') }}</small></strong
          >
          <p>{{ t('organizeProgress.unfinishedAction') }}</p>
        </section>
        <section v-if="review?.outcomes?.unchanged" class="result-kpi result-unchanged">
          <h4>{{ t('organizeProgress.outcomes.unchanged') }}</h4>
          <strong
            >{{ review.outcomes.unchanged }}<small>{{ t('organizeProgress.itemUnit') }}</small></strong
          >
          <p>{{ t('organizeProgress.unchangedHint') }}</p>
        </section>
      </div>
      <div v-if="outcomes" class="outcome-summary">
        <div class="outcome-heading">
          <p class="outcome-title">{{ t('organizeProgress.outcomesTitle', { count: outcomeTotal }) }}</p>
          <p>{{ t('organizeProgress.distributionHint') }}</p>
        </div>
        <div class="outcome-track" role="group" :aria-label="outcomeDescription">
          <BTooltip
            v-for="[key, count] in outcomes"
            :key="key"
            :class="`outcome-segment segment-${key}`"
            :style="{ flexGrow: count }"
            :title="outcomeTooltip(key, count)"
            :disabled="mobile"
          >
            <span class="outcome-fill" :aria-label="outcomeTooltip(key, count)" />
          </BTooltip>
        </div>
        <dl class="outcome-counts">
          <div v-for="[key, count] in outcomes" :key="key" :class="`outcome-${key}`">
            <dt
              ><BTooltip :title="outcomeTooltip(key, count)" :disabled="mobile"
                ><span :class="`outcome-swatch segment-${key}`" aria-hidden="true" />{{ outcomeLabel(key) }}</BTooltip
              ></dt
            >
            <dd
              >{{ count }} <small>{{ t('organizeProgress.itemUnit') }}</small></dd
            >
          </div>
        </dl>
      </div>
      <p class="review-guidance">{{
        t(active ? 'organizeProgress.reviewWorking' : 'organizeProgress.reviewAction')
      }}</p>
    </div>

    <div class="run-progress" :class="{ legacy: !run.overview, mobile }">
      <section class="run-metric">
        <h4
          ><SvgIcon :src="icon.organize.file" size="18" />{{
            t(run.overview ? 'organizeProgress.inspection' : 'organizeProgress.legacyInspection')
          }}</h4
        >
        <strong
          >{{ checked ?? '—' }}<small> / {{ run.summary.total }} {{ t('organizeProgress.objectUnit') }}</small></strong
        >
        <BProgress
          v-if="checked != null && checked < run.summary.total && !stopped"
          :percent="Math.min(100, (checked / run.summary.total) * 100)"
          size="small"
          :aria-label="t('organizeProgress.inspection')"
        />
        <p>{{
          t(
            run.overview
              ? stopped
                ? 'organizeProgress.inspectionEnded'
                : run.overview.inspection.settled
                  ? 'organizeProgress.inspectionDone'
                  : 'organizeProgress.inspectionHint'
              : finished
                ? checked === run.summary.total
                  ? 'organizeProgress.inspectionDone'
                  : 'organizeProgress.inspectionEnded'
                : 'organizeProgress.legacyInspectionHint',
          )
        }}</p>
        <p v-if="run.overview?.inspection.skipped">{{
          t('organizeProgress.skipped', { count: run.overview.inspection.skipped })
        }}</p>
      </section>
      <template v-if="run.overview">
        <section v-for="name in lanes" :key="name" class="run-metric" :data-lane="name">
          <h4
            ><SvgIcon :src="name === 'ai' ? icon.organize.spark : icon.organize.check" size="18" />{{
              t(`organizeProgress.${name}`)
            }}</h4
          >
          <strong class="metric-label" v-if="!run.overview.inspection.settled && !stopped">{{
            t('organizeProgress.waitingInspection')
          }}</strong>
          <strong class="metric-label" v-else-if="!run.overview[name].total">{{
            t(
              stopped
                ? 'organizeProgress.notRun'
                : run.overview[name].settled
                  ? 'organizeProgress.notNeeded'
                  : 'organizeProgress.undetermined',
            )
          }}</strong>
          <strong v-else
            >{{ run.overview[name].completed }}<small> {{ t('organizeProgress.completedUnit') }}</small></strong
          >
          <BProgress
            v-if="
              run.overview.inspection.settled && run.overview[name].settled && run.overview[name].total && !finished
            "
            :percent="percent(run.overview[name])"
            size="small"
            :aria-label="t(`organizeProgress.${name}`)"
          />
          <p v-if="run.overview.inspection.settled && details(run.overview[name])">{{ details(run.overview[name]) }}</p>
          <p v-if="run.overview.inspection.settled && run.overview[name].settled && run.overview[name].total">{{
            t('organizeProgress.endedTotal', { ended: ended(run.overview[name]), total: run.overview[name].total })
          }}</p>
          <p class="metric-warning" v-if="warnings(run.overview[name])">{{ warnings(run.overview[name]) }}</p>
          <p v-if="!finished">{{ t(name === 'ai' ? 'organizeProgress.aiHint' : 'organizeProgress.directHint') }}</p>
          <p v-if="name === 'direct' && run.overview[name].waiting && run.options.checks.includes('duplicate')">{{
            t('organizeProgress.waitingEvidence')
          }}</p>
        </section>
      </template>
      <section v-else class="run-metric">
        <h4><SvgIcon :src="icon.organize.spark" size="18" />{{ t('organizeProgress.legacyProcessing') }}</h4>
        <strong class="metric-label" v-if="run.summary.aiTotal == null">{{
          t('organizeProgress.waitingInspection')
        }}</strong>
        <strong v-else
          >{{ legacy.completed }}<small> {{ t('organizeProgress.completedUnit') }}</small></strong
        >
        <p v-if="run.summary.aiTotal != null">{{
          t('organizeProgress.legacyScope', { count: run.summary.aiTotal })
        }}</p>
        <p v-if="details(legacy)">{{ details(legacy) }}</p>
        <p class="metric-warning" v-if="warnings(legacy)">{{ warnings(legacy) }}</p>
        <p v-if="!finished">{{ t('organizeProgress.legacyHint') }}</p>
      </section>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { OrganizeLaneProgress } from '@lightnote/shared/organize-progress';
  import type { SuggestionRun } from '@/api/organizeSuggestionApi';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  const props = defineProps<{ run: SuggestionRun; mobile?: boolean }>();
  const { t } = useI18n();
  const lanes = ['direct', 'ai'] as const;
  const finished = computed(() => ['completed', 'ended', 'cancelled', 'failed'].includes(props.run.status));
  const stopped = computed(() => ['ended', 'cancelled', 'failed'].includes(props.run.status));
  const checked = computed(
    () =>
      props.run.overview?.inspection.checked ??
      props.run.checked ??
      (props.run.status === 'completed' ? props.run.summary.total : null),
  );
  const review = computed(
    () =>
      props.run.overview?.review ??
      props.run.review ??
      (props.run.counts
        ? {
            pending: props.run.counts.filter((c) => c.status === 'pending').reduce((n, c) => n + Number(c.total), 0),
            manualObjects: 0,
            retryFiles: 0,
            outcomes: undefined,
          }
        : undefined),
  );
  const tagOnly = computed(
    () => props.run.options.resourceTypes.length === 1 && props.run.options.resourceTypes[0] === 'tag',
  );
  const outcomeLabel = (key: string) =>
    t(tagOnly.value && key === 'manual' ? 'organizeIcons.manualGroup' : `organizeProgress.outcomes.${key}`);
  const manualObjects = computed(() => review.value?.outcomes?.manual ?? review.value?.manualObjects ?? 0);
  const outcomes = computed(() =>
    review.value?.outcomes ? Object.entries(review.value.outcomes).filter(([, count]) => count > 0) : null,
  );
  const outcomeTotal = computed(() => outcomes.value?.reduce((n, [, count]) => n + count, 0) || 0);
  function outcomeTooltip(key: string, count: number) {
    const percent = outcomeTotal.value ? Math.round((count / outcomeTotal.value) * 1000) / 10 : 0;
    return t('organizeProgress.distributionTooltip', {
      status: outcomeLabel(key),
      count,
      total: outcomeTotal.value,
      percent,
    });
  }
  const outcomeDescription = computed(
    () => outcomes.value?.map(([key, count]) => `${outcomeLabel(key)} ${count}`).join('，') || '',
  );
  const active = computed(() => {
    if (['preparing', 'running'].includes(props.run.status)) return true;
    if (props.run.status !== 'paused') return false;
    const o = props.run.overview;
    return o
      ? !o.inspection.settled || o.direct.running + o.direct.waiting + o.direct.queued + o.ai.running > 0
      : props.run.rulePhase !== 'completed' || (props.run.inFlight || 0) > 0;
  });
  const ended = (lane: OrganizeLaneProgress) =>
    lane.completed + lane.partial + lane.failed + lane.cancelled + lane.skipped;
  const percent = (lane: OrganizeLaneProgress) => (lane.total ? Math.min(100, (ended(lane) / lane.total) * 100) : 0);
  function details(lane: OrganizeLaneProgress) {
    return (['running', 'queued', 'waiting'] as const)
      .filter((key) => lane[key] > 0)
      .map((key) => t(`organizeProgress.${key}`, { count: lane[key] }))
      .join(' · ');
  }
  function warnings(lane: OrganizeLaneProgress) {
    return (['partial', 'failed', 'cancelled', 'skipped'] as const)
      .filter((key) => lane[key] > 0)
      .map((key) => t(`organizeProgress.${key}`, { count: lane[key] }))
      .join(' · ');
  }
  const legacy = computed<OrganizeLaneProgress>(() => {
    const sum = (...states: string[]) =>
      (props.run.progress || []).filter((p) => states.includes(p.aiStatus)).reduce((n, p) => n + Number(p.total), 0);
    return {
      total: props.run.summary.aiTotal || 0,
      completed: sum('completed'),
      failed: sum('failed', 'conflict'),
      cancelled: sum('cancelled'),
      running: sum('running'),
      queued: sum('queued'),
      waiting: sum('waiting_content', 'preparing_content'),
      partial: 0,
      skipped: 0,
      settled: props.run.summary.aiTotal != null,
    };
  });
</script>
<style scoped lang="less">
  .run-progress {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 10px 18px 14px;
    gap: 0;
  }
  .run-progress.legacy {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .run-metric {
    min-width: 0;
    padding: 0 16px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-content: start;
    align-items: center;
    gap: 5px 12px;
  }
  .run-metric:first-child {
    padding-left: 0;
  }
  .run-metric + .run-metric {
    border-left: 1px solid var(--workspace-divider);
  }
  h4 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--workspace-muted);
    font-size: 13px;
    font-weight: 500;
  }
  strong {
    display: block;
    color: var(--workspace-text);
    font-size: 24px;
    line-height: 1.3;
    font-variant-numeric: tabular-nums;
    overflow-wrap: anywhere;
  }
  strong small {
    margin-left: 4px;
    font-size: 13px;
    font-weight: 400;
    color: var(--workspace-muted);
  }
  strong.metric-label {
    font-size: 16px;
    min-height: 0;
  }
  p {
    color: var(--workspace-muted);
    font-size: 12px;
    line-height: 1.6;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .run-metric > p,
  .run-metric > :deep(.b-progress) {
    grid-column: 1 / -1;
  }
  .run-metric > strong {
    text-align: right;
  }
  .run-metric > strong.metric-label {
    grid-column: 1 / -1;
    text-align: left;
  }
  .metric-warning {
    color: var(--ow-red);
  }
  .run-metric :deep(.b-progress) {
    margin-top: 2px;
  }
  .run-review {
    border-top: 1px solid var(--workspace-divider);
    padding: 12px 18px;
  }
  .run-summary {
    display: flex;
    flex-direction: column;
  }
  .run-progress {
    order: 0;
  }
  .run-review {
    order: 1;
  }
  .finished .run-review {
    order: 0;
    border-top: 0;
  }
  .finished .run-progress {
    order: 1;
    border-top: 1px solid var(--workspace-divider);
    display: flex;
    flex-wrap: wrap;
    gap: 12px 28px;
    padding: 12px 20px;
  }
  .finished .run-metric {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    padding: 0;
    border: 0;
  }
  .finished .run-metric h4 {
    font-size: 12px;
    margin: 0;
    align-items: center;
  }
  .finished .run-metric > h4,
  .finished .run-metric > strong,
  .finished .run-metric > p {
    line-height: 24px;
  }
  .finished .run-metric strong small {
    line-height: inherit;
  }
  .finished .run-metric strong,
  .finished .run-metric strong.metric-label {
    font-size: 14px;
  }
  .finished .run-metric > p:not(.metric-warning) {
    display: none;
  }
  .finished .run-metric .metric-warning {
    font-size: 12px;
  }
  .review-counts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 20px;
    padding: 10px 0 18px;
  }
  .result-kpi {
    min-width: 0;
    border-left: 1px solid var(--workspace-divider);
    padding-left: 20px;
  }
  .result-kpi:first-child {
    border: 0;
    padding-left: 0;
  }
  .result-kpi h4 {
    color: var(--workspace-text);
    font-size: 14px;
    font-weight: 500;
    margin: 0 0 10px;
  }
  .result-kpi strong {
    font-size: 38px;
    font-weight: 650;
    line-height: 1.1;
    letter-spacing: -1px;
    margin-bottom: 9px;
  }
  .result-kpi strong small {
    font-size: 13px;
    margin-left: 6px;
    letter-spacing: 0;
  }
  .result-primary strong {
    color: var(--ow-purple);
  }
  .result-warning strong {
    color: var(--ow-red);
  }
  .result-kpi p {
    font-size: 12px;
  }
  .outcome-summary {
    border-top: 1px solid var(--workspace-divider);
    padding-top: 12px;
  }
  .outcome-heading {
    display: flex;
    align-items: baseline;
    gap: 4px 16px;
    flex-wrap: wrap;
  }
  .outcome-track {
    display: flex;
    gap: 3px;
    margin: 3px 0 6px;
  }
  .outcome-segment {
    flex-basis: 0;
    min-width: 2px;
    height: 20px;
  }
  .outcome-fill {
    display: block;
    width: 100%;
    height: 6px;
    border-radius: 2px;
    background: var(--outcome-color, var(--workspace-divider));
  }
  .outcome-swatch {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    background: var(--outcome-color, var(--workspace-divider));
    margin-right: 6px;
    border: 1px solid var(--outcome-color, var(--workspace-muted));
    box-sizing: border-box;
  }
  .segment-review {
    --outcome-color: var(--ow-purple);
  }
  .segment-manual {
    --outcome-color: var(--ow-amber);
  }
  .segment-unfinished {
    --outcome-color: var(--ow-red);
  }
  .segment-processing {
    --outcome-color: var(--ow-purple);
  }
  .segment-unchanged {
    --outcome-color: var(--ow-green);
  }
  .segment-reviewed {
    --outcome-color: var(--ow-muted);
  }
  .outcome-title {
    font-size: 12px;
  }
  .outcome-counts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin: 0;
  }
  .outcome-counts > div {
    display: flex;
    align-items: baseline;
    gap: 5px;
    font-size: 12px;
    color: var(--workspace-muted);
  }
  .outcome-counts dd {
    margin: 0;
    color: var(--workspace-text);
    font-variant-numeric: tabular-nums;
  }
  .outcome-counts small {
    font-size: 12px;
  }
  .review-guidance {
    margin-top: 8px;
  }
  .run-summary.mobile .review-counts {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px 16px;
    padding: 6px 0 16px;
  }
  .run-summary.mobile .result-kpi {
    padding-left: 0;
    border: 0;
  }
  .run-summary.mobile .result-kpi strong {
    font-size: 32px;
  }
  .run-summary.mobile .result-kpi h4 {
    font-size: 13px;
    margin-bottom: 8px;
  }
  .run-summary.mobile.finished .run-progress {
    padding: 10px 14px;
    gap: 8px;
  }
  .run-summary.mobile.finished .run-metric {
    padding: 0;
    display: flex;
    gap: 5px 8px;
  }
  .run-summary.mobile.finished .run-metric strong {
    font-size: 13px;
  }
  .run-summary.mobile.finished .run-metric h4 {
    margin: 0;
    align-items: center;
  }
  .run-progress.mobile {
    grid-template-columns: 1fr;
    padding: 4px 14px;
  }
  .mobile .run-metric,
  .mobile .run-metric:first-child {
    padding: 10px 0;
    display: grid;
    grid-template-columns: 90px minmax(0, 1fr);
    gap: 6px 10px;
  }
  .mobile .run-metric + .run-metric {
    border-left: 0;
    border-top: 1px solid var(--workspace-divider);
  }
  .mobile h4 {
    grid-column: 1;
    grid-row: 1 / span 2;
    margin: 4px 0 0;
    align-items: flex-start;
    font-size: 12px;
  }
  .mobile .run-metric > strong,
  .mobile .run-metric > p,
  .mobile .run-metric > :deep(.b-progress) {
    grid-column: 2;
    margin: 0;
  }
  .mobile .run-metric > strong {
    text-align: left;
  }
  .mobile strong {
    font-size: 24px;
  }
  .run-review.mobile {
    padding: 12px 14px;
  }
</style>
