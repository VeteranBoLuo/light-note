<template>
  <div class="note-template-content-editor">
    <Editor
      v-model:content="content"
      context="template"
      :type="type"
      :revision="revision"
      :resource-refs="[]"
      image-upload-mode="base64"
      @ready="emit('ready')"
    />
  </div>
</template>

<script setup lang="ts">
  import Editor from '@/components/noteLibrary/detail/Editor.vue';
  import type { NoteTemplateType } from '@/types/noteTemplate';

  withDefaults(defineProps<{ type: NoteTemplateType; revision?: number }>(), { revision: 1 });
  const content = defineModel<string>('content', { default: '' });
  const emit = defineEmits<{ ready: [] }>();
</script>

<style scoped lang="less">
  .note-template-content-editor {
    --note-editor-header-bg: var(--surface-panel-bg);

    min-width: 0;
    min-height: 0;
    height: auto;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-page-bg, var(--background-color));
  }
  .note-template-content-editor :deep(#editor-container.note-editor) {
    height: 100%;
    min-height: 0;
  }
  @media (max-width: 767px) {
    .note-template-content-editor {
      min-height: 0;
      height: auto;
      border-right: 0;
      border-left: 0;
      border-radius: 0;
    }
  }
</style>
