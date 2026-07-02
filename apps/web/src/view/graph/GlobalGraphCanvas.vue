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

  // 自己算力导向布局(不依赖 g6 内置 layout,结果完全可控):节点两两排斥 + 边弹簧拉近 + 轻微向心,
  // 迭代后归一化铺满画布。这样节点必然散开、连线清晰,避免 d3-force 默认参数把节点全吸成一团。
  function computeLayout() {
    const list = props.nodes;
    const N = list.length;
    const w = Math.max(containerRef.value?.clientWidth || 900, 520);
    const h = Math.max(containerRef.value?.clientHeight || 560, 460);
    const map = new Map<string, { x: number; y: number }>();
    if (!N) return map;

    const idx = new Map<string, number>();
    list.forEach((n, i) => idx.set(n.id, i));
    const px: number[] = [];
    const py: number[] = [];
    const initR = Math.min(w, h) * 0.42;
    list.forEach((n, i) => {
      const a = (Math.PI * 2 * i) / N;
      px[i] = Math.cos(a) * initR + (i % 3) * 8;
      py[i] = Math.sin(a) * initR + (i % 2) * 8;
    });
    const links: Array<[number, number, number]> = [];
    props.edges.forEach((e) => {
      const a = idx.get(e.source);
      const b = idx.get(e.target);
      // 标签-资源边拉短(资源贴着标签成卫星簇),标签之间的边拉长(把不同主题团彼此拉开)
      if (a !== undefined && b !== undefined) links.push([a, b, e.type === 'tag-tag' ? 175 : 50]);
    });

    const ITER = 320;
    const repulse = 7000; // 排斥强度(节点变多了适当调小)
    const spring = 0.025; // 弹簧系数
    const gravity = 0.012; // 向心(防止游离到无穷远)
    for (let it = 0; it < ITER; it += 1) {
      const cool = 1 - it / ITER;
      const dxs = new Array(N).fill(0);
      const dys = new Array(N).fill(0);
      for (let i = 0; i < N; i += 1) {
        for (let j = i + 1; j < N; j += 1) {
          const dx = px[i] - px[j];
          const dy = py[i] - py[j];
          const d2 = dx * dx + dy * dy || 1;
          const d = Math.sqrt(d2);
          const f = repulse / d2;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          dxs[i] += fx;
          dys[i] += fy;
          dxs[j] -= fx;
          dys[j] -= fy;
        }
      }
      links.forEach(([a, b, ideal]) => {
        const dx = px[b] - px[a];
        const dy = py[b] - py[a];
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - ideal) * spring;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        dxs[a] += fx;
        dys[a] += fy;
        dxs[b] -= fx;
        dys[b] -= fy;
      });
      const maxStep = 26 * cool + 2;
      for (let i = 0; i < N; i += 1) {
        let mvx = dxs[i] - px[i] * gravity;
        let mvy = dys[i] - py[i] * gravity;
        const m = Math.sqrt(mvx * mvx + mvy * mvy) || 1;
        if (m > maxStep) {
          mvx = (mvx / m) * maxStep;
          mvy = (mvy / m) * maxStep;
        }
        px[i] += mvx;
        py[i] += mvy;
      }
    }

    const minX = Math.min(...px);
    const maxX = Math.max(...px);
    const minY = Math.min(...py);
    const maxY = Math.max(...py);
    const pad = 80;
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY, 1.5);
    const offsetX = (w - spanX * scale) / 2;
    const offsetY = (h - spanY * scale) / 2;
    list.forEach((n, i) => {
      map.set(n.id, { x: offsetX + (px[i] - minX) * scale, y: offsetY + (py[i] - minY) * scale });
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
    const pos = computeLayout();
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
            size: Math.max(12, Math.min(54, Number(node.size || 20))),
            fill: GRAPH_NODE_COLOR[node.type],
            fillOpacity: node.type === 'tag' ? 1 : 0.92,
            stroke: node.type === 'tag' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)',
            lineWidth: node.type === 'tag' ? 1.5 : 0.8,
            shadowColor: GRAPH_NODE_COLOR[node.type],
            shadowBlur: node.type === 'tag' ? 18 : 6,
            labelText: node.type === 'tag' ? getNodeLabel(node) : '',
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
          lineWidth: edge.type === 'tag-tag' ? Math.max(1.4, Number(edge.weight || 1)) : 0.9,
          opacity: edge.type === 'tag-tag' ? 0.55 : 0.2,
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
