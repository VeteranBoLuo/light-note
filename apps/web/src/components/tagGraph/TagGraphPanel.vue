<template>
  <aside class="tag-graph-panel">
    <template v-if="node">
      <div class="panel-kicker">
        <span class="node-dot" :style="{ backgroundColor: nodeColor }"></span>
        {{ t(nodeTypeKey) }}
      </div>
      <div
        class="panel-title"
        :class="{ 'panel-title--clickable': node.type !== 'tag' }"
        :title="node.label"
        @click="node.type !== 'tag' && emit('open-resource', node)"
      >{{ node.label }}</div>
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

      <!-- Connected resources for tag nodes -->
      <template v-if="node.type === 'tag' && connectedResources.length">
        <div class="panel-divider"></div>
        <div class="panel-resources">
          <div
            v-for="group in resourceGroups"
            :key="group.type"
            class="resource-group"
          >
            <div class="resource-group-header" :style="{ color: group.color }">
              <span class="resource-group-dot" :style="{ background: group.color }"></span>
              {{ t('tagGraph.nodeType.' + group.type) }}
              <span class="resource-group-count">{{ group.items.length }}</span>
            </div>
            <div class="resource-group-list">
              <div
                v-for="item in group.items"
                :key="item.id"
                class="resource-item dom-hover"
                @click="emit('open-resource', item)"
              >
                <span v-if="item.meta?.iconUrl" class="resource-item-icon">
                  <img :src="item.meta.iconUrl" alt="" @error="($event.target as HTMLImageElement).style.display = 'none'" />
                </span>
                <span class="resource-item-label text-hidden">{{ item.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
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
  import { RESOURCE_COLOR_HEX } from '@/config/resourceColor.ts';

  const props = defineProps<{
    node: TagGraphNode | null;
    connectedResources?: TagGraphNode[];
  }>();

  const emit = defineEmits<{
    (e: 'explore-tag', node: TagGraphNode): void;
    (e: 'open-resource', node: TagGraphNode): void;
  }>();

  const { t } = useI18n();
  const nodeColor = computed(() => (props.node ? GRAPH_NODE_COLOR[props.node.type] : 'var(--primary-color)'));
  const nodeTypeKey = computed(() => (props.node ? GRAPH_NODE_LABEL_KEY[props.node.type] : 'tagGraph.nodeType.tag'));

  const resourceTypeOrder = ['bookmark', 'note', 'file'] as const;
  const resourceGroupColors: Record<string, string> = {
    bookmark: RESOURCE_COLOR_HEX.bookmark,
    note: RESOURCE_COLOR_HEX.note,
    file: RESOURCE_COLOR_HEX.file,
  };

  const resourceGroups = computed(() => {
    const items = props.connectedResources || [];
    return resourceTypeOrder
      .map((type) => ({
        type,
        color: resourceGroupColors[type],
        items: items.filter((n) => n.type === type),
      }))
      .filter((group) => group.items.length > 0);
  });
</script>

<style scoped lang="less">
  .tag-graph-panel {
    min-width: 0;
    border-left: 1px solid var(--card-border-color);
    padding: 22px;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--background-color) 97%, white), var(--background-color));
    box-sizing: border-box;
    overflow-y: auto;
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

    &.panel-title--clickable {
      cursor: pointer;
      transition: color 0.15s;
      color: var(--primary-color);

      &:hover {
        opacity: 0.8;
      }
    }
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

  .panel-divider {
    height: 1px;
    margin: 20px 0 18px;
    background: var(--card-border-color);
    opacity: 0.5;
  }

  .panel-resources {
    display: grid;
    gap: 16px;
  }

  .resource-group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    margin-bottom: 8px;
  }

  .resource-group-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .resource-group-count {
    font-size: 11px;
    font-weight: 400;
    opacity: 0.7;
    margin-left: auto;
  }

  .resource-group-list {
    display: grid;
    gap: 2px;
  }

  .resource-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-color);
    cursor: pointer;
    transition: background 0.15s;

    &:hover {
      background: color-mix(in srgb, var(--card-hover-color) 40%, transparent);
    }
  }

  .resource-item-icon {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    border-radius: 3px;
    overflow: hidden;

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }

  .resource-item-label {
    min-width: 0;
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
