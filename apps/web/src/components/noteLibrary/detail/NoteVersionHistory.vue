<template>
  <BModal
    v-model:visible="visible"
    :title="$t('noteDetail.history.title')"
    :show-footer="false"
    :mask-closable="true"
  >
    <div class="note-history" :class="{ mobile: bookmark.isMobile }">
      <!-- 左:版本列表 -->
      <div class="version-list">
        <div class="version-list-inner">
          <div v-if="versions.length" class="list-scroll">
            <div
              v-for="v in versions"
              :key="v.id"
              class="version-item"
              :class="{ active: activeId === v.id }"
              @click="selectVersion(v)"
            >
              <div class="version-time">{{ v.createTime }}</div>
              <div class="version-sub">
                <span class="version-title-line">{{ v.title || $t('noteDetail.unnamedDoc') }}</span>
                <span class="version-chars">{{
                  v.contentLength != null ? $t('noteDetail.history.chars', { count: v.contentLength }) : '·'
                }}</span>
              </div>
            </div>
          </div>
          <div v-else-if="!listLoading" class="empty">
            <div class="empty-title">{{ $t('noteDetail.history.empty') }}</div>
            <div class="empty-hint">{{ $t('noteDetail.history.emptyHint') }}</div>
          </div>
          <BLoading :loading="listLoading" style="position: absolute; inset: 0" />
        </div>
      </div>

      <!-- 右:预览 + 恢复 -->
      <div class="version-preview">
        <div class="preview-header">
          <span class="preview-title">{{ $t('noteDetail.history.preview') }}</span>
          <b-button v-if="activeId" type="primary" size="small" :disabled="restoring" @click="confirmRestore">
            {{ $t('noteDetail.history.restore') }}
          </b-button>
        </div>
        <div class="preview-body">
          <div v-if="activeId" class="preview-html" v-html="activePreviewHtml"></div>
          <div v-else-if="!detailLoading" class="preview-empty">{{ $t('noteDetail.history.selectHint') }}</div>
          <BLoading :loading="detailLoading" style="position: absolute; inset: 0" />
        </div>
      </div>
    </div>
  </BModal>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { bookmarkStore } from '@/store';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { noteContentToHtml, noteDisplayText } from '@/utils/common.ts';

  interface VersionItem {
    id: string;
    title: string;
    createTime: string;
    content: string;
    type?: string;
    contentLength?: number; // 前端按"渲染后展示文本"算,异步填充
  }

  const props = defineProps<{
    noteId: string;
    noteType?: string;
  }>();
  const visible = defineModel('visible');
  const emit = defineEmits(['restored']);

  const { t } = useI18n();
  const bookmark = bookmarkStore();

  const versions = ref<VersionItem[]>([]);
  const listLoading = ref(false);
  const detailLoading = ref(false);
  const restoring = ref(false);
  const activeId = ref('');
  const activePreviewHtml = ref('');

  onMounted(fetchVersions);

  async function fetchVersions() {
    if (!props.noteId) return;
    listLoading.value = true;
    try {
      const res = await apiBasePost('/api/note/getNoteVersions', { id: props.noteId });
      if (res.status === 200 && Array.isArray(res.data)) {
        versions.value = res.data.map((v: any) => ({
          id: v.id,
          title: v.title,
          createTime: v.createTime,
          content: v.content || '',
          type: v.type,
          contentLength: undefined,
        }));
        // 逐条按"渲染后展示文本"异步算字数(不阻塞列表渲染;html/md 各自渲染后取文本)
        versions.value.forEach(async (v) => {
          v.contentLength = (await noteDisplayText(v.content, v.type)).length;
        });
        // 默认选中最近一条(改动前快照),省一次点击
        if (versions.value.length) {
          selectVersion(versions.value[0]);
        }
      }
    } finally {
      listLoading.value = false;
    }
  }

  async function selectVersion(v: VersionItem) {
    if (activeId.value === v.id) return;
    activeId.value = v.id;
    activePreviewHtml.value = '';
    detailLoading.value = true;
    try {
      // 直接用列表已带回的 content + type 渲染,md 走 marked,统一消毒;不再二次请求后端
      activePreviewHtml.value = await noteContentToHtml(v.content, v.type);
    } finally {
      detailLoading.value = false;
    }
  }

  function confirmRestore() {
    if (!activeId.value || restoring.value) return;
    if (blockGuestWrite('restore-note-version')) return;
    Alert.alert({
      title: t('noteDetail.history.restoreConfirmTitle'),
      content: t('noteDetail.history.restoreConfirm'),
      async onOk() {
        restoring.value = true;
        try {
          const res = await apiBasePost('/api/note/restoreNoteVersion', { id: activeId.value });
          if (res.status === 200) {
            message.success(t('noteDetail.history.restoreSuccess'));
            recordOperation({ module: '笔记', operation: `恢复历史版本【${res.data?.title || ''}】` });
            emit('restored', res.data);
            visible.value = false;
          }
        } finally {
          restoring.value = false;
        }
      },
    });
  }
</script>

<style lang="less" scoped>
  .note-history {
    width: min(80vw, 900px);
    display: grid;
    grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
    gap: 16px;
    color: var(--text-color);

    &.mobile {
      width: 100%;
      grid-template-columns: 1fr;
      gap: 12px;
    }
  }

  .version-list {
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--background-color);
    overflow: hidden;
  }

  .version-list-inner {
    position: relative;
    min-height: 240px;
    height: min(60vh, 460px);
  }

  .mobile .version-list-inner {
    height: 200px;
  }

  .list-scroll {
    height: 100%;
    overflow: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .version-item {
    padding: 10px 12px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: var(--background-color);
    cursor: pointer;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;

    &:hover {
      border-color: rgba(96, 92, 229, 0.4);
    }

    &.active {
      border-color: rgba(96, 92, 229, 0.75);
      background: color-mix(in srgb, var(--noteType-hover-color) 8%, var(--background-color));
    }
  }

  .version-time {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
  }

  .version-sub {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 4px;
  }

  .version-title-line {
    font-size: 12px;
    color: var(--desc-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .version-chars {
    font-size: 11px;
    color: var(--desc-color);
    flex-shrink: 0;
  }

  .version-preview {
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--background-color);
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--card-border-color);
    flex-shrink: 0;
  }

  .preview-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
  }

  .preview-body {
    position: relative;
    padding: 14px;
    height: min(60vh, 460px);
    overflow: auto;
  }

  .mobile .preview-body {
    height: 260px;
  }

  .preview-empty {
    color: var(--desc-color);
    font-size: 13px;
    text-align: center;
    padding-top: 40px;
  }

  .preview-html {
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-color);
    word-break: break-word;

    :deep(img),
    :deep(video),
    :deep(table) {
      max-width: 100%;
    }

    :deep(pre) {
      overflow-x: auto;
    }
  }

  .empty {
    padding: 40px 16px;
    text-align: center;
  }

  .empty-title {
    font-size: 14px;
    color: var(--text-color);
    font-weight: 600;
  }

  .empty-hint {
    margin-top: 6px;
    font-size: 12px;
    color: var(--desc-color);
    line-height: 1.6;
  }
</style>
