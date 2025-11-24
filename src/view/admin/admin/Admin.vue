<template>
  <div class="admin-container">
    <div class="menu-body">
      <BList style="font-size: 12px" :listOptions="viewOptions" @nodeClick="nodeClick" :check-id="checkId">
        <template #icon="{ item }">
          <svg-icon :src="(item as any).icon" />
        </template>
      </BList>
    </div>
    <div class="admin-view-panel">
      <RouterView />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import BList from '@/components/base/BasicComponents/BList.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { onMounted, ref } from 'vue';
  import router from '@/router';
  import { bookmarkStore } from '@/store';

  const checkId = ref('operationLog');
  const bookmark = bookmarkStore();
  const viewOptions = ref([
    {
      id: 'operationLog',
      title: '操作日志',
      icon: icon.userCenter.operationLog,
    },
    {
      id: 'apiLog',
      title: 'api日志',
      icon: icon.userCenter.log,
    },
    {
      id: 'attackLog',
      title: '攻击日志',
      icon: icon.userCenter.log,
    },
    {
      id: 'userMg',
      title: '用户管理',
      icon: icon.navigation.user,
    },
    {
      id: 'userOpinion',
      title: '用户反馈',
      icon: icon.userCenter.operationLog,
    },
    {
      id: 'imageMg',
      title: '图片管理',
      icon: icon.userCenter.imgMg,
    },
    {
      id: 'simpleSql',
      title: 'simpleSql',
      icon: icon.userCenter.sql,
    },
  ]);

  function nodeClick(menu: any) {
    router.push('/admin/' + menu.id);
  }
  onMounted(() => {
    checkId.value = router.currentRoute.value.fullPath.split('/').pop();
  });
</script>

<style lang="less" scoped>
  .admin-container {
    display: flex;
    gap: 10px;
    padding: 20px;
    box-sizing: border-box;
  }
  .menu-body {
    width: 200px;
  }
  .admin-view-panel {
    width: calc(100% - 210px);
  }

  .person-menu {
    border-radius: 12px;
    overflow: hidden;
    margin-top: 20px;
  }

  .person-menu-item {
    background-color: var(--phone-menu-item-bg-color);
    height: 50px;
    display: flex;
    align-items: center;
    padding: 0 20px;
    justify-content: space-between;
    cursor: pointer;

    .person-menu-item-title {
    }

    .person-menu-item-des {
      color: #999fa8;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 5px;
      line-height: 100%;
    }
  }
</style>
