<template>
  <section class="ai-evidence" :aria-label="copy.title">
    <div class="ai-evidence__heading">
      <span class="ai-evidence__heading-icon" aria-hidden="true">
        <SvgIcon :src="icon.noteTemplate.knowledge" size="15" />
      </span>
      <div class="ai-evidence__heading-copy">
        <strong>{{ copy.title }}</strong>
        <small>{{ groups.length ? copy.count.replace('{count}', String(groups.length)) : copy.emptyLabel }}</small>
      </div>
    </div>

    <div v-if="groups.length" class="ai-evidence__groups">
      <BCard
        v-for="group in visibleGroups"
        :id="anchorId(group.citationKey)"
        :key="group.citationKey"
        as="article"
        tabindex="-1"
        variant="panel"
        padding="9px"
        radius="10px"
        class="ai-evidence__group"
      >
        <div class="ai-evidence__citation-heading">
          <span class="ai-evidence__citation">[{{ group.citationKey }}]</span>
          <span>{{ copy.citation }}</span>
          <small>{{ group.items.length }} {{ copy.items }}</small>
        </div>

        <div class="ai-evidence__items">
          <template
            v-for="(item, itemIndex) in group.items"
            :key="item.evidenceRef || `${group.citationKey}:${itemIndex}`"
          >
            <div class="ai-evidence__item-shell">
              <BButton
                v-if="item.source && isNavigable(item.source)"
                class="ai-evidence__item is-navigable"
                role="link"
                :aria-label="openLabel(item)"
                @click="selectEvidence(item)"
                @keydown.enter.prevent="selectEvidence(item)"
                @keydown.space.prevent="selectEvidence(item)"
              >
                <EvidenceContent :item="item" :copy="copy" />
                <SvgIcon
                  class="ai-evidence__item-action"
                  :src="isExternal(item.source) ? icon.ai.sourceExternal : icon.ai.sourceArrow"
                  size="13"
                  aria-hidden="true"
                />
              </BButton>
              <div v-else class="ai-evidence__item is-static">
                <EvidenceContent :item="item" :copy="copy" />
              </div>
              <div class="ai-evidence__feedback">
                <BButton
                  size="small"
                  :aria-expanded="feedbackEvidenceRef === item.evidenceRef"
                  @click="toggleFeedback(item)"
                >
                  {{
                    feedbackSubmitted.has(item.evidenceRef)
                      ? t('ai.evidence.feedback.thanks')
                      : t('ai.evidence.feedback.label')
                  }}
                </BButton>
                <div v-if="feedbackEvidenceRef === item.evidenceRef" class="ai-evidence__feedback-options">
                  <BButton size="small" @click="submitEvidenceFeedback(item, 'unsupported')">
                    {{ t('ai.evidence.feedback.unsupported') }}
                  </BButton>
                  <BButton size="small" @click="submitEvidenceFeedback(item, 'outdated')">
                    {{ t('ai.evidence.feedback.outdated') }}
                  </BButton>
                  <BButton size="small" @click="submitEvidenceFeedback(item, 'missing')">
                    {{ t('ai.evidence.feedback.missing') }}
                  </BButton>
                </div>
              </div>
            </div>
          </template>
        </div>
      </BCard>

      <span
        v-for="group in hiddenGroups"
        :id="anchorId(group.citationKey)"
        :key="`anchor:${group.citationKey}`"
        class="ai-evidence__anchor-proxy"
        tabindex="-1"
        aria-hidden="true"
        @focus="revealGroup(group.citationKey)"
      ></span>

      <BButton
        v-if="hiddenGroupCount"
        class="ai-evidence__toggle"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? copy.showLess : copy.showMore.replace('{count}', String(hiddenGroupCount)) }}
        <SvgIcon
          :class="['ai-evidence__toggle-icon', { 'is-expanded': expanded }]"
          :src="icon.ai.sourceArrow"
          size="12"
          aria-hidden="true"
        />
      </BButton>
    </div>

    <BCard v-else as="div" variant="panel" padding="10px" radius="10px" class="ai-evidence__empty" role="status">
      <SvgIcon :src="icon.message.info" size="15" aria-hidden="true" />
      <p>{{ copy.empty }}</p>
    </BCard>
  </section>
</template>

<script setup lang="ts">
  import { computed, defineComponent, h, nextTick, ref, watch, type PropType } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { recordAiProductEvent } from '@/api/aiTelemetry';
  import { getAiEvidenceAnchorId } from '@/utils/aiMessageRender';
  import {
    formatAiEvidenceLocator,
    groupAiEvidence,
    resolveAiSourceNavigation,
    type AiEvidenceReference,
    type AiResolvedEvidence,
    type AiSource,
  } from './aiSourceNavigation';

  interface EvidenceLabels {
    title: string;
    count: string;
    citation: string;
    items: string;
    source: string;
    location: string;
    version: string;
    excerpt: string;
    open: string;
    emptyLabel: string;
    empty: string;
    showMore: string;
    showLess: string;
    fieldSeparator: string;
    locatorPage: string;
    locatorSection: string;
    locatorParagraph: string;
    locatorRow: string;
    locatorChunk: string;
    locatorStatus: string;
    locatorPageValue: string;
    locatorSectionValue: string;
    locatorParagraphValue: string;
  }

  const EvidenceContent = defineComponent({
    name: 'EvidenceContent',
    props: {
      item: { type: Object as PropType<AiResolvedEvidence>, required: true },
      copy: { type: Object as PropType<EvidenceLabels>, required: true },
    },
    setup(contentProps) {
      const interpolate = (template: string, value: string) => template.replaceAll('{value}', value);
      const location = () =>
        formatAiEvidenceLocator(contentProps.item.locator, {
          types: {
            page: contentProps.copy.locatorPage,
            section: contentProps.copy.locatorSection,
            paragraph: contentProps.copy.locatorParagraph,
            row: contentProps.copy.locatorRow,
            chunk: contentProps.copy.locatorChunk,
            status: contentProps.copy.locatorStatus,
          },
          pageValue: (value) => interpolate(contentProps.copy.locatorPageValue, value),
          sectionValue: (value) => interpolate(contentProps.copy.locatorSectionValue, value),
          paragraphValue: (value) => interpolate(contentProps.copy.locatorParagraphValue, value),
        });
      const trace = () =>
        [
          location() ? `${contentProps.copy.location}${contentProps.copy.fieldSeparator}${location()}` : '',
          contentProps.item.resourceVersion
            ? `${contentProps.copy.version}${contentProps.copy.fieldSeparator}${contentProps.item.resourceVersion}`
            : '',
        ]
          .filter(Boolean)
          .join(' · ');
      return () =>
        h('span', { class: 'ai-evidence__item-body' }, [
          h('span', { class: 'ai-evidence__item-meta' }, [
            h(
              'span',
              { class: 'ai-evidence__source-icon', 'aria-hidden': 'true' },
              h(SvgIcon, { src: sourceIcon(contentProps.item.source?.type), size: '13' }),
            ),
            h(
              'strong',
              {
                title: contentProps.item.sourceTitle || contentProps.item.source?.title || contentProps.copy.source,
              },
              contentProps.item.sourceTitle || contentProps.item.source?.title || contentProps.copy.source,
            ),
            trace() ? h('small', { title: trace() }, trace()) : null,
          ]),
          h(
            'span',
            { class: 'ai-evidence__excerpt' },
            contentProps.item.excerpt?.trim().slice(0, 320) ||
              `${contentProps.copy.excerpt}${contentProps.copy.fieldSeparator}—`,
          ),
        ]);
    },
  });

  function sourceIcon(type?: string) {
    if (!type) return icon.message.info;
    if (type === 'note') return icon.resource.note;
    if (type === 'file' || type === 'document' || type === 'folder') return icon.resource.file;
    if (type === 'tag') return icon.resource.tag;
    if (type === 'knowledge') return icon.noteTemplate.knowledge;
    if (type === 'todo') return icon.contextMenu.inbox;
    if (type === 'web') return icon.ai.internet;
    return icon.resource.bookmark;
  }

  const props = withDefaults(
    defineProps<{
      sources?: AiSource[];
      evidence?: AiEvidenceReference[];
      labels?: Partial<EvidenceLabels>;
      initialGroupLimit?: number;
      anchorScope?: string;
    }>(),
    {
      sources: () => [],
      evidence: () => [],
      labels: () => ({}),
      initialGroupLimit: 6,
      anchorScope: '',
    },
  );
  const emit = defineEmits<{
    select: [source: AiSource, evidence: AiResolvedEvidence];
  }>();

  const { t } = useI18n();

  const copy = computed<EvidenceLabels>(() => ({
    title: t('ai.evidence.title'),
    count: t('ai.evidence.count', { count: '{count}' }),
    citation: t('ai.evidence.citation'),
    items: t('ai.evidence.items'),
    source: t('ai.evidence.source'),
    location: t('ai.evidence.location'),
    version: t('ai.evidence.version'),
    excerpt: t('ai.evidence.excerpt'),
    open: t('ai.evidence.open'),
    emptyLabel: t('ai.evidence.emptyLabel'),
    empty: t('ai.evidence.empty'),
    showMore: t('ai.evidence.showMore', { count: '{count}' }),
    showLess: t('ai.evidence.showLess'),
    fieldSeparator: t('ai.evidence.fieldSeparator'),
    locatorPage: t('ai.evidence.locator.types.page'),
    locatorSection: t('ai.evidence.locator.types.section'),
    locatorParagraph: t('ai.evidence.locator.types.paragraph'),
    locatorRow: t('ai.evidence.locator.types.row'),
    locatorChunk: t('ai.evidence.locator.types.chunk'),
    locatorStatus: t('ai.evidence.locator.types.status'),
    locatorPageValue: t('ai.evidence.locator.pageValue', { value: '{value}' }),
    locatorSectionValue: t('ai.evidence.locator.sectionValue', { value: '{value}' }),
    locatorParagraphValue: t('ai.evidence.locator.paragraphValue', { value: '{value}' }),
    ...props.labels,
  }));
  const groups = computed(() => groupAiEvidence(props.sources, props.evidence));
  const expanded = ref(false);
  const feedbackEvidenceRef = ref('');
  const feedbackSubmitted = ref(new Set<string>());
  const groupLimit = computed(() => Math.max(1, Math.min(20, Math.trunc(props.initialGroupLimit || 6))));
  const visibleGroups = computed(() => (expanded.value ? groups.value : groups.value.slice(0, groupLimit.value)));
  const hiddenGroups = computed(() => (expanded.value ? [] : groups.value.slice(groupLimit.value)));
  const hiddenGroupCount = computed(() =>
    expanded.value ? groups.value.length - groupLimit.value : groups.value.length - visibleGroups.value.length,
  );

  watch(
    () => groups.value.map((group) => group.citationKey).join('|'),
    () => {
      expanded.value = false;
    },
  );

  const isNavigable = (source: AiSource) => resolveAiSourceNavigation(source).kind !== 'none';
  const isExternal = (source: AiSource) => resolveAiSourceNavigation(source).kind === 'external';
  const anchorId = (citationKey: string) => getAiEvidenceAnchorId(citationKey, props.anchorScope);

  function selectEvidence(item: AiResolvedEvidence) {
    if (!item.source || !isNavigable(item.source)) return;
    void recordAiProductEvent('ai_source_opened', {
      surface: 'workspace',
      mode: 'ask',
      sourceId: item.source.sourceId || `${item.source.type}:${item.source.id}`,
      evidenceRef: item.evidenceRef,
      actionType: 'open',
    });
    emit('select', item.source, item);
  }

  function toggleFeedback(item: AiResolvedEvidence) {
    if (feedbackSubmitted.value.has(item.evidenceRef)) return;
    feedbackEvidenceRef.value = feedbackEvidenceRef.value === item.evidenceRef ? '' : item.evidenceRef;
  }

  function submitEvidenceFeedback(item: AiResolvedEvidence, issueType: 'unsupported' | 'outdated' | 'missing') {
    const source = item.source;
    if (!source) return;
    void recordAiProductEvent('ai_source_feedback', {
      surface: 'workspace',
      mode: 'ask',
      sourceId: source.sourceId || `${source.type}:${source.id}`,
      evidenceRef: item.evidenceRef,
      issueType,
    });
    const submitted = new Set(feedbackSubmitted.value);
    submitted.add(item.evidenceRef);
    feedbackSubmitted.value = submitted;
    feedbackEvidenceRef.value = '';
  }

  function openLabel(item: AiResolvedEvidence) {
    return `${copy.value.open}${copy.value.fieldSeparator}${item.sourceTitle || item.source?.title || copy.value.source}`;
  }

  function revealGroup(citationKey: string) {
    if (expanded.value) return;
    expanded.value = true;
    void nextTick(() => {
      const group = document.getElementById(anchorId(citationKey));
      group?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
      group?.focus({ preventScroll: true });
    });
  }
</script>

<style scoped lang="less">
  .ai-evidence {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .ai-evidence__heading {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .ai-evidence__heading-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-color) 9%, var(--card-background));
    color: var(--primary-color);
  }

  .ai-evidence__heading-copy {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .ai-evidence__heading-copy strong {
    color: var(--text-color);
    font-size: 12px;
    font-weight: 650;
  }

  .ai-evidence__heading-copy small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .ai-evidence__groups,
  .ai-evidence__items {
    display: grid;
    gap: 7px;
  }

  .ai-evidence__group {
    --b-card-border-color: color-mix(in srgb, var(--primary-color) 17%, var(--surface-border-color));
    --b-card-background: color-mix(in srgb, var(--primary-color) 3%, var(--workspace-panel-bg-color));
    scroll-margin-block: 18px;
  }

  .ai-evidence__group:target,
  .ai-evidence__group:focus,
  .ai-evidence__group:focus-visible {
    --b-card-border-color: color-mix(in srgb, var(--primary-color) 72%, var(--surface-border-color));
    outline: 3px solid color-mix(in srgb, var(--primary-color) 18%, transparent);
    outline-offset: 2px;
  }

  .ai-evidence__anchor-proxy {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .ai-evidence__citation-heading {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 7px;
    color: var(--text-color);
    font-size: 11px;
    font-weight: 600;
  }

  .ai-evidence__citation-heading small {
    margin-left: auto;
    color: var(--desc-color);
    font-size: 10px;
    font-weight: 400;
  }

  .ai-evidence__citation {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    min-height: 21px;
    padding: 1px 6px;
    border-radius: 7px;
    background: color-mix(in srgb, var(--primary-color) 11%, var(--card-background));
    color: var(--primary-color);
    font-weight: 700;
  }

  .ai-evidence__item {
    width: 100%;
    height: auto;
    min-height: 58px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--card-background);
    color: var(--text-color);
    line-height: 1.4;
    text-align: left;
    white-space: normal;
  }

  .ai-evidence__item-shell {
    display: grid;
    gap: 4px;
  }

  .ai-evidence__feedback,
  .ai-evidence__feedback-options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .ai-evidence__feedback > button,
  .ai-evidence__feedback-options > button {
    height: 26px;
    padding-inline: 7px;
    color: var(--desc-color);
    background: transparent;
    font-size: 9px;
  }

  .ai-evidence__feedback-options {
    padding-left: 3px;
  }

  .ai-evidence__item.is-navigable {
    transition:
      border-color 0.16s ease,
      background-color 0.16s ease;
  }

  .ai-evidence__item.is-navigable:hover {
    border-color: color-mix(in srgb, var(--primary-color) 35%, var(--surface-border-color));
    background: color-mix(in srgb, var(--primary-color) 4%, var(--card-background));
  }

  :deep(.ai-evidence__item-body) {
    display: grid;
    min-width: 0;
    flex: 1;
    gap: 4px;
  }

  :deep(.ai-evidence__item-meta) {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 5px;
  }

  :deep(.ai-evidence__source-icon) {
    display: inline-flex;
    flex: 0 0 auto;
    color: var(--primary-color);
  }

  :deep(.ai-evidence__item-meta strong) {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: 11px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.ai-evidence__item-meta small) {
    min-width: 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :deep(.ai-evidence__excerpt) {
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.5;
    overflow-wrap: anywhere;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .ai-evidence__item-action {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .ai-evidence__empty {
    --b-card-border-color: color-mix(in srgb, var(--message-info-color) 18%, var(--surface-border-color));
    --b-card-background: color-mix(in srgb, var(--message-info-color) 4%, var(--workspace-panel-bg-color));
    display: flex;
    align-items: flex-start;
    gap: 7px;
    color: var(--message-info-color);
  }

  .ai-evidence__empty p {
    margin: 0;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.5;
  }

  .ai-evidence__toggle {
    width: max-content;
    height: 30px;
    justify-self: center;
    gap: 4px;
    padding: 0 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: var(--card-background);
    color: var(--primary-color);
    font-size: 11px;
  }

  .ai-evidence__toggle-icon {
    transition: transform 0.16s ease;
    transform: rotate(90deg);
  }

  .ai-evidence__toggle-icon.is-expanded {
    transform: rotate(-90deg);
  }

  @media (max-width: 768px) {
    .ai-evidence__item {
      min-height: 62px;
    }

    :deep(.ai-evidence__item-meta) {
      flex-wrap: wrap;
    }

    :deep(.ai-evidence__item-meta small) {
      flex-basis: 100%;
      padding-left: 18px;
    }

    .ai-evidence__feedback > button,
    .ai-evidence__feedback-options > button {
      min-height: 44px;
    }

    .ai-evidence__toggle {
      min-height: 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ai-evidence__item.is-navigable {
      transition: none;
    }

    .ai-evidence__toggle-icon {
      transition: none;
    }
  }
</style>
