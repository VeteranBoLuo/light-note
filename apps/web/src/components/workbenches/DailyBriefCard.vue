<template>
  <article
    v-if="compact && showCard"
    v-bind="$attrs"
    class="daily-brief-card daily-brief-card--summary"
    :class="{ 'daily-brief-card--stacked': stackedLayout }"
    :aria-busy="busy || visitorLoading || undefined"
  >
    <header class="daily-brief-card__header">
      <span class="daily-brief-card__ai-mark" aria-hidden="true">{{
        guestSample
          ? t('workbench.dailyBrief.exampleMark')
          : displayBrief?.generatedBy === 'facts'
            ? t('workbench.dailyBrief.todayMark')
            : 'AI'
      }}</span>
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
        icon-only
        v-if="!readOnly && !guestSample"
        size="small"
        :loading="briefUpdating"
        :disabled="busy"
        :aria-label="t('workbench.dailyBrief.updateAction')"
        @click="update"
      >
        <SvgIcon :src="icon.infrastructure.refresh" size="18" aria-hidden="true" />
      </BButton>
    </header>
    <div class="daily-brief-card__summary-copy">
      <p class="daily-brief-card__headline">{{
        (displayBrief ? (!guestSample && briefInsights.length ? briefInsights[0].text : displayBrief.headline) : '') ||
        t(
          guestSample
            ? visitorLoading
              ? 'common.loading'
              : visitorFailed
                ? 'workbench.dailyBrief.sampleFailed'
                : 'workbench.dailyBrief.sampleEmpty'
            : errorMessage
              ? 'workbench.dailyBrief.failedTitle'
              : 'workbench.dailyBrief.subtitle',
        )
      }}</p>
      <p v-if="hasActivitySummary && briefInsights.length" class="daily-brief-card__activity">{{
        displayBrief?.headline
      }}</p>
      <p v-if="guestSample && visitorState" class="daily-brief-card__sample-status"
        >{{ t('workbench.dailyBrief.sampleMeta', { date: visitorState.dataDate || '—' })
        }}<span v-if="visitorState.stale"> · {{ t('workbench.dailyBrief.sampleStale') }}</span></p
      >

      <p v-if="displayBrief?.adviceStatus === 'failed'" class="daily-brief-card__refresh-error" role="status">{{
        adviceFailureMessage
      }}</p>
      <aside
        v-if="adviceStatusText"
        class="daily-brief-card__preview-recommendation daily-brief-card__advice-status"
        role="status"
      >
        <strong>{{ t('workbench.dailyBrief.aiRecommendation') }}</strong>
        <p>{{ adviceStatusText }}</p>
      </aside>
      <aside v-if="briefRecommendation" class="daily-brief-card__preview-recommendation">
        <strong>{{ t(recommendationLabelKey) }}</strong>
        <p>{{ briefRecommendation }}</p>
        <div v-if="showOnboardingActions" class="daily-brief-card__onboarding-actions">
          <BButton
            v-for="action in onboardingActions"
            :key="action.key"
            type="text"
            size="small"
            :disabled="busy"
            @click="openOnboardingCreate(action.type)"
          >
            {{ t(action.label) }}
            <SvgIcon :src="icon.ai.sourceArrow" size="13" aria-hidden="true" />
          </BButton>
        </div>
      </aside>
      <p v-if="displayBrief && errorMessage" class="daily-brief-card__refresh-error" role="alert">{{ errorMessage }}</p>
      <BButton
        v-if="!displayBrief || briefInsights.length || (briefRecommendation && !isOnboardingAdvice)"
        size="small"
        class="daily-brief-card__view-brief"
        @click="detailsVisible = true"
      >
        {{ t('workbench.dailyBrief.viewBrief') }}
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
      :class="{ 'daily-brief-card--detail': compact, 'daily-brief-card--stacked': stackedLayout }"
      :aria-busy="busy || visitorLoading || undefined"
    >
      <header class="daily-brief-card__header">
        <span class="daily-brief-card__ai-mark" aria-hidden="true">{{
          guestSample
            ? t('workbench.dailyBrief.exampleMark')
            : displayBrief?.generatedBy === 'facts'
              ? t('workbench.dailyBrief.todayMark')
              : 'AI'
        }}</span>
        <div class="daily-brief-card__heading">
          <div class="daily-brief-card__title-row">
            <h2>{{ t('workbench.dailyBrief.title') }}</h2>
            <BChip v-if="briefInsights.length" tone="neutral">{{
              t('workbench.dailyBrief.focusCount', { count: briefInsights.length })
            }}</BChip>
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
            icon-only
            v-if="readyBrief"
            size="small"
            class="daily-brief-card__update"
            :loading="briefUpdating"
            :disabled="busy"
            :title="t('workbench.dailyBrief.updateAction')"
            :aria-label="t('workbench.dailyBrief.updateAction')"
            @click="update"
          >
            <SvgIcon :src="icon.infrastructure.refresh" size="18" aria-hidden="true" />
          </BButton>
        </div>
      </header>

      <div
        v-if="guestSample && !displayBrief"
        class="daily-brief-card__state"
        :role="visitorFailed ? 'alert' : 'status'"
      >
        <div class="daily-brief-card__state-main">
          <BLoading v-if="visitorLoading" :loading="true" inline :title="t('common.loading')" />
          <template v-else>
            <span>{{
              t(visitorFailed ? 'workbench.dailyBrief.sampleFailed' : 'workbench.dailyBrief.sampleEmpty')
            }}</span>
            <BButton size="small" @click="refreshVisitor">{{ t('common.retry') }}</BButton>
          </template>
        </div>
      </div>
      <div
        v-else-if="(loading || state?.status === 'generating') && !readyBrief"
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
        <p v-if="guestSample" class="daily-brief-card__sample-status" role="status"
          >{{ t('workbench.dailyBrief.sampleMeta', { date: visitorState?.dataDate || '—' })
          }}<span v-if="visitorState?.stale"> · {{ t('workbench.dailyBrief.sampleStale') }}</span
          ><span v-if="visitorFailed">
            · {{ t('workbench.dailyBrief.sampleFailed') }}
            <BButton size="small" @click="refreshVisitor">{{ t('common.retry') }}</BButton></span
          ></p
        >
        <p
          v-if="displayBrief.headline && (guestSample || !briefInsights.length || hasActivitySummary)"
          class="daily-brief-card__headline"
          >{{ displayBrief.headline }}</p
        >

        <div class="daily-brief-card__insights" :class="{ 'has-lead': hasLeadInsight }">
          <article
            v-for="insight in briefInsights"
            :key="insight.id"
            class="daily-brief-insight"
            :class="[`is-${insightTone(insight)}`, { 'is-lead': hasLeadInsight && insight === briefInsights[0] }]"
          >
            <BChip class="daily-brief-insight__marker" :tone="insightChipTone(insight)">{{
              insightMarker(insight)
            }}</BChip>
            <div class="daily-brief-insight__copy">
              <p v-if="insight.context" class="daily-brief-insight__context">{{ insight.context }}</p>
              <p>
                {{ insight.text }}
                <small v-if="insightChanged(insight)" class="daily-brief-insight__changed">{{
                  t('workbench.dailyBrief.changed')
                }}</small>
              </p>
              <div
                v-if="organizeActions(insight).length || insight.sources?.length"
                class="daily-brief-insight__actions"
              >
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
                  <span v-if="insight.tagName">{{
                    t('workbench.dailyBrief.sharedTag', { tag: insight.tagName })
                  }}</span>
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
                    {{
                      source.type === 'todo'
                        ? t('workbench.dailyBrief.viewTodos')
                        : ['research_workspace', 'learning_workspace', 'writing_workspace'].includes(source.type)
                          ? t('toolbox.project.continueProjectLink', { title: source.title })
                          : source.title
                    }}
                    <SvgIcon :src="icon.ai.sourceArrow" size="13" aria-hidden="true" />
                  </BButton>
                </div>
              </div>
            </div>
          </article>
        </div>

        <p v-if="displayBrief?.adviceStatus === 'failed'" class="daily-brief-card__refresh-error" role="status">{{
          adviceFailureMessage
        }}</p>
        <aside
          v-if="adviceStatusText"
          class="daily-brief-card__recommendation daily-brief-card__advice-status"
          role="status"
        >
          <strong>{{ t('workbench.dailyBrief.aiRecommendation') }}</strong>
          <p>{{ adviceStatusText }}</p>
        </aside>
        <aside v-if="briefRecommendation" class="daily-brief-card__recommendation">
          <strong>{{ t(recommendationLabelKey) }}</strong>
          <div>
            <p>{{ briefRecommendation }}</p>
            <div v-if="showOnboardingActions" class="daily-brief-card__onboarding-actions">
              <BButton
                v-for="action in onboardingActions"
                :key="action.key"
                type="text"
                size="small"
                :disabled="busy"
                @click="openOnboardingCreate(action.type)"
              >
                {{ t(action.label) }}
                <SvgIcon :src="icon.ai.sourceArrow" size="13" aria-hidden="true" />
              </BButton>
            </div>
            <div v-if="displayedAdvice?.recommendationSources?.length" class="daily-brief-insight__sources">
              <BButton
                v-for="source in displayedAdvice?.recommendationSources"
                :key="`${source.type}:${source.id}`"
                size="small"
                :disabled="recommendationStale"
                :title="source.title"
                @click="openSource(source)"
              >
                {{ source.title }}
                <SvgIcon :src="icon.ai.sourceArrow" size="13" />
              </BButton>
            </div>
          </div>
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
  import { AI_QUOTA_ERROR_CODES } from '@lightnote/shared/ai-quota-protocol';
  import type { ActionCaptureType } from '@/store/inbox';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import type { DailyBrief, DailyBriefInsight } from '@/api/dailyBriefApi';
  import { useVisitorBrief } from '@/composables/useVisitorBrief';
  import { toolboxTaskChange } from '@/utils/toolboxTaskState';
  import { useUserStore } from '@/store';
  import { useDailyBrief } from '@/composables/useDailyBrief';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { openBookmarkUrl } from '@/utils/openBookmark';
  import { resolveBriefSourceTarget, resolveBriefOrganizeActions } from '@/utils/dailyBriefNavigation';

  const props = withDefaults(
    defineProps<{ eligible: boolean; ownerKey: string; readOnly?: boolean; compact?: boolean; visitor?: boolean }>(),
    {
      readOnly: false,
      compact: false,
    },
  );
  const emit = defineEmits<{ onboardingCreate: [type?: ActionCaptureType] }>();
  defineOptions({ inheritAttrs: false });
  const BriefInline = defineComponent({
    inheritAttrs: false,
    setup:
      (_, { slots }) =>
      () =>
        slots.default?.(),
  });
  const detailsVisible = ref(false);
  const mobileLayout = useMobileLayout();
  const stackedLayout = computed(() => props.compact || mobileLayout.value);
  watch(
    () => props.ownerKey,
    () => {
      detailsVisible.value = false;
    },
  );
  const { t, locale } = useI18n();
  const router = useRouter();
  const guestSample = computed(() => props.visitor || (!props.eligible && !props.readOnly));
  const {
    state: visitorState,
    loading: visitorLoading,
    failed: visitorFailed,
    refresh: refreshVisitor,
  } = useVisitorBrief({ enabled: () => guestSample.value, owner: () => props.ownerKey, locale: () => locale.value });
  const readOnly = computed(() => props.readOnly);
  const { state, loading, updating, errorCode, confirmedCurrent, refreshAfterChange, update } = useDailyBrief({
    eligible: () => props.eligible && !guestSample.value,
    ownerKey: () => props.ownerKey,
    passive: () => readOnly.value,
  });
  const currentUser = useUserStore();
  watch(toolboxTaskChange, (change) => {
    if (change?.owner === currentUser.id && !readOnly.value && !guestSample.value) void refreshAfterChange();
  });
  const readyBrief = computed<DailyBrief | null>(() => (state.value?.brief?.version === 2 ? state.value.brief : null));
  const displayBrief = computed(() => (guestSample.value ? visitorState.value?.brief : readyBrief.value));
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
  const briefInsights = computed<DailyBriefInsight[]>(() => {
    const insights = displayBrief.value?.insights || [];
    if (guestSample.value) return insights;
    // 旧产物更新前也遵守展示上限；真正的任务筛选和排序仍由服务端完成。
    let hasTodo = false;
    let organize: DailyBriefInsight | undefined;
    const organizeTexts = new Set<string>();
    const result: DailyBriefInsight[] = [];
    for (const insight of insights) {
      if (insight.factIds.some((id) => id.startsWith('todo_'))) {
        if (hasTodo) continue;
        hasTodo = true;
      }
      if (insight.factIds.length && insight.factIds.every((id) => id.startsWith('organize_'))) {
        if (!organize) {
          organize = { ...insight, id: 'organize_summary', text: '', factIds: [] };
          result.push(organize);
        }
        organizeTexts.add(insight.text.trim());
        organize.text = [...organizeTexts].filter(Boolean).join(' ');
        organize.factIds = [...new Set([...organize.factIds, ...insight.factIds])];
        if (insight.sources?.length)
          organize.sources = [
            ...new Map(
              [...(organize.sources || []), ...insight.sources].map((source) => [
                `${source.type}:${source.id}`,
                source,
              ]),
            ).values(),
          ];
      } else result.push(insight);
    }
    return result;
  });
  const previousAdvice = computed(() =>
    ['deferred', 'paused', 'not_evaluated', 'failed'].includes(displayBrief.value?.adviceStatus || '')
      ? displayBrief.value?.lastAdviceResult
      : undefined,
  );
  const displayedAdvice = computed(() => previousAdvice.value || displayBrief.value);
  const adviceFailureMessage = computed(() => {
    const code = displayBrief.value?.adviceFailureCode;
    const quotaKey =
      code === AI_QUOTA_ERROR_CODES.EXHAUSTED
        ? 'adviceQuotaExceeded'
        : code === AI_QUOTA_ERROR_CODES.INSUFFICIENT_FOR_REQUEST
          ? 'adviceQuotaInsufficient'
          : null;
    if (quotaKey)
      return [
        t(`workbench.dailyBrief.${quotaKey}`),
        ...(!readOnly.value ? [t('workbench.dailyBrief.adviceQuotaRetry')] : []),
      ].join(' ');
    return t(
      previousAdvice.value
        ? 'workbench.dailyBrief.adviceUpdateFailed'
        : readOnly.value
          ? 'workbench.dailyBrief.adviceFailedReadOnly'
          : 'workbench.dailyBrief.adviceFailed',
    );
  });
  const isOnboardingAdvice = computed(
    () =>
      displayedAdvice.value?.recommendationKind === 'action' &&
      displayedAdvice.value?.recommendationFactIds?.includes('onboarding_empty'),
  );
  const showOnboardingActions = computed(
    () => isOnboardingAdvice.value && props.eligible && !readOnly.value && !guestSample.value,
  );
  const onboardingActions = [
    { key: 'collect', label: 'workbench.dailyBrief.onboardingCollect', type: undefined },
    { key: 'note', label: 'workbench.dailyBrief.onboardingNote', type: 'note' as ActionCaptureType },
    { key: 'todo', label: 'workbench.dailyBrief.onboardingTodo', type: 'todo' as ActionCaptureType },
  ];
  async function openOnboardingCreate(type?: ActionCaptureType) {
    if (!showOnboardingActions.value) return;
    const owner = props.ownerKey;
    const open = () => {
      if (owner === props.ownerKey && showOnboardingActions.value) emit('onboardingCreate', type);
    };
    if (detailsVisible.value) {
      await closeCurrentMobileOverlayThen(() => {
        detailsVisible.value = false;
      }, open);
    } else open();
  }
  const briefRecommendation = computed(() => displayedAdvice.value?.recommendation || '');
  const recommendationStale = computed(
    () =>
      !!previousAdvice.value ||
      (state.value?.stale &&
        (!displayBrief.value?.recommendationFactIds?.length ||
          displayBrief.value.recommendationFactIds.some((id) => state.value?.staleFactIds?.includes(id)))),
  );
  const recommendationLabelKey = computed(() => {
    if (guestSample.value) return 'workbench.dailyBrief.sampleSuggestion';
    if (isOnboardingAdvice.value) return 'workbench.dailyBrief.onboardingRecommendation';
    if (recommendationStale.value) return 'workbench.dailyBrief.previousRecommendation';
    return displayedAdvice.value?.recommendationKind === 'action'
      ? 'workbench.dailyBrief.actionRecommendation'
      : 'workbench.dailyBrief.aiRecommendation';
  });
  const hasActivitySummary = computed(
    () =>
      !guestSample.value &&
      displayBrief.value?.sections?.some(
        (section) =>
          section.id === 'new_content' &&
          section.items.some(
            (item) =>
              ['bookmark_created_today', 'note_created_today', 'file_created_today'].includes(item.id) &&
              typeof item.count === 'number' &&
              Number.isFinite(item.count) &&
              item.count >= 0,
          ),
      ),
  );
  // 奇数条时让短待办领起一行，其余内容成对阅读；只有一条时自然占满。
  const hasLeadInsight = computed(
    () =>
      !guestSample.value &&
      briefInsights.value.length % 2 === 1 &&
      briefInsights.value[0]?.factIds.some((id) => id.startsWith('todo_')),
  );
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
    if (briefUpdating.value)
      return t(readyBrief.value ? 'workbench.dailyBrief.updatingHint' : 'workbench.dailyBrief.generating');
    if (state.value?.pauseReason === 'budget') return t('workbench.dailyBrief.budgetPaused');
    if (state.value?.stale) return t('workbench.dailyBrief.staleHint');
    if (confirmedCurrent.value) return t('workbench.dailyBrief.currentHint');
    return '';
  });
  const adviceStatusText = computed(() => {
    if (guestSample.value || !displayBrief.value) return '';

    if (!guestSample.value) {
      const adviceHints: Partial<Record<NonNullable<DailyBrief['adviceStatus']>, string>> = {
        no_value: 'adviceNoValue',
        no_evidence: 'adviceNoEvidence',
        deferred: 'adviceDeferred',
        paused: 'advicePaused',
        not_evaluated: 'adviceNotEvaluated',
      };
      const hint = adviceHints[displayedAdvice.value?.adviceStatus!];
      if (hint) return t(`workbench.dailyBrief.${hint}`);
    }
    return '';
  });
  function insightChanged(insight: DailyBriefInsight) {
    return insight.factIds.some((id) => state.value?.staleFactIds?.includes(id));
  }
  function organizeActions(insight: DailyBriefInsight) {
    if (guestSample.value) {
      const actions: Record<string, Array<{ id: string; label: string; route: string }>> = {
        'sample-todo': [{ id: 'todos', label: 'viewTodos', route: '/inbox?tab=todo' }],
      };
      if (insight.id === 'sample-organize')
        return [
          ...(insight.factIds.includes('organize_untagged')
            ? [{ id: 'untagged', label: 'organizeUntagged', route: '/organize?issue=untagged' }]
            : []),
          ...(insight.factIds.includes('organize_pending')
            ? [{ id: 'pending', label: 'organizePending', route: '/organize?issue=pending' }]
            : []),
        ];
      return actions[insight.id] || [];
    }
    return resolveBriefOrganizeActions(insight, readyBrief.value);
  }
  function openSource(source: NonNullable<DailyBriefInsight['sources']>[number]) {
    const target = resolveBriefSourceTarget(source);
    if (target?.external) openBookmarkUrl(target.external, { resourceId: source.id });
    else if (target?.route) void router.push(target.route);
  }
  function insightTone(insight: DailyBriefInsight) {
    const ids = insight.factIds || [];
    if (ids.includes('resource_connection')) return 'connection';
    if (
      ids.some(
        (id) => id.startsWith('todo_') || ['workshop_due', 'workshop_next_step', 'workshop_attention'].includes(id),
      )
    )
      return 'action';
    if (ids.includes('workshop_result') || ids.includes('visitor_content')) return 'new';
    if (ids.some((id) => id.includes('_created_'))) return 'new';
    if (ids.some((id) => id.startsWith('organize_'))) return 'organize';
    return 'insight';
  }
  function insightMarker(insight: DailyBriefInsight) {
    const ids = insight.factIds;
    const label = ids.includes('workshop_result')
      ? 'result'
      : ids.includes('workshop_attention')
        ? 'attention'
        : ids.some((id) => ['workshop_due', 'workshop_next_step'].includes(id)) &&
            !ids.some((id) => id.startsWith('todo_'))
          ? 'project'
          : insightTone(insight);
    return t(`workbench.dailyBrief.markers.${label}`);
  }
  function insightChipTone(insight: DailyBriefInsight) {
    const tone = insightTone(insight);
    return tone === 'action' ? 'todo' : tone === 'new' ? 'success' : tone === 'organize' ? 'pending' : 'neutral';
  }
  defineExpose({ refresh: () => (guestSample.value ? refreshVisitor() : refreshAfterChange()) });
</script>

<style scoped lang="less">
  .daily-brief-card__activity {
    margin: var(--ui-space-6, 6px) 0 0;
    color: var(--text-secondary);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
  }
  .daily-brief-card__sample-status {
    margin: 0 0 var(--ui-space-12, 12px);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .daily-brief-card__summary-copy {
    padding: 0 var(--ui-space-13, 13px) var(--ui-space-12, 12px);
    :deep(.daily-brief-card__view-brief) {
      padding: var(--ui-space-2, 2px) 0;
      color: var(--info-color);
      background: transparent;
    }
  }
  .daily-brief-card--summary .daily-brief-card__headline {
    margin-bottom: var(--ui-space-9, 9px);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .daily-brief-card__onboarding-actions {
    margin-top: var(--ui-space-8, 8px);
  }

  .daily-brief-card__preview-recommendation {
    margin: 0 0 var(--ui-space-8, 8px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));

    strong {
      display: block;
      margin-bottom: var(--ui-space-4, 4px);
      color: var(--workspace-purple-text);
      font-size: var(--ui-font-12, 12px);
      line-height: 1.5;
    }

    p {
      margin: 0;
      color: var(--text-color);
      font-size: var(--ui-font-13, 13px);
      line-height: 1.7;
      overflow-wrap: anywhere;
    }
  }

  .daily-brief-card__summary-copy .daily-brief-card__view-brief {
    min-height: var(--ui-layout-32, 32px);
  }

  .daily-brief-card--summary .daily-brief-card__heading p {
    white-space: normal;
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
    grid-template-columns: var(--ui-layout-34, 34px) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-space-9, 9px);
    padding: var(--ui-space-11, 11px) var(--ui-space-13, 13px) var(--ui-space-9, 9px);
  }

  :global(.modal-view.is-mobile-fullscreen .modal-content.daily-brief-detail-content) {
    overflow-y: auto;
  }

  .daily-brief-card--detail {
    padding: var(--ui-space-16, 16px);
    border: 0;
    border-radius: 0;
    box-shadow: none;
    background: transparent;
  }

  .daily-brief-card--detail .daily-brief-card__header {
    padding: 0 0 var(--ui-space-12, 12px);
  }

  .daily-brief-card--detail .daily-brief-card__narrative,
  .daily-brief-card--detail .daily-brief-card__state {
    padding-left: 0;
    padding-right: 0;
  }

  .daily-brief-card__ai-mark {
    width: var(--ui-layout-34, 34px);
    height: var(--ui-layout-34, 34px);
    display: inline-grid;
    place-items: center;
    border-radius: 10px;
    color: #fff;
    background: linear-gradient(145deg, var(--primary-color), #ec4899);
    box-shadow: 0 8px 18px -12px color-mix(in srgb, var(--primary-color) 80%, transparent);
    font-size: var(--ui-font-12, 12px);
    font-weight: 750;
  }

  .daily-brief-card__heading {
    min-width: 0;
  }

  .daily-brief-card__title-row {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }

  .daily-brief-card__title-row h2 {
    margin: 0;
    color: var(--text-color);
    font-size: var(--ui-font-15, 15px);
    line-height: 1.3;
  }

  .daily-brief-card__heading p {
    margin: var(--ui-space-2, 2px) 0 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-10_5, 10.5px);
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .daily-brief-card__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--ui-space-6, 6px);
  }

  .daily-brief-card__update {
    color: var(--primary-color);
    min-width: var(--ui-layout-36, 36px);
    min-height: var(--ui-layout-36, 36px);
  }

  .daily-brief-card__state {
    min-height: var(--ui-layout-180, 180px);
    padding: 0 var(--ui-space-13, 13px) var(--ui-space-12, 12px);
    display: grid;
    flex: 1 1 auto;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
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
    width: min(100%, var(--ui-layout-420, 420px));
    min-width: 0;
    margin: auto;
    padding: var(--ui-space-24, 24px) var(--ui-space-18, 18px) var(--ui-space-18, 18px);
    box-sizing: border-box;
    display: grid;
    justify-items: center;
    gap: var(--ui-space-9, 9px);
    text-align: center;
  }

  .daily-brief-card__state-copy {
    min-width: 0;
    display: grid;
    justify-items: center;
    gap: var(--ui-space-4, 4px);
  }

  .daily-brief-card__state-copy strong {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.4;
  }

  .daily-brief-card__state-copy span,
  .daily-brief-card__state-main > span {
    line-height: 1.6;
  }

  .daily-brief-card__state-icon {
    width: var(--ui-layout-46, 46px);
    height: var(--ui-layout-46, 46px);
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
    padding: var(--ui-space-10, 10px) var(--ui-space-14, 14px);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-7, 7px);
    border-top: 1px solid color-mix(in srgb, var(--primary-color) 12%, var(--card-border-color));
    color: var(--desc-color);
    font-size: var(--ui-font-10_5, 10.5px);
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
    padding: 0 var(--ui-space-13, 13px) var(--ui-space-12, 12px);
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
  }

  .daily-brief-card__refresh-error {
    margin: 0 0 var(--ui-space-6, 6px);
    padding: var(--ui-space-5, 5px) var(--ui-space-8, 8px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    border: 1px solid var(--chip-pending-border);
    border-radius: 8px;
    color: var(--chip-pending-fg);
    background: var(--chip-pending-bg);
    font-size: var(--ui-font-10_5, 10.5px);
    line-height: 1.45;
  }

  .daily-brief-insight__changed {
    display: inline-block;
    margin-left: var(--ui-space-6, 6px);
    padding: 0 var(--ui-space-5, 5px);
    border: 1px solid var(--chip-pending-border);
    border-radius: 4px;
    color: var(--chip-pending-fg);
    font-size: var(--ui-font-10, 10px);
    white-space: nowrap;
  }

  .daily-brief-card__headline {
    margin: 0 0 var(--ui-space-5, 5px);
    color: var(--text-color);
    font-size: var(--ui-font-12_5, 12.5px);
    font-weight: 650;
    line-height: 1.55;
  }

  .daily-brief-card__insights {
    min-height: 0;
    overflow: visible;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--ui-space-24, 24px);
    align-content: start;
  }

  .daily-brief-insight__copy {
    min-width: 0;
    overflow-wrap: anywhere;
    padding-top: var(--ui-space-2, 2px);
  }
  .daily-brief-insight__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-8, 8px);
  }
  .daily-brief-insight__sources {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-5, 5px);
    justify-content: flex-start;
    > span {
      width: 100%;
      color: var(--desc-color);
      font-size: var(--ui-font-10_5, 10.5px);
    }
    :deep(button) {
      max-width: 100%;
      height: auto;
      min-height: var(--ui-layout-28, 28px);
      padding: var(--ui-space-2, 2px) var(--ui-space-4, 4px);
      gap: var(--ui-space-4, 4px);
      color: var(--info-color);
      background: transparent;
      white-space: normal;
      font-size: var(--ui-font-11, 11px);
      line-height: 1.5;

      &:hover {
        background: transparent;
        text-decoration: underline;
      }
    }
  }

  .daily-brief-insight__organize-actions,
  .daily-brief-card__onboarding-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-4, 4px) var(--ui-space-12, 12px);
    justify-content: flex-start;

    :deep(.b_btn) {
      height: auto;
      min-height: var(--ui-layout-28, 28px);
      padding: var(--ui-space-2, 2px) var(--ui-space-4, 4px);
      gap: var(--ui-space-4, 4px);
      color: var(--info-color);
      background: transparent;
      font-size: var(--ui-font-11, 11px);
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
    padding: var(--ui-space-12, 12px) 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--ui-space-12, 12px);
    border-top: 1px solid var(--surface-divider-color, var(--card-border-color));
  }

  .daily-brief-insight:first-child {
    border-top: 0;
  }
  .daily-brief-card:not(.daily-brief-card--stacked)
    .daily-brief-card__insights:not(.has-lead)
    .daily-brief-insight:nth-child(2) {
    border-top: 0;
  }
  .daily-brief-insight:only-child,
  .daily-brief-insight.is-lead,
  .daily-brief-card__insights:not(.has-lead) .daily-brief-insight:last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
  .daily-brief-insight.is-lead .daily-brief-insight__copy {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--ui-space-4, 4px) var(--ui-space-16, 16px);
    .daily-brief-insight__actions {
      margin-top: 0;
    }
  }
  .daily-brief-insight p.daily-brief-insight__context {
    margin-bottom: var(--ui-space-4, 4px);
    font-weight: 600;
  }

  .daily-brief-insight__marker {
    justify-self: start;
    max-width: 100%;
    margin-top: var(--ui-space-2, 2px);
  }

  .daily-brief-insight p {
    margin: 0;
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.7;
  }

  .daily-brief-card__recommendation {
    min-width: 0;
    margin-top: var(--ui-space-12, 12px);
    padding: var(--ui-space-8, 8px) var(--ui-space-10, 10px);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--ui-space-12, 12px);
    border: 1px dashed color-mix(in srgb, var(--primary-color) 28%, var(--card-border-color));
    border-radius: 10px;
    background: color-mix(in srgb, var(--primary-color) 5%, var(--card-background));
  }

  .daily-brief-card__recommendation strong,
  .daily-brief-card__recommendation p {
    margin: 0;
    font-size: var(--ui-font-11_5, 11.5px);
    line-height: 1.6;
  }

  .daily-brief-card__recommendation strong {
    color: var(--primary-color);
    white-space: nowrap;
  }

  .daily-brief-card__recommendation p {
    color: var(--text-color);
  }

  .daily-brief-card--stacked {
    .daily-brief-card__insights {
      grid-template-columns: minmax(0, 1fr);
    }
    .daily-brief-insight {
      grid-column: auto;
      gap: var(--ui-space-10, 10px);
    }
    .daily-brief-insight.is-lead .daily-brief-insight__copy {
      display: block;
    }
    .daily-brief-insight .daily-brief-insight__actions {
      margin-top: var(--ui-space-6, 6px);
    }
    .daily-brief-card__header {
      grid-template-columns: var(--ui-layout-34, 34px) minmax(0, 1fr) auto;
    }
    .daily-brief-card__actions {
      grid-column: auto;
    }
    .daily-brief-card__heading p {
      white-space: nowrap;
    }
    .daily-brief-card__recommendation {
      grid-template-columns: 1fr;
      gap: var(--ui-space-2, 2px);
      margin-top: var(--ui-space-8, 8px);
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
