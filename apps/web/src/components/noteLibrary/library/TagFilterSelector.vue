<template>
  <template v-if="bookmark.isMobile">
    <BButton
      class="noteType-select"
      :class="{
        active: filterVisible || tag !== undefined || pendingOnly,
        'is-compact': compact,
        'has-pending': pendingOnly,
      }"
      :aria-expanded="filterVisible"
      :aria-label="`${t('note.tagsTab')}：${viewNoteFilter}${pendingOnly ? ' · ' + t('inbox.pendingBadge') : ''}`"
      :title="viewNoteFilter"
      @click="filterVisible = true"
      v-click-log="OPERATION_LOG_MAP.noteLibrary.filterNote"
    >
      <SvgIcon :src="icon.resource.tag" :size="compact ? 18 : 16" aria-hidden="true" />
      <span v-if="!compact || pendingOnly" class="filter-label text-hidden">{{
        pendingOnly ? t('inbox.pendingBadge') : viewNoteFilter
      }}</span>
      <SvgIcon
        class="filter-chevron"
        :class="{ 'is-open': filterVisible }"
        :src="icon.noteTree.chevron"
        :size="compact ? 10 : 14"
        aria-hidden="true"
      />
    </BButton>
    <BDrawer
      :open="filterVisible"
      :title="t('note.filterTitle')"
      placement="bottom"
      height="min(72dvh, 620px)"
      body-padding="0"
      @close="filterVisible = false"
    >
      <template #header-actions>
        <BButton
          v-if="pendingOnly || tag !== undefined"
          class="clear-action clear-action--mobile"
          @click.stop="clearFilters"
          >{{ t('note.filterClear') }}</BButton
        >
      </template>
      <div class="filter-container filter-container--mobile" role="group" :aria-label="t('note.tagDirectory')">
        <div class="fixed-section">
          <div class="pending-row">
            <span>{{ t('inbox.pendingFilter') }}</span>
            <BSwitch
              :checked="pendingOnly"
              controlled
              :aria-label="t('inbox.pendingFilter')"
              @change="setPendingOnly"
            />
          </div>

          <div class="filter-header">
            <BInput
              class="tag-filter-input"
              size="small"
              :placeholder="$t('note.searchTag')"
              v-model:value="keyword"
              allow-clear
            >
              <template #prefix><SvgIcon :src="icon.navigation.search" :size="16" aria-hidden="true" /></template>
            </BInput>
          </div>

          <BButton
            v-if="!keyword.trim()"
            class="filter-item"
            :aria-pressed="tag === undefined"
            :class="{ 'is-selected': tag === undefined }"
            @click.stop="viewNote('all')"
          >
            <span>{{ $t('tagSpace.allTags') }}</span>
            <SvgIcon v-if="tag === undefined" class="check-mark" :src="icon.filterPanel.check" size="16" />
          </BButton>
          <BButton
            v-if="!keyword.trim()"
            class="filter-item"
            :aria-pressed="tag === 'null'"
            :class="{ 'is-selected': tag === 'null' }"
            @click.stop="viewNote('null')"
          >
            <span>{{ t('note.noTagNote') }}</span>
            <SvgIcon v-if="tag === 'null'" class="check-mark" :src="icon.filterPanel.check" size="16" />
          </BButton>
          <div v-if="!keyword.trim()" class="divider"></div>
        </div>

        <div class="scrollable-section">
          <div v-if="filteredTags.length === 0" class="filter-empty" role="status">
            <SvgIcon :src="icon.navigation.search" :size="28" aria-hidden="true" />
            <span>{{ t(keyword.trim() ? 'note.noMatchingTag' : 'note.noTag') }}</span>
            <small v-if="keyword.trim()">{{ t('note.tryTagKeyword') }}</small>
          </div>
          <BButton
            :title="item.name"
            v-for="item in filteredTags"
            :key="item.id"
            class="filter-item"
            :aria-pressed="tag === item.id"
            :class="{ 'is-selected': tag === item.id }"
            @click.stop="viewNote(item.id)"
          >
            <span class="tag-prefix" aria-hidden="true">#</span><span class="text-hidden">{{ item.name }}</span>
            <SvgIcon v-if="tag === item.id" class="check-mark" :src="icon.filterPanel.check" size="16" />
          </BButton>
        </div>
      </div>
    </BDrawer>
  </template>

  <BPopover v-else v-model:open="filterVisible" trigger="click" placement="bottom-right">
    <BButton
      class="noteType-select"
      :class="{
        active: filterVisible || tag !== undefined || pendingOnly,
        'is-compact': compact,
        'has-pending': pendingOnly,
      }"
      :aria-expanded="filterVisible"
      :aria-label="`${t('note.tagsTab')}：${viewNoteFilter}${pendingOnly ? ' · ' + t('inbox.pendingBadge') : ''}`"
      :title="viewNoteFilter"
      v-click-log="OPERATION_LOG_MAP.noteLibrary.filterNote"
    >
      <SvgIcon :src="icon.resource.tag" :size="compact ? 18 : 16" aria-hidden="true" />
      <span class="filter-label text-hidden">{{
        pendingOnly
          ? tag === undefined
            ? t('inbox.pendingBadge')
            : t('inbox.pendingBadge') + ' · ' + viewNoteFilter
          : viewNoteFilter
      }}</span>
      <SvgIcon
        class="filter-chevron"
        :class="{ 'is-open': filterVisible }"
        :src="icon.noteTree.chevron"
        :size="compact ? 10 : 14"
        aria-hidden="true"
      />
    </BButton>
    <template #content>
      <div class="filter-container" role="group" :aria-label="t('note.tagDirectory')">
        <div class="fixed-section">
          <div class="filter-title-row">
            <strong class="filter-title">{{ t('note.filterTitle') }}</strong>
            <BButton v-if="pendingOnly || tag !== undefined" class="clear-action" @click.stop="clearFilters">{{
              t('note.filterClear')
            }}</BButton>
          </div>
          <div class="pending-row">
            <span>{{ t('inbox.pendingFilter') }}</span>
            <BSwitch
              :checked="pendingOnly"
              controlled
              :aria-label="t('inbox.pendingFilter')"
              @change="setPendingOnly"
            />
          </div>

          <div class="filter-header">
            <BInput
              class="tag-filter-input"
              size="small"
              :placeholder="$t('note.searchTag')"
              v-model:value="keyword"
              allow-clear
            >
              <template #prefix><SvgIcon :src="icon.navigation.search" :size="16" aria-hidden="true" /></template>
            </BInput>
          </div>

          <BButton
            v-if="!keyword.trim()"
            class="filter-item"
            :aria-pressed="tag === undefined"
            :class="{ 'is-selected': tag === undefined }"
            @click.stop="viewNote('all')"
          >
            <span>{{ $t('tagSpace.allTags') }}</span>
            <SvgIcon v-if="tag === undefined" class="check-mark" :src="icon.filterPanel.check" size="16" />
          </BButton>
          <BButton
            v-if="!keyword.trim()"
            class="filter-item"
            :aria-pressed="tag === 'null'"
            :class="{ 'is-selected': tag === 'null' }"
            @click.stop="viewNote('null')"
          >
            <span>{{ t('note.noTagNote') }}</span>
            <SvgIcon v-if="tag === 'null'" class="check-mark" :src="icon.filterPanel.check" size="16" />
          </BButton>
          <div v-if="!keyword.trim()" class="divider"></div>
        </div>

        <div class="scrollable-section">
          <div v-if="filteredTags.length === 0" class="filter-empty" role="status">
            <SvgIcon :src="icon.navigation.search" :size="28" aria-hidden="true" />
            <span>{{ t(keyword.trim() ? 'note.noMatchingTag' : 'note.noTag') }}</span>
            <small v-if="keyword.trim()">{{ t('note.tryTagKeyword') }}</small>
          </div>
          <BButton
            v-for="item in filteredTags"
            :key="item.id"
            :title="item.name"
            class="filter-item"
            :aria-pressed="tag === item.id"
            :class="{ 'is-selected': tag === item.id }"
            @click.stop="viewNote(item.id)"
          >
            <span class="tag-prefix" aria-hidden="true">#</span><span class="text-hidden">{{ item.name }}</span>
            <SvgIcon v-if="tag === item.id" class="check-mark" :src="icon.filterPanel.check" size="16" />
          </BButton>
        </div>
      </div>
    </template>
  </BPopover>
</template>

<script lang="ts" setup>
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n();
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import { computed, ref } from 'vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { useRouter } from 'vue-router';
  import { bookmarkStore } from '@/store';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';

  const props = withDefaults(
    defineProps<{
      allTags?: Array<{ id: string; name: string }>;
      compact?: boolean;
    }>(),
    {
      allTags: () => [],
      compact: false,
    },
  );
  const emit = defineEmits<{ select: [key: 'all' | 'null' | string] }>();

  const router = useRouter();
  const filterVisible = ref(false);
  const keyword = ref('');
  const bookmark = bookmarkStore();

  const filteredTags = computed(() => {
    if (!keyword.value.trim()) return props.allTags;
    const lower = keyword.value.trim().toLowerCase();
    return props.allTags.filter((t) => t.name.toLowerCase().includes(lower));
  });

  const viewNoteFilter = computed(() => {
    if (tag.value === undefined) {
      return t('note.allNote');
    }
    if (tag.value === 'null') {
      return t('note.noTagNote');
    }
    const found = props.allTags.find((t) => t.id === tag.value);
    return found ? found.name : tag.value;
  });

  const pendingOnly = computed(() => router.currentRoute.value.query.pending === '1');
  function setPendingOnly(value: boolean) {
    const query = { ...router.currentRoute.value.query };
    delete query.preview;
    if (value) query.pending = '1';
    else delete query.pending;
    navigateFilter(query);
  }

  function clearFilters() {
    const query = { ...router.currentRoute.value.query };
    delete query.pending;
    delete query.tag;
    delete query.preview;
    delete query._rt;
    keyword.value = '';
    navigateFilter(query);
  }

  function navigateFilter(query: typeof router.currentRoute.value.query) {
    const navigate = () => router.replace({ query });
    if (bookmark.isMobile) {
      void closeCurrentMobileOverlayThen(() => {
        filterVisible.value = false;
      }, navigate);
    } else {
      void navigate();
    }
  }

  const tag = computed(() => {
    return router.currentRoute.value.query.tag;
  });

  function viewNote(tag?: 'all' | 'null' | any) {
    const query = { ...router.currentRoute.value.query };
    delete query.preview;
    delete query._rt;
    if (tag === 'all') {
      delete query.tag;
    } else {
      query.tag = String(tag);
    }
    emit('select', tag === 'all' || tag === undefined ? 'all' : String(tag));
    const navigate = () => router.push({ path: '/noteLibrary', query });
    if (bookmark.isMobile) {
      void closeCurrentMobileOverlayThen(() => {
        filterVisible.value = false;
      }, navigate);
      return;
    }
    void navigate();
  }
</script>

<style lang="less" scoped>
  .noteType-select.b_btn {
    height: var(--ui-control-36, 36px);
    padding: 0 var(--ui-space-11, 11px);
    border-radius: 10px;
    border: 1px solid transparent;
    color: var(--text-color);
    background: var(--primary-btn-bg-color);
    display: flex;
    gap: var(--ui-space-6, 6px);

    &:hover {
      border-color: var(--workspace-note-text);
      color: var(--workspace-note-text);
      background: var(--workspace-note-selected);
    }

    &.active {
      border-color: var(--workspace-note-text);
      color: var(--workspace-note-text);
      background: var(--workspace-note-selected);
    }
  }

  .tag-filter-input {
    flex: 1;
    min-width: 0;
  }

  .filter-label {
    max-width: var(--ui-layout-112, 112px);
  }
  .noteType-select.is-compact {
    height: var(--ui-control-36, 36px);
    min-height: var(--ui-control-36, 36px);
    gap: var(--ui-space-3, 3px);
    padding-inline: 0;
  }
  .filter-chevron {
    flex: 0 0 auto;
    opacity: 0.68;
    transform: rotate(0deg);
    transition:
      transform 160ms ease,
      opacity 160ms ease;

    &.is-open {
      transform: rotate(180deg);
    }
  }
  .noteType-select:hover .filter-chevron,
  .noteType-select.active .filter-chevron {
    opacity: 0.88;
  }

  @media (prefers-reduced-motion: reduce) {
    .filter-chevron {
      transition: none;
    }
  }
  .filter-container {
    /* 背景/圆角/阴影由 BPopover 面板统一提供,这里只管尺寸与布局,避免双重卡片 */
    width: var(--ui-layout-280, 280px);
    /* ui-density-fixed: 24px reserves the fixed viewport safety gap, independent of panel density. */
    max-height: min(var(--ui-layout-440, 440px), calc(100vh - 24px));
    /* ui-density-fixed: Keep the same viewport safety gap for the dynamic viewport override. */
    max-height: min(var(--ui-layout-440, 440px), calc(100dvh - 24px));
    padding: var(--ui-space-12, 12px);
    display: flex;
    flex-direction: column;
    gap: 0;
    box-sizing: border-box;
  }
  .filter-container--mobile {
    width: 100%;
    height: 100%;
    max-height: 100%;
    padding: var(--ui-space-8, 8px) var(--ui-space-16, 16px) max(var(--ui-space-16, 16px), env(safe-area-inset-bottom));
  }
  .fixed-section {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .scrollable-section {
    margin-top: var(--ui-space-5, 5px);
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0;
    min-height: 0; /* Allow flex item to shrink below content size */
  }
  .divider {
    width: 100%;
    height: 1px;
    background: var(--surface-divider-color);
    flex-shrink: 0;
  }
  .filter-header {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-4, 4px) 0;
  }
  .clear-action {
    width: auto;
    height: var(--ui-control-28, 28px);
    padding: 0 var(--ui-space-4, 4px);
    border: 0 !important;
    background: transparent !important;
    font-size: var(--ui-font-12, 12px);
    color: var(--workspace-note-text);
    white-space: nowrap;
  }

  .filter-item {
    text-align: left;
    color: var(--text-color);
    justify-content: flex-start;
    gap: var(--ui-space-8, 8px);
    padding: 0 var(--ui-space-11, 11px);
    box-sizing: border-box;
    border: 1px solid transparent !important;
    border-radius: 8px;
    width: 100%;
    height: var(--ui-control-36, 36px);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    background: transparent !important;
    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--workspace-note-selected) !important;
        color: var(--workspace-note-text);
      }
    }
  }
  .filter-item.is-selected {
    background: var(--workspace-note-selected) !important;
    color: var(--workspace-note-text);
    font-weight: 500;
  }
  .filter-empty {
    padding: var(--ui-space-24, 24px) var(--ui-space-12, 12px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    color: var(--text-color);
    text-align: center;
    font-size: var(--ui-font-14, 14px);
    small {
      color: var(--desc-color);
      font-size: var(--ui-font-12, 12px);
    }
    > :first-child {
      color: var(--desc-color);
    }
  }
  .filter-title-row,
  .pending-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    min-height: var(--ui-control-36, 36px);
  }
  .filter-title {
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
  }
  .pending-row {
    padding-block: var(--ui-space-8, 8px);
    margin-bottom: var(--ui-space-8, 8px);
    border-bottom: 1px solid var(--surface-divider-color);
    font-size: var(--ui-font-14, 14px);
  }
  .pending-row :deep(.b-switch) {
    --primary-color: var(--workspace-note-text);
  }
  .tag-prefix {
    color: var(--desc-color);
  }
  .filter-header {
    margin-bottom: var(--ui-space-8, 8px);
    color: var(--desc-color);
  }
  .filter-item:focus-visible {
    outline: 2px solid var(--workspace-note-text);
    outline-offset: -2px;
  }
  .scrollable-section {
    overscroll-behavior: contain;
  }
  .check-mark {
    margin-left: auto;
    color: var(--workspace-note-text);
    flex: 0 0 auto;
  }

  .clear-action--mobile {
    /* ui-density-fixed: Mobile header actions retain a 44px touch target. */
    min-height: var(--mobile-touch-size, 44px);
  }
  .filter-container--mobile {
    .pending-row :deep(.b-switch) {
      /* ui-density-fixed: Mobile touch targets remain 44px across desktop density settings. */
      min-height: var(--mobile-touch-size, 44px);
    }
    .filter-header {
      padding: var(--ui-space-2, 2px) 0 var(--ui-space-8, 8px);
    }

    .tag-filter-input :deep(.b-input) {
      /* ui-density-fixed: Mobile touch targets remain 44px across desktop density settings. */
      min-height: var(--mobile-touch-size, 44px);
    }

    .filter-item {
      /* ui-density-fixed: Mobile touch targets remain 44px across desktop density settings. */
      min-height: var(--mobile-touch-size, 44px);
      /* ui-density-fixed: Mobile touch targets remain 44px across desktop density settings. */
      height: var(--mobile-touch-size, 44px);
      font-size: var(--ui-font-14, 14px);
    }

    .scrollable-section {
      gap: var(--ui-space-2, 2px);
    }
  }
</style>
