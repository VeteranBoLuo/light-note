<template>
  <BSelect
    class="markdown-code-language-picker"
    :value="language"
    :options="options"
    :aria-label="t('noteDetail.editor.codeLanguage')"
    @update:value="emit('change', $event)"
  />
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import { CODE_LANGUAGES } from '@/config/codeLanguages';

  const props = defineProps<{ language: string }>();
  const emit = defineEmits<{ change: [value: unknown] }>();
  const { t } = useI18n();
  const options = computed(() => {
    const items = CODE_LANGUAGES.map((item) => ({ value: item.value, label: item.text }));
    if (!items.some((item) => item.value === props.language)) {
      items.push({ value: props.language, label: props.language });
    }
    return items;
  });
</script>

<style scoped lang="less">
  .markdown-code-language-picker {
    width: var(--ui-layout-124, 124px);
    font-family: var(--app-font-family);
    :deep(.select-trigger) {
      height: var(--ui-control-32, 32px);
      min-height: var(--ui-control-32, 32px);
      padding: 0 var(--ui-space-7, 7px);
      border-color: transparent;
      background: var(--surface-page-bg, var(--background-color));
      box-shadow: none;
    }
    :deep(.select-trigger:hover),
    &.is-open :deep(.select-trigger) {
      border-color: var(--workspace-border);
      background: var(--workspace-hover);
    }
    :deep(.select-trigger:focus-visible) {
      border-color: var(--primary-color);
    }
    :deep(.select-text) {
      font-size: var(--ui-font-12, 12px);
      color: var(--workspace-muted);
    }
  }
</style>
