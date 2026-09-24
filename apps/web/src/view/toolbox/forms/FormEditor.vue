<template>
  <div ref="editorRoot" class="collection-stack collection-question-editor">
    <p v-if="locked" class="collection-muted">{{ t('collectionForms.lockedHint') }}</p>
    <section
      v-for="(q, index) in model.questions"
      :key="q.id"
      :data-question-id="q.id"
      class="collection-card collection-stack collection-edit-question"
      :class="{ 'is-expanded': expanded === q.id }"
    >
      <div class="collection-question-head">
        <BButton
          type="text"
          class="collection-question-toggle"
          :aria-expanded="expanded === q.id"
          @click="expanded = expanded === q.id ? '' : q.id"
        >
          <span class="collection-question-number">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="collection-question-caption"
            ><strong>{{ expanded === q.id ? t(typeLabels[q.type]) : q.title }}</strong
            ><small v-if="expanded !== q.id"
              >{{ t(typeLabels[q.type]) }} ·
              {{ t(q.required ? 'collectionForms.required' : 'collectionForms.optional') }}</small
            ></span
          >
          <span>{{ t(expanded === q.id ? 'collectionForms.collapse' : 'collectionForms.expand') }}</span>
        </BButton>
        <BCheckbox v-if="expanded === q.id" v-model="q.required" :disabled="locked">{{
          t('collectionForms.required')
        }}</BCheckbox>
      </div>
      <template v-if="expanded === q.id">
        <BInput
          v-model:value="q.title"
          :disabled="locked"
          :maxlength="500"
          :aria-label="t('collectionForms.questionTitle')"
        />
        <div v-for="(option, oi) in q.options" :key="option.id" class="collection-row collection-option-edit"
          ><span
            class="collection-option-marker"
            :class="{ 'is-multiple': q.type === 'multiple' }"
            aria-hidden="true"
          ></span
          ><BInput
            v-model:value="option.label"
            :disabled="locked"
            :maxlength="300"
            :aria-label="t('collectionForms.optionIndex', { index: oi + 1 })"
          /><BButton
            v-if="!locked"
            type="text"
            class="collection-option-remove"
            :aria-label="t('collectionForms.remove') + t('collectionForms.optionIndex', { index: oi + 1 })"
            :disabled="q.options.length <= 2"
            @click="q.options.splice(oi, 1)"
            >−</BButton
          ></div
        >
        <BButton
          type="text"
          class="collection-option-add"
          v-if="!locked && ['single', 'multiple'].includes(q.type)"
          :disabled="q.options.length >= 30"
          @click="q.options.push({ id: cryptoId(), label: t('collectionForms.newOption') })"
          >{{ t('collectionForms.addOption') }}</BButton
        >
        <div v-if="!locked" class="collection-question-actions">
          <BButton type="text" :disabled="index === 0" @click="move(index, -1)">{{
            t('collectionForms.moveUp')
          }}</BButton>
          <BButton type="text" :disabled="index === model.questions.length - 1" @click="move(index, 1)">{{
            t('collectionForms.moveDown')
          }}</BButton>
          <BButton type="text" :disabled="model.questions.length >= 50" @click="copy(index)">{{
            t('collectionForms.copy')
          }}</BButton>
          <BButton type="text" @click="model.questions.splice(index, 1)">{{ t('collectionForms.delete') }}</BButton>
        </div>
      </template>
    </section>
    <div v-if="!locked" class="collection-add-question" @keydown.esc.stop="closePicker">
      <BButton
        class="collection-add-trigger"
        :disabled="model.questions.length >= 50"
        :aria-expanded="pickerOpen"
        @click="togglePicker"
        >＋ {{ t('collectionForms.addQuestion') }}</BButton
      >
      <div
        v-if="pickerOpen"
        ref="pickerRoot"
        class="collection-type-picker collection-card"
        role="group"
        :aria-label="t('collectionForms.questionType')"
      >
        <div class="collection-row"
          ><strong>{{ t('collectionForms.chooseQuestionType') }}</strong
          ><BButton type="text" @click="closePicker">{{ t('common.close') }}</BButton></div
        >
        <div class="collection-type-grid">
          <BButton v-for="(label, type) in typeLabels" :key="type" class="collection-type-choice" @click="add(type)"
            ><strong>{{ t(label) }}</strong
            ><small>{{ t('collectionForms.typeHint.' + type) }}</small></BButton
          >
        </div>
      </div>
      <span class="collection-muted collection-question-count">{{
        t('collectionForms.questionLimit', { count: model.questions.length })
      }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
  import './forms.css';
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n();
  import { ref, watch, nextTick } from 'vue';
  import { scrollIntoContainer } from '@/utils/scrolling';
  import type { FormDefinition, QuestionType } from '@lightnote/shared/collection-forms';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import { typeLabels } from './api';
  const model = defineModel<FormDefinition>({ required: true });
  const props = defineProps<{ locked: boolean }>();
  const cryptoId = () => crypto.randomUUID();
  const editorRoot = ref<HTMLElement>(),
    pickerRoot = ref<HTMLElement>(),
    pickerOpen = ref(false);
  async function togglePicker() {
    pickerOpen.value = !pickerOpen.value;
    if (pickerOpen.value) {
      await nextTick();
      pickerRoot.value?.querySelector<HTMLButtonElement>('.collection-type-choice')?.focus({ preventScroll: true });
      reveal(pickerRoot.value);
    }
  }
  function closePicker() {
    pickerOpen.value = false;
    editorRoot.value?.querySelector<HTMLButtonElement>('.collection-add-trigger')?.focus({ preventScroll: true });
  }
  function reveal(element?: HTMLElement) {
    const container = editorRoot.value?.closest<HTMLElement>('.collection-detail');
    if (!container || !element) return;
    const header = container.querySelector<HTMLElement>('.collection-editor-header');
    scrollIntoContainer(
      container,
      element,
      (header?.getBoundingClientRect().height || 0) + (parseFloat(getComputedStyle(container).paddingTop) || 0),
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    );
  }
  async function focusQuestion(id: string) {
    await nextTick();
    const card = Array.from(editorRoot.value?.querySelectorAll<HTMLElement>('[data-question-id]') || []).find(
      (el) => el.dataset.questionId === id,
    );
    const input = card?.querySelector<HTMLInputElement>('input:not([type="checkbox"])');
    input?.focus({ preventScroll: true });
    input?.select();
    reveal(card);
  }
  const expanded = ref(model.value.questions[0]?.id || '');
  watch(
    () => model.value.questions,
    (questions) => {
      if (!questions.some((q) => q.id === expanded.value)) expanded.value = questions[0]?.id || '';
    },
  );
  function add(type: QuestionType) {
    if (props.locked || model.value.questions.length >= 50) return;
    model.value.questions.push({
      id: cryptoId(),
      type,
      title: t('collectionForms.newQuestion'),
      required: false,
      options: ['single', 'multiple'].includes(type)
        ? [
            { id: cryptoId(), label: t('collectionForms.option1') },
            { id: cryptoId(), label: t('collectionForms.option2') },
          ]
        : [],
    });
    expanded.value = model.value.questions.at(-1)!.id;
    pickerOpen.value = false;
    void focusQuestion(expanded.value);
  }
  function move(index: number, delta: number) {
    const q = model.value.questions.splice(index, 1)[0];
    model.value.questions.splice(index + delta, 0, q);
  }
  function copy(index: number) {
    const q = JSON.parse(JSON.stringify(model.value.questions[index]));
    q.id = cryptoId();
    q.options = q.options.map((o: any) => ({ ...o, id: cryptoId() }));
    model.value.questions.splice(index + 1, 0, q);
    expanded.value = q.id;
    void focusQuestion(q.id);
  }
</script>

<style scoped>
  .collection-edit-question {
    position: relative;
    padding: var(--ui-space-16, 16px);
  }
  .collection-edit-question.is-expanded {
    border-color: var(--workspace-purple-text);
  }
  .collection-question-toggle.b_btn {
    display: flex;
    width: 100%;
    height: auto;
    padding: 0;
    text-align: left;
    white-space: normal;
    gap: var(--ui-space-12, 12px);
    color: var(--workspace-text);
    background: transparent;
  }
  .collection-question-number {
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-18, 18px);
    align-self: flex-start;
  }
  .collection-question-caption {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
    min-width: 0;
  }
  .collection-question-caption small,
  .collection-question-toggle > span:last-child {
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }
  .collection-question-actions {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border-top: 1px solid var(--workspace-divider);
    padding-top: var(--ui-space-8, 8px);
  }
  .collection-question-actions .b_btn {
    padding-inline: var(--ui-space-4, 4px);
  }
  .collection-edit-question.is-expanded {
    border-color: var(--workspace-border);
    box-shadow: inset 3px 0 var(--workspace-purple-text);
  }
  .collection-question-editor {
    gap: var(--ui-space-12, 12px);
  }
  .collection-question-head {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
  }
  .collection-question-head .collection-question-toggle {
    flex: 1;
    min-width: 0;
  }
  .collection-question-head > :last-child {
    flex-shrink: 0;
  }
  .collection-edit-question {
    gap: var(--ui-space-12, 12px);
  }
  .collection-question-head .collection-question-caption small {
    line-height: 1.4;
  }
  .collection-option-edit {
    gap: var(--ui-space-8, 8px);
  }
  .collection-option-marker {
    width: var(--ui-layout-16, 16px);
    height: var(--ui-layout-16, 16px);
    border: 1px solid var(--workspace-muted);
    border-radius: 50%;
    flex: none;
  }
  .collection-option-marker.is-multiple {
    border-radius: var(--ui-space-4, 4px);
  }
  .collection-option-remove.b_btn {
    min-width: var(--ui-control-32, 32px);
    width: var(--ui-control-32, 32px);
    padding: 0;
    font-size: var(--ui-font-20, 20px);
    color: var(--workspace-muted);
  }
  .collection-option-add.b_btn {
    padding-inline: 0;
    justify-content: flex-start;
  }
  .collection-question-actions {
    gap: var(--ui-space-4, 4px);
  }
  .collection-question-actions .b_btn {
    color: var(--workspace-muted);
  }
  .collection-add-question {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-12, 12px);
  }
  .collection-add-trigger.b_btn {
    width: 100%;
    border: 1px dashed var(--workspace-border);
    background: var(--workspace-content);
    color: var(--workspace-purple-text);
    min-height: var(--ui-control-40, 40px);
  }
  .collection-add-trigger.b_btn:hover {
    border-color: var(--workspace-purple-text);
  }
  .collection-question-count {
    text-align: right;
  }
  .collection-type-picker {
    padding: var(--ui-space-12, 12px);
    animation: collection-picker-in 140ms ease-out;
  }
  .collection-type-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-8, 8px);
  }
  .collection-type-choice.b_btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-space-4, 4px);
    width: 100%;
    height: auto;
    white-space: normal;
    text-align: left;
    padding: var(--ui-space-12, 12px);
    border: 1px solid var(--workspace-border);
    background: var(--workspace-content);
    color: var(--workspace-text);
  }
  .collection-type-choice small {
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }
  .collection-type-choice.b_btn:hover,
  .collection-type-choice.b_btn:focus-visible {
    border-color: var(--workspace-purple-text);
    background: var(--workspace-hover);
  }
  @keyframes collection-picker-in {
    from {
      opacity: 0;
      transform: translateY(var(--ui-space-4, 4px));
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .collection-type-picker {
      animation: none;
    }
  }
  @media (max-width: 768px) {
    .collection-type-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .collection-question-head {
      gap: var(--ui-space-8, 8px);
    }
  }
  .collection-question-toggle.b_btn,
  .collection-type-choice.b_btn {
    line-height: 1.5;
  }
  .collection-question-count {
    text-align: center;
  }
</style>
