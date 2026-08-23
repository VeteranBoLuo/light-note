<template>
  <div class="ai-context-picker" :class="{ 'is-inline': inline }">
    <AiContextChips
      v-if="showSelection"
      :model-value="modelValue"
      :scope-model-value="scopeModelValue"
      @update:model-value="emit('update:modelValue', $event)"
      @update:scope-model-value="emit('update:scopeModelValue', $event)"
    />
    <ResourcePickerPanel
      v-if="inline"
      :allowed-types="allowedTypes"
      :pinned-items="currentPageContext ? [currentPageContext] : []"
      :include-note-scopes="aiBranchScopeEnabled"
      :selected-resource-keys="selectedResourceKeys"
      :selected-scope-keys="selectedScopeKeys"
      :resources-disabled="modelValue.length >= 5"
      :scopes-disabled="scopeModelValue.length >= MAX_AI_SCOPE_REFS"
      @select="add"
      @select-scope="addScope"
      @close="emit('close')"
    />
    <BPopover
      v-else
      v-model:open="open"
      trigger="click"
      placement="top-left"
      overlay-class-name="ai-context-popover"
    >
      <slot name="trigger">
        <BButton size="small" class="ai-context-trigger">@ {{ t('ai.addContext') }}</BButton>
      </slot>
      <template #content>
        <ResourcePickerPanel
          :allowed-types="allowedTypes"
          :pinned-items="currentPageContext ? [currentPageContext] : []"
          :include-note-scopes="aiBranchScopeEnabled"
          :selected-resource-keys="selectedResourceKeys"
          :selected-scope-keys="selectedScopeKeys"
          :resources-disabled="modelValue.length >= 5"
          :scopes-disabled="scopeModelValue.length >= MAX_AI_SCOPE_REFS"
          @select="add"
          @select-scope="addScope"
          @close="open = false"
        />
      </template>
    </BPopover>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import AiContextChips from './AiContextChips.vue';
  import { useCurrentPageResource } from '@/composables/useCurrentPageResource';
  import type { ResourcePickerItem, ResourcePickerType } from '@/composables/useResourcePickerSearch';
  import { MAX_AI_SCOPE_REFS, type AiResourceContext, type AiScopeRef } from '@/types/aiScope';
  import { fetchNoteTreeFeatures } from '@/api/noteTree';
  import { recordNoteTreeProductEvent } from '@/api/noteTreeTelemetry';

  const props = withDefaults(
    defineProps<{
      modelValue: AiResourceContext[];
      scopeModelValue?: AiScopeRef[];
      inline?: boolean;
      showSelection?: boolean;
    }>(),
    { scopeModelValue: () => [], inline: false, showSelection: true },
  );
  defineSlots<{ trigger(): unknown }>();
  const emit = defineEmits<{
    'update:modelValue': [value: AiResourceContext[]];
    'update:scopeModelValue': [value: AiScopeRef[]];
    fileSelected: [value: AiResourceContext];
    close: [];
  }>();
  const { t } = useI18n();
  const open = ref(false);
  const aiBranchScopeEnabled = ref(false);
  const allowedTypes: ResourcePickerType[] = ['bookmark', 'note', 'file', 'tag'];

  // 推导逻辑与 @ 浮层共用,避免两处口径漂移
  const currentPageContext = useCurrentPageResource();
  const selectedResourceKeys = computed(() => props.modelValue.map((item) => `${item.type}:${item.id}`));
  const selectedScopeKeys = computed(() => props.scopeModelValue.map((item) => `${item.type}:${item.id}`));

  function add(item: ResourcePickerItem) {
    if (item.type === 'file') {
      emit('fileSelected', item);
      if (!props.inline) open.value = false;
      return;
    }
    if (selectedResourceKeys.value.includes(`${item.type}:${item.id}`) || props.modelValue.length >= 5) return;
    emit('update:modelValue', [...props.modelValue, { type: item.type, id: item.id, title: item.title }]);
    if (!props.inline) open.value = false;
  }
  function addScope(item: AiScopeRef) {
    if (
      !aiBranchScopeEnabled.value ||
      item.type !== 'note_branch' ||
      selectedScopeKeys.value.includes(`${item.type}:${item.id}`) ||
      props.scopeModelValue.length >= MAX_AI_SCOPE_REFS
    )
      return;
    emit('update:scopeModelValue', [
      ...props.scopeModelValue,
      {
        type: 'note_branch',
        id: item.id,
        title: item.title,
        estimatedResourceCount: Math.max(1, Number(item.estimatedResourceCount || 1)),
      },
    ]);
    const subtreeSize = Math.max(1, Number(item.estimatedResourceCount || 1));
    void recordNoteTreeProductEvent('note_branch_ai_selected', {
      surface: 'ai',
      childCount: Math.max(0, subtreeSize - 1),
      subtreeSize,
      result: 'success',
    });
    if (!props.inline) open.value = false;
  }
  function closePopover() {
    open.value = false;
  }
  onMounted(() => {
    window.addEventListener('light-note:close-ai-overlays', closePopover);
    void fetchNoteTreeFeatures()
      .then((features) => {
        aiBranchScopeEnabled.value = features.ai_note_branch_scope;
        if (!features.ai_note_branch_scope && props.scopeModelValue.length) {
          emit('update:scopeModelValue', []);
        }
      })
      .catch(() => {
        aiBranchScopeEnabled.value = false;
        if (props.scopeModelValue.length) emit('update:scopeModelValue', []);
      });
  });
  onBeforeUnmount(() => {
    window.removeEventListener('light-note:close-ai-overlays', closePopover);
  });
</script>

<style scoped lang="less">
  .ai-context-picker {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    width: auto;
    max-width: 100%;
    min-width: 0;
  }
  .ai-context-picker.is-inline {
    display: block;
    width: 100%;
  }
  @media (pointer: coarse) {
    /* 触发按钮(@添加资源)压到 36px,与右侧「上传文件」一致、不再突兀过高 */
    .ai-context-picker :deep(.b_btn) {
      min-height: 36px;
    }
  }

  @media (max-width: 767px) {
    .ai-context-picker {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      flex: 1 1 100%;
      flex-wrap: wrap;
      gap: 6px;
    }

    .ai-context-picker :deep(.ai-context-trigger) {
      height: 36px;
      min-height: 36px;
      max-width: 100%;
      min-width: 0;
    }
  }
</style>
