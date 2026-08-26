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
          <b-input id="ref1" v-model:value="tagName" class="tag-search-input" :placeholder="$t('home.tagSearch')">
            <template #prefix>
              <svg-icon :src="icon.navigation.search" size="16" />
            </template>
            <template v-if="!bookmark.isMobile" #suffix>
              <b-tooltip :title="hideEmptyTags ? $t('home.hideEmptyTags') : $t('home.showEmptyTags')">
                <BSwitch v-model:checked="hideEmptyTags" />
              </b-tooltip>
            </template>
          </b-input>
          <div v-if="bookmark.isMobile" class="mobile-empty-tag-toggle">
            <span>{{ $t('home.hideEmptyTags') }}</span>
            <BSwitch v-model:checked="hideEmptyTags" />
          </div>
          <BButton
            v-if="bookmark.isMobile"
            class="filter-all-entry"
            :class="{ active: bookmark.type === 'all' }"
            :aria-current="bookmark.type === 'all' ? 'true' : undefined"
            @click="handleViewAll"
          >
            <svg-icon size="18" :src="icon.resource.bookmark" />
            <span class="filter-all-label">{{ $t('home.allBookmarks') }}</span>
            <SvgIcon
              v-if="bookmark.type === 'all'"
              class="tag-item-check"
              :src="icon.filterPanel.check"
              size="16"
              aria-hidden="true"
            />
            <span class="filter-all-count">{{ user.bookmarkTotal || bookmark.bookmarkList.length }}</span>
          </BButton>
        </div>
      </template>
      <template #item="{ item }: { item: TagInterface }">
        <BActionMenu
          v-if="!item.isRename"
          class="bookmark-tag-action-menu"
          :items="tagContextMenu"
          :triggers="tagMenuTriggers"
          placement="right-start"
          :disabled="!bookmark.isDesktop || isTagDragging"
          @select="(action, source) => handleTagMenu(action, item, source)"
        >
          <div
            class="category-item"
            :class="{ 'is-current': String((bookmark.tagData as any)?.id || '') === String(item.id) }"
            :title="tagDraggable ? t('home.dragTagHint') : undefined"
            :aria-current="String((bookmark.tagData as any)?.id || '') === String(item.id) ? 'true' : undefined"
            role="button"
            tabindex="0"
            :key="item.id"
            v-click-log="{ module: '首页', operation: `查询标签【${item.name}】下的书签列表` }"
            @click="handleClickTag(<TagInterface>item)"
            @keydown.enter.prevent="handleClickTag(<TagInterface>item)"
            @keydown.space.prevent="handleClickTag(<TagInterface>item)"
          >
            <svg-icon
              :size="bookmark.isMobile ? 18 : 17"
              :src="item.iconUrl ? item.iconUrl : icon.manage_categoryBtn_tag"
              class="tag-item-icon"
            />
            <span class="text-hidden tag-item-name">{{ item.name }}</span>
            <SvgIcon
              v-if="bookmark.isMobile && String((bookmark.tagData as any)?.id || '') === String(item.id)"
              class="tag-item-check"
              :src="icon.filterPanel.check"
              size="16"
              aria-hidden="true"
            />
            <span v-if="bookmark.isMobile" class="tag-item-count">{{ item.bookmarkList?.length || 0 }}</span>
          </div>
        </BActionMenu>
        <b-input v-else class="edit-input" v-model:value="newName" @keydown.esc="cancelRename(<TagInterface>item)">
          <template #suffix>
            <svg-icon
              :src="icon.filterPanel.check"
              size="18"
              @click="handleRename(<TagInterface>item)"
              class="dom-hover"
            />
            <svg-icon
              :src="icon.common.close"
              size="16"
              style="margin-left: 6px"
              @click="cancelRename(<TagInterface>item)"
              class="dom-hover"
            />
          </template>
        </b-input>
      </template>
      <template #empty>
        <div class="empty-tag-prompt">
          <!-- 搜索无命中 ≠ 没有标签:搜索时不引导"创建第一个标签" -->
          <div v-if="tagName.trim()" class="empty-card">
            <h3>{{ $t('home.noTagMatch') }}</h3>
          </div>
          <div v-else class="empty-card">
            <h3>{{ $t('home.noTags') }}</h3>
            <div>{{ $t('home.createFirstTag') }}</div>
            <br />
            <b-button size="small" type="primary" @click="router.push('/manage/editTag/add')">{{
              $t('home.addTag')
            }}</b-button>
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
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import type {
    BActionMenuItem,
    BActionMenuSource,
    BActionMenuTrigger,
  } from '@/components/base/BasicComponents/actionMenu';
  import { TagInterface } from '@/config/bookmarkCfg.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import BList from '@/components/base/BasicComponents/BList.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { recordOperation } from '@/api/commonApi.ts';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';

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
  const isTagDragging = ref(false);
  const tagDraggable = computed(
    () => !bookmark.isMobile && !tagName.value.trim() && visibleDragTagList.value.length > 1,
  );

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const router = useRouter();
  const tagMenuTriggers: BActionMenuTrigger[] = ['hover', 'contextmenu'];
  const tagContextMenu = computed<BActionMenuItem[]>(() => [
    { key: 'addBookmark', label: t('home.menuAddBookmark'), icon: icon.manage_categoryBtn_bookmark },
    { key: 'rename', label: t('common.reName'), icon: icon.cloudSpace.rename },
    { key: 'edit', label: t('common.edit'), icon: icon.table_edit },
    { key: 'tag-actions-divider', divider: true },
    { key: 'delete', label: t('common.delete'), icon: icon.table_delete, danger: true },
  ]);

  const hideEmptyTags = computed({
    get: () => user.preferences.hideEmptyTags ?? false,
    set: (val: boolean) => updatePreference({ hideEmptyTags: val }),
  });

  const newName = ref('');
  const rightTagData = ref<TagInterface>();

  function handleTagMenu(action: string, tag: TagInterface, source: BActionMenuSource = 'contextmenu') {
    const actionLabel = tagContextMenu.value.find((item: any) => item.key === action)?.label || action;
    const sourceLabel: Record<BActionMenuSource, string> = {
      hover: '悬浮菜单',
      contextmenu: '右键菜单',
      click: '点击菜单',
      keyboard: '键盘菜单',
    };
    recordOperation({
      module: '首页',
      operation: `${sourceLabel[source]}${actionLabel}标签【${tag.name}】`,
    });
    rightTagData.value = tag;
    const actions = {
      rename: () => {
        tag.isRename = true;
        newName.value = tag.name;
      },
      edit: () => navigateFromMobileFilter(() => router.push(`/manage/editTag/${tag.id}`)),
      delete: () => handleDeleteTag(tag),
      addBookmark: () => navigateFromMobileFilter(() => router.push(`/manage/editBookmark/add/${tag.id}`)),
    };
    void actions[action]?.();
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
    // 空名此前静默 return,输入框永远停在编辑态;现在给出提示
    if (!newName.value || !newName.value.trim()) {
      message.warning(t('home.tagNameRequired'));
      return;
    }
    apiBasePost('/api/bookmark/updateTag', {
      name: newName.value.trim(),
      id: tag.id,
    }).then((res) => {
      if (res.status == 200) {
        tag.isRename = !tag.isRename;
        message.success(t('home.renameSuccess'));
        bookmark.refreshTag();
      }
    });
  }

  function cancelRename(tag: TagInterface) {
    tag.isRename = false;
  }

  function navigateFromMobileFilter<T>(navigate: () => T | Promise<T>) {
    if (!bookmark.isMobile) return navigate();
    return closeCurrentMobileOverlayThen(() => {
      bookmark.isFold = true;
    }, navigate);
  }

  async function handleClickTag(tag: TagInterface) {
    if (tag.id === router.currentRoute.value.params?.id) {
      bookmark.isFold = true;
      bookmark.refreshData();
    } else {
      bookmark.type = 'normal';
      await navigateFromMobileFilter(() => router.push({ path: `/home/${tag.id}` }));
      bookmark.refreshData();
    }
  }

  async function handleViewAll() {
    bookmark.type = 'all';
    bookmark.tagData = null;
    bookmark.bookmarkSearch = '';
    await navigateFromMobileFilter(() => router.replace('/home'));
    bookmark.refreshData();
  }
  function onStart() {
    isTagDragging.value = true;
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
    isTagDragging.value = false;
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

  :deep(.tag-search-input .b-input) {
    border: 1px solid color-mix(in srgb, var(--surface-border-color) 72%, transparent) !important;
    background: color-mix(
      in srgb,
      var(--bl-input-noBorder-bg-color) 70%,
      var(--bl-input-noBorder-hover-bg-color) 30%
    ) !important;
    box-shadow: none !important;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      background 0.18s ease;

    &:hover {
      border-color: color-mix(
        in srgb,
        var(--resource-bookmark-color, #615ced) 22%,
        var(--surface-border-color)
      ) !important;
      background: color-mix(
        in srgb,
        var(--bl-input-noBorder-bg-color) 30%,
        var(--bl-input-noBorder-hover-bg-color) 70%
      ) !important;
    }

    &:focus-visible {
      border-color: color-mix(
        in srgb,
        var(--resource-bookmark-color, #615ced) 48%,
        var(--surface-border-color)
      ) !important;
      background: var(--bl-input-noBorder-hover-bg-color) !important;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--resource-bookmark-color, #615ced) 8%, transparent) !important;
    }
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
    min-height: 52px;
    justify-content: flex-start;
    gap: 9px;
    padding: 0 10px;
    border: 1px solid transparent;
    color: var(--text-color);
    background: transparent;

    &.active {
      border-color: var(--resource-bookmark-color, #615ced);
      color: var(--resource-bookmark-color, #615ced);
      background: var(--mobile-selected-bg);
      font-weight: 650;
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
    width: 34px;
    flex: 0 0 34px;
    color: var(--desc-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .filter-all-label,
  .tag-item-name {
    margin-right: auto;
  }

  .tag-item-check {
    flex: 0 0 auto;
    color: var(--resource-bookmark-color, #615ced);
  }

  .mobile-empty-tag-toggle {
    min-height: 44px;
    justify-content: space-between;
    padding: 0 10px;
    border-bottom: 1px solid var(--surface-divider-color);
    color: var(--desc-color);
    font-size: 12px;
  }

  .tag-item-name {
    min-width: 0;
    flex: 1;
  }

  .tag-item-icon {
    flex: 0 0 auto;
  }

  .bookmark-tag-action-menu {
    display: block;
    width: 100%;
  }

  // 书签标签由 BList 的 slot 渲染，不会继承 BList scoped 样式里的 14px，
  // 此前实际回退成页面默认 16px。桌面端在这里与笔记、云空间侧栏统一为紧凑扫描密度；
  // 移动抽屉继续由下方规则保留 54px 触控高度和更舒展的字号。
  @media (min-width: 768px) {
    .category-item {
      position: relative;
      height: 34px;
      margin: 2px 0;
      padding: 0 8px;
      gap: 8px;
      color: var(--desc-color);
      font-size: 13px;
      font-weight: 400;
      line-height: 1.2;
      transition:
        color 160ms ease,
        background 160ms ease;

      &:hover {
        color: var(--resource-bookmark-color, #615ced);
        background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 7%, transparent);
      }

      &:focus-visible {
        color: var(--resource-bookmark-color, #615ced);
        background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 7%, transparent);
        outline: 2px solid var(--resource-bookmark-color, #615ced);
        outline-offset: -2px;
      }

      &.is-current {
        color: var(--resource-bookmark-color, #615ced);
        background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 10%, var(--workspace-panel-bg-color));
        font-weight: 600;

        &::before {
          position: absolute;
          top: 7px;
          bottom: 7px;
          left: 2px;
          width: 3px;
          border-radius: 999px;
          background: var(--resource-bookmark-color, #615ced);
          content: '';
        }
      }
    }

    .bookmark-tag-action-menu.is-menu-open .category-item:not(.is-current) {
      color: var(--resource-bookmark-color, #615ced);
      background: color-mix(in srgb, var(--resource-bookmark-color, #615ced) 7%, transparent);
    }
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

    .filter-tools {
      position: sticky;
      z-index: 2;
      top: 0;
      padding-bottom: 4px;
      background: var(--card-background);
    }

    .category-item {
      width: 100%;
      min-height: 54px;
      margin: 0;
      padding: 8px 10px;
      border-left: 3px solid transparent;
      border-radius: 8px;

      &:hover {
        background-color: unset;
      }

      &.is-current {
        border-left-color: var(--resource-bookmark-color, #615ced);
        color: var(--resource-bookmark-color, #615ced);
        background: var(--mobile-selected-bg) !important;
        font-weight: 650;
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
      background: transparent;
      padding: 24px 12px;
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

      .b_btn {
        width: 100%;
      }
    }
  }
</style>
