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
            <template v-if="!bookmark.isMobile" #suffix>
              <b-tooltip :title="hideEmptyTags ? $t('home.hideEmptyTags') : $t('home.showEmptyTags')">
                <BSwitch v-model:checked="hideEmptyTags" />
              </b-tooltip>
            </template>
          </b-input>
          <BButton
            v-if="bookmark.isMobile"
            class="filter-all-entry"
            :class="{ active: bookmark.type === 'all' }"
            @click="handleViewAll"
          >
            <svg-icon size="18" :src="icon.resource.bookmark" />
            <span class="filter-all-label">{{ $t('home.allBookmarks') }}</span>
            <span class="filter-all-count">{{ user.bookmarkTotal || bookmark.bookmarkList.length }}</span>
          </BButton>
          <div v-if="bookmark.isMobile" class="mobile-empty-tag-toggle">
            <span>{{ $t('home.hideEmptyTags') }}</span>
            <BSwitch v-model:checked="hideEmptyTags" />
          </div>
        </div>
      </template>
      <template #item="{ item }: { item: TagInterface }">
        <RightMenu
          :menu="[$t('home.menuAddBookmark'), $t('common.reName'), $t('common.edit'), $t('common.delete')]"
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
            <span class="text-hidden tag-item-name">{{ item.name }}</span>
            <span v-if="bookmark.isMobile" class="tag-item-count">{{ item.bookmarkList?.length || 0 }}</span>
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
      <template #empty>
        <div class="empty-tag-prompt">
          <div class="empty-card">
            <h3>{{ $t('home.noTags') }}</h3>
            <div>{{ $t('home.createFirstTag') }}</div>
            <br />
            <b-button size="small" type="primary" @click="router.push('/manage/editTag/add')">{{ $t('home.addTag') }}</b-button>
          </div>
        </div>
      </template>
    </b-list>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost, apiQueryPost } from '@/http/request.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { updatePreference } from '@/utils/savePreference';
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

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const router = useRouter();

  const hideEmptyTags = computed({
    get: () => user.preferences.hideEmptyTags ?? false,
    set: (val: boolean) => updatePreference({ hideEmptyTags: val }),
  });

  const newName = ref('');
  const rightTagData = ref<TagInterface>();

  function handleTagMenu(menu, tag: TagInterface) {
    recordOperation({ module: '首页', operation: `右键${menu}标签【${tag.name}】` });
    rightTagData.value = tag;
    const actions = {
      [t('common.reName')]: () => {
        tag.isRename = true;
        newName.value = tag.name;
      },
      [t('common.edit')]: () => router.push(`/manage/editTag/${tag.id}`),
      [t('common.delete')]: () => handleDeleteTag(tag),
      [t('home.menuAddBookmark')]: () => router.push(`/manage/editBookmark/add/${tag.id}`),
    };
    actions[menu]?.();
  }

  const handleDeleteTag = (tag: TagInterface) => {
    Alert.alert({
      title: t('common.defaultTitle'),
      content: t('home.delTagConfirm', { name: tag.name }),
      onOk() {
        apiBasePost('/api/bookmark/delTag', { id: tag.id }).then((res) => {
          if (res.status === 200) {
            message.success(t('common.deleteSuccess'));
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
          message.success(t('home.renameSuccess'));
          bookmark.refreshTag();
        }
      });
    }
  }

  function handleClickTag(tag: TagInterface) {
    bookmark.isFold = true;
    if (tag.id === router.currentRoute.value.params?.id) {
      bookmark.refreshData();
    } else {
      bookmark.type = 'normal';
      router.push({ path: `/home/${tag.id}` }).then(() => {
        bookmark.refreshData();
      });
    }
  }

  function handleViewAll() {
    bookmark.isFold = true;
    bookmark.type = 'all';
    bookmark.tagData = null;
    bookmark.bookmarkSearch = '';
    router.replace('/home').then(() => bookmark.refreshData());
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
    filterTagList,
    (val) => {
      visibleDragTagList.value = [...val];
    },
    { immediate: true },
  );
</script>

<style lang="less" scoped>
  .filter-panel {
    min-width: 0;
    width: 100%;
    height: 100%;
  }

  .header-input {
    width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .header-input :deep(.category-body) {
    min-height: 0;
    height: auto !important;
    flex: 1;
  }

  .filter-tools {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .filter-all-entry,
  .mobile-empty-tag-toggle {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    display: flex;
    align-items: center;
  }

  .filter-all-entry {
    height: 42px;
    justify-content: flex-start;
    gap: 9px;
    padding: 0 10px;
    color: var(--text-color);
    background: transparent;

    &.active {
      color: var(--resource-bookmark-color, #615ced);
      background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 10%, transparent);
    }
  }

  .filter-all-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 600;
  }

  .filter-all-count,
  .tag-item-count {
    margin-left: auto;
    color: var(--desc-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .mobile-empty-tag-toggle {
    min-height: 36px;
    justify-content: space-between;
    padding: 0 10px;
    border-top: 1px solid color-mix(in srgb, var(--card-border-color) 58%, transparent);
    color: var(--desc-color);
    font-size: 12px;
  }

  .tag-item-name {
    min-width: 0;
    flex: 1;
  }

  .tag-skeleton-wrap {
    width: 100%;
    height: 100%;
    min-height: 0;
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
    height: auto;
    min-height: 260px;
    flex: 1;
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
      height: 100%;
      padding: 0;
    }

    .tag-skeleton-wrap {
      width: 100%;
    }

    .category-item {
      width: 100%;
      min-height: 44px;
      margin: 2px 0;
      padding: 7px 10px;

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
