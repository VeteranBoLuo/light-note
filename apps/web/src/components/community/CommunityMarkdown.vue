<template><div class="community-markdown" v-html="html" /></template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { renderCommunityMarkdown } from '@/utils/communityMarkdown';
  const props = defineProps<{ body: string }>();
  const html = computed(() => renderCommunityMarkdown(props.body));
</script>
<style scoped lang="less">
  .community-markdown {
    color: var(--text-color);
    line-height: 1.85;
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .community-markdown :deep(p) {
    margin: 0 0 1em;
  }
  .community-markdown :deep(a) {
    color: var(--workspace-purple-text);
    text-decoration: underline;
  }
  .community-markdown :deep(pre) {
    white-space: pre-wrap;
    padding: 16px;
    background: var(--workspace-hover);
    border-radius: 8px;
  }
  .community-markdown :deep(blockquote) {
    margin: 16px 0;
    padding: 4px 16px;
    border-left: 3px solid var(--workspace-purple-text);
    color: var(--desc-color);
  }
  .community-markdown :deep(table) {
    display: block;
    max-width: 100%;
    overflow: auto;
    border-collapse: collapse;
  }
  .community-markdown :deep(td),
  .community-markdown :deep(th) {
    border: 1px solid var(--workspace-border);
    padding: 8px;
  }
</style>
