<template>
  <CommunityMarkdown class="community-post-excerpt" :style="{ '--community-excerpt-lines': lines }" :body="text" />
</template>
<script setup lang="ts">
  import { computed } from 'vue';
  import { parseCommunityPostDocument } from '@lightnote/shared/community-feed';
  import CommunityMarkdown from './CommunityMarkdown.vue';
  const props = withDefaults(defineProps<{ body: string; lines?: number }>(), { lines: 4 });
  // Inline images belong to the article; a summary renders the surrounding text as one Markdown block.
  const text = computed(() =>
    parseCommunityPostDocument(props.body)
      .blocks.map((block) => (block.kind === 'text' ? block.source : ''))
      .join('\n\n'),
  );
</script>
<style scoped lang="less">
  // Doubled class outranks the shared `:root .community-markdown` article typography.
  .community-markdown.community-post-excerpt {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-14, 14px);
    font-weight: 400;
    line-height: 1.8;
    display: -webkit-box;
    -webkit-line-clamp: var(--community-excerpt-lines);
    -webkit-box-orient: vertical;
    overflow: hidden;
    /* ui-density-fixed: em 跟随已接入密度的摘要字号 */
    max-height: calc((var(--community-excerpt-lines) + 1) * 1.8em);
    white-space: normal;
    overflow-wrap: anywhere;
    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4),
    :deep(h5),
    :deep(h6) {
      font-size: var(--ui-font-15, 15px);
      line-height: 1.6;
      /* ui-density-fixed: em 跟随已接入密度的摘要字号 */
      margin: 0.4em 0 0.2em;
    }
    :deep(p),
    :deep(ul),
    :deep(ol),
    :deep(blockquote),
    :deep(pre),
    :deep(table) {
      margin-top: 0;
      /* ui-density-fixed: em 跟随已接入密度的摘要字号 */
      margin-bottom: 0.35em;
    }
    :deep(pre) {
      padding: var(--ui-space-6, 6px) var(--ui-space-10, 10px);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    :deep(> :first-child) {
      margin-top: 0;
    }
  }
</style>
