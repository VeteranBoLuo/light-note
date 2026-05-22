<template>
  <div
    @click="router.push(`/noteLibrary/${note.id}`)"
    class="note-card"
    v-click-log="{ module: '笔记库', operation: `打开笔记【${note.title}】` }"
  >
    <div class="note-title" :title="note.title">{{ note.title }}</div>
    <div class="note-content" v-html="extractAndConvertTags(note.content)" />
    <div class="note-footer">
      <div class="note-tags" v-if="note.tags && note.tags.length">
        <span
          :key="tag.id || tag.name"
          :title="tag.name"
          class="b-tag tag-detail-chip"
          v-for="tag in visibleTags"
          @click.stop="noteTypeChange(tag)"
          v-click-log="{ module: '笔记库', operation: `筛选标签【${tag.name}】` }"
        >
          <span class="tag-detail-label">{{ tag.name }}</span>
          <button class="tag-detail-corner" type="button" :title="$t('common.detail')" @click.stop="openTagDetail(tag)">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M6 4h6v6M12 4 5 11" />
            </svg>
          </button>
        </span>
        <span v-if="hiddenTagCount > 0" class="b-tag tag-more" :title="hiddenTagsLabel" @click.stop
          >+{{ hiddenTagCount }}</span
        >
      </div>
      <div class="note-time">{{ note['updateTime'] ?? note['createTime'] }}</div>
    </div>
    <div v-if="!bookmark.isMobile" class="checkBox" :style="{ visibility: note.isCheck === true ? 'visible' : '' }">
      <b-checkbox v-model:isCheck="note.isCheck" @click.stop />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import router from '@/router';
  import { bookmarkStore } from '@/store';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  const props = defineProps<{ note: any }>();

  const bookmark = bookmarkStore();

  const MAX_VISIBLE_TAGS = 3;
  const visibleTags = computed(() => (props.note.tags || []).slice(0, MAX_VISIBLE_TAGS));
  const hiddenTagCount = computed(() => Math.max(0, (props.note.tags || []).length - MAX_VISIBLE_TAGS));
  const hiddenTagsLabel = computed(() =>
    (props.note.tags || [])
      .slice(MAX_VISIBLE_TAGS)
      .map((t: any) => t.name)
      .join('、'),
  );

  // 提取<h>和<p>标签等并转换为<p>标签
  const extractAndConvertTags = (htmlContent: string) => {
    // 创建一个临时的DOM元素
    const tempElement = document.createElement('div');
    tempElement.innerHTML = htmlContent;

    // 获取所有的<h>和<p>标签
    const allowedTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'span', 'div', 'pre', 'table', 'tr', 'td'];
    const extractedContent = Array.from(tempElement.querySelectorAll('*'))
      .filter((el) => allowedTags.includes(el.tagName.toLowerCase()))
      .map((el) => {
        // 移除元素的样式和类属性
        el.removeAttribute('style');
        el.removeAttribute('class');

        // 将<h>标签转换为<p>标签
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(el.tagName.toLowerCase())) {
          const newElement = document.createElement('p');
          newElement.innerHTML = el.innerHTML;
          return newElement.outerHTML;
        }
        return el.outerHTML;
      })
      .join('');

    return extractedContent;
  };
  const emit = defineEmits(['nodeTypeChange']);
  const noteTypeChange = function (tag) {
    emit('nodeTypeChange', tag);
  };

  function openTagDetail(tag) {
    if (!tag?.id) return;
    router.push(`/tag/${tag.id}`);
  }
</script>

<style lang="less" scoped>
  .note-card {
    display: flex;
    flex-direction: column;
    height: 300px;
    position: relative;
    border-radius: 10px;
    border: 1px solid var(--card-border-color);
    padding: 20px;
    box-sizing: border-box;
    cursor: pointer;
    background: var(--background-color);
    box-shadow:
      0 1px 3px rgba(0, 0, 0, 0.04),
      0 1px 2px rgba(0, 0, 0, 0.06);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease,
      border-color 0.2s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow:
        0 8px 24px rgba(97, 92, 237, 0.1),
        0 2px 8px rgba(0, 0, 0, 0.08);
      border-color: #8b88f2;

      .checkBox {
        visibility: visible;
      }
    }
  }

  .note-title {
    font-size: 16px;
    font-weight: 600;
    line-height: 24px;
    color: var(--text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 0 0 auto;
  }

  .note-content {
    position: relative;
    box-sizing: border-box;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 10px;
    overflow: hidden;

    // 底部渐变淡出，避免硬截断
    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 48px;
      background: linear-gradient(to bottom, transparent, var(--background-color));
      pointer-events: none;
    }

    :deep(li) {
      margin-top: 4px;
    }
    :deep(div) {
      margin-top: 4px;
    }
    :deep(p) {
      margin: 0 0 4px;
    }
  }

  .note-footer {
    flex: 0 0 auto;
    margin-top: 14px;
  }

  .note-tags {
    display: flex;
    gap: 6px;
    flex-wrap: nowrap;
    width: 100%;
    padding: 7px 7px 0 0;
    box-sizing: border-box;
    min-height: 24px;
    overflow: hidden;
    align-items: center;
    margin: -7px 0 6px;

    .b-tag {
      background-color: #eeedff;
      padding: 3px 10px;
      max-width: 96px;
      text-align: center;
      border-radius: 20px;
      font-size: 12px;
      color: #615ced;
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;

      &:hover {
        background-color: #615ced;
        color: #fff;
      }
    }

    .tag-more {
      background-color: var(--common-tag-bg-color, #f0f0f0);
      color: var(--desc-color);
      cursor: default;

      &:hover {
        background-color: var(--common-tag-bg-color, #f0f0f0);
        color: var(--desc-color);
      }
    }
  }

  .note-time {
    font-size: 12px;
    color: var(--desc-color);
    white-space: nowrap;
    line-height: 18px;
    text-align: right;
  }

  .checkBox {
    visibility: hidden;
    position: absolute;
    right: 20px;
    top: 22px;
  }

  @media (max-width: 1023px) {
    .note-card {
      border-color: var(--card-border-color) !important;
      box-shadow: none;

      &:hover {
        transform: none;
        box-shadow: none;
      }
    }

    .note-content::after {
      display: none;
    }
  }
</style>
