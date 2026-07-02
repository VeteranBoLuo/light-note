<template>
  <div class="global-graph-page">
    <div class="gg-header">
      <div class="gg-eyebrow">Root · 知识图谱</div>
      <h2 class="gg-title">我的知识全貌</h2>
      <p class="gg-sub">
        {{ stats.tagCount }} 个标签 · {{ stats.resourceCount }} 个资源 · {{ stats.edgeCount }} 条关联 —— 单击看详情,双击标签进入它的主题图
        <span v-if="stats.truncated" class="gg-trunc">(标签较多,已截断展示)</span>
      </p>
    </div>
    <div class="gg-body">
      <GlobalGraphCanvas
        :nodes="nodes"
        :edges="edges"
        :loading="loading"
        @node-click="onNodeClick"
        @node-dblclick="openNode"
        @canvas-click="active = null"
      />
      <div class="gg-legend">
        <span v-for="t in legend" :key="t.type" class="gg-legend-item">
          <i class="gg-legend-dot" :style="{ background: GRAPH_NODE_COLOR[t.type] }"></i>{{ t.name }}
        </span>
      </div>
      <transition name="gg-panel">
        <div v-if="active" class="gg-info">
          <div class="gg-info-type" :style="{ color: GRAPH_NODE_COLOR[active.type] }">{{ TYPE_NAME[active.type] }}</div>
          <div class="gg-info-name">{{ active.label }}</div>
          <div v-if="active.type === 'tag'" class="gg-info-meta">挂载 {{ active.meta?.resourceCount ?? 0 }} 个资源</div>
          <div v-else-if="active.type === 'file' && active.meta?.fileType" class="gg-info-meta">{{ active.meta.fileType }}</div>
          <div v-else-if="active.type === 'bookmark' && active.meta?.url" class="gg-info-meta gg-info-url">{{ active.meta.url }}</div>
          <button class="gg-info-btn" @click="openNode(active)">{{ openLabel(active) }} →</button>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import router from '@/router';
  import { fetchGlobalGraph, type TagGraphEdge, type TagGraphNode } from '@/api/tagGraph.ts';
  import { GRAPH_NODE_COLOR } from '@/components/tagGraph/shared.ts';
  import GlobalGraphCanvas from './GlobalGraphCanvas.vue';

  const TYPE_NAME: Record<string, string> = { tag: '标签', bookmark: '书签', note: '笔记', file: '文件' };
  const legend = [
    { type: 'tag', name: '标签' },
    { type: 'bookmark', name: '书签' },
    { type: 'note', name: '笔记' },
    { type: 'file', name: '文件' },
  ] as const;

  const nodes = ref<TagGraphNode[]>([]);
  const edges = ref<TagGraphEdge[]>([]);
  const stats = ref({ tagCount: 0, resourceCount: 0, edgeCount: 0, truncated: false });
  const loading = ref(true);
  const active = ref<TagGraphNode | null>(null);

  function onNodeClick(node: TagGraphNode) {
    active.value = node;
  }
  function openLabel(node: TagGraphNode) {
    if (node.type === 'tag') return '进入主题图';
    if (node.type === 'note') return '打开笔记';
    if (node.type === 'bookmark') return '打开链接';
    return '去云空间查看';
  }
  // 按类型给不同动作:标签→主题图、笔记→详情、书签→开链接、文件→去云空间
  function openNode(node: TagGraphNode) {
    if (!node) return;
    if (node.type === 'tag') router.push(`/tag/${node.rawId}`);
    else if (node.type === 'note') router.push(`/noteLibrary/${node.rawId}`);
    else if (node.type === 'bookmark' && node.meta?.url) window.open(node.meta.url, '_blank');
    else if (node.type === 'file') router.push('/cloudSpace');
  }

  onMounted(async () => {
    try {
      const res = await fetchGlobalGraph();
      if (res.status === 200 && res.data) {
        nodes.value = res.data.nodes || [];
        edges.value = res.data.edges || [];
        stats.value = res.data.stats || stats.value;
      }
    } finally {
      loading.value = false;
    }
  });
</script>

<style scoped lang="less">
  .global-graph-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 16px 20px 20px;
    box-sizing: border-box;
  }
  .gg-eyebrow {
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--sub-text-color, #7c8b9e);
  }
  .gg-title {
    margin: 4px 0 2px;
    font-size: 22px;
    font-weight: 600;
    color: var(--text-color);
  }
  .gg-sub {
    margin: 0;
    font-size: 13px;
    color: var(--sub-text-color, #7c8b9e);
  }
  .gg-trunc {
    color: var(--warn-color, #b3760f);
  }
  .gg-body {
    position: relative;
    flex: 1;
    min-height: 0;
    margin-top: 14px;
  }
  .gg-info {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 240px;
    background: var(--background-color);
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14);
  }
  .gg-legend {
    position: absolute;
    top: 14px;
    left: 14px;
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    background: color-mix(in srgb, var(--background-color) 82%, transparent);
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--text-color);
  }
  .gg-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .gg-legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
  }
  .gg-info-type {
    font-size: 12px;
    font-weight: 600;
  }
  .gg-info-url {
    word-break: break-all;
    font-size: 12px;
  }
  .gg-info-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color);
    word-break: break-all;
  }
  .gg-info-meta {
    font-size: 13px;
    color: var(--sub-text-color, #888);
    margin: 6px 0 12px;
  }
  .gg-info-btn {
    width: 100%;
    border: 0;
    cursor: pointer;
    color: #fff;
    background: #615ced;
    font-size: 13px;
    padding: 8px;
    border-radius: 8px;
  }
  .gg-panel-enter-active,
  .gg-panel-leave-active {
    transition:
      opacity 0.2s,
      transform 0.2s;
  }
  .gg-panel-enter-from,
  .gg-panel-leave-to {
    opacity: 0;
    transform: translateY(-6px);
  }
</style>
