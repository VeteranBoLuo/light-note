<template>
  <div class="note-header">
    <div style="display: flex; align-items: center" :style="{ gap: bookmark.isMobileDevice ? '0' : '20px' }">
      <div class="back-icon" @click="back">
        <SvgIcon :src="icon.noteDetail.back" />
      </div>
      <div
        v-if="!bookmark.isMobileDevice"
        class="note-header-title n-title"
        :contenteditable="!readonly"
        id="note-header-title"
        @focusout="$emit('focusout')"
      >
      </div>
      <div
        style="color: #c0c0c0; font-size: 12px"
        v-if="!isStartEdit"
        :style="{ marginLeft: bookmark.isMobileDevice ? '20px' : '0' }"
      >
        <span v-show="note.id"> 已保存于 {{ updateTime }} </span>
      </div>
      <div
        v-else
        style="color: #c0c0c0; font-size: 12px"
        :style="{ marginLeft: bookmark.isMobileDevice ? '20px' : '0' }"
      >
        <span>保存中...</span>
      </div>
    </div>
    <div class="flex-align-center" style="gap: 20px">
      <a-tooltip title="更新标签">
        <div class="note-header-title-icon" @click="updateTag" v-click-log="OPERATION_LOG_MAP.note.updateTag">
          <SvgIcon :src="icon.manage_categoryBtn_tag" />
        </div>
      </a-tooltip>
      <a-tooltip title="导出为PDF">
        <div class="note-header-title-icon" @click="exportToPDF" v-click-log="OPERATION_LOG_MAP.note.exportPdf">
          <SvgIcon :src="icon.noteDetail.export" />
        </div>
      </a-tooltip>
      <a-tooltip title="删除">
        <div class="note-header-title-icon" @click="$emit('del')" v-click-log="OPERATION_LOG_MAP.note.deleteNote">
          <SvgIcon :src="icon.noteDetail.delete" />
        </div>
      </a-tooltip>
      <a-tooltip title="保存" v-if="!bookmark.isMobileDevice">
        <div class="note-header-title-icon" @click="$emit('save')" v-click-log="OPERATION_LOG_MAP.note.saveNote">
          <SvgIcon :src="icon.noteDetail.save" />
        </div>
      </a-tooltip>
    </div>
    <NoteTagConfig v-model:visible="tagConfDlgVisible" v-if="tagConfDlgVisible" @saveTag="$emit('saveTag')" />
    <b-loading :loading="loading" class="both-center" title="生成PDF中" />
  </div>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore } from '@/store';
  import router from '@/router';
  import { ref } from 'vue';
  import NoteTagConfig from '@/components/noteLibrary/detail/NoteTagConfig.vue';
  import { generatePDF } from '@/utils/htmlToPdf.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';

  const props = defineProps<{
    updateTime: string;
    nodeType: 'edit' | 'add' | 'share';
    readonly: boolean;
    isStartEdit: boolean;
    note: any;
  }>();

  const bookmark = bookmarkStore();

  function back() {
    // 处于保存中的状态时，延迟300ms跳转，避免同时进行保存和跳转导致的异常情况
    setTimeout(
      () => {
        if (props.nodeType === 'add') {
          router.push('/noteLibrary');
        }

        // else if (props.nodeType === 'share') {
        //   router.push('/home');
        // }
        else {
          router.back();
        }
      },
      props.isStartEdit ? 300 : 0,
    );
  }
  const tagConfDlgVisible = ref(false);
  function updateTag() {
    tagConfDlgVisible.value = true;
  }

  const loading = ref(false);
  const exportToPDF = async () => {
    Alert.alert({
      title: '提示',
      content: `请确认是否导出为PDF？`,
      async onOk() {
        loading.value = true;
        await generatePDF(props.note.title, '.w-e-text-container [data-slate-editor]');
        loading.value = false;
      },
    });
  };
</script>

<style lang="less">
  .note-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    height: 60px;
    width: 100%;
    box-sizing: border-box;
    padding: 0 20px;
    background-color: var(--note-header-bg-color);
    border-bottom: 1px solid var(--notePage-topBody-border-color);
    position: fixed;
    top: 0;
  }
  .note-header-title {
    padding: 0 10px;
    height: 28px;
    display: flex;
    align-items: center;
    border-radius: 6px;
    box-sizing: border-box;
    outline: none;
    border: 1px solid transparent;
    transition: border-color 0.1s linear;
    &:hover {
      border-color: rgba(0, 0, 0, 0.1) !important;
    }
    &:focus {
      border-color: #615ced !important;
    }
    &:empty:before {
      color: #aaa;
      content: '未命名文档';
    }
  }
  .note-header-title-icon {
    background-color: white;
    width: 36px;
    height: 36px;
    border: 1px solid #e8eaf2;
    border-radius: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #222222;
    transition: border-color 0.1s linear;
    &:hover {
      border-color: var(--primary-color);
    }
  }
</style>
