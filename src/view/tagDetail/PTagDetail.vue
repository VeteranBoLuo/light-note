<template>
  <CommonContainer :title="tag.name || $t('tagManage.title')">
    <div class="p-tag-detail">
      <!-- 标签头部信息 -->
      <div class="p-tag-header">
        <div class="p-tag-header-main">
          <img
            v-if="tag.iconUrl && !tagIconLoadError"
            :src="tag.iconUrl"
            class="p-tag-icon"
            alt=" "
            @error="handleTagIconError"
          />
          <svg-icon v-else :src="icon.manage_categoryBtn_tag" size="24" />
          <span class="p-tag-name" @click="goToEditTag" v-click-log="{ module: '标签详情', operation: `编辑标签【${tag.name}】` }">{{ tag.name }}</span>
        </div>
        <div v-if="relatedTags.length" class="p-tag-related">
          <span class="p-related-label">{{ $t('tagManage.relatedTag') }}:</span>
          <span
            v-for="rt in relatedTags"
            :key="rt.id"
            class="p-related-tag-item"
            @click="goToTag(rt.id)"
            v-click-log="{ module: '标签详情', operation: `查看相关标签【${rt.name}】` }"
            >{{ rt.name }}</span
          >
        </div>
      </div>

      <!-- 内容区 -->
      <div class="p-tag-content">
        <div class="p-summary-grid">
          <div class="p-summary-card" :style="{ '--summary-color': RESOURCE_COLOR_HEX.tag }">
            <div class="p-summary-label">{{ $t('tagManage.relatedTag') }}</div>
            <div class="p-summary-value">{{ relatedTags.length }}</div>
          </div>
          <div class="p-summary-card" :style="{ '--summary-color': RESOURCE_COLOR_HEX.bookmark }">
            <div class="p-summary-label">{{ $t('tagManage.bookmark') }}</div>
            <div class="p-summary-value">{{ bookmarks.length }}</div>
          </div>
          <div class="p-summary-card" :style="{ '--summary-color': RESOURCE_COLOR_HEX.note }">
            <div class="p-summary-label">{{ $t('tagManage.note') }}</div>
            <div class="p-summary-value">{{ notes.length }}</div>
          </div>
          <div class="p-summary-card" :style="{ '--summary-color': RESOURCE_COLOR_HEX.file }">
            <div class="p-summary-label">{{ $t('tagManage.file') }}</div>
            <div class="p-summary-value">{{ files.length }}</div>
          </div>
        </div>

        <div v-if="relatedTags.length" class="p-resource-section">
          <div class="p-section-title" :style="{ color: RESOURCE_COLOR_HEX.tag }">
            <span class="p-type-dot" :style="{ background: RESOURCE_COLOR_HEX.tag }" />
            {{ $t('tagManage.relatedTag') }} ({{ relatedTags.length }})
          </div>
          <div class="p-related-tag-list">
            <div v-for="rt in relatedTags" :key="rt.id" class="p-related-tag-card" @click="goToTag(rt.id)" v-click-log="{ module: '标签详情', operation: `查看相关标签【${rt.name}】` }">
              {{ rt.name }}
            </div>
          </div>
        </div>

        <!-- 书签区块 -->
        <div v-if="bookmarks.length" class="p-resource-section">
          <div class="p-section-title" :style="{ color: RESOURCE_COLOR_HEX.bookmark }">
            <span class="p-type-dot" :style="{ background: RESOURCE_COLOR_HEX.bookmark }" />
            {{ $t('tagManage.bookmark') }} ({{ bookmarks.length }})
          </div>
          <div class="p-bookmark-list">
            <div
              v-for="bm in bookmarks"
              :key="bm.id"
              class="p-bookmark-card"
              @click="openBookmark(bm)"
              v-click-log="{ module: '标签详情', operation: `打开书签【${bm.name}】` }"
            >
              <img
                :src="getBookmarkIcon(bm)"
                class="p-bookmark-icon"
                alt=" "
                @error="handleBookmarkIconError"
              />
              <span class="p-bookmark-name text-hidden">{{ bm.name }}</span>
            </div>
          </div>
        </div>

        <!-- 笔记区块 -->
        <div v-if="notes.length" class="p-resource-section">
          <div class="p-section-title" :style="{ color: RESOURCE_COLOR_HEX.note }">
            <span class="p-type-dot" :style="{ background: RESOURCE_COLOR_HEX.note }" />
            {{ $t('tagManage.note') }} ({{ notes.length }})
          </div>
          <div class="p-note-list">
            <div
              v-for="note in notes"
              :key="note.id"
              class="p-note-item"
              @click="router.push(`/noteLibrary/${note.id}`)"
              v-click-log="{ module: '标签详情', operation: `打开笔记【${note.title || '未命名文档'}】` }"
            >
              <div class="p-note-title">{{ note.title || $t('noteDetail.unnamedDoc', '未命名文档') }}</div>
              <div v-if="note.tags?.length" class="p-note-tags">
                <span
                  v-for="noteTag in note.tags"
                  :key="noteTag.id"
                  class="p-note-tag"
                  @click.stop="goToTag(noteTag.id)"
                  v-click-log="{ module: '标签详情', operation: `查看笔记标签【${noteTag.name}】` }"
                >
                  {{ noteTag.name }}
                </span>
              </div>
              <div class="p-note-time">{{ note.updateTime || note.createTime }}</div>
            </div>
          </div>
        </div>

        <!-- 文件区块 -->
        <div v-if="files.length" class="p-resource-section">
          <div class="p-section-title" :style="{ color: RESOURCE_COLOR_HEX.file }">
            <span class="p-type-dot" :style="{ background: RESOURCE_COLOR_HEX.file }" />
            {{ $t('tagManage.file') }} ({{ files.length }})
          </div>
          <div class="p-file-list">
            <div
              v-for="file in files"
              :key="file.id"
              class="p-file-item"
              @click="previewFile(file)"
              v-click-log="{ module: '标签详情', operation: `预览文件【${file.fileName}】` }"
            >
              <svg-icon :src="getFileIcon(file)" size="24" />
              <span class="p-file-name text-hidden">{{ file.fileName }}</span>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="!bookmarks.length && !notes.length && !files.length" class="p-empty-state">
          <div class="p-empty-text">{{ $t('tagManage.listEmptyText') }}</div>
        </div>
      </div>
    </div>

    <!-- 文件预览 -->
    <FilePreview v-model:visible="filePreviewVisible" :fileInfo="previewFileInfo" @close="filePreviewVisible = false" />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { ref, onMounted, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { RESOURCE_COLOR_HEX } from '@/config/resourceColor.ts';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { defineAsyncComponent } from 'vue';
  import { getCloudFileCategory } from '@/constants/cloudFileCategory.ts';

  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));

  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();

  const tag = ref<any>({});
  const tagIconLoadError = ref(false);
  const relatedTags = ref<any[]>([]);
  const bookmarks = ref<any[]>([]);
  const notes = ref<any[]>([]);
  const files = ref<any[]>([]);

  const filePreviewVisible = ref(false);
  const previewFileInfo = ref<any>({});

  async function loadTagDetail() {
    const tagId = route.params.id as string;
    if (!tagId) return;

    // 1. 获取标签详情
    const tagRes = await apiQueryPost('/api/bookmark/getTagDetail', {
      filters: { id: tagId },
    });
    if (tagRes.status === 200) {
      tag.value = tagRes.data || {};
      tagIconLoadError.value = false;
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
    if (url && !/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    window.open(url, '_blank');
  }

  function getBookmarkIcon(bookmark: any) {
    if (bookmark.iconUrl) {
      return bookmark.iconUrl;
    }
    return `https://icon.bqb.cool?url=${bookmark.url || ''}`;
  }

  function handleBookmarkIconError(event: Event) {
    const target = event.target as HTMLImageElement | null;
    if (target) {
      target.src = icon.nullImg;
    }
  }

  function handleTagIconError() {
    tagIconLoadError.value = true;
  }

  function getFileIcon(file: any) {
    return icon.cloudSpace.fileIcon[getCloudFileCategory(file)] || icon.file_other;
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
  .p-tag-detail {
    width: 100%;
    padding: 12px;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .p-tag-header {
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--card-border-color);

    .p-tag-header-main {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 10px;
    }

    .p-tag-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      object-fit: cover;
    }

    .p-tag-name {
      font-size: 18px;
      font-weight: 600;
      color: var(--primary-color);
      cursor: pointer;
      transition: color 0.2s ease;
    }

    .p-tag-name:active {
      color: color-mix(in srgb, var(--primary-color) 82%, white);
    }

    .p-tag-related {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;

      .p-related-label {
        font-size: 12px;
        color: var(--desc-color);
      }

      .p-related-tag-item {
        padding: 2px 8px;
        border-radius: 20px;
        font-size: 12px;
        background: var(--common-tag-bg-color);
        color: var(--desc-color);
      }
    }
  }

  .p-tag-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .p-summary-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .p-summary-card {
    border: 1px solid var(--card-border-color);
    border-top: 3px solid var(--summary-color);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--background-color);
  }

  .p-summary-label {
    font-size: 12px;
    color: var(--desc-color);
  }

  .p-summary-value {
    margin-top: 4px;
    font-size: 18px;
    font-weight: 600;
  }

  .p-resource-section {
    .p-section-title {
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .p-type-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }
  }

  .p-related-tag-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .p-related-tag-card {
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--background-color);
  }

  .p-note-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0;
  }

  .p-note-tag {
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    color: var(--desc-color);
    background: var(--common-tag-bg-color);
    border: 1px solid var(--card-border-color);
  }

  .p-bookmark-list {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .p-bookmark-card {
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    padding: 10px;
    background: var(--background-color);
    display: flex;
    align-items: center;
    gap: 8px;

    .p-bookmark-icon {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }

    .p-bookmark-name {
      font-size: 13px;
      color: var(--text-color);
    }
  }

  .p-note-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .p-note-item {
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    padding: 10px 12px;
    background: var(--background-color);

    .p-note-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-color);
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .p-note-time {
      font-size: 11px;
      color: var(--desc-color);
      opacity: 0.8;
    }
  }

  .p-file-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .p-file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    background: var(--background-color);

    .p-file-name {
      font-size: 13px;
      color: var(--text-color);
      flex: 1;
    }
  }

  .p-empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 160px;

    .p-empty-text {
      font-size: 13px;
      color: var(--desc-color);
      opacity: 0.7;
    }
  }
</style>
