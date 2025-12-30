<template>
  <div class="field-list">
    <div v-if="batchMode" class="batch-actions">
      <b-space :size="10">
        <b-button size="small" type="danger" @click="handleBatchDelete">{{ $t('cloudSpace.batchDelete') }}</b-button>
        <b-button size="small" type="primary" @click="handleBatchMove">{{ $t('cloudSpace.batchMove') }}</b-button>
        <span class="selected-count">{{ $t('cloudSpace.selectedCount', { count: selectedRows.length }) }}</span>
      </b-space>
    </div>
    <div class="field-header">
      <div class="flex-align-center-gap" style="width: 60%">
        <a-checkbox
          v-if="batchMode"
          :indeterminate="indeterminate"
          :checked="selectAll"
          @change="onToggleSelectAll"
          class="header-checkbox"
        />
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
        <div class="flex-align-center" style="position: relative; width: 60%">
          <a-checkbox
            v-if="batchMode"
            :checked="selectedRows.includes(item.id)"
            @change="(e: any) => toggleRow(item.id, e.target.checked)"
            class="row-checkbox"
          />
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
            <a-tooltip :title="$t('cloudSpace.share')" v-if="!bookmark.isMobileDevice">
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
              v-if="!bookmark.isMobileDevice"
              :trigger="'click'"
              :menu-options="[
                { label: $t('common.reName'), icon: icon.filterPanel.list, function: () => handleReName(item) },
                {
                  label: $t('cloudSpace.moveFile'),
                  icon: icon.cloudSpace.moveFile,
                  function: () => emit('moveField', [item]),
                },
              ]"
            >
              <svg-icon class="download-icon" :src="icon.common.more" size="20" />
            </b-menu>
          </div>
        </div>
        <div class="default-area">
          <div v-if="!bookmark.isMobileDevice">{{ item.folderName }}</div>
          <div
            >{{
              Number(item.fileSize / 1024)
                .toFixed()
                .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
            }}
            KB</div
          >
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
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { bookmarkStore } from '@/store';
  import { cloudSpaceStore } from '@/store';
  import { apiBasePost } from '@/http/request.ts';
  import { message } from 'ant-design-vue';
  import icon from '@/config/icon.ts';
  import { deleteField, downloadField, shareField } from '@/http/common.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { nextTick, ref, computed, watch } from 'vue';
  import { cloneDeep } from 'lodash-es';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();
  const emit = defineEmits(['previewFile', 'moveField']);
  const cloud = cloudSpaceStore();
  const bookmark = bookmarkStore();
  const props = defineProps<{ clearKey?: number; batchMode: boolean }>();

  const batchMode = computed(() => props.batchMode ?? false);
  const selectedRows = ref<string[]>([]);
  const selectAll = ref(false);
  const hasSelection = computed(() => selectedRows.value.length > 0);
  const indeterminate = computed(
    () => selectedRows.value.length > 0 && selectedRows.value.length < cloud.fileList.length,
  );

  const onToggleSelectAll = (e: any) => {
    const checked = e.target.checked;
    selectAll.value = checked;
    selectedRows.value = checked ? cloud.fileList.map((item) => item.id) : [];
  };

  const toggleRow = (id: string, checked: boolean) => {
    if (checked) {
      if (!selectedRows.value.includes(id)) selectedRows.value.push(id);
    } else {
      selectedRows.value = selectedRows.value.filter((itemId) => itemId !== id);
    }
    selectAll.value = cloud.fileList.length > 0 && selectedRows.value.length === cloud.fileList.length;
  };

  watch(
    () => cloud.fileList,
    (list) => {
      // 当列表刷新时，同步全选状态，移除已不存在的选项
      const ids = list.map((item) => item.id);
      selectedRows.value = selectedRows.value.filter((id) => ids.includes(id));
      selectAll.value = list.length > 0 && selectedRows.value.length === list.length;
    },
    { deep: true },
  );

  watch(
    () => props.clearKey,
    () => {
      selectedRows.value = [];
      selectAll.value = false;
    },
  );

  watch(
    () => props.batchMode,
    (val) => {
      if (!val) {
        selectedRows.value = [];
        selectAll.value = false;
      }
    },
  );

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

  const handleBatchDelete = () => {
    if (!hasSelection.value) {
      message.warning(t('cloudSpace.selectFilesToDelete'));
      return;
    }

    const selectedFiles = cloud.fileList.filter((item) => selectedRows.value.includes(item.id));
    const names = selectedFiles.map((f) => f.fileName).join('、');

    Alert.alert({
      title: t('cloudSpace.alertTitle'),
      content: `${t('cloudSpace.confirmBatchDelete')} ${selectedRows.value.length} ${t('cloudSpace.files')}<br/>${t('cloudSpace.fileList')}: ${names}`,
      onOk() {
        apiBasePost('/api/file/deleteFileById', { ids: selectedRows.value }).then((res) => {
          if (res.status === 200) {
            const count = res.data?.count || selectedRows.value.length;
            message.success(`${t('cloudSpace.batchDeleteSuccess')} ${count} ${t('cloudSpace.files')}`);
          } else {
            message.error(res.msg || t('cloudSpace.deleteFailed'));
          }

          cloud.queryFieldList();
          selectedRows.value = [];
          selectAll.value = false;
        });
      },
    });
  };

  const handleBatchMove = () => {
    if (!hasSelection.value) {
      message.warning(t('cloudSpace.selectFilesToMove'));
      return;
    }

    const selectedFiles = cloud.fileList.filter((item) => selectedRows.value.includes(item.id));
    emit('moveField', selectedFiles);
  };

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
    font-weight: bold;
    font-size: 15px;
  }
  .header-checkbox {
    margin-right: 8px;
  }
  .batch-actions {
    margin-bottom: 10px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--folder-list-border-color);
    display: flex;
    align-items: center;
    color: var(--text-color);
    .selected-count {
      color: var(--desc-color);
      font-size: 14px;
    }
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
  .row-checkbox {
    margin-right: 10px;
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
  @media (max-width: 1400px) {
    .field-item {
      .handle-btn {
        opacity: 1 !important;
      }
    }
  }
</style>
