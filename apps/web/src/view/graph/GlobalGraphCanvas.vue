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

  // 聚簇布局(可控、必不重叠):① 带"硬碰撞"的力导向把标签铺开(每个标签按资源数占一块地,互不压);
  // ② 每个标签的资源在其周围成环卫星排布;③ 整体归一化铺满画布。解决 170+ 节点全局力导向压成一团的问题。
  function computeLayout() {
    const w = Math.max(containerRef.value?.clientWidth || 1000, 520);
    const h = Math.max(containerRef.value?.clientHeight || 620, 460);
    const map = new Map<string, { x: number; y: number }>();
    const tags = props.nodes.filter((n) => n.type === 'tag');
    const resources = props.nodes.filter((n) => n.type !== 'tag');
    if (!tags.length) {
      props.nodes.forEach((n, i) => map.set(n.id, { x: w / 2 + (i % 12) * 20, y: h / 2 + Math.floor(i / 12) * 20 }));
      return map;
    }

    // 资源归属:挂到它第一条标签边对应的标签
    const parentOf = new Map<string, string>();
    props.edges.forEach((e) => {
      if (e.type !== 'tag-tag' && !parentOf.has(e.target)) parentOf.set(e.target, e.source);
    });
    const childrenOf = new Map<string, TagGraphNode[]>();
    resources.forEach((r) => {
      const p = parentOf.get(r.id);
      if (!p) return;
      if (!childrenOf.has(p)) childrenOf.set(p, []);
      (childrenOf.get(p) as TagGraphNode[]).push(r);
    });

    // 每个标签的"势力半径":资源越多占地越大(碰撞避让 + 卫星环用)
    const clusterR = new Map<string, number>();
    tags.forEach((t) => {
      const cnt = (childrenOf.get(t.id) || []).length;
      clusterR.set(t.id, 46 + Math.min(150, Math.ceil(cnt / 9) * 26));
    });
    const cr = (id: string) => clusterR.get(id) || 46;

    // ① 标签中心:带硬碰撞的力导向
    const N = tags.length;
    const px: number[] = [];
    const py: number[] = [];
    const initR = Math.min(w, h) * 0.4;
    tags.forEach((t, i) => {
      const a = (Math.PI * 2 * i) / N;
      px[i] = Math.cos(a) * initR + (i % 3) * 6;
      py[i] = Math.sin(a) * initR + (i % 2) * 6;
    });
    const idx = new Map<string, number>();
    tags.forEach((t, i) => idx.set(t.id, i));
    const tagLinks: Array<[number, number]> = [];
    props.edges.forEach((e) => {
      if (e.type !== 'tag-tag') return;
      const a = idx.get(e.source);
      const b = idx.get(e.target);
      if (a !== undefined && b !== undefined) tagLinks.push([a, b]);
    });
    const ITER = 420;
    for (let it = 0; it < ITER; it += 1) {
      const cool = 1 - it / ITER;
      const dxs = new Array(N).fill(0);
      const dys = new Array(N).fill(0);
      for (let i = 0; i < N; i += 1) {
        for (let j = i + 1; j < N; j += 1) {
          const ddx = px[i] - px[j];
          const ddy = py[i] - py[j];
          const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
          const minD = cr(tags[i].id) + cr(tags[j].id) + 30;
          let f = 3000 / (d * d); // 远程轻微排斥
          if (d < minD) f += (minD - d) * 0.6; // 硬碰撞:势力范围重叠就强推开
          const fx = (ddx / d) * f;
          const fy = (ddy / d) * f;
          dxs[i] += fx;
          dys[i] += fy;
          dxs[j] -= fx;
          dys[j] -= fy;
        }
      }
      tagLinks.forEach(([a, b]) => {
        const ddx = px[b] - px[a];
        const ddy = py[b] - py[a];
        const d = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        const ideal = cr(tags[a].id) + cr(tags[b].id) + 60;
        const f = (d - ideal) * 0.012; // 相关标签互相靠拢(碰撞保证不重叠)
        const fx = (ddx / d) * f;
        const fy = (ddy / d) * f;
        dxs[a] += fx;
        dys[a] += fy;
        dxs[b] -= fx;
        dys[b] -= fy;
      });
      const maxStep = 44 * cool + 3;
      for (let i = 0; i < N; i += 1) {
        let mvx = dxs[i] - px[i] * 0.004;
        let mvy = dys[i] - py[i] * 0.004;
        const m = Math.sqrt(mvx * mvx + mvy * mvy) || 1;
        if (m > maxStep) {
          mvx = (mvx / m) * maxStep;
          mvy = (mvy / m) * maxStep;
        }
        px[i] += mvx;
        py[i] += mvy;
      }
    }
    // 横向铺开:图谱容器通常很宽,按宽高比把标签星座横向拉伸,填满左右空间(卫星环随后按圆形排布,不受拉伸影响)
    let sMinX = Infinity;
    let sMaxX = -Infinity;
    let sMinY = Infinity;
    let sMaxY = -Infinity;
    for (let i = 0; i < N; i += 1) {
      sMinX = Math.min(sMinX, px[i]);
      sMaxX = Math.max(sMaxX, px[i]);
      sMinY = Math.min(sMinY, py[i]);
      sMaxY = Math.max(sMaxY, py[i]);
    }
    const tSpanX = sMaxX - sMinX || 1;
    const tSpanY = sMaxY - sMinY || 1;
    const stretchX = Math.max(1, Math.min(2.6, ((w / h) * tSpanY) / tSpanX));
    const tcx = (sMinX + sMaxX) / 2;
    for (let i = 0; i < N; i += 1) px[i] = tcx + (px[i] - tcx) * stretchX;

    tags.forEach((t, i) => map.set(t.id, { x: px[i], y: py[i] }));

    // ② 资源:围绕父标签成环卫星
    childrenOf.forEach((kids, tagId) => {
      const c = map.get(tagId);
      if (!c) return;
      const perRing = 9;
      kids.forEach((r, k) => {
        const ring = Math.floor(k / perRing);
        const inRing = k % perRing;
        const countThisRing = Math.min(perRing, kids.length - ring * perRing);
        const rad = 40 + ring * 24;
        const ang = (Math.PI * 2 * inRing) / countThisRing + ring * 0.5;
        map.set(r.id, { x: c.x + Math.cos(ang) * rad, y: c.y + Math.sin(ang) * rad });
      });
    });
    resources.forEach((r, i) => {
      if (!map.has(r.id)) map.set(r.id, { x: (i % 12) * 14, y: Math.floor(i / 12) * 14 });
    });

    // ③ 归一化铺满画布
    const pts = props.nodes.map((n) => map.get(n.id)).filter(Boolean) as Array<{ x: number; y: number }>;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 70;
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const scale = Math.min((w - pad * 2) / spanX, (h - pad * 2) / spanY, 1.4);
    const offX = (w - spanX * scale) / 2;
    const offY = (h - spanY * scale) / 2;
    map.forEach((p, id) => map.set(id, { x: (p.x - minX) * scale + offX, y: (p.y - minY) * scale + offY }));
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
        animation: true,
        behaviors: [
          { type: 'drag-canvas' },
          { type: 'zoom-canvas' },
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
    animation: gg-fade 0.8s ease both;
  }
  /* 环境光:缓慢漂移的极光,给暗底一点"活着"的氛围(在画布之下) */
  .global-graph-canvas::after {
    content: '';
    position: absolute;
    inset: -30%;
    z-index: 0;
    pointer-events: none;
    background:
      radial-gradient(circle at 30% 38%, color-mix(in srgb, #615ced 16%, transparent), transparent 42%),
      radial-gradient(circle at 72% 62%, color-mix(in srgb, #ec4899 12%, transparent), transparent 42%);
    animation: gg-drift 20s ease-in-out infinite alternate;
  }
  .gg-stage {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    min-height: 480px;
  }
  @keyframes gg-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes gg-drift {
    from {
      transform: translate(-4%, -3%) rotate(0deg) scale(1);
    }
    to {
      transform: translate(4%, 3%) rotate(6deg) scale(1.06);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .global-graph-canvas,
    .global-graph-canvas::after {
      animation: none;
    }
  }
  .gg-state {
    position: absolute;
    inset: 0;
    z-index: 2;
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
