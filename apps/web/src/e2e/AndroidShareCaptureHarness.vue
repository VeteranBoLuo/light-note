<template>
  <main class="share-harness">
    <header>
      <span>Android system share / visual QA</span>
      <h1>系统分享验收 · {{ scenario }}</h1>
      <p>{{ description }}</p>
    </header>
    <section class="share-harness__log" data-testid="bridge-log">
      <h2>原生桥与接口记录</h2>
      <ol>
        <li v-for="(entry, index) in log" :key="index">{{ entry }}</li>
      </ol>
      <p v-if="bookmark.isShowLogin" class="share-harness__login">已请求打开登录框（真实页面会显示登录弹窗）</p>
    </section>
    <QuickCaptureModal v-if="inbox.quickCaptureVisible" v-model:visible="inbox.quickCaptureVisible" />
  </main>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import QuickCaptureModal from '@/components/inbox/QuickCaptureModal.vue';
  import { useAndroidIncomingShare } from '@/composables/useAndroidIncomingShare';
  import { bookmarkStore, inboxStore } from '@/store';

  const props = defineProps<{ scenario: string; log: string[] }>();
  const inbox = inboxStore();
  const bookmark = bookmarkStore();
  useAndroidIncomingShare({ authReady: ref(true), blocked: ref(false) });

  const descriptions: Record<string, string> = {
    link: '浏览器分享网页：标题 + 网址，应识别为书签并用标题命名。',
    files: '相册分享两张图片，另有 1 个文件超限被原生跳过。',
    'text-files': '文字和图片一起分享：先按文件保存，文字保留在输入框。',
    text: '纯文字分享：应识别为笔记。',
    visitor: '未登录：不打开快速添加，提示登录并保留分享。',
    admin: '管理员代管上下文：不自动打开，提示退出代管。',
  };
  const description = computed(() => descriptions[props.scenario] || descriptions.link);
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
  }

  .share-harness {
    display: grid;
    gap: 16px;
    max-width: 880px;
    padding: 20px 16px;
  }

  .share-harness header span {
    color: var(--primary-color);
    font-size: 12px;
    font-weight: 700;
  }

  .share-harness h1 {
    margin: 4px 0;
    font-size: 20px;
  }

  .share-harness__log {
    padding: 12px 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
    font-size: 12px;
    word-break: break-all;
  }

  .share-harness__login {
    color: var(--primary-color);
  }
</style>
