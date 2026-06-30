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
    <div v-if="bookmark.isMobile && note.headings.length > 0" class="folder" title="目录" @click="getCategory" v-click-log="{ module: '笔记', operation: '切换目录显示' }">
      <svg-icon :src="icon.noteDetail.catalogue" size="24" style="color: var(--text-color)" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
  import { bookmarkStore, noteStore } from '@/store';
  import { customTimer } from '@/utils/common.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  const bookmark = bookmarkStore();
  const props = defineProps<{
    content: string;
    noteType?: string;
  }>();
  const isMdMode = computed(() => props.noteType === 'markdown');
  const note = noteStore();
  const activeHeading = ref<number | null>(null);
  let observer: IntersectionObserver | null = null;
  let manualScrolling = false;

  const scrollToHeading = async (index: number) => {
    if (isMdMode.value) {
      // MD 模式：聚焦到 textarea 对应位置（粗略定位到标题行）
      const mdTextarea = document.querySelector<HTMLTextAreaElement>('.md-textarea');
      if (!mdTextarea) return;
      const headings = note.headings;
      if (!headings[index]) return;
      activeHeading.value = index;
      // 在 textarea 中搜索第 index 个标题，移动到附近
      const lines = mdTextarea.value.split('\n');
      let lineCount = 0;
      let hCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/^#{1,6}\s/.test(lines[i])) {
          if (hCount === index) {
            lineCount = i;
            break;
          }
          hCount++;
        }
      }
      const lineHeight = 20;
      mdTextarea.focus();
      mdTextarea.scrollTop = Math.max(0, lineCount * lineHeight - 100);
      return;
    }
    manualScrolling = true;
    activeHeading.value = index;
    if (bookmark.screenWidth < 1500) {
      await customTimer(100);
    }
    const heading = note.headings[index];
    if (heading) {
      heading.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => { manualScrolling = false; }, 800);
  };

  const setupScrollSpy = () => {
    if (observer) observer.disconnect();
    if (!note.headings.length) return;

    // MD 模式：监听预览区
    if (isMdMode.value) {
      const previewPane = document.querySelector('.md-preview');
      if (!previewPane) return;
      const hTags = previewPane.querySelectorAll('h1, h2, h3, h4, h5, h6');
      if (!hTags.length) return;
      const entries = new Map<Element, number>();
      // 把预览区的 h 标签和目录的 heading 索引对应起来
      let hIdx = 0;
      hTags.forEach((el) => {
        // 找第 hIdx 个有文本的头部
        while (hIdx < note.headings.length) {
          const mdText = note.headings[hIdx].text;
          const domText = (el.textContent || '').trim();
          if (domText.includes(mdText) || mdText.includes(domText)) {
            entries.set(el, hIdx);
            hIdx++;
            return;
          }
          hIdx++;
        }
      });
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
      hTags.forEach((el) => observer!.observe(el));
      return;
    }

    // HTML 模式：原有逻辑
    const scrollContainer = document.querySelector('.note-editor-scroll');
    if (!scrollContainer) return;
    const entries = new Map<Element, number>();
    note.headings.forEach((h, i) => entries.set(h.element, i));
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
    note.headings.forEach((h) => observer!.observe(h.element));
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
    () => props.content,
    async () => {
      await nextTick();
      note.generateTOC();
    },
    { immediate: true, flush: 'post' },
  );

  watch(
    () => note.headings.length,
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
    right: 5px;
    top: 10%;
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
    top: 13%;
    right: 20px;
    z-index: 999;
    background: var(--menu-container-bg-color);
    width: 200px;
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
