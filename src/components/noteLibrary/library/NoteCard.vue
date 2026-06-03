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
      <div v-else class="note-tags note-tags--empty"></div>
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
    --note-card-bg: color-mix(in srgb, var(--background-color) 94%, var(--card-bg-color) 6%);
    display: flex;
    flex-direction: column;
    height: 282px;
    position: relative;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 82%, var(--desc-color) 18%);
    padding: 18px 20px 16px;
    box-sizing: border-box;
    cursor: pointer;
    background: var(--note-card-bg);
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.02) inset,
      0 8px 18px rgba(0, 0, 0, 0.08);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease,
      border-color 0.2s ease;

    &:hover {
      transform: translateY(-2px);
      box-shadow:
        0 1px 0 rgba(255, 255, 255, 0.03) inset,
        0 12px 28px rgba(0, 0, 0, 0.14);
      border-color: color-mix(in srgb, var(--primary-color) 36%, var(--card-border-color));

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
    max-width: calc(100% - 32px);
  }

  .note-content {
    position: relative;
    box-sizing: border-box;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.58;
    flex: 1 1 auto;
    min-height: 0;
    margin-top: 10px;
    overflow: hidden;
    max-height: 154px;

    // 底部渐变淡出，避免硬截断
    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 42px;
      background: linear-gradient(to bottom, transparent, var(--note-card-bg));
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
    margin-top: auto;
    padding-top: 12px;
    min-height: 54px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
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
    margin: -7px 0 7px;

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

    &--empty {
      padding-top: 0;
      margin-top: 0;
      visibility: hidden;
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
    right: 18px;
    top: 20px;
  }

  @media (max-width: 1023px) {
    .note-card {
      border-color: var(--card-border-color) !important;
      box-shadow: none;
      min-width: 0;
      overflow: hidden;

      &:hover {
        transform: none;
        box-shadow: none;
      }
    }

    .note-content {
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .note-content::after {
      display: none;
    }
  }
</style>
