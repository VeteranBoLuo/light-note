<template>
  <PhoneListMg
    :loading="loading"
    :list-data="tableData"
    :title="$t('bookmarkMg.title')"
    @add="router.push('/manage/editBookmark/add')"
  >
    <template #item="{ data }">
      <div class="bookmark-item-main">
        <div class="bookmark-item-title">
          <div class="card-img-container">
            <img v-if="data.iconUrl" :src="data.iconUrl" height="20" width="20" @error="onErrorImg" alt="" />
          </div>
          <span class="bookmark-item-name">{{ data.name }}</span>
        </div>
        <div v-if="data.hasSnapshot || data.hasSummary" class="bm-badges">
          <BookmarkCapabilityBadge
            v-if="data.hasSnapshot"
            type="snapshot"
            :label="$t('bookmarkMg.badgeArchived')"
            :tooltip="$t('bookmarkMg.badgeArchivedHint')"
            @click="openSnap(data.id)"
          />
          <BookmarkCapabilityBadge
            v-if="data.hasSummary"
            type="summary"
            :label="$t('bookmarkMg.badgeSummary')"
            :tooltip="$t('bookmarkMg.badgeSummaryHint')"
            @click="openSnap(data.id)"
          />
        </div>
      </div>
      <div class="edit-tag-operation">
        <BActionButton
          action="edit"
          :tooltip="$t('common.edit')"
          @click="edit(data.id)"
          v-click-log="{ module: '书签管理', operation: `点击编辑图标` }"
        />
        <BActionButton action="delete" :tooltip="$t('common.delete')" @click="handleDeleteTag(data)" />
      </div>
    </template>
  </PhoneListMg>
  <BookmarkSnapshotModal v-model:visible="snapVisible" :bookmark-id="snapBookmarkId" />
</template>

<script lang="ts" setup>
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed, ref } from 'vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import router from '@/router';
  import icon from '@/config/icon.ts';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BActionButton from '@/components/base/BasicComponents/BActionButton.vue';
  import BookmarkCapabilityBadge from '@/components/manage/bookmarkMg/BookmarkCapabilityBadge.vue';
  import { cloneDeep } from 'lodash-es';
  import { exportExcelFile } from '@/utils/excel';

  const visible = defineModel<boolean>('visible');
  const user = useUserStore();

  const bookmark = bookmarkStore();
  const loading = ref(false);
  // 列表角标点击 → 弹出网页正文存档 / AI 摘要(与编辑页快照同一弹框)
  const snapVisible = ref(false);
  const snapBookmarkId = ref('');
  const openSnap = (id: string) => {
    snapBookmarkId.value = id;
    snapVisible.value = true;
  };
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
    if (!bookmark.isMobile) {
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
    if (blockGuestWrite('delete-bookmark')) return;
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除标签【${bookmark.name}】？`,
      onOk() {
        apiBasePost('/api/bookmark/delBookmark', {
          id: bookmark.id,
        }).then((res) => {
          if (res.status == 200) {
            recordOperation({ module: '书签管理', operation: `删除书签成功【${bookmark.name}】` });
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

  import PhoneListMg from '@/components/base/phoneComponents/PhoneListMg.vue';
  import BookmarkSnapshotModal from '@/components/manage/bookmarkEditMg/BookmarkSnapshotModal.vue';
  import { recordOperation, loadBookmarkIconsProgressively } from '@/api/commonApi.ts';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  async function exportBookmark() {
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
    // 获取第一列和第二列的最大字符长度
    const maxLen = [
      Math.max(...exportData.map((item) => item.标签名.length)),
      Math.max(...exportData.map((item) => item.网址.length)),
      Math.max(...exportData.map((item) => item.描述?.length)),
    ];

    try {
      await exportExcelFile(
        exportData,
        [
          { header: '标签名', key: '标签名', width: Math.max(maxLen[0], 12) },
          { header: '网址', key: '网址', width: Math.max(maxLen[1], 20) },
          { header: '描述', key: '描述', width: 50 },
          { header: '关联书签', key: '关联书签', width: 20 },
        ],
        '书签集合.xlsx',
      );
      message.success('Excel导出成功');
    } catch (error: any) {
      message.error(`Excel导出失败：${error.message || '未知错误'}`);
    }
  }

  function getIcon(bookmark) {
    // 无图标用站内默认图,不再直连第三方 ico.kucat.cn(真实 favicon 由后端抓取写回 iconUrl)
    return bookmark.iconUrl || icon.nullImg;
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
        userId: user.id,
        type: 'all',
      },
    });
    if (allRes.status === 200) {
      tableData.value = cloneDeep(allRes.data.items);
      tableData.value.forEach((bookmark: any) => {
        bookmark.iconUrl = getIcon(bookmark);
      });
      loading.value = false;
      // 缓存图片 + 把抓取到的图标当次回填(不必刷新页面)
      // 渐进式:只抓无图标的,限并发逐个,抓到即回填(不再整批等最慢站)
      loadBookmarkIconsProgressively(allRes.data.items, (id, icon) => {
        const b: any = tableData.value.find((x: any) => x.id === id);
        if (b) b.iconUrl = icon;
      });
    }
  }
</script>

<style lang="less" scoped>
  .bookmark-item-main {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding-right: 86px;
  }
  .bookmark-item-title {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .bookmark-item-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bookmark-item-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .bm-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .bookmark-item-tag {
    max-width: 120px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 12px;
    line-height: 18px;
    color: var(--desc-color);
    background: var(--common-tag-bg-color);
  }
  .edit-tag-container {
    height: 100%;
    box-sizing: border-box;
    padding: 0 40px;
  }
  .edit-tag-operation {
    position: absolute;
    right: 20px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  :deep(.list-item) {
    height: auto;
    min-height: 44px;
    padding-block: 10px;
    box-sizing: border-box;
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
