<template>
  <b-loading :loading="loading">
    <div class="bookmark-manage-page" :class="{ 'bookmark-manage-page--night': user.currentTheme === 'night' }">
      <!-- Hero 区域 -->
      <section class="hero-card">
        <div class="hero-copy">
          <div class="eyebrow">{{ $t('navigation.bookmark') }}</div>
          <h1>{{ $t('bookmarkMg.title') }}</h1>
          <p>{{ $t('bookmarkMg.subtitle') }}</p>
        </div>

        <div class="hero-actions">
          <div class="hero-btns">
            <b-button v-if="viewMode === 'table' && selectedRows.length > 0" type="danger" @click="handleBatchDelete">{{
              $t('bookmarkMg.batchDelete')
            }}</b-button>
            <b-button type="success" @click="showImportExportModal">
              {{ $t('bookmarkMg.importExport') }}
            </b-button>
            <b-button type="primary" @click="router.push({ path: `/manage/editBookmark/add` })">
              {{ $t('common.add') }}
            </b-button>
            <b-button @click="handleToBack">{{ $t('common.back') }}</b-button>
          </div>
        </div>

        <div class="hero-stats">
          <div v-for="stat in stats" :key="stat.key" class="stat-card" :class="`stat-card--${stat.key}`">
            <div class="stat-label">{{ stat.label }}</div>
            <div class="stat-value">{{ stat.value }}</div>
            <div class="stat-desc">{{ stat.desc }}</div>
          </div>
        </div>
      </section>

      <!-- 内容区 -->
      <section class="content-layout">
        <aside class="filter-panel">
          <div class="filter-title">{{ $t('bookmarkMg.filtersTitle') }}</div>
          <button
            v-for="filter in filters"
            :key="filter.value"
            class="filter-item"
            :class="{ active: activeFilter === filter.value }"
            @click="activeFilter = filter.value"
          >
            <span class="filter-left">
              <span class="filter-dot" :class="`filter-dot--${filter.value}`"></span>
              <span>{{ filter.label }}</span>
            </span>
            <span class="filter-count">{{ filter.count }}</span>
          </button>
        </aside>

        <main class="result-panel">
          <div class="result-toolbar">
            <div class="result-toolbar-left">
              <div class="view-toggle">
                <button class="view-toggle-btn" :class="{ active: viewMode === 'card' }" @click="viewMode = 'card'">
                  <svg-icon :src="icon.filterPanel.list" size="14" />
                  <span>{{ $t('bookmarkMg.cardView') }}</span>
                </button>
                <button class="view-toggle-btn" :class="{ active: viewMode === 'table' }" @click="viewMode = 'table'">
                  <svg-icon :src="icon.navigation.menu" size="14" />
                  <span>{{ $t('bookmarkMg.tableView') }}</span>
                </button>
              </div>
              <b-input
                v-model:value="tableSearchValue"
                class="result-search"
                :placeholder="$t('bookmarkMg.bookmarkSearch')"
              >
                <template #prefix>
                  <svg-icon :src="icon.navigation.search" size="16" />
                </template>
              </b-input>
            </div>
            <div class="result-toolbar-right">
              <div class="result-title">{{ $t('bookmarkMg.resultTitle') }}</div>
              <div class="result-subtitle">{{ resultSubtitle }}</div>
            </div>
          </div>

          <!-- 卡片视图 -->
          <div v-if="viewMode === 'card' && filteredBookmarks.length" class="bookmark-grid">
            <article v-for="bookmarkItem in filteredBookmarks" :key="bookmarkItem.id" class="bookmark-card">
              <div class="bookmark-card__head">
                <div class="bookmark-identity">
                  <div class="bookmark-icon-wrap">
                    <img
                      v-if="bookmarkItem.iconUrl"
                      :src="bookmarkItem.iconUrl"
                      width="24"
                      height="24"
                      @error="onErrorImg"
                      alt=""
                    />
                    <svg-icon v-else :src="icon.manage_categoryBtn_bookmark" size="24" />
                  </div>
                  <div class="bookmark-meta">
                    <div class="bookmark-name">{{ bookmarkItem.name }}</div>
                    <div class="bookmark-url" :title="bookmarkItem.url">
                      <a :href="withProtocol(bookmarkItem.url)" target="_blank" @click.stop>{{ bookmarkItem.url }}</a>
                    </div>
                  </div>
                </div>

                <div class="bookmark-actions">
                  <button class="action-btn" @click="edit(bookmarkItem.id)">
                    <svg-icon :src="icon.table_edit" size="15" />
                    <span>{{ $t('common.edit') }}</span>
                  </button>
                  <button class="action-btn action-btn--danger" @click="handleDeleteTag(bookmarkItem)">
                    <svg-icon :src="icon.table_delete" size="15" />
                    <span>{{ $t('common.delete') }}</span>
                  </button>
                </div>
              </div>

              <div v-if="bookmarkItem.description" class="bookmark-desc">
                {{ bookmarkItem.description }}
              </div>

              <div class="section-block">
                <div class="section-title">{{ $t('bookmarkMg.relatedTag') }}</div>
                <div v-if="bookmarkItem.tagList?.length" class="chip-list">
                  <span
                    v-for="t in bookmarkItem.tagList"
                    :key="t.id"
                    class="common-chip common-chip--bookmark"
                    :title="t.name"
                    @click.stop="router.push(`/tag/${t.id}`)"
                  >
                    {{ t.name }}
                  </span>
                </div>
                <div v-else class="empty-inline">{{ $t('bookmarkMg.noTags') }}</div>
              </div>
            </article>
          </div>

          <!-- 表格视图 -->
          <BTable
            v-if="viewMode === 'table'"
            :data="filteredBookmarks"
            :columns="tagColumns"
            style="margin-top: 10px; width: 100%; height: calc(100% - 50px)"
            :selectable="true"
            :selectedRows="selectedRows"
            :rowKey="'id'"
            @selectionChange="handleSelectionChange"
          >
            <template #bodyCell="{ column, text, record }">
              <template v-if="column.key === 'name'">
                <div style="display: flex; align-items: center; gap: 10px" :title="text">
                  <div class="card-img-container">
                    <img
                      v-if="(record as BookmarkInterface).iconUrl"
                      :src="(record as BookmarkInterface).iconUrl"
                      height="20"
                      width="20"
                      @error="onErrorImg"
                      alt=""
                    />
                  </div>
                  <div class="text-hidden">{{ text }}</div>
                </div>
              </template>
              <template v-else-if="column.key === 'tagList'">
                <div class="flex-align-center-gap">
                  <span
                    :title="t.name"
                    class="common-tag dom-hover"
                    v-for="t in (record as BookmarkInterface).tagList"
                    :key="t.id"
                    @click.stop="router.push(`/tag/${t.id}`)"
                    >{{ t.name }}</span
                  >
                </div>
              </template>
              <template v-else-if="column.key === 'url'">
                <div class="text-hidden">
                  <a :href="withProtocol(text)" target="_blank">{{ text }}</a>
                </div>
              </template>
              <template v-else-if="column.key === 'operation'">
                <div class="edit-tag-operation">
                  <svg-icon
                    title="编辑"
                    :src="icon.table_edit"
                    size="16"
                    @click="edit((record as BookmarkInterface).id)"
                    class="dom-hover"
                  />
                  <svg-icon
                    title="删除"
                    :src="icon.table_delete"
                    size="16"
                    @click="handleDeleteTag(record as BookmarkInterface)"
                    class="dom-hover"
                  />
                </div>
              </template>
            </template>
          </BTable>

          <!-- 空状态 -->
          <div v-if="viewMode === 'card' && !filteredBookmarks.length" class="empty-state">
            <div class="empty-orbit"></div>
            <h3>{{ $t('bookmarkMg.emptyTitle') }}</h3>
            <p>{{ $t('bookmarkMg.emptyDesc') }}</p>
          </div>
        </main>
      </section>

      <!-- 隐藏的文件输入 -->
      <input type="file" ref="importFileInput" accept=".xlsx" style="display: none" @change="handleFileChange" />
      <input
        type="file"
        ref="importHTMLFileInput"
        accept=".html,.htm"
        style="display: none"
        @change="handleHTMLFileChange"
      />

      <ActionCardModal
        v-if="importExportModalVisible"
        v-model:visible="importExportModalVisible"
        :title="$t('bookmarkMg.importExport')"
        :sections="importExportSections"
        :note="$t('bookmarkMg.exportNote')"
      />
    </div>
  </b-loading>
</template>

<script lang="ts" setup>
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed, defineAsyncComponent, ref } from 'vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import router from '@/router';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { useI18n } from 'vue-i18n';
  import { BookmarkInterface } from '@/config/bookmarkCfg.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';

  const ActionCardModal = defineAsyncComponent(() => import('@/components/base/ActionCardModal.vue'));

  const user = useUserStore();
  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const loading = ref(false);
  const selectedRows = ref<string[]>([]);
  const importExportModalVisible = ref(false);
  const viewMode = ref<'card' | 'table'>('card');
  const tableSearchValue = ref('');
  const tableData = ref<BookmarkInterface[]>([]);

  type FilterValue = 'all' | string;
  const activeFilter = ref<FilterValue>('all');

  const handleSelectionChange = (selected: string[]) => {
    selectedRows.value = selected;
  };
  const showImportExportModal = () => {
    importExportModalVisible.value = true;
  };

  // ── 筛选逻辑 ──
  const allTags = computed(() => {
    const tagMap = new Map<string, { id: string; name: string; count: number }>();
    tableData.value.forEach((item) => {
      item.tagList?.forEach((t) => {
        if (!tagMap.has(t.id)) {
          tagMap.set(t.id, { id: t.id, name: t.name, count: 0 });
        }
        tagMap.get(t.id)!.count++;
      });
    });
    return Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
  });

  const filteredByKeyword = computed(() => {
    const keyword = tableSearchValue.value.trim().toLowerCase();
    if (!keyword) return tableData.value;
    return tableData.value.filter((item) => item.name?.toLowerCase().includes(keyword));
  });

  const filteredBookmarks = computed(() => {
    const data = filteredByKeyword.value;
    if (activeFilter.value === 'all') return data;
    if (activeFilter.value === 'noTag') return data.filter((item) => !item.tagList?.length);
    return data.filter((item) => item.tagList?.some((t) => t.id === activeFilter.value));
  });

  const filters = computed(() => {
    const base = filteredByKeyword.value;
    const items: { value: string; label: string; count: number }[] = [
      { value: 'all', label: t('bookmarkMg.filterAll'), count: base.length },
    ];
    allTags.value.forEach((t) => {
      items.push({ value: t.id, label: t.name, count: t.count });
    });
    items.push({
      value: 'noTag',
      label: t('bookmarkMg.filterNoTag'),
      count: base.filter((item) => !item.tagList?.length).length,
    });
    return items;
  });

  const stats = computed(() => {
    const uniqueTagIds = new Set<string>();
    tableData.value.forEach((item) => {
      item.tagList?.forEach((t) => uniqueTagIds.add(t.id));
    });
    const withTags = tableData.value.filter((item) => (item.tagList?.length || 0) > 0).length;
    return [
      {
        key: 'bookmark',
        label: t('bookmarkMg.statTotal'),
        value: tableData.value.length,
        desc: t('bookmarkMg.statTotalDesc'),
      },
      {
        key: 'tag',
        label: t('bookmarkMg.statTagTotal'),
        value: uniqueTagIds.size,
        desc: t('bookmarkMg.statTagTotalDesc'),
      },
      { key: 'note', label: t('bookmarkMg.statWithTag'), value: withTags, desc: t('bookmarkMg.statWithTagDesc') },
      {
        key: 'file',
        label: t('bookmarkMg.statNoTag'),
        value: tableData.value.length - withTags,
        desc: t('bookmarkMg.statNoTagDesc'),
      },
    ];
  });

  const resultSubtitle = computed(() => {
    const keyword = tableSearchValue.value.trim();
    if (keyword) {
      return t('bookmarkMg.resultSubtitleKeyword', { keyword, count: filteredBookmarks.value.length });
    }
    return t('bookmarkMg.resultSubtitle', { count: filteredBookmarks.value.length });
  });

  // ── 导入导出配置 ──
  const importExportSections = computed(() => [
    {
      key: 'export',
      title: t('bookmarkMg.exportSection'),
      actions: [
        {
          key: 'exportExcel',
          label: t('bookmarkMg.exportExcel'),
          description: t('bookmarkMg.exportExcelDesc'),
          onClick: exportBookmark,
        },
        {
          key: 'exportHTML',
          label: t('bookmarkMg.exportHTML'),
          description: t('bookmarkMg.exportHTMLDesc'),
          onClick: exportBookmarksHTML,
        },
      ],
    },
    {
      key: 'import',
      title: t('bookmarkMg.importSection'),
      actions: [
        {
          key: 'importExcel',
          label: t('bookmarkMg.importExcel'),
          description: t('bookmarkMg.importExcelDesc'),
          onClick: handleImport,
        },
        {
          key: 'importHTML',
          label: t('bookmarkMg.importHTML'),
          description: t('bookmarkMg.importHTMLDesc'),
          onClick: handleImportHTML,
        },
      ],
    },
  ]);

  // ── 表格列 ──
  const tagColumns = ref([
    { title: '书签', key: 'name', minWidth: '200px' },
    { title: '网址', key: 'url', minWidth: '200px', ellipsis: true },
    { title: '关联标签', key: 'tagList', minWidth: '180px' },
    { title: '操作', key: 'operation', width: '90px' },
  ]);

  const edit = (id: string) => {
    router.push({ path: `/manage/editBookmark/${id}` });
  };

  function handleDeleteTag(bookmarkItem: BookmarkInterface) {
    if (blockGuestWrite('delete-bookmark')) return;
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除书签【${bookmarkItem.name}】？`,
      onOk() {
        apiBasePost('/api/bookmark/delBookmark', { id: bookmarkItem.id }).then((res) => {
          if (res.status == 200) {
            recordOperation({ module: '书签管理', operation: `删除书签成功【${bookmarkItem.name}】` });
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
      router.back();
    }
  }

  // ── 批量删除 ──
  const handleBatchDelete = () => {
    if (blockGuestWrite('delete-bookmark')) return;
    if (selectedRows.value.length === 0) {
      message.warning('请选择要删除的书签');
      return;
    }
    const selectedBookmarks = filteredBookmarks.value.filter((item) => selectedRows.value.includes(item.id));
    const names = selectedBookmarks.map((b) => b.name).join('、');
    Alert.alert({
      title: '提示',
      content: `请确认是否要批量删除选中的 ${selectedRows.value.length} 个书签？<br/>书签列表：${names}`,
      onOk() {
        loading.value = true;
        const requests = selectedRows.value.map((id) => apiBasePost('/api/bookmark/delBookmark', { id }));
        Promise.allSettled(requests).then((results: any) => {
          let successCount = 0;
          let failedCount = 0;
          const failedItems: any[] = [];
          results.forEach((result: any, index: number) => {
            if (result.status === 'fulfilled' && result.value.status === 200) {
              successCount++;
            } else {
              failedCount++;
              const bm = selectedBookmarks[index];
              failedItems.push({ name: bm.name, url: bm.url, error: result.value?.msg || '删除失败' });
            }
          });
          init();
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
          if (successCount > 0) {
            recordOperation({
              module: '书签管理',
              operation:
                failedCount > 0
                  ? `批量删除书签部分成功【${successCount}成功/${failedCount}失败】`
                  : `批量删除书签成功【${successCount}个】`,
            });
          }
          selectedRows.value = [];
          loading.value = false;
        });
      },
    });
  };

  // ── 导入导出 ──
  import * as XLSX from 'xlsx';
  import { cloneDeep } from 'lodash-es';

  function exportBookmark() {
    loading.value = true;
    const bookmarksToExport =
      selectedRows.value.length > 0
        ? filteredBookmarks.value.filter((item) => selectedRows.value.includes(item.id))
        : filteredBookmarks.value;
    if (bookmarksToExport.length === 0) {
      message.warning('请选择要导出的书签');
      loading.value = false;
      return;
    }
    const exportData = bookmarksToExport.map((item: BookmarkInterface) => ({
      书签名: item.name,
      网址: item.url,
      描述: item?.description,
    }));
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const maxLen = [
      Math.max(...exportData.map((item) => item.书签名.length)),
      Math.max(...exportData.map((item) => item.网址.length)),
      Math.max(...exportData.map((item) => item.描述?.length || 0)),
    ];
    worksheet['!cols'] = [{ wch: maxLen[0] }, { wch: maxLen[1] }, { wch: 50 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'bookmark');
    XLSX.writeFile(workbook, '书签集合.xlsx');
    importExportModalVisible.value = false;
    message.success('Excel导出成功');
    loading.value = false;
  }

  function exportBookmarksHTML() {
    loading.value = true;
    const bookmarksToExport =
      selectedRows.value.length > 0
        ? filteredBookmarks.value.filter((item) => selectedRows.value.includes(item.id))
        : filteredBookmarks.value;
    if (bookmarksToExport.length === 0) {
      message.warning('请选择要导出的书签');
      loading.value = false;
      return;
    }
    const groupedBookmarks: Record<string, BookmarkInterface[]> = {};
    bookmarksToExport.forEach((bookmarkItem) => {
      if (bookmarkItem.tagList && bookmarkItem.tagList.length > 0) {
        bookmarkItem.tagList.forEach((tag) => {
          if (!groupedBookmarks[tag.name]) groupedBookmarks[tag.name] = [];
          groupedBookmarks[tag.name].push(bookmarkItem);
        });
      } else {
        if (!groupedBookmarks['未分类']) groupedBookmarks['未分类'] = [];
        groupedBookmarks['未分类'].push(bookmarkItem);
      }
    });
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>`;
    Object.keys(groupedBookmarks).forEach((folder) => {
      html += `<DT><H3>${folder}</H3>\n<DL><p>\n`;
      groupedBookmarks[folder].forEach((bm) => {
        html += `<DT><A HREF="${bm.url}">${bm.name}</A>\n`;
      });
      html += `</DL><p>\n`;
    });
    html += `</DL><p>`;
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

  // 兜底展示层:新增/编辑书签时后端已统一补协议头,但存量数据可能是补全前存的裸域名;
  // <a :href> 遇到裸域名会当相对路径解析,拼出 https://boluo66.top/xxx.com 这种坏链接
  function withProtocol(url: string) {
    const trimmed = String(url || '').trim();
    if (!trimmed) return trimmed;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  function getIcon(bookmarkItem: BookmarkInterface) {
    // 无图标用站内默认图,不再直连第三方 ico.kucat.cn(真实 favicon 由后端抓取写回 iconUrl)
    return bookmarkItem.iconUrl || icon.nullImg;
  }

  function onErrorImg(event: Event) {
    (event.target as HTMLImageElement).src =
      'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIwLjhlbSIgaGVpZ2h0PSIwLjhlbSIgdmlld0JveD0iMCAwIDIwIDIwIj48cGF0aCBmaWxsPSIjNWI1YjViIiBkPSJNMTAgMjBhMTAgMTAgMCAxIDEgMC0yMGExMCAxMCAwIDAgMSAwIDIwbTcuNzUtOGE4IDggMCAwIDAgMC00aC0zLjgyYTI5IDI5IDAgMCAxIDAgNHptLS44MiAyaC0zLjIyYTE0LjQgMTQuNCAwIDAgMS0uOTUgMy41MUE4LjAzIDguMDMgMCAwIDAgMTYuOTMgMTRtLTguODUtMmgzLjg0YTI0LjYgMjQuNiAwIDAgMCAwLTRIOC4wOGEyNC42IDI0LjYgMCAwIDAgMCA0bS4yNSAyYy40MSAyLjQgMS4xMyA0IDEuNjcgNHMxLjI2LTEuNiAxLjY3LTR6bS02LjA4LTJoMy44MmEyOSAyOSAwIDAgMSAwLTRIMi4yNWE4IDggMCAwIDAgMCA0bS44MiAyYTguMDMgOC4wMyAwIDAgMCA0LjE3IDMuNTFjLS40Mi0uOTYtLjc0LTIuMTYtLjk1LTMuNTF6bTEzLjg2LThhOC4wMyA4LjAzIDAgMCAwLTQuMTctMy41MWMuNDIuOTYuNzQgMi4xNi45NSAzLjUxem0tOC42IDBoMy4zNGMtLjQxLTIuNC0xLjEzLTQtMS42Ny00UzguNzQgMy42IDguMzMgNk0zLjA3IDZoMy4yMmMuMi0xLjM1LjUzLTIuNTUuOTUtMy41MUE4LjAzIDguMDMgMCAwIDAgMy4wNyA2Ii8+PC9zdmc+';
  }

  const importFileInput = ref<HTMLInputElement | null>(null);
  const handleImport = () => {
    if (blockGuestWrite('import-bookmark')) return;
    importFileInput.value?.click();
    importExportModalVisible.value = false;
  };

  const importHTMLFileInput = ref<HTMLInputElement | null>(null);
  const handleImportHTML = () => {
    if (blockGuestWrite('import-bookmark')) return;
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
        const data = new Uint8Array(event.target!.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        const requiredColumns = ['书签名', '网址', '描述'];
        const hasRequired = requiredColumns.every(
          (col) => jsonData.length > 0 && Object.keys(jsonData[0]).includes(col),
        );
        if (!hasRequired) {
          message.error('导入文件格式不正确，请确保包含书签名、网址、描述列');
          loading.value = false;
          return;
        }
        const bookmarksToImport = jsonData.map((item: any) => ({
          name: item['书签名'].trim(),
          url: item['网址'].trim(),
          description: item['描述']?.trim() || '',
        }));
        let successCount = 0;
        let failedCount = 0;
        const failedItems: any[] = [];
        const requests = bookmarksToImport.map((bm: any) => apiBasePost('/api/bookmark/addBookmark', bm));
        const results: any = await Promise.allSettled(requests);
        results.forEach((result: any, index: number) => {
          if (result.status === 'fulfilled' && result.value.status === 200) {
            successCount++;
          } else {
            failedCount++;
            failedItems.push({
              name: bookmarksToImport[index].name,
              url: bookmarksToImport[index].url,
              error: result.value?.msg,
            });
          }
        });
        await init();
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
    } catch (err: any) {
      message.error('文件处理失败: ' + err.message);
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
      loading.value = true;
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiBasePost('/api/bookmark/importBookmarksHtml', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.status === 200) {
        const { parsedTotal, createdTags, createdBookmarks, boundRelations } = res.data || {};
        message.success(
          `导入完成：解析 ${parsedTotal || 0}，新标签 ${createdTags || 0}，新书签 ${createdBookmarks || 0}，建立关联 ${boundRelations || 0}`,
        );
        await init();
      } else {
        message.error(res.msg || '导入失败');
      }
      loading.value = false;
    } catch (err: any) {
      message.error('文件处理失败: ' + (err?.message || err));
      loading.value = false;
    } finally {
      target.value = '';
    }
  };

  function init() {
    loading.value = true;
    apiQueryPost('/api/bookmark/getBookmarkList', { filters: { userId: user.id, type: 'all' } })
      .then((res) => {
        if (res.status === 200) {
          tableData.value = cloneDeep(res.data.items);
          tableData.value.forEach((item: BookmarkInterface) => {
            item.iconUrl = getIcon(item);
          });
          apiBasePost(
            '/api/common/analyzeImgUrl',
            res.data.items?.map((data: any) => ({ url: data.url, id: data.id, noCache: !data.iconUrl })),
          ).then((imgRes) => {
            // 把抓取到的图标当次回填,不必刷新页面
            if (imgRes.status === 200 && Array.isArray(imgRes.data) && imgRes.data.length) {
              const iconMap = new Map(imgRes.data.map((r: any) => [r.id, r.iconUrl]));
              tableData.value.forEach((item: BookmarkInterface) => {
                if (iconMap.has(item.id)) item.iconUrl = iconMap.get(item.id);
              });
            }
          });
        }
      })
      .finally(() => {
        loading.value = false;
      });
  }

  init();
</script>

<style lang="less" scoped>
  @color-mix-hover: 10%;
  @color-mix-active: 14%;
  @opacity-primary: 0.72;
  @opacity-secondary: 0.54;
  @radius-card: 16px;
  @radius-sm: 10px;

  .bookmark-manage-page {
    --bm-hero-bg: linear-gradient(135deg, var(--background-color), var(--menu-body-bg-color));
    --bm-stat-bg: rgba(255, 255, 255, 0.48);
    --bm-panel-bg: var(--background-color);
    --bm-card-bg: var(--menu-body-bg-color);
    --bm-muted-bg: var(--bl-input-noBorder-bg-color);

    height: 100%;
    display: flex;
    flex-direction: column;
    padding: 16px;
    box-sizing: border-box;
    color: var(--text-color);
  }

  .bookmark-manage-page--night {
    --bm-hero-bg: linear-gradient(135deg, #1b1c21, #24252a);
    --bm-stat-bg: #27282e;
    --bm-panel-bg: #1f2025;
    --bm-card-bg: #26272d;
    --bm-muted-bg: #2c2d34;
  }

  // ── Hero ──
  .hero-card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
    gap: 14px;
    background: var(--bm-hero-bg);
    border: 1px solid var(--workbench-border-color);
    border-radius: 16px;
    padding: 16px 20px;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      top: -60px;
      right: -40px;
      width: 220px;
      height: 220px;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        color-mix(in srgb, var(--resource-bookmark-color) 8%, transparent) 0%,
        transparent 70%
      );
      pointer-events: none;
    }
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    gap: 6px;
    h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.1;
    }
    p {
      margin: 0;
      max-width: 640px;
      font-size: 13px;
      line-height: 1.5;
      opacity: @opacity-primary;
    }
  }

  .eyebrow {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--resource-bookmark-color);
  }

  .hero-actions {
    display: flex;
    align-items: flex-end;
  }

  .hero-btns {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    flex-wrap: wrap;
    width: 100%;
  }

  .result-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    gap: 16px;
  }

  .result-toolbar-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .result-toolbar-right {
    text-align: right;
    flex-shrink: 0;
  }

  .result-search {
    width: 200px;
  }

  .view-toggle {
    display: flex;
    gap: 4px;
    background: var(--bm-muted-bg);
    border-radius: 8px;
    padding: 3px;
  }

  .view-toggle-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    border: 0;
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    cursor: pointer;
    color: var(--desc-color);
    background: transparent;
    transition: all 0.18s ease;
    white-space: nowrap;
    &.active {
      background: var(--bm-card-bg);
      color: var(--text-color);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    &:hover:not(.active) {
      color: var(--text-color);
    }
  }

  // ── Stats ──
  .hero-stats {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }

  .stat-card {
    border-radius: 12px;
    padding: 10px 14px;
    background: var(--bm-stat-bg);
    border: 1px solid var(--workbench-border-color);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
    position: relative;
    overflow: hidden;
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
    }
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.07);
    }
  }

  .stat-card--bookmark::before {
    background: var(--resource-bookmark-color);
  }
  .stat-card--tag::before {
    background: var(--resource-tag-color);
  }
  .stat-card--note::before {
    background: var(--resource-note-color);
  }
  .stat-card--file::before {
    background: var(--resource-file-color);
  }

  .stat-label {
    font-size: 11px;
    opacity: @opacity-secondary;
  }
  .stat-value {
    margin-top: 4px;
    font-size: 22px;
    font-weight: 700;
  }
  .stat-desc {
    margin-top: 2px;
    font-size: 11px;
    opacity: @opacity-secondary;
  }

  // ── Layout ──
  .content-layout {
    display: grid;
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 14px;
    margin-top: 14px;
    flex: 1;
    min-height: 0;
  }

  .filter-panel,
  .result-panel {
    background: var(--bm-panel-bg);
    border: 1px solid var(--workbench-border-color);
    border-radius: @radius-card;
    overflow-y: auto;
  }

  .filter-panel {
    padding: 16px;
  }

  .filter-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: @opacity-secondary;
    margin-bottom: 10px;
    padding: 0 4px;
  }

  .filter-item {
    width: 100%;
    border: 0;
    border-radius: @radius-sm;
    background: transparent;
    color: inherit;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    transition: all 0.18s ease;
    & + & {
      margin-top: 4px;
    }
    &:hover {
      background: color-mix(in srgb, var(--resource-bookmark-color) @color-mix-hover, var(--bm-muted-bg));
    }
    &.active {
      background: color-mix(in srgb, var(--resource-bookmark-color) @color-mix-active, var(--bm-muted-bg));
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--resource-bookmark-color) 20%, transparent);
    }
  }

  .filter-left {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .filter-count {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    opacity: @opacity-secondary;
  }

  .filter-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--resource-bookmark-color);
    flex-shrink: 0;
  }
  .filter-dot--noTag {
    background: #94a3b8;
  }

  .result-panel {
    padding: 20px;
  }

  .result-title {
    font-size: 16px;
    font-weight: 600;
  }
  .result-subtitle {
    font-size: 13px;
    opacity: @opacity-secondary;
    margin-top: 4px;
  }

  // ── 卡片视图 ──
  .bookmark-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .bookmark-card {
    background: var(--bm-card-bg);
    border: 1px solid var(--workbench-border-color);
    border-radius: @radius-card;
    padding: 18px;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease,
      border-color 0.2s ease;
    position: relative;
    overflow: hidden;
    &::before {
      content: '';
      position: absolute;
      top: -30px;
      right: -20px;
      width: 100px;
      height: 100px;
      border-radius: 50%;
      background: radial-gradient(
        circle,
        color-mix(in srgb, var(--resource-bookmark-color) 5%, transparent) 0%,
        transparent 70%
      );
      pointer-events: none;
    }
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
      border-color: color-mix(in srgb, var(--resource-bookmark-color) 14%, transparent);
    }
  }

  .bookmark-card__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .bookmark-identity {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .bookmark-icon-wrap {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 4px;
    background: color-mix(in srgb, var(--resource-bookmark-color) 8%, var(--bm-muted-bg));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
    img {
      border-radius: 6px;
    }
  }

  .bookmark-meta {
    min-width: 0;
  }
  .bookmark-name {
    font-size: 15px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bookmark-url {
    margin-top: 4px;
    font-size: 12px;
    opacity: @opacity-secondary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    a {
      color: inherit;
      text-decoration: none;
      &:hover {
        color: var(--resource-bookmark-color);
      }
    }
  }

  .bookmark-desc {
    margin-top: 10px;
    font-size: 13px;
    opacity: @opacity-primary;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .bookmark-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 0;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 12px;
    cursor: pointer;
    opacity: 0.6;
    transition: all 0.18s ease;
    background: var(--bm-muted-bg);
    color: inherit;
    &:hover {
      opacity: 1;
      background: color-mix(in srgb, var(--resource-bookmark-color) 10%, var(--bm-muted-bg));
    }
  }

  .action-btn--danger:hover {
    background: #fef2f2;
    color: #ef4444;
  }

  // ── 卡片内区块 ──
  .section-block {
    margin-top: 12px;
  }

  .section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: @opacity-secondary;
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    &::before {
      content: '';
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--resource-bookmark-color);
    }
  }

  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .common-chip {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    border: 1px solid var(--card-border-color);
    cursor: pointer;
    transition: all 0.18s ease;
    &:hover {
      transform: translateY(-1px);
    }
  }

  .common-chip--bookmark:hover {
    border-color: var(--resource-bookmark-color);
    color: var(--resource-bookmark-color);
    background: color-mix(in srgb, var(--resource-bookmark-color) 8%, transparent);
  }

  .empty-inline {
    font-size: 12px;
    opacity: @opacity-secondary;
  }

  // ── 空状态 ──
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 320px;
    border: 2px dashed var(--card-border-color);
    border-radius: @radius-card;
    background: linear-gradient(135deg, transparent 0%, var(--bm-muted-bg) 100%);
    h3 {
      margin: 16px 0 8px;
      font-size: 18px;
      opacity: @opacity-primary;
    }
    p {
      margin: 0;
      font-size: 13px;
      opacity: @opacity-secondary;
    }
  }

  .empty-orbit {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 3px solid color-mix(in srgb, var(--resource-bookmark-color) 14%, transparent);
    border-top-color: var(--resource-bookmark-color);
    animation: bm-orbit 1.2s linear infinite;
  }

  @keyframes bm-orbit {
    to {
      transform: rotate(360deg);
    }
  }

  // ── 表格保留样式 ──
  .edit-tag-operation {
    display: flex;
    align-items: center;
    gap: 10px;
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

  @media (max-width: 1280px) {
    .hero-card {
      grid-template-columns: 1fr;
    }
    .hero-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .content-layout {
      grid-template-columns: 1fr;
    }
    .filter-panel {
      position: static;
    }
    .bookmark-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
