<template>
  <article v-if="showCard" class="daily-brief-card" :aria-busy="busy || undefined">
    <header class="daily-brief-card__header">
      <span class="daily-brief-card__ai-mark" aria-hidden="true">AI</span>
      <div class="daily-brief-card__heading">
        <div class="daily-brief-card__title-row">
          <h2>{{ t('workbench.dailyBrief.title') }}</h2>
          <BChip v-if="briefInsights.length" tone="primary">{{ briefInsights.length }}</BChip>
        </div>
        <p v-if="readyBrief">
          {{ t('workbench.dailyBrief.generatedMeta', { time: generatedTime }) }} ·
          {{ t(state?.autoUpdate === false ? 'workbench.dailyBrief.manualMode' : 'workbench.dailyBrief.autoMode') }}
        </p>
        <p v-else>{{ t('workbench.dailyBrief.subtitle') }}</p>
      </div>
      <div class="daily-brief-card__actions">
        <BButton
          v-if="readyBrief"
          size="small"
          class="daily-brief-card__update"
          :loading="briefUpdating"
          :disabled="busy"
          @click="update"
        >
          {{ briefUpdating ? t('workbench.dailyBrief.updatingAction') : t('workbench.dailyBrief.updateAction') }}
        </BButton>
        <BButton size="small" class="daily-brief-card__settings" @click="openSettings">
          {{ t('workbench.dailyBrief.settings') }}
        </BButton>
      </div>
    </header>

    <div
      v-if="(loading || state?.status === 'generating') && !readyBrief"
      class="daily-brief-card__state"
      role="status"
    >
      <div class="daily-brief-card__state-surface">
        <div class="daily-brief-card__state-main">
          <BLoading :loading="true" inline :title="t('workbench.dailyBrief.generating')" />
          <span>{{ t('workbench.dailyBrief.generatingHint') }}</span>
        </div>
        <small class="daily-brief-card__state-foot">
          <i aria-hidden="true"></i>
          {{ t('workbench.dailyBrief.autoGenerateHint') }}
        </small>
      </div>
    </div>

    <div
      v-else-if="(errorMessage || state?.status === 'failed') && !readyBrief"
      class="daily-brief-card__state is-error"
      role="alert"
    >
      <div class="daily-brief-card__state-surface">
        <div class="daily-brief-card__state-main">
          <span class="daily-brief-card__state-icon" aria-hidden="true">
            <SvgIcon :src="icon.message.warning" size="22" />
          </span>
          <div class="daily-brief-card__state-copy">
            <strong>{{ t('workbench.dailyBrief.failedTitle') }}</strong>
            <span>{{ errorMessage || t('workbench.dailyBrief.failedHint') }}</span>
          </div>
          <BButton type="primary" size="small" :loading="briefUpdating" @click="update">
            {{ t('workbench.dailyBrief.retryAction') }}
          </BButton>
        </div>
        <small class="daily-brief-card__state-foot">
          <i aria-hidden="true"></i>
          {{ t('workbench.dailyBrief.autoGenerateHint') }}
        </small>
      </div>
    </div>

    <div v-else-if="readyBrief" class="daily-brief-card__narrative">
      <div v-if="errorMessage || state?.status === 'failed'" class="daily-brief-card__refresh-error" role="alert">
        <SvgIcon :src="icon.message.warning" size="14" />
        <span>{{ errorMessage || t('workbench.dailyBrief.refreshFailedHint') }}</span>
      </div>
      <div v-else-if="statusText" class="daily-brief-card__freshness" role="status">
        <span class="daily-brief-card__status-dot" aria-hidden="true"></span>
        {{ statusText }}
      </div>
      <p class="daily-brief-card__headline">{{ readyBrief.headline }}</p>

      <div class="daily-brief-card__insights">
        <article
          v-for="insight in briefInsights"
          :key="insight.id"
          class="daily-brief-insight"
          :class="`is-${insightTone(insight)}`"
        >
          <span class="daily-brief-insight__marker" aria-hidden="true">{{ insightMarker(insight) }}</span>
          <div class="daily-brief-insight__copy">
            <p>
              {{ insight.text }}
              <small v-if="insightChanged(insight)" class="daily-brief-insight__changed">{{
                t('workbench.dailyBrief.changed')
              }}</small>
            </p>
            <div v-if="insight.sources?.length" class="daily-brief-insight__sources">
              <span>{{ t('workbench.dailyBrief.sharedTag', { tag: insight.tagName }) }}</span>
              <BButton
                v-for="(source, index) in insight.sources"
                :key="`${source.type}:${source.id}`"
                size="small"
                :title="source.title"
                :disabled="insightChanged(insight)"
                @click="openSource(source)"
              >
                {{ t(index === 0 ? 'workbench.dailyBrief.recentSource' : 'workbench.dailyBrief.olderSource') }} ·
                {{ source.title }}
              </BButton>
            </div>
          </div>
        </article>
      </div>

      <aside class="daily-brief-card__recommendation">
        <strong>{{
          t(state?.stale ? 'workbench.dailyBrief.previousRecommendation' : 'workbench.dailyBrief.aiRecommendation')
        }}</strong>
        <p>{{ briefRecommendation || t('workbench.dailyBrief.noRecommendation') }}</p>
      </aside>
    </div>
    <div v-else class="daily-brief-card__state">
      <div class="daily-brief-card__state-surface">
        <div class="daily-brief-card__state-main">
          <strong>{{ t('workbench.dailyBrief.manualTitle') }}</strong>
          <span>{{ t('workbench.dailyBrief.manualHint') }}</span>
          <BButton type="primary" size="small" @click="update">{{ t('workbench.dailyBrief.generateAction') }}</BButton>
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import type { DailyBrief, DailyBriefInsight } from '@/api/dailyBriefApi';
  import { useDailyBrief } from '@/composables/useDailyBrief';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { resolveBriefSourceTarget } from '@/utils/dailyBriefNavigation';

  const props = defineProps<{ eligible: boolean; ownerKey: string }>();
  const { t, locale } = useI18n();
  const router = useRouter();
  const { state, loading, updating, errorCode, confirmedCurrent, refresh, update } = useDailyBrief({
    eligible: () => props.eligible,
    ownerKey: () => props.ownerKey,
  });
  const readyBrief = computed<DailyBrief | null>(() => (state.value?.brief?.version === 2 ? state.value.brief : null));
  const briefUpdating = computed(() => updating.value || state.value?.status === 'generating');
  const busy = computed(() => loading.value || briefUpdating.value);
  const showCard = computed(
    () =>
      props.eligible &&
      (loading.value || Boolean(errorCode.value) || Boolean(state.value?.featureEnabled && state.value?.enabled)),
  );
  const briefInsights = computed<DailyBriefInsight[]>(() => readyBrief.value?.insights || []);
  const briefRecommendation = computed(() => readyBrief.value?.recommendation || '');
  const errorMessage = computed(() => {
    if (state.value?.pauseReason === 'quota') return t('workbench.dailyBrief.quotaPaused');
    if (errorCode.value || state.value?.status === 'failed')
      return t(readyBrief.value ? 'workbench.dailyBrief.refreshFailedHint' : 'workbench.dailyBrief.failedHint');
    return '';
  });
  const generatedTime = computed(() => {
    const raw = state.value?.dataAsOf || state.value?.generatedAt;
    if (!raw) return t('workbench.dailyBrief.justGenerated');
    // 旧 DATETIME 是存储时区，不能按浏览器所在地解释。
    const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? raw.replace(' ', 'T') + '+08:00' : raw;
    const date = new Date(normalized);
    if (!Number.isFinite(date.getTime())) return t('workbench.dailyBrief.justGenerated');
    return new Intl.DateTimeFormat(locale.value, {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: state.value?.timezone || 'Asia/Shanghai',
    }).format(date);
  });
  const statusText = computed(() => {
    if (briefUpdating.value) return t('workbench.dailyBrief.updatingHint');
    if (state.value?.pauseReason === 'budget') return t('workbench.dailyBrief.budgetPaused');
    if (state.value?.stale) return t('workbench.dailyBrief.staleHint');
    if (confirmedCurrent.value) return t('workbench.dailyBrief.currentHint');
    return '';
  });
  function insightChanged(insight: DailyBriefInsight) {
    return insight.factIds.some((id) => state.value?.staleFactIds?.includes(id));
  }
  function openSettings() {
    void router.push({ path: '/settings', query: { section: 'ai', panel: 'routines' } });
  }
  function openSource(source: NonNullable<DailyBriefInsight['sources']>[number]) {
    const target = resolveBriefSourceTarget(source);
    if (target?.external) window.open(target.external, '_blank', 'noopener,noreferrer');
    else if (target?.route) void router.push(target.route);
  }
  function insightTone(insight: DailyBriefInsight) {
    const ids = insight.factIds || [];
    if (ids.includes('resource_connection')) return 'connection';
    if (ids.some((id) => id.startsWith('todo_'))) return 'action';
    if (ids.some((id) => id.includes('_created_'))) return 'new';
    if (ids.some((id) => id.startsWith('organize_'))) return 'organize';
    return 'insight';
  }
  function insightMarker(insight: DailyBriefInsight) {
    return t(`workbench.dailyBrief.markers.${insightTone(insight)}`);
  }
  defineExpose({ refresh });
</script>

<style scoped lang="less">
  /* AI 叙事区与工作台右侧例行卡共享同一高度基线。 */
  .daily-brief-card {
    min-width: 0;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1px solid color-mix(in srgb, var(--primary-color) 22%, var(--card-border-color));
    border-radius: 16px;
    background: var(--card-background);
    box-shadow: 0 10px 28px -24px color-mix(in srgb, var(--primary-color) 70%, transparent);
  }

  .daily-brief-card__header {
    min-width: 0;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    padding: 11px 13px 9px;
  }

  .daily-brief-card__ai-mark {
    width: 34px;
    height: 34px;
    display: inline-grid;
    place-items: center;
    border-radius: 10px;
    color: #fff;
    background: linear-gradient(145deg, var(--primary-color), #ec4899);
    box-shadow: 0 8px 18px -12px color-mix(in srgb, var(--primary-color) 80%, transparent);
    font-size: 12px;
    font-weight: 750;
  }

  .daily-brief-card__heading {
    min-width: 0;
  }

  .daily-brief-card__title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .daily-brief-card__title-row h2 {
    margin: 0;
    color: var(--text-color);
    font-size: 15px;
    line-height: 1.3;
  }

  .daily-brief-card__heading p {
    margin: 2px 0 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-brief-card__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }

  .daily-brief-card__update {
    color: var(--primary-color);
  }

  .daily-brief-card__settings {
    color: var(--desc-color);
  }

  .daily-brief-card__state {
    min-height: 180px;
    padding: 0 13px 12px;
    display: grid;
    flex: 1 1 auto;
    color: var(--desc-color);
    font-size: 12px;
  }

  .daily-brief-card__state-surface {
    min-height: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
    border: 1px dashed color-mix(in srgb, var(--primary-color) 24%, var(--card-border-color));
    border-radius: 13px;
    background:
      radial-gradient(circle at 50% 34%, color-mix(in srgb, var(--primary-color) 11%, transparent), transparent 42%),
      color-mix(in srgb, var(--primary-color) 3%, var(--card-background));
  }

  .daily-brief-card__state-main {
    width: min(100%, 420px);
    min-width: 0;
    margin: auto;
    padding: 24px 18px 18px;
    box-sizing: border-box;
    display: grid;
    justify-items: center;
    gap: 9px;
    text-align: center;
  }

  .daily-brief-card__state-copy {
    min-width: 0;
    display: grid;
    justify-items: center;
    gap: 4px;
  }

  .daily-brief-card__state-copy strong {
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.4;
  }

  .daily-brief-card__state-copy span,
  .daily-brief-card__state-main > span {
    line-height: 1.6;
  }

  .daily-brief-card__state-icon {
    width: 46px;
    height: 46px;
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--chip-pending-border);
    border-radius: 14px;
    color: var(--chip-pending-fg);
    background: var(--chip-pending-bg);
  }

  .daily-brief-card__state-foot {
    min-width: 0;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    border-top: 1px solid color-mix(in srgb, var(--primary-color) 12%, var(--card-border-color));
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.45;
    text-align: center;
  }

  .daily-brief-card__state-foot i {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--primary-color);
  }

  .daily-brief-card__narrative {
    min-height: 0;
    padding: 0 13px 12px;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
  }

  .daily-brief-card__refresh-error {
    margin: 0 0 6px;
    padding: 5px 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--chip-pending-border);
    border-radius: 8px;
    color: var(--chip-pending-fg);
    background: var(--chip-pending-bg);
    font-size: 10.5px;
    line-height: 1.45;
  }

  .daily-brief-card__freshness {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.5;
  }

  .daily-brief-card__status-dot {
    width: 6px;
    height: 6px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--primary-color);
  }

  .daily-brief-insight__changed {
    display: inline-block;
    margin-left: 6px;
    padding: 0 5px;
    border: 1px solid var(--chip-pending-border);
    border-radius: 4px;
    color: var(--chip-pending-fg);
    font-size: 10px;
    white-space: nowrap;
  }

  .daily-brief-card__headline {
    margin: 0 0 5px;
    color: var(--text-color);
    font-size: 12.5px;
    font-weight: 650;
    line-height: 1.55;
  }

  .daily-brief-card__insights {
    min-height: 0;
    overflow-y: auto;
    flex: 1 1 auto;
    display: grid;
    align-content: start;
  }

  .daily-brief-insight__copy {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .daily-brief-insight__sources {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 7px;
    padding-bottom: 3px;
    > span {
      width: 100%;
      color: var(--desc-color);
      font-size: 10.5px;
    }
    :deep(button) {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
    }
  }

  .daily-brief-insight {
    min-width: 0;
    padding: 6px 0;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: start;
    gap: 7px;
    border-bottom: 1px solid var(--surface-divider-color, var(--card-border-color));
  }

  .daily-brief-insight:last-child {
    border-bottom: 0;
  }

  .daily-brief-insight__marker {
    width: 21px;
    height: 21px;
    display: inline-grid;
    place-items: center;
    border-radius: 7px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background));
    font-size: 10px;
    font-weight: 700;
  }

  .daily-brief-insight.is-new .daily-brief-insight__marker {
    color: var(--success-color, #07865c);
    background: color-mix(in srgb, var(--success-color, #07865c) 10%, var(--card-background));
  }

  .daily-brief-insight.is-organize .daily-brief-insight__marker {
    color: var(--warning-color, #ad6800);
    background: color-mix(in srgb, var(--warning-color, #ad6800) 10%, var(--card-background));
  }

  .daily-brief-insight p {
    margin: 0;
    color: var(--text-color);
    font-size: 12px;
    line-height: 1.7;
  }

  .daily-brief-card__recommendation {
    min-width: 0;
    margin-top: auto;
    padding: 8px 10px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: 12px;
    border: 1px dashed color-mix(in srgb, var(--primary-color) 28%, var(--card-border-color));
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--card-background));
  }

  .daily-brief-card__recommendation strong,
  .daily-brief-card__recommendation p {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.6;
  }

  .daily-brief-card__recommendation strong {
    color: var(--primary-color);
    white-space: nowrap;
  }

  .daily-brief-card__recommendation p {
    color: var(--text-color);
  }

  @media (max-width: 760px) {
    .daily-brief-card__header {
      grid-template-columns: 34px minmax(0, 1fr);
    }
    .daily-brief-card__actions {
      grid-column: 1 / -1;
    }
    .daily-brief-card__heading p {
      white-space: normal;
    }
    .daily-brief-card__recommendation {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .daily-brief-card *,
    .daily-brief-card *::before,
    .daily-brief-card *::after {
      transition: none !important;
      animation: none !important;
    }
  }
</style>
