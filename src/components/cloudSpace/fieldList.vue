<template>
  <div class="field-list">
    <div class="field-header">
      <div class="flex-align-center-gap" :style="{ width: bookmark.isMobileDevice ? '70%' : '60%' }">
        {{ $t('cloudSpace.fileName') }}
      </div>
      <div class="default-area">
        <div v-if="!bookmark.isMobileDevice">{{ $t('cloudSpace.folder') }}</div>
        <div>{{ $t('cloudSpace.fileSize') }}</div>
        <div v-if="!bookmark.isMobileDevice"> {{ $t('cloudSpace.uploadTime') }} </div>
      </div>
    </div>
    <div class="file-container">
      <div class="field-item" v-for="(item, index) in cloud.fileList" :key="index">
        <div
          class="flex-align-center"
          style="position: relative"
          :style="{ width: bookmark.isMobileDevice ? '70%' : '60%' }"
        >
          <span v-if="!item.isRename" class="file-label text-hidden" @click="emit('previewFile', item)">{{
            item.fileName
          }}</span>
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
            <a-tooltip :title="$t('cloudSpace.download')">
              <svg-icon
                class="download-icon"
                :src="icon.cloudSpace.download"
                size="20"
                @click="downloadField(item.id)"
              />
            </a-tooltip>
            <a-tooltip :title="$t('cloudSpace.share')">
              <svg-icon
                class="download-icon"
                :src="icon.cloudSpace.share"
                size="20"
                @click="handleShareFile(item.id, item.fileName, item.fileType)"
              />
            </a-tooltip>
            <!-- 删除按钮 -->
            <a-tooltip :title="$t('common.delete')">
              <svg-icon class="delete-icon" :src="icon.noteDetail.delete" size="20" @click="handleDelFile(item.id)" />
            </a-tooltip>
            <b-menu
              :trigger="'click'"
              :menu-options="[
                { label: $t('common.reName'), icon: icon.filterPanel.list, function: () => handleReName(item) },
                {
                  label: $t('cloudSpace.moveFile'),
                  icon: icon.cloudSpace.moveFile,
                  function: () => emit('moveField', item),
                },
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
</template>
<script setup lang="ts">
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BMenu from '@/components/base/BasicComponents/BMenu.vue';
  import { bookmarkStore } from '@/store';
  import { cloudSpaceStore } from '@/store';
  import { apiBasePost } from '@/http/request.ts';
  import { message } from 'ant-design-vue';
  import icon from '@/config/icon.ts';
  import { deleteField, downloadField, shareField } from '@/http/common.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { nextTick, ref } from 'vue';
  import { cloneDeep } from 'lodash-es';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();
  const emit = defineEmits(['previewFile', 'moveField']);
  const cloud = cloudSpaceStore();
  const bookmark = bookmarkStore();

  function submitReName(file) {
    // 判断是否改变扩展名(只有修改扩展名时提示，直接删除后缀不提示，后端会自动补全)
    if (file.fileName.includes('.') && originalName.value.split('.').pop() !== file.fileName.split('.').pop()) {
      Alert.alert({
        title: t('cloudSpace.alertTitle'),
        content: t('cloudSpace.extensionWarning'),
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
        message.success(t('cloudSpace.renameSuccess'));
        cloud.queryFieldList();
      }
    });
  }
  function handleDelFile(id) {
    Alert.alert({
      title: t('cloudSpace.alertTitle'),
      content: t('cloudSpace.confirmDelete'),
      onOk() {
        deleteField(id).then(() => {
          cloud.queryFieldList();
        });
      },
    });
  }

  async function handleShareFile(id, fileName, fileType) {
    try {
      await shareField(id, fileName, fileType);
    } catch (error) {
      // 错误已在 shareField 中处理
    }
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
</script>

<style scoped lang="less">
  .field-list {
    flex: 1;
    position: relative;
    display: flex;
    flex-direction: column;
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
    cursor: pointer;
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
</style>
