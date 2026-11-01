<template>
  <div class="pdf-excerpt-note-picker" :class="{ 'is-drawer': drawer }">
    <strong v-if="!drawer" class="pdf-excerpt-note-picker__title">{{ t('cloudSpace.previewPanel.pdfExcerptPickerTitle') }}</strong>
    <ResourcePickerPanel
      :allowed-types="['note']"
      :placeholder="t('cloudSpace.previewPanel.pdfExcerptPickerSearch')"
      :limit="12"
      :per-type="12"
      show-search
      fill
      :auto-focus="!drawer"
      @select="select"
      @close="emit('close')"
    />
    <BButton class="pdf-excerpt-note-picker__new" :disabled="busy" @click="emit('select', { type: 'new' })">
      <SvgIcon :src="icon.common.plus" size="15" aria-hidden="true" />
      <span>{{ t('cloudSpace.previewPanel.pdfExcerptNewNote', { title: newNoteTitle }) }}</span>
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import icon from '@/config/icon';
  import type { ResourcePickerItem } from '@/composables/useResourcePickerSearch';
  import type { PdfExcerptNoteTarget } from '@/utils/pdfExcerpt';

  defineProps<{
    newNoteTitle: string;
    /** 手机底部抽屉里使用：标题由抽屉提供，不自动弹出键盘。 */
    drawer?: boolean;
    busy?: boolean;
  }>();

  const emit = defineEmits<{
    select: [target: PdfExcerptNoteTarget];
    close: [];
  }>();

  const { t } = useI18n();

  function select(item: ResourcePickerItem) {
    if (item.type !== 'note') return;
    emit('select', { type: 'note', id: String(item.id), title: String(item.title || '') });
  }
</script>

<style scoped lang="less">
  // 固定高度：搜索结果先清空再加载时，浮层不能跟着先缩后长。
  .pdf-excerpt-note-picker {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    width: min(var(--ui-layout-340, 340px), calc(100vw - var(--ui-layout-32, 32px)));
    height: min(var(--ui-layout-420, 420px), calc(100vh - var(--ui-layout-140, 140px)));
    height: min(var(--ui-layout-420, 420px), calc(100dvh - var(--ui-layout-140, 140px)));
    padding: var(--ui-space-10, 10px);
    box-sizing: border-box;

    > :deep(.resource-picker-panel) {
      flex: 1 1 auto;
      min-height: 0;
    }
  }

  .pdf-excerpt-note-picker.is-drawer {
    width: 100%;
    height: 100%;
    padding: 0;
  }

  .pdf-excerpt-note-picker__title {
    padding: 0 var(--ui-space-2, 2px);
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
  }

  :deep(.pdf-excerpt-note-picker__new.b_btn) {
    flex: none;
    justify-content: flex-start;
    gap: var(--ui-space-6, 6px);
    width: 100%;
    height: var(--ui-control-40, 40px);
    padding: 0 var(--ui-space-8, 8px);
    border: 0;
    border-top: 1px solid var(--card-border-color);
    border-radius: 0 0 8px 8px;
    background: transparent;
    color: var(--primary-color);
  }

  :deep(.pdf-excerpt-note-picker__new.b_btn:hover) {
    background: var(--hover-background);
  }

  :deep(.pdf-excerpt-note-picker__new.b_btn span) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .is-drawer :deep(.pdf-excerpt-note-picker__new.b_btn) {
    /* ui-density-fixed: 手机底部抽屉里的整行操作，按移动端触控高度固定 */
    height: 48px;
    /* ui-density-fixed: 手机抽屉文字，手机固定标准密度 */
    font-size: 15px;
  }
</style>
