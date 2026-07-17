<template>
  <div
    class="typewriter-output"
    ref="containerRef"
    @scroll="handleScroll"
    @wheel.passive="handleWheel"
    @touchstart.passive="handleTouchStart"
    @touchmove.passive="handleTouchMove"
  >
    <div v-if="!displayContent" class="empty">{{ emptyText }}</div>
    <div v-else-if="renderAsText" class="typewriter-content" v-text="displayContent"></div>
    <div v-else class="typewriter-content" v-html="safeDisplayContent"></div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import DOMPurify from 'dompurify';

  const props = defineProps<{
    content: string;
    typingSpeed?: number;
    emptyText?: string;
    renderAsText?: boolean;
  }>();

  const displayContent = ref('');
  const containerRef = ref<HTMLElement | null>(null);

  // 只要用户仍在底部附近就跟随；离开底部马上暂停，滚回底部则自动恢复。
  // 不用“已被打断”的粘滞标记，避免后续 wheel/touch 事件错误地再次锁死自动跟随。
  const shouldFollow = ref(true);
  const SCROLL_THRESHOLD = 120;

  const typingSpeed = ref(props.typingSpeed ?? 10);
  let typingTimer: number | null = null;
  let resolveTypingDelay: (() => void) | null = null;
  let typewriterQueue: string[] = [];
  let isTyping = false;
  let lastContent = '';
  let typingRunId = 0;
  let scrollFrame: number | null = null;
  let lastTouchY: number | null = null;

  const isNearBottom = () => {
    const container = containerRef.value;
    if (!container) return true;
    return container.scrollHeight - container.scrollTop - container.clientHeight <= SCROLL_THRESHOLD;
  };

  const cancelScheduledScroll = () => {
    if (scrollFrame !== null) {
      window.cancelAnimationFrame(scrollFrame);
      scrollFrame = null;
    }
  };

  const pauseFollowing = () => {
    shouldFollow.value = false;
    cancelScheduledScroll();
    const container = containerRef.value;
    // 取消浏览器尚未结束的 smooth 动画，避免用户已经上滚却被旧动画继续拉回底部。
    if (container) container.scrollTo({ top: container.scrollTop, behavior: 'auto' });
  };

  const scheduleScrollToBottom = () => {
    if (!containerRef.value || !shouldFollow.value || scrollFrame !== null) return;
    // 每一帧最多滚一次，不能像旧实现那样每个字都叠加一个 smooth 动画。
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = null;
      const container = containerRef.value;
      if (!container || !shouldFollow.value) return;
      container.scrollTop = container.scrollHeight;
    });
  };

  const waitForNextCharacter = () =>
    new Promise<void>((resolve) => {
      resolveTypingDelay = () => {
        resolveTypingDelay = null;
        typingTimer = null;
        resolve();
      };
      typingTimer = window.setTimeout(() => resolveTypingDelay?.(), typingSpeed.value);
    });

  const cancelTypingDelay = () => {
    if (typingTimer !== null) {
      clearTimeout(typingTimer);
      typingTimer = null;
    }
    resolveTypingDelay?.();
  };

  const startTypewriter = async () => {
    if (isTyping) return;
    isTyping = true;
    const runId = typingRunId;

    while (typewriterQueue.length > 0 && runId === typingRunId) {
      const textToType = typewriterQueue.shift();
      if (!textToType) continue;

      for (let i = 0; i < textToType.length && runId === typingRunId; i++) {
        // 在内容变高之前判断，只有用户此前贴底才会继续跟随。
        shouldFollow.value = shouldFollow.value && isNearBottom();
        displayContent.value += textToType[i];
        if (shouldFollow.value) scheduleScrollToBottom();
        await waitForNextCharacter();
      }
    }

    if (runId === typingRunId) isTyping = false;
  };

  const enqueueContent = (text: string) => {
    if (!text) return;
    typewriterQueue.push(text);
    if (!isTyping) startTypewriter();
  };

  const resetTypewriter = () => {
    typingRunId += 1;
    displayContent.value = '';
    typewriterQueue = [];
    isTyping = false;
    shouldFollow.value = true;
    cancelScheduledScroll();
    cancelTypingDelay();
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
    shouldFollow.value = isNearBottom();
    if (!shouldFollow.value) cancelScheduledScroll();
  };

  const handleWheel = (event: WheelEvent) => {
    if (event.deltaY < 0) pauseFollowing();
  };

  const handleTouchStart = (event: TouchEvent) => {
    lastTouchY = event.touches[0]?.clientY ?? null;
  };

  const handleTouchMove = (event: TouchEvent) => {
    const touchY = event.touches[0]?.clientY;
    if (typeof touchY !== 'number') return;
    // 手指向下移动代表内容向上滚动，应立即停掉自动跟随。
    if (lastTouchY !== null && touchY > lastTouchY) pauseFollowing();
    lastTouchY = touchY;
  };

  const emptyText = computed(() => props.emptyText ?? '');
  const safeDisplayContent = computed(() =>
    DOMPurify.sanitize(displayContent.value, {
      ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'],
      ALLOWED_ATTR: [],
    }),
  );

  onBeforeUnmount(() => {
    typingRunId += 1;
    cancelScheduledScroll();
    cancelTypingDelay();
  });
</script>

<style>
  .typewriter-output {
    overflow: auto;
  }

  .typewriter-content {
    margin: 0;
    white-space: pre-wrap;
  }

  .typewriter-content pre {
    font-family: 'Fira Code', 'Courier New', Courier, monospace;
    background: rgba(15, 23, 42, 0.8);
    color: #f8fafc;
    padding: 10px;
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.4);
  }
  .typewriter-content pre {
    overflow: auto;
  }

  .typewriter-content h1,
  .typewriter-content h2,
  .typewriter-content h3,
  .typewriter-content h4,
  .typewriter-content h5,
  .typewriter-content h6 {
    font-size: 1em;
    margin: 0.5em 0 0.2em;
    font-weight: 600;
  }

  .empty {
    color: #9aa0a6;
    font-size: 12px;
  }
</style>
