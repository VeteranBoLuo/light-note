<template>
  <div class="tag-detail-container" :class="{ 'tag-detail-container--graph': viewMode === 'graph' }">
    <!-- 标签头部信息 -->
    <div class="tag-header">
      <div class="tag-header-main">
        <img
          v-if="tag.iconUrl && !tagIconLoadError"
          :src="tag.iconUrl"
          class="tag-icon"
          alt=" "
          @error="handleTagIconError"
        />
        <svg-icon v-else :src="icon.manage_categoryBtn_tag" size="28" />
        <span
          class="tag-name dom-hover"
          @click="goToEditTag"
          v-click-log="{ module: '标签详情', operation: `编辑标签【${tag.name}】` }"
          >{{ tag.name }}</span
        >
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

      <div class="view-switch">
        <button class="view-switch-btn" :class="{ active: viewMode === 'card' }" @click="setViewMode('card')">
          {{ t('tagGraph.viewMode.card') }}
        </button>
        <button class="view-switch-btn" :class="{ active: viewMode === 'graph' }" @click="setViewMode('graph')">
          {{ t('tagGraph.viewMode.graph') }}
        </button>
      </div>

      <section v-if="viewMode === 'graph'" class="tag-graph-section tag-graph-section--full">
        <div class="tag-graph-layout">
          <TagGraphCanvas
            ref="tagGraphRef"
            style="position: relative"
            :nodes="graphData?.nodes || []"
            :edges="graphData?.edges || []"
            :loading="graphLoading"
            :compact="false"
            :full-height="true"
            :active-node-id="activeGraphNode?.id"
            @node-click="handleGraphNodeClick"
            @node-dblclick="handleGraphNodeDoubleClick"
            @canvas-click="activeGraphNode = null"
          >
            <template #actions>
              <b-button size="small" @click="toggleGraphResources">
                {{ graphFilters.includeResources ? t('tagGraph.hideResource') : t('tagGraph.showResource') }}
              </b-button>
              <b-button size="small" type="primary" @click="reloadGraph">
                {{ t('tagGraph.reset') }}
              </b-button>
            </template>
          </TagGraphCanvas>
          <TagGraphPanel
            :node="activeGraphNode"
            :connected-resources="graphConnectedResources"
            @explore-tag="handlePanelExploreTag"
            @open-resource="openGraphNode"
          />
        </div>
      </section>

      <div v-if="viewMode === 'card' && relatedTags.length" class="resource-section">
        <div class="section-title" :style="{ color: RESOURCE_COLOR_HEX.tag }">
          <span class="type-dot" :style="{ background: RESOURCE_COLOR_HEX.tag }" />
          {{ $t('tagManage.relatedTag') }} ({{ relatedTags.length }})
        </div>
        <div class="related-tag-grid">
          <div
            v-for="rt in relatedTags"
            :key="rt.id"
            class="related-tag-card dom-hover"
            @click="goToTag(rt.id)"
            v-click-log="{ module: '标签详情', operation: `查看相关标签【${rt.name}】` }"
          >
            <div class="related-tag-name">{{ rt.name }}</div>
          </div>
        </div>
      </div>

      <!-- 书签区块 -->
      <div v-if="viewMode === 'card' && bookmarks.length" class="resource-section">
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
              <img :src="getBookmarkIcon(bm)" class="bookmark-card-icon" alt=" " @error="handleBookmarkIconError" />
              <span class="bookmark-card-name text-hidden">{{ bm.name }}</span>
            </div>
            <div class="bookmark-card-desc text-hidden">{{ bm.description || bm.url }}</div>
          </div>
        </div>
      </div>

      <!-- 笔记区块 -->
      <div v-if="viewMode === 'card' && notes.length" class="resource-section">
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
            <div class="note-item-desc" v-html="getNoteDesc(note.content, note.type)" />
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
      <div v-if="viewMode === 'card' && files.length" class="resource-section">
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
      <div v-if="viewMode === 'card' && !bookmarks.length && !notes.length && !files.length" class="empty-state">
        <div class="empty-text">{{ $t('tagManage.listEmptyText') }}</div>
      </div>
    </div>

    <!-- 文件预览 -->
    <FilePreview v-model:visible="filePreviewVisible" :fileInfo="previewFileInfo" @close="filePreviewVisible = false" />
  </div>
</template>

<script lang="ts" setup>
  import { reactive, ref, computed, onMounted, watch } from 'vue';
  import { useRoute, useRouter } from 'vue-router';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';
  import { useUserStore } from '@/store';
  import { updatePreference } from '@/utils/savePreference';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { RESOURCE_COLOR_HEX } from '@/config/resourceColor.ts';
  import { defineAsyncComponent } from 'vue';
  import { getCloudFileCategory } from '@/constants/cloudFileCategory.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import TagGraphPanel from '@/components/tagGraph/TagGraphPanel.vue';
  import { fetchTagGraph, type GraphResourceType, type TagGraphNode, type TagGraphResponse } from '@/api/tagGraph.ts';
  import { useI18n } from 'vue-i18n';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';

  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));
  const TagGraphCanvas = defineAsyncComponent(() => import('@/components/tagGraph/TagGraphCanvas.vue'));

  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const { t } = useI18n();

  const tag = ref<any>({});
  const tagIconLoadError = ref(false);
  const relatedTags = ref<any[]>([]);
  const bookmarks = ref<any[]>([]);
  const notes = ref<any[]>([]);
  const files = ref<any[]>([]);
  const loading = ref(false);

  const filePreviewVisible = ref(false);
  const previewFileInfo = ref<any>({});
  const graphLoading = ref(false);
  const graphData = ref<TagGraphResponse | null>(null);
  const activeGraphNode = ref<TagGraphNode | null>(null);
  const tagGraphRef = ref<InstanceType<typeof TagGraphCanvas> | null>(null);
  const TAG_DETAIL_VIEW_MODE_KEY = 'tag-detail-view-mode';
  const viewMode = ref<'graph' | 'card'>('card');
  let tagDetailRequestSeq = 0;
  let tagGraphRequestSeq = 0;
  const graphFilters = reactive({
    includeResources: true,
    resourceTypes: ['bookmark', 'note', 'file'] as GraphResourceType[],
  });

  const graphConnectedResources = computed(() => {
    if (!activeGraphNode.value || !graphData.value) return [];
    if (activeGraphNode.value.type === 'tag') {
      const { nodes, edges } = graphData.value;
      const connectedIds = new Set<string>();
      edges.forEach((edge) => {
        if (edge.source === activeGraphNode.value!.id) connectedIds.add(edge.target);
        if (edge.target === activeGraphNode.value!.id) connectedIds.add(edge.source);
      });
      return nodes.filter((n) => connectedIds.has(n.id) && n.type !== 'tag');
    }
    return [];
  });

  async function loadTagDetail() {
    const tagId = route.params.id as string;
    if (!tagId) return;
    const requestSeq = ++tagDetailRequestSeq;

    loading.value = true;
    try {
      // 1. 获取标签详情
      const tagRes = await apiQueryPost('/api/bookmark/getTagDetail', {
        filters: { id: tagId },
      });
      if (requestSeq !== tagDetailRequestSeq) return;
      if (tagRes.status === 200) {
        tag.value = tagRes.data || {};
        tagIconLoadError.value = false;
      }

      // 2. 获取相关标签
      const relatedRes = await apiQueryPost('/api/bookmark/getRelatedTag', {
        filters: { userId: user.id, id: tagId },
      });
      if (requestSeq !== tagDetailRequestSeq) return;
      if (relatedRes.status === 200) {
        relatedTags.value = relatedRes.data || [];
      }

      // 3. 获取关联书签
      const bmRes = await apiQueryPost('/api/bookmark/getBookmarkList', {
        filters: { userId: user.id, tagId, type: 'normal' },
      });
      if (requestSeq !== tagDetailRequestSeq) return;
      if (bmRes.status === 200) {
        bookmarks.value = bmRes.data.items || [];
      }

      // 4. 获取关联笔记
      const noteRes = await apiBasePost('/api/note/queryNoteList', { tagId });
      if (requestSeq !== tagDetailRequestSeq) return;
      if (noteRes.status === 200) {
        notes.value = (noteRes.data || []).map((n: any) => ({
          ...n,
          tags: n.tags && Array.isArray(n.tags) && n.tags.every((t: any) => t && t.id !== null) ? n.tags : [],
        }));
      }

      // 5. 获取关联文件
      const fileRes = await apiBasePost('/api/file/queryFiles', {
        filters: {
          tagId,
          category: ['image', 'video', 'audio', 'pdf', 'word', 'excel', 'ppt', 'text', 'compress', 'other'],
        },
      });
      if (requestSeq !== tagDetailRequestSeq) return;
      if (fileRes.status === 200) {
        files.value = (fileRes.data || []).map((f: any) => ({
          ...f,
          tags: f.tags && Array.isArray(f.tags) && f.tags.every((t: any) => t && t.id !== null) ? f.tags : [],
        }));
      }

      await loadTagGraph(tagId);
    } finally {
      if (requestSeq === tagDetailRequestSeq) {
        loading.value = false;
      }
    }
  }

  async function loadTagGraph(tagId = String(route.params.id || '')) {
    if (!tagId) return;
    const requestSeq = ++tagGraphRequestSeq;
    const isFirstLoad = !graphData.value?.nodes?.length;
    graphLoading.value = isFirstLoad;
    try {
      const res = await fetchTagGraph({
        tagId,
        includeResources: graphFilters.includeResources,
        resourceTypes: graphFilters.resourceTypes,
        limitRelatedTags: 12,
        limitPerResourceType: 20,
      });
      if (requestSeq !== tagGraphRequestSeq) return;
      if (res.status === 200) {
        const nextGraphData = enrichGraphData(res.data, tagId);
        graphData.value = nextGraphData;
        activeGraphNode.value =
          nextGraphData.nodes.find((node) => node.type === 'tag' && node.rawId === tagId) ||
          nextGraphData.nodes[0] ||
          null;
      }
    } finally {
      if (requestSeq === tagGraphRequestSeq) {
        graphLoading.value = false;
      }
    }
  }

  function toCount(value: unknown) {
    const count = Number(value);
    return Number.isFinite(count) ? count : 0;
  }

  function getCurrentTagResourceCount(data?: TagGraphResponse) {
    const graphStatsCount =
      toCount(data?.stats?.bookmarkCount) + toCount(data?.stats?.noteCount) + toCount(data?.stats?.fileCount);
    const detailResourceCount = bookmarks.value.length + notes.value.length + files.value.length;
    return Math.max(graphStatsCount, detailResourceCount);
  }

  function countGraphResourceNeighbors(data: TagGraphResponse, nodeId: string) {
    const nodeTypeMap = new Map(data.nodes.map((node) => [node.id, node.type]));
    const resourceIds = new Set<string>();
    data.edges.forEach((edge) => {
      const targetId = edge.source === nodeId ? edge.target : edge.target === nodeId ? edge.source : '';
      if (!targetId) return;
      const targetType = nodeTypeMap.get(targetId);
      if (targetType && targetType !== 'tag') {
        resourceIds.add(targetId);
      }
    });
    return resourceIds.size;
  }

  function enrichGraphData(data: TagGraphResponse, tagId: string): TagGraphResponse {
    const nodes = data.nodes.map((node) => {
      if (node.type !== 'tag') return node;

      const edgeResourceCount = countGraphResourceNeighbors(data, node.id);
      const currentTagCount = String(node.rawId) === String(tagId) ? getCurrentTagResourceCount(data) : 0;
      const relatedCount = Math.max(toCount(node.meta?.relatedCount), edgeResourceCount, currentTagCount);

      return {
        ...node,
        meta: {
          ...node.meta,
          relatedCount,
        },
      };
    });

    return {
      ...data,
      nodes,
    };
  }

  function reloadGraph() {
    activeGraphNode.value = null;
    tagGraphRef.value?.resetView();
    loadTagGraph();
  }

  function setViewMode(mode: 'graph' | 'card') {
    viewMode.value = mode;
    localStorage.setItem(TAG_DETAIL_VIEW_MODE_KEY, mode);
    updatePreference({ tagView: mode }).catch(() => {}); // 记忆到偏好:跨设备 + 设置页可改
  }

  function toggleGraphResources() {
    graphFilters.includeResources = !graphFilters.includeResources;
    reloadGraph();
  }

  function handleGraphNodeClick(node: TagGraphNode) {
    activeGraphNode.value = node;
  }

  function handleGraphNodeDoubleClick(node: TagGraphNode) {
    if (node.type === 'tag') {
      handlePanelExploreTag(node);
      return;
    }
    openGraphNode(node);
  }

  function handlePanelExploreTag(node: TagGraphNode) {
    if (node.type !== 'tag') return;
    setViewMode('graph');
    if (String(route.params.id || '') === String(node.rawId || '')) {
      reloadGraph();
      message.info(t('tagGraph.panel.exploreCurrent'));
      return;
    }
    goToTag(node.rawId);
  }

  function openGraphNode(node: TagGraphNode) {
    if (node.type === 'bookmark' && node.meta?.url) {
      openBookmark({ url: node.meta.url });
      return;
    }
    if (node.type === 'note') {
      router.push(`/noteLibrary/${node.rawId}`);
      return;
    }
    if (node.type === 'file') {
      const targetFile = files.value.find((file) => file.id === node.rawId);
      if (targetFile) {
        previewFile(targetFile);
      }
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
    openBookmarkUrl(bm.url || '');
  }

  function getBookmarkIcon(bookmark: any) {
    // 无图标用站内默认图,不再直连第三方 ico.kucat.cn(真实 favicon 由后端抓取写回 iconUrl)
    return bookmark.iconUrl || icon.nullImg;
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

  function getNoteDesc(content: string, type?: string) {
    if (!content) return '';
    // Markdown 笔记
    if (type === 'markdown' && !content.includes('<')) {
      const text = content
        .replace(/[#*`~>\[\]()_-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      return text.length > 120 ? text.substring(0, 120) + '...' : text;
    }
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
    const saved = user.preferences.tagView || localStorage.getItem(TAG_DETAIL_VIEW_MODE_KEY);
    if (saved === 'graph' || saved === 'card') {
      viewMode.value = saved;
    }
    loadTagDetail();
  });
</script>

<style lang="less" scoped>
  .tag-detail-container {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: calc(100vh - 76px);
    padding: 20px;
    box-sizing: border-box;
    overflow-y: auto;
    min-height: 0;
  }

  .tag-detail-container--graph {
    overflow: hidden;
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
      border-radius: 50%;
      object-fit: cover;
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
    gap: 18px;
  }

  .tag-detail-container--graph .tag-content {
    flex: 1;
    min-height: 0;
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

  .view-switch {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    border: 1px solid var(--card-border-color);
    border-radius: 999px;
    padding: 4px;
    background: color-mix(in srgb, var(--background-color) 96%, white);
  }

  .view-switch-btn {
    border: 0;
    background: transparent;
    color: var(--desc-color);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 12px;
    line-height: 16px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .view-switch-btn.active {
    color: var(--text-color);
    background: color-mix(in srgb, var(--resource-tag-color) 14%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--resource-tag-color) 32%, transparent);
  }

  .tag-graph-section {
    overflow: hidden;
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    background: var(--background-color);
    box-shadow: var(--ant-table-boxShadow);
  }

  .tag-graph-section--full {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .tag-graph-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--card-border-color);
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--resource-tag-color) 8%, transparent), transparent 46%),
      var(--background-color);
  }

  .tag-graph-title {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-color);
  }

  .tag-graph-subtitle {
    margin-top: 4px;
    font-size: 12px;
    color: var(--desc-color);
  }

  .tag-graph-current {
    margin-top: 8px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 320px;
    color: var(--desc-color);
    font-size: 11px;
    opacity: 0.86;
  }

  .tag-graph-current-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--resource-tag-color);
    flex-shrink: 0;
  }

  .tag-graph-current-text {
    font-weight: 500;
    color: var(--text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag-graph-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    min-height: 460px;
  }

  .tag-detail-container--graph .tag-graph-layout {
    min-height: 0;
    height: 100%;
    flex: 1;
  }

  .resource-section {
    scroll-margin-top: 16px;

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
      border-radius: 50%;
      object-fit: cover;
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
      min-width: 0;
      max-width: 100%;
      height: 100%;
      padding: 12px;
      overflow-x: hidden;
    }

    .tag-content,
    .resource-section,
    .summary-grid,
    .related-tag-grid,
    .bookmark-grid,
    .note-list,
    .file-list {
      min-width: 0;
      max-width: 100%;
    }

    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .tag-graph-header {
      align-items: flex-start;
      flex-direction: column;
    }

    .tag-graph-layout {
      grid-template-columns: minmax(0, 1fr);
      min-height: 0;
    }

    .tag-header {
      .tag-name {
        font-size: 18px;
      }
    }

    .bookmark-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .related-tag-grid,
    .note-list,
    .file-list {
      grid-template-columns: minmax(0, 1fr);
    }

    .related-tag-card,
    .bookmark-card,
    .note-item,
    .file-item {
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
    }

    .bookmark-card-header,
    .bookmark-card-name {
      min-width: 0;
    }
  }

  @media (max-width: 1200px) {
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
