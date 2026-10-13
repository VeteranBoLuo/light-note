<template>
  <BModal
    :visible="true"
    :title="t(editing ? 'noteMath.editTitle' : 'noteMath.insertTitle')"
    width="min(var(--ui-layout-720, 720px), calc(100vw - var(--ui-space-24, 24px)))"
    :mask-closable="false"
    :show-footer="false"
    initial-focus="#note-math-source"
    @close="emit('close')"
  >
    <div class="note-math-dialog">
      <BTabs v-model:active-tab="mode" :options="modes" variant="segment" />
      <p class="note-math-dialog__hint">{{ t(mode === 'block' ? 'noteMath.blockHint' : 'noteMath.inlineHint') }}</p>
      <label for="note-math-source">{{ t('noteMath.source') }}</label>
      <BInput
        id="note-math-source"
        v-model:value="source"
        type="textarea"
        :rows="4"
        :maxlength="NOTE_MATH_MAX_LENGTH"
        :placeholder="t('noteMath.placeholder')"
        class="note-math-dialog__source"
      />
      <div class="note-math-dialog__examples">
        <span>{{ t('noteMath.examples') }}</span>
        <BButton v-for="example in examples" :key="example.key" size="small" @click="source = example.source">
          {{ t(`noteMath.${example.key}`) }}
        </BButton>
      </div>
      <label>{{ t('noteMath.preview') }}</label>
      <div class="note-math-dialog__preview" aria-live="polite">
        <BLoading v-if="loading" inline loading :title="t('common.loading')" />
        <p v-else-if="!source.trim()" class="note-math-dialog__hint">{{ t('noteMath.empty') }}</p>
        <p v-else-if="error" class="note-math-dialog__error" role="alert">{{ t('noteMath.invalid') }}</p>
        <div v-else class="ln-math" :data-ln-math="mode" v-html="preview"></div>
      </div>
      <p v-if="saveError" class="note-math-dialog__error" role="alert">{{ saveError }}</p>
      <div class="note-math-dialog__footer">
        <span class="note-math-dialog__hint">{{ t('noteMath.editHint') }}</span>
        <BButton @click="emit('close')">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :disabled="loading || error || !source.trim()" @click="emit('apply', { source, mode })">
          {{ t(editing ? 'noteMath.save' : 'noteMath.insertTitle') }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { NOTE_MATH_MAX_LENGTH, type NoteMathMode } from '@lightnote/shared/note-math';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { loadNoteMathRuntime } from '@/utils/noteMath';
  const props = defineProps<{
    initialSource: string;
    initialMode: NoteMathMode;
    editing: boolean;
    saveError?: string;
  }>();
  const emit = defineEmits<{ close: []; apply: [value: { source: string; mode: NoteMathMode }] }>();
  const { t } = useI18n();
  const source = ref(props.initialSource);
  const mode = ref<NoteMathMode>(props.initialMode);
  const preview = ref('');
  const error = ref(false);
  const loading = ref(false);
  const modes = computed(() => [
    { key: 'inline', label: t('noteMath.inline') },
    { key: 'block', label: t('noteMath.block') },
  ]);
  const examples = [
    { key: 'scripts', source: String.raw`x^{2}+y_{1}` },
    { key: 'fraction', source: String.raw`\frac{-b\pm\sqrt{b^2-4ac}}{2a}` },
    { key: 'sum', source: String.raw`\sum_{i=1}^{n} i = \frac{n(n+1)}{2}` },
    { key: 'matrix', source: String.raw`\begin{bmatrix}a&b\\c&d\end{bmatrix}` },
  ];
  watch(
    [source, mode],
    ([value, nextMode], _old, onCleanup) => {
      let cancelled = false;
      loading.value = Boolean(value.trim());
      error.value = false;
      preview.value = '';
      const timer = window.setTimeout(async () => {
        if (!value.trim()) {
          loading.value = false;
          return;
        }
        try {
          const runtime = await loadNoteMathRuntime();
          if (cancelled) return;
          const result = runtime.renderNoteMathSource(value, nextMode);
          preview.value = result.html;
          error.value = result.error;
        } catch {
          if (!cancelled) error.value = true;
        } finally {
          if (!cancelled) loading.value = false;
        }
      }, 100);
      onCleanup(() => {
        cancelled = true;
        window.clearTimeout(timer);
      });
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .note-math-dialog {
    display: grid;
    gap: var(--ui-space-12, 12px);
  }
  .note-math-dialog__hint {
    margin: 0;
    color: var(--sub-text-color);
    font-size: var(--ui-font-12, 12px);
  }
  .note-math-dialog__source :deep(textarea) {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  .note-math-dialog__examples {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  .note-math-dialog__preview {
    min-height: var(--ui-layout-96, 96px);
    padding: var(--ui-space-12, 12px);
    display: grid;
    align-items: center;
    min-width: 0;
    overflow: auto;
    border: 1px solid var(--border-color);
    border-radius: 8px;
  }
  .note-math-dialog__error {
    color: var(--error-color, #dc2626);
    margin: 0;
    border-left: 2px solid currentColor;
    padding-left: var(--ui-space-8, 8px);
  }
  .note-math-dialog__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-8, 8px);
  }
  .note-math-dialog__footer .note-math-dialog__hint {
    flex: 1 1 40%;
  }
</style>
