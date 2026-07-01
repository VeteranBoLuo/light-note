<template>
  <div class="global-graph-canvas">
    <div v-if="loading && !nodes.length" class="gg-state"><div class="gg-spinner"></div><span>加载中…</span></div>
    <div v-else-if="!nodes.length" class="gg-state gg-state--empty">
      还没有可展示的标签关联——多给书签/笔记/文件打些标签就会连起来
    </div>
    <div v-show="nodes.length" ref="containerRef" class="gg-stage"></div>
  </div>
</template>

<script setup lang="ts">
  import { Graph } from '@antv/g6';
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import type { TagGraphEdge, TagGraphNode } from '@/api/tagGraph.ts';
  import { getEdgeColor, getNodeLabel, GRAPH_NODE_COLOR } from '@/components/tagGraph/shared.ts';

  const props = defineProps<{
    nodes: TagGraphNode[];
    edges: TagGraphEdge[];
    loading?: boolean;
  }>();
  const emit = defineEmits<{
    (e: 'node-click', node: TagGraphNode): void;
    (e: 'node-dblclick', node: TagGraphNode): void;
    (e: 'canvas-click'): void;
  }>();

  const containerRef = ref<HTMLElement | null>(null);
  let graph: Graph | null = null;
  let resizeObserver: ResizeObserver | null = null;

  function themeVar(name: string, fallback: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  // 圆形初始坐标兜底:即使 d3-force 布局未生效,节点也不会堆在原点(退化成一圈标签仍可读)
  function seedPositions() {
    const w = Math.max(containerRef.value?.clientWidth || 900, 520);
    const h = Math.max(containerRef.value?.clientHeight || 560, 460);
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.38;
    const total = props.nodes.length || 1;
    const map = new Map<string, { x: number; y: number }>();
    props.nodes.forEach((node, i) => {
      const angle = (Math.PI * 2 * i) / total - Math.PI / 2;
      map.set(node.id, { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
    });
    return map;
  }

  function nodeDataById(nodeId?: string): TagGraphNode | null {
    if (!nodeId) return null;
    try {
      const gn = graph?.getNodeData(nodeId) as any;
      return (gn?.data || null) as TagGraphNode | null;
    } catch {
      return null;
    }
  }

  function buildData() {
    const labelFill = themeVar('--text-color', '#222222');
    const labelBg = themeVar('--background-color', '#ffffff');
    const pos = seedPositions();
    return {
      nodes: props.nodes.map((node) => {
        const p = pos.get(node.id);
        return {
          id: node.id,
          type: 'circle',
          data: node as unknown as Record<string, unknown>,
          style: {
            x: p?.x,
            y: p?.y,
            size: Math.max(16, Math.min(46, Number(node.size || 24))),
            fill: GRAPH_NODE_COLOR[node.type],
            stroke: 'rgba(255,255,255,0.78)',
            lineWidth: 1.2,
            labelText: getNodeLabel(node),
            labelFill,
            labelFontSize: 11,
            labelFontWeight: 600,
            labelPlacement: 'bottom',
            labelOffsetY: 8,
            labelBackground: true,
            labelBackgroundFill: labelBg,
            labelBackgroundOpacity: 0.8,
            labelBackgroundRadius: 4,
            labelPadding: [2, 6],
          },
        };
      }),
      edges: props.edges.map((edge) => ({
        id: edge.id,
        type: 'line',
        source: edge.source,
        target: edge.target,
        data: edge as unknown as Record<string, unknown>,
        style: {
          stroke: getEdgeColor(edge.type),
          lineWidth: Math.max(1, Number(edge.weight || 1)),
          opacity: 0.3,
        },
      })),
    };
  }

  async function render() {
    if (!containerRef.value || props.loading || !props.nodes.length) return;
    await nextTick();
    if (!graph) {
      graph = new Graph({
        container: containerRef.value,
        data: buildData(),
        animation: false,
        layout: { type: 'd3-force' }, // 力导向:相关标签自动聚拢(seedPositions 已给初始位置兜底)
        behaviors: [
          { type: 'drag-canvas' },
          { type: 'zoom-canvas' },
          { type: 'drag-element' },
          { type: 'hover-activate', degree: 1 },
        ],
        zoomRange: [0.12, 2.4],
      } as any);
      graph.on('node:click', (e: any) => {
        const node = nodeDataById(e?.target?.id);
        if (node) emit('node-click', node);
      });
      graph.on('node:dblclick', (e: any) => {
        const node = nodeDataById(e?.target?.id);
        if (node) emit('node-dblclick', node);
      });
      graph.on('canvas:click', () => emit('canvas-click'));
      await graph.render();
      return;
    }
    graph.setData(buildData());
    await graph.render();
  }

  onMounted(async () => {
    await render();
    resizeObserver = new ResizeObserver(() => graph?.resize());
    if (containerRef.value) resizeObserver.observe(containerRef.value);
  });
  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    graph?.destroy();
    graph = null;
  });
  watch(
    () => [props.nodes, props.edges, props.loading],
    () => render(),
  );
</script>

<style scoped lang="less">
  .global-graph-canvas {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 480px;
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid var(--card-border-color);
    background:
      radial-gradient(circle at 20% 15%, color-mix(in srgb, var(--resource-tag-color, #615ced) 8%, transparent), transparent 34%),
      linear-gradient(135deg, color-mix(in srgb, var(--background-color) 96%, white), var(--background-color));
  }
  .gg-stage {
    width: 100%;
    height: 100%;
    min-height: 480px;
  }
  .gg-state {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--sub-text-color, #888);
    text-align: center;
    padding: 24px;
    font-size: 14px;
  }
  .gg-spinner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid rgba(97, 92, 237, 0.2);
    border-top-color: #615ced;
    animation: gg-spin 0.8s linear infinite;
  }
  @keyframes gg-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
