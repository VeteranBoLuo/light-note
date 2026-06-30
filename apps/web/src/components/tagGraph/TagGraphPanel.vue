<template>
  <aside class="tag-graph-panel">
    <template v-if="node">
      <div class="panel-kicker">
        <span class="node-dot" :style="{ backgroundColor: nodeColor }"></span>
        {{ t(nodeTypeKey) }}
      </div>
      <div class="panel-title" :title="node.label">{{ node.label }}</div>
      <div v-if="node.meta?.description" class="panel-desc">{{ node.meta.description }}</div>

      <div class="panel-meta-list">
        <div v-if="node.type === 'tag'" class="panel-meta-item">
          <span>{{ t('tagGraph.panel.relatedCount') }}</span>
          <strong>{{ node.meta?.relatedCount || 0 }}</strong>
        </div>
        <div v-if="node.meta?.url" class="panel-meta-item">
          <span>{{ t('tagGraph.panel.url') }}</span>
          <strong class="text-hidden" :title="node.meta.url">{{ node.meta.url }}</strong>
        </div>
        <div v-if="node.meta?.fileType" class="panel-meta-item">
          <span>{{ t('tagGraph.panel.fileType') }}</span>
          <strong>{{ node.meta.fileType }}</strong>
        </div>
        <div v-if="node.meta?.fileSize" class="panel-meta-item">
          <span>{{ t('tagGraph.panel.fileSize') }}</span>
          <strong>{{ formatGraphFileSize(node.meta.fileSize) }}</strong>
        </div>
        <div v-if="node.meta?.updateTime" class="panel-meta-item">
          <span>{{ t('tagGraph.panel.updateTime') }}</span>
          <strong>{{ node.meta.updateTime }}</strong>
        </div>
      </div>

      <div class="panel-actions">
        <b-button v-if="node.type === 'tag'" type="primary" @click="emit('explore-tag', node)">
          {{ t('tagGraph.panel.explore') }}
        </b-button>
      </div>
    </template>
    <div v-else class="panel-empty">
      <div class="panel-empty-mark"></div>
      <div>{{ t('tagGraph.panel.empty') }}</div>
    </div>
  </aside>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import type { TagGraphNode } from '@/api/tagGraph.ts';
  import { formatGraphFileSize, GRAPH_NODE_COLOR, GRAPH_NODE_LABEL_KEY } from './shared.ts';

  const props = defineProps<{
    node: TagGraphNode | null;
  }>();

  const emit = defineEmits<{
    (e: 'explore-tag', node: TagGraphNode): void;
  }>();

  const { t } = useI18n();
  const nodeColor = computed(() => (props.node ? GRAPH_NODE_COLOR[props.node.type] : 'var(--primary-color)'));
  const nodeTypeKey = computed(() => (props.node ? GRAPH_NODE_LABEL_KEY[props.node.type] : 'tagGraph.nodeType.tag'));
</script>

<style scoped lang="less">
  .tag-graph-panel {
    min-width: 0;
    min-height: 460px;
    border-left: 1px solid var(--card-border-color);
    padding: 22px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--background-color) 97%, white), var(--background-color));
    box-sizing: border-box;
  }

  .panel-kicker {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-size: 12px;
    color: var(--desc-color);
  }

  .node-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    box-shadow: 0 0 6px currentColor;
  }

  .panel-title {
    font-size: 20px;
    line-height: 1.35;
    font-weight: 700;
    color: var(--text-color);
    word-break: break-word;
  }

  .panel-desc {
    margin-top: 12px;
    color: var(--desc-color);
    line-height: 1.7;
    font-size: 13px;
    max-height: 110px;
    overflow: auto;
  }

  .panel-meta-list {
    display: grid;
    gap: 10px;
    margin-top: 18px;
  }

  .panel-meta-item {
    display: grid;
    gap: 4px;
    padding: 10px 0;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 70%, transparent);

    span {
      font-size: 12px;
      color: var(--desc-color);
    }

    strong {
      min-width: 0;
      font-size: 13px;
      color: var(--text-color);
      font-weight: 600;
    }
  }

  .panel-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 22px;
  }

  .panel-empty {
    height: 100%;
    min-height: 420px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--desc-color);
    text-align: center;
  }

  .panel-empty-mark {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 1px solid var(--card-border-color);
    background:
      radial-gradient(circle at center, var(--resource-tag-color) 0 4px, transparent 5px),
      radial-gradient(circle at 28% 30%, var(--resource-bookmark-color) 0 3px, transparent 4px),
      radial-gradient(circle at 72% 35%, var(--resource-note-color) 0 3px, transparent 4px),
      radial-gradient(circle at 64% 74%, var(--resource-file-color) 0 3px, transparent 4px);
    opacity: 0.85;
  }

  @media (max-width: 900px) {
    .tag-graph-panel {
      min-height: 0;
      border-left: 0;
      border-top: 1px solid var(--card-border-color);
    }

    .panel-empty {
      min-height: 140px;
    }
  }
</style>
