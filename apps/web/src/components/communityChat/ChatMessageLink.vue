<template>
  <a class="chat-message-link" :href="href" target="_blank" rel="noopener noreferrer nofollow ugc" @click="open">{{
    href
  }}</a>
</template>

<script setup lang="ts">
  import { inject } from 'vue';
  import { useRouter } from 'vue-router';
  import { chatMessageLinkAppPath, chatMessageLinkNavigatorKey } from './chatMessageLinks';

  const props = defineProps<{ href: string }>();
  const router = useRouter();
  const navigate = inject(chatMessageLinkNavigatorKey, (path: string) => void router.push(path));

  // 站内页面在应用内跳转；站外链接、文件地址和修饰键点击交给浏览器新开页面。
  function open(event: MouseEvent) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const path = chatMessageLinkAppPath(props.href);
    if (!path || router.resolve(path).name === 'not-found') return;
    event.preventDefault();
    navigate(path);
  }
</script>

<style scoped lang="less">
  .chat-message-link {
    color: var(--workspace-purple-text);
    text-decoration: underline;
    text-underline-offset: 0.15em;
    overflow-wrap: anywhere;
  }
</style>
