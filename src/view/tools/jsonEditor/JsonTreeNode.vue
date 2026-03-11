<template>
  <RightMenu :menu="contextMenu" @select="handleMenuSelect">
    <div class="tree-node">
      <div
        class="tree-row"
        :class="{ branch: isBranch, leaf: !isBranch }"
        :style="{ paddingLeft: `${Math.max(level, 0) * 14 + 10}px` }"
        @click="handleToggle"
      >
        <span class="caret" v-if="isBranch">{{ isCollapsed ? '▸' : '▾' }}</span>
        <span class="caret placeholder" v-else></span>
        <span class="node-key">{{ showKey }}</span>
        <span class="node-colon">:</span>
        <span class="node-value" :class="`type-${node.type}`">{{ node.preview }}</span>
      </div>

      <div v-if="isBranch && !isCollapsed" class="children">
        <JsonTreeNode
          v-for="child in node.children"
          :key="child.path"
          :node="child"
          :level="level + 1"
          :collapsed-map="collapsedMap"
          @toggle="emit('toggle', $event)"
          @remove="emit('remove', $event)"
        />
      </div>
    </div>
  </RightMenu>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import RightMenu from '@/components/base/RightMenu.vue';

  defineOptions({ name: 'JsonTreeNode' });

  type JsonTreeNodeData = {
    keyLabel: string;
    path: string;
    type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
    preview: string;
    value?: unknown;
    children?: JsonTreeNodeData[];
  };

  const props = defineProps<{
    node: JsonTreeNodeData;
    level: number;
    collapsedMap: Record<string, boolean>;
  }>();

  const emit = defineEmits<{
    toggle: [path: string];
    remove: [path: string];
  }>();

  const isBranch = computed(() => props.node.type === 'object' || props.node.type === 'array');
  const isCollapsed = computed(() => !!props.collapsedMap[props.node.path]);
  const showKey = computed(() => (props.node.keyLabel ? props.node.keyLabel : 'root'));
  const contextMenu = computed(() => ['复制此节点', '删除此节点']);

  const handleToggle = () => {
    if (!isBranch.value) return;
    emit('toggle', props.node.path);
  };

  const handleMenuSelect = async (action: string) => {
    if (action === '复制此节点') {
      try {
        const jsonStr = JSON.stringify(props.node.value, null, 2) ?? 'undefined';
        await navigator.clipboard.writeText(jsonStr);
      } catch (error) {
        console.error('复制失败:', error);
      }
      return;
    }

    if (action === '删除此节点') {
      emit('remove', props.node.path);
    }
  };
</script>

<style scoped lang="less">
  .tree-node {
    user-select: none;
  }

  .tree-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    border-radius: 8px;
    color: var(--text-color);
    transition: background-color 0.18s ease;

    &.branch {
      cursor: pointer;
    }

    &.branch:hover {
      background: color-mix(in srgb, var(--menu-item-h-bg-color) 85%, transparent);
    }

    &.leaf {
      cursor: default;
    }
  }

  .caret {
    width: 14px;
    text-align: center;
    color: var(--text-secondary-color);
    flex-shrink: 0;

    &.placeholder {
      font-size: 10px;
      opacity: 0.65;
    }
  }

  .node-key {
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    color: var(--text-color);
    font-size: 12px;
    opacity: 0.95;
  }

  .node-colon {
    color: var(--text-secondary-color);
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  }

  .node-value {
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    font-size: 12px;
    opacity: 0.92;

    &.type-object,
    &.type-array {
      color: #2f7cf6;
    }

    &.type-string {
      color: #16a34a;
    }

    &.type-number {
      color: #ea580c;
    }

    &.type-boolean {
      color: #7c3aed;
    }

    &.type-null {
      color: #64748b;
      font-style: italic;
    }
  }
</style>
