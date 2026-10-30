<template>
  <div class="note-reference-picker">
    <BTabs v-model:active-tab="filter" :options="filters" variant="segment" />
    <!-- 不按筛选重建：选择器自身会随类型变化重新搜索，并保留已输入的关键词。 -->
    <ResourcePickerPanel
      :allowed-types="allowedTypes"
      :exclude-keys="excludeKeys"
      :pinned-items="pinnedItems"
      :pinned-label="t('note.reference.recent')"
      :placeholder="t('note.reference.searchPlaceholder')"
      :limit="24"
      :per-type="12"
      show-search
      fill
      auto-focus
      @select="select"
      @close="emit('close')"
    />
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import { resourceItemKey, type ResourcePickerItem } from '@/composables/useResourcePickerSearch';
  import {
    noteReferenceKey,
    type NoteReferenceRecent,
    type NoteReferenceTarget,
    type NoteReferenceType,
  } from '@/utils/noteReference';

  const props = defineProps<{
    ownerKey: string;
    currentNoteId: string;
    /** 当前正在参考的内容，已经显示在参考栏里，不再出现在「最近参考」中。 */
    currentTarget?: NoteReferenceTarget | null;
    recent: NoteReferenceRecent[];
  }>();

  const emit = defineEmits<{
    select: [item: NoteReferenceRecent];
    close: [];
  }>();

  const { t } = useI18n();
  const filter = ref<'all' | NoteReferenceType>('all');
  const filters = computed(() => [
    { key: 'all', label: t('note.reference.filterAll') },
    { key: 'note', label: t('note.reference.filterNotes') },
    { key: 'file', label: t('note.reference.filterFiles') },
  ]);
  const allowedTypes = computed<NoteReferenceType[]>(() => (filter.value === 'all' ? ['note', 'file'] : [filter.value]));
  // 当前正在编辑的笔记不能参考自己。
  const excludeKeys = computed(() => (props.currentNoteId ? [resourceItemKey({ type: 'note', id: props.currentNoteId })] : []));
  const pinnedItems = computed<ResourcePickerItem[]>(() =>
    props.recent
      .filter((item) => allowedTypes.value.includes(item.type))
      .filter((item) => !(item.type === 'note' && item.id === props.currentNoteId))
      .filter((item) => !(props.currentTarget && noteReferenceKey(item) === noteReferenceKey(props.currentTarget)))
      .map((item) => ({ type: item.type, id: item.id, title: item.title || item.id })),
  );

  function select(item: ResourcePickerItem) {
    if (item.type !== 'note' && item.type !== 'file') return;
    emit('select', { type: item.type, id: String(item.id), title: String(item.title || '') });
  }
</script>

<style scoped lang="less">
  // 固定高度：切换筛选时结果先清空再加载，弹框不能跟着先缩后长。
  .note-reference-picker {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    width: min(var(--ui-layout-360, 360px), calc(100vw - var(--ui-layout-32, 32px)));
    height: min(calc(var(--ui-layout-360, 360px) + var(--ui-layout-60, 60px)), calc(100vh - var(--ui-layout-140, 140px)));
    height: min(calc(var(--ui-layout-360, 360px) + var(--ui-layout-60, 60px)), calc(100dvh - var(--ui-layout-140, 140px)));
    padding: var(--ui-space-10, 10px);
    box-sizing: border-box;

    > :deep(.resource-picker-panel) {
      flex: 1 1 auto;
      min-height: 0;
    }
  }
</style>
