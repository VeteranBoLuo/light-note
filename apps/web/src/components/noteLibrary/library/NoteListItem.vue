<template>
  <div
    class="note-list-item"
    @click="router.push(`/noteLibrary/${note.id}`)"
    v-click-log="{ module: '笔记库', operation: `打开笔记【${note.title}】` }"
  >
    <div class="note-info">
      <div class="note-title-row">
        <div class="note-title">{{ note.title }}</div>
        <InboxPendingBadge v-if="note.isPending" />
      </div>
      <div class="note-description" v-html="getDescription(note.content)"></div>
      <div class="note-tags" v-if="getTags(note)">
        <span
          class="b-tag tag-detail-chip"
          v-for="tag in getTags(note)"
          :key="tag.id || tag.name"
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
      </div>
      <div class="note-tags" v-else style="font-size: 12px">_</div>
    </div>
    <div class="note-time">{{ note['updateTime'] ?? note['createTime'] }}</div>
    <div class="checkBox" v-if="!bookmark.isMobile" :style="{ visibility: note.isCheck === true ? 'visible' : 'auto' }">
      <b-checkbox v-model:checked="note.isCheck" @click.stop />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import router from '@/router';
  import { bookmarkStore } from '@/store';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import InboxPendingBadge from '@/components/inbox/InboxPendingBadge.vue';

  const props = defineProps<{ note: any }>();
  const bookmark = bookmarkStore();

  const getTags = function (note) {
    if (note.tags) {
      return note.tags;
    }
    return '';
  };

  const getDescription = (htmlContent: string) => {
    // Markdown 笔记
    if (props.note?.type === 'markdown' && !(htmlContent || '').includes('<')) {
      const text = (htmlContent || '')
        .replace(/[#*`~>\[\]()_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text.length > 150 ? text.substring(0, 150) + '...' : text;
    }
    // 提取文本内容作为描述
    const tempElement = document.createElement('div');
    tempElement.innerHTML = htmlContent;
    const text = tempElement.textContent || tempElement.innerText || '';
    return text.length > 150 ? text.substring(0, 150) + '...' : text;
  };

  const formatTime = (timeStr: string) => {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' });
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
  .note-list-item {
    display: flex;
    align-items: flex-start;
    padding: 20px;
    margin-bottom: 15px;
    background: var(--card-background);
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    cursor: pointer;
    box-shadow: var(--surface-card-shadow);
    &:hover {
      box-shadow: var(--surface-hover-shadow);
      border-color: color-mix(in srgb, var(--resource-note-color, #00a884) 34%, var(--surface-border-color));
      .checkBox {
        visibility: visible;
      }
    }
    .note-info {
      flex: 1;
      min-width: 0;
      .note-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .note-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-color);
        margin-bottom: 8px;
        line-height: 1.4;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .note-description {
        font-size: 14px;
        color: var(--desc-color);
        width: calc(100% - 20px);
        margin-bottom: 10px;
        line-height: 1.5;
        word-break: break-all;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .note-tags {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        padding-top: 7px;
        margin-top: -7px;
        .b-tag {
          background-color: var(--tag-bg-color, #eeedff);
          color: var(--tag-color, #8b88f2);
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          max-width: 140px;
          &:hover {
            background-color: #605ce5;
            color: white;
          }
        }
      }
    }
    .note-time {
      font-size: 12px;
      color: var(--desc-color);
      margin-right: 20px;
      white-space: nowrap;
      align-self: flex-start;
    }
    .checkBox {
      visibility: hidden;
      align-self: flex-start;
    }
  }
</style>
