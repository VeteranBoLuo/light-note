<template>
  <ResourcePageShell
    :title="title"
    :subtitle="subtitle"
    accent="bookmark"
    :show-header="showHeader"
    :show-back="showHeader"
    @back="backRouterPage"
  >
    <template v-if="showActions" #actions>
      <slot name="actions" :data-list="dataList">
        <BButton type="primary" @click="$emit('add')" v-click-log="OPERATION_LOG_MAP.bookmarkMg.toAddBtn">
          {{ $t('common.add') }}
        </BButton>
      </slot>
    </template>
    <div class="edit-list-container">
      <BInput
        v-model:value="searchValue"
        class="table-search-input"
        :placeholder="placeholder || $t('common.searchContent')"
      >
        <template #prefix>
          <SvgIcon color="var(--desc-color)" :src="icon.navigation.search" size="16" />
        </template>
      </BInput>
      <div class="list-body">
        <div
          v-if="loading"
          class="phone-list-skeleton"
          :aria-label="$t('bookmarkMg.loadingState.title')"
          aria-busy="true"
        >
          <MobileListSurface>
            <MobileListRow v-for="index in 6" :key="`phone-bookmark-skeleton-${index}`">
              <span class="phone-skeleton-item">
                <span class="phone-skeleton-icon"></span>
                <span class="phone-skeleton-lines">
                  <span class="phone-skeleton-line phone-skeleton-line--title"></span>
                  <span class="phone-skeleton-line phone-skeleton-line--meta"></span>
                </span>
              </span>
            </MobileListRow>
          </MobileListSurface>
        </div>
        <div v-else-if="error" class="list-status" role="alert">
          <span class="list-status-icon list-status-icon--error">
            <SvgIcon :src="icon.message.warning" color="currentColor" size="24" aria-hidden="true" />
          </span>
          <strong>{{ $t('bookmarkMg.loadErrorTitle') }}</strong>
          <span>{{ $t('bookmarkMg.loadErrorDesc') }}</span>
          <BButton size="small" type="primary" @click="$emit('retry')">{{ $t('bookmarkMg.retryLoad') }}</BButton>
        </div>
        <MobileListSurface v-else-if="dataList.length">
          <MobileListRow
            v-for="item in dataList"
            :key="item.id || item.name"
            interactive
            :complex="Boolean(item.hasSnapshot || item.hasSummary)"
            :selected="selectedKeys.includes(String(item.id || item.name))"
            class="list-item"
            @click="$emit('item-click', item)"
          >
            <slot name="item" :data="item" />
          </MobileListRow>
        </MobileListSurface>
        <div v-else class="list-status">
          <span class="list-status-icon">
            <SvgIcon
              :src="hasSearch ? icon.navigation.search : icon.resource.bookmark"
              color="currentColor"
              size="24"
              aria-hidden="true"
            />
          </span>
          <strong>
            {{ hasSearch ? $t('bookmarkMg.emptyResultsTitle') : $t('bookmarkMg.emptyLibraryTitle') }}
          </strong>
          <span>
            {{ hasSearch ? $t('bookmarkMg.emptyResultsDesc') : $t('bookmarkMg.emptyLibraryDesc') }}
          </span>
          <BButton v-if="hasSearch" size="small" type="primary" @click="searchValue = ''">
            {{ $t('bookmarkMg.clearFilters') }}
          </BButton>
          <BButton v-else size="small" type="primary" @click="$emit('add')">{{ $t('common.add') }}</BButton>
        </div>
      </div>
    </div>
  </ResourcePageShell>
</template>

<script lang="ts" setup>
  import { computed, ref, type PropType } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import ResourcePageShell from '@/components/base/ResourcePageShell.vue';
  import icon from '@/config/icon.ts';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { backRouterPage } from '@/utils/common';

  const props = defineProps({
    title: {
      type: String,
      default: '',
    },
    loading: {
      type: Boolean,
      default: false,
    },
    error: {
      type: Boolean,
      default: false,
    },
    placeholder: {
      type: String,
      default: '',
    },
    subtitle: {
      type: String,
      default: '',
    },
    listData: {
      type: Array as PropType<Record<string, any>[]>,
      default: () => [],
    },
    selectedKeys: {
      type: Array as PropType<string[]>,
      default: () => [],
    },
    showActions: {
      type: Boolean,
      default: true,
    },
    showHeader: {
      type: Boolean,
      default: true,
    },
  });
  defineEmits<{
    (event: 'add'): void;
    (event: 'retry'): void;
    (event: 'item-click', item: Record<string, any>): void;
  }>();
  const searchValue = ref('');
  const hasSearch = computed(() => Boolean(searchValue.value.trim()));
  const dataList = computed(() => {
    if (hasSearch.value) {
      return props.listData.filter((data: any) => {
        return String(data?.name || '')
          .toLowerCase()
          .includes(searchValue.value.toLowerCase());
      });
    } else {
      return props.listData;
    }
  });
</script>

<style lang="less" scoped>
  .edit-list-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    padding: 12px;
  }

  .table-search-input {
    width: 100%;
  }
  .table-search-input :deep(.b-input) {
    min-height: var(--mobile-touch-size, 44px);
  }
  .list-body {
    margin-top: 10px;
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: auto;
    border-radius: 10px;
  }
  .list-item {
    position: relative;
    flex: 0 0 auto;
  }

  .phone-list-skeleton {
    display: block;
  }

  .phone-skeleton-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    pointer-events: none;
  }

  .phone-skeleton-icon,
  .phone-skeleton-line {
    display: block;
    background: color-mix(in srgb, var(--resource-bookmark-color) 9%, var(--bl-input-noBorder-bg-color));
    animation: phone-bookmark-skeleton 1.2s ease-in-out infinite alternate;
  }

  .phone-skeleton-icon {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    border-radius: 8px;
  }

  .phone-skeleton-lines {
    display: grid;
    flex: 1;
    gap: 6px;
  }

  .phone-skeleton-line {
    height: 8px;
    border-radius: 999px;
  }

  .phone-skeleton-line--title {
    width: 62%;
  }

  .phone-skeleton-line--meta {
    width: 38%;
  }

  @keyframes phone-bookmark-skeleton {
    from {
      opacity: 0.5;
    }
    to {
      opacity: 0.9;
    }
  }

  .list-status {
    min-height: 180px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    box-sizing: border-box;
    color: var(--desc-color);
    font-size: 14px;
    text-align: center;

    strong {
      color: var(--text-color);
      font-size: 15px;
      font-weight: 650;
    }

    > span:not(.list-status-icon) {
      max-width: 300px;
      font-size: 12px;
      line-height: 1.6;
    }

    .b_btn {
      margin-top: 8px;
    }
  }

  .list-status-icon {
    display: grid;
    width: 46px;
    height: 46px;
    margin-bottom: 4px;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--resource-bookmark-color) 22%, var(--surface-border-color));
    border-radius: 13px;
    background: color-mix(in srgb, var(--resource-bookmark-color) 10%, var(--card-background));
    color: var(--resource-bookmark-color);
  }

  .list-status-icon--error {
    border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 24%, var(--surface-border-color));
    background: color-mix(in srgb, var(--warning-color, #f59e0b) 10%, var(--card-background));
    color: var(--warning-color, #f59e0b);
  }

  @media (prefers-reduced-motion: reduce) {
    .phone-skeleton-icon,
    .phone-skeleton-line {
      animation: none;
      opacity: 0.72;
    }
  }
</style>
