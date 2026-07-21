<template>
  <section v-if="hasCoverage" class="ai-coverage" :aria-label="copy.title">
    <div class="ai-coverage__heading">
      <span class="ai-coverage__heading-icon" :class="`is-${overallState}`" aria-hidden="true">
        <SvgIcon :src="stateIcon(overallState)" size="15" />
      </span>
      <div class="ai-coverage__heading-copy">
        <strong>{{ copy.title }}</strong>
        <small>{{ overallSummary }}</small>
      </div>
      <span :class="['ai-coverage__state', `is-${overallState}`]">{{ stateLabel(overallState) }}</span>
    </div>

    <div class="ai-coverage__documents">
      <BCard
        v-for="document in documents"
        :key="document.sourceId"
        as="article"
        variant="panel"
        padding="10px"
        radius="10px"
        :class="['ai-coverage__document', `is-${document.state}`]"
      >
        <div class="ai-coverage__document-heading">
          <span class="ai-coverage__document-icon" aria-hidden="true">
            <SvgIcon :src="stateIcon(document.state)" size="14" />
          </span>
          <strong :title="document.fileName">{{ document.fileName }}</strong>
          <span :class="['ai-coverage__state', `is-${document.state}`]">
            {{ stateLabel(document.state)
            }}<template v-if="document.ratio != null"> · {{ percent(document.ratio) }}</template>
          </span>
        </div>

        <div
          v-if="document.ratio != null"
          class="ai-coverage__progress"
          role="progressbar"
          :aria-label="`${document.fileName} ${copy.coverage}`"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="Math.round(document.ratio * 100)"
        >
          <span :style="{ width: percent(document.ratio) }"></span>
        </div>

        <p class="ai-coverage__counts">{{ countsText(document.coverage) }}</p>
        <p v-if="selectionText(document.selection)" class="ai-coverage__selection">
          {{ selectionText(document.selection) }}
        </p>

        <ul v-if="document.limitations.length" class="ai-coverage__limitations" :aria-label="copy.failedRanges">
          <li v-for="(limitation, index) in document.limitations" :key="`${document.sourceId}:${index}`">
            <strong>{{ limitation.label }}</strong>
            <span v-if="limitation.reason">{{ limitation.reason }}</span>
          </li>
        </ul>
      </BCard>
    </div>

    <ul v-if="overallLimitations.length" class="ai-coverage__overall-limitations" :aria-label="copy.limitations">
      <li v-for="(limitation, index) in overallLimitations" :key="`${limitation.sourceId || 'all'}:${index}`">
        <strong>{{ limitation.fileName || copy.limitations }}</strong>
        <span>{{ [limitation.code, limitation.message].filter(Boolean).join(copy.reasonSeparator) }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import {
    formatAiCoverageRange,
    getAiCoverageRatio,
    resolveAiCoverageState,
    type AiCoverageOverall,
    type AiCoverageReport,
    type AiCoverageSelection,
    type AiCoverageState,
    type AiSource,
    type AiSourceCoverage,
  } from './aiSourceNavigation';

  interface CoverageLabels {
    title: string;
    coverage: string;
    complete: string;
    partial: string;
    unknown: string;
    failed: string;
    failedRanges: string;
    limitations: string;
    noCounts: string;
    scanned: string;
    context: string;
    summaryMode: string;
    retrievalMode: string;
    unavailable: string;
    untitledFile: string;
    fileCount: string;
    failedRangeCount: string;
    pagesCount: string;
    chunksCount: string;
    charsCount: string;
    range: string;
    rangePage: string;
    rangeChar: string;
    rangeChunk: string;
    rangeParagraph: string;
    reasonSeparator: string;
  }

  interface DisplayLimitation {
    label: string;
    reason: string;
  }

  interface DisplayDocument {
    sourceId: string;
    fileName: string;
    status: string;
    coverage: AiSourceCoverage;
    state: AiCoverageState;
    ratio: number | null;
    limitations: DisplayLimitation[];
    selection?: AiCoverageSelection;
  }

  const props = withDefaults(
    defineProps<{
      sources?: AiSource[];
      coverage?: AiCoverageReport | null;
      labels?: Partial<CoverageLabels>;
    }>(),
    {
      sources: () => [],
      coverage: null,
      labels: () => ({}),
    },
  );

  const { locale, t } = useI18n();

  const copy = computed<CoverageLabels>(() => ({
    title: t('ai.coverage.title'),
    coverage: t('ai.coverage.coverage'),
    complete: t('ai.coverage.states.complete'),
    partial: t('ai.coverage.states.partial'),
    unknown: t('ai.coverage.states.unknown'),
    failed: t('ai.coverage.states.failed'),
    failedRanges: t('ai.coverage.failedRanges'),
    limitations: t('ai.coverage.limitations'),
    noCounts: t('ai.coverage.noCounts'),
    scanned: t('ai.coverage.scanned'),
    context: t('ai.coverage.context'),
    summaryMode: t('ai.coverage.summaryMode'),
    retrievalMode: t('ai.coverage.retrievalMode'),
    unavailable: t('ai.coverage.unavailable'),
    untitledFile: t('ai.coverage.untitledFile'),
    fileCount: t('ai.coverage.fileCount', { count: '{count}' }),
    failedRangeCount: t('ai.coverage.failedRangeCount', { count: '{count}' }),
    pagesCount: t('ai.coverage.counts.pages', { processed: '{processed}', total: '{total}' }),
    chunksCount: t('ai.coverage.counts.chunks', { processed: '{processed}', total: '{total}' }),
    charsCount: t('ai.coverage.counts.chars', { processed: '{processed}', total: '{total}' }),
    range: t('ai.coverage.rangeUnits.range'),
    rangePage: t('ai.coverage.rangeUnits.page'),
    rangeChar: t('ai.coverage.rangeUnits.char'),
    rangeChunk: t('ai.coverage.rangeUnits.chunk'),
    rangeParagraph: t('ai.coverage.rangeUnits.paragraph'),
    reasonSeparator: t('ai.coverage.reasonSeparator'),
    ...props.labels,
  }));

  const rangeLabels = computed(() => ({
    range: copy.value.range,
    units: {
      page: copy.value.rangePage,
      char: copy.value.rangeChar,
      chunk: copy.value.rangeChunk,
      paragraph: copy.value.rangeParagraph,
    },
  }));

  function interpolate(template: string, values: Record<string, string | number>) {
    return Object.entries(values).reduce(
      (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
      template,
    );
  }

  const sourceKeys = (source: AiSource) =>
    [source.id, source.sourceId, source.resourceId, source.documentId, source.fileId].filter((value): value is string =>
      Boolean(value),
    );

  const sourceByKey = computed(() => {
    const sources = new Map<string, AiSource>();
    for (const source of props.sources) {
      for (const key of sourceKeys(source)) sources.set(key, source);
    }
    return sources;
  });

  function limitationsOf(coverage: AiSourceCoverage): DisplayLimitation[] {
    const ranges = (coverage.failedRanges || []).map((range) => ({
      label: formatAiCoverageRange(range, rangeLabels.value),
      reason: String(range.reason || '').trim(),
    }));
    const reasons = (coverage.reasons || []).map((reason) => ({
      label: String(reason.code || copy.value.failedRanges),
      reason: String(reason.message || '').trim(),
    }));
    return [...ranges, ...reasons];
  }

  const documents = computed<DisplayDocument[]>(() => {
    const reported = props.coverage?.documents || [];
    if (reported.length) {
      return reported.map((document) => {
        const source = sourceByKey.value.get(String(document.sourceId));
        const status = String(document.status || '');
        return {
          sourceId: String(document.sourceId),
          fileName: document.fileName || source?.title || copy.value.untitledFile,
          status,
          coverage: document.parse,
          state: resolveAiCoverageState(document.parse, status),
          ratio: getAiCoverageRatio(document.parse),
          limitations: limitationsOf(document.parse),
          selection: document.selection,
        };
      });
    }
    return props.sources
      .filter((source) => source.type === 'document' && source.coverage)
      .map((source) => ({
        sourceId: source.documentId || source.id,
        fileName: source.title || copy.value.untitledFile,
        status: '',
        coverage: source.coverage!,
        state: resolveAiCoverageState(source.coverage),
        ratio: getAiCoverageRatio(source.coverage),
        limitations: limitationsOf(source.coverage!),
        selection: undefined,
      }));
  });

  const reportedOverall = computed<AiCoverageOverall | null>(() => props.coverage?.overall || null);
  const overallLimitations = computed(() => reportedOverall.value?.limitations || []);
  const overallState = computed<AiCoverageState>(() => {
    const documentStates = documents.value.map((document) => document.state);
    if (documentStates.length && documentStates.every((state) => state === 'failed')) return 'failed';
    if (reportedOverall.value) return resolveAiCoverageState(reportedOverall.value);
    if (!documentStates.length || documentStates.includes('unknown')) return 'unknown';
    return documentStates.every((state) => state === 'complete') ? 'complete' : 'partial';
  });
  const overallRatio = computed(() => {
    if (reportedOverall.value) return getAiCoverageRatio(reportedOverall.value);
    const ratios = documents.value.map((document) => document.ratio);
    return ratios.length && ratios.every((ratio) => ratio != null) ? Math.min(...(ratios as number[])) : null;
  });
  const hasCoverage = computed(() => Boolean(reportedOverall.value || documents.value.length));
  const overallSummary = computed(() => {
    const count = documents.value.length || Number(reportedOverall.value?.documentCount || 0);
    const ratio = overallRatio.value;
    const ratioText = ratio == null ? copy.value.unknown : percent(ratio);
    const failedRangeCount = Number(reportedOverall.value?.failedRangeCount || 0);
    const scanRatio = reportedOverall.value?.selection?.scanRatio;
    return [
      interpolate(copy.value.fileCount, { count }),
      `${copy.value.coverage} ${ratioText}`,
      scanRatio != null ? `${copy.value.scanned} ${percent(scanRatio)}` : '',
      failedRangeCount ? interpolate(copy.value.failedRangeCount, { count: failedRangeCount }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
  });

  function percent(ratio: number) {
    return new Intl.NumberFormat(locale.value, { style: 'percent', maximumFractionDigits: 1 }).format(
      Math.max(0, Math.min(1, ratio)),
    );
  }

  function stateLabel(state: AiCoverageState) {
    return copy.value[state];
  }

  function stateIcon(state: AiCoverageState) {
    if (state === 'complete') return icon.message.success;
    if (state === 'partial') return icon.message.warning;
    if (state === 'failed') return icon.message.error;
    return icon.message.info;
  }

  function countsText(coverage: AiSourceCoverage) {
    const parts: string[] = [];
    const total = coverage.total || { chars: 0, pages: 0, chunks: 0 };
    const processed = coverage.processed || { chars: 0, pages: 0, chunks: 0 };
    if (total.pages) {
      parts.push(interpolate(copy.value.pagesCount, { processed: processed.pages || 0, total: total.pages }));
    }
    if (total.chunks) {
      parts.push(interpolate(copy.value.chunksCount, { processed: processed.chunks || 0, total: total.chunks }));
    }
    if (total.chars) {
      parts.push(interpolate(copy.value.charsCount, { processed: processed.chars || 0, total: total.chars }));
    }
    return parts.length ? parts.join(' · ') : copy.value.noCounts;
  }

  function selectionText(selection?: AiCoverageSelection) {
    if (!selection) return '';
    if (selection.mode === 'unavailable') return copy.value.unavailable;
    const modeLabel =
      selection.mode === 'hierarchical-summary'
        ? copy.value.summaryMode
        : selection.mode === 'relevance-retrieval'
          ? copy.value.retrievalMode
          : '';
    return [
      modeLabel,
      selection.scanRatio != null ? `${copy.value.scanned} ${percent(selection.scanRatio)}` : '',
      selection.contextRatio != null ? `${copy.value.context} ${percent(selection.contextRatio)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }
</script>

<style scoped lang="less">
  .ai-coverage {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .ai-coverage__heading {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .ai-coverage__heading-icon,
  .ai-coverage__document-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    color: var(--coverage-accent, var(--message-info-color));
  }

  .ai-coverage__heading-icon {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--coverage-accent, var(--message-info-color)) 10%, var(--card-background));
  }

  .ai-coverage__heading-icon.is-complete,
  .ai-coverage__document.is-complete {
    --coverage-accent: var(--message-success-color);
  }

  .ai-coverage__heading-icon.is-partial,
  .ai-coverage__document.is-partial {
    --coverage-accent: var(--message-warning-color);
  }

  .ai-coverage__heading-icon.is-failed,
  .ai-coverage__document.is-failed {
    --coverage-accent: var(--message-error-color);
  }

  .ai-coverage__heading-icon.is-unknown,
  .ai-coverage__document.is-unknown {
    --coverage-accent: var(--message-info-color);
  }

  .ai-coverage__heading-copy {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 1px;
  }

  .ai-coverage__heading-copy strong {
    color: var(--text-color);
    font-size: 12px;
    font-weight: 650;
  }

  .ai-coverage__heading-copy small {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-coverage__state {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    min-height: 20px;
    padding: 1px 7px;
    border: 1px solid color-mix(in srgb, var(--state-color) 25%, var(--surface-border-color));
    border-radius: 999px;
    background: color-mix(in srgb, var(--state-color) 8%, var(--card-background));
    color: var(--state-color);
    font-size: 10px;
    font-weight: 650;
    line-height: 1.2;
  }

  .ai-coverage__state.is-complete {
    --state-color: var(--message-success-color);
  }

  .ai-coverage__state.is-partial {
    --state-color: var(--message-warning-color);
  }

  .ai-coverage__state.is-failed {
    --state-color: var(--message-error-color);
  }

  .ai-coverage__state.is-unknown {
    --state-color: var(--message-info-color);
  }

  .ai-coverage__documents {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
    gap: 7px;
  }

  .ai-coverage__document {
    --b-card-border-color: color-mix(in srgb, var(--coverage-accent) 22%, var(--surface-border-color));
    --b-card-background: color-mix(in srgb, var(--coverage-accent) 4%, var(--workspace-panel-bg-color));
  }

  .ai-coverage__document-heading {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .ai-coverage__document-heading > strong {
    min-width: 0;
    overflow: hidden;
    flex: 1;
    color: var(--text-color);
    font-size: 11px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-coverage__progress {
    height: 4px;
    margin-top: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--coverage-accent) 12%, var(--surface-divider-color));
  }

  .ai-coverage__progress > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--coverage-accent);
    transition: width 0.18s ease;
  }

  .ai-coverage__counts,
  .ai-coverage__selection {
    margin: 7px 0 0;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.45;
  }

  .ai-coverage__selection {
    margin-top: 2px;
  }

  .ai-coverage__limitations {
    display: grid;
    gap: 4px;
    margin: 7px 0 0;
    padding: 7px 8px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--message-warning-color) 7%, var(--card-background));
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.45;
    list-style: none;
  }

  .ai-coverage__limitations li {
    display: flex;
    gap: 5px;
    min-width: 0;
  }

  .ai-coverage__limitations strong {
    flex: 0 0 auto;
    color: var(--text-color);
    font-weight: 600;
  }

  .ai-coverage__limitations span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .ai-coverage__overall-limitations {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 8px 9px;
    border: 1px solid color-mix(in srgb, var(--message-warning-color) 18%, var(--surface-border-color));
    border-radius: 9px;
    background: color-mix(in srgb, var(--message-warning-color) 5%, var(--workspace-panel-bg-color));
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.45;
    list-style: none;
  }

  .ai-coverage__overall-limitations li {
    display: flex;
    gap: 5px;
  }

  .ai-coverage__overall-limitations strong {
    flex: 0 0 auto;
    color: var(--text-color);
    font-weight: 600;
  }

  @media (max-width: 768px) {
    .ai-coverage__documents {
      grid-template-columns: 1fr;
    }

    .ai-coverage__heading-copy small {
      white-space: normal;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ai-coverage__progress > span {
      transition: none;
    }
  }
</style>
