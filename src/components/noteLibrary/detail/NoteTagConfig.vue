<template>
  <BModal v-model:visible="visible" title="笔记标签配置" :mask-closable="false" @ok="saveTag">
    <div class="config-container">
      <div class="flex-align-center-gap">
        <b-input :maxlength="20" placeholder="请输入标签" v-model:value="tagValue" @keydown.enter="setTag" />
        <b-button @click="setTag">{{ currentTag !== -1 ? '更新' : '添加新' }}标签</b-button>
        <div class="tag-selector-container">
          <b-button @click="tagSelectorVisible = !tagSelectorVisible">选择已有标签</b-button>
          <div class="tag-selector" v-if="tagSelectorVisible">
            <div v-for="item in allTags" class="filter-item" @click="setTag(item)"
              ><span style="color: #8f91a8">#</span> {{ item }}</div
            >
          </div>
        </div>
      </div>
      <VueDraggable v-model="tagList" class="note-tag-list" :animation="150">
        <div :title="tag" class="note-tag" v-for="tag in tagList" @click="tagUpdate(tag)" :key="tag">
          <div class="text-hidden" style="width: 100%">{{ tag }}</div>
          <svg-icon :src="icon.common.close" class="dom-hover-click" @click.stop="delTag(tag)" />
        </div>
      </VueDraggable>
      <div style="font-size: 12px; color: var(--desc-color); margin-top: 10px">点击标签文本即可重新编辑选中标签</div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { inject, onMounted, ref, watch } from 'vue';
  import { checkEndCondition, endCondition } from '@/utils/validator.ts';
  import { VueDraggable } from 'vue-draggable-plus';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { apiBasePost } from '@/http/request.ts';

  const visible = defineModel('visible');

  const tagList = ref<any>([]);
  const tagValue = ref('');
  function setTag(value?: string) {
    const TagValue = typeof value === 'string' ? value : tagValue.value;
    const condition: endCondition[] = [
      {
        endCondition: currentTag.value === -1 && tagList.value.length >= 3,
        message: '最多只能关联3个标签！',
      },
      {
        endCondition: !TagValue,
        message: '内容不能为空！',
      },
      {
        endCondition: checkUnique(TagValue),
        message: '标签已经存在！',
      },
    ];
    if (checkEndCondition(condition)) {
      return;
    }
    if (currentTag.value === -1) {
      console.log('TagValue', TagValue);
      tagList.value.push(TagValue);
    } else {
      tagList.value[currentTag.value] = TagValue;
    }
    tagValue.value = '';
    currentTag.value = -1;
    tagSelectorVisible.value = false;
  }
  const currentTag = ref(-1);
  function tagUpdate(tag) {
    tagValue.value = tag;
    currentTag.value = tagList.value.indexOf(tag);
  }

  function delTag(tag) {
    const delIndex = tagList.value.indexOf(tag);
    // 如果删除的是正在编辑的标签，则取消编辑态再删除
    if (tagList.value[currentTag.value] === tagList.value[delIndex]) {
      currentTag.value = -1;
    }
    tagList.value.splice(tagList.value.indexOf(tag), 1);
  }

  function checkUnique(value) {
    if (currentTag.value !== -1) {
      if (tagList.value.includes(value)) {
        return tagList.value.indexOf(value) !== currentTag.value;
      }
      return false;
    }
    return tagList.value.includes(value);
  }

  const note: any = inject('note');
  const emit = defineEmits(['saveTag']);
  function saveTag() {
    note.tags = JSON.stringify(tagList.value);
    visible.value = false;
    emit('saveTag');
  }

  const allTags = ref([]);
  onMounted(() => {
    if (note.tags) {
      tagList.value = JSON.parse(note.tags);
    }
    apiBasePost('/api/note/queryNoteList').then((res) => {
      if (res.status === 200) {
        let noteList = res.data ?? [];
        noteList.forEach((data) => {
          const tags = data.tags ? JSON.parse(data.tags) : null;
          if (tags) {
            tags.forEach((tag) => {
              if (!allTags.value.includes(tag)) {
                allTags.value.push(tag);
              }
            });
          }
        });
      }
    });
  });

  const tagSelectorVisible = ref(false);
  function closeSelector(e: any) {
    const topDom = document.querySelector('.tag-selector-container');

    if (!topDom?.contains(e.target)) {
      tagSelectorVisible.value = false;
    }
  }
  watch(
    () => tagSelectorVisible.value,
    (val) => {
      if (val) {
        document.addEventListener('click', closeSelector, true);
      } else {
        document.removeEventListener('click', closeSelector, true);
      }
    },
  );
</script>

<style lang="less" scoped>
  .config-container {
    height: 100px;
    width: 600px;
    @media (max-width: 1000px) {
      width: 100%;
    }
  }
  .note-tag-list {
    height: 28px;
    margin-top: 20px;
    display: flex;
    gap: 10px;
    padding: 4px;
    border-radius: 8px;
  }
  .note-tag {
    cursor: move;
    border: 1px solid #ccc;
    width: max-content;
    padding: 2px 6px;
    border-radius: 6px;
    max-width: 180px;
    display: flex;
    gap: 5px;
    align-items: center;
    text-align: center;
    font-size: 14px;
    box-sizing: border-box;
    color: var(--text-color);
  }
  .tag-selector-container {
    //padding: 4px;
    //border-radius: 4px;
    //width: 160px;
    //border: 1px solid;
    position: relative;
  }
  .tag-selector {
    padding: 4px 0;
    position: absolute;
    z-index: 1;
    top: 36px;
    left: 0;
    border-radius: 4px;
    overflow: hidden;
    background: var(--user-body-bg-color);
    width: max-content;
    min-width: 114px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    box-shadow: 0 1px 5px rgba(0, 0, 0, 0.2);
  }
  .filter-item {
    text-align: left;
    padding: 0 10px;
    box-sizing: border-box;
    width: 100%;
    height: 24px;
    font-size: 14px;
    cursor: pointer;
    @media (min-width: 600px) {
      &:hover {
        transition: all 0.1s;
        background: #eeedff;
        color: #605ce5;
      }
    }
  }
</style>
