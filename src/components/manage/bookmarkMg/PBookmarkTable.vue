<template>
  <PhoneListMg
    :loading="loading"
    :list-data="tableData"
    :title="$t('bookmarkMg.title')"
    @add="router.push('/manage/editBookmark/add')"
  >
    <template #item="{ data }">
      <div style="display: flex; align-items: center; gap: 10px">
        <div class="card-img-container">
          <img v-if="data.iconUrl" :src="data.iconUrl" height="20" width="20" @error="onErrorImg" alt="" />
        </div>
        {{ data.name }}
      </div>
      <div class="edit-tag-operation">
        <svg-icon
          title="编辑"
          :src="icon.table_edit"
          size="16"
          @click="edit(data.id)"
          v-click-log="{ module: '书签管理', operation: `点击编辑图标` }"
          class="dom-hover"
        />
        <svg-icon
          title="删除"
          :src="icon.table_delete"
          size="16"
          @click="handleDeleteTag(data)"
          v-click-log="{ module: '书签管理', operation: `点击删除图标` }"
          class="dom-hover"
        />
      </div>
    </template>
  </PhoneListMg>
</template>

<script lang="ts" setup>
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed, ref } from 'vue';
  import { message } from 'ant-design-vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import router from '@/router';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';

  const visible = defineModel<boolean>('visible');
  const user = useUserStore();

  const bookmark = bookmarkStore();
  const loading = ref(false);
  computed(() => {
    let columns = [
      {
        title: '书签',
        dataIndex: 'name',
        ellipsis: true,
      },
      {
        title: '操作',
        dataIndex: 'operation',
        ellipsis: true,
        width: 100,
      },
    ];
    if (!bookmark.isMobileDevice) {
      {
        columns.splice(1, 0, {
          title: '关联标签',
          dataIndex: 'tagList',
          ellipsis: true,
        });
      }
    }
    return columns;
  });
  const edit = (id: string) => {
    router.push({ path: `/manage/editBookmark/${id}` });
  };

  function handleDeleteTag(bookmark) {
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除标签【${bookmark.name}】？`,
      onOk() {
        recordOperation({ module: '书签管理', operation: `删除书签【${bookmark.name}】` });
        apiBasePost('/api/bookmark/delBookmark', {
          id: bookmark.id,
        }).then((res) => {
          if (res.status == 200) {
            message.success('删除成功');
            init();
          }
        });
      },
    });
  }

  const tableSearchValue = ref('');
  const bookmarkList = computed(() => {
    if (tableSearchValue.value) {
      return tableData.value.filter((data: any) => {
        return data.name.toLowerCase().includes(tableSearchValue.value.toLowerCase());
      });
    } else {
      return tableData.value;
    }
  });

  import * as XLSX from 'xlsx';
  import { cloneDeep } from 'lodash-es';
  import PhoneListMg from '@/components/base/phoneComponents/PhoneListMg.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  function exportBookmark() {
    // 随便声明一个结果
    const exportData = bookmarkList.value?.map((item: any) => {
      return {
        标签名: item.name,
        网址: item.url,
        描述: item?.description,
        关联书签: item?.tagList?.map((tag) => tag.name).join(','),
      };
    });
    // 创建一个新的工作簿
    const workbook = XLSX.utils.book_new();
    // 创建一个新的工作表
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    // 获取第一列和第二列的最大字符长度
    const maxLen = [
      Math.max(...exportData.map((item) => item.标签名.length)),
      Math.max(...exportData.map((item) => item.网址.length)),
      Math.max(...exportData.map((item) => item.描述?.length)),
    ];

    worksheet['!cols'] = [{ wch: maxLen[0] }, { wch: maxLen[1] }, { wch: 50 }, { wch: 20 }];
    // 将工作表附加到工作簿，并将工作表命名为students
    XLSX.utils.book_append_sheet(workbook, worksheet, 'bookmark');
    // 导出工作簿，并命名导出文件名为Presidents.xlsx
    XLSX.writeFile(workbook, '书签集合.xlsx');
  }

  function getIcon(bookmark) {
    if (bookmark.iconUrl) {
      return bookmark.iconUrl;
    } else {
      return 'https://icon.bqb.cool?url=' + bookmark.url;
    }
  }

  function onErrorImg(event) {
    event.target.src =
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIwLjhlbSIgaGVpZ2h0PSIwLjhlbSIgdmlld0JveD0iMCAwIDIwIDIwIj48cGF0aCBmaWxsPSIjNWI1YjViIiBkPSJNMTAgMjBhMTAgMTAgMCAxIDEgMC0yMGExMCAxMCAwIDAgMSAwIDIwbTcuNzUtOGE4IDggMCAwIDAgMC00aC0zLjgyYTI5IDI5IDAgMCAxIDAgNHptLS44MiAyaC0zLjIyYTE0LjQgMTQuNCAwIDAgMS0uOTUgMy41MUE4LjAzIDguMDMgMCAwIDAgMTYuOTMgMTRtLTguODUtMmgzLjg0YTI0LjYgMjQuNiAwIDAgMCAwLTRIOC4wOGEyNC42IDI0LjYgMCAwIDAgMCA0bS4yNSAyYy40MSAyLjQgMS4xMyA0IDEuNjcgNHMxLjI2LTEuNiAxLjY3LTR6bS02LjA4LTJoMy44MmEyOSAyOSAwIDAgMSAwLTRIMi4yNWE4IDggMCAwIDAgMCA0bS44MiAyYTguMDMgOC4wMyAwIDAgMCA0LjE3IDMuNTFjLS40Mi0uOTYtLjc0LTIuMTYtLjk1LTMuNTF6bTEzLjg2LThhOC4wMyA4LjAzIDAgMCAwLTQuMTctMy41MWMuNDIuOTYuNzQgMi4xNi45NSAzLjUxem0tOC42IDBoMy4zNGMtLjQxLTIuNC0xLjEzLTQtMS42Ny00UzguNzQgMy42IDguMzMgNk0zLjA3IDZoMy4yMmMuMi0xLjM1LjUzLTIuNTUuOTUtMy41MUE4LjAzIDguMDMgMCAwIDAgMy4wNyA2Ii8+PC9zdmc+';
  }

  init();
  const tableData = ref([{}]);
  async function init() {
    loading.value = true;
    const allRes = await apiQueryPost('/api/bookmark/getBookmarkList', {
      filters: {
        userId: localStorage.getItem('userId'),
        type: 'all',
      },
    });
    if (allRes.status === 200) {
      tableData.value = cloneDeep(allRes.data.items);
      tableData.value.forEach((bookmark: any) => {
        bookmark.iconUrl = getIcon(bookmark);
      });
      loading.value = false;
      // 缓存图片
      await apiBasePost(
        '/api/common/analyzeImgUrl',
        allRes.data.items?.map((data: any) => {
          return {
            url: data.url,
            id: data.id,
            noCache: !data.iconUrl,
          };
        }),
      );
    }
  }
</script>

<style lang="less" scoped>
  .edit-tag-container {
    height: 100%;
    box-sizing: border-box;
    padding: 0 40px;
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
  .card-img-container {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem;
    background-color: rgb(255, 255, 255);
    border-radius: 0.5rem;
    flex-shrink: 0;
  }
</style>
