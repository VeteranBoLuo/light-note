<template>
  <div
    class="typewriter-output"
    ref="containerRef"
    @scroll="handleScroll"
    @wheel.passive="handleUserInteraction"
    @touchstart.passive="handleUserInteraction"
    @pointerdown.passive="handleUserInteraction"
  >
    <div v-if="!displayContent" class="empty">{{ emptyText }}</div>
    <div v-else class="typewriter-content" v-html="displayContent"></div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';

  const props = defineProps<{
    content: string;
    typingSpeed?: number;
    emptyText?: string;
  }>();

  const displayContent = ref('');
  const containerRef = ref<HTMLElement | null>(null);

  const autoScrollEnabled = ref(true);
  const userHasInterrupted = ref(false);
  const lastScrollTop = ref(0);
  const SCROLL_THRESHOLD = 120;

  const typingSpeed = ref(props.typingSpeed ?? 10);
  let typingTimer: number | null = null;
  let typewriterQueue: string[] = [];
  let isTyping = false;
  let lastContent = '';

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (!containerRef.value || userHasInterrupted.value) return;
    const container = containerRef.value;
    const targetScrollTop = container.scrollHeight - container.clientHeight;
    if (behavior === 'smooth') {
      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
    } else {
      container.scrollTop = targetScrollTop;
    }
  };

  const startTypewriter = async () => {
    if (isTyping) return;
    isTyping = true;

    while (typewriterQueue.length > 0) {
      const textToType = typewriterQueue.shift();
      if (!textToType) continue;

      for (let i = 0; i < textToType.length; i++) {
        displayContent.value += textToType[i];

        if (autoScrollEnabled.value && !userHasInterrupted.value) {
          scrollToBottom('smooth');
        }

        await new Promise((resolve) => {
          typingTimer = window.setTimeout(resolve, typingSpeed.value);
        });
      }
    }

    isTyping = false;
  };

  const enqueueContent = (text: string) => {
    if (!text) return;
    typewriterQueue.push(text);
    if (!isTyping) startTypewriter();
  };

  const resetTypewriter = () => {
    displayContent.value = '';
    typewriterQueue = [];
    isTyping = false;
    if (typingTimer) {
      clearTimeout(typingTimer);
      typingTimer = null;
    }
  };

  watch(
    () => props.content,
    (newContent) => {
      const content = newContent || '';
      if (content === lastContent) return;

      if (content.startsWith(lastContent)) {
        const diff = content.slice(lastContent.length);
        enqueueContent(diff);
      } else {
        resetTypewriter();
        enqueueContent(content);
      }

      lastContent = content;
    },
    { immediate: true },
  );

  watch(
    () => props.typingSpeed,
    (newSpeed) => {
      if (typeof newSpeed === 'number' && !Number.isNaN(newSpeed)) {
        typingSpeed.value = newSpeed;
      }
    },
  );

  const handleScroll = () => {
    if (!containerRef.value) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.value;
    const scrollPosition = scrollHeight - scrollTop - clientHeight;
    const scrollDelta = scrollTop - lastScrollTop.value;
    lastScrollTop.value = scrollTop;

    if (scrollDelta < 0) {
      userHasInterrupted.value = true;
      autoScrollEnabled.value = false;
    } else if (scrollPosition <= SCROLL_THRESHOLD) {
      autoScrollEnabled.value = true;
      userHasInterrupted.value = false;
    }
  };

  const handleUserInteraction = () => {
    if (!autoScrollEnabled.value && userHasInterrupted.value) return;
    userHasInterrupted.value = true;
    autoScrollEnabled.value = false;
  };

  const emptyText = computed(() => props.emptyText ?? '');
</script>

<style scoped>
  .typewriter-output {
    overflow: auto;
  }

  .typewriter-content {
    margin: 0;
    white-space: pre-wrap;
  }

  .empty {
    color: #9aa0a6;
    font-size: 12px;
  }
</style>
