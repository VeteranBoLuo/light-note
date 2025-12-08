<template xmlns="">
  <b-loading :loading="loading">
    <div class="edit-tag-container">
      <h2>{{ $t('bookmarkMg.title') }}</h2>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 20px">
        <b-input v-model:value="tableSearchValue" class="table-search-input" :placeholder="$t('bookmarkMg.bookmarkSearch')" />
        <b-space :size="10">
          <b-button type="success" @click="exportBookmark" v-click-log="OPERATION_LOG_MAP.bookmarkMg.exportToExcel">{{
            $t('common.export')
          }}</b-button>
          <!-- 新增导入按钮 -->
          <b-button type="success" @click="handleImport" v-click-log="{ module: '书签管理', operation: '导入' }">{{
            $t('common.import')
          }}</b-button>
          <b-button
            type="primary"
            @click="$router.push({ path: `/manage/editBookmark/add` })"
            v-click-log="OPERATION_LOG_MAP.bookmarkMg.toAddBtn"
            >{{ $t('common.add') }}</b-button
          >
          <b-button @click="handleToBack" v-click-log="{ module: '书签管理', operation: `返回` }">{{
            $t('common.back')
          }}</b-button>
        </b-space>
      </div>
      <BTable
        :data="bookmarkList"
        :columns="tagColumns"
        style="margin-top: 10px; width: 90vw"
        :style="{ height: bookmark.screenHeight - 300 + 'px' }"
        ><template #bodyCell="{ column, text, record }">
          <template v-if="column.key === 'name'">
            <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">
              <div style="display: flex; align-items: center; gap: 10px" :title="text">
                <div class="card-img-container">
                  <img v-if="record.iconUrl" :src="record.iconUrl" height="20" width="20" @error="onErrorImg" alt="" />
                </div>
                <div class="text-hidden">
                  {{ text }}
                </div>
              </div>
            </div>
          </template>
          <template v-else-if="column.key === 'tagList'">
            <div class="flex-align-center-gap">
              <span :title="t.name" class="common-tag" v-for="t in record.tagList" :key="t.id">
                {{ t.name }}
              </span>
            </div>
          </template>
          <template v-else-if="column.key === 'url'">
            <div class="text-hidden">
              <a :href="text" target="_blank">{{ text }}</a>
            </div>
          </template>
          <template v-else-if="column.key === 'operation'">
            <div class="edit-tag-operation">
              <svg-icon
                title="编辑"
                :src="icon.table_edit"
                size="16"
                @click="edit(record.id)"
                v-click-log="{ module: '书签管理', operation: `点击编辑图标` }"
                class="dom-hover"
              />
              <svg-icon
                title="删除"
                :src="icon.table_delete"
                size="16"
                @click="handleDeleteTag(record)"
                v-click-log="{ module: '书签管理', operation: `点击删除图标` }"
                class="dom-hover"
              />
            </div>
          </template> </template
      ></BTable>
      <!-- 隐藏的文件输入框 -->
      <input type="file" ref="importFileInput" accept=".xlsx" style="display: none" @change="handleFileChange" />
    </div>
  </b-loading>
</template>

<script lang="ts" setup>
  import { bookmarkStore, useUserStore } from '@/store';
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

  const visible = defineModel<boolean>('visible');
  const user = useUserStore();

  const bookmark = bookmarkStore();
  const loading = ref(false);
  const tagColumns = ref([
    {
      title: '书签',
      key: 'name',
      width: '400px',
    },
    {
      title: '网址',
      key: 'url',
    },
    {
      title: '关联标签',
      key: 'tagList',
      width: '300px',
    },
    {
      title: '操作',
      key: 'operation',
      width: '100px',
    },
  ]);

  const edit = (id: string) => {
    router.push({ path: `/manage/editBookmark/${id}` });
  };

  function handleDeleteTag(bookmark) {
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除书签【${bookmark.name}】？`,
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

  function handleToBack() {
    if (bookmark.isMobileDevice) {
      router.push('/personCenter');
    } else {
      router.push('/home');
    }
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
  import { recordOperation } from '@/api/commonApi.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  function exportBookmark() {
    // 随便声明一个结果
    const exportData = bookmarkList.value?.map((item: any) => {
      return {
        书签名: item.name,
        网址: item.url,
        描述: item?.description,
      };
    });
    // 创建一个新的工作簿
    const workbook = XLSX.utils.book_new();
    // 创建一个新的工作表
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    // 获取第一列和第二列的最大字符长度
    const maxLen = [
      Math.max(...exportData.map((item) => item.书签名.length)),
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

  // 新增导入功能
  const importFileInput = ref<HTMLInputElement | null>(null);
  const handleImport = () => {
    importFileInput.value?.click();
  };

  const handleFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const data = new Uint8Array(event.target.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        // 验证必需列
        const requiredColumns = ['书签名', '网址', '描述'];
        const hasRequired = requiredColumns.every(
          (col) => jsonData.length > 0 && Object.keys(jsonData[0]).includes(col),
        );

        if (!hasRequired) {
          message.error('导入文件格式不正确，请确保包含书签名、网址、描述列');
          return;
        }

        // 构造书签数据
        const bookmarksToImport = jsonData.map((item) => ({
          name: item['书签名'].trim(),
          url: item['网址'].trim(),
          description: item['描述']?.trim() || '',
        }));

        // 逐个导入
        let successCount = 0;
        let failedCount = 0;
        const failedItems = [];

        const requests = bookmarksToImport.map((bookmark) => apiBasePost('/api/bookmark/addBookmark', bookmark));

        const results = await Promise.allSettled(requests);
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.status === 200) {
            successCount++;
          } else {
            failedCount++;
            failedItems.push({
              name: bookmarksToImport[index].name,
              url: bookmarksToImport[index].url,
              error: result.value.msg,
            });
          }
        });

        // 重新加载数据
        await init();
        // 显示结果
        if (failedCount > 0) {
          const errorText = failedItems
            .map((item) => `${item.name} (${item.url}): <span style="color: #ff5722">${item.error}</span>`)
            .join('<br/>');

          Alert.alert({
            title: `导入完成 (${successCount}成功/${failedCount}失败)`,
            content: errorText,
            okText: '复制错误信息',
            onOk() {
              navigator.clipboard.writeText(failedItems.map((f) => `${f.name} (${f.url}): ${f.error}`).join('\n'));
              message.success('错误信息已复制到剪贴板');
            },
          });
        } else {
          message.success(`导入成功！共导入 ${successCount} 个书签`);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      message.error('文件处理失败: ' + err.message);
      console.error('导入错误:', err);
    } finally {
      target.value = '';
    }
  };

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
    padding: 0 40px;
    position: absolute;
    top: 20px;
    left: 15px;
  }
  .edit-tag-operation {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .table-search-input {
    width: 30%;
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
  @media (max-width: 1000px) {
    .edit-tag-container {
      padding: 0 20px;
    }
    .table-search-input {
      width: calc(100% - 145px);
    }
  }
</style>
