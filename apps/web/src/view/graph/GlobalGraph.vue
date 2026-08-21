<template>
  <div class="knowledge-map-page" :class="{ 'knowledge-map-page--mobile': bookmark.isMobile }">
    <header v-if="bookmark.isMobile" class="km-header">
      <div class="km-mobile-overview" :aria-label="t('knowledgeMap.overview')">
        {{ t('knowledgeMap.mobileOverview', { topics: stats.tagCount, resources: stats.taggedResourceCount }) }}
      </div>
    </header>

    <section class="km-toolbar">
      <div class="km-search">
        <BInput
          id="knowledge-map-mobile-search"
          v-model:value="keyword"
          :placeholder="t('knowledgeMap.searchPlaceholder')"
          :height="bookmark.isMobile ? '44px' : '38px'"
          @enter="focusFirstSearchResult"
        >
          <template #prefix>
            <SvgIcon :src="icon.navigation.search" size="17" />
          </template>
        </BInput>
      </div>
      <template v-if="bookmark.isMobile">
        <BButton class="km-filter-trigger" @click="mobileFilterVisible = true">
          <SvgIcon :src="icon.cloudSpace.filter" size="16" />
          {{ t('common.filter') }}
        </BButton>
      </template>
      <template v-else>
        <BSelect v-model:value="minSharedCount" class="km-select km-select--strength" :options="strengthOptions" />
        <BButton class="km-toggle" :class="{ active: hideIsolated }" @click="hideIsolated = !hideIsolated">
          {{ t('knowledgeMap.hideIsolated') }}
        </BButton>
        <div class="km-stats" :aria-label="t('knowledgeMap.overview')">
          <div class="km-stat km-stat--tag">
            <strong>{{ stats.tagCount }}</strong>
            <span>{{ t('knowledgeMap.stats.tags') }}</span>
          </div>
          <div class="km-stat km-stat--tagged">
            <strong>{{ stats.taggedResourceCount }}</strong>
            <span>{{ t('knowledgeMap.stats.tagged') }}</span>
          </div>
          <div class="km-stat km-stat--untagged">
            <strong>{{ stats.untaggedResourceCount }}</strong>
            <span>{{ t('knowledgeMap.stats.untagged') }}</span>
          </div>
          <div class="km-stat km-stat--empty">
            <strong>{{ stats.emptyTagCount }}</strong>
            <span>{{ t('knowledgeMap.stats.emptyTags') }}</span>
          </div>
        </div>
        <span v-if="stats.truncated" class="km-warning">{{ t('knowledgeMap.truncated') }}</span>
        <BButton class="km-reset" @click="resetMap">{{ t('knowledgeMap.reset') }}</BButton>
      </template>
    </section>

    <section class="km-content">
      <div v-if="bookmark.isMobile" class="km-mobile-list">
        <MobileListSurface v-if="mobileNodes.length">
          <MobileListRow
            v-for="node in mobileNodes"
            :key="node.id"
            class="km-mobile-item"
            interactive
            :selected="activeNode?.id === node.id"
            @click="selectNode(node)"
          >
            <template #leading><span class="km-mobile-dot"></span></template>
            <template #title>{{ node.label }}</template>
            <template #subtitle>
              {{
                t('knowledgeMap.topicSummary', {
                  resources: node.meta?.resourceCount || 0,
                  topics: nodeRelationshipCount(node.id),
                })
              }}
            </template>
            <template #trailing><SvgIcon :src="icon.arrow_right" size="16" aria-hidden="true" /></template>
          </MobileListRow>
        </MobileListSurface>
        <div v-if="!mobileNodes.length" class="km-mobile-empty">{{ t('knowledgeMap.noMatch') }}</div>
      </div>

      <div v-else class="km-canvas-wrap">
        <GlobalGraphCanvas
          ref="canvasRef"
          :nodes="displayNodes"
          :edges="displayEdges"
          :loading="loading"
          :active-node-id="activeNode?.id"
          @node-click="selectNode"
          @node-dblclick="selectNode"
          @canvas-click="clearFocus"
        />
        <div class="km-canvas-note">
          <span class="km-canvas-dot"></span>
          {{ canvasSummary }}
        </div>
      </div>

      <aside v-if="!bookmark.isMobile" class="km-panel">
        <template v-if="activeNode">
          <div class="km-panel-head">
            <div class="km-panel-kicker"> <span class="km-panel-dot"></span>{{ t('knowledgeMap.focusedTopic') }} </div>
            <h2>{{ activeNode.label }}</h2>
            <p>{{ t('knowledgeMap.resourceCount', { count: activeNode.meta?.resourceCount || 0 }) }}</p>
          </div>

          <div class="km-panel-actions">
            <BButton type="primary" @click="viewTagResources">{{ t('knowledgeMap.viewResources') }}</BButton>
            <BButton @click="openTagDetail">{{ t('knowledgeMap.openTag') }}</BButton>
          </div>

          <section class="km-panel-section">
            <div class="km-section-title">
              <span>{{ t('knowledgeMap.relatedTopics') }}</span>
              <small>{{ focusRelatedTags.length }}</small>
            </div>
            <div v-if="focusRelatedTags.length" class="km-related-list">
              <BButton
                v-for="item in focusRelatedTags"
                :key="item.node.id"
                class="km-related-item"
                @click="selectNode(item.node)"
              >
                <span>{{ item.node.label }}</span>
                <small>{{ t('knowledgeMap.sharedCount', { count: item.sharedCount }) }}</small>
              </BButton>
            </div>
            <div v-else-if="!focusLoading" class="km-section-empty">{{ t('knowledgeMap.noRelatedTopics') }}</div>
          </section>

          <section class="km-panel-section km-resource-section">
            <div class="km-section-title">
              <span>{{ t('knowledgeMap.recentResources') }}</span>
              <small>{{ filteredFocusResources.length }}</small>
            </div>
            <div class="km-resource-tabs">
              <BButton
                v-for="item in resourceTypeOptions"
                :key="item.value"
                size="small"
                :class="{ active: resourceType === item.value }"
                @click="resourceType = item.value"
                >{{ item.label }}</BButton
              >
            </div>
            <div v-if="focusLoading" class="km-section-empty">{{ t('knowledgeMap.loadingResources') }}</div>
            <div v-else-if="filteredFocusResources.length" class="km-resource-list">
              <BButton
                v-for="resource in filteredFocusResources"
                :key="resource.id"
                class="km-resource-item"
                @click="openResource(resource)"
              >
                <span class="km-resource-type" :class="`km-resource-type--${resource.type}`"></span>
                <span class="km-resource-name">{{ resource.label }}</span>
                <span class="km-resource-arrow">→</span>
              </BButton>
            </div>
            <div v-else class="km-section-empty">{{ t('knowledgeMap.noResources') }}</div>
          </section>
        </template>

        <template v-else>
          <div class="km-panel-head">
            <div class="km-panel-kicker"
              ><span class="km-panel-dot"></span>{{ t('knowledgeMap.organizeInsights') }}</div
            >
            <h2>{{ t('knowledgeMap.panelTitle') }}</h2>
            <p>{{ t('knowledgeMap.panelHint') }}</p>
          </div>
          <div class="km-insights">
            <BButton class="km-insight" @click="viewUntaggedResources">
              <span>{{ t('knowledgeMap.insights.untagged') }}</span>
              <strong>{{ stats.untaggedResourceCount }}</strong>
              <small>{{ t('knowledgeMap.insights.organizeNow') }} →</small>
            </BButton>
            <BButton class="km-insight" @click="openTagManager">
              <span>{{ t('knowledgeMap.insights.emptyTags') }}</span>
              <strong>{{ stats.emptyTagCount }}</strong>
              <small>{{ t('knowledgeMap.insights.manageTags') }} →</small>
            </BButton>
            <div class="km-insight km-insight--static">
              <span>{{ t('knowledgeMap.insights.isolatedTags') }}</span>
              <strong>{{ stats.isolatedTagCount }}</strong>
              <small>{{ t('knowledgeMap.insights.isolatedHint') }}</small>
            </div>
          </div>
        </template>
      </aside>
    </section>

    <BDrawer
      :open="mobileFilterVisible"
      :title="t('knowledgeMap.mobileFiltersTitle')"
      placement="bottom"
      height="min(48dvh, 390px)"
      body-padding="18px"
      @close="mobileFilterVisible = false"
    >
      <div class="km-mobile-filters">
        <label>{{ t('knowledgeMap.relationshipStrength') }}</label>
        <BSelect v-model:value="minSharedCount" :options="strengthOptions" />
        <BButton class="km-toggle" :class="{ active: hideIsolated }" @click="hideIsolated = !hideIsolated">
          {{ t('knowledgeMap.hideIsolated') }}
        </BButton>
        <div class="km-mobile-filter-actions">
          <BButton @click="resetMobileFilters">{{ t('knowledgeMap.reset') }}</BButton>
          <BButton type="primary" @click="mobileFilterVisible = false">{{ t('common.confirm') }}</BButton>
        </div>
      </div>
    </BDrawer>

    <BDrawer
      :open="mobileTopicDrawerOpen"
      :title="activeNode?.label || t('knowledgeMap.focusedTopic')"
      placement="bottom"
      height="min(78dvh, 720px)"
      body-padding="0"
      @close="mobileTopicDrawerOpen = false"
    >
      <div v-if="activeNode" class="km-mobile-topic-drawer">
        <div class="km-mobile-topic-summary">
          <span class="km-panel-dot"></span>
          <span>{{ t('knowledgeMap.resourceCount', { count: activeResourceCount }) }}</span>
          <span>{{ t('knowledgeMap.relatedTopicCount', { count: focusRelatedTags.length }) }}</span>
        </div>

        <div class="km-mobile-topic-tabs">
          <BTabs v-model:active-tab="resourceType" variant="pill" :options="mobileResourceTypeOptions" />
        </div>

        <div class="km-mobile-topic-body">
          <section class="km-mobile-topic-section">
            <div class="km-section-title">
              <span>{{ t('knowledgeMap.recentResources') }}</span>
              <small>{{ filteredFocusResources.length }}</small>
            </div>
            <BLoading v-if="focusLoading" :loading="true" inline :title="t('knowledgeMap.loadingResources')" />
            <div v-else-if="filteredFocusResources.length" class="km-resource-list">
              <BButton
                v-for="resource in filteredFocusResources"
                :key="resource.id"
                class="km-resource-item km-mobile-resource-item"
                @click="openResource(resource)"
              >
                <span class="km-resource-type" :class="`km-resource-type--${resource.type}`"></span>
                <span class="km-resource-main">
                  <strong>{{ resource.label }}</strong>
                  <small>{{ t(`knowledgeMap.resourceTypes.${resource.type}`) }}</small>
                </span>
                <span class="km-resource-arrow">→</span>
              </BButton>
            </div>
            <div v-else class="km-section-empty">{{ t('knowledgeMap.noResources') }}</div>
          </section>

          <section class="km-mobile-topic-section">
            <div class="km-section-title">
              <span>{{ t('knowledgeMap.relatedTopics') }}</span>
              <small>{{ focusRelatedTags.length }}</small>
            </div>
            <div v-if="focusRelatedTags.length" class="km-related-list">
              <BButton
                v-for="item in focusRelatedTags"
                :key="item.node.id"
                class="km-related-item km-mobile-related-item"
                @click="selectNode(item.node)"
              >
                <span>{{ item.node.label }}</span>
                <small>{{ t('knowledgeMap.sharedCount', { count: item.sharedCount }) }}</small>
              </BButton>
            </div>
            <div v-else-if="!focusLoading" class="km-section-empty">{{ t('knowledgeMap.noRelatedTopics') }}</div>
          </section>

          <div class="km-mobile-topic-actions">
            <BButton type="primary" @click="viewTagResources">{{ t('knowledgeMap.viewResources') }}</BButton>
            <BButton @click="openTagDetail">{{ t('knowledgeMap.openTag') }}</BButton>
          </div>
        </div>
      </div>
    </BDrawer>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import icon from '@/config/icon.ts';
  import { bookmarkStore } from '@/store';
  import { openBookmarkUrl } from '@/utils/openBookmark.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import {
    fetchGlobalGraph,
    fetchTagGraph,
    type GlobalGraphResponse,
    type GraphResourceType,
    type TagGraphEdge,
    type TagGraphNode,
  } from '@/api/tagGraph.ts';
  import GlobalGraphCanvas from './GlobalGraphCanvas.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';

  type ResourceFilter = GraphResourceType | 'all';
  type FocusRelatedTag = { node: TagGraphNode; sharedCount: number };
  type FocusStats = {
    relatedTagCount: number;
    bookmarkCount: number;
    noteCount: number;
    fileCount: number;
  };

  const emptyFocusStats = (): FocusStats => ({
    relatedTagCount: 0,
    bookmarkCount: 0,
    noteCount: 0,
    fileCount: 0,
  });

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const canvasRef = ref<InstanceType<typeof GlobalGraphCanvas> | null>(null);
  const nodes = ref<TagGraphNode[]>([]);
  const edges = ref<TagGraphEdge[]>([]);
  const stats = ref<GlobalGraphResponse['stats']>({
    tagCount: 0,
    shownTagCount: 0,
    resourceCount: 0,
    totalResourceCount: 0,
    taggedResourceCount: 0,
    untaggedResourceCount: 0,
    emptyTagCount: 0,
    isolatedTagCount: 0,
    edgeCount: 0,
    truncated: false,
  });
  const loading = ref(true);
  const keyword = ref('');
  const minSharedCount = ref(2);
  const hideIsolated = ref(true);
  const activeNode = ref<TagGraphNode | null>(null);
  const focusResources = ref<TagGraphNode[]>([]);
  const focusRelatedTags = ref<FocusRelatedTag[]>([]);
  const focusStats = ref<FocusStats>(emptyFocusStats());
  const focusLoading = ref(false);
  const resourceType = ref<ResourceFilter>('all');
  const mobileTopicDrawerOpen = ref(false);
  const mobileFilterVisible = ref(false);
  let focusRequestSequence = 0;

  const strengthOptions = computed(() => [
    { value: 1, label: t('knowledgeMap.strength.any') },
    { value: 2, label: t('knowledgeMap.strength.two') },
    { value: 3, label: t('knowledgeMap.strength.three') },
  ]);
  const resourceTypeOptions = computed<Array<{ value: ResourceFilter; label: string }>>(() => [
    { value: 'all', label: t('knowledgeMap.resourceTypes.all') },
    { value: 'bookmark', label: t('knowledgeMap.resourceTypes.bookmark') },
    { value: 'note', label: t('knowledgeMap.resourceTypes.note') },
    { value: 'file', label: t('knowledgeMap.resourceTypes.file') },
  ]);
  const mobileResourceTypeOptions = computed(() =>
    resourceTypeOptions.value.map((item) => ({
      key: item.value,
      label: item.label,
      badge: resourceTypeCount(item.value),
    })),
  );

  const rankedNodes = computed(() =>
    [...nodes.value].sort(
      (a, b) =>
        Number(b.meta?.resourceCount || 0) - Number(a.meta?.resourceCount || 0) || a.label.localeCompare(b.label),
    ),
  );
  const thresholdEdges = computed(() =>
    edges.value.filter(
      (edge) => Number(edge.sharedCount || Math.max(1, Number(edge.weight || 1) - 1)) >= minSharedCount.value,
    ),
  );
  const searchResults = computed(() => {
    const query = keyword.value.trim().toLocaleLowerCase();
    if (!query) return rankedNodes.value;
    return rankedNodes.value.filter((node) => node.label.toLocaleLowerCase().includes(query));
  });
  const overviewNodes = computed(() => {
    const hasSearch = Boolean(keyword.value.trim());
    let result = searchResults.value.slice(0, 80);
    if (hideIsolated.value && !hasSearch) {
      const connected = new Set(thresholdEdges.value.flatMap((edge) => [edge.source, edge.target]));
      result = result.filter((node) => connected.has(node.id));
    }
    return result;
  });
  // 选中主题时保持画布数据和布局不变，只更新高亮，避免节点与连线重复渲染产生闪烁。
  const displayNodes = computed(() => overviewNodes.value);
  const displayEdges = computed(() => {
    const ids = new Set(displayNodes.value.map((node) => node.id));
    return thresholdEdges.value.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  });
  const filteredFocusResources = computed(() =>
    focusResources.value
      .filter((node) => resourceType.value === 'all' || node.type === resourceType.value)
      .slice(0, resourceType.value === 'all' ? 18 : 50),
  );
  const activeResourceCount = computed(() => {
    const globalCount = Number(activeNode.value?.meta?.resourceCount ?? activeNode.value?.meta?.relatedCount);
    if (Number.isFinite(globalCount)) return globalCount;
    return focusStats.value.bookmarkCount + focusStats.value.noteCount + focusStats.value.fileCount;
  });
  const mobileNodes = computed(() => overviewNodes.value.slice(0, 100));
  const canvasSummary = computed(() => {
    if (activeNode.value) {
      return t('knowledgeMap.focusSummary', { name: activeNode.value.label, count: focusRelatedTags.value.length });
    }
    return t('knowledgeMap.canvasSummary', { shown: displayNodes.value.length, total: stats.value.tagCount });
  });

  function nodeRelationshipCount(nodeId: string) {
    return thresholdEdges.value.filter((edge) => edge.source === nodeId || edge.target === nodeId).length;
  }

  function resourceTypeCount(type: ResourceFilter) {
    if (type === 'all') return activeResourceCount.value;
    const countByType: Record<GraphResourceType, number> = {
      bookmark: focusStats.value.bookmarkCount,
      note: focusStats.value.noteCount,
      file: focusStats.value.fileCount,
    };
    const count = countByType[type];
    return count >= 50 ? '50+' : count;
  }

  function extractRelatedTags(node: TagGraphNode, graphNodes: TagGraphNode[], graphEdges: TagGraphEdge[]) {
    const relatedNodes = new Map(
      graphNodes.filter((item) => item.type === 'tag' && item.rawId !== node.rawId).map((item) => [item.id, item]),
    );
    return graphEdges
      .filter((edge) => edge.type === 'tag-tag' && (edge.source === node.id || edge.target === node.id))
      .map((edge) => ({
        node: relatedNodes.get(edge.source === node.id ? edge.target : edge.source),
        sharedCount: Number(edge.sharedCount || 0),
      }))
      .filter((item): item is FocusRelatedTag => Boolean(item.node))
      .sort((a, b) => b.sharedCount - a.sharedCount);
  }

  async function loadFocusResources(node: TagGraphNode) {
    const requestId = ++focusRequestSequence;
    focusLoading.value = true;
    focusResources.value = [];
    focusRelatedTags.value = [];
    focusStats.value = emptyFocusStats();
    try {
      const res = await fetchTagGraph({
        tagId: node.rawId,
        includeResources: true,
        resourceTypes: ['bookmark', 'note', 'file'],
        limitRelatedTags: 12,
        limitPerResourceType: 50,
      });
      if (requestId !== focusRequestSequence || activeNode.value?.id !== node.id) return;
      if (res.status === 200 && res.data) {
        focusResources.value = (res.data.nodes || []).filter((item) => item.type !== 'tag');
        focusRelatedTags.value = extractRelatedTags(node, res.data.nodes || [], res.data.edges || []);
        focusStats.value = { ...emptyFocusStats(), ...(res.data.stats || {}) };
      }
    } finally {
      if (requestId === focusRequestSequence) focusLoading.value = false;
    }
  }

  function selectNode(node: TagGraphNode) {
    if (!node || node.type !== 'tag') return;
    activeNode.value = node;
    resourceType.value = 'all';
    if (bookmark.isMobile) {
      mobileFilterVisible.value = false;
      mobileTopicDrawerOpen.value = true;
    }
    void loadFocusResources(node);
  }

  function clearFocus() {
    focusRequestSequence += 1;
    activeNode.value = null;
    focusResources.value = [];
    focusRelatedTags.value = [];
    focusStats.value = emptyFocusStats();
    focusLoading.value = false;
    resourceType.value = 'all';
    mobileTopicDrawerOpen.value = false;
  }

  function focusFirstSearchResult() {
    const first = searchResults.value[0];
    if (first) selectNode(first);
  }

  function resetMap() {
    keyword.value = '';
    minSharedCount.value = 2;
    hideIsolated.value = true;
    clearFocus();
    canvasRef.value?.resetView();
  }

  function resetMobileFilters() {
    minSharedCount.value = 2;
    hideIsolated.value = true;
  }

  async function viewTagResources() {
    if (!activeNode.value) return;
    const tag = activeNode.value.label;
    await closeCurrentMobileOverlayThen(
      () => {
        mobileTopicDrawerOpen.value = false;
      },
      () => router.push({ path: '/search', query: { tags: tag } }),
    );
  }

  async function openTagDetail() {
    if (!activeNode.value) return;
    const tagId = activeNode.value.rawId;
    await closeCurrentMobileOverlayThen(
      () => {
        mobileTopicDrawerOpen.value = false;
      },
      () => router.push(`/tag/${tagId}`),
    );
  }

  function viewUntaggedResources() {
    router.push({ path: '/search', query: { untagged: '1' } });
  }

  function openTagManager() {
    router.push('/manage/tagMg');
  }

  async function openResource(node: TagGraphNode) {
    if (node.type === 'bookmark' && node.meta?.url) {
      await closeCurrentMobileOverlayThen(
        () => {
          mobileTopicDrawerOpen.value = false;
        },
        () => openBookmarkUrl(node.meta.url),
      );
      return;
    }
    if (node.type === 'note') {
      await closeCurrentMobileOverlayThen(
        () => {
          mobileTopicDrawerOpen.value = false;
        },
        () => router.push(`/noteLibrary/${node.rawId}`),
      );
      return;
    }
    if (node.type === 'file') {
      await closeCurrentMobileOverlayThen(
        () => {
          mobileTopicDrawerOpen.value = false;
        },
        () => router.push({ path: '/cloudSpace', query: { fileName: node.label } }),
      );
    }
  }

  onMounted(async () => {
    try {
      const res = await fetchGlobalGraph({ minCoOccurrence: 1 });
      if (res.status === 200 && res.data) {
        nodes.value = (res.data.nodes || []).filter((node) => node.type === 'tag');
        edges.value = (res.data.edges || []).filter((edge) => edge.type === 'tag-tag');
        stats.value = { ...stats.value, ...(res.data.stats || {}) };
      }
    } finally {
      loading.value = false;
    }
  });
</script>

<style scoped lang="less">
  .knowledge-map-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    padding: 14px 20px 18px;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .km-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 24px;
    flex: 0 0 auto;
  }

  .km-warning {
    max-width: 120px;
    color: var(--resource-file-color);
    font-size: 11px;
    line-height: 1.25;
  }

  .km-stats {
    display: flex;
    gap: 8px;
    flex: 0 0 auto;
    margin-left: auto;
  }

  .km-mobile-overview {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 9px;
    color: var(--sub-text-color);
    font-size: 12px;

    color: var(--text-color);
    font-size: 15px;
    font-weight: 650;
  }

  .km-stat {
    display: flex;
    align-items: baseline;
    gap: 5px;
    min-width: 86px;
    padding: 7px 10px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    background: color-mix(in srgb, var(--card-background) 92%, transparent);

    strong {
      font-size: 17px;
      font-variant-numeric: tabular-nums;
    }

    span {
      color: var(--sub-text-color);
      font-size: 11px;
      white-space: nowrap;
    }
  }

  .km-stat--tag strong,
  .km-stat--empty strong {
    color: var(--resource-tag-color);
  }

  .km-stat--tagged strong {
    color: var(--resource-note-color);
  }

  .km-stat--untagged strong {
    color: var(--resource-file-color);
  }

  .km-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    flex: 0 0 auto;
  }

  .km-search {
    width: min(380px, 32vw);
  }

  .km-select {
    width: 136px;
  }

  .km-select--strength {
    width: 150px;
  }

  .km-toggle,
  .km-reset,
  .km-filter-trigger {
    height: 38px;
    line-height: 38px;
    padding: 0 13px;
  }

  .km-filter-trigger {
    gap: 6px;
  }

  .km-toggle.active {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, var(--background-color));
  }

  .km-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 12px;
    flex: 1;
    min-height: 0;
    margin-top: 10px;
  }

  .km-canvas-wrap {
    position: relative;
    min-width: 0;
    min-height: 0;
  }

  .km-canvas-note {
    position: absolute;
    left: 14px;
    bottom: 14px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 9px;
    border: 1px solid var(--card-border-color);
    border-radius: 9px;
    background: color-mix(in srgb, var(--background-color) 86%, transparent);
    color: var(--sub-text-color);
    font-size: 11px;
    pointer-events: none;
  }

  .km-canvas-dot,
  .km-panel-dot,
  .km-mobile-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--resource-tag-color);
  }

  .km-panel {
    min-width: 0;
    overflow: auto;
    padding: 15px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--card-background);
    box-sizing: border-box;
  }

  .km-panel-head {
    h2 {
      margin: 5px 0 2px;
      font-size: 18px;
      line-height: 1.35;
      word-break: break-word;
    }

    p {
      margin: 0;
      color: var(--sub-text-color);
      font-size: 12px;
      line-height: 1.5;
    }
  }

  .km-panel-kicker {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--resource-tag-color);
    font-size: 11px;
    font-weight: 700;
  }

  .km-panel-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 12px;

    :deep(.b_btn) {
      width: 100%;
      padding: 0 8px;
    }
  }

  .km-panel-section {
    margin-top: 16px;
    padding-top: 13px;
    border-top: 1px solid var(--card-border-color);
  }

  .km-section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 13px;
    font-weight: 700;

    small {
      color: var(--sub-text-color);
      font-weight: 500;
    }
  }

  .km-related-list,
  .km-resource-list,
  .km-insights {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .km-related-item,
  .km-resource-item {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 34px;
    padding: 7px 9px;
    justify-content: space-between;
    line-height: 1.35;
    text-align: left;

    small {
      color: var(--sub-text-color);
      font-size: 10px;
    }
  }

  .km-resource-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 8px;

    :deep(.b_btn) {
      padding: 0 7px;
    }

    .active {
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 12%, var(--background-color));
    }
  }

  .km-resource-item {
    justify-content: flex-start;
  }

  .km-resource-type {
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    border-radius: 50%;
    margin-right: 10px;
  }

  .km-resource-type--bookmark {
    background: var(--resource-bookmark-color);
  }

  .km-resource-type--note {
    background: var(--resource-note-color);
  }

  .km-resource-type--file {
    background: var(--resource-file-color);
  }

  .km-resource-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .km-resource-arrow {
    margin-left: auto;
    color: var(--sub-text-color);
  }

  .km-section-empty {
    padding: 14px 8px;
    color: var(--sub-text-color);
    font-size: 12px;
    text-align: center;
  }

  .km-insights {
    margin-top: 14px;
  }

  .km-insight {
    display: grid;
    grid-template-columns: 1fr auto;
    width: 100%;
    min-width: 0;
    height: auto;
    padding: 11px;
    box-sizing: border-box;
    text-align: left;
    line-height: 1.4;

    span {
      font-size: 12px;
      font-weight: 600;
    }

    strong {
      grid-row: span 2;
      color: var(--resource-tag-color);
      font-size: 22px;
      font-variant-numeric: tabular-nums;
    }

    small {
      min-width: 0;
      color: var(--sub-text-color);
      font-size: 10px;
      white-space: normal;
    }
  }

  .km-insight--static {
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    background: color-mix(in srgb, var(--primary-btn-bg-color) 78%, transparent);
  }

  .km-mobile-list {
    --primary-color: var(--resource-tag-color);

    display: block;
    min-width: 0;
  }

  .km-mobile-empty {
    padding: 8px 2px;
    color: var(--sub-text-color);
    font-size: 12px;
    text-align: center;
  }

  .km-mobile-filters {
    display: flex;
    flex-direction: column;
    gap: 12px;

    label {
      color: var(--sub-text-color);
      font-size: 12px;
      font-weight: 600;
    }

    .km-toggle {
      width: 100%;
    }
  }

  .km-mobile-filter-actions,
  .km-mobile-topic-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;

    :deep(.b_btn) {
      width: 100%;
    }
  }

  .km-mobile-topic-drawer {
    min-height: 100%;
    background: var(--background-color);
  }

  .km-mobile-topic-summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px 8px;
    color: var(--sub-text-color);
    font-size: 12px;

    span:last-child {
      margin-left: auto;
    }
  }

  .km-mobile-topic-tabs {
    position: sticky;
    z-index: 2;
    top: 0;
    overflow-x: auto;
    padding: 8px 16px 10px;
    border-bottom: 1px solid var(--card-border-color);
    background: color-mix(in srgb, var(--background-color) 96%, transparent);

    :deep(.tab-container) {
      width: max-content;
    }
  }

  .km-mobile-topic-body {
    padding: 2px 16px calc(20px + env(safe-area-inset-bottom));
  }

  .km-mobile-topic-section {
    padding: 16px 0;
    border-bottom: 1px solid var(--card-border-color);
  }

  .km-mobile-resource-item {
    min-height: 50px;
    padding: 9px 11px;
    border-color: transparent;
    background: var(--card-background);
  }

  .km-resource-main {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;

    strong {
      overflow: hidden;
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      color: var(--sub-text-color);
      font-size: 10px;
    }
  }

  .km-mobile-related-item {
    min-height: 44px;
    padding: 9px 11px;
    border-color: transparent;
    background: color-mix(in srgb, var(--resource-tag-color) 6%, var(--card-background));
  }

  .km-mobile-topic-actions {
    padding-top: 16px;
  }

  .knowledge-map-page--mobile {
    height: auto;
    min-height: 100%;
    padding: 12px;

    .km-header {
      display: block;
      min-height: 28px;
    }

    .km-toolbar {
      display: flex;
    }

    .km-search {
      width: auto;
      flex: 1;
    }

    .km-filter-trigger {
      flex: 0 0 auto;
      height: var(--mobile-touch-size, 44px);
      line-height: var(--mobile-touch-size, 44px);
    }

    .km-content {
      display: flex;
      flex-direction: column;
      overflow: visible;
    }
  }

  @media (max-width: 1180px) and (min-width: 701px) {
    .km-content {
      grid-template-columns: minmax(0, 1fr) 280px;
    }

    .km-stat {
      min-width: 72px;
      padding-inline: 8px;
    }
  }

  @media (max-width: 900px) and (min-width: 701px) {
    .km-search {
      width: auto;
      min-width: 120px;
      flex: 1 1 180px;
    }

    .km-select--strength {
      width: 122px;
    }

    .km-toggle,
    .km-reset {
      padding-inline: 8px;
    }

    .km-stats {
      gap: 4px;
    }

    .km-stat {
      min-width: 0;
      gap: 3px;
      padding-inline: 5px;

      strong {
        font-size: 14px;
      }

      span {
        font-size: 9px;
      }
    }
  }
</style>
