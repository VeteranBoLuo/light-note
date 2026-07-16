<template>
  <BPopover v-model:open="filterVisible" trigger="click" placement="bottom-right">
    <BButton
      class="noteType-select"
      :class="{ active: filterVisible || tag !== undefined }"
      v-click-log="OPERATION_LOG_MAP.noteLibrary.filterNote"
    >
      <div class="filter-label text-hidden">{{ viewNoteFilter }}</div>
      <svg-icon :src="icon.arrow_left" :style="{ rotate: filterVisible ? '-90deg' : '90deg' }" />
    </BButton>
    <template #content>
      <div class="filter-container">
        <div class="fixed-section">
          <div class="filter-header">
            <BInput
              class="tag-filter-input"
              size="small"
              :placeholder="$t('note.searchTag')"
              v-model:value="keyword"
              allow-clear
            />
            <span class="clear-action" @click.stop="(viewNote('all'), (keyword = ''))">{{
              $t('note.clearFilter')
            }}</span>
          </div>

          <div class="filter-item" @click.stop="viewNote('all')" :isFocus="tag === undefined ? true : false">{{
            $t('note.allNote')
          }}</div>
          <div class="filter-item" @click.stop="viewNote('null')" :isFocus="tag === 'null'">{{
            t('note.noTagNote')
          }}</div>
          <div class="divider"></div>
        </div>

        <div class="scrollable-section">
          <div v-if="filteredTags.length === 0" class="filter-empty">{{ $t('note.noTag') }}</div>
          <div
            :title="item.name"
            v-for="item in filteredTags"
            :key="item.id"
            class="filter-item"
            @click.stop="viewNote(item.id)"
            :isFocus="tag === item.id"
          >
            <span class="text-hidden"> # {{ item.name }} </span>
            <span class="check-mark" v-if="tag === item.id">✓</span>
          </div>
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
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import { computed, ref } from 'vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import router from '@/router';

  const props = defineProps({
    allTags: {
      type: Array as () => Array<{ id: string; name: string }>,
      default: () => [],
    },
  });

  const filterVisible = ref(false);
  const keyword = ref('');

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
    if (tag === 'all') {
      router.push(`/noteLibrary`);
    } else {
      router.push(`/noteLibrary?tag=${encodeURIComponent(tag)}`);
    }
    filterVisible.value = false;
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
      font-size: 12px;
      color: var(--resource-note-color, #00a884);
      cursor: pointer;
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
    padding-left: 10px;
    box-sizing: border-box;
    border-radius: 8px;
    width: 100%;
    height: 30px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    cursor: pointer;
    @media (min-width: 600px) {
      &:hover {
        background: color-mix(in srgb, var(--resource-note-color, #00a884) 9%, transparent);
        color: var(--resource-note-color, #00a884);
      }
    }
  }
  [isFocus='true'] {
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 10%, transparent);
    color: var(--resource-note-color, #00a884);
  }
  .filter-empty {
    padding: 8px 10px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .check-mark {
    margin-left: auto;
    padding-right: 10px;
    color: var(--resource-note-color, #00a884);
    font-size: 12px;
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
