<template>
  <template v-if="bookmark.isMobile">
    <BButton
      class="noteType-select"
      :class="{ active: filterVisible || tag !== undefined }"
      :aria-expanded="filterVisible"
      @click="filterVisible = true"
      v-click-log="OPERATION_LOG_MAP.noteLibrary.filterNote"
    >
      <span class="filter-label text-hidden">{{ viewNoteFilter }}</span>
      <svg-icon :src="icon.arrow_left" :style="{ rotate: filterVisible ? '-90deg' : '90deg' }" />
    </BButton>
    <BDrawer
      :open="filterVisible"
      :title="t('note.tagDirectory')"
      placement="bottom"
      height="min(72dvh, 620px)"
      body-padding="0"
      @close="filterVisible = false"
    >
      <div class="filter-container filter-container--mobile" role="listbox" :aria-label="t('note.tagDirectory')">
        <div class="fixed-section">
          <div class="filter-header">
            <BInput
              class="tag-filter-input"
              size="small"
              :placeholder="$t('note.searchTag')"
              v-model:value="keyword"
              allow-clear
            />
            <BButton class="clear-action" @click.stop="(viewNote('all'), (keyword = ''))">
              {{ $t('note.clearFilter') }}
            </BButton>
          </div>

          <BButton
            class="filter-item"
            role="option"
            :aria-selected="tag === undefined"
            :class="{ 'is-selected': tag === undefined }"
            @click.stop="viewNote('all')"
          >
            <span>{{ $t('note.allNote') }}</span>
            <SvgIcon v-if="tag === undefined" class="check-mark" :src="icon.filterPanel.check" size="16" />
          </BButton>
          <BButton
            class="filter-item"
            role="option"
            :aria-selected="tag === 'null'"
            :class="{ 'is-selected': tag === 'null' }"
            @click.stop="viewNote('null')"
          >
            <span>{{ t('note.noTagNote') }}</span>
            <SvgIcon v-if="tag === 'null'" class="check-mark" :src="icon.filterPanel.check" size="16" />
          </BButton>
          <div class="divider"></div>
        </div>

        <div class="scrollable-section">
          <div v-if="filteredTags.length === 0" class="filter-empty">{{ $t('note.noTag') }}</div>
          <BButton
            :title="item.name"
            v-for="item in filteredTags"
            :key="item.id"
            class="filter-item"
            role="option"
            :aria-selected="tag === item.id"
            :class="{ 'is-selected': tag === item.id }"
            @click.stop="viewNote(item.id)"
          >
            <span class="text-hidden"> # {{ item.name }} </span>
            <SvgIcon v-if="tag === item.id" class="check-mark" :src="icon.filterPanel.check" size="16" />
          </BButton>
        </div>
      </div>
    </BDrawer>
  </template>

  <BPopover v-else v-model:open="filterVisible" trigger="click" placement="bottom-right">
    <BButton
      class="noteType-select"
      :class="{ active: filterVisible || tag !== undefined }"
      :aria-expanded="filterVisible"
      v-click-log="OPERATION_LOG_MAP.noteLibrary.filterNote"
    >
      <span class="filter-label text-hidden">{{ viewNoteFilter }}</span>
      <svg-icon :src="icon.arrow_left" :style="{ rotate: filterVisible ? '-90deg' : '90deg' }" />
    </BButton>
    <template #content>
      <div class="filter-container" role="listbox" :aria-label="t('note.tagDirectory')">
        <div class="fixed-section">
          <div class="filter-header">
            <BInput
              class="tag-filter-input"
              size="small"
              :placeholder="$t('note.searchTag')"
              v-model:value="keyword"
              allow-clear
            />
            <BButton class="clear-action" @click.stop="(viewNote('all'), (keyword = ''))">
              {{ $t('note.clearFilter') }}
            </BButton>
          </div>

          <BButton
            class="filter-item"
            role="option"
            :aria-selected="tag === undefined"
            :class="{ 'is-selected': tag === undefined }"
            @click.stop="viewNote('all')"
          >
            <span>{{ $t('note.allNote') }}</span>
            <SvgIcon v-if="tag === undefined" class="check-mark" :src="icon.filterPanel.check" size="16" />
          </BButton>
          <BButton
            class="filter-item"
            role="option"
            :aria-selected="tag === 'null'"
            :class="{ 'is-selected': tag === 'null' }"
            @click.stop="viewNote('null')"
          >
            <span>{{ t('note.noTagNote') }}</span>
            <SvgIcon v-if="tag === 'null'" class="check-mark" :src="icon.filterPanel.check" size="16" />
          </BButton>
          <div class="divider"></div>
        </div>

        <div class="scrollable-section">
          <div v-if="filteredTags.length === 0" class="filter-empty">{{ $t('note.noTag') }}</div>
          <BButton
            v-for="item in filteredTags"
            :key="item.id"
            :title="item.name"
            class="filter-item"
            role="option"
            :aria-selected="tag === item.id"
            :class="{ 'is-selected': tag === item.id }"
            @click.stop="viewNote(item.id)"
          >
            <span class="text-hidden"> # {{ item.name }} </span>
            <SvgIcon v-if="tag === item.id" class="check-mark" :src="icon.filterPanel.check" size="16" />
          </BButton>
        </div>
      </div>
    </template>
  </BPopover>
</template>

<script lang="ts" setup>
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
  import router from '@/router';
  import { bookmarkStore } from '@/store';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';

  const props = defineProps({
    allTags: {
      type: Array as () => Array<{ id: string; name: string }>,
      default: () => [],
    },
  });

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

  const tag = computed(() => {
    return router.currentRoute.value.query.tag;
  });

  function viewNote(tag?: 'all' | 'null' | any) {
    const query = { ...router.currentRoute.value.query };
    delete query._rt;
    if (tag === 'all') {
      delete query.tag;
    } else {
      query.tag = String(tag);
    }
    const navigate = () => router.push({ path: '/noteLibrary', query });
    if (bookmark.isMobile) {
      void closeCurrentMobileOverlayThen(
        () => {
          filterVisible.value = false;
        },
        navigate,
      );
      return;
    }
    filterVisible.value = false;
    void navigate();
  }
</script>

<style lang="less" scoped>
  .noteType-select {
    height: 36px;
    padding: 0 11px;
    border-radius: 10px;
    color: var(--text-color);
    background: var(--primary-btn-bg-color);
    display: flex;
    gap: 6px;

    &:hover {
      color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 8%, var(--menu-body-bg-color));
    }

    &.active {
      color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, var(--menu-body-bg-color));
    }
  }

  .filter-label {
    max-width: 112px;
  }
  .filter-container {
    /* 背景/圆角/阴影由 BPopover 面板统一提供,这里只管尺寸与布局,避免双重卡片 */
    width: 200px;
    max-height: 300px;
    padding: 5px;
    display: flex;
    flex-direction: column;
    gap: 0;
    box-sizing: border-box;
  }
  .filter-container--mobile {
    width: 100%;
    max-height: calc(min(72dvh, 620px) - 57px);
    padding: 10px 16px max(18px, env(safe-area-inset-bottom));
  }
  .fixed-section {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .scrollable-section {
    margin-top: 5px;
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-height: 0; /* Allow flex item to shrink below content size */
  }
  .divider {
    width: 100%;
    height: 1px;
    background: #f0f0f0;
    flex-shrink: 0;
  }
  .filter-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
    .clear-action {
      width: auto;
      height: 36px;
      padding: 0 4px;
      border: 0 !important;
      background: transparent !important;
      font-size: 12px;
      color: var(--resource-note-color, #00a884);
      white-space: nowrap;
    }
  }
  .filter-toggle {
    min-height: 28px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
    cursor: pointer;
    user-select: none;
  }
  .filter-item {
    text-align: left;
    color: var(--desc-color);
    justify-content: flex-start;
    padding: 0 10px;
    box-sizing: border-box;
    border: 1px solid transparent !important;
    border-radius: 8px;
    width: 100%;
    height: 30px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    background: transparent !important;
    @media (min-width: 600px) {
      &:hover {
        background: color-mix(in srgb, var(--resource-note-color, #00a884) 9%, transparent);
        color: var(--resource-note-color, #00a884);
      }
    }
  }
  .filter-item.is-selected {
    border-color: var(--resource-note-color, #00a884) !important;
    background: var(--mobile-selected-bg) !important;
    color: var(--resource-note-color, #00a884);
    font-weight: 650;
  }
  .filter-empty {
    padding: 8px 10px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .check-mark {
    margin-left: auto;
    color: var(--resource-note-color, #00a884);
    flex: 0 0 auto;
  }

  .filter-container--mobile {
    .fixed-section {
      position: sticky;
      z-index: 1;
      top: 0;
      background: var(--card-background);
    }

    .filter-header {
      padding: 2px 0 8px;
    }

    .filter-header .clear-action {
      height: var(--mobile-touch-size, 44px);
      min-height: var(--mobile-touch-size, 44px);
    }

    .tag-filter-input :deep(.b-input) {
      min-height: var(--mobile-touch-size, 44px);
    }

    .filter-item {
      min-height: 52px;
      height: 52px;
      font-size: 14px;
    }

    .scrollable-section {
      gap: 2px;
    }
  }
</style>
<style>
  [data-theme='night'] {
    .tag-filter-input {
      .b-input {
        background-color: #100a1685 !important;
      }
    }
  }
</style>
