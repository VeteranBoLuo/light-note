<template>
  <div class="folder-list" v-if="!bookmark.isMobileDevice">
    <div
      class="category-item"
      style="margin: 0 0 5px 0"
      :style="{
        backgroundColor: 'all' === cloud.folder.id ? 'var(--category-item-ba-color)' : '',
      }"
      @click="clickAllFolder"
    >
      <svg-icon size="16" :src="icon.common.folder" />
      <span class="text-hidden" style="width: calc(100% - 28px)">{{ $t('cloudSpace.allFile') }}</span>
    </div>
    <b-list
      draggable
      style="height: calc(100% - 80px)"
      v-model:listOptions="cloud.folderList"
      v-model:dragList="cloud.folderList"
      :node-type="{ id: 'id', title: 'name' }"
      @onEnd="onDragEnd"
      @nodeClick="folderClick"
    >
      <template #item="{ item }">
        <RightMenu
          :menu="[$t('common.reName'), $t('common.delete'), $t('cloudSpace.uploadFile')]"
          v-if="!item.isRename"
          @select="handleTagMenu($event, item)"
        >
          <div
            class="category-item"
            style="height: 32px; margin-top: 5px !important"
            :title="item.name"
            :style="{
              backgroundColor: cloud.folder.id === item.id ? 'var(--category-item-ba-color)' : '',
            }"
            :key="item"
            v-click-log="{ module: '云空间', operation: `查询文件夹【${item.name}】下的文件列表` }"
          >
            <svg-icon size="16" :src="icon.common.folder" />
            <span class="text-hidden" style="width: calc(100% - 28px)">{{ item['name'] }}</span>
          </div>
        </RightMenu>
        <b-input v-else class="edit-input" v-model:value="newName" @click.stop @keydown.enter="handleRename(item)">
          <template #suffix>
            <div class="flex-align-center-gap">
              <svg-icon :src="icon.filterPanel.check" size="18" class="dom-hover" @click="handleRename(item)" />
              <svg-icon :src="icon.common.close" size="18" class="dom-hover" @click="cloud.queryFolder()"
            /></div>
          </template>
        </b-input>
      </template>
    </b-list>
    <b-button v-if="!bookmark.isMobileDevice" @click="addFolder" style="width: 100%">{{
      $t('cloudSpace.newFolder')
    }}</b-button>
    <input type="file" id="folder-upload-input" multiple style="display: none" @change="onFileSelect" />
  </div>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import BList from '@/components/base/BasicComponents/BList.vue';
  import RightMenu from '@/components/base/RightMenu.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore, cloudSpaceStore } from '@/store';
  import { nextTick, ref } from 'vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import { message } from 'ant-design-vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';

  const bookmark = bookmarkStore();
  const cloud = cloudSpaceStore();

  const emit = defineEmits(['uploadFiles']);

  function clickAllFolder() {
    cloud.folder = {
      name: '全部文件',
      id: 'all',
    };
    cloud.queryFieldList();
  }

  function folderClick(folder) {
    cloud.folder = folder;
    cloud.queryFieldList();
  }

  const newName = ref('');
  function handleTagMenu(menu, folder: any) {
    recordOperation({ module: '云空间', operation: `右键${menu}文件夹${folder.name}` });
    const actions = {
      重命名: () => {
        if (cloud.folderList.find((i) => !i.id || i.isRename)) {
          return;
        }
        folder.isRename = true;
        newName.value = folder.name;
        nextTick(() => {
          (document.querySelector('.edit-input .b-input') as HTMLElement | null)?.focus();
        });
      },
      删除: () => handleDeleteFolder(folder),
      上传文件: () => handleUploadToFolder(folder),
    };
    actions[menu]?.();
  }

  const currentFolderId = ref('');
  function handleUploadToFolder(folder) {
    currentFolderId.value = folder.id;
    const fileInput = document.getElementById('folder-upload-input') as HTMLInputElement;
    fileInput?.click();
  }

  function onFileSelect(event) {
    const files = Array.from(event.target.files);
    emit('uploadFiles', { files, folderId: currentFolderId.value });
    // 重置 input
    event.target.value = '';
  }

  function handleDeleteFolder(folder: any) {
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除文件夹【${folder.name}】？`,
      onOk() {
        apiBasePost('/api/file/deleteFolder', { id: folder.id }).then(() => {
          cloud.queryFolder();
          message.success('删除成功');
          if (folder.id === cloud.folder.id) {
            cloud.folder = {
              name: '全部文件',
              id: 'all',
            };
            cloud.queryFieldList();
          }
        });
      },
    });
  }
  function addFolder() {
    if (cloud.folderList.find((i) => !i.id || i.isRename)) {
      message.warning('请先完成当前编辑中的文件夹！');
      return;
    }
    cloud.folderList.push({ name: '', isRename: true });
    nextTick(() => {
      (document.querySelector('.edit-input .b-input') as HTMLElement | null)?.focus();
    });
  }

  function handleRename(folder: any) {
    if (newName.value) {
      folder.isRename = !folder.isRename;
      folder.name = newName.value;
      if (folder.id) {
        apiBasePost('/api/file/updateFolder', folder).then(() => {
          cloud.queryFolder();
          message.success('重命名成功');
        });
      } else {
        apiBasePost('/api/file/addFolder', folder).then((res) => {
          if (res.status === 200) {
            cloud.queryFolder();
            message.success('新增文件夹成功');
          }
        });
      }
    }
  }

  async function onDragEnd() {
    try {
      const sortedTags =
        cloud.folderList?.map((folder: any, index: number) => ({
          name: folder.name,
          sort: index,
          id: folder.id,
        })) || [];

      const updateResponse = await apiBasePost('/api/file/updateFolderSort', { tags: sortedTags });
      if (updateResponse.status === 200) {
        cloud.queryFolder();
      }
    } catch (error) {
      console.error('Error updating tag sort:', error);
    }
  }

  cloud.queryFolder();
</script>

<style lang="less" scoped>
  .folder-list {
    height: 100%;
    width: 300px;
    flex-shrink: 0;
    border-right: 1px solid var(--folder-list-border-color);
    padding-right: 10px;
  }
  .edit-input {
    display: flex;
    margin-top: 5px !important;
    :deep(.b-input) {
      padding-right: 60px !important;
    }
  }
</style>
