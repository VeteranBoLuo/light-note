<template>
  <b-loading :loading="loading">
    <div class="edit-tag-container">
      <h2>{{ $t('tagManage.title') }}</h2>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 20px">
        <b-input v-model:value="tableSearchValue" class="table-search-input" :placeholder="$t('home.tagSearch')" />
        <b-space>
          <b-button
            config_id="test"
            v-click-log="OPERATION_LOG_MAP.tagMg.addTag"
            type="primary"
            @click="$router.push({ path: `/manage/editTag/add` })"
            >{{ $t('common.add') }}</b-button
          >
          <b-button @click="handleToBack" v-click-log="{ module: '标签管理', operation: `返回` }">{{
            $t('common.back')
          }}</b-button>
        </b-space>
      </div>
      <BTable
        :data="tagList"
        :columns="tagColumns"
        style="margin-top: 15px; width: 90vw"
        :style="{ height: bookmark.screenHeight - 280 + 'px' }"
      >
        <template #bodyCell="{ column, text, record }">
          <template v-if="column.key === 'name'">
            <div style="display: flex; align-items: center; gap: 10px">
              <div class="flex-align-center">
                <svg-icon :src="record.iconUrl" />
              </div>
              <div class="text-hidden">
                {{ text }}
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'relatedTagIds'">
            <div>
              <div style="display: flex; align-items: center; gap: 10px">
                <div :title="tag.name" class="common-tag" v-for="tag in record.relatedTagList" :key="tag.id">
                  {{ tag.name }}
                </div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'bookmarkList'">
            <div class="flex-align-center-gap">
              <span
                :title="b.name"
                class="common-tag dom-hover"
                v-for="b in record.bookmarkList"
                :key="b.id"
                @click="openPage(b.url)"
              >
                {{ b.name }}
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'operation'">
            <div class="edit-tag-operation">
              <svg-icon
                title="编辑"
                :src="icon.table_edit"
                v-click-log="{ module: '标签管理', operation: `点击编辑图标` }"
                size="16"
                @click="edit(record.id)"
                class="dom-hover"
              />
              <svg-icon
                title="删除"
                :src="icon.table_delete"
                size="16"
                @click="handleDeleteTag(record)"
                v-click-log="{ module: '标签管理', operation: `点击删除图标` }"
                class="dom-hover"
              />
            </div>
          </template>
        </template>
      </BTable>
    </div>
  </b-loading>
</template>

<script lang="ts" setup>
  import { bookmarkStore } from '@/store';
  import { computed, ref } from 'vue';
  import { message } from 'ant-design-vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import router from '@/router';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { openPage } from '@/utils/common.ts';
  import { Column } from '@/components/base/BasicComponents/BTable/config.ts';

  const visible = defineModel<boolean>('visible');

  const bookmark = bookmarkStore();
  const loading = ref(false);
  const tagColumns = computed(() => {
    let columns: Column[] = [
      {
        title: '标签',
        key: 'name',
        width: '400px',
      },
      {
        title: '操作',
        key: 'operation',
        width: '100px',
      },
    ];
    if (!bookmark.isMobile) {
      {
        columns.splice(
          1,
          0,
          {
            title: '相关标签',
            key: 'relatedTagIds',
            width: '300px',
          },
          {
            title: '关联书签',
            key: 'bookmarkList',
          },
        );
      }
    }
    return columns;
  });

  const edit = (id: string) => {
    router.push({ path: `/manage/editTag/${id}` });
  };

  function handleDeleteTag(tag) {
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除标签【${tag.name}】？`,
      onOk() {
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

  function handleToBack() {
    if (bookmark.isMobile) {
      router.push('/personCenter');
    } else {
      router.push('/home');
    }
  }
  const tableSearchValue = ref('');
  const tagList = computed(() => {
    if (tableSearchValue.value) {
      return tableData.value.filter((data: any) => {
        return data.name.toLowerCase().includes(tableSearchValue.value.toLowerCase());
      });
    } else {
      return tableData.value;
    }
  });

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
    padding: 0 40px;
    position: absolute;
    top: 20px;
    left: 15px;
    box-sizing: border-box;
  }
  .edit-tag-operation {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .table-search-input {
    width: 30%;
  }
</style>
