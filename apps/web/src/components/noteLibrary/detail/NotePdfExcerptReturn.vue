<template>
  <div class="note-pdf-excerpt-return" role="status">
    <SvgIcon :src="icon.message.success" size="16" class="note-pdf-excerpt-return__icon" aria-hidden="true" />
    <span class="note-pdf-excerpt-return__text">{{ t('cloudSpace.previewPanel.pdfExcerptAppendedHere') }}</span>
    <BButton class="note-pdf-excerpt-return__back" @click="emit('back')">
      {{ t('cloudSpace.previewPanel.pdfExcerptBackToPdf') }}
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  const emit = defineEmits<{ back: [] }>();
  const { t } = useI18n();
</script>

<style scoped lang="less">
  // 手机上从 PDF 摘录过来后的结果提示：沿用页面表面，只在图标上用成功色。
  .note-pdf-excerpt-return {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    margin: 0 0 var(--ui-space-8, 8px);
    padding: var(--ui-space-6, 6px) 0;
    border-bottom: 1px solid var(--card-border-color);
    font-size: var(--ui-font-14, 14px);
  }

  .note-pdf-excerpt-return__icon {
    flex: none;
    color: var(--success-color);
  }

  .note-pdf-excerpt-return__text {
    flex: 1;
    min-width: 0;
  }

  :deep(.note-pdf-excerpt-return__back.b_btn) {
    flex: none;
    height: var(--ui-control-32, 32px);
    padding: 0 var(--ui-space-10, 10px);
    border: 0;
    background: transparent;
    color: var(--primary-color);
  }
</style>
