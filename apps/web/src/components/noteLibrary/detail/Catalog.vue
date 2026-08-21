<template>
  <!--
    桌面端常驻 DOM、用 is-collapsed 折叠，而不是 v-if 直接挂载/卸载：
    后者会让编辑区宽度瞬间跳变（实测 875px ↔ 1070px），新打一个标题时表现为
    「闪一下把右侧内容挤开」。折叠态宽度为 0 且 overflow: hidden，
    不会留下 .catalog 左边框那个空框；同时用 inert 关掉焦点与辅助技术可见性。

    刻意不用 <Transition>：本组件是 aside / BDrawer 的 v-if/v-else 双分支，
    同时只渲染一个所以父级的 .catalog-panel（决定宽度）能正常透传；
    一旦包上 Transition 就变成真多根，那个 class 会被静默丢弃。
  -->
  <aside
    v-if="variant === 'embedded' || (variant === 'auto' && bookmark.isDesktop)"
    class="toc-container"
    :class="{ 'is-collapsed': variant === 'auto' && collapsed, 'is-embedded': variant === 'embedded' }"
    :inert="variant === 'auto' && !note.headings.length ? true : undefined"
    :aria-hidden="variant === 'auto' && !note.headings.length ? true : undefined"
  >
    <NoteOutlineList
      :headings="note.headings"
      :active-index="activeHeading"
      :show-empty="variant === 'embedded'"
      @select="scrollToHeading"
    />
  </aside>

  <!-- 桌面端的目录已由上面的 aside 常驻承担，抽屉只服务平板/手机 -->
  <BDrawer
    v-else-if="variant === 'auto'"
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
    <NoteOutlineList
      ref="drawerListRef"
      :headings="note.headings"
      :active-index="activeHeading"
      mobile
      @select="scrollToHeading"
    />
  </BDrawer>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, noteStore } from '@/store';
  import { scrollIntoContainer } from '@/utils/zoom.ts';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import NoteOutlineList from '@/components/noteLibrary/detail/NoteOutlineList.vue';

  const bookmark = bookmarkStore();
  const note = noteStore();
  const { t } = useI18n();
  const props = withDefaults(
    defineProps<{
      content: string;
      noteType?: string;
      drawerOpen?: boolean;
      /**
       * 首屏「先把目录的位置留出来」。父级在内容到手时按字符串粗判，
       * 解析出真正的 headings 之后就会关掉（见 NoteDetail 的 catalogPresumed）。
       */
      presumeHeadings?: boolean;
      variant?: 'auto' | 'embedded';
    }>(),
    {
      noteType: 'html',
      drawerOpen: false,
      presumeHeadings: false,
      variant: 'auto',
    },
  );
  const emit = defineEmits<{
    markdownHeadingClick: [index: number];
    close: [];
  }>();
  const isMdMode = computed(() => props.noteType === 'markdown');
  /*
   * 折叠只影响版面(宽度),所以要认 presumeHeadings —— 首屏解析出来之前先按「有目录」占位,
   * 免得正文先铺满整宽、解析完又被推回去。
   * inert / aria-hidden 仍只看真实 headings:位置留着但还没内容时,不该能被聚焦或读屏。
   */
  const collapsed = computed(() => !note.headings.length && !props.presumeHeadings);
  const activeHeading = ref<number | null>(null);
  const drawerListRef = ref<{ scrollActiveIntoView: (behavior?: ScrollBehavior) => Promise<void> } | null>(null);
  let manualScrolling = false;
  let manualScrollTimer = 0;
  let spyRoot: HTMLElement | null = null;
  let spyFrame = 0;

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
    if (props.variant === 'auto' && bookmark.isMobileDevice) emit('close');
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
      await drawerListRef.value?.scrollActiveIntoView('smooth');
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
      if (props.variant === 'auto' && desktop && props.drawerOpen) emit('close');
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
    overflow: hidden;
    box-sizing: border-box;
  }

  .toc-container.is-embedded {
    width: 100%;
    height: 100%;
  }

  .toc-count {
    color: var(--desc-color);
    font-size: 12px;
    white-space: nowrap;
  }
</style>
