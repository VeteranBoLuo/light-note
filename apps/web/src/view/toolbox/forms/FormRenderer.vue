<template>
  <form class="collection-renderer" novalidate @submit.prevent="submit">
    <header
      ><h1>{{ definition.title }}</h1
      ><p class="collection-description">{{ definition.description }}</p></header
    >
    <section
      v-for="(q, index) in definition.questions"
      :key="q.id"
      :ref="
        (el) => {
          if (el) fields[q.id] = el as HTMLElement;
        }
      "
      class="collection-question"
      tabindex="-1"
      :aria-label="q.title"
    >
      <h3
        ><label
          :for="
            q.allowOther && selectedOptions(q.id).includes(OTHER_OPTION_ID)
              ? `collection-other-${q.id}`
              : `collection-question-${q.id}`
          "
          >{{ index + 1 }}. {{ q.title }}</label
        >
        <span v-if="q.required" class="collection-required">{{ t('collectionForms.requiredSuffix') }}</span></h3
      >
      <BRadio
        v-if="q.type === 'single' || q.type === 'rating'"
        :value="q.type === 'rating' ? String(answers[q.id] ?? '') : selectedOptions(q.id)[0] || ''"
        :options="q.type === 'rating' ? ratings : choiceOptions(q)"
        vertical
        :aria-label="q.title"
        @update:value="q.type === 'rating' ? (answers[q.id] = $event) : setChoice(q, [$event])"
      />
      <div v-else-if="q.type === 'multiple'" class="collection-options"
        ><BCheckbox
          v-for="o in choiceOptions(q)"
          :key="o.value"
          :model-value="selectedOptions(q.id).includes(o.value)"
          @update:model-value="toggle(q, o.value, $event)"
          >{{ o.label }}</BCheckbox
        ></div
      >
      <BDateTimePicker
        v-else-if="q.type === 'date'"
        :value="String(answers[q.id] ?? '')"
        :aria-label="q.title"
        :show-time="true"
        @update:value="answers[q.id] = $event"
      />
      <BInput
        v-else
        :id="`collection-question-${q.id}`"
        :value="answers[q.id] as string | number"
        :type="q.type === 'long' ? 'textarea' : q.type === 'number' ? 'number' : 'text'"
        :aria-label="q.title"
        :maxlength="q.type === 'long' ? 5000 : 500"
        @update:value="answers[q.id] = $event ?? ''"
      />
      <BInput
        v-if="q.allowOther && selectedOptions(q.id).includes(OTHER_OPTION_ID)"
        :id="`collection-other-${q.id}`"
        :value="choiceAnswerParts(answers[q.id]).otherText || ''"
        :maxlength="FORM_LIMITS.short"
        :aria-label="t('collectionForms.otherAnswerFor', { title: q.title })"
        :placeholder="t('collectionForms.otherPlaceholder')"
        @update:value="updateOther(q, String($event ?? ''))"
      />
      <p v-if="fieldError === q.id" class="collection-error" role="alert">{{ error }}</p>
    </section>
    <p v-if="error && !fieldError" class="collection-error" role="alert">{{ error }}</p>
    <p v-if="preview" class="collection-muted">{{ t('collectionForms.previewHint') }}</p>
    <BButton v-else type="primary" :loading="busy" native-type="submit">{{
      busy ? t('collectionForms.submitting') : submitLabel || t('collectionForms.submit')
    }}</BButton>
  </form>
</template>
<script setup lang="ts">
  import './forms.css';
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n();
  import { reactive, ref } from 'vue';
  import {
    validateAnswers,
    FormError,
    type FormDefinition,
    type FormAnswers,
    type FormQuestion,
    choiceAnswerParts,
    OTHER_OPTION_ID,
    FORM_LIMITS,
  } from '@lightnote/shared/collection-forms';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BRadio from '@/components/base/BasicComponents/BRadio.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  const props = defineProps<{
    definition: FormDefinition;
    preview?: boolean;
    busy?: boolean;
    initialAnswers?: FormAnswers;
    submitLabel?: string;
  }>();
  const emit = defineEmits<{ submit: [answers: FormAnswers] }>();
  const answers = reactive<FormAnswers>(
      props.preview
        ? {}
        : (Object.fromEntries(
            Object.entries(JSON.parse(JSON.stringify(props.initialAnswers || {}))).filter(([id]) =>
              props.definition.questions.some((q) => q.id === id),
            ),
          ) as FormAnswers),
    ),
    error = ref(''),
    fieldError = ref(''),
    fields: Record<string, HTMLElement> = {};
  defineExpose({ getAnswers: (): FormAnswers => JSON.parse(JSON.stringify(answers)) });
  const ratings = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: t('collectionForms.score', { score: n }) }));
  function choiceOptions(q: FormQuestion) {
    return [
      ...q.options.map((o) => ({ value: o.id, label: o.label })),
      ...(q.allowOther ? [{ value: OTHER_OPTION_ID, label: t('collectionForms.otherOption') }] : []),
    ];
  }
  function selectedOptions(id: string) {
    const { optionIds, otherText } = choiceAnswerParts(answers[id]);
    return [...optionIds, ...(otherText !== null ? [OTHER_OPTION_ID] : [])];
  }
  function setChoice(q: FormQuestion, selected: string[]) {
    const otherSelected = q.allowOther && selected.includes(OTHER_OPTION_ID);
    const optionIds = q.allowOther ? selected.filter((id) => id !== OTHER_OPTION_ID) : selected;
    answers[q.id] = otherSelected
      ? { optionIds, otherText: choiceAnswerParts(answers[q.id]).otherText || '' }
      : q.type === 'single'
        ? optionIds[0] || ''
        : optionIds;
    refreshError(q);
  }
  function updateOther(q: FormQuestion, otherText: string) {
    answers[q.id] = { optionIds: choiceAnswerParts(answers[q.id]).optionIds, otherText };
    refreshError(q);
  }
  function showError(e: unknown) {
    const code = (e as FormError).code;
    error.value =
      code === 'otherRequired' || code === 'otherTooLong' ? t('collectionForms.' + code) : (e as Error).message;
    fieldError.value = (e as FormError).field || '';
  }
  function refreshError(q: FormQuestion) {
    if (fieldError.value !== q.id) return;
    try {
      validateAnswers({ ...props.definition, questions: [q] }, { [q.id]: answers[q.id] });
      error.value = '';
      fieldError.value = '';
    } catch (e) {
      showError(e);
    }
  }
  function toggle(q: FormQuestion, option: string, checked: boolean) {
    const values = selectedOptions(q.id);
    setChoice(q, checked ? [...values, option] : values.filter((v) => v !== option));
  }
  function submit() {
    if (props.preview || props.busy) return;
    error.value = '';
    fieldError.value = '';
    try {
      emit('submit', validateAnswers(props.definition, answers));
    } catch (e) {
      showError(e);
      fields[fieldError.value]?.focus();
    }
  }
</script>

<style scoped>
  .collection-question {
    padding: var(--ui-space-20, 20px);
    border: 1px solid var(--workspace-border);
    border-radius: var(--ui-space-12, 12px);
    background: var(--workspace-content);
  }
  .collection-renderer,
  .collection-options {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-16, 16px);
  }
  .collection-question h3 {
    font-size: var(--ui-font-14, 14px);
    margin: 0 0 var(--ui-space-12, 12px);
  }
  .collection-required {
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }

  .collection-question {
    box-sizing: border-box;
  }
  .collection-renderer header {
    padding: var(--ui-space-8, 8px) 0;
  }
  .collection-question h3 {
    overflow-wrap: anywhere;
  }
  .collection-renderer .collection-question {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-16, 16px);
  }
  .collection-renderer .collection-question > h3 {
    margin: 0;
  }
  .collection-renderer .collection-question :deep(.b-datetime-trigger) {
    width: 100%;
    justify-content: flex-start;
  }
</style>
