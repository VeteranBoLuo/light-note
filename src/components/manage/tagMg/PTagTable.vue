<template>
  <PhoneListMg
    :loading="loading"
    :list-data="tableData"
    :title="$t('tagManage.title')"
    @add="router.push('/manage/editTag/add')"
  >
    <template #item="{ data }">
      <svg-icon :src="data.iconUrl" />
      <span>{{ data['name'] }}</span>
      <div class="edit-tag-operation">
        <svg-icon
          title="编辑"
          :src="icon.table_edit"
          v-click-log="{ module: '标签管理', operation: `点击编辑图标` }"
          size="16"
          @click="edit(data.id)"
          class="dom-hover"
        />
        <svg-icon
          title="删除"
          :src="icon.table_delete"
          size="16"
          @click="handleDeleteTag(data)"
          v-click-log="{ module: '标签管理', operation: `点击删除图标` }"
          class="dom-hover"
        />
      </div>
    </template>
  </PhoneListMg>
</template>

<script lang="ts" setup>
  import { bookmarkStore } from '@/store';
  import { ref } from 'vue';
  import { message } from 'ant-design-vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import router from '@/router';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import PhoneListMg from '@/components/base/phoneComponents/PhoneListMg.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { recordOperation } from '@/api/commonApi.ts';

  const visible = defineModel<boolean>('visible');

  const bookmark = bookmarkStore();
  const loading = ref(false);

  const edit = (id: string) => {
    router.push({ path: `/manage/editTag/${id}` });
  };

  function handleDeleteTag(tag) {
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除标签【${tag.name}】？`,
      onOk() {
        recordOperation({ module: '标签管理', operation: `删除标签【${tag.name}】` });
        apiBasePost('/api/bookmark/delTag', {
          id: tag.id,
        }).then((res) => {
          if (res.status == 200) {
            message.success('删除成功');
            init();
          }
        });
      },
    });
  }

  init();
  const tableData = ref([{}]);
  function init() {
    loading.value = true;
    apiQueryPost('/api/bookmark/queryTagList', {
      filters: {
        userId: localStorage.getItem('userId'),
      },
    })
      .then((res) => {
        if (res.status === 200) {
          tableData.value = res.data;
        }
      })
      .finally(() => {
        loading.value = false;
      });
  }
</script>

<style lang="less" scoped>
  .edit-tag-container {
    height: 100%;
    box-sizing: border-box;
  }
  .edit-tag-operation {
    position: absolute;
    right: 20px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .table-search-input {
    width: 100%;
  }
  .tag-body {
    margin-top: 10px;
    height: calc(100% - 92px);
    overflow: auto;
    border-radius: 8px;
  }
  .tag-item {
    position: relative;
    gap: 10px;
    height: 44px;
    padding-left: 10px;
    border-bottom: 1px solid var(--phone-menu-item-border-color);
  }
</style>
