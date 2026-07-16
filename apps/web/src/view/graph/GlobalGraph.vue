<template>
  <div class="knowledge-map-page" :class="{ 'knowledge-map-page--mobile': bookmark.isMobile }">
    <header class="km-header">
      <div class="km-heading">
        <div class="km-eyebrow">{{ t('knowledgeMap.eyebrow') }}</div>
        <h1>{{ t('knowledgeMap.title') }}</h1>
        <p>
          {{ t('knowledgeMap.subtitle') }}
          <span v-if="stats.truncated" class="km-warning">{{ t('knowledgeMap.truncated') }}</span>
        </p>
      </div>
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
    </header>

    <section class="km-toolbar">
      <div class="km-search">
        <BInput
          v-model:value="keyword"
          :placeholder="t('knowledgeMap.searchPlaceholder')"
          height="38px"
          @enter="focusFirstSearchResult"
        >
          <template #prefix>
            <SvgIcon :src="icon.navigation.search" size="17" />
          </template>
        </BInput>
      </div>
      <BSelect v-model:value="minSharedCount" class="km-select km-select--strength" :options="strengthOptions" />
      <BButton class="km-toggle" :class="{ active: hideIsolated }" @click="hideIsolated = !hideIsolated">
        {{ t('knowledgeMap.hideIsolated') }}
      </BButton>
      <BButton class="km-reset" @click="resetMap">{{ t('knowledgeMap.reset') }}</BButton>
    </section>

    <section class="km-content">
      <div v-if="bookmark.isMobile" class="km-mobile-list">
        <div class="km-mobile-summary">{{ mobileSummary }}</div>
        <BButton
          v-for="node in mobileNodes"
          :key="node.id"
          class="km-mobile-item"
          :class="{ active: activeNode?.id === node.id }"
          @click="selectNode(node)"
        >
          <span class="km-mobile-dot"></span>
          <span class="km-mobile-main">
            <strong>{{ node.label }}</strong>
            <small>{{ t('knowledgeMap.resourceCount', { count: node.meta?.resourceCount || 0 }) }}</small>
          </span>
          <span class="km-mobile-related">{{ nodeRelationshipCount(node.id) }}</span>
        </BButton>
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

      <aside class="km-panel">
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
              <small>{{ activeRelatedTags.length }}</small>
            </div>
            <div v-if="activeRelatedTags.length" class="km-related-list">
              <BButton
                v-for="item in activeRelatedTags"
                :key="item.node.id"
                class="km-related-item"
                @click="selectNode(item.node)"
              >
                <span>{{ item.node.label }}</span>
                <small>{{ t('knowledgeMap.sharedCount', { count: item.sharedCount }) }}</small>
              </BButton>
            </div>
            <div v-else class="km-section-empty">{{ t('knowledgeMap.noRelatedTopics') }}</div>
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
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import {
    fetchGlobalGraph,
    fetchTagGraph,
    type GlobalGraphResponse,
    type GraphResourceType,
    type TagGraphEdge,
    type TagGraphNode,
  } from '@/api/tagGraph.ts';
  import GlobalGraphCanvas from './GlobalGraphCanvas.vue';

  type ResourceFilter = GraphResourceType | 'all';

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
  const focusLoading = ref(false);
  const resourceType = ref<ResourceFilter>('all');
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
  const nodeById = computed(() => new Map(nodes.value.map((node) => [node.id, node])));
  const activeRelatedTags = computed(() => {
    if (!activeNode.value) return [];
    return displayEdges.value
      .filter((edge) => edge.source === activeNode.value?.id || edge.target === activeNode.value?.id)
      .map((edge) => ({
        node: nodeById.value.get(edge.source === activeNode.value?.id ? edge.target : edge.source),
        sharedCount: Number(edge.sharedCount || Math.max(1, Number(edge.weight || 1) - 1)),
      }))
      .filter((item): item is { node: TagGraphNode; sharedCount: number } => Boolean(item.node))
      .sort((a, b) => b.sharedCount - a.sharedCount)
      .slice(0, 10);
  });
  const filteredFocusResources = computed(() =>
    focusResources.value
      .filter((node) => resourceType.value === 'all' || node.type === resourceType.value)
      .slice(0, 18),
  );
  const mobileNodes = computed(() => overviewNodes.value.slice(0, 100));
  const canvasSummary = computed(() => {
    if (activeNode.value) {
      return t('knowledgeMap.focusSummary', { name: activeNode.value.label, count: activeRelatedTags.value.length });
    }
    return t('knowledgeMap.canvasSummary', { shown: displayNodes.value.length, total: stats.value.tagCount });
  });
  const mobileSummary = computed(() => t('knowledgeMap.mobileSummary', { count: mobileNodes.value.length }));

  function nodeRelationshipCount(nodeId: string) {
    return thresholdEdges.value.filter((edge) => edge.source === nodeId || edge.target === nodeId).length;
  }

  async function loadFocusResources(node: TagGraphNode) {
    const requestId = ++focusRequestSequence;
    focusLoading.value = true;
    focusResources.value = [];
    try {
      const res = await fetchTagGraph({
        tagId: node.rawId,
        includeResources: true,
        resourceTypes: ['bookmark', 'note', 'file'],
        limitRelatedTags: 1,
        limitPerResourceType: 18,
      });
      if (requestId !== focusRequestSequence || activeNode.value?.id !== node.id) return;
      if (res.status === 200 && res.data) {
        focusResources.value = (res.data.nodes || []).filter((item) => item.type !== 'tag');
      }
    } finally {
      if (requestId === focusRequestSequence) focusLoading.value = false;
    }
  }

  function selectNode(node: TagGraphNode) {
    if (!node || node.type !== 'tag') return;
    activeNode.value = node;
    resourceType.value = 'all';
    loadFocusResources(node);
  }

  function clearFocus() {
    focusRequestSequence += 1;
    activeNode.value = null;
    focusResources.value = [];
    focusLoading.value = false;
    resourceType.value = 'all';
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

  function viewTagResources() {
    if (!activeNode.value) return;
    router.push({ path: '/search', query: { tags: activeNode.value.label } });
  }

  function openTagDetail() {
    if (activeNode.value) router.push(`/tag/${activeNode.value.rawId}`);
  }

  function viewUntaggedResources() {
    router.push({ path: '/search', query: { untagged: '1' } });
  }

  function openTagManager() {
    router.push('/manage/tagMg');
  }

  function openResource(node: TagGraphNode) {
    if (node.type === 'bookmark' && node.meta?.url) {
      openBookmarkUrl(node.meta.url);
      return;
    }
    if (node.type === 'note') {
      router.push(`/noteLibrary/${node.rawId}`);
      return;
    }
    if (node.type === 'file') router.push({ path: '/cloudSpace', query: { fileName: node.label } });
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

  .km-heading {
    min-width: 0;

    h1 {
      margin: 2px 0;
      font-size: 22px;
      line-height: 1.3;
    }

    p {
      margin: 0;
      color: var(--sub-text-color);
      font-size: 12px;
    }
  }

  .km-eyebrow {
    color: var(--resource-tag-color);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .km-warning {
    margin-left: 6px;
    color: var(--resource-file-color);
  }

  .km-stats {
    display: flex;
    gap: 8px;
    flex: 0 0 auto;
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
  .km-reset {
    height: 38px;
    line-height: 38px;
    padding: 0 13px;
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
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }

  .km-mobile-summary,
  .km-mobile-empty {
    padding: 8px 2px;
    color: var(--sub-text-color);
    font-size: 12px;
    text-align: center;
  }

  .km-mobile-item {
    display: flex;
    width: 100%;
    height: auto;
    min-height: 54px;
    justify-content: flex-start;
    gap: 10px;
    padding: 9px 11px;
    text-align: left;

    &.active {
      border: 1px solid color-mix(in srgb, var(--resource-tag-color) 34%, var(--card-border-color));
      background: color-mix(in srgb, var(--resource-tag-color) 8%, var(--background-color));
    }
  }

  .km-mobile-main {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;

    strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    small {
      color: var(--sub-text-color);
      font-size: 10px;
    }
  }

  .km-mobile-related {
    color: var(--resource-tag-color);
    font-size: 12px;
  }

  .knowledge-map-page--mobile {
    height: auto;
    min-height: 100%;
    padding: 12px;

    .km-header {
      display: block;
    }

    .km-stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 10px;
    }

    .km-stat {
      min-width: 0;
    }

    .km-toolbar {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }

    .km-search {
      grid-column: 1 / -1;
      width: 100%;
    }

    .km-select,
    .km-select--strength {
      width: 100%;
    }

    .km-select--strength {
      grid-column: 1 / -1;
    }

    .km-toggle,
    .km-reset {
      width: 100%;
    }

    .km-content {
      display: flex;
      flex-direction: column;
      overflow: visible;
    }

    .km-panel {
      max-height: none;
      overflow: visible;
    }
  }

  @media (max-width: 1180px) and (min-width: 701px) {
    .km-content {
      grid-template-columns: minmax(0, 1fr) 280px;
    }

    .km-stat {
      min-width: 72px;
    }
  }
</style>
