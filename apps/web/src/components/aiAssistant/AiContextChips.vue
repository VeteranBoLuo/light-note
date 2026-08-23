<template>
  <div v-if="modelValue.length || scopeModelValue.length" class="ai-context-chips">
    <BButton
      v-for="item in modelValue"
      :key="`${item.type}:${item.id}`"
      size="small"
      class="ai-context-chip"
      :title="`${item.title} · ${t('ai.material.onceTooltip')}`"
      :aria-label="t('ai.contextLens.removeMaterial')"
      @click="remove(item)"
    >
      <SvgIcon :src="resourceIcon(item.type)" size="12" aria-hidden="true" />
      <span class="ai-context-chip__title">{{ item.title }}</span>
      <span class="ai-context-chip__once">{{ t('ai.material.once') }}</span>
      <SvgIcon class="ai-context-chip__x" :src="icon.common.close" size="10" aria-hidden="true" />
    </BButton>
    <BButton
      v-for="item in scopeModelValue"
      :key="`${item.type}:${item.id}`"
      size="small"
      class="ai-context-chip ai-context-chip--scope"
      :title="t('ai.scope.scopeTooltip')"
      :aria-label="t('ai.scope.removeScope')"
      @click="removeScope(item)"
    >
      <SvgIcon :src="icon.noteTree.root" size="12" aria-hidden="true" />
      <span class="ai-context-chip__scope-label">{{ t('ai.scope.directory') }}</span>
      <span class="ai-context-chip__title">{{ item.title }}</span>
      <span class="ai-context-chip__once">
        {{ t('ai.scope.pageCount', { count: item.estimatedResourceCount || 1 }) }}
      </span>
      <SvgIcon class="ai-context-chip__x" :src="icon.common.close" size="10" aria-hidden="true" />
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import type { GlobalSearchType } from '@/api/search';
  import type { AiResourceContext, AiScopeRef } from '@/types/aiScope';

  const props = withDefaults(
    defineProps<{
      modelValue: AiResourceContext[];
      scopeModelValue?: AiScopeRef[];
    }>(),
    { scopeModelValue: () => [] },
  );
  const emit = defineEmits<{
    'update:modelValue': [value: AiResourceContext[]];
    'update:scopeModelValue': [value: AiScopeRef[]];
  }>();
  const { t } = useI18n();

  function resourceIcon(type: GlobalSearchType) {
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    if (type === 'tag') return icon.resource.tag;
    if (type === 'todo') return icon.contextMenu.inbox;
    return icon.resource.bookmark;
  }

  function remove(item: AiResourceContext) {
    emit(
      'update:modelValue',
      props.modelValue.filter((value) => value.type !== item.type || value.id !== item.id),
    );
  }

  function removeScope(item: AiScopeRef) {
    emit(
      'update:scopeModelValue',
      props.scopeModelValue.filter((value) => value.type !== item.type || value.id !== item.id),
    );
  }
</script>

<style scoped lang="less">
  .ai-context-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    min-width: 0;
  }

  .ai-context-chips :deep(.b_btn) {
    gap: 4px;
    width: auto;
    max-width: 100%;
    height: auto;
    min-height: 26px;
    padding: 2px 7px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 32%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background));
    color: var(--primary-color);
    font-weight: 500;
  }

  .ai-context-chips :deep(.ai-context-chip--scope) {
    border-color: var(--resource-note-color);
    color: var(--resource-note-color);
    font-weight: 600;
  }

  .ai-context-chip__title {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ai-context-chip__once {
    flex: 0 0 auto;
    padding: 0 5px;
    border-radius: 999px;
    background: color-mix(in srgb, currentColor 12%, transparent);
    font-size: 10px;
    line-height: 16px;
    opacity: 0.86;
  }

  .ai-context-chip__scope-label {
    flex: 0 0 auto;
    font-size: 10px;
    font-weight: 700;
  }

  .ai-context-chip__x {
    flex: 0 0 auto;
    opacity: 0.58;
  }

  @media (max-width: 767px) {
    .ai-context-chips {
      width: 100%;
      gap: 6px;
    }

    .ai-context-chip__title {
      max-width: min(42vw, 180px);
    }
  }

  html.light-note-mobile-rendering .ai-context-chips :deep(.b_btn) {
    border-color: var(--primary-color);
    background: var(--card-background);
    color: var(--primary-color);
  }
</style>
