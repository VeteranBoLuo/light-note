<template>
  <!-- 无标题时不渲染:否则 .catalog 的左边框会在桌面端留下一个空框 -->
  <aside v-if="bookmark.isDesktop && note.headings.length" class="toc-container">
    <nav class="catalog" :aria-label="t('noteDetail.catalogTitle')">
      <BButton
        v-for="(heading, index) in note.headings"
        :key="headingKey(heading, index)"
        class="toc-item"
        :class="{ active: activeHeading === index }"
        :style="{ '--toc-indent': `${headingIndent(heading.level)}px` }"
        :aria-current="activeHeading === index ? 'location' : undefined"
        @click="scrollToHeading(index)"
        v-click-log="{ module: '笔记', operation: `点击目录【${heading.text}】` }"
      >
        <span class="toc-marker" aria-hidden="true" />
        <span class="toc-text">{{ heading.text || t('noteDetail.catalogUntitled') }}</span>
      </BButton>
    </nav>
  </aside>

  <BDrawer
    v-else
    :open="drawerOpen"
    class="note-catalog-drawer"
    placement="bottom"
    height="min(72dvh, 620px)"
    body-padding="0"
    :title="t('noteDetail.catalogTitle')"
    :close-label="t('noteDetail.catalogClose')"
    @close="emit('close')"
  >
    <template #header-actions>
      <span class="toc-count">{{ t('noteDetail.catalogCount', { count: note.headings.length }) }}</span>
    </template>
    <nav ref="drawerListRef" class="phone-catalog" :aria-label="t('noteDetail.catalogTitle')">
      <BButton
        v-for="(heading, index) in note.headings"
        :key="headingKey(heading, index)"
        :ref="(component) => setDrawerItemRef(index, component)"
        class="toc-item"
        :class="{ active: activeHeading === index }"
        :style="{ '--toc-indent': `${headingIndent(heading.level)}px` }"
        :aria-current="activeHeading === index ? 'location' : undefined"
        @click="scrollToHeading(index)"
        v-click-log="{ module: '笔记', operation: `点击目录【${heading.text}】` }"
      >
        <span class="toc-marker" aria-hidden="true" />
        <span class="toc-text">{{ heading.text || t('noteDetail.catalogUntitled') }}</span>
      </BButton>
      <p v-if="!note.headings.length" class="toc-empty">{{ t('noteDetail.catalogEmpty') }}</p>
    </nav>
  </BDrawer>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, noteStore } from '@/store';
  import { scrollIntoContainer } from '@/utils/zoom.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';

  const bookmark = bookmarkStore();
  const note = noteStore();
  const { t } = useI18n();
  const props = withDefaults(
    defineProps<{
      content: string;
      noteType?: string;
      drawerOpen?: boolean;
    }>(),
    {
      noteType: 'html',
      drawerOpen: false,
    },
  );
  const emit = defineEmits<{
    markdownHeadingClick: [index: number];
    close: [];
  }>();
  const isMdMode = computed(() => props.noteType === 'markdown');
  const activeHeading = ref<number | null>(null);
  const drawerListRef = ref<HTMLElement | null>(null);
  const drawerItemRefs = new Map<number, HTMLElement>();
  let manualScrolling = false;
  let manualScrollTimer = 0;
  let spyRoot: HTMLElement | null = null;
  let spyFrame = 0;

  const minimumHeadingLevel = computed(() =>
    note.headings.length ? Math.min(...note.headings.map((heading) => Number(heading.level) || 1)) : 1,
  );

  function headingIndent(level: number) {
    return Math.min(3, Math.max(0, Number(level || 1) - minimumHeadingLevel.value)) * 16;
  }

  function headingKey(heading: { level: number; text: string }, index: number) {
    return `${heading.level}:${heading.text}:${index}`;
  }

  function setDrawerItemRef(index: number, component: any) {
    const element = component?.$el instanceof HTMLElement ? component.$el : component;
    if (element instanceof HTMLElement) drawerItemRefs.set(index, element);
    else drawerItemRefs.delete(index);
  }

  async function scrollToHeading(index: number) {
    if (!note.headings[index]) return;
    manualScrolling = true;
    activeHeading.value = index;
    window.clearTimeout(manualScrollTimer);
    if (isMdMode.value) {
      emit('markdownHeadingClick', index);
    } else {
      const heading = note.headings[index];
      const scrollContainer = document.querySelector<HTMLElement>('.note-editor-scroll');
      if (heading?.element && scrollContainer) {
        scrollIntoContainer(scrollContainer, heading.element as HTMLElement, 8);
      }
    }
    if (bookmark.isMobileDevice) emit('close');
    manualScrollTimer = window.setTimeout(() => {
      manualScrolling = false;
      updateActiveHeading();
    }, 700);
  }

  function setupScrollSpy() {
    teardownScrollSpy();
    if (!note.headings.length) return;
    spyRoot = isMdMode.value
      ? document.querySelector<HTMLElement>('.md-preview')
      : document.querySelector<HTMLElement>('.note-editor-scroll');
    if (!spyRoot) return;
    spyRoot.addEventListener('scroll', scheduleActiveHeading, { passive: true });
    window.addEventListener('resize', scheduleActiveHeading, { passive: true });
    updateActiveHeading();
  }

  function scheduleActiveHeading() {
    if (spyFrame || manualScrolling) return;
    spyFrame = window.requestAnimationFrame(() => {
      spyFrame = 0;
      updateActiveHeading();
    });
  }

  function updateActiveHeading() {
    if (!spyRoot || manualScrolling || !note.headings.length) return;
    const rootRect = spyRoot.getBoundingClientRect();
    const anchor = rootRect.top + Math.min(80, Math.max(16, rootRect.height * 0.16));
    let selected = 0;
    for (const [index, heading] of note.headings.entries()) {
      if (!heading.element) continue;
      if ((heading.element as HTMLElement).getBoundingClientRect().top <= anchor) selected = index;
      else break;
    }
    activeHeading.value = selected;
  }

  function teardownScrollSpy() {
    if (spyFrame) window.cancelAnimationFrame(spyFrame);
    spyFrame = 0;
    spyRoot?.removeEventListener('scroll', scheduleActiveHeading);
    window.removeEventListener('resize', scheduleActiveHeading);
    spyRoot = null;
  }

  watch(
    [() => props.content, () => props.noteType],
    async () => {
      if (isMdMode.value) return;
      await nextTick();
      note.generateTOC(props.content, props.noteType);
    },
    { immediate: true, flush: 'post' },
  );

  watch(
    () => note.headings,
    () => nextTick(setupScrollSpy),
    { deep: false },
  );

  watch(
    () => props.drawerOpen,
    async (open) => {
      if (!open) return;
      await nextTick();
      updateActiveHeading();
      const active = activeHeading.value === null ? null : drawerItemRefs.get(activeHeading.value);
      if (active && drawerListRef.value) {
        active.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    },
  );

  watch(
    () => note.headings.length,
    (length) => {
      if (!length && props.drawerOpen) emit('close');
    },
  );

  watch(
    () => bookmark.isDesktop,
    (desktop) => {
      if (desktop && props.drawerOpen) emit('close');
    },
  );

  onMounted(setupScrollSpy);
  onUnmounted(() => {
    window.clearTimeout(manualScrollTimer);
    teardownScrollSpy();
  });
</script>

<style scoped lang="less">
  .toc-container {
    height: calc(100% - 60px);
    overflow: auto;
    box-sizing: border-box;
  }

  .catalog {
    display: grid;
    gap: 2px;
    margin: 10px 10px 10px 0;
    padding: 4px 0 4px 8px;
    border-left: 1px solid var(--surface-border-color, #e8eaf2);
  }

  .toc-item.b_btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 9px;
    width: 100%;
    min-width: 0;
    min-height: 36px;
    height: auto;
    padding: 7px 10px 7px calc(10px + var(--toc-indent));
    border: 0;
    border-radius: 9px;
    background: transparent;
    color: var(--catalog-color);
    text-align: left;
  }

  .toc-item.b_btn:hover {
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 7%, transparent);
    color: var(--text-color);
  }

  .toc-item.active {
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 11%, transparent);
    color: var(--resource-note-color, #00a884);
    font-weight: 650;
  }

  .toc-marker {
    width: 5px;
    height: 5px;
    flex: 0 0 5px;
    border-radius: 50%;
    background: color-mix(in srgb, currentColor 42%, transparent);
  }

  .toc-item.active .toc-marker {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--resource-note-color, #00a884) 12%, transparent);
    background: currentColor;
  }

  .toc-text {
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toc-count {
    color: var(--desc-color);
    font-size: 12px;
    white-space: nowrap;
  }

  .phone-catalog {
    height: 100%;
    padding: 8px max(10px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom))
      max(10px, env(safe-area-inset-left));
    box-sizing: border-box;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .phone-catalog .toc-item.b_btn {
    min-height: 48px;
    padding-top: 11px;
    padding-bottom: 11px;
    border-radius: 12px;
  }

  .phone-catalog .toc-text {
    font-size: 15px;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .toc-empty {
    display: grid;
    min-height: 180px;
    place-items: center;
    margin: 0;
    color: var(--desc-color);
    font-size: 14px;
  }
</style>
