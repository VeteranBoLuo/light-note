<template>
  <div v-if="tags.length" class="cloud-file-tags" @click.stop="selectFirstInBatch">
    <ResourceTagChip
      class="cloud-file-tags__visible"
      :tag="tags[0]"
      :data-range-select="batchMode ? '' : undefined"
      size="medium"
      interactive
      max-width="var(--ui-layout-90, 90px)"
      @click.stop="selectTag(tags[0], $event)"
      v-click-log="{ module: '云空间', operation: `点击文件关联标签【${tags[0].name}】` }"
    />
    <BPopover v-if="tags.length > 1" v-model:open="open" :disabled="batchMode" placement="bottom-right">
      <BChip
        class="cloud-file-tags__more"
        tone="tag"
        size="medium"
        interactive
        :data-range-select="batchMode ? '' : undefined"
        :aria-label="tagsLabel"
        :aria-expanded="open"
      >
        +{{ tags.length - 1 }}
      </BChip>
      <template #content>
        <div class="cloud-file-tags__panel">
          <strong>{{ tagsLabel }}</strong>
          <div v-auto-scrollbar class="cloud-file-tags__list">
            <ResourceTagChip
              v-for="tag in tags"
              :key="tag.id"
              :tag="tag"
              size="medium"
              interactive
              @click.stop="selectTag(tag, $event)"
              v-click-log="{ module: '云空间', operation: `点击文件关联标签【${tag.name}】` }"
            />
          </div>
        </div>
      </template>
    </BPopover>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';

  interface FileTag {
    id: string;
    name: string;
  }
  const props = defineProps<{ tags: FileTag[]; batchMode: boolean }>();
  const emit = defineEmits<{ select: [tagId: string, event: MouseEvent] }>();
  const { t } = useI18n();
  const open = ref(false);
  const tagsLabel = computed(() => `${t('cloudSpace.relateTags')} (${props.tags.length})`);

  function selectTag(tag: FileTag, event: MouseEvent) {
    open.value = false;
    emit('select', tag.id, event);
  }
  function selectFirstInBatch(event: MouseEvent) {
    if (props.batchMode) selectTag(props.tags[0], event);
  }
  watch([() => props.tags, () => props.batchMode], () => (open.value = false), { deep: true });
</script>

<style scoped>
  .cloud-file-tags {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: var(--ui-space-5, 5px);
  }
  .cloud-file-tags__visible {
    flex: 0 1 auto;
  }
  .cloud-file-tags__panel {
    width: var(--ui-layout-280, 280px);
    max-width: calc(100vw - var(--ui-layout-48, 48px));
    padding: var(--ui-space-12, 12px);
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
  }
  .cloud-file-tags__list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    max-height: var(--ui-layout-240, 240px);
    margin-top: var(--ui-space-10, 10px);
    overflow: auto;
  }
  .cloud-file-tags__list :deep(.resource-tag-chip) {
    max-width: 100%;
  }
  .cloud-file-tags__list :deep(.resource-tag-chip__text) {
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: left;
  }
</style>
