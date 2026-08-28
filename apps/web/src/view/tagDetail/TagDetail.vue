<template>
  <ResourcePageShell
    :title="tag?.name || t('tagSpace.detailTitle')"
    :subtitle="detailSubtitle"
    accent="tag"
    layout="workspace"
    show-back
    @back="router.back()"
  >
    <template #meta>
      <span v-if="tag" class="detail-tag-icon">
        <img v-if="tag.iconUrl && !tagIconLoadError" :src="tag.iconUrl" alt="" @error="tagIconLoadError = true" />
        <SvgIcon v-else :src="icon.manage_categoryBtn_tag" size="19" aria-hidden="true" />
      </span>
    </template>
    <template #actions>
      <BButton v-if="tag && !isReadOnly" @click="editTag">
        <SvgIcon :src="icon.table_edit" size="14" aria-hidden="true" />
        {{ t('common.edit') }}
      </BButton>
      <BButton v-if="tag" type="primary" :loading="aiLoading" @click="openTagInAi">
        <SvgIcon :src="icon.ai.ask" size="15" aria-hidden="true" />
        {{ t('tagSpace.askAi') }}
      </BButton>
    </template>

    <div v-auto-scrollbar class="tag-space-detail" :class="{ 'is-graph': viewMode === 'graph' }">
      <div v-if="detailLoading" class="detail-loading" aria-busy="true" :aria-label="t('common.loading')">
        <BCard variant="raised" class="detail-hero-skeleton">
          <span class="skeleton-line skeleton-line--title"></span>
          <span class="skeleton-line"></span>
          <span class="skeleton-line skeleton-line--short"></span>
        </BCard>
        <div class="resource-list">
          <BCard v-for="index in 6" :key="index" class="resource-skeleton">
            <span class="skeleton-line skeleton-line--title"></span>
            <span class="skeleton-line"></span>
          </BCard>
        </div>
      </div>

      <BCard v-else-if="detailError || !tag" variant="raised" class="detail-state" role="alert">
        <span class="state-symbol">!</span>
        <strong>{{ t('tagSpace.detailLoadFailedTitle') }}</strong>
        <p>{{ t('tagSpace.detailLoadFailedDesc') }}</p>
        <div class="state-actions">
          <BButton @click="router.push('/manage/tagMg')">{{ t('tagSpace.backToSpaces') }}</BButton>
          <BButton type="primary" @click="loadDetail">{{ t('common.retry') }}</BButton>
        </div>
      </BCard>

      <template v-else>
        <BCard as="section" variant="raised" padding="16px 18px" class="detail-overview">
          <div class="overview-copy">
            <span class="overview-kicker">{{ t('tagSpace.spaceOverview') }}</span>
            <strong>{{ t('tagSpace.resourceTotal', { count: tag.counts.total }) }}</strong>
            <p>{{ t(tag.counts.total ? 'tagSpace.detailHint' : 'tagSpace.emptyDetailHint') }}</p>
          </div>
          <div class="overview-counts">
            <div v-for="metric in overviewMetrics" :key="metric.key" class="overview-count">
              <span class="resource-icon" :class="`resource-icon--${metric.key}`">
                <SvgIcon :src="resourceIcon(metric.key)" size="17" />
              </span>
              <div>
                <strong>{{ metric.value }}</strong>
                <span>{{ metric.label }}</span>
              </div>
            </div>
          </div>
          <div v-if="relatedTags.length" class="related-strip">
            <div class="related-heading">
              <span class="related-label">{{ t('tagSpace.relatedTags') }}</span>
              <small>{{ t('tagSpace.relatedTagsHint') }}</small>
            </div>
            <div class="related-tags no-scrollbar">
              <BButton
                v-for="related in relatedTags"
                :key="related.id"
                size="small"
                class="related-tag"
                @click="openRelatedTag(related.id)"
              >
                <span>#</span>
                <span>{{ related.name }}</span>
                <small>{{ t('tagSpace.sharedResources', { count: related.sharedCount || 0 }) }}</small>
              </BButton>
            </div>
          </div>
        </BCard>

        <div class="view-switch" role="tablist" :aria-label="t('tagSpace.viewMode')">
          <BButton
            size="small"
            role="tab"
            class="view-button"
            :class="{ 'is-active': viewMode === 'resources' }"
            :aria-selected="viewMode === 'resources'"
            @click="setViewMode('resources')"
          >
            {{ t('tagSpace.resourceView') }}
          </BButton>
          <BButton
            size="small"
            role="tab"
            class="view-button"
            :class="{ 'is-active': viewMode === 'graph' }"
            :aria-selected="viewMode === 'graph'"
            @click="setViewMode('graph')"
          >
            {{ t('tagSpace.graphView') }}
          </BButton>
        </div>

        <BCard
          v-if="viewMode === 'resources'"
          as="section"
          variant="panel"
          padding="14px 16px 16px"
          class="resources-panel"
        >
          <div class="resource-toolbar">
            <div class="resource-tabs no-scrollbar" :aria-label="t('tagSpace.resourceFilters')">
              <BButton
                v-for="typeOption in typeOptions"
                :key="typeOption.value"
                size="small"
                class="resource-tab"
                :class="[`resource-tab--${typeOption.value}`, { 'is-active': activeType === typeOption.value }]"
                :aria-pressed="activeType === typeOption.value"
                @click="activeType = typeOption.value"
              >
                <span class="resource-tab-dot"></span>
                <span>{{ typeOption.label }}</span>
                <strong>{{ typeOption.count }}</strong>
              </BButton>
            </div>
            <BInput
              v-if="!bookmark.isMobile"
              v-model:value="resourceKeyword"
              clearable
              height="38px"
              class="resource-search"
              :placeholder="t('tagSpace.searchInSpace')"
            >
              <template #prefix><SvgIcon :src="icon.navigation.search" size="17" /></template>
            </BInput>
            <BSelect v-model:value="resourceSort" class="resource-sort" :options="resourceSortOptions" />
          </div>

          <BCard
            v-if="resourceError && resourceItems.length"
            variant="raised"
            padding="10px 12px"
            class="inline-error"
            role="alert"
          >
            <span>{{ t('tagSpace.staleResourceError') }}</span>
            <BButton size="small" @click="loadResources(true)">{{ t('common.retry') }}</BButton>
          </BCard>

          <div v-if="resourceLoading" class="resource-list" aria-busy="true">
            <BCard v-for="index in 6" :key="index" class="resource-skeleton">
              <span class="skeleton-line skeleton-line--title"></span>
              <span class="skeleton-line"></span>
            </BCard>
          </div>

          <BCard
            v-else-if="resourceError && !resourceItems.length"
            variant="raised"
            class="resource-state"
            role="alert"
          >
            <span class="state-symbol">!</span>
            <strong>{{ t('tagSpace.resourcesLoadFailed') }}</strong>
            <BButton type="primary" @click="loadResources(true)">{{ t('common.retry') }}</BButton>
          </BCard>

          <BCard v-else-if="!resourceItems.length" variant="raised" class="resource-state">
            <span class="state-symbol">#</span>
            <strong>{{ resourceKeyword.trim() ? t('tagSpace.noResourceMatch') : t('tagSpace.noResources') }}</strong>
            <p>{{ resourceKeyword.trim() ? t('tagSpace.noResourceMatchHint') : t('tagSpace.noResourcesHint') }}</p>
            <BButton v-if="resourceKeyword.trim()" @click="resourceKeyword = ''">{{
              t('tagSpace.clearSearch')
            }}</BButton>
            <BButton v-else @click="router.push('/search')">{{ t('tagSpace.organizeResources') }}</BButton>
          </BCard>

          <div v-else class="resource-list">
            <BCard
              v-for="item in resourceItems"
              :key="`${item.type}:${item.id}`"
              as="article"
              variant="card"
              interactive
              padding="0"
              class="resource-row"
              role="button"
              tabindex="0"
              :aria-label="
                t('tagSpace.openResourceAria', {
                  type: resourceTypeLabel(item.type),
                  title: item.title || t('tagSpace.untitledResource'),
                })
              "
              @click="openResource(item)"
              @keydown.enter="openResource(item)"
              @keydown.space.prevent="openResource(item)"
            >
              <span class="resource-icon" :class="`resource-icon--${item.type}`">
                <BookmarkFavicon
                  v-if="item.type === 'bookmark'"
                  :bookmark-id="item.id"
                  :src="item.iconUrl"
                  :size="18"
                  :tile-size="32"
                />
                <SvgIcon v-else :src="resourceIcon(item.type)" size="18" />
              </span>
              <div class="resource-copy">
                <strong>{{ item.title || t('tagSpace.untitledResource') }}</strong>
                <span>{{ item.description || resourceTypeLabel(item.type) }}</span>
                <div v-if="visibleOtherTags(item).length" class="resource-tags">
                  <span v-for="resourceTag in visibleOtherTags(item)" :key="resourceTag.id">
                    #{{ resourceTag.name }}
                  </span>
                </div>
              </div>
              <div class="resource-meta">
                <span>{{ resourceTypeLabel(item.type) }}</span>
                <small>{{ resourceTimeLabel(item) }}</small>
                <small v-if="item.folderName">{{ item.folderName }}</small>
              </div>
              <span class="resource-open" aria-hidden="true">→</span>
            </BCard>
          </div>

          <div v-if="resourceItems.length && resourceHasMore" class="load-more-row">
            <BButton :loading="resourceLoadingMore" @click="loadResources(false)">{{ t('tagSpace.loadMore') }}</BButton>
          </div>
        </BCard>

        <BCard v-else as="section" variant="panel" padding="0" class="graph-panel">
          <div v-if="graphError" class="graph-error" role="alert">
            <span>{{ t('tagSpace.graphLoadFailed') }}</span>
            <BButton size="small" @click="loadGraph">{{ t('common.retry') }}</BButton>
          </div>
          <div class="graph-layout">
            <TagGraphCanvas
              ref="graphCanvasRef"
              :nodes="graphData?.nodes || []"
              :edges="graphData?.edges || []"
              :loading="graphLoading"
              :compact="false"
              :full-height="true"
              :active-node-id="activeGraphNode?.id"
              @node-click="activeGraphNode = $event"
              @node-dblclick="openGraphNode"
              @canvas-click="activeGraphNode = null"
            >
              <template #actions>
                <BButton size="small" type="primary" @click="graphCanvasRef?.resetView()">
                  {{ t('tagGraph.reset') }}
                </BButton>
              </template>
            </TagGraphCanvas>
            <TagGraphPanel
              :node="activeGraphNode"
              :connected-resources="graphConnectedResources"
              @explore-tag="exploreGraphTag"
              @open-resource="openGraphNode"
            />
          </div>
        </BCard>
      </template>
    </div>

    <FilePreview
      v-model:visible="filePreviewVisible"
      :file-info="previewFileInfo"
      @close="filePreviewVisible = false"
    />
    <AiSkillDialog
      v-model:visible="tagAiVisible"
      :title="t('tagManage.aiSkillTitle')"
      :description="t('tagManage.aiSkillDescription')"
      skill-id="search.summarize_selected"
      prompt-key="instruction"
      surface="tag_detail"
      :resource-refs="tagAiResourceRefs"
      :scope-label="t('tagManage.aiSkillScope', { count: tagAiResourceRefs.length })"
      :actions="tagAiActions"
      :placeholder="t('tagManage.aiSkillPlaceholder')"
      :auto-run-action-id="tagAiResourceRefs.length ? 'summarize' : ''"
    />
  </ResourcePageShell>
</template>

<script setup lang="ts">
  import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { apiBasePost } from '@/http/request.ts';
  import {
    fetchTagSpace,
    fetchTagSpaceResources,
    type RelatedTagSummary,
    type TagSpaceResourceFilter,
    type TagSpaceResourceItem,
    type TagSpaceResourceSort,
    type TagSpaceSummary,
  } from '@/api/tagSpace';
  import { fetchTagGraph, type TagGraphNode, type TagGraphResponse } from '@/api/tagGraph';
  import { openBookmarkUrl } from '@/utils/openBookmark';
  import icon from '@/config/icon';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BookmarkFavicon from '@/components/base/BookmarkFavicon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import TagGraphPanel from '@/components/tagGraph/TagGraphPanel.vue';
  import AiSkillDialog from '@/components/aiSkills/AiSkillDialog.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import type { AiSkillResourceRef } from '@lightnote/shared/ai-skill-protocol';
  import type { BaseOptions } from '@/config/bookmarkCfg.ts';
  import { bookmarkStore, useUserStore } from '@/store';

  const FilePreview = defineAsyncComponent(() => import('@/components/FilePreview.vue'));
  const TagGraphCanvas = defineAsyncComponent(() => import('@/components/tagGraph/TagGraphCanvas.vue'));
  const route = useRoute();
  const router = useRouter();
  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();

  const tag = ref<TagSpaceSummary | null>(null);
  const relatedTags = ref<RelatedTagSummary[]>([]);
  const tagIconLoadError = ref(false);
  const detailLoading = ref(true);
  const detailError = ref(false);
  const viewMode = ref<'resources' | 'graph'>('resources');
  const activeType = ref<TagSpaceResourceFilter>('all');
  const resourceSort = ref<TagSpaceResourceSort>('updated');
  const resourceKeyword = ref('');
  const resourceItems = ref<TagSpaceResourceItem[]>([]);
  const resourcePage = ref(1);
  const resourceHasMore = ref(false);
  const resourceLoading = ref(false);
  const resourceLoadingMore = ref(false);
  const resourceError = ref(false);
  const filePreviewVisible = ref(false);
  const previewFileInfo = ref<any>({});
  const tagAiVisible = ref(false);
  const aiLoading = ref(false);
  const aiResourceItems = ref<TagSpaceResourceItem[]>([]);
  const graphLoading = ref(false);
  const graphError = ref(false);
  const graphData = ref<TagGraphResponse | null>(null);
  const activeGraphNode = ref<TagGraphNode | null>(null);
  const graphCanvasRef = ref<InstanceType<typeof TagGraphCanvas> | null>(null);
  let detailSequence = 0;
  let resourceSequence = 0;
  let graphSequence = 0;
  let resourceDebounce: ReturnType<typeof setTimeout> | null = null;

  const detailSubtitle = computed(() =>
    tag.value ? t('tagSpace.detailSubtitle', { count: tag.value.counts.total }) : t('tagSpace.detailLoading'),
  );
  const overviewMetrics = computed(() => [
    { key: 'bookmark' as const, label: t('tagSpace.bookmark'), value: tag.value?.counts.bookmark || 0 },
    { key: 'note' as const, label: t('tagSpace.note'), value: tag.value?.counts.note || 0 },
    { key: 'file' as const, label: t('tagSpace.file'), value: tag.value?.counts.file || 0 },
  ]);
  const typeOptions = computed(() => [
    { value: 'all' as const, label: t('tagSpace.filterAllResources'), count: tag.value?.counts.total || 0 },
    ...overviewMetrics.value.map((metric) => ({
      value: metric.key,
      label: metric.label,
      count: metric.value,
    })),
  ]);
  const resourceSortOptions = computed<BaseOptions[]>(() => [
    { value: 'updated', label: t('tagSpace.sortByUpdated') },
    { value: 'added', label: t('tagSpace.sortByAdded') },
  ]);
  const isReadOnly = computed(() => user.adminContext?.mode === 'readonly');
  const tagAiResourceRefs = computed<AiSkillResourceRef[]>(() =>
    aiResourceItems.value.slice(0, 20).map((item) => ({
      type: item.type,
      id: String(item.id),
    })),
  );
  const tagAiActions = computed(() => [
    {
      id: 'summarize',
      label: t('tagManage.aiSummarize'),
      skillId: 'search.summarize_selected',
      input: { instruction: t('tagManage.aiSummarizeInstruction', { tag: String(tag.value?.name || '') }) },
    },
  ]);
  const graphConnectedResources = computed(() => {
    if (!activeGraphNode.value || !graphData.value) return [];
    const linkedIds = new Set<string>();
    graphData.value.edges.forEach((edge) => {
      if (edge.source === activeGraphNode.value?.id) linkedIds.add(edge.target);
      if (edge.target === activeGraphNode.value?.id) linkedIds.add(edge.source);
    });
    return graphData.value.nodes.filter((node) => linkedIds.has(node.id) && node.type !== 'tag');
  });

  function currentTagId() {
    return String(route.params.id || '').trim();
  }

  function resourceIcon(type: string) {
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    return icon.resource.bookmark;
  }

  function resourceTypeLabel(type: string) {
    if (type === 'note') return t('tagSpace.note');
    if (type === 'file') return t('tagSpace.file');
    return t('tagSpace.bookmark');
  }

  function visibleOtherTags(item: TagSpaceResourceItem) {
    return (item.tags || []).filter((itemTag) => String(itemTag.id) !== currentTagId()).slice(0, 3);
  }

  async function loadDetail() {
    const tagId = currentTagId();
    if (!tagId) return;
    const sequence = ++detailSequence;
    detailLoading.value = true;
    detailError.value = false;
    tag.value = null;
    relatedTags.value = [];
    tagIconLoadError.value = false;
    graphData.value = null;
    activeGraphNode.value = null;
    viewMode.value = 'resources';
    activeType.value = 'all';
    resourceSort.value = 'updated';
    resourceKeyword.value = '';
    aiResourceItems.value = [];
    tagAiVisible.value = false;
    filePreviewVisible.value = false;
    void loadResources(true);
    try {
      const detail = await fetchTagSpace(tagId);
      if (sequence !== detailSequence) return;
      tag.value = detail.tag;
      relatedTags.value = detail.relatedTags || [];
    } catch (error) {
      if (sequence !== detailSequence) return;
      detailError.value = true;
      console.warn('[tag-space] failed to load detail', error);
    } finally {
      if (sequence === detailSequence) detailLoading.value = false;
    }
  }

  async function loadResources(reset: boolean) {
    const tagId = currentTagId();
    if (!tagId || (!reset && (!resourceHasMore.value || resourceLoadingMore.value))) return;
    const sequence = reset ? ++resourceSequence : resourceSequence;
    if (reset) {
      resourceLoading.value = true;
      resourceError.value = false;
      resourceItems.value = [];
      resourcePage.value = 1;
    } else {
      resourceLoadingMore.value = true;
      resourceError.value = false;
    }
    try {
      const result = await fetchTagSpaceResources({
        id: tagId,
        keyword: resourceKeyword.value.trim(),
        type: activeType.value,
        sort: resourceSort.value,
        page: reset ? 1 : resourcePage.value + 1,
        pageSize: 20,
      });
      if (sequence !== resourceSequence) return;
      if (reset) resourceItems.value = result.items;
      else {
        const merged = new Map(resourceItems.value.map((item) => [`${item.type}:${item.id}`, item]));
        result.items.forEach((item) => merged.set(`${item.type}:${item.id}`, item));
        resourceItems.value = [...merged.values()];
      }
      resourcePage.value = result.page;
      resourceHasMore.value = result.hasMore;
    } catch (error) {
      if (sequence === resourceSequence) resourceError.value = true;
      console.warn('[tag-space] failed to load resources', error);
    } finally {
      if (sequence === resourceSequence) {
        resourceLoading.value = false;
        resourceLoadingMore.value = false;
      }
    }
  }

  async function openTagInAi() {
    if (!tag.value?.counts.total) {
      message.info(t('tagManage.aiNoResources'));
      return;
    }
    aiLoading.value = true;
    try {
      const result = await fetchTagSpaceResources({
        id: currentTagId(),
        type: 'all',
        sort: 'updated',
        page: 1,
        pageSize: 20,
      });
      aiResourceItems.value = result.items;
      if (!aiResourceItems.value.length) {
        message.info(t('tagManage.aiNoResources'));
        return;
      }
      if (tag.value.counts.total > 20) message.info(t('ai.materialLimit', { count: 20 }));
      tagAiVisible.value = true;
    } catch {
      message.error(t('tagSpace.aiLoadFailed'));
    } finally {
      aiLoading.value = false;
    }
  }

  async function loadGraph() {
    const tagId = currentTagId();
    if (!tagId) return;
    const sequence = ++graphSequence;
    graphLoading.value = true;
    graphError.value = false;
    try {
      const response = await fetchTagGraph({
        tagId,
        includeResources: true,
        resourceTypes: ['bookmark', 'note', 'file'],
        limitRelatedTags: 12,
        limitPerResourceType: 40,
      });
      if (sequence !== graphSequence) return;
      if (response.status !== 200) throw new Error(response.msg || 'TAG_GRAPH_FAILED');
      graphData.value = response.data;
      activeGraphNode.value = response.data.nodes.find((node) => node.meta?.isCenter) || response.data.nodes[0] || null;
    } catch (error) {
      if (sequence === graphSequence) graphError.value = true;
      console.warn('[tag-space] failed to load graph', error);
    } finally {
      if (sequence === graphSequence) graphLoading.value = false;
    }
  }

  function setViewMode(mode: 'resources' | 'graph') {
    viewMode.value = mode;
    if (mode === 'graph' && !graphData.value && !graphLoading.value) loadGraph();
  }

  function editTag() {
    if (!isReadOnly.value && tag.value?.id) router.push(`/manage/editTag/${tag.value.id}`);
  }

  function openRelatedTag(id: string) {
    router.push(`/tag/${id}`);
  }

  async function openResource(item: TagSpaceResourceItem) {
    if (item.type === 'bookmark' && item.url) {
      openBookmarkUrl(item.url);
      return;
    }
    if (item.type === 'note') {
      router.push(`/noteLibrary/${item.id}`);
      return;
    }
    if (item.type === 'file') {
      await openFile(item.id);
    }
  }

  function resourceTimeLabel(item: TagSpaceResourceItem) {
    const raw = resourceSort.value === 'added' ? item.addedTime : item.updateTime;
    if (!raw) return resourceSort.value === 'added' ? t('tagSpace.addedUnknown') : t('tagSpace.updatedUnknown');
    const date = new Date(String(raw).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(raw);
    return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }

  async function openFile(fileId: string | number) {
    try {
      const response = await apiBasePost('/api/file/getFileInfo', { id: fileId }, { silent: true });
      if (response.status !== 200 || !response.data) throw new Error(response.msg || 'FILE_INFO_FAILED');
      previewFile(response.data);
    } catch {
      message.error(t('tagSpace.fileOpenFailed'));
    }
  }

  async function openGraphNode(node: TagGraphNode) {
    if (node.type === 'tag') {
      exploreGraphTag(node);
      return;
    }
    if (node.type === 'bookmark' && node.meta?.url) {
      openBookmarkUrl(node.meta.url);
      return;
    }
    if (node.type === 'note') {
      router.push(`/noteLibrary/${node.rawId}`);
      return;
    }
    if (node.type === 'file') {
      await openFile(node.rawId);
    }
  }

  function exploreGraphTag(node: TagGraphNode) {
    if (node.type !== 'tag') return;
    if (String(node.rawId) === currentTagId()) {
      graphCanvasRef.value?.resetView();
      return;
    }
    router.push(`/tag/${node.rawId}`);
  }

  function previewFile(file: any) {
    previewFileInfo.value = {
      ...file,
      id: file.id,
      fileName: file.fileName || file.file_name,
      fileType: file.fileType || file.file_type,
      fileSize: file.fileSize ?? file.file_size,
      uploadTime: file.uploadTime || file.create_time,
    };
    filePreviewVisible.value = true;
  }

  watch([activeType, resourceSort, resourceKeyword], () => {
    if (!tag.value) return;
    if (resourceDebounce) clearTimeout(resourceDebounce);
    resourceDebounce = setTimeout(() => loadResources(true), resourceKeyword.value.trim() ? 260 : 0);
  });
  watch(
    () => route.params.id,
    () => loadDetail(),
  );

  onMounted(loadDetail);
  onBeforeUnmount(() => {
    detailSequence += 1;
    resourceSequence += 1;
    graphSequence += 1;
    if (resourceDebounce) clearTimeout(resourceDebounce);
  });
</script>

<style scoped lang="less">
  .tag-space-detail {
    height: 100%;
    min-height: 0;
    padding-bottom: 6px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: auto;
    scrollbar-gutter: stable;
  }
  .tag-space-detail.is-graph {
    overflow: hidden;
  }
  .detail-tag-icon {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-tag-color, #ec4899);
    border-radius: 9px;
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color);
    overflow: hidden;
  }
  .detail-tag-icon img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  :deep(.resource-page-actions .b_btn) {
    gap: 6px;
  }
  .detail-loading {
    display: grid;
    gap: 12px;
  }
  .detail-hero-skeleton {
    min-height: 156px;
  }
  .detail-state,
  .resource-state {
    min-height: 300px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    text-align: center;
  }
  .detail-state p,
  .resource-state p,
  .overview-copy p {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.55;
  }
  .state-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .state-symbol {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-tag-color, #ec4899);
    border-radius: 12px;
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color);
    font-size: 21px;
    font-weight: 750;
  }
  .detail-overview {
    display: grid;
    grid-template-columns: minmax(210px, 1.1fr) minmax(360px, 1.4fr);
    align-items: center;
    gap: 18px 28px;
    flex: 0 0 auto;
  }
  .overview-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .overview-kicker {
    color: var(--resource-tag-color, #ec4899);
    font-size: 12px;
    font-weight: 650;
  }
  .overview-copy > strong {
    font-size: 20px;
  }
  .overview-counts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  .overview-count {
    min-width: 0;
    padding: 9px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }
  .overview-count > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .overview-count strong {
    font-size: 16px;
    line-height: 1.25;
  }
  .overview-count span:last-child {
    color: var(--desc-color);
    font-size: 11px;
  }
  .resource-icon {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid currentColor;
    border-radius: 9px;
    color: var(--resource-bookmark-color, #615ced);
    background: var(--workspace-panel-bg-color);
  }
  .resource-icon--note {
    color: var(--resource-note-color, #00a884);
  }
  .resource-icon--file {
    color: var(--resource-file-color, #ff8a00);
  }
  .related-strip {
    grid-column: 1 / -1;
    min-width: 0;
    padding-top: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
    border-top: 1px solid var(--surface-divider-color);
  }
  .related-label {
    color: var(--desc-color);
    font-size: 12px;
  }
  .related-heading {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .related-heading small {
    max-width: 210px;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.35;
  }
  .related-tags {
    min-width: 0;
    display: flex;
    gap: 7px;
    overflow-x: auto;
  }
  .related-tag {
    flex: 0 0 auto;
    gap: 6px;
    border: 1px solid var(--surface-border-color);
  }
  .related-tag > span:first-child {
    color: var(--resource-tag-color, #ec4899);
    font-weight: 750;
  }
  .related-tag small {
    color: var(--desc-color);
    font-size: 10px;
  }
  .view-switch {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 0 0 auto;
  }
  .view-button {
    border: 1px solid transparent;
  }
  .view-button.is-active {
    border-color: var(--resource-tag-color, #ec4899);
    color: var(--resource-tag-color, #ec4899);
    background: var(--workspace-panel-bg-color) !important;
  }
  .resources-panel {
    min-height: 0;
    flex: 1 0 auto;
  }
  .resource-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  .resource-tabs {
    min-width: 0;
    display: flex;
    gap: 6px;
    overflow-x: auto;
  }
  .resource-tab {
    flex: 0 0 auto;
    gap: 6px;
    border: 1px solid transparent;
    border-radius: 999px;
  }
  .resource-tab.is-active {
    border-color: currentColor;
    background: var(--workspace-panel-bg-color) !important;
  }
  .resource-tab--all {
    color: var(--resource-tag-color, #ec4899);
  }
  .resource-tab--bookmark {
    color: var(--resource-bookmark-color, #615ced);
  }
  .resource-tab--note {
    color: var(--resource-note-color, #00a884);
  }
  .resource-tab--file {
    color: var(--resource-file-color, #ff8a00);
  }
  .resource-tab-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: currentColor;
  }
  .resource-search {
    width: min(330px, 32vw);
    flex: 0 0 auto;
  }
  .resource-sort {
    width: 142px;
    flex: 0 0 auto;
  }
  .inline-error,
  .graph-error {
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--danger-color, #fe2c55);
    border-radius: 9px;
    color: var(--danger-color, #fe2c55);
    background: var(--workspace-panel-bg-color);
  }
  .inline-error {
    margin-bottom: 10px;
  }
  .resource-list {
    display: grid;
    gap: 8px;
  }
  .resource-row {
    min-height: 74px;
    padding: 11px 13px !important;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 11px;
    cursor: pointer;
  }
  .resource-row:hover,
  .resource-row:focus-visible {
    border-color: var(--resource-tag-color, #ec4899);
  }
  .resource-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .resource-copy > strong,
  .resource-copy > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .resource-copy > strong {
    font-size: 14px;
  }
  .resource-copy > span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .resource-tags {
    display: flex;
    gap: 5px;
    overflow: hidden;
  }
  .resource-tags span {
    color: var(--resource-tag-color, #ec4899);
    font-size: 10px;
    white-space: nowrap;
  }
  .resource-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    color: var(--desc-color);
    font-size: 11px;
  }
  .resource-meta small {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .resource-open {
    color: var(--desc-color);
    font-size: 16px;
  }
  .load-more-row {
    display: flex;
    justify-content: center;
    padding: 16px 0 2px;
  }
  .graph-panel {
    min-height: 0;
    flex: 1;
    overflow: hidden;
  }
  .graph-error {
    margin: 12px;
  }
  .graph-layout {
    height: 100%;
    min-height: 520px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
  }
  .skeleton-line {
    height: 12px;
    margin: 10px 0;
    display: block;
    border-radius: 999px;
    background: var(--skeleton-bg-color, var(--surface-divider-color));
    animation: tag-space-detail-pulse 1.15s ease-in-out infinite alternate;
  }
  .skeleton-line--title {
    width: 58%;
    height: 16px;
  }
  .skeleton-line--short {
    width: 38%;
  }
  .resource-skeleton {
    min-height: 76px;
  }
  @keyframes tag-space-detail-pulse {
    to {
      opacity: 0.42;
    }
  }
  @media (max-width: 900px) {
    .detail-overview {
      grid-template-columns: 1fr;
    }
    .related-strip {
      grid-column: 1;
    }
    .graph-layout {
      grid-template-columns: 1fr;
    }
    .graph-layout :deep(.tag-graph-panel) {
      display: none;
    }
  }
  @media (max-width: 767px) {
    .tag-space-detail {
      gap: 9px;
      overflow-x: hidden;
      scrollbar-gutter: auto;
    }
    .detail-overview {
      padding: 14px !important;
      gap: 13px;
    }
    .overview-copy > strong {
      font-size: 18px;
    }
    .overview-counts {
      gap: 5px;
    }
    .overview-count {
      padding: 7px;
      gap: 6px;
    }
    .overview-count .resource-icon {
      width: 29px;
      height: 29px;
    }
    .related-strip {
      align-items: flex-start;
      flex-direction: column;
      gap: 6px;
    }
    .related-tags {
      width: 100%;
    }
    .view-switch {
      padding-inline: 2px;
    }
    .resources-panel {
      padding: 12px 0 16px !important;
      border-inline: 0;
    }
    .resource-toolbar {
      align-items: stretch;
      flex-direction: column;
      gap: 9px;
    }
    .resource-tabs {
      padding-inline: 12px;
    }
    .resource-search {
      width: auto;
      margin-inline: 12px;
    }
    .resource-sort {
      width: auto;
      margin-inline: 12px;
    }
    .inline-error {
      margin: 0 12px 9px;
    }
    .resource-list {
      padding-inline: 9px;
    }
    .resource-row {
      grid-template-columns: auto minmax(0, 1fr) auto;
      min-height: 68px;
      padding: 10px 11px !important;
    }
    .resource-meta {
      display: none;
    }
    .resource-copy > span {
      max-width: 100%;
    }
    .resource-state {
      min-height: 260px;
      margin-inline: 9px;
    }
    .graph-layout {
      min-height: 460px;
    }
  }
  html.light-note-mobile-rendering .view-button.is-active,
  html.light-note-mobile-rendering .resource-tab.is-active,
  html.light-note-mobile-rendering .resource-row:focus-visible {
    border-color: currentColor;
    box-shadow: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .skeleton-line {
      animation: none;
    }
    .resource-row {
      transition: none;
    }
  }
</style>
