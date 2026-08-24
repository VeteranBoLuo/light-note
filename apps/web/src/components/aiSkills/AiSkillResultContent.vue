<template>
  <div v-if="result.kind === 'grounded_markdown'" class="ai-skill-result__markdown" v-html="renderedContent"></div>

  <article v-else-if="result.kind === 'artifact_preview'" class="ai-skill-result__artifact">
    <strong>{{ textValue(result.title) || t('aiSkills.draftTitle') }}</strong>
    <div class="ai-skill-result__markdown" v-html="renderedContent"></div>
  </article>

  <article v-else-if="result.kind === 'text'" class="ai-skill-result__text">
    <strong>{{ t('aiSkills.textResult') }}</strong>
    <p>{{ textValue(result.content) }}</p>
  </article>

  <article v-else-if="result.kind === 'field_suggestions'" class="ai-skill-result__card">
    <strong>{{ t('aiSkills.fieldSuggestions') }}</strong>
    <dl v-if="fieldRows.length" class="ai-skill-result__fields">
      <template v-for="row in fieldRows" :key="row.key">
        <dt>{{ row.label }}</dt>
        <dd>{{ row.value }}</dd>
      </template>
    </dl>
  </article>

  <article v-else-if="isTodoDraft" class="ai-skill-result__card">
    <strong>{{ todoDraftTitle }}</strong>
    <h3>{{ textValue(result.title) }}</h3>
    <p v-if="textValue(result.description)" class="ai-skill-result__description">
      {{ textValue(result.description) }}
    </p>
    <dl v-if="result.draftType === 'todo'" class="ai-skill-result__meta">
      <div>
        <dt>{{ t('aiSkills.todo.priority') }}</dt>
        <dd>{{ priorityLabel(result.priority) }}</dd>
      </div>
      <div>
        <dt>{{ t('aiSkills.todo.dueAt') }}</dt>
        <dd>{{ textValue(result.dueAt) || t('aiSkills.todo.noDueAt') }}</dd>
      </div>
    </dl>
    <section v-if="checklist.length" class="ai-skill-result__checklist">
      <strong>{{ t('aiSkills.todo.checklist') }}</strong>
      <ol>
        <li v-for="(item, index) in checklist" :key="`${index}:${item}`">{{ item }}</li>
      </ol>
    </section>
  </article>

  <article v-else-if="isTodoCandidates" class="ai-skill-result__card">
    <strong>{{ t('aiSkills.todo.candidates') }}</strong>
    <small>{{ t('aiSkills.todo.candidateCount', { count: todoCandidates.length }) }}</small>
    <ol class="ai-skill-result__candidates">
      <li v-for="(candidate, index) in todoCandidates" :key="candidateKey(candidate, index)">
        <h3>{{ textValue(candidate.title) }}</h3>
        <p v-if="textValue(candidate.description)">{{ textValue(candidate.description) }}</p>
        <div class="ai-skill-result__candidate-meta">
          <span>{{ t('aiSkills.todo.priority') }}：{{ priorityLabel(candidate.priority) }}</span>
          <span v-if="textValue(candidate.dueAt)">
            {{ t('aiSkills.todo.dueAt') }}：{{ textValue(candidate.dueAt) }}
          </span>
          <span v-if="sourceCitation(candidate)">
            {{ t('aiSkills.todo.sourceCitation', { index: sourceCitation(candidate) }) }}
          </span>
        </div>
      </li>
    </ol>
  </article>

  <p v-else class="ai-skill-result__unsupported" role="status">
    {{ t('aiSkills.unsupportedResult') }}
  </p>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import { renderStreamingMarkdown } from '@/utils/aiMessageRender';

  type SkillResult = NonNullable<AiSkillResponse['result']>;
  type UnknownRecord = Record<string, unknown>;

  const props = defineProps<{ result: SkillResult }>();
  const { t } = useI18n();

  const renderedContent = computed(() => renderStreamingMarkdown(textValue(props.result.content)));
  const isTodoDraft = computed(
    () =>
      props.result.kind === 'structured_draft' &&
      ['todo', 'todo_breakdown'].includes(textValue(props.result.draftType)),
  );
  const isTodoCandidates = computed(
    () => props.result.kind === 'structured_draft' && props.result.draftType === 'todo_candidates',
  );
  const todoDraftTitle = computed(() =>
    props.result.draftType === 'todo_breakdown' ? t('aiSkills.todo.breakdown') : t('aiSkills.todo.draft'),
  );
  const checklist = computed(() =>
    (Array.isArray(props.result.checklist) ? props.result.checklist : [])
      .map((item) => (typeof item === 'object' && item ? textValue((item as UnknownRecord).text) : textValue(item)))
      .filter(Boolean),
  );
  const todoCandidates = computed<UnknownRecord[]>(() =>
    (Array.isArray(props.result.candidates) ? props.result.candidates : []).filter((item): item is UnknownRecord =>
      Boolean(item && typeof item === 'object' && !Array.isArray(item)),
    ),
  );
  const fieldRows = computed(() => {
    const fields =
      props.result.fields && typeof props.result.fields === 'object' && !Array.isArray(props.result.fields)
        ? (props.result.fields as UnknownRecord)
        : {};
    return ['url', 'name', 'description', 'newTags']
      .map((key) => {
        const raw = fields[key];
        const value = Array.isArray(raw) ? raw.map(textValue).filter(Boolean).join('、') : textValue(raw);
        return { key, label: t(`aiSkills.fields.${key}`), value };
      })
      .filter((row) => row.value);
  });

  function textValue(value: unknown) {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  }

  function priorityLabel(value: unknown) {
    const priority = Number(value);
    return t(`aiSkills.todo.priority${priority === 0 || priority === 2 ? priority : 1}`);
  }

  function sourceCitation(candidate: UnknownRecord) {
    const value = Number(candidate.sourceCitation);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  function candidateKey(candidate: UnknownRecord, index: number) {
    return `${index}:${textValue(candidate.title)}:${sourceCitation(candidate) || ''}`;
  }
</script>

<style scoped lang="less">
  .ai-skill-result__markdown {
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.75;
  }

  .ai-skill-result__markdown :deep(:first-child) {
    margin-top: 0;
  }

  .ai-skill-result__markdown :deep(:last-child) {
    margin-bottom: 0;
  }

  .ai-skill-result__artifact,
  .ai-skill-result__text,
  .ai-skill-result__card {
    display: grid;
    min-width: 0;
    gap: 10px;
  }

  .ai-skill-result__text p,
  .ai-skill-result__description,
  .ai-skill-result__candidates p {
    margin: 0;
    white-space: pre-wrap;
  }

  .ai-skill-result__card > h3,
  .ai-skill-result__candidates h3 {
    margin: 0;
    font-size: 15px;
    line-height: 1.5;
  }

  .ai-skill-result__card > small {
    color: var(--desc-color);
    font-size: 12px;
  }

  .ai-skill-result__fields,
  .ai-skill-result__meta {
    display: grid;
    margin: 0;
    gap: 8px 14px;
  }

  .ai-skill-result__fields {
    grid-template-columns: max-content minmax(0, 1fr);
  }

  .ai-skill-result__fields dt,
  .ai-skill-result__meta dt {
    color: var(--desc-color);
    font-size: 12px;
  }

  .ai-skill-result__fields dd,
  .ai-skill-result__meta dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .ai-skill-result__meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ai-skill-result__meta > div {
    display: grid;
    gap: 3px;
    padding: 8px 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--card-background);
  }

  .ai-skill-result__checklist {
    display: grid;
    gap: 6px;
  }

  .ai-skill-result__checklist ol,
  .ai-skill-result__candidates {
    margin: 0;
    padding-left: 22px;
  }

  .ai-skill-result__checklist li {
    padding: 2px 0;
    line-height: 1.55;
  }

  .ai-skill-result__candidates {
    display: grid;
    gap: 9px;
  }

  .ai-skill-result__candidates > li {
    padding: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: var(--card-background);
  }

  .ai-skill-result__candidate-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    margin-top: 7px;
    color: var(--desc-color);
    font-size: 12px;
  }

  .ai-skill-result__unsupported {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
  }

  @media (max-width: 720px) {
    .ai-skill-result__meta {
      grid-template-columns: 1fr;
    }
  }
</style>
