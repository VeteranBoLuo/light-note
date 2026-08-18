<template>
  <div class="ai-context-picker">
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
      <!-- 一次性语义下发送即消费;此按钮是「发送前反悔」的辅助操作 -->
      <BButton size="small" class="ai-context-clear" :title="t('ai.material.onceTooltip')" @click="clearAll">
        {{ t('ai.material.clearOnce') }}
      </BButton>
    </div>
    <BPopover v-model:open="open" trigger="click" placement="top-left" overlay-class-name="ai-context-popover">
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
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import type { GlobalSearchType } from '@/api/search';
  import { useCurrentPageResource } from '@/composables/useCurrentPageResource';
  import type { ResourcePickerItem, ResourcePickerType } from '@/composables/useResourcePickerSearch';
  import { MAX_AI_SCOPE_REFS, type AiResourceContext, type AiScopeRef } from '@/types/aiScope';
  import { fetchNoteTreeFeatures } from '@/api/noteTree';
  import { recordNoteTreeProductEvent } from '@/api/noteTreeTelemetry';

  const props = withDefaults(
    defineProps<{
      modelValue: AiResourceContext[];
      scopeModelValue?: AiScopeRef[];
    }>(),
    { scopeModelValue: () => [] },
  );
  defineSlots<{ trigger(): unknown }>();
  const emit = defineEmits<{
    'update:modelValue': [value: AiResourceContext[]];
    'update:scopeModelValue': [value: AiScopeRef[]];
    fileSelected: [value: AiResourceContext];
  }>();
  const { t } = useI18n();
  const open = ref(false);
  const aiBranchScopeEnabled = ref(false);
  const allowedTypes: ResourcePickerType[] = ['bookmark', 'note', 'file', 'tag'];

  // 推导逻辑与 @ 浮层共用,避免两处口径漂移
  const currentPageContext = useCurrentPageResource();
  function resourceIcon(type: GlobalSearchType) {
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    if (type === 'tag') return icon.resource.tag;
    if (type === 'todo') return icon.contextMenu.inbox;
    return icon.resource.bookmark;
  }
  const selectedResourceKeys = computed(() => props.modelValue.map((item) => `${item.type}:${item.id}`));
  const selectedScopeKeys = computed(() => props.scopeModelValue.map((item) => `${item.type}:${item.id}`));

  function add(item: ResourcePickerItem) {
    if (item.type === 'file') {
      emit('fileSelected', item);
      open.value = false;
      return;
    }
    if (selectedResourceKeys.value.includes(`${item.type}:${item.id}`) || props.modelValue.length >= 5) return;
    emit('update:modelValue', [...props.modelValue, { type: item.type, id: item.id, title: item.title }]);
    open.value = false;
  }
  function clearAll() {
    emit('update:modelValue', []);
    emit('update:scopeModelValue', []);
  }
  function remove(item: AiResourceContext) {
    emit(
      'update:modelValue',
      props.modelValue.filter((value) => value.type !== item.type || value.id !== item.id),
    );
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
    open.value = false;
  }
  function removeScope(item: AiScopeRef) {
    emit(
      'update:scopeModelValue',
      props.scopeModelValue.filter((value) => value.type !== item.type || value.id !== item.id),
    );
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
  .ai-context-chips {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
    min-width: 0;
  }
  /* 已选材料 = 带主色调的"标签",跟右边中性的「@添加资源 / 上传文件」按钮明显区分,
     一眼能看出这是"选中的内容"而非可点的操作按钮。 */
  .ai-context-chips :deep(.b_btn) {
    gap: 4px;
    height: auto;
    min-height: 24px;
    padding: 2px 7px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 32%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background));
    color: var(--primary-color);
    font-weight: 500;
  }
  .ai-context-chip__once {
    flex: 0 0 auto;
    padding: 0 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    font-size: 10px;
    line-height: 16px;
    opacity: 0.85;
  }
  .ai-context-chips :deep(.ai-context-chip--scope) {
    border-color: var(--resource-note-color);
    color: var(--resource-note-color);
    font-weight: 600;
  }
  .ai-context-chip__scope-label {
    flex: 0 0 auto;
    font-size: 10px;
    font-weight: 700;
  }
  /* 清空是「撤销选择」而非材料本身:中性描边,与主色 chips 区分 */
  .ai-context-chips :deep(.ai-context-clear) {
    border: 1px solid color-mix(in srgb, var(--text-color) 18%, transparent);
    background: transparent;
    color: var(--desc-color);
    font-weight: 400;
  }
  .ai-context-chips :deep(.ai-context-clear:hover) {
    border-color: color-mix(in srgb, var(--danger-color, #e5484d) 40%, transparent);
    color: var(--danger-color, #e5484d);
  }
  .ai-context-chip__title {
    max-width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ai-context-chip__x {
    opacity: 0.55;
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

    .ai-context-chips {
      width: 100%;
      max-width: 100%;
      min-width: 0;
      flex: 1 1 100%;
      flex-wrap: wrap;
      gap: 6px;
    }

    .ai-context-picker :deep(.ai-context-trigger),
    .ai-context-chips :deep(.b_btn) {
      height: 36px;
      min-height: 36px;
      max-width: 100%;
      min-width: 0;
    }

    .ai-context-chips :deep(.ai-context-chip) {
      flex: 0 1 auto;
    }

    .ai-context-chips :deep(.ai-context-clear) {
      flex: 0 0 auto;
    }

    .ai-context-chip__title {
      max-width: min(46vw, 180px);
    }
  }
</style>
