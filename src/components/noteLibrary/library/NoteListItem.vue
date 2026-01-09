<template>
  <div class="note-list-item" @click="router.push(`/noteLibrary/${note.id}`)">
    <div class="note-info">
      <div class="note-title">{{ note.title }}</div>
      <div class="note-description" v-html="getDescription(note.content)"></div>
      <div class="note-tags" v-if="getTags(note)">
        <span class="b-tag" v-for="tag in getTags(note)" @click.stop="noteTypeChange(tag)">{{ tag.name }}</span>
      </div>
      <div class="note-tags" v-else style="font-size: 12px">_</div>
    </div>
    <div class="note-time">{{ note['updateTime'] ?? note['createTime'] }}</div>
    <div
      class="checkBox"
      v-if="!bookmark.isMobileDevice"
      :style="{ visibility: note.isCheck === true ? 'visible' : 'auto' }"
    >
      <b-checkbox v-model:isCheck="note.isCheck" @click.stop />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import router from '@/router';
  import { bookmarkStore } from '@/store';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';

  const props = defineProps<{ note: any }>();
  const bookmark = bookmarkStore();

  const getTags = function (note) {
    if (note.tags) {
      return note.tags;
    }
    return '';
  };

  const getDescription = (htmlContent: string) => {
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
</script>

<style lang="less" scoped>
  .note-list-item {
    display: flex;
    align-items: flex-start;
    padding: 20px;
    margin-bottom: 15px;
    background: var(--background-color);
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    &:hover {
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
      border-color: var(--primary-color);
      .checkBox {
        visibility: visible;
      }
    }
    .note-info {
      flex: 1;
      .note-title {
        font-size: 18px;
        font-weight: 600;
        color: var(--text-color);
        margin-bottom: 8px;
        line-height: 1.4;
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
        .b-tag {
          background-color: var(--tag-bg-color, #eeedff);
          color: var(--tag-color, #8b88f2);
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
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
