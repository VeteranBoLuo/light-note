<template>
  <b-loading :loading="loading">
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
          <BCard
            v-for="item in dataList"
            :key="item.id || item.name"
            variant="card"
            padding="0 10px"
            class="list-item flex-align-center"
          >
            <slot name="item" :data="item" />
          </BCard>
          <div v-if="!dataList.length" class="list-empty">{{ $t('bookmarkMg.emptyTitle') }}</div>
        </div>
      </BCard>
    </ResourcePageShell>
  </b-loading>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
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
    placeholder: {
      type: String,
      default: '',
    },
    subtitle: {
      type: String,
      default: '',
    },
    listData: {
      type: Array,
      default: () => [],
    },
  });
  const searchValue = ref('');
  const dataList = computed(() => {
    if (searchValue.value) {
      return props.listData.filter((data: any) => {
        return data.name.toLowerCase().includes(searchValue.value.toLowerCase());
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

  .list-empty {
    min-height: 180px;
    display: grid;
    place-items: center;
    color: var(--desc-color);
    font-size: 14px;
  }
</style>
