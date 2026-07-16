<template>
  <aside class="tag-graph-panel">
    <template v-if="node">
      <div class="panel-kicker">
        <span class="node-dot" :style="{ backgroundColor: nodeColor }"></span>
        {{ node.meta?.isAggregate ? t('tagGraph.panel.resourceOverview') : t(nodeTypeKey) }}
      </div>
      <div class="panel-heading">
        <div class="panel-title" :title="node.label">{{ node.label }}</div>
        <b-button v-if="node.type !== 'tag' && !node.meta?.isAggregate" size="small" @click="emit('open-resource', node)">
          {{ t('tagGraph.panel.open') }}
        </b-button>
      </div>
      <div v-if="node.meta?.description" class="panel-desc">{{ node.meta.description }}</div>

      <div v-if="node.type === 'tag'" class="panel-tag-meta">
        <div class="panel-stat">
          <strong>{{ node.meta?.relatedCount || 0 }}</strong>
          <span>{{ t('tagGraph.panel.relatedCount') }}</span>
        </div>
        <div v-if="node.meta?.sharedCount" class="panel-stat">
          <strong>{{ node.meta.sharedCount }}</strong>
          <span>{{ t('tagGraph.panel.sharedCount') }}</span>
        </div>
      </div>

      <div v-if="node.meta?.url || node.meta?.fileType || node.meta?.fileSize || node.meta?.updateTime" class="panel-meta-list">
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

      <div v-if="node.type === 'tag' && !node.meta?.isCenter" class="panel-actions">
        <b-button type="primary" @click="emit('explore-tag', node)">
          {{ t('tagGraph.panel.explore') }}
        </b-button>
      </div>

      <template v-if="showResourceBrowser">
        <div class="panel-divider"></div>
        <div class="resource-browser-header">
          <div>
            <div class="resource-browser-title">{{ t('tagGraph.panel.linkedContent') }}</div>
            <div class="resource-browser-count">{{ t('tagGraph.panel.resultCount', { count: filteredResources.length }) }}</div>
          </div>
        </div>
        <div v-if="availableTypes.size > 1" class="resource-type-tabs">
          <b-button
            v-for="option in typeOptions"
            :key="option.value"
            size="small"
            :class="{ 'resource-type-tab--active': activeType === option.value }"
            @click="activeType = option.value"
          >
            {{ t(option.labelKey) }}
          </b-button>
        </div>
        <b-input
          v-model:value="keyword"
          clearable
          height="34px"
          :placeholder="t('tagGraph.panel.searchPlaceholder')"
        />
        <div v-if="filteredResources.length" class="resource-list">
          <div
            v-for="item in filteredResources"
            :key="item.id"
            class="resource-item dom-hover"
            @click="emit('open-resource', item)"
          >
            <span class="resource-item-dot" :style="{ background: resourceGroupColors[item.type] }"></span>
            <div class="resource-item-body">
              <div class="resource-item-label text-hidden">{{ item.label }}</div>
              <div class="resource-item-type">{{ t('tagGraph.nodeType.' + item.type) }}</div>
            </div>
            <span class="resource-item-open">{{ t('tagGraph.panel.open') }}</span>
          </div>
        </div>
        <div v-else class="resource-empty">{{ t('tagGraph.panel.noResources') }}</div>
      </template>
    </template>
    <div v-else class="panel-empty">
      <div class="panel-empty-mark"></div>
      <div>{{ t('tagGraph.panel.empty') }}</div>
    </div>
  </aside>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import type { GraphResourceType, TagGraphNode } from '@/api/tagGraph.ts';
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
  const keyword = ref('');
  const activeType = ref<'all' | GraphResourceType>('all');
  const nodeColor = computed(() => (props.node ? GRAPH_NODE_COLOR[props.node.type] : 'var(--primary-color)'));
  const nodeTypeKey = computed(() => (props.node ? GRAPH_NODE_LABEL_KEY[props.node.type] : 'tagGraph.nodeType.tag'));
  const resourceGroupColors: Record<GraphResourceType, string> = {
    bookmark: RESOURCE_COLOR_HEX.bookmark,
    note: RESOURCE_COLOR_HEX.note,
    file: RESOURCE_COLOR_HEX.file,
  };
  const typeOptions = [
    { value: 'all' as const, labelKey: 'tagGraph.panel.all' },
    { value: 'bookmark' as const, labelKey: 'tagGraph.nodeType.bookmark' },
    { value: 'note' as const, labelKey: 'tagGraph.nodeType.note' },
    { value: 'file' as const, labelKey: 'tagGraph.nodeType.file' },
  ];

  const availableTypes = computed(() => new Set((props.connectedResources || []).map((item) => item.type)));
  const showResourceBrowser = computed(
    () => !!props.node && (props.node.type === 'tag' || !!props.node.meta?.isAggregate),
  );
  const filteredResources = computed(() => {
    const normalizedKeyword = keyword.value.trim().toLocaleLowerCase();
    return (props.connectedResources || []).filter((item) => {
      if (activeType.value !== 'all' && item.type !== activeType.value) return false;
      if (!normalizedKeyword) return true;
      return `${item.label} ${item.meta?.description || ''} ${item.meta?.url || ''}`
        .toLocaleLowerCase()
        .includes(normalizedKeyword);
    });
  });

  watch(
    () => props.node?.id,
    () => {
      keyword.value = '';
      activeType.value = props.node?.meta?.isAggregate ? (props.node.type as GraphResourceType) : 'all';
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .tag-graph-panel {
    min-width: 0;
    padding: 22px;
    border-left: 1px solid var(--card-border-color);
    background: linear-gradient(180deg, color-mix(in srgb, var(--background-color) 97%, white), var(--background-color));
    box-sizing: border-box;
    overflow-y: auto;
  }

  .panel-kicker,
  .resource-browser-count,
  .resource-item-type {
    color: var(--desc-color);
    font-size: 12px;
  }

  .panel-kicker {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .node-dot,
  .resource-item-dot {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .panel-heading,
  .resource-browser-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .panel-title {
    min-width: 0;
    color: var(--text-color);
    font-size: 20px;
    font-weight: 700;
    line-height: 1.35;
    word-break: break-word;
  }

  .panel-desc {
    max-height: 92px;
    margin-top: 10px;
    overflow: auto;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.65;
  }

  .panel-tag-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    margin-top: 16px;
  }

  .panel-stat {
    display: grid;
    gap: 2px;
    padding: 10px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--resource-tag-color) 8%, var(--background-color));

    strong { color: var(--text-color); font-size: 18px; }
    span { color: var(--desc-color); font-size: 11px; }
  }

  .panel-meta-list { display: grid; gap: 8px; margin-top: 16px; }
  .panel-meta-item {
    display: grid;
    gap: 3px;
    padding-bottom: 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--card-border-color) 70%, transparent);
    span { color: var(--desc-color); font-size: 11px; }
    strong { min-width: 0; color: var(--text-color); font-size: 12px; }
  }

  .panel-actions { display: flex; margin-top: 16px; }
  .panel-divider { height: 1px; margin: 18px 0; background: var(--card-border-color); opacity: 0.7; }
  .resource-browser-title { color: var(--text-color); font-size: 14px; font-weight: 700; }
  .resource-browser-count { margin-top: 3px; }

  .resource-type-tabs {
    display: flex;
    gap: 6px;
    margin: 12px 0 10px;
    flex-wrap: wrap;
  }

  :deep(.resource-type-tab--active) {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, var(--background-color));
  }

  .resource-list {
    display: grid;
    gap: 4px;
    margin-top: 10px;
  }

  .resource-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 9px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s ease;
    &:hover { background: color-mix(in srgb, var(--card-hover-color) 45%, transparent); }
  }

  .resource-item-body { min-width: 0; flex: 1; }
  .resource-item-label { color: var(--text-color); font-size: 13px; font-weight: 600; }
  .resource-item-open { color: var(--primary-color); font-size: 11px; opacity: 0; transition: opacity 0.15s; }
  .resource-item:hover .resource-item-open { opacity: 1; }

  .resource-empty,
  .panel-empty {
    color: var(--desc-color);
    text-align: center;
  }

  .resource-empty { padding: 28px 8px; font-size: 12px; }
  .panel-empty {
    height: 100%;
    min-height: 300px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .panel-empty-mark {
    width: 42px;
    height: 42px;
    border: 1px solid var(--card-border-color);
    border-radius: 50%;
    background:
      radial-gradient(circle at center, var(--resource-tag-color) 0 4px, transparent 5px),
      radial-gradient(circle at 28% 30%, var(--resource-bookmark-color) 0 3px, transparent 4px),
      radial-gradient(circle at 72% 35%, var(--resource-note-color) 0 3px, transparent 4px),
      radial-gradient(circle at 64% 74%, var(--resource-file-color) 0 3px, transparent 4px);
  }

  @media (max-width: 900px) {
    .tag-graph-panel { border-top: 0; border-left: 0; padding: 16px; }
    .panel-empty { min-height: 140px; }
  }
</style>
