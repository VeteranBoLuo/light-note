<template>
  <div class="toc-container">
    <div
      :class="[bookmark.isMobileDevice ? 'phone-catalog' : 'catalog']"
      v-if="!bookmark.isMobileDevice || isShowPhoneCategory"
    >
      <div
        v-for="(heading, index) in note.headings"
        :key="index"
        @click="() => scrollToHeading(index)"
        :class="{ active: activeHeading === index }"
        class="toc-item"
        :style="{ paddingLeft: `${heading.level * 16}px` }"
      >
        <span class="toc-line" v-if="activeHeading === index"></span>
        <span class="text-hidden" style="font-size: 14px">{{ heading.text }}</span>
      </div>
    </div>
    <div v-if="bookmark.isMobileDevice && note.headings.length > 0" class="folder" title="目录" @click="getCategory">
      <svg-icon :src="icon.noteDetail.catalogue" size="24" style="color: var(--text-color)" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { nextTick, ref, watch } from 'vue';
  import { bookmarkStore, noteStore } from '@/store';
  import { customTimer } from '@/utils/common.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  const bookmark = bookmarkStore();
  const props = defineProps<{
    content: string;
  }>();
  const note = noteStore();
  const activeHeading = ref<number | null>(null);

  const scrollToHeading = async (index: number) => {
    activeHeading.value = index;
    // 平板和手机
    if (bookmark.screenWidth < 1500) {
      await customTimer(100);
    }
    const heading = note.headings[index];
    if (heading) {
      heading.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
    () => {
      note.generateTOC();
    },
  );
</script>

<style scoped>
  .toc-container {
    width: 300px;
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
    right: 20px;
    top: 10%;
    color: white;
    cursor: pointer;
    z-index: 999;
  }
  .catalog {
    border-left: 1px solid #e8eaf2;
    margin: 10px;
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
  @media (max-width: 1919px) {
    .toc-container {
      width: 280px;
    }
  }
  @media (max-width: 1500px) {
    .toc-container {
      width: 250px;
    }
  }
  @media (max-width: 1200px) {
    .toc-container {
      width: 200px;
    }
  }
  @media (max-width: 1000px) {
    .toc-container {
      width: 170px;
    }
  }
  @media (max-width: 800px) {
    .toc-container {
      width: 150px;
    }
  }
</style>
