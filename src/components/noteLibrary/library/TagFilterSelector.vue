<template>
  <a-dropdown :trigger="['click']" v-model:open="filterVisible" placement="bottomRight">
    <b-button
      class="noteType-select"
      :style="{
        background: filterVisible ? 'var(--noteType-hover-bg-color)' : '',
        color: filterVisible ? 'var(--noteType-hover-color)' : '',
      }"
      v-click-log="OPERATION_LOG_MAP.noteLibrary.filterNote"
    >
      <div class="text-hidden" style="max-width: 100px"> {{ viewNoteFilter }}</div>
      <svg-icon :src="icon.arrow_left" :style="{ rotate: filterVisible ? '-90deg' : '90deg' }" />
    </b-button>
    <template #overlay>
      <div class="filter-container">
        <div class="fixed-section">
          <div class="filter-header">
            <b-input
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
  </a-dropdown>
</template>

<script lang="ts" setup>
  import { useI18n } from 'vue-i18n';
  const { t } = useI18n();
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
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
    position: relative;
    border-radius: 36px !important;
    border: 1px solid var(--noteType-border-color) !important;
    background-color: var(--background-color);
    display: flex;
    gap: 5px;
    &:hover {
      background-color: var(--noteType-hover-bg-color);
      color: var(--noteType-hover-color);
    }
  }
  .filter-container {
    width: 200px;
    max-height: 300px;
    padding: 5px;
    background: var(--menu-container-bg-color);
    box-shadow: 1px 1px 5px #4d5264;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 0;
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
      color: var(--primary-color);
      cursor: pointer;
      white-space: nowrap;
    }
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
        background: #eeedff;
        color: #605ce5;
      }
    }
  }
  [isFocus='true'] {
    background: #eeedff;
    color: #605ce5;
  }
  .filter-empty {
    padding: 8px 10px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .check-mark {
    margin-left: auto;
    padding-right: 10px;
    color: #605ce5;
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
