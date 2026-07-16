<template>
  <div class="toc-container">
    <div :class="[bookmark.isMobile ? 'phone-catalog' : 'catalog']" v-if="!bookmark.isMobile || isShowPhoneCategory">
      <div
        v-for="(heading, index) in note.headings"
        :key="index"
        @click="() => scrollToHeading(index)"
        :class="{ active: activeHeading === index }"
        class="toc-item"
        :style="{ paddingLeft: `${heading.level * 16}px` }"
        v-click-log="{ module: '笔记', operation: `点击目录【${heading.text}】` }"
      >
        <span class="toc-line" v-if="activeHeading === index"></span>
        <span class="text-hidden" style="font-size: 14px">{{ heading.text }}</span>
      </div>
    </div>
    <div
      v-if="bookmark.isMobile && note.headings.length > 0"
      class="folder"
      title="目录"
      @click="getCategory"
      v-click-log="{ module: '笔记', operation: '切换目录显示' }"
    >
      <svg-icon :src="icon.noteDetail.catalogue" size="24" style="color: var(--text-color)" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
  import { bookmarkStore, noteStore } from '@/store';
  import { customTimer } from '@/utils/common.ts';
  import { scrollIntoContainer } from '@/utils/zoom.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  const bookmark = bookmarkStore();
  const props = defineProps<{
    content: string;
    noteType?: string;
  }>();
  const emit = defineEmits<{
    markdownHeadingClick: [index: number];
  }>();
  const isMdMode = computed(() => props.noteType === 'markdown');
  const note = noteStore();
  const activeHeading = ref<number | null>(null);
  let observer: IntersectionObserver | null = null;
  let manualScrolling = false;

  const scrollToHeading = async (index: number) => {
    if (isMdMode.value) {
      if (!note.headings[index]) return;
      manualScrolling = true;
      activeHeading.value = index;
      emit('markdownHeadingClick', index);
      if (bookmark.isMobile) isShowPhoneCategory.value = false;
      window.setTimeout(() => {
        manualScrolling = false;
      }, 700);
      return;
    }
    manualScrolling = true;
    activeHeading.value = index;
    if (bookmark.screenWidth < 1500) {
      await customTimer(100);
    }
    const heading = note.headings[index];
    const scrollContainer = document.querySelector<HTMLElement>('.note-editor-scroll');
    if (heading && scrollContainer) {
      scrollIntoContainer(scrollContainer, heading.element as HTMLElement, 5);
    }
    setTimeout(() => {
      manualScrolling = false;
    }, 800);
  };

  const setupScrollSpy = () => {
    if (observer) observer.disconnect();
    if (!note.headings.length) return;

    // MD 模式：监听预览区
    if (isMdMode.value) {
      const previewPane = document.querySelector('.md-preview');
      if (!previewPane) return;
      const entries = new Map<Element, number>();
      note.headings.forEach((heading, index) => {
        if (heading.element && previewPane.contains(heading.element)) {
          entries.set(heading.element, index);
        }
      });
      if (!entries.size) return;
      observer = new IntersectionObserver(
        (observed) => {
          if (manualScrolling) return;
          const visible: { index: number; top: number }[] = [];
          observed.forEach((entry) => {
            if (entry.isIntersecting && entries.has(entry.target)) {
              visible.push({
                index: entries.get(entry.target)!,
                top: entry.boundingClientRect.top,
              });
            }
          });
          if (!visible.length) return;
          visible.sort((a, b) => a.top - b.top);
          const best = visible.find((v) => v.top > 0) || visible[0];
          activeHeading.value = best.index;
        },
        { root: previewPane, rootMargin: '-10px 0px -40% 0px', threshold: 0 },
      );
      entries.forEach((_index, element) => observer!.observe(element));
      return;
    }

    // HTML 模式：原有逻辑
    const scrollContainer = document.querySelector('.note-editor-scroll');
    if (!scrollContainer) return;
    const entries = new Map<Element, number>();
    note.headings.forEach((heading, index) => {
      if (heading.element) entries.set(heading.element, index);
    });
    observer = new IntersectionObserver(
      (observed) => {
        if (manualScrolling) return;
        const visible: { index: number; ratio: number; top: number }[] = [];
        observed.forEach((entry) => {
          if (entry.isIntersecting && entries.has(entry.target)) {
            visible.push({
              index: entries.get(entry.target)!,
              ratio: entry.intersectionRatio,
              top: entry.boundingClientRect.top,
            });
          }
        });
        if (!visible.length) return;
        visible.sort((a, b) => a.top - b.top);
        const best = visible.find((v) => v.top > 0) || visible[0];
        activeHeading.value = best.index;
      },
      { root: scrollContainer, rootMargin: '-10px 0px -40% 0px', threshold: 0 },
    );
    entries.forEach((_index, element) => observer!.observe(element));
  };

  const isShowPhoneCategory = ref(false);
  function getCategory() {
    isShowPhoneCategory.value = !isShowPhoneCategory.value;
  }

  function closeCategory(e: any) {
    const topDom = document.querySelector('.toc-container');
    if (!topDom?.contains(e.target)) {
      isShowPhoneCategory.value = false;
    }
  }

  watch(
    () => isShowPhoneCategory.value,
    (val) => {
      if (val) {
        document.addEventListener('click', closeCategory);
      } else {
        document.removeEventListener('click', closeCategory);
      }
    },
  );

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
    () => {
      nextTick(() => setupScrollSpy());
    },
  );

  onMounted(() => {
    setupScrollSpy();
  });

  onUnmounted(() => {
    document.removeEventListener('click', closeCategory);
    if (observer) observer.disconnect();
  });
</script>

<style scoped>
  .toc-container {
    height: calc(100% - 60px);
    overflow: auto;
    box-sizing: border-box;
  }

  .toc-item {
    cursor: pointer;
    padding: 5px 0;
    position: relative;
    display: flex;
    align-items: center;
    color: var(--catalog-color);
  }

  .toc-item.active {
    font-weight: bold;
    color: #615ced !important;
  }

  .toc-line {
    position: absolute;
    left: -1px;
    width: 2px;
    height: 1.5rem;
    background-color: #615ced;
  }
  .folder {
    position: fixed;
    right: 14px;
    top: 73px;
    width: 34px;
    height: 34px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--background-color) 88%, transparent);
    border: 1px solid var(--card-border-color);
    box-sizing: border-box;
    color: white;
    cursor: pointer;
    z-index: 999;
  }
  .catalog {
    border-left: 1px solid #e8eaf2;
    margin: 10px 10px 10px 0;
    box-sizing: border-box;
  }
  .phone-catalog {
    position: fixed;
    top: 116px;
    right: 14px;
    z-index: 999;
    background: var(--menu-container-bg-color);
    width: min(260px, calc(100vw - 28px));
    border-radius: 8px;
    box-shadow:
      0 6px 16px 0 rgba(0, 0, 0, 0.08),
      0 3px 6px -4px rgba(0, 0, 0, 0.12),
      0 9px 28px 8px rgba(0, 0, 0, 0.05);
    max-height: 50%;
    overflow-y: auto;
    .toc-item.active {
      color: #615ced !important;
    }
  }
</style>
