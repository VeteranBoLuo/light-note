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
        @node-dblclick="drillDown"
        @canvas-click="active = null"
      />
      <transition name="gg-panel">
        <div v-if="active" class="gg-info">
          <div class="gg-info-name">{{ active.label }}</div>
          <div class="gg-info-meta">挂载资源:{{ active.meta?.resourceCount ?? 0 }} 个</div>
          <button class="gg-info-btn" @click="drillDown(active)">进入「{{ active.label }}」主题图 →</button>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import router from '@/router';
  import { fetchGlobalGraph, type TagGraphEdge, type TagGraphNode } from '@/api/tagGraph.ts';
  import GlobalGraphCanvas from './GlobalGraphCanvas.vue';

  const nodes = ref<TagGraphNode[]>([]);
  const edges = ref<TagGraphEdge[]>([]);
  const stats = ref({ tagCount: 0, resourceCount: 0, edgeCount: 0, truncated: false });
  const loading = ref(true);
  const active = ref<TagGraphNode | null>(null);

  function onNodeClick(node: TagGraphNode) {
    active.value = node;
  }
  function drillDown(node: TagGraphNode) {
    if (node?.type === 'tag') router.push(`/tag/${node.rawId}`);
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
