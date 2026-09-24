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
        ><label :for="`collection-question-${q.id}`">{{ index + 1 }}. {{ q.title }}</label>
        <span v-if="q.required" class="collection-required">{{ t('collectionForms.requiredSuffix') }}</span></h3
      >
      <BRadio
        v-if="q.type === 'single' || q.type === 'rating'"
        :value="String(answers[q.id] ?? '')"
        :options="q.type === 'rating' ? ratings : q.options.map((o) => ({ value: o.id, label: o.label }))"
        vertical
        :aria-label="q.title"
        @update:value="answers[q.id] = $event"
      />
      <div v-else-if="q.type === 'multiple'" class="collection-options"
        ><BCheckbox
          v-for="o in q.options"
          :key="o.id"
          :model-value="Array.isArray(answers[q.id]) && (answers[q.id] as string[]).includes(o.id)"
          @update:model-value="toggle(q.id, o.id, $event)"
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
      <p v-if="fieldError === q.id" class="collection-error" role="alert">{{ error }}</p>
    </section>
    <p v-if="error && !fieldError" class="collection-error" role="alert">{{ error }}</p>
    <p v-if="preview" class="collection-muted">{{ t('collectionForms.previewHint') }}</p>
    <BButton v-else type="primary" :disabled="busy" native-type="submit">{{
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
  const answers = reactive<FormAnswers>(props.preview ? {} : JSON.parse(JSON.stringify(props.initialAnswers || {}))),
    error = ref(''),
    fieldError = ref(''),
    fields: Record<string, HTMLElement> = {};
  const ratings = [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: t('collectionForms.score', { score: n }) }));
  function toggle(id: string, option: string, checked: boolean) {
    const values = Array.isArray(answers[id]) ? (answers[id] as string[]) : [];
    answers[id] = checked ? [...values, option] : values.filter((v) => v !== option);
  }
  function submit() {
    if (props.preview || props.busy) return;
    error.value = '';
    fieldError.value = '';
    try {
      emit('submit', validateAnswers(props.definition, answers));
    } catch (e) {
      error.value = (e as Error).message;
      fieldError.value = (e as FormError).field || '';
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
