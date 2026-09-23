<template>
  <section v-if="headings.length" class="post-outline">
    <h2>{{ t('community.feed.postOutline') }}</h2>
    <nav v-auto-scrollbar :aria-label="t('community.feed.postOutline')">
      <BButton
        v-for="(heading, index) in headings"
        :key="index"
        class="post-outline-item"
        :style="{ paddingLeft: `${dimension(10) + Math.min(3, heading.level - minimumLevel) * dimension(12)}px` }"
        :aria-current="activeIndex === index ? 'location' : undefined"
        @click="selectHeading(index)"
        >{{ heading.text }}</BButton
      >
    </nav>
  </section>
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { scrollIntoContainer } from '@/utils/scrolling';
  import { useUiDensity } from '@/composables/useUiDensity';
  const { dimension } = useUiDensity();
  const props = defineProps<{
    contentRoot: HTMLElement | null;
    scrollContainer?: HTMLElement | null;
    content: string;
  }>();
  const { t } = useI18n();
  const headings = shallowRef<{ text: string; level: number; element: HTMLElement }[]>([]);
  const activeIndex = ref(-1);
  const minimumLevel = computed(() => Math.min(...headings.value.map((heading) => heading.level)));
  let frame = 0;
  let selectedIndex: number | null = null;
  function clearSelected(event: Event) {
    if (event.type === 'pointerdown' && event.target !== props.scrollContainer) return;
    if (
      event instanceof KeyboardEvent &&
      !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)
    )
      return;
    selectedIndex = null;
    scheduleActive();
  }
  function updateActive() {
    frame = 0;
    if (selectedIndex !== null) {
      activeIndex.value = selectedIndex;
      return;
    }
    const container = props.scrollContainer;
    if (!container) return;
    const top = container.getBoundingClientRect().top + 32;
    let active = -1;
    headings.value.forEach((heading, index) => {
      if (heading.element.getBoundingClientRect().top <= top) active = index;
    });
    activeIndex.value = active;
  }
  function scheduleActive() {
    if (!frame) frame = requestAnimationFrame(updateActive);
  }
  function selectHeading(index: number) {
    const heading = headings.value[index];
    if (!heading || !props.scrollContainer) return;
    selectedIndex = index;
    activeIndex.value = index;
    scrollIntoContainer(
      props.scrollContainer,
      heading.element,
      24,
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    );
  }
  watch(
    () => [props.contentRoot, props.content] as const,
    () => {
      selectedIndex = null;
      const content = props.contentRoot?.querySelector('.community-markdown');
      headings.value = Array.from(content?.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6') || [])
        .filter((element) => element.textContent?.trim())
        .map((element) => ({ text: element.textContent!.trim(), level: Number(element.tagName.slice(1)), element }));
      updateActive();
    },
    { flush: 'post', immediate: true },
  );
  watch(
    () => [props.scrollContainer, props.contentRoot] as const,
    ([container, root], _, onCleanup) => {
      container?.addEventListener('scroll', scheduleActive, { passive: true });
      const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
      events.forEach((event) => container?.addEventListener(event, clearSelected, { passive: true }));
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleActive);
      if (root) observer?.observe(root);
      onCleanup(() => {
        container?.removeEventListener('scroll', scheduleActive);
        events.forEach((event) => container?.removeEventListener(event, clearSelected));
        observer?.disconnect();
      });
    },
    { immediate: true },
  );
  onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>
<style scoped lang="less">
  .post-outline {
    border-top: 1px solid var(--workspace-divider);
    padding-top: var(--ui-space-24, 24px);
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .post-outline h2 {
    font-size: var(--ui-font-14, 14px);
    margin: 0 0 var(--ui-space-12, 12px);
    font-weight: 600;
  }
  .post-outline nav {
    overflow-y: auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-4, 4px);
  }
  .post-outline-item.b_btn {
    flex-shrink: 0;
    width: 100%;
    height: auto;
    min-height: var(--ui-layout-36, 36px);
    padding: var(--ui-space-8, 8px) var(--ui-space-6, 6px);
    justify-content: flex-start;
    text-align: left;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.5;
    border: 0;
    border-left: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--desc-color);
  }
  .post-outline-item.b_btn:hover {
    background: var(--workspace-hover);
  }
  .post-outline-item.b_btn[aria-current='location'] {
    color: var(--workspace-purple-text);
    border-left-color: var(--workspace-purple-text);
  }
</style>
