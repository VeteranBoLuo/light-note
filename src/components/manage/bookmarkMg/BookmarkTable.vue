<template xmlns="">
  <b-loading :loading="loading">
    <div class="edit-tag-container">
      <h2>{{ $t('bookmarkMg.title') }}</h2>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 20px">
        <b-input
          v-model:value="tableSearchValue"
          class="table-search-input"
          :placeholder="$t('bookmarkMg.bookmarkSearch')"
        />
        <b-space :size="10">
          <b-button
            v-if="selectedRows.length > 0"
            type="danger"
            @click="handleBatchDelete"
            v-click-log="{ module: '书签管理', operation: '批量删除' }"
            >{{ $t('bookmarkMg.batchDelete') }}</b-button
          >
          <b-button
            type="success"
            @click="showImportExportModal"
            v-click-log="{ module: '书签管理', operation: '导入导出' }"
            >{{ $t('bookmarkMg.importExport') }}</b-button
          >
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
        :selectable="true"
        :selectedRows="selectedRows"
        :rowKey="'id'"
        @selectionChange="handleSelectionChange"
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
      <input
        type="file"
        ref="importHTMLFileInput"
        accept=".html,.htm"
        style="display: none"
        @change="handleHTMLFileChange"
      />

      <!-- 导入导出模态框 -->
      <b-modal
        v-model:visible="importExportModalVisible"
        :maskClosable="false"
        :title="$t('bookmarkMg.importExport')"
        width="700px"
      >
        <div class="import-export-modal">
          <div class="modal-content">
            <div class="section export-section">
              <div class="section-header">
                <h3>{{ $t('bookmarkMg.exportSection') }}</h3>
              </div>
              <div class="cards-grid">
                <div class="action-card" @click="exportBookmark">
                  <div class="card-content">
                    <h4>{{ $t('bookmarkMg.exportExcel') }}</h4>
                    <p>{{ $t('bookmarkMg.exportExcelDesc') }}</p>
                  </div>
                </div>
                <div class="action-card" @click="exportBookmarksHTML">
                  <div class="card-content">
                    <h4>{{ $t('bookmarkMg.exportHTML') }}</h4>
                    <p>{{ $t('bookmarkMg.exportHTMLDesc') }}</p>
                  </div>
                </div>
              </div>
            </div>
            <div class="section import-section">
              <div class="section-header">
                <h3>{{ $t('bookmarkMg.importSection') }}</h3>
              </div>
              <div class="cards-grid">
                <div class="action-card" @click="handleImport">
                  <div class="card-content">
                    <h4>{{ $t('bookmarkMg.importExcel') }}</h4>
                    <p>{{ $t('bookmarkMg.importExcelDesc') }}</p>
                  </div>
                </div>
                <div class="action-card" @click="handleImportHTML">
                  <div class="card-content">
                    <h4>{{ $t('bookmarkMg.importHTML') }}</h4>
                    <p>{{ $t('bookmarkMg.importHTMLDesc') }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="note-section">
            <p>{{ $t('bookmarkMg.exportNote') }}</p>
          </div>
        </div>
      </b-modal>
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
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';

  const visible = defineModel<boolean>('visible');
  const user = useUserStore();

  const bookmark = bookmarkStore();
  const loading = ref(false);
  const selectedRows = ref([]);
  const importExportModalVisible = ref(false);
  const handleSelectionChange = (selected) => {
    selectedRows.value = selected;
  };
  const showImportExportModal = () => {
    importExportModalVisible.value = true;
  };

  const handleBatchDelete = () => {
    if (selectedRows.value.length === 0) {
      message.warning('请选择要删除的书签');
      return;
    }

    const selectedBookmarks = bookmarkList.value.filter((item) => selectedRows.value.includes(item.id));
    const names = selectedBookmarks.map((b) => b.name).join('、');

    Alert.alert({
      title: '提示',
      content: `请确认是否要批量删除选中的 ${selectedRows.value.length} 个书签？<br/>书签列表：${names}`,
      onOk() {
        loading.value = true;
        recordOperation({ module: '书签管理', operation: `批量删除书签` });

        const requests = selectedRows.value.map((id) => apiBasePost('/api/bookmark/delBookmark', { id }));

        Promise.allSettled(requests).then((results) => {
          let successCount = 0;
          let failedCount = 0;
          const failedItems = [];

          results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.status === 200) {
              successCount++;
            } else {
              failedCount++;
              const bookmark = selectedBookmarks[index];
              failedItems.push({
                name: bookmark.name,
                url: bookmark.url,
                error: result.value?.msg || '删除失败',
              });
            }
          });

          // 重新加载数据
          init();

          // 显示结果
          if (failedCount > 0) {
            const errorText = failedItems
              .map((item) => `${item.name} (${item.url}): <span style="color: #ff5722">${item.error}</span>`)
              .join('<br/>');

            Alert.alert({
              title: `删除完成 (${successCount}成功/${failedCount}失败)`,
              content: errorText,
              okText: '复制错误信息',
              onOk() {
                navigator.clipboard.writeText(failedItems.map((f) => `${f.name} (${f.url}): ${f.error}`).join('\n'));
                message.success('错误信息已复制到剪贴板');
              },
            });
          } else {
            message.success(`批量删除成功！共删除 ${successCount} 个书签`);
          }

          // 清空选择
          selectedRows.value = [];
          loading.value = false;
        });
      },
    });
  };
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
    loading.value = true;
    const bookmarksToExport =
      selectedRows.value.length > 0
        ? bookmarkList.value.filter((item) => selectedRows.value.includes(item.id))
        : bookmarkList.value;

    if (bookmarksToExport.length === 0) {
      message.warning('请选择要导出的书签');
      loading.value = false;
      return;
    }

    // 随便声明一个结果
    const exportData = bookmarksToExport?.map((item: any) => {
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
    importExportModalVisible.value = false;
    message.success('Excel导出成功');
    loading.value = false;
  }

  // 导出HTML书签
  function exportBookmarksHTML() {
    loading.value = true;
    const bookmarksToExport =
      selectedRows.value.length > 0
        ? bookmarkList.value.filter((item) => selectedRows.value.includes(item.id))
        : bookmarkList.value;

    if (bookmarksToExport.length === 0) {
      message.warning('请选择要导出的书签');
      loading.value = false;
      return;
    }

    // 按标签分组
    const groupedBookmarks = {};
    bookmarksToExport.forEach((bookmark) => {
      if (bookmark.tagList && bookmark.tagList.length > 0) {
        bookmark.tagList.forEach((tag) => {
          if (!groupedBookmarks[tag.name]) {
            groupedBookmarks[tag.name] = [];
          }
          groupedBookmarks[tag.name].push(bookmark);
        });
      } else {
        if (!groupedBookmarks['未分类']) {
          groupedBookmarks['未分类'] = [];
        }
        groupedBookmarks['未分类'].push(bookmark);
      }
    });

    // 生成HTML
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

    Object.keys(groupedBookmarks).forEach((folder) => {
      html += `<DT><H3>${folder}</H3>
<DL><p>
`;
      groupedBookmarks[folder].forEach((bookmark) => {
        html += `<DT><A HREF="${bookmark.url}">${bookmark.name}</A>
`;
      });
      html += `</DL><p>
`;
    });

    html += `</DL><p>`;

    // 下载文件
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bookmarks.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    importExportModalVisible.value = false;
    message.success('HTML书签导出成功');
    loading.value = false;
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
    importExportModalVisible.value = false;
  };

  const importHTMLFileInput = ref<HTMLInputElement | null>(null);
  const handleImportHTML = () => {
    importHTMLFileInput.value?.click();
    importExportModalVisible.value = false;
  };

  const handleFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        loading.value = true;
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
          loading.value = false;
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
        loading.value = false;
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      message.error('文件处理失败: ' + err.message);
      console.error('导入错误:', err);
      loading.value = false;
    } finally {
      target.value = '';
    }
  };

  const handleHTMLFileChange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        loading.value = true;
        const htmlContent = event.target.result as string;
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');

        // 解析书签
        const bookmarks = [];
        const parseBookmarks = (element, currentFolder = '') => {
          const children = element.children;
          for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.tagName === 'DT') {
              const h3 = child.querySelector('H3');
              if (h3) {
                // 文件夹
                const folderName = h3.textContent;
                const dl = child.querySelector('DL');
                if (dl) {
                  parseBookmarks(dl, folderName);
                }
              } else {
                const a = child.querySelector('A');
                if (a) {
                  // 书签
                  bookmarks.push({
                    name: a.textContent,
                    url: a.href,
                    folder: currentFolder,
                  });
                }
              }
            }
          }
        };

        const rootDL = doc.querySelector('DL');
        if (rootDL) {
          parseBookmarks(rootDL);
        }

        if (bookmarks.length === 0) {
          message.error('未找到有效的书签数据');
          loading.value = false;
          return;
        }

        // 去重：基于名字和网址
        const uniqueBookmarks = [];
        const seen = new Set();
        bookmarks.forEach((bookmark) => {
          const key = `${bookmark.name}-${bookmark.url}`;
          if (!seen.has(key)) {
            seen.add(key);
            uniqueBookmarks.push(bookmark);
          }
        });

        // 导入书签
        let successCount = 0;
        let failedCount = 0;
        const failedItems = [];

        const requests = uniqueBookmarks.map((bookmark) => {
          const data = {
            name: bookmark.name,
            url: bookmark.url,
            description: bookmark.folder ? `标签: ${bookmark.folder}` : '',
          };
          return apiBasePost('/api/bookmark/addBookmark', data);
        });

        const results = await Promise.allSettled(requests);
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.status === 200) {
            successCount++;
          } else {
            failedCount++;
            failedItems.push({
              name: uniqueBookmarks[index].name,
              url: uniqueBookmarks[index].url,
              error: result.value?.msg || '导入失败',
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
        loading.value = false;
      };
      reader.readAsText(file);
    } catch (err) {
      message.error('文件处理失败: ' + err.message);
      console.error('导入错误:', err);
      loading.value = false;
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

  .import-export-modal {
    .modal-content {
      display: flex;
      flex-direction: column;
      gap: 24px;
      width: 600px;
    }

    .section {
      .section-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;

        h3 {
          margin: 0;
          color: var(--text-color);
          font-size: 18px;
          font-weight: 600;
        }
      }

      .cards-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }

      .action-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 16px;
        background-color: var(--menu-item-bg-color);
        border: 1px solid var(--menu-item-h-bg-color);
        border-radius: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
        &:hover {
          background-color: var(--menu-item-h-bg-color);
          border-color: var(--primary-color);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .card-icon {
          flex-shrink: 0;
          color: var(--primary-color);
        }

        .card-content {
          h4 {
            margin: 0 0 4px 0;
            color: var(--text-color);
            font-size: 16px;
            font-weight: 500;
          }

          p {
            margin: 0;
            color: var(--desc-color);
            font-size: 14px;
          }
        }
      }
    }

    .note-section {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 24px;
      padding: 12px;
      background-color: var(--menu-item-h-bg-color);
      border-radius: 8px;
      border-left: 4px solid var(--primary-color);

      .note-icon {
        flex-shrink: 0;
        color: var(--primary-color);
        margin-top: 2px;
      }

      p {
        margin: 0;
        color: var(--desc-color);
        font-size: 14px;
        line-height: 1.5;
      }
    }
  }
</style>
