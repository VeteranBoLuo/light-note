<template>
  <div class="share-download" :class="{ 'is-mobile': bookmark.isMobile }">
    <div class="download-container">
      <div v-if="loading && !file.fileName" class="loading-section" aria-live="polite">
        <div class="loading-card">
          <BLoading inline loading :title="t('common.loading')" />
        </div>
      </div>
      <div v-else-if="errorCode && !requiresCode" class="file-info-section" role="alert">
        <div class="file-card">
          <div class="file-header">
            <div class="file-heading">
              <h2 class="file-title">{{ t('cloudSpace.shareUnavailableTitle') }}</h2>
              <p class="file-subtitle">{{ errorMessage }}</p>
            </div>
          </div>
          <BButton :loading="loading" type="primary" @click="resolveShare">{{ t('common.retry') }}</BButton>
        </div>
      </div>
      <div v-else class="file-info-section">
        <div class="file-card">
          <div class="file-header">
            <div v-if="file.fileName" class="file-icon">
              <SvgIcon :src="fileIcon" :size="bookmark.isMobile ? 48 : 56" aria-hidden="true" />
            </div>
            <div class="file-heading">
              <h2 class="file-title">{{ file.fileName || t('cloudSpace.share') }}</h2>
              <p v-if="requiresCode || file.description" class="file-subtitle">
                {{ requiresCode ? t('cloudSpace.shareCodeRequired') : file.description }}
              </p>
            </div>
          </div>
          <div v-if="requiresCode" class="share-code-form">
            <label for="file-share-code">{{ t('cloudSpace.shareAccessCode') }}</label>
            <BInput
              id="file-share-code"
              v-model:value="accessCode"
              :maxlength="12"
              :placeholder="t('cloudSpace.shareCodePlaceholder')"
              autocomplete="one-time-code"
              @enter="resolveShare"
            />
            <p v-if="errorMessage" class="share-code-error" role="alert">{{ errorMessage }}</p>
            <BButton type="primary" :loading="loading" @click="resolveShare">
              {{ t('cloudSpace.openShare') }}
            </BButton>
          </div>
          <template v-else-if="file.fileName">
            <dl class="file-details">
              <div
                ><dt>{{ t('cloudSpace.fileSize') }}</dt
                ><dd>{{ formatFileSize(file.fileSize) }}</dd></div
              >
              <div
                ><dt>{{ t('cloudSpace.createBy') }}</dt
                ><dd>{{ file.creatorName || '-' }}</dd></div
              >
              <div
                ><dt>{{ t('cloudSpace.createTime') }}</dt
                ><dd>{{ formatDate(file.createTime) }}</dd></div
              >
              <div
                ><dt>{{ t('cloudSpace.shareExpiresAt') }}</dt
                ><dd>{{ formatDate(file.expiresAt) }}</dd></div
              >
            </dl>
            <div class="action-buttons">
              <BButton type="success" size="large" :loading="loading" @click="previewFile" class="preview-btn">
                {{ t('common.preview') }}
              </BButton>
              <BButton type="primary" size="large" :loading="loading" @click="downloadFile" class="download-btn">
                {{ downloadSuccess ? t('cloudSpace.downloadAgain') : t('cloudSpace.download') }}
              </BButton>
              <BButton size="large" class="copy-btn" @click="copyShareLink">{{
                t('cloudSpace.shareCopyLink')
              }}</BButton>
            </div>
          </template>
        </div>
      </div>
      <div class="brand-cta">
        <span class="brand-cta__text">{{ t('cloudSpace.shareBrandHint') }}</span>
        <BButton type="primary" class="brand-cta__button" @click="goRegister">{{ t('cloudSpace.shareCreateOwn') }}</BButton>
      </div>
    </div>
    <FilePreview
      v-model:visible="previewVisible"
      :file-info="previewFileInfo"
      :preview-access="{ kind: 'share', token, accessCode: accessCode.trim() }"
      @close="previewVisible = false"
    />
  </div>
</template>

<script lang="ts" setup>
  import { copyFileShareUrl } from '@/utils/fileShareLinks';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { ref, computed, reactive, onMounted } from 'vue';
  import { useRoute } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { downloadFileShare, resolveFileShare } from '@/http/common.ts';
  import { trackConversion } from '@/utils/conversion';
  import FilePreview from '@/components/FilePreview.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { getCloudFileCategory } from '@/constants/cloudFileCategory.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { bookmarkStore } from '@/store';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';

  const route = useRoute();
  const { t } = useI18n();
  const loading = ref(false);
  const downloadSuccess = ref(false);
  const previewVisible = ref(false);
  const accessCode = ref('');
  const requiresCode = ref(false);
  const errorCode = ref('');
  const errorMessage = ref('');
  const token = computed(() => String(route.params.token || ''));

  const fileIcon = computed(() => icon.cloudSpace.fileIcon[getCloudFileCategory(file)]);

  const file = reactive<{
    id: string;
    fileName: string;
    category: string;
    createTime: string;
    fileSize: number;
    creatorName: string;
    fileUrl: string;
    fileType: string;
    description: string;
    expiresAt: string;
  }>({
    id: '',
    fileName: '',
    category: 'other',
    createTime: '',
    fileSize: 0,
    creatorName: '',
    fileUrl: '',
    fileType: '',
    description: '',
    expiresAt: '',
  });

  const formatFileSize = (size: number) => {
    if (!size) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024;
      index++;
    }
    return `${size.toFixed(2)} ${units[index]}`;
  };
  const formatDate = (value: string) => (value ? new Date(value).toLocaleString() : '-');

  // 预览文件信息
  const previewFileInfo = computed(() => ({
    id: file.id,
    fileName: file.fileName,
    fileType: file.fileType,
    fileUrl: file.fileUrl,
    category: file.category,
  }));

  const resolveShare = async () => {
    if (!token.value) return;
    loading.value = true;
    errorCode.value = '';
    errorMessage.value = '';
    try {
      const res = await resolveFileShare(token.value, accessCode.value.trim());
      if (res.status === 200) {
        Object.assign(file, res.data);
        requiresCode.value = false;
        return;
      }
      const code = String(res.data?.errorCode || 'SHARE_UNAVAILABLE');
      errorCode.value = code;
      errorMessage.value = res.msg || t('cloudSpace.shareUnavailableDescription');
      requiresCode.value = code === 'SHARE_CODE_REQUIRED' || code === 'SHARE_CODE_INVALID';
    } catch {
      errorCode.value = 'SHARE_SERVICE_UNAVAILABLE';
      errorMessage.value = t('cloudSpace.shareUnavailableDescription');
    } finally {
      loading.value = false;
    }
  };

  const downloadFile = async () => {
    loading.value = true;
    errorMessage.value = '';
    try {
      await downloadFileShare(token.value, accessCode.value.trim());
      downloadSuccess.value = true;
      recordOperation({ module: '分享文件', operation: `下载分享文件成功【${file.fileName}】` });
    } catch (error: any) {
      errorCode.value = String(error?.code || 'SHARE_DOWNLOAD_FAILED');
      errorMessage.value = error?.message || t('common.downloadFailed');
    } finally {
      loading.value = false;
    }
  };

  async function copyShareLink() {
    if (await copyFileShareUrl(token.value)) message.success(t('common.shareLinkCopied'));
    else message.warning(t('cloudSpace.shareCopyFailed'));
  }

  const previewFile = () => {
    errorMessage.value = '';
    recordOperation({ module: '分享文件', operation: `预览分享文件【${file.fileName}】` });
    previewVisible.value = true;
  };

  const bookmark = bookmarkStore();

  // 分享页曝光埋点(后端只对游客落库)
  trackConversion('share_view', 'share');
  // 品牌注册引导:把站外分享流量转成注册
  function goRegister() {
    trackConversion('share_cta_click', 'share');
    bookmark.openAuthModal('注册', 'share'); // openAuthModal 内部另记 signup_open
  }

  onMounted(resolveShare);
</script>

<style lang="less" scoped>
  .share-download {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    padding: 32px 24px;
    color: var(--text-color);
    background: var(--workspace-canvas);
  }
  .download-container {
    width: min(100%, 680px);
    flex: 0 0 auto;
    margin: auto;
  }
  .file-card,
  .loading-card {
    padding: 32px;
    border: 1px solid var(--workspace-border);
    border-radius: 20px;
    background: var(--workspace-content);
    box-shadow: var(--surface-card-shadow);
  }
  .loading-card {
    min-height: 180px;
    display: grid;
    place-items: center;
  }
  .file-header {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 24px;
  }
  .file-icon {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
  }
  .file-heading {
    min-width: 0;
  }
  .file-title {
    margin: 0;
    font-size: 26px;
    line-height: 1.35;
    font-weight: 650;
    overflow-wrap: anywhere;
  }
  .file-subtitle {
    margin: 10px 0 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--workspace-muted);
    overflow-wrap: anywhere;
  }
  .file-details {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px 24px;
    margin: 0 0 24px;
    padding: 20px 0;
    border-top: 1px solid var(--workspace-divider);
    border-bottom: 1px solid var(--workspace-divider);
    dt {
      color: var(--workspace-muted);
      font-size: 13px;
      margin-bottom: 5px;
    }
    dd {
      margin: 0;
      font-size: 14px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
  }
  .action-buttons {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    .download-btn,
    .preview-btn,
    .copy-btn {
      width: 100%;
      min-width: 0;
      height: 40px;
      min-height: 40px;
      padding: 0 6px;
      box-sizing: border-box;
      font-size: 14px;
      border-radius: 8px;
    }
    .preview-btn {
      background: var(--success-color);
      color: var(--workspace-content);
    }
    .preview-btn:hover {
      background: var(--success-color);
      filter: brightness(0.94);
    }
  }
  .share-code-form {
    display: grid;
    gap: 12px;
  }
  .share-code-error {
    margin: 0;
    color: var(--error-color);
  }
  .brand-cta {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 24px;
    color: var(--text-color);
    font-size: 13px;
  }
  .brand-cta__button {
    height: 36px;
    min-height: 36px;
    padding: 0 18px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
  }
  .share-download.is-mobile {
    padding: 20px 12px;
    .file-card,
    .loading-card {
      padding: 20px 16px;
    }
    .file-header {
      gap: 12px;
      margin-bottom: 20px;
    }
    .file-title {
      font-size: 20px;
    }
    .file-details {
      gap: 16px 12px;
    }
  }
</style>
