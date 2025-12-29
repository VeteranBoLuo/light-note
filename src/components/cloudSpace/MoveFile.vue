<template>
  <BModal title="移动文件" :mask-closable="false" @ok="moveFile" v-model:visible="visible">
    <div style="display: flex; flex-direction: column; width: 500px; max-height: 400px; overflow-y: auto">
      <div class="folder-item" @click="folderClick({ name: '不关联文件夹', id: 'all' })">
        <div class="flex-align-center-gap">
          <span style="font-size: 14px">不关联文件夹</span>
        </div>
        <div class="check">
          <div class="point" v-show="checkValue === 'all'"></div>
        </div>
      </div>
      <div v-for="folder in cloud.folderList" :key="folder.id" class="folder-item" @click="folderClick(folder)">
        <div class="flex-align-center-gap">
          <svg-icon size="24" :src="icon.common.folder" />
          <span style="font-size: 14px">{{ folder.name }}</span>
        </div>
        <div class="check">
          <div class="point" v-show="checkValue === folder.id"></div>
        </div>
      </div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import { cloudSpaceStore } from '@/store';
  import icon from '@/config/icon.ts';
  import { ref, watch } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import { message } from 'ant-design-vue';
  import { useI18n } from 'vue-i18n';
  const cloud = cloudSpaceStore();
  const checkValue = ref('');
  const { t } = useI18n();
  const props = defineProps({
    files: {
      type: Array,
      default: () => [],
    },
  });
  const emit = defineEmits(['moved']);
  const visible = defineModel('visible');

  function folderClick(folder) {
    checkValue.value = folder.id;
  }
  function moveFile() {
    const fileIds = props.files?.map((f: any) => f.id) || [];
    apiBasePost('/api/file/associateFile', {
      folderId: checkValue.value === 'all' ? '' : checkValue.value,
      fileIds,
    }).then((res) => {
      if (res.status === 200) {
        const successMessage =
          fileIds.length === 1
            ? t('cloudSpace.moveSuccess')
            : `${t('cloudSpace.batchMoveSuccess')} ${fileIds.length} ${t('cloudSpace.files')}`;
        message.success(successMessage);
        if (fileIds.length > 1) {
          emit('moved');
        }
      } else {
        message.error(res.msg || t('cloudSpace.moveFailed'));
      }
      visible.value = false;
      cloud.queryFieldList();
    });
  }
  watch(
    () => visible.value,
    (val) => {
      if (val && props.files.length > 0) {
        checkValue.value = props.files[0].folderId || 'all';
      }
    },
  );
</script>

<style lang="less" scoped>
  .folder-item {
    height: 48px;
    width: 100%;
    flex-shrink: 0;
    box-sizing: border-box;
    padding: 0 10px 0 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 0.5px solid var(--folder-list-border-color);
    cursor: pointer;
  }
  .check {
    height: 12px;
    width: 12px;
    border-radius: 20px;
    background-color: white;
    border: 1px solid #cccccc;
    display: flex;
    align-items: center;
    justify-content: center;
    .point {
      height: 10px;
      width: 10px;
      background-color: #444444;
      border-radius: 20px;
    }
  }
</style>
