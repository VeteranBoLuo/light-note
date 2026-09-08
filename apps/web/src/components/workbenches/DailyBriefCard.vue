<template>
  <article v-if="compact && showCard" v-bind="$attrs" class="daily-brief-card daily-brief-card--summary">
    <header class="daily-brief-card__header">
      <span class="daily-brief-card__ai-mark" aria-hidden="true">AI</span>
      <div class="daily-brief-card__heading">
        <div class="daily-brief-card__title-row"
          ><h2>{{ t('workbench.dailyBrief.title') }}</h2></div
        >
        <p role="status">{{
          guestSample
            ? t('workbench.dailyBrief.guestSubtitle')
            : statusText ||
              (readyBrief
                ? t('workbench.dailyBrief.generatedMeta', { time: generatedTime })
                : t('workbench.dailyBrief.subtitle'))
        }}</p>
      </div>
      <BButton
        v-if="!readOnly && !guestSample"
        size="small"
        :loading="briefUpdating"
        :disabled="busy"
        :aria-label="t('workbench.dailyBrief.updateAction')"
        @click="update"
      >
        <SvgIcon v-if="!briefUpdating" :src="icon.infrastructure.refresh" size="18" aria-hidden="true" />
      </BButton>
    </header>
    <div class="daily-brief-card__summary-copy">
      <p class="daily-brief-card__headline">{{
        displayBrief?.headline || t(errorMessage ? 'workbench.dailyBrief.failedTitle' : 'workbench.dailyBrief.subtitle')
      }}</p>
      <BButton size="small" @click="detailsVisible = true">
        {{ t('workbench.dailyBrief.viewBrief') }}<span v-if="briefInsights.length"> · {{ briefInsights.length }}</span>
        <SvgIcon :src="icon.ai.sourceArrow" size="13" aria-hidden="true" />
      </BButton>
    </div>
  </article>
  <component
    :is="compact ? BModal : BriefInline"
    v-model:visible="detailsVisible"
    :title="t('workbench.dailyBrief.title')"
    :show-footer="false"
    content-class="daily-brief-detail-content"
    fullscreen-mobile
  >
    <article
      v-if="showCard"
      v-bind="compact ? {} : $attrs"
      class="daily-brief-card"
      :class="{ 'daily-brief-card--detail': compact }"
      :aria-busy="busy || undefined"
    >
      <header class="daily-brief-card__header">
        <span class="daily-brief-card__ai-mark" aria-hidden="true">AI</span>
        <div class="daily-brief-card__heading">
          <div class="daily-brief-card__title-row">
            <h2>{{ t('workbench.dailyBrief.title') }}</h2>
            <BChip v-if="briefInsights.length" tone="primary">{{ briefInsights.length }}</BChip>
            <BChip v-if="readOnly" tone="neutral">{{ t('workbench.dailyBrief.previewMode') }}</BChip>
          </div>
          <p v-if="guestSample">{{ t('workbench.dailyBrief.guestSubtitle') }}</p>
          <p
            v-else-if="readyBrief"
            role="status"
            :title="t('workbench.dailyBrief.generatedMeta', { time: generatedTime })"
          >
            <template v-if="statusText">{{ statusText }}</template>
            <template v-else>
              {{ t('workbench.dailyBrief.generatedMeta', { time: generatedTime }) }} ·
              {{ t(state?.autoUpdate === false ? 'workbench.dailyBrief.manualMode' : 'workbench.dailyBrief.autoMode') }}
            </template>
          </p>
          <p v-else>{{ t('workbench.dailyBrief.subtitle') }}</p>
        </div>
        <div v-if="!readOnly && !guestSample" class="daily-brief-card__actions">
          <BButton
            v-if="readyBrief"
            size="small"
            class="daily-brief-card__update"
            :loading="briefUpdating"
            :disabled="busy"
            :title="t('workbench.dailyBrief.updateAction')"
            :aria-label="t('workbench.dailyBrief.updateAction')"
            @click="update"
          >
            <SvgIcon v-if="!briefUpdating" :src="icon.infrastructure.refresh" size="18" aria-hidden="true" />
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
            <BButton v-if="!readOnly" type="primary" size="small" :loading="briefUpdating" @click="update">
              {{ t('workbench.dailyBrief.retryAction') }}
            </BButton>
          </div>
          <small class="daily-brief-card__state-foot">
            <i aria-hidden="true"></i>
            {{ t('workbench.dailyBrief.autoGenerateHint') }}
          </small>
        </div>
      </div>

      <div v-else-if="displayBrief" class="daily-brief-card__narrative">
        <div v-if="errorMessage || state?.status === 'failed'" class="daily-brief-card__refresh-error" role="alert">
          <SvgIcon :src="icon.message.warning" size="14" />
          <span>{{ errorMessage || t('workbench.dailyBrief.refreshFailedHint') }}</span>
        </div>
        <p class="daily-brief-card__headline">{{ displayBrief.headline }}</p>

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
              <div v-if="organizeActions(insight).length" class="daily-brief-insight__organize-actions">
                <BButton
                  v-for="action in organizeActions(insight)"
                  :key="action.id"
                  size="small"
                  @click="router.push(action.route)"
                >
                  {{ t(`workbench.dailyBrief.${action.label}`) }}
                  <SvgIcon :src="icon.ai.sourceArrow" size="13" />
                </BButton>
              </div>
              <div v-if="insight.sources?.length" class="daily-brief-insight__sources">
                <span v-if="insight.tagName">{{ t('workbench.dailyBrief.sharedTag', { tag: insight.tagName }) }}</span>
                <BButton
                  v-for="(source, index) in insight.sources"
                  :key="`${source.type}:${source.id}`"
                  size="small"
                  :title="source.title"
                  :disabled="insightChanged(insight)"
                  @click="openSource(source)"
                >
                  <template v-if="insight.tagName"
                    >{{ t(index === 0 ? 'workbench.dailyBrief.recentSource' : 'workbench.dailyBrief.olderSource') }} ·
                  </template>
                  {{ source.title }}
                  <SvgIcon :src="icon.ai.sourceArrow" size="13" aria-hidden="true" />
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
            <strong>{{
              t(readOnly ? 'workbench.dailyBrief.previewEmptyTitle' : 'workbench.dailyBrief.manualTitle')
            }}</strong>
            <span>{{ t(readOnly ? 'workbench.dailyBrief.previewEmptyHint' : 'workbench.dailyBrief.manualHint') }}</span>
            <BButton v-if="!readOnly" type="primary" size="small" @click="update">
              {{ t('workbench.dailyBrief.generateAction') }}
            </BButton>
          </div>
        </div>
      </div>
    </article>
  </component>
</template>

<script setup lang="ts">
  import { computed, defineComponent, ref, watch } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import type { DailyBrief, DailyBriefInsight } from '@/api/dailyBriefApi';
  import { useDailyBrief } from '@/composables/useDailyBrief';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { resolveBriefSourceTarget, resolveBriefOrganizeActions } from '@/utils/dailyBriefNavigation';

  const props = withDefaults(
    defineProps<{ eligible: boolean; ownerKey: string; readOnly?: boolean; compact?: boolean }>(),
    {
      readOnly: false,
      compact: false,
    },
  );
  defineOptions({ inheritAttrs: false });
  const BriefInline = defineComponent({
    inheritAttrs: false,
    setup:
      (_, { slots }) =>
      () =>
        slots.default?.(),
  });
  const detailsVisible = ref(false);
  watch(
    () => props.ownerKey,
    () => {
      detailsVisible.value = false;
    },
  );
  const { t, locale } = useI18n();
  const router = useRouter();
  const guestSample = computed(() => !props.eligible && !props.readOnly);
  const readOnly = computed(() => props.readOnly);
  const { state, loading, updating, errorCode, confirmedCurrent, refresh, update } = useDailyBrief({
    eligible: () => props.eligible,
    ownerKey: () => props.ownerKey,
    passive: () => readOnly.value,
  });
  const readyBrief = computed<DailyBrief | null>(() => (state.value?.brief?.version === 2 ? state.value.brief : null));
  // 示例仅参与展示，不写入账号简报状态，也不触发生成。
  const displayBrief = computed(() =>
    guestSample.value
      ? {
          headline: t('workbench.dailyBrief.sampleHeadline'),
          insights: [
            { id: 'sample-todo', factIds: ['todo_today'], text: t('workbench.dailyBrief.sampleTodo') },
            {
              id: 'sample-content',
              factIds: ['bookmark_created_today'],
              text: t('workbench.dailyBrief.sampleContent'),
            },
            {
              id: 'sample-connection',
              factIds: ['resource_connection'],
              text: t('workbench.dailyBrief.sampleConnection'),
            },
            { id: 'sample-organize', factIds: ['organize_untagged'], text: t('workbench.dailyBrief.sampleOrganize') },
          ],
          recommendation: t('workbench.dailyBrief.sampleRecommendation'),
        }
      : readyBrief.value,
  );
  const briefUpdating = computed(() => updating.value || state.value?.status === 'generating');
  const busy = computed(() => loading.value || briefUpdating.value);
  const showCard = computed(
    () =>
      guestSample.value ||
      (props.eligible &&
        (readOnly.value ||
          loading.value ||
          Boolean(errorCode.value) ||
          Boolean(state.value?.featureEnabled && state.value?.enabled))),
  );
  const briefInsights = computed<DailyBriefInsight[]>(() => displayBrief.value?.insights || []);
  const briefRecommendation = computed(() => displayBrief.value?.recommendation || '');
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
  function organizeActions(insight: DailyBriefInsight) {
    if (guestSample.value) {
      const actions: Record<string, Array<{ id: string; label: string; route: string }>> = {
        'sample-todo': [{ id: 'todos', label: 'viewTodos', route: '/inbox?tab=todo' }],
        'sample-organize': [{ id: 'untagged', label: 'organizeUntagged', route: '/organize?issue=untagged' }],
      };
      return actions[insight.id] || [];
    }
    return resolveBriefOrganizeActions(insight, readyBrief.value, readOnly.value);
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
  .daily-brief-card__summary-copy {
    padding: 0 13px 12px;
    :deep(.b_btn) {
      padding: 2px 0;
      color: var(--info-color);
      background: transparent;
    }
  }
  /* 通栏简报完整展示；高度由内容决定，不与相邻业务卡片绑定。 */
  .daily-brief-card {
    min-width: 0;
    height: auto;
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

  :global(.modal-view.is-mobile-fullscreen .modal-content.daily-brief-detail-content) {
    overflow-y: auto;
  }

  .daily-brief-card--detail {
    padding: 16px;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }

  .daily-brief-card--detail .daily-brief-card__header {
    padding: 0 0 12px;
  }

  .daily-brief-card--detail .daily-brief-card__narrative,
  .daily-brief-card--detail .daily-brief-card__state {
    padding-left: 0;
    padding-right: 0;
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
    min-width: 36px;
    min-height: 36px;
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
    overflow: visible;
    flex: 1 1 auto;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 24px;
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
      height: auto;
      min-height: 28px;
      padding: 2px 4px;
      gap: 4px;
      color: var(--info-color);
      background: transparent;
      white-space: normal;
      font-size: 11px;
      line-height: 1.5;

      &:hover {
        background: transparent;
        text-decoration: underline;
      }
    }
  }

  .daily-brief-insight__organize-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    margin-top: 5px;
    padding: 2px;

    :deep(.b_btn) {
      height: auto;
      min-height: 28px;
      padding: 2px 4px;
      gap: 4px;
      color: var(--info-color);
      background: transparent;
      font-size: 11px;
      line-height: 1.5;
      white-space: normal;

      &:hover {
        background: transparent;
        text-decoration: underline;
      }
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

  .daily-brief-insight:only-child {
    grid-column: 1 / -1;
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
    margin-top: 12px;
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
    .daily-brief-insight {
      display: block;
    }
    .daily-brief-insight__marker {
      float: left;
      margin: 1px 7px 0 0;
    }
    .daily-brief-insight__sources,
    .daily-brief-insight__organize-actions {
      clear: both;
      margin-top: 4px;
    }
    .daily-brief-card__insights {
      grid-template-columns: minmax(0, 1fr);
    }
    .daily-brief-card__header {
      grid-template-columns: 34px minmax(0, 1fr) auto;
    }
    .daily-brief-card__actions {
      grid-column: auto;
    }
    .daily-brief-card__heading p {
      white-space: nowrap;
    }
    .daily-brief-card__recommendation {
      grid-template-columns: 1fr;
      gap: 2px;
      margin-top: 8px;
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
