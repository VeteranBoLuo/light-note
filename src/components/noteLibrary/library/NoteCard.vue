<template>
  <div
    @click="router.push(`/noteLibrary/${note.id}`)"
    class="note-card"
    :style="{ boxShadow: bookmark.currentTheme === 'day' ? 'rgb(237, 242, 250) 0px 0px 10px' : 'unset' }"
  >
    <div class="note-title" :title="note.title">{{ note.title }}</div>
    <div
      class="note-content"
      :style="{ color: bookmark.currentTheme === 'day' ? 'rgb(102, 102, 102)' : '#ccc' }"
      v-html="extractAndConvertTags(note.content)"
    />
    <div class="note-tags" v-if="getTags(note)">
      <div :title="tag" class="b-tag text-hidden" v-for="tag in getTags(note)" @click.stop="noteTypeChange(tag)">{{
        tag
      }}</div>
    </div>
    <div class="note-tags" v-else style="font-size: 12px">_</div>
    <div
      :style="{ color: bookmark.currentTheme === 'day' ? 'rgb(102, 102, 102)' : '#ccc' }"
      style="font-size: 12px; margin-top: 10px"
      >{{ note['updateTime'] ?? note['createTime'] }}</div
    >
    <div v-if="!bookmark.isMobile" class="checkBox" :style="{ visibility: note.isCheck === true ? 'visible' : '' }">
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
      return JSON.parse(note.tags);
    }
    return '';
  };

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
</script>

<style lang="less" scoped>
  .note-card {
    height: 300px;
    position: relative;
    border-radius: 8px;
    border: 1px solid #edf2fa;
    padding: 20px;
    box-sizing: border-box;
    cursor: pointer;
    &:hover .checkBox {
      visibility: visible;
    }
  }

  .note-title {
    font-size: 16px;
    font-weight: 600;
    line-height: 24px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1 1 0;
    margin-right: 10px;
  }
  .note-content {
    box-sizing: border-box;
    color: #666;
    font-size: 12px;
    line-height: 1rem;
    height: 180px;
    overflow: hidden;
    :deep(li) {
      margin-top: 5px;
    }
    :deep(div) {
      margin-top: 5px;
    }
  }
  .note-tags {
    margin-top: 10px;
    display: flex;
    gap: 10px;
    .b-tag {
      background-color: #eeedff;
      padding: 2px 4px;
      max-width: 80px;
      text-align: center;
      border-radius: 6px;
      font-size: 12px;
      color: #8b88f2;
      cursor: pointer;
    }
  }
  .checkBox {
    visibility: hidden;
    position: absolute;
    right: 20px;
    top: 25px;
  }
</style>
