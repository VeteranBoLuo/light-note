<template>
  <div class="tools-container">
    <div class="menu-body">
      <BList style="font-size: 12px" :listOptions="toolOptions" @nodeClick="handleNodeClick" :check-id="checkId">
        <template #icon="{ item }">
          <svg-icon :src="(item as any).icon" />
        </template>
      </BList>
    </div>
    <div class="tools-view-panel">
      <RouterView />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref, watch } from 'vue';
  import { useRoute } from 'vue-router';
  import router from '@/router';
  import icon from '@/config/icon.ts';
  import BList from '@/components/base/BasicComponents/BList.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

  const route = useRoute();
  const checkId = ref('jsonEditor');

  const toolOptions = ref([
    {
      id: 'jsonEditor',
      title: 'JSON编辑器',
      icon: icon.userCenter.sql,
    },
    {
      id: 'base64',
      title: 'Base64编解码',
      icon: icon.userCenter.operationLog,
    },
  ]);

  const handleNodeClick = (menu: { id: string }) => {
    router.push(`/tools/${menu.id}`);
  };

  const syncCheckId = () => {
    const currentId = route.path.split('/').pop() || 'jsonEditor';
    const exists = toolOptions.value.some((item) => item.id === currentId);
    checkId.value = exists ? currentId : 'jsonEditor';
  };

  onMounted(() => {
    syncCheckId();
  });

  watch(
    () => route.path,
    () => {
      syncCheckId();
    },
  );
</script>

<style lang="less" scoped>
  .tools-container {
    display: flex;
    gap: 10px;
    padding: 20px;
    box-sizing: border-box;
  }

  .menu-body {
    width: 220px;
  }

  .tools-view-panel {
    width: calc(100% - 230px);
  }

  @media (max-width: 1120px) {
    .tools-container {
      flex-direction: column;
    }

    .menu-body,
    .tools-view-panel {
      width: 100%;
    }
  }
</style>
