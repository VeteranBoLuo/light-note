<template>
  <main class="bookmark-ai-harness">
    <BookmarkAiDialog v-model:visible="visible" :bookmarks="bookmarks" />
  </main>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import BookmarkAiDialog from '@/components/manage/bookmarkMg/BookmarkAiDialog.vue';

  const visible = ref(true);
  const bookmarks = [{ id: 'visual-bookmark', name: 'Light Note AI 设计规范', url: 'https://example.com/design' }];
</script>

<style lang="less">
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body,
  #app {
    width: 100%;
    min-width: 0;
    min-height: 100%;
    margin: 0;
  }

  body {
    background: var(--background-color);
    color: var(--text-color);
    font-family: var(--app-font-family);
  }

  .bookmark-ai-harness {
    min-height: 100vh;
    background:
      linear-gradient(135deg, color-mix(in srgb, var(--primary-color) 8%, transparent), transparent 48%),
      var(--background-color);
  }

  html.light-note-mobile-rendering .bookmark-ai-harness {
    background: var(--background-color);
  }
</style>
