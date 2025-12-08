<template>
  <a-tree :tree-data="treeData" @select="select" blockNode class="bl-tree">
    <template #title="{ title, key, level }">
      <div
        class="tree-node"
        :style="{
          backgroundColor: key === currentKey ? '#f7f7f7' : '',
        }"
      >
        <span v-if="key === currentKey" style="color: #1890ff">{{ title }}</span>
        <template v-else>{{ title }}</template>
      </div>
    </template>
  </a-tree>
</template>
<script lang="ts" setup>
  import { onMounted, ref, watch } from 'vue';

  const props = defineProps<{ treeData: any }>();

  const currentKey = ref('');

  function select(e) {
    if (e[0]) {
      currentKey.value = e[0];
    }
  }

  function setNodeLevels(treeData: any, initialLevel = 0) {
    if (!treeData) {
      return;
    }
    // 遍历树数据
    treeData.forEach((node: any) => {
      // 设置当前节点的level
      node.level = initialLevel;
      // 如果当前节点有子节点，递归设置子节点的level
      if (node.children && node.children.length > 0) {
        setNodeLevels(node.children, initialLevel + 1);
      }
    });
  }

  onMounted(() => {
    setNodeLevels(props.treeData);
  });

  watch(
    () => props.treeData,
    () => {
      setNodeLevels(props.treeData);
    },
    {
      deep: true,
      immediate: true,
    },
  );
</script>
<style lang="less">
  .bl-tree {
    .tree-node {
      position: relative;
      z-index: auto;
      min-height: 32px;
      display: flex;
      align-items: center;
      margin: 0;
      box-sizing: border-box;
      color: inherit;
      line-height: 24px;
      cursor: pointer;
      &:active {
        background-color: #f7f7f7;
      }
      &:hover {
        background-color: #f7f7f7;
      }
    }

    .ant-tree-node-content-wrapper {
      padding: 0 !important;
      background-color: unset !important;
    }
    .ant-tree-switcher {
      align-self: center !important;
    }
    .ant-tree-treenode-selected {
      background-color: #f7f7f7;
    }
    .ant-tree-treenode {
      &:hover {
        background-color: #f7f7f7;
      }
    }
  }
</style>
