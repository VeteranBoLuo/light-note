<template>
  <div class="filter-panel">
    <div v-if="bookmark.tagLoading" class="tag-skeleton-wrap">
      <div class="skeleton-input"></div>
      <div class="skeleton-body"></div>
    </div>
    <b-list
      v-else
      :draggable="tagDraggable"
      class="header-input"
      v-model:listOptions="visibleDragTagList"
      v-model:dragList="visibleDragTagList"
      :node-type="{ id: 'id', title: 'name' }"
      @onEnd="onDragEnd"
      @start="onStart"
      force-fallback
      :scroll-sensitivity="20"
      :options="{ touchStartThreshold: 10 }"
      :delay="100"
    >
      <template #input>
        <div class="filter-tools">
          <b-input :placeholder="$t('home.tagSearch')" v-model:value="tagName" id="ref1">
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
            <template #suffix>
              <BSwitch v-model:checked="hideEmptyTags" title="隐藏空标签" />
            </template>
          </b-input>
          <div
            v-if="!bookmark.isMobile"
            ref="manageEntryRef"
            class="filter-manage-entry"
            @click="router.push('/manage/bookmarkMg')"
          >
            <svg-icon size="15" :src="icon.manage_categoryBtn_bookmark" />
            <span class="filter-manage-text">{{ $t('navigation.bookmarkManagement') }}</span>
          </div>
        </div>
      </template>
      <template #item="{ item }: { item: TagInterface }">
        <RightMenu
          :menu="['添加书签', '重命名', '编辑', '删除']"
          @select="handleTagMenu($event, item)"
          v-if="!item.isRename"
        >
          <div
            class="category-item"
            :title="item.name"
            :style="{
              backgroundColor: (bookmark.tagData as any)?.id === item.id ? 'var(--category-item-ba-color)' : '',
            }"
            :key="item.id"
            v-click-log="{ module: '首页', operation: `查询标签【${item.name}】下的书签列表` }"
            @click="handleClickTag(<TagInterface>item)"
          >
            <svg-icon
              size="18"
              :src="item.iconUrl ? item.iconUrl : icon.manage_categoryBtn_tag"
              class="tag-item-icon"
            />
            <span class="text-hidden" style="width: calc(100% - 28px)">{{ item.name }}</span>
          </div>
        </RightMenu>
        <b-input v-else class="edit-input" v-model:value="newName">
          <template #suffix>
            <svg-icon
              :src="icon.filterPanel.check"
              size="18"
              @click="handleRename(<TagInterface>item)"
              class="dom-hover"
            />
          </template>
        </b-input>
      </template>
      <template #empty v-if="isReady">
        <div class="empty-tag-prompt">
          <div class="empty-card">
            <h3>暂无标签</h3>
            <div>开始创建您的第一个标签吧</div>
            <br />
            <b-button size="small" type="primary" @click="router.push('/manage/editTag/add')">新增标签</b-button>
          </div>
        </div>
      </template>
    </b-list>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import { useRouter } from 'vue-router';
  import RightMenu from '@/components/base/RightMenu.vue';
  import { TagInterface } from '@/config/bookmarkCfg.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import BList from '@/components/base/BasicComponents/BList.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { recordOperation } from '@/api/commonApi.ts';

  const tagName = ref('');
  const hideEmptyTags = ref(true);
  const hasBookmark = (tag: TagInterface) => Array.isArray(tag.bookmarkList) && tag.bookmarkList.length > 0;
  const filterTagList = computed(() => {
    const keyword = tagName.value.trim().toUpperCase();
    return bookmark.tagList.filter((item) => {
      const matchKeyword = !keyword || item.name.toUpperCase().includes(keyword);
      const matchEmptyVisible = !hideEmptyTags.value || hasBookmark(item);
      return matchKeyword && matchEmptyVisible;
    });
  });
  const visibleDragTagList = ref<TagInterface[]>([]);
  const tagDraggable = computed(
    () => !bookmark.isMobile && !tagName.value.trim() && visibleDragTagList.value.length > 1,
  );

  const bookmark = bookmarkStore();
  const user = useUserStore();
  const router = useRouter();

  const newName = ref('');
  const rightTagData = ref<TagInterface>();
  const isReady = ref(false);
  const loadingStartAt = ref(Date.now());
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  function handleTagMenu(menu, tag: TagInterface) {
    recordOperation({ module: '首页', operation: `右键${menu}标签【${tag.name}】` });
    rightTagData.value = tag;
    const actions = {
      重命名: () => {
        tag.isRename = true;
        newName.value = tag.name;
      },
      编辑: () => router.push(`/manage/editTag/${tag.id}`),
      删除: () => handleDeleteTag(tag),
      添加书签: () => router.push(`/manage/editBookmark/add/${tag.id}`),
    };
    actions[menu]?.();
  }

  const handleDeleteTag = (tag: TagInterface) => {
    Alert.alert({
      title: '提示',
      content: `请确认是否要删除标签【${tag.name}】？`,
      onOk() {
        apiBasePost('/api/bookmark/delTag', { id: tag.id }).then((res) => {
          if (res.status === 200) {
            message.success('删除成功');
            if (tag.id === router.currentRoute.value.params?.id) {
              bookmark.type = 'all';
            }
            bookmark.refreshTag();
          }
        });
      },
    });
  };

  function handleRename(tag: TagInterface) {
    if (newName.value) {
      apiBasePost('/api/bookmark/updateTag', {
        name: newName.value,
        id: tag.id,
      }).then((res) => {
        if (res.status == 200) {
          tag.isRename = !tag.isRename;
          message.success('重命名成功');
          bookmark.refreshTag();
        }
      });
    }
  }

  function handleClickTag(tag: TagInterface) {
    if (tag.id === router.currentRoute.value.params?.id) {
      bookmark.refreshData();
    } else {
      bookmark.type = 'normal';
      router.push({ path: `/home/${tag.id}` }).then(() => {
        bookmark.refreshData();
      });
    }
  }
  function onStart() {
    document.body.style.userSelect = 'none';
  }

  function moveVisibleTagInAllTags(
    allTags: TagInterface[],
    sortedVisibleTags: TagInterface[],
    event?: { oldIndex?: number; newIndex?: number },
  ) {
    const oldIndex = Number(event?.oldIndex);
    const newIndex = Number(event?.newIndex);
    if (!Number.isInteger(oldIndex) || !Number.isInteger(newIndex) || oldIndex === newIndex) {
      return allTags;
    }

    const movedTag = Number.isInteger(newIndex) ? sortedVisibleTags[newIndex] : null;
    if (!movedTag) {
      return allTags;
    }

    const movedId = String(movedTag.id);
    const nextTags = allTags.filter((tag) => String(tag.id) !== movedId);
    const prevVisibleTag = sortedVisibleTags[newIndex - 1];
    const nextVisibleTag = sortedVisibleTags[newIndex + 1];

    if (prevVisibleTag) {
      const prevIndex = nextTags.findIndex((tag) => String(tag.id) === String(prevVisibleTag.id));
      if (prevIndex >= 0) {
        nextTags.splice(prevIndex + 1, 0, movedTag);
        return nextTags;
      }
    }

    if (nextVisibleTag) {
      const nextIndex = nextTags.findIndex((tag) => String(tag.id) === String(nextVisibleTag.id));
      if (nextIndex >= 0) {
        nextTags.splice(nextIndex, 0, movedTag);
        return nextTags;
      }
    }

    nextTags.push(movedTag);
    return nextTags;
  }

  async function onDragEnd(event?: { oldIndex?: number; newIndex?: number }) {
    document.body.style.userSelect = '';
    const sourceTags = [...bookmark.tagList];
    try {
      const userId = user.id;
      const mergedTags = moveVisibleTagInAllTags(sourceTags, visibleDragTagList.value, event);
      if (mergedTags === sourceTags) {
        visibleDragTagList.value = [...filterTagList.value];
        return;
      }
      const sortedTags =
        mergedTags.map((tag: TagInterface, index: number) => ({
          name: tag.name,
          sort: index,
          id: tag.id,
        })) || [];

      const updateResponse = await apiBasePost('/api/bookmark/updateTagSort', { tags: sortedTags });
      if (updateResponse.status === 200) {
        bookmark.tagList = mergedTags;
        const queryResponse = await apiQueryPost('/api/bookmark/queryTagList', {
          filters: { userId },
        });
        if (queryResponse.status === 200) {
          bookmark.tagList = queryResponse.data;
        }
      } else {
        visibleDragTagList.value = [...filterTagList.value];
      }
    } catch (error) {
      bookmark.tagList = sourceTags;
      visibleDragTagList.value = [...filterTagList.value];
      console.error('Error updating tag sort:', error);
    }
  }

  watch(
    () => bookmark.tagList.length,
    (val) => {
      isReady.value = val === 0;
    },
  );

  watch(
    filterTagList,
    (val) => {
      visibleDragTagList.value = [...val];
    },
    { immediate: true },
  );

  watch(
    () => bookmark.refreshTagKey,
    () => {
      loadingStartAt.value = Date.now();
      isReady.value = false;
    },
  );

  onUnmounted(() => {
    if (fallbackTimer) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
  });
</script>

<style lang="less" scoped>
  .filter-panel {
    min-width: 180px;
    height: 100%;
  }

  .header-input {
    width: 180px;
  }
  .header-input :deep(.category-body) {
    height: calc(100% - 88px) !important;
  }

  .filter-tools {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .filter-manage-entry {
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px 8px 14px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--desc-color);
    background: linear-gradient(135deg, rgba(97, 92, 237, 0.04) 0%, rgba(97, 92, 237, 0.01) 100%);
    transition: all 0.25s ease;
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      bottom: 6px;
      width: 3px;
      border-radius: 0 2px 2px 0;
      background: linear-gradient(180deg, #615ced 0%, rgba(97, 92, 237, 0.3) 100%);
      transition: all 0.25s ease;
    }
    &:hover {
      color: var(--text-color);
      background: linear-gradient(135deg, rgba(97, 92, 237, 0.08) 0%, rgba(97, 92, 237, 0.03) 100%);
      box-shadow: 0 2px 8px rgba(97, 92, 237, 0.1);
      transform: translateX(2px);
      &::before {
        width: 4px;
        top: 4px;
        bottom: 4px;
      }
    }
  }
  .filter-manage-text {
    font-size: 13px;
    font-weight: 500;
    transition: color 0.25s ease;
  }

  .empty-tag-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--desc-color);
    cursor: pointer;
    font-size: 12px;
    line-height: 18px;
    user-select: none;
  }

  .tag-skeleton-wrap {
    width: 180px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .skeleton-input,
  .skeleton-body {
    position: relative;
    overflow: hidden;
    background: var(--background-color);
    box-shadow: var(--ant-table-boxShadow);
  }

  .skeleton-input {
    height: 34px;
    border-radius: 8px;
  }

  .skeleton-body {
    height: 100vh;
    min-height: 260px;
    border-radius: 10px;
    background:
      linear-gradient(rgba(120, 120, 120, 0.18) 0 0) 14px 16px / calc(100% - 28px) 16px no-repeat,
      linear-gradient(rgba(120, 120, 120, 0.18) 0 0) 14px 48px / calc(75% - 14px) 12px no-repeat,
      linear-gradient(rgba(120, 120, 120, 0.18) 0 0) 14px 76px / calc(88% - 14px) 12px no-repeat,
      linear-gradient(rgba(120, 120, 120, 0.18) 0 0) 14px 104px / calc(66% - 14px) 12px no-repeat,
      linear-gradient(rgba(120, 120, 120, 0.18) 0 0) 14px 132px / calc(82% - 14px) 12px no-repeat,
      var(--background-color);
  }

  .skeleton-input::after,
  .skeleton-body::after {
    content: '';
    position: absolute;
    top: 0;
    left: -60%;
    width: 60%;
    height: 100%;
    background: linear-gradient(90deg, transparent, var(--skeleton-body-bg-color), transparent);
    animation: filter-skeleton-shine 1.2s infinite;
  }

  @keyframes filter-skeleton-shine {
    0% {
      left: -60%;
    }
    100% {
      left: 120%;
    }
  }

  .edit-input {
    :deep(.b-input) {
      height: 30px !important;
    }
  }

  .filter-panel-menu {
    height: calc(100% - 53px);
    padding-right: 10px;
    width: 180px;
    overflow: hidden auto;
  }

  @media (max-width: 767px) {
    .filter-panel {
      min-width: unset;
      width: 100%;
      padding: 0 20px 20px 20px;
    }

    &.header-input {
      width: unset;
    }

    .tag-skeleton-wrap {
      width: 100%;
    }

    .category-item {
      width: 100%;

      &:hover {
        background-color: unset;
      }
    }

    .filter-panel-menu {
      width: unset;
      padding-right: unset;
    }
  }

  .empty-tag-prompt {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    padding: 20px;

    .empty-card {
      background: var(--background-color, #fff);
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      max-width: 200px;
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;

      .empty-icon {
        color: var(--primary-color, #1890ff);
        margin-bottom: 16px;
      }

      h3 {
        margin: 0 0 8px 0;
        font-size: 16px;
        color: var(--text-color, #333);
        font-weight: 500;
      }

      p {
        margin: 0 0 16px 0;
        font-size: 14px;
        color: var(--text-secondary-color, #666);
      }

      .b-button {
        width: 100%;
      }
    }
  }
</style>
