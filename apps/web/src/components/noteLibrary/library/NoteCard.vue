<template>
  <div
    @click="router.push(`/noteLibrary/${note.id}`)"
    @keydown.enter="router.push(`/noteLibrary/${note.id}`)"
    class="note-card"
    :class="{ 'is-selected': note.isCheck, 'is-batch-mode': batchMode }"
    role="button"
    tabindex="0"
    v-click-log="{ module: '笔记库', operation: `打开笔记【${note.title}】` }"
  >
    <div class="note-title-row">
      <div class="note-title" :title="note.title">{{ note.title }}</div>
      <span v-if="note.isTop" class="note-top-badge">{{ $t('common.pin') }}</span>
      <InboxPendingBadge v-if="note.isPending" />
    </div>
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
          <BButton class="tag-detail-corner" :title="$t('common.detail')" @click.stop="openTagDetail(tag)">
            <SvgIcon :src="icon.cloudSpace.share" size="11" />
          </BButton>
        </span>
        <span v-if="hiddenTagCount > 0" class="b-tag tag-more" :title="hiddenTagsLabel" @click.stop
          >+{{ hiddenTagCount }}</span
        >
      </div>
      <div v-else class="note-tags note-tags--empty"></div>
      <div class="note-time">{{ note['updateTime'] ?? note['createTime'] }}</div>
    </div>
    <div v-if="!bookmark.isMobile" class="note-select-control">
      <b-checkbox v-model:checked="note.isCheck" @click.stop />
    </div>
    <div v-else-if="!batchMode" class="note-mobile-actions" @click.stop>
      <BDropdown :trigger="'click'" :align="'right'" :menu-options="mobileMenuOptions">
        <BButton class="note-more-button" :aria-label="$t('common.more')">
          <SvgIcon :src="icon.common.more" size="18" />
        </BButton>
      </BDropdown>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import { bookmarkStore } from '@/store';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import InboxPendingBadge from '@/components/inbox/InboxPendingBadge.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import BDropdown from '@/components/base/BasicComponents/BDropdown.vue';
  const props = withDefaults(defineProps<{ note: any; batchMode?: boolean }>(), {
    batchMode: false,
  });

  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const emit = defineEmits<{
    nodeTypeChange: [tag: any];
    action: [action: 'toggleTop' | 'relateTags' | 'addInbox' | 'delete'];
  }>();

  const mobileMenuOptions = computed(() => [
    {
      label: props.note.isTop ? t('common.unpin') : t('common.pin'),
      icon: props.note.isTop ? icon.contextMenu.unpin : icon.contextMenu.pin,
      function: () => emit('action', 'toggleTop'),
    },
    {
      label: t('note.relateTags'),
      icon: icon.manage_categoryBtn_tag,
      function: () => emit('action', 'relateTags'),
    },
    {
      label: t('inbox.addExisting'),
      icon: icon.contextMenu.inbox,
      function: () => emit('action', 'addInbox'),
    },
    { divider: true },
    {
      label: t('common.delete'),
      icon: icon.table_delete,
      danger: true,
      function: () => emit('action', 'delete'),
    },
  ]);

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
    // Markdown 笔记先转换为 HTML
    let content = htmlContent || '';
    if (props.note?.type === 'markdown' && !content.includes('<')) {
      // 简单处理：纯 MD 文本，只取前 200 字作为预览
      const text = content
        .replace(/[#*`~>\[\]()_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text.length > 200 ? text.substring(0, 200) + '...' : text;
    }
    // 创建一个临时的DOM元素
    const tempElement = document.createElement('div');
    tempElement.innerHTML = content;

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
    --note-card-bg: var(--card-background);
    display: flex;
    flex-direction: column;
    height: 282px;
    position: relative;
    border-radius: 12px;
    border: 1px solid var(--surface-border-color);
    padding: 18px 20px 16px;
    box-sizing: border-box;
    cursor: pointer;
    background: var(--note-card-bg);
    box-shadow: var(--surface-card-shadow);
    transition:
      box-shadow 0.2s ease,
      border-color 0.2s ease,
      background 0.2s ease;

    &:hover,
    &:focus-visible {
      box-shadow: var(--surface-hover-shadow);
      border-color: color-mix(in srgb, var(--resource-note-color, #00a884) 34%, var(--surface-border-color));
    }

    &:hover,
    &:focus-visible,
    &.is-selected,
    &.is-batch-mode {
      .note-select-control {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }
    }

    &.is-selected {
      --note-card-bg: color-mix(in srgb, var(--resource-note-color, #00a884) 4%, var(--card-background));
      border-color: color-mix(in srgb, var(--resource-note-color, #00a884) 62%, var(--surface-border-color));
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--resource-note-color, #00a884) 18%, transparent);
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--resource-note-color, #00a884) 56%, transparent);
      outline-offset: 2px;
    }
  }

  .note-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-right: 28px;
    min-width: 0;
  }

  .note-title {
    font-size: 16px;
    font-weight: 600;
    line-height: 24px;
    color: var(--text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1 1 auto;
    min-width: 0;
    max-width: 100%;
  }

  .note-top-badge {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 999px;
    color: var(--resource-note-color, #00a884);
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 12%, transparent);
    font-size: 11px;
    font-weight: 600;
    line-height: 18px;
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
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, transparent);
      padding: 3px 10px;
      max-width: 96px;
      text-align: center;
      border-radius: 20px;
      font-size: 12px;
      color: var(--resource-note-color, #00a884);
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;

      &:hover {
        background: var(--resource-note-color, #00a884);
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

  .tag-detail-corner {
    width: 20px;
    min-width: 20px;
    height: 20px;
    margin: -2px -7px -2px 1px;
    padding: 0;
    border-radius: 999px;
    color: currentColor;
    background: transparent;
  }

  .note-time {
    font-size: 12px;
    color: var(--desc-color);
    white-space: nowrap;
    line-height: 18px;
    text-align: right;
  }

  .note-select-control {
    --primary-color: var(--resource-note-color, #00a884);
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    position: absolute;
    right: 14px;
    top: 14px;
    z-index: 2;
    transition:
      opacity 0.16s ease,
      visibility 0.16s ease;
  }

  .note-mobile-actions {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 3;
  }

  .note-more-button {
    width: 30px;
    min-width: 30px;
    height: 30px;
    padding: 0;
    border-radius: 8px;
    color: var(--desc-color);
    background: color-mix(in srgb, var(--card-background) 88%, transparent);
  }

  @media (max-width: 1023px) {
    .note-card {
      border-color: var(--surface-border-color) !important;
      box-shadow: none;
      min-width: 0;
      overflow: hidden;

      &:hover {
        transform: none;
        box-shadow: none;
      }
    }

    .note-title-row {
      padding-right: 34px;
    }

    .note-content {
      word-break: break-word;
      overflow-wrap: break-word;
    }

    .note-content::after {
      display: none;
    }
  }

  @media (max-width: 767px) {
    .note-card {
      width: 100%;
      max-width: 100%;
    }

    .note-content {
      min-width: 0;
    }

    .note-title {
      flex: 1 1 auto;
      min-width: 0;
    }

    .note-content :deep(img),
    .note-content :deep(table),
    .note-content :deep(pre) {
      max-width: 100%;
    }

    .note-content :deep(img) {
      height: auto !important;
      object-fit: contain;
    }
  }
</style>
