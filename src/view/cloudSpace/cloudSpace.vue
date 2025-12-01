<template>
  <CommonContainer title="云空间">
    <div class="cloud-container">
      <div class="header">
        <b-input
          v-if="bookmark.isMobileDevice"
          v-model:value="cloud.searchFileName"
          placeholder="文件名"
          class="header-input"
          @enter="cloud.queryFieldList"
        >
          <template #suffix>
            <svg-icon class="dom-hover" :src="icon.navigation.search" size="16" @click="cloud.queryFieldList" />
          </template>
        </b-input>
        <div v-else class="flex-align-center">
          <div style="font-weight: 500; font-size: 20px" @click="init" class="dom-hover">云空间</div>
          <div class="search-icon">
            <b-input @input="inputQueryFieldList" v-model:value="cloud.searchFileName" placeholder="文件名">
              <template #suffix>
                <svg-icon class="dom-hover" :src="icon.navigation.search" size="16" @click="cloud.queryFieldList" />
              </template>
            </b-input>
          </div>
          <FileTypeFilter />
        </div>
        <HandleBtnGroup />
      </div>
      <div class="content-area">
        <CloudFolder />
        <div class="field-list">
          <div class="field-header">
            <div class="flex-align-center-gap" :style="{ width: bookmark.isMobileDevice ? '80%' : '60%' }">
              文件名
            </div>
            <div class="default-area">
              <div v-if="!bookmark.isMobileDevice">文件夹</div>
              <div>文件大小</div>
              <div v-if="!bookmark.isMobileDevice"> 存储时间 </div>
            </div>
          </div>
          <div class="file-container">
            <div class="field-item" v-for="(item, index) in cloud.fileList" :key="index">
              <div
                class="flex-align-center"
                style="position: relative"
                :style="{ width: bookmark.isMobileDevice ? '80%' : '60%' }"
              >
                <span
                  v-if="!item.isRename"
                  :style="{
                    cursor:
                      !bookmark.isMobileDevice && ['image', 'pdf', 'video'].some((type) => item.fileType.includes(type))
                        ? 'pointer'
                        : 'unset',
                  }"
                  class="file-label text-hidden"
                  @click="previewFile(item)"
                  >{{ item.fileName }}</span
                >
                <b-input
                  style="width: 400px"
                  v-else
                  class="edit-file-input"
                  v-model:value="item.fileName"
                  @click.stop
                  @enter="submitReName(item)"
                >
                  <template #suffix>
                    <div class="flex-align-center-gap">
                      <svg-icon :src="icon.filterPanel.check" size="18" class="dom-hover" @click="submitReName(item)" />
                      <svg-icon :src="icon.common.close" size="18" class="dom-hover" @click="cloud.queryFieldList()"
                    /></div>
                  </template>
                </b-input>
                <div class="flex-align-center handle-btn" v-if="!item.isRename">
                  <a-tooltip title="下载">
                    <svg-icon
                      class="download-icon"
                      :src="icon.cloudSpace.download"
                      size="20"
                      @click="downloadField(item.id)"
                    />
                  </a-tooltip>
                  <a-tooltip title="移动文件" v-if="!bookmark.isMobileDevice">
                    <svg-icon
                      class="download-icon"
                      :src="icon.cloudSpace.moveFile"
                      size="20"
                      @click="moveField(item)"
                    />
                  </a-tooltip>
                  <b-menu
                    :trigger="'click'"
                    :menu-options="[
                      { label: '删除', icon: icon.noteDetail.delete, function: () => handleDelFile(item.id) },
                      { label: '重命名', icon: icon.filterPanel.list, function: () => handleReName(item) },
                    ]"
                  >
                    <svg-icon class="download-icon" :src="icon.common.more" size="20" />
                  </b-menu>
                </div>
              </div>
              <div class="default-area">
                <div v-if="!bookmark.isMobileDevice">{{ item.folderName }}</div>
                <div>{{ Number(item.fileSize / 1024).toFixed() }} KB</div>
                <div v-if="!bookmark.isMobileDevice" class="text-hidden" :title="item.uploadTime">{{ item.uploadTime }} </div>
              </div>
            </div>
          </div>
          <b-loading :loading="cloud.loading" class="both-center" />
        </div>
      </div>
    </div>
    <MoveFile v-model:visible="moveCfg.moveFileVisible" :file="moveCfg.file" />
    <div
      v-if="viewVisible"
      class="both-center"
      style="
        padding: 20px 10px 10px 10px;
        border: 1px solid var(--bl-input-border-h-color);
        border-radius: 6px;
        background-color: var(--background-color);
      "
    >
      <svg-icon
        :src="icon.common.close"
        size="19"
        class="dom-hover"
        style="position: absolute; right: 2px; top: 0"
        @click="viewVisible = false"
      />
      <iframe
        v-if="viewObj.fileType.includes('pdf')"
        :src="viewObj.fileUrl"
        style="height: 90vh; width: 90vw; border: none"
      />
      <VideoPreview v-else-if="viewObj.fileType.includes('video')" :video-url="viewObj.fileUrl" />
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon';
  import { nextTick, reactive, ref } from 'vue';
  import { deleteField, downloadField } from '@/http/common';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import HandleBtnGroup from '@/components/cloudSpace/HandleBtnGroup.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import CloudFolder from '@/components/cloudSpace/CloudFolder.vue';
  import FileTypeFilter from '@/components/cloudSpace/FileTypeFilter.vue';
  import { debounce } from '@/utils/common';
  import MoveFile from '@/components/cloudSpace/MoveFile.vue';
  import BMenu from '@/components/base/BasicComponents/BMenu.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import { apiBasePost } from '@/http/request';
  import { message } from 'ant-design-vue';
  import { cloneDeep } from 'lodash-es';
  import { recordOperation } from '@/api/commonApi';
  import VideoPreview from '@/components/base/VideoPreview.vue';

  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();
  const loading = ref(false);

  const inputQueryFieldList = debounce(cloud.queryFieldList, 500);
  function init() {
    cloud.folder = {
      name: '全部文件',
      id: 'all',
    };
    cloud.searchFileName = '';
    cloud.queryFieldList();
  }

  function handleDelFile(id) {
    Alert.alert({
      title: '提示',
      content: `确认删除此文件？`,
      onOk() {
        deleteField(id).then(() => {
          cloud.queryFieldList();
        });
      },
    });
  }
  const originalName = ref('');
  function handleReName(file) {
    originalName.value = cloneDeep(file.fileName);
    file.isRename = true;
    document.querySelector('.edit-file-input .b-input') as HTMLInputElement;
    nextTick(() => {
      (document.querySelector('.edit-file-input .b-input') as HTMLInputElement).focus();
    });
  }

  function submitReName(file) {
    // 判断是否改变扩展名(只有修改扩展名时提示，直接删除后缀不提示，后端会自动补全)
    if (file.fileName.includes('.') && originalName.value.split('.').pop() !== file.fileName.split('.').pop()) {
      Alert.alert({
        title: '提示',
        content: `如果改变文件扩展名可能会导致文件无法正常打开，请确认是否继续？`,
        onOk() {
          updateFileName(file);
        },
      });
    } else {
      updateFileName(file);
    }
  }

  function updateFileName(file) {
    file.isRename = false;
    apiBasePost('/api/file/updateFile', {
      id: file.id,
      fileName: file.fileName,
    }).then((res) => {
      if (res.status === 200) {
        message.success('重命名成功');
        cloud.queryFieldList();
      }
    });
  }

  const moveCfg = reactive({
    moveFileVisible: false,
    file: {},
  });
  const viewVisible = ref(false);
  const viewObj = ref();
  const isListenerAdded = ref(false);
  function moveField(file) {
    moveCfg.moveFileVisible = true;
    moveCfg.file = file;
  }
  interface FileItem {
    id: string;
    fileName: string;
    fileType: string;
    fileUrl?: string;
  }

  const ALLOW_VIEW_TYPES = ['pdf', 'video'];

  function previewFile(file: FileItem) {
    if (!file || !file.fileType) return;

    viewObj.value = file;

    if (ALLOW_VIEW_TYPES.some((type) => file.fileType.includes(type))) {
      viewVisible.value = true;
      // 添加键盘事件监听器（确保只添加一次）
      if (!isListenerAdded.value) {
        document.addEventListener('keydown', handleKeyDown);
        isListenerAdded.value = true;
      }
    }

    if (file.fileType.includes('image')) {
      // 如果图片是被覆盖的，需要手动加上时间戳更新图片缓存
      const url = cloud.cacheImgArr.includes(file.id) ? `${file.fileUrl}?t=${Date.now()}` : file.fileUrl;
      bookmark.refreshViewer(url, {});
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      viewVisible.value = false;
      // 移除事件监听器
      document.removeEventListener('keydown', handleKeyDown);
      isListenerAdded.value = false;
    }
  }

  init();
</script>

<style lang="less" scoped>
  .cloud-container {
    padding: 20px 20px 0 20px;
    width: 100%;
    height: 100%;
    border-top: 1px solid var(--notePage-topBody-border-color);
    box-sizing: border-box;
    display: flex;
    gap: 10px;
    flex-direction: column;
  }
  .header {
    height: 40px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    .header-input {
      width: 300px;
    }
  }
  .content-area {
    height: calc(100% - 42px);
    overflow: hidden;
    display: flex;
    .field-list {
      flex: 1;
      position: relative;
      display: flex;
      flex-direction: column;
    }
  }
  .field-header {
    display: flex;
    align-items: center;
    height: 20px;
    padding: 0 20px 10px 20px;
    border-bottom: 1px solid var(--folder-list-border-color);
  }
  .file-container {
    height: calc(100% - 40px);
    overflow-y: auto;
  }
  .field-item {
    height: 64px;
    padding: 0 20px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid var(--folder-list-border-color);
    transition: background-color 0.3s;
    &:hover {
      background-color: var(--bl-input-noBorder-bg-color);
      .handle-btn {
        opacity: 1;
      }
    }
    .handle-btn {
      color: var(--desc-color);
      opacity: 0;
      position: absolute;
      right: 30px;
      gap: 10px;
      div {
        cursor: pointer;
      }
    }
  }
  .file-label {
    width: calc(100% - 120px);
  }
  .default-area {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex: 1;
    font-size: 14px;
    color: var(--desc-color);
    div {
      flex: 1;
    }
  }
  .search-icon {
    height: 32px;
    width: 200px;
    margin-left: 250px;
    border-color: var(--card-border-color) !important;
  }
  @media (max-width: 1000px) {
    .header {
      height: 40px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      .header-input {
        flex: 1;
      }
    }
    .file-container {
      height: calc(100% - 20px);
    }
    .file-label {
      width: 150px;
    }
  }
</style>
