<template>
  <ResourcePageShell :title="title" :subtitle="subtitle" accent="bookmark" show-back @back="backRouterPage">
    <template #actions>
      <BButton type="primary" @click="$emit('add')" v-click-log="OPERATION_LOG_MAP.bookmarkMg.toAddBtn">
        {{ $t('common.add') }}
      </BButton>
    </template>
    <BCard variant="panel" padding="12px" class="edit-list-container">
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
          <BCard
            v-for="index in 6"
            :key="`phone-bookmark-skeleton-${index}`"
            variant="card"
            padding="0 12px"
            class="list-item phone-skeleton-item"
          >
            <span class="phone-skeleton-icon"></span>
            <span class="phone-skeleton-lines">
              <span class="phone-skeleton-line phone-skeleton-line--title"></span>
              <span class="phone-skeleton-line phone-skeleton-line--meta"></span>
            </span>
          </BCard>
        </div>
        <div v-else-if="error" class="list-status" role="alert">
          <span class="list-status-icon list-status-icon--error">
            <SvgIcon :src="icon.message.warning" color="currentColor" size="24" aria-hidden="true" />
          </span>
          <strong>{{ $t('bookmarkMg.loadErrorTitle') }}</strong>
          <span>{{ $t('bookmarkMg.loadErrorDesc') }}</span>
          <BButton size="small" type="primary" @click="$emit('retry')">{{ $t('bookmarkMg.retryLoad') }}</BButton>
        </div>
        <template v-else-if="dataList.length">
          <BCard
            v-for="item in dataList"
            :key="item.id || item.name"
            variant="card"
            padding="0 10px"
            class="list-item flex-align-center"
          >
            <slot name="item" :data="item" />
          </BCard>
        </template>
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
    </BCard>
  </ResourcePageShell>
</template>

<script lang="ts" setup>
  import { computed, ref, type PropType } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
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
  });
  defineEmits<{
    (event: 'add'): void;
    (event: 'retry'): void;
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
    --b-card-background: var(--workspace-panel-bg-color);
    --b-card-border-color: var(--surface-border-color);

    height: 100%;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    border-radius: 14px;
  }

  .table-search-input {
    width: 100%;
  }
  .list-body {
    margin-top: 10px;
    min-height: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow: auto;
    border-radius: 10px;
  }
  .list-item {
    --b-card-background: var(--card-background);
    --b-card-border-color: var(--surface-border-color);
    --b-card-shadow: var(--surface-card-shadow);

    position: relative;
    gap: 10px;
    height: 44px;
    flex: 0 0 auto;
    border-radius: 10px;
  }

  .phone-list-skeleton {
    display: grid;
    gap: 8px;
  }

  .phone-skeleton-item {
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
