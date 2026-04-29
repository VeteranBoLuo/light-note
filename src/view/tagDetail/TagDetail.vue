<template>
  <div class="tag-detail-container">
    <!-- 标签头部信息 -->
    <div class="tag-header">
      <div class="tag-header-main">
        <img v-if="tag.iconUrl" :src="tag.iconUrl" class="tag-icon" alt=" " />
        <svg-icon v-else :src="icon.manage_categoryBtn_tag" size="28" />
        <span class="tag-name dom-hover" @click="goToEditTag" v-click-log="{ module: '标签详情', operation: `编辑标签【${tag.name}】` }">{{ tag.name }}</span>
      </div>
      <div v-if="relatedTags.length" class="tag-related">
        <span class="related-label">{{ $t('tagManage.relatedTag') }}:</span>
        <span
          v-for="rt in relatedTags"
          :key="rt.id"
          class="related-tag-item dom-hover"
          @click="goToTag(rt.id)"
          v-click-log="{ module: '标签详情', operation: `查看相关标签【${rt.name}】` }"
          >{{ rt.name }}</span
        >
      </div>
    </div>

    <!-- 内容区 -->
    <div class="tag-content">
      <div class="summary-grid">
        <div class="summary-card" :style="{ '--summary-color': RESOURCE_COLOR_HEX.tag }">
          <div class="summary-label">{{ $t('tagManage.relatedTag') }}</div>
          <div class="summary-value">{{ relatedTags.length }}</div>
        </div>
        <div class="summary-card" :style="{ '--summary-color': RESOURCE_COLOR_HEX.bookmark }">
          <div class="summary-label">{{ $t('tagManage.bookmark') }}</div>
          <div class="summary-value">{{ bookmarks.length }}</div>
        </div>
        <div class="summary-card" :style="{ '--summary-color': RESOURCE_COLOR_HEX.note }">
          <div class="summary-label">{{ $t('tagManage.note') }}</div>
          <div class="summary-value">{{ notes.length }}</div>
        </div>
        <div class="summary-card" :style="{ '--summary-color': RESOURCE_COLOR_HEX.file }">
          <div class="summary-label">{{ $t('tagManage.file') }}</div>
          <div class="summary-value">{{ files.length }}</div>
        </div>
      </div>

      <div v-if="relatedTags.length" class="resource-section">
        <div class="section-title" :style="{ color: RESOURCE_COLOR_HEX.tag }">
          <span class="type-dot" :style="{ background: RESOURCE_COLOR_HEX.tag }" />
          {{ $t('tagManage.relatedTag') }} ({{ relatedTags.length }})
        </div>
        <div class="related-tag-grid">
          <div v-for="rt in relatedTags" :key="rt.id" class="related-tag-card dom-hover" @click="goToTag(rt.id)" v-click-log="{ module: '标签详情', operation: `查看相关标签【${rt.name}】` }">
            <div class="related-tag-name">{{ rt.name }}</div>
          </div>
        </div>
      </div>

      <!-- 书签区块 -->
      <div v-if="bookmarks.length" class="resource-section">
        <div class="section-title" :style="{ color: RESOURCE_COLOR_HEX.bookmark }">
          <span class="type-dot" :style="{ background: RESOURCE_COLOR_HEX.bookmark }" />
          {{ $t('tagManage.bookmark') }} ({{ bookmarks.length }})
        </div>
        <div class="bookmark-grid">
          <div
            v-for="bm in bookmarks"
            :key="bm.id"
            class="bookmark-card dom-hover"
            @click="openBookmark(bm)"
            v-click-log="{ module: '标签详情', operation: `打开书签【${bm.name}】` }"
          >
            <div class="bookmark-card-header">
              <img
                :src="bm.iconUrl || `https://icon.bqb.cool?url=${bm.url}`"
                class="bookmark-card-icon"
                alt=" "
              />
              <span class="bookmark-card-name text-hidden">{{ bm.name }}</span>
            </div>
            <div class="bookmark-card-desc text-hidden">{{ bm.description || bm.url }}</div>
          </div>
        </div>
      </div>

      <!-- 笔记区块 -->
      <div v-if="notes.length" class="resource-section">
        <div class="section-title" :style="{ color: RESOURCE_COLOR_HEX.note }">
          <span class="type-dot" :style="{ background: RESOURCE_COLOR_HEX.note }" />
          {{ $t('tagManage.note') }} ({{ notes.length }})
        </div>
        <div class="note-list">
          <div
            v-for="note in notes"
            :key="note.id"
            class="note-item dom-hover"
            @click="router.push(`/noteLibrary/${note.id}`)"
            v-click-log="{ module: '标签详情', operation: `打开笔记【${note.title || '未命名文档'}】` }"
          >
            <div class="note-item-title">{{ note.title || $t('noteDetail.unnamedDoc', '未命名文档') }}</div>
            <div class="note-item-desc" v-html="getNoteDesc(note.content)" />
            <div v-if="note.tags?.length" class="note-item-tags">
              <span
                v-for="noteTag in note.tags"
                :key="noteTag.id"
                class="note-item-tag dom-hover"
                @click.stop="goToTag(noteTag.id)"
                v-click-log="{ module: '标签详情', operation: `查看笔记标签【${noteTag.name}】` }"
              >
                {{ noteTag.name }}
              </span>
            </div>
            <div class="note-item-time">{{ note.updateTime || note.createTime }}</div>
          </div>
        </div>
      </div>

      <!-- 文件区块 -->
      <div v-if="files.length" class="resource-section">
        <div class="section-title" :style="{ color: RESOURCE_COLOR_HEX.file }">
          <span class="type-dot" :style="{ background: RESOURCE_COLOR_HEX.file }" />
          {{ $t('tagManage.file') }} ({{ files.length }})
        </div>
        <div class="file-list">
          <div
            v-for="file in files"
            :key="file.id"
            class="file-item dom-hover"
            @click="previewFile(file)"
            v-click-log="{ module: '标签详情', operation: `预览文件【${file.fileName}】` }"
          >
            <div class="file-item-left">
              <svg-icon :src="getFileIcon(file)" size="28" />
              <div class="file-item-info">
                <div class="file-item-name text-hidden">{{ file.fileName }}</div>
                <div class="file-item-meta">{{ formatFileSize(file.fileSize) }} · {{ file.category }}</div>
              </div>
            </div>
            <div class="file-item-time">{{ file.uploadTime }}</div>
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!bookmarks.length && !notes.length && !files.length" class="empty-state">
        <div class="empty-text">{{ $t('tagManage.listEmptyText') }}</div>
      </div>
    </div>

    <!-- 文件预览 -->
    <FilePreview v-model:visible="filePreviewVisible" :fileInfo="previewFileInfo" @close="filePreviewVisible = false" />
  </div>
</template>

<script lang="ts" setup>
  import { ref, onMounted, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { RESOURCE_COLOR_HEX } from '@/config/resourceColor.ts';
  import { defineAsyncComponent } from 'vue';
  import { getCloudFileCategory } from '@/constants/cloudFileCategory.ts';

  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));

  const route = useRoute();
  const router = useRouter();
  const bookmark = bookmarkStore();
  const user = useUserStore();

  const tag = ref<any>({});
  const relatedTags = ref<any[]>([]);
  const bookmarks = ref<any[]>([]);
  const notes = ref<any[]>([]);
  const files = ref<any[]>([]);
  const loading = ref(false);

  const filePreviewVisible = ref(false);
  const previewFileInfo = ref<any>({});

  async function loadTagDetail() {
    const tagId = route.params.id as string;
    if (!tagId) return;

    loading.value = true;
    try {
      // 1. 获取标签详情
      const tagRes = await apiQueryPost('/api/bookmark/getTagDetail', {
        filters: { id: tagId },
      });
      if (tagRes.status === 200) {
        tag.value = tagRes.data || {};
      }

      // 2. 获取相关标签
      const relatedRes = await apiQueryPost('/api/bookmark/getRelatedTag', {
        filters: { userId: user.id, id: tagId },
      });
      if (relatedRes.status === 200) {
        relatedTags.value = relatedRes.data || [];
      }

      // 3. 获取关联书签
      const bmRes = await apiQueryPost('/api/bookmark/getBookmarkList', {
        filters: { userId: user.id, tagId, type: 'normal' },
      });
      if (bmRes.status === 200) {
        bookmarks.value = bmRes.data.items || [];
      }

      // 4. 获取关联笔记
      const noteRes = await apiBasePost('/api/note/queryNoteList', { tagId });
      if (noteRes.status === 200) {
        notes.value = (noteRes.data || []).map((n: any) => ({
          ...n,
          tags:
            n.tags && Array.isArray(n.tags) && n.tags.every((t: any) => t && t.id !== null)
              ? n.tags
              : [],
        }));
      }

      // 5. 获取关联文件
      const fileRes = await apiBasePost('/api/file/queryFiles', {
        filters: { tagId, category: ['image', 'video', 'audio', 'pdf', 'word', 'excel', 'ppt', 'text', 'compress', 'other'] },
      });
      if (fileRes.status === 200) {
        files.value = (fileRes.data || []).map((f: any) => ({
          ...f,
          tags:
            f.tags && Array.isArray(f.tags) && f.tags.every((t: any) => t && t.id !== null)
              ? f.tags
              : [],
        }));
      }
    } finally {
      loading.value = false;
    }
  }

  function goToTag(tagId: string) {
    router.push(`/tag/${tagId}`);
  }

  function goToEditTag() {
    if (!tag.value?.id) return;
    router.push(`/manage/editTag/${tag.value.id}`);
  }

  function openBookmark(bm: any) {
    let url = bm.url || '';
    if (['https', 'http'].some((str) => !url.includes(str))) {
      url = 'https://' + url;
    }
    window.open(url, '_blank');
  }

  function getNoteDesc(content: string) {
    if (!content) return '';
    const div = document.createElement('div');
    div.innerHTML = content;
    const text = div.textContent || div.innerText || '';
    return text.length > 120 ? text.substring(0, 120) + '...' : text;
  }

  function getFileIcon(file: any) {
    return icon.cloudSpace.fileIcon[getCloudFileCategory(file)] || icon.file_other;
  }

  function formatFileSize(size?: number) {
    if (!size) return '0 B';
    if (size < 1024) return size + ' B';
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + ' KB';
    return (size / (1024 * 1024)).toFixed(2) + ' MB';
  }

  function previewFile(file: any) {
    previewFileInfo.value = file;
    filePreviewVisible.value = true;
  }

  watch(
    () => route.params.id,
    () => {
      loadTagDetail();
    },
  );

  onMounted(() => {
    loadTagDetail();
  });
</script>

<style lang="less" scoped>
  .tag-detail-container {
    width: 100%;
    height: calc(100vh - 76px);
    padding: 20px;
    box-sizing: border-box;
    overflow-y: auto;
    min-height: 0;
  }

  .tag-header {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--card-border-color);

    .tag-header-main {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .tag-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
    }

    .tag-name {
      font-size: 22px;
      font-weight: 600;
      color: var(--primary-color);
      cursor: pointer;
      transition: color 0.2s ease;
    }

    .tag-name:hover {
      color: color-mix(in srgb, var(--primary-color) 82%, white);
    }

    .tag-related {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;

      .related-label {
        font-size: 13px;
        color: var(--desc-color);
      }

      .related-tag-item {
        padding: 3px 10px;
        border-radius: 20px;
        font-size: 13px;
        background: var(--common-tag-bg-color);
        color: var(--desc-color);
        cursor: pointer;

        &:hover {
          color: var(--common-tag-h-color);
        }
      }
    }
  }

  .tag-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
  }

  .summary-card {
    border-radius: 8px;
    border: 1px solid var(--card-border-color);
    border-top: 3px solid var(--summary-color);
    padding: 14px 16px;
    background: var(--background-color);
  }

  .summary-label {
    font-size: 13px;
    color: var(--desc-color);
  }

  .summary-value {
    margin-top: 6px;
    font-size: 24px;
    font-weight: 600;
  }

  .resource-section {
    .section-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .type-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
  }

  .bookmark-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }

  .related-tag-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 12px;
  }

  .related-tag-card {
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    padding: 14px;
    background: var(--background-color);
  }

  .related-tag-name {
    font-weight: 600;
  }

  .bookmark-card {
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    padding: 12px;
    background: var(--background-color);
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: var(--primary-h-color);
      box-shadow: var(--ant-table-boxShadow);
      transform: translateY(-1px);
    }

    .bookmark-card-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .bookmark-card-icon {
      width: 22px;
      height: 22px;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .bookmark-card-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-color);
      flex: 1;
    }

    .bookmark-card-desc {
      font-size: 12px;
      color: var(--desc-color);
    }
  }

  .note-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }

  .note-item {
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    padding: 14px;
    background: var(--background-color);
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: #8b88f2;
      box-shadow: var(--ant-table-boxShadow);
    }

    .note-item-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-color);
      margin-bottom: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .note-item-desc {
      font-size: 12px;
      color: var(--desc-color);
      line-height: 1.5;
      height: 54px;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      -webkit-box-orient: vertical;
      word-break: break-all;
      margin-bottom: 8px;
    }

    .note-item-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }

    .note-item-tag {
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      line-height: 18px;
      color: var(--desc-color);
      background: var(--common-tag-bg-color);
      border: 1px solid var(--card-border-color);
    }

    .note-item-time {
      font-size: 12px;
      color: var(--desc-color);
      opacity: 0.8;
    }
  }

  .file-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 12px;
  }

  .file-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    background: var(--background-color);
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      border-color: var(--primary-h-color);
    }

    .file-item-left {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
      min-width: 0;
    }

    :deep(svg) {
      min-width: 28px;
    }

    .file-item-info {
      flex: 1;
      min-width: 0;
    }

    .file-item-name {
      font-size: 14px;
      color: var(--text-color);
      margin-bottom: 2px;
    }

    .file-item-meta {
      font-size: 12px;
      color: var(--desc-color);
      opacity: 0.8;
    }

    .file-item-time {
      font-size: 12px;
      color: var(--desc-color);
      opacity: 0.7;
      white-space: nowrap;
      margin-left: 10px;
    }
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;

    .empty-text {
      font-size: 14px;
      color: var(--desc-color);
      opacity: 0.7;
    }
  }

  @media (max-width: 767px) {
    .tag-detail-container {
      height: 100%;
      padding: 12px;
    }

    .tag-header {
      .tag-name {
        font-size: 18px;
      }
    }

    .bookmark-grid {
      grid-template-columns: 1fr 1fr;
    }

    .note-list {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 1200px) {
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
