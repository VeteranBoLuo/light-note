<template>
  <div class="share-download">
    <div v-if="loading" class="loading">
      <a-spin size="large" :tip="`${$t('cloudSpace.downloading')} ${fileName ? ` - ${fileName}` : ''}`" />
    </div>
    <div v-else-if="downloadSuccess" class="success">
      <a-result
        status="success"
        :title="fileName || $t('cloudSpace.downloadSuccess')"
        :sub-title="$t('cloudSpace.downloadComplete')"
      >
        <template #icon>
          <CheckCircleOutlined />
        </template>
        <template #extra>
          <a-button type="primary" @click="downloadFile">
            {{ $t('cloudSpace.download') }}
          </a-button>
        </template>
      </a-result>
    </div>
    <div v-else class="file-info">
      <a-result status="info" :title="fileName || $t('cloudSpace.share')" :sub-title="$t('cloudSpace.share')">
        <template #icon>
          <component :is="fileIcon" />
        </template>
        <template #extra>
          <a-button type="primary" @click="downloadFile">
            {{ $t('cloudSpace.download') }}
          </a-button>
        </template>
      </a-result>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { ref, computed } from 'vue';
  import { useRoute } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import {
    CheckCircleOutlined,
    FileTextOutlined,
    FileImageOutlined,
    FilePdfOutlined,
    FileWordOutlined,
    FileExcelOutlined,
    VideoCameraOutlined,
    AudioOutlined,
  } from '@ant-design/icons-vue';
  import { downloadField } from '@/http/common.ts';

  const route = useRoute();
  const { t } = useI18n();
  const loading = ref(false);
  const downloadSuccess = ref(false);
  const fileName = ref('');
  const fileType = ref('');

  // 根据文件类型获取对应的图标组件
  const fileIcon = computed(() => {
    const type = fileType.value.toLowerCase();
    if (type.includes('image')) return FileImageOutlined;
    if (type.includes('pdf')) return FilePdfOutlined;
    if (type.includes('word') || type.includes('doc')) return FileWordOutlined;
    if (type.includes('excel') || type.includes('xls')) return FileExcelOutlined;
    if (type.includes('video')) return VideoCameraOutlined;
    if (type.includes('audio')) return AudioOutlined;
    return FileTextOutlined;
  });

  // 从路由参数中获取文件名和文件类型
  const initFileInfo = () => {
    const encodedFileName = route.params.fileName as string;
    if (encodedFileName) {
      fileName.value = decodeURIComponent(encodedFileName);
    }
    const encodedFileType = route.params.fileType as string;
    if (encodedFileType) {
      fileType.value = decodeURIComponent(encodedFileType);
    }
  };

  const downloadFile = async () => {
    const id = route.params.id as string;
    if (id) {
      loading.value = true;
      try {
        await downloadField(id);
        loading.value = false;
        downloadSuccess.value = true;
      } catch (error) {
        console.error('下载失败:', error);
        loading.value = false;
      }
    }
  };

  // 初始化文件信息
  initFileInfo();
</script>

<style lang="less" scoped>
  .share-download {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background: #f5f5f5;

    .loading {
      text-align: center;
    }
  }
</style>
