<template>
  <main class="note-ai-reply-harness" :class="{ 'note-ai-reply-harness--narrow': narrow }">
    <section class="note-ai-reply-harness__editor" aria-hidden="true">
      <span class="note-ai-reply-harness__eyebrow">笔记正文</span>
      <h1>{{ note.title }}</h1>
      <p>用于对照 AI 建议侧栏与放大弹窗的阅读密度。</p>
    </section>
    <aside class="note-ai-reply-harness__panel">
      <NoteDetailSidePanel>
        <template #ai><AiReply /></template>
      </NoteDetailSidePanel>
    </aside>
  </main>
</template>

<script setup lang="ts">
  import { provide, reactive } from 'vue';
  import AiReply from '@/components/noteLibrary/detail/AiReply.vue';
  import NoteDetailSidePanel from '@/components/noteLibrary/reference/NoteDetailSidePanel.vue';

  const props = defineProps<{ noteType: 'html' | 'markdown'; source?: string; sample?: string; narrow?: boolean }>();

  const note = reactive({
    id: 'note-ai-density-fixture',
    title: props.sample === 'short' ? '你好' : '功能优化与缺陷修复',
    type: props.noteType,
    content:
      props.source === 'blank'
        ? ''
        : props.source === 'empty-html'
          ? '<p><br></p><p>&nbsp;</p>'
          : props.sample === 'short'
            ? '你好'
            : props.noteType === 'markdown'
              ? '# 功能优化与缺陷修复\n\n进入网站查询用户反馈，如果有新的则弹出确认。\n\n增加笔记模块多选删除功能。'
              : '<h1>功能优化与缺陷修复</h1><p>进入网站查询用户反馈，如果有新的则弹出确认。</p><p>增加笔记模块多选删除功能。</p>',
  });
  provide('note', note);
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

  .note-ai-reply-harness {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--ui-layout-420, 420px);
    gap: 16px;
    min-height: 100vh;
    padding: 16px;
    background: var(--background-color);
  }

  .note-ai-reply-harness__editor,
  .note-ai-reply-harness__panel {
    min-width: 0;
    min-height: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-page-bg, var(--card-background));
    overflow: hidden;
  }

  .note-ai-reply-harness__editor {
    padding: 48px clamp(24px, 7vw, 96px);
  }

  .note-ai-reply-harness__editor h1 {
    margin: 12px 0 20px;
    font-size: clamp(28px, 4vw, 48px);
  }

  .note-ai-reply-harness__editor p,
  .note-ai-reply-harness__eyebrow {
    color: var(--desc-color);
  }

  .note-ai-reply-harness__panel {
    height: calc(100vh - 32px);
  }

  .note-ai-reply-harness--narrow {
    grid-template-columns: minmax(0, 1fr) var(--ui-layout-360, 360px);
  }

  @media (max-width: 720px) {
    .note-ai-reply-harness {
      display: block;
      padding: 0;
    }

    .note-ai-reply-harness__editor {
      display: none;
    }

    .note-ai-reply-harness__panel {
      width: 100%;
      height: 100vh;
      border: 0;
      border-radius: 0;
    }
  }
</style>
