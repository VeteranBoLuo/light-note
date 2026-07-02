<template>
  <div class="tag-graph-canvas" :class="{ 'tag-graph-canvas--compact': compact, 'tag-graph-canvas--full': fullHeight }">
    <div v-if="loading && !nodes.length" class="graph-state">
      <div class="graph-spinner"></div>
      <span>{{ t('tagGraph.loading') }}</span>
    </div>
    <div v-else-if="!nodes.length" class="graph-state graph-state--empty">
      {{ t('tagGraph.empty') }}
    </div>
    <div v-show="nodes.length" ref="containerRef" class="graph-stage"></div>
    <div v-if="loading && nodes.length" class="graph-refresh-indicator">
      <div class="graph-spinner"></div>
      <span>{{ t('tagGraph.loading') }}</span>
    </div>
    <div v-if="nodes.length" class="graph-zoom-hint">{{ t('tagGraph.zoomHint') }}</div>
    <div class="graph-actions" :class="{ 'graph-actions--loading': loading }">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { Graph } from '@antv/g6';
  import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { TagGraphEdge, TagGraphNode } from '@/api/tagGraph.ts';
  import { getEdgeColor, getNodeLabel, GRAPH_NODE_COLOR, isNeighbor } from './shared.ts';

  const props = defineProps<{
    nodes: TagGraphNode[];
    edges: TagGraphEdge[];
    loading?: boolean;
    activeNodeId?: string;
    compact?: boolean;
    fullHeight?: boolean;
  }>();

  const emit = defineEmits<{
    (e: 'node-click', node: TagGraphNode): void;
    (e: 'node-dblclick', node: TagGraphNode): void;
    (e: 'canvas-click'): void;
  }>();

  const { t } = useI18n();
  const compact = ref(false);
  const containerRef = ref<HTMLElement | null>(null);
  let graph: Graph | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let rendering = false;
  let pendingRender = false;

  function getRenderNodeSize(node: TagGraphNode) {
    if (node.meta?.isCenter) return 48;
    if (node.type === 'tag') return Math.max(26, Math.min(38, Number(node.size || 30) * 0.72));
    return 22;
  }

  function shouldShowNodeLabel(_node: TagGraphNode) {
    return true;
  }

  function placeRing(
    positionMap: Map<string, { x: number; y: number }>,
    ringNodes: TagGraphNode[],
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    startAngle = -Math.PI / 2,
    phase = 0,
  ) {
    const count = ringNodes.length;
    if (!count) return;
    ringNodes.forEach((node, index) => {
      const angle = startAngle + (Math.PI * 2 * (index + phase)) / count;
      positionMap.set(node.id, {
        x: centerX + Math.cos(angle) * radiusX,
        y: centerY + Math.sin(angle) * radiusY,
      });
    });
  }

  function getManualPositions() {
    const width = Math.max(containerRef.value?.clientWidth || 900, 520);
    const height = Math.max(containerRef.value?.clientHeight || 420, compact.value ? 320 : 380);
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const positionMap = new Map<string, { x: number; y: number }>();
    const centerNode = props.nodes.find((node) => node.meta?.isCenter) || props.nodes[0];
    const relatedTags = props.nodes
      .filter((node) => node.type === 'tag' && !node.meta?.isCenter)
      .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
    const resourceNodes = props.nodes
      .filter((node) => node.type !== 'tag')
      .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));

    if (centerNode) {
      positionMap.set(centerNode.id, { x: centerX, y: centerY });
    }

    placeRing(
      positionMap,
      relatedTags,
      centerX,
      centerY,
      Math.min(width * 0.24, 260),
      Math.min(height * 0.24, 130),
      -Math.PI / 2,
    );

    const ringCapacity = 10;
    const ringCount = Math.max(1, Math.ceil(resourceNodes.length / ringCapacity));
    for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
      const ringNodes = resourceNodes.slice(ringIndex * ringCapacity, (ringIndex + 1) * ringCapacity);
      const radiusStep = ringIndex * 54;
      placeRing(
        positionMap,
        ringNodes,
        centerX,
        centerY,
        Math.min(width * 0.36, 340 + radiusStep),
        Math.min(height * 0.34, 170 + radiusStep * 0.72),
        -Math.PI / 2 + ringIndex * 0.24,
        0.5,
      );
    }

    // Keep the graph visually centered and avoid bottom clipping.
    const placedNodes = props.nodes
      .map((node) => ({
        node,
        point: positionMap.get(node.id),
      }))
      .filter((item): item is { node: TagGraphNode; point: { x: number; y: number } } => !!item.point);
    if (placedNodes.length) {
      const minY = Math.min(...placedNodes.map(({ node, point }) => point.y - getRenderNodeSize(node) / 2 - 16));
      const maxY = Math.max(...placedNodes.map(({ node, point }) => point.y + getRenderNodeSize(node) / 2 + 30));
      const safeTop = 36;
      const safeBottom = 64;
      const targetMidY = (safeTop + (height - safeBottom)) / 2;
      const currentMidY = (minY + maxY) / 2;
      let shiftY = targetMidY - currentMidY;

      const shiftedMinY = minY + shiftY;
      const shiftedMaxY = maxY + shiftY;
      if (shiftedMinY < safeTop) {
        shiftY += safeTop - shiftedMinY;
      } else if (shiftedMaxY > height - safeBottom) {
        shiftY -= shiftedMaxY - (height - safeBottom);
      }

      if (Math.abs(shiftY) > 0.5) {
        positionMap.forEach((p, id) => {
          positionMap.set(id, { x: p.x, y: p.y + shiftY });
        });
      }
    }

    return { positionMap, centerX, centerY };
  }

  function getNodeLabelPlacement(
    node: TagGraphNode,
    position: { x: number; y: number } | undefined,
    centerX: number,
    centerY: number,
  ) {
    if (node.meta?.isCenter || !position) {
      return { placement: 'bottom', offsetX: 0, offsetY: 10 };
    }
    const dx = position.x - centerX;
    const dy = position.y - centerY;
    if (Math.abs(dx) < 44) {
      const seed = Array.from(node.id).reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
      return seed % 2 === 0
        ? { placement: 'left', offsetX: -12, offsetY: 0 }
        : { placement: 'right', offsetX: 12, offsetY: 0 };
    }
    if (Math.abs(dx) >= Math.abs(dy) * 0.9) {
      return dx >= 0
        ? { placement: 'right', offsetX: 12, offsetY: 0 }
        : { placement: 'left', offsetX: -12, offsetY: 0 };
    }
    return dy >= 0 ? { placement: 'bottom', offsetX: 0, offsetY: 12 } : { placement: 'top', offsetX: 0, offsetY: -12 };
  }

  function getEdgeCurveOffset(edgeId: string) {
    let seed = 0;
    for (let i = 0; i < edgeId.length; i += 1) seed += edgeId.charCodeAt(i);
    const direction = seed % 2 === 0 ? 1 : -1;
    return direction * (8 + (seed % 8));
  }

  function getEdgeShapeType(edge: TagGraphEdge) {
    return edge.type === 'tag-tag' ? 'line' : 'quadratic';
  }

  function getEdgeStyle(edge: TagGraphEdge, active = false, dimmed = false) {
    const baseWidth = Math.max(1, Number(edge.weight || 1));
    const isTagTag = edge.type === 'tag-tag';
    return {
      stroke: getEdgeColor(edge.type),
      lineWidth: dimmed ? 1 : active ? Math.max(isTagTag ? 2 : 1.5, baseWidth) : baseWidth,
      opacity: dimmed ? 0.06 : active ? 0.76 : 0.26,
      lineDash: [],
      curveOffset: isTagTag ? 0 : getEdgeCurveOffset(edge.id),
    };
  }

  function getNodeDataById(nodeId?: string): TagGraphNode | null {
    if (!nodeId) return null;
    try {
      const graphNode = graph?.getNodeData(nodeId) as any;
      return (graphNode?.data || null) as TagGraphNode | null;
    } catch (error) {
      return null;
    }
  }

  function getThemeVar(name: string, fallback: string) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function buildGraphData() {
    const labelFill = getThemeVar('--text-color', '#222222');
    const labelBackgroundFill = getThemeVar('--background-color', '#ffffff');
    const { positionMap, centerX, centerY } = getManualPositions();
    return {
      nodes: props.nodes.map((node) => {
        const position = positionMap.get(node.id);
        const labelPlacement = getNodeLabelPlacement(node, position, centerX, centerY);
        return {
          id: node.id,
          type: 'circle',
          data: node as unknown as Record<string, unknown>,
          style: {
            x: position?.x,
            y: position?.y,
            size: getRenderNodeSize(node),
            fill: GRAPH_NODE_COLOR[node.type],
            stroke: node.meta?.isCenter ? '#ffffff' : 'rgba(255,255,255,0.78)',
            lineWidth: node.meta?.isCenter ? 2.5 : 1.2,
            shadowColor: GRAPH_NODE_COLOR[node.type],
            shadowBlur: node.meta?.isCenter ? 10 : 4,
            labelText: shouldShowNodeLabel(node) ? getNodeLabel(node) : '',
            labelFill,
            labelFontSize: node.meta?.isCenter ? 12 : 10,
            labelFontWeight: node.type === 'tag' ? 600 : 500,
            labelPlacement: labelPlacement.placement,
            labelOffsetY: labelPlacement.offsetY,
            labelOffsetX: labelPlacement.offsetX,
            labelBackground: true,
            labelBackgroundFill,
            labelBackgroundOpacity: 0.8,
            labelBackgroundRadius: 4,
            labelPadding: [2, 6],
          },
        };
      }),
      edges: props.edges.map((edge) => ({
        id: edge.id,
        type: getEdgeShapeType(edge),
        source: edge.source,
        target: edge.target,
        data: edge as unknown as Record<string, unknown>,
        style: getEdgeStyle(edge),
      })),
    };
  }

  async function renderGraph() {
    if (!containerRef.value || props.loading || !props.nodes.length) return;
    if (rendering) {
      pendingRender = true;
      return;
    }
    rendering = true;
    await nextTick();

    try {
      if (!graph) {
        graph = new Graph({
          container: containerRef.value,
          data: buildGraphData(),
          animation: false,
          behaviors: [
            { type: 'drag-canvas' },
            { type: 'zoom-canvas' },
            { type: 'drag-element' },
            { type: 'hover-activate', degree: 1 },
          ],
          zoomRange: [0.12, 2.4],
        } as any);

        graph.on('node:click', (event: any) => {
          const node = getNodeDataById(event?.target?.id);
          if (node) emit('node-click', node);
        });
        graph.on('node:dblclick', (event: any) => {
          const node = getNodeDataById(event?.target?.id);
          if (node) emit('node-dblclick', node);
        });
        graph.on('canvas:click', () => emit('canvas-click'));
        await graph.render();
        syncHighlight();
        return;
      }

      graph.setData(buildGraphData());
      await graph.render();
      syncHighlight();
    } finally {
      rendering = false;
      if (pendingRender) {
        pendingRender = false;
        renderGraph();
      }
    }
  }

  async function syncHighlight() {
    if (!graph || !graph.rendered) return;
    const activeId = props.activeNodeId;
    const nodeUpdates = graph.getNodeData().map((node: any) => {
      const active = !activeId || node.id === activeId || isNeighbor(String(node.id), activeId, props.edges);
      return {
        id: node.id,
        style: {
          opacity: active ? 1 : 0.2,
          labelOpacity: active ? 1 : 0.2,
          labelText: shouldShowNodeLabel(node.data) ? getNodeLabel(node.data) : '',
          labelBackground: true,
          lineWidth: node.id === activeId ? 3 : node?.data?.meta?.isCenter ? 2.5 : 1.2,
        },
      };
    });
    const edgeUpdates = graph.getEdgeData().map((edge: any) => {
      const active = !activeId || edge.source === activeId || edge.target === activeId;
      return {
        id: edge.id,
        style: getEdgeStyle(edge.data, active, !active && !!activeId),
      };
    });
    graph.updateNodeData(nodeUpdates);
    graph.updateEdgeData(edgeUpdates);
    await graph.draw();
  }

  onMounted(async () => {
    await renderGraph();
    resizeObserver = new ResizeObserver(() => {
      graph?.resize();
      renderGraph();
    });
    if (containerRef.value) resizeObserver.observe(containerRef.value);
  });

  onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    graph?.destroy();
    graph = null;
  });

  watch(
    () => [props.nodes, props.edges, props.loading],
    () => renderGraph(),
  );

  watch(
    () => props.activeNodeId,
    () => syncHighlight(),
  );

  watch(
    () => props.compact,
    (value) => {
      compact.value = !!value;
    },
    { immediate: true },
  );

  function resetView() {
    if (!graph) return;
    graph.zoomTo(1);
    graph.translateTo([0, 0]);
  }

  defineExpose({ resetView });
</script>

<style scoped lang="less">
  .tag-graph-canvas {
    position: relative;
    min-height: 460px;
    height: 100%;
    overflow: hidden;
    border-radius: 8px;
    background:
      radial-gradient(
        circle at 20% 15%,
        color-mix(in srgb, var(--resource-tag-color) 8%, transparent),
        transparent 34%
      ),
      radial-gradient(
        circle at 85% 80%,
        color-mix(in srgb, var(--resource-file-color) 6%, transparent),
        transparent 34%
      ),
      linear-gradient(135deg, color-mix(in srgb, var(--background-color) 96%, white), var(--background-color));
  }

  .tag-graph-canvas--compact {
    min-height: 320px;
  }

  .tag-graph-canvas--full {
    min-height: 0;
    height: 100%;
  }

  .tag-graph-canvas::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background-image:
      linear-gradient(color-mix(in srgb, var(--card-border-color) 50%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, var(--card-border-color) 50%, transparent) 1px, transparent 1px);
    background-size: 32px 32px;
    opacity: 0.08;
  }

  .graph-stage {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 100%;
    min-height: 460px;
  }

  .tag-graph-canvas--compact .graph-stage {
    min-height: 320px;
  }

  .tag-graph-canvas--full .graph-stage {
    min-height: 0;
    height: 100%;
  }

  .graph-state {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--desc-color);
    background: color-mix(in srgb, var(--background-color) 58%, transparent);
  }

  .graph-refresh-indicator {
    position: absolute;
    top: 14px;
    right: 16px;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border-radius: 999px;
    border: 1px solid var(--card-border-color);
    background: color-mix(in srgb, var(--background-color) 90%, transparent);
    padding: 5px 10px;
    color: var(--desc-color);
    font-size: 12px;
    backdrop-filter: blur(4px);
  }

  .graph-zoom-hint {
    position: absolute;
    left: 14px;
    bottom: 12px;
    z-index: 3;
    font-size: 11px;
    color: var(--desc-color);
    opacity: 0.7;
    pointer-events: none;
  }

  .graph-actions {
    position: absolute;
    top: 5px;
    right: 5px;
    z-index: 3;
    display: flex;
    gap: 6px;
    pointer-events: auto;

    &.graph-actions--loading {
      opacity: 0.5;
      pointer-events: none;
    }
  }

  .graph-state--empty {
    background: transparent;
  }

  .graph-spinner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, var(--resource-tag-color) 20%, transparent);
    border-top-color: var(--resource-tag-color);
    animation: graph-spin 0.8s linear infinite;
  }

  @keyframes graph-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 767px) {
    .tag-graph-canvas,
    .graph-stage {
      min-height: 380px;
    }
  }
</style>
