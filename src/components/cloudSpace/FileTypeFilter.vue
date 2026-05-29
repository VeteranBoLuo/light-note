<template>
  <div class="filter-container">
    <!-- 下拉筛选按钮 -->
    <div class="filter-dropdown">
      <b-button class="filter-button" :class="{ 'filter-button--active': showFilterMenu }" @click="toggleFilterMenu" v-click-log="{ module: '云空间', operation: '切换文件类型筛选' }">
        <svg-icon :src="icon.cloudSpace.filter" class="filter-icon" />
        <span class="filter-button-label">{{ $t('cloudSpace.fileType') }}</span>
        <span v-if="selectedCount > 0 && selectedCount < fileTypes.length" class="filter-badge">
          {{ selectedCount }}
        </span>
        <i :class="['arrow', { 'arrow-up': showFilterMenu }]"></i>
      </b-button>

      <!-- 筛选菜单 -->
      <div v-show="showFilterMenu" class="filter-menu">
        <div class="filter-header">
          <a-checkbox :indeterminate="indeterminate" v-model:checked="allTypesSelected" @change="toggleSelectAll">
            <span class="select-all-label">{{ $t('common.selectAll') }}</span>
          </a-checkbox>
          <span class="selected-info">{{ selectedCount }}/{{ fileTypes.length }}</span>
        </div>
        <a-checkbox-group class="filter-options" v-model:value="cloud.typeCheckValue">
          <a-checkbox v-for="type in fileTypes" :key="type.value" :value="type.value" class="filter-option">
            {{ type.label }}
          </a-checkbox>
        </a-checkbox-group>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import { closeOpenWindow } from '@/utils/common.ts';
  import icon from '@/config/icon.ts';
  import { cloudSpaceStore } from '@/store';
  import { useI18n } from 'vue-i18n';
  import {
    CLOUD_FILE_CATEGORY_LABEL_KEY,
    CLOUD_FILE_CATEGORY_ORDER,
    type CloudFileCategory,
  } from '@/constants/cloudFileCategory.ts';

  const { t } = useI18n();
  interface FileTypeOption {
    value: CloudFileCategory;
    label: string;
  }

  const fileTypes = computed<FileTypeOption[]>(() =>
    CLOUD_FILE_CATEGORY_ORDER.map((type) => ({
      value: type,
      label: t(CLOUD_FILE_CATEGORY_LABEL_KEY[type]),
    })),
  );
  const cloud = cloudSpaceStore();
  const showFilterMenu = ref(false);
  const allTypesSelected = ref(true);
  const indeterminate = ref(false);
  const selectedCount = computed(() => cloud.typeCheckValue.length);

  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      cloud.typeCheckValue = fileTypes.value.map((type) => type.value);
    } else {
      cloud.typeCheckValue = [];
      indeterminate.value = false;
    }
  };
  watch(
    () => cloud.typeCheckValue,
    (val) => {
      indeterminate.value = !!val.length && val.length < fileTypes.value.length;
      allTypesSelected.value = val.length === fileTypes.value.length;
      cloud.queryFieldList();
    },
  );
  const toggleFilterMenu = () => {
    showFilterMenu.value = !showFilterMenu.value;
    if (showFilterMenu.value) {
      closeOpenWindow('filter-container', showFilterMenu);
    } else {
      closeOpenWindow('filter-container', showFilterMenu, false);
    }
  };
</script>

<style scoped>
  .filter-container {
    display: inline-block;
    position: relative;
    margin-left: 10px;
  }

  .filter-dropdown {
    position: relative;
  }

  .filter-button {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 32px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid transparent;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.22s ease;
    color: var(--catalog-color);
    background-color: var(--primary-btn-bg-color);
  }

  .filter-button:hover {
    background-color: var(--primary-btn-h-bg-color);
  }

  .filter-button--active {
    border-color: rgba(96, 108, 255, 0.35);
    background-color: var(--primary-btn-h-bg-color);
    box-shadow: 0 0 0 2px rgba(96, 108, 255, 0.1);
  }

  .filter-icon {
    opacity: 0.9;
  }

  .filter-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    background: linear-gradient(120deg, #5f76ff 0%, #7b58ff 100%);
  }

  .arrow {
    display: inline-block;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 5px solid #666;
    transition: transform 0.3s;
  }

  .arrow-up {
    transform: rotate(180deg);
  }

  .filter-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 8px;
    border-radius: 10px;
    border: 1px solid var(--noteType-border-color);
    box-shadow: 0 10px 24px rgba(19, 22, 35, 0.14);
    z-index: 1000;
    width: 214px;
    padding: 10px;
    background-color: var(--menu-body-bg-color);
  }

  .filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding: 2px 4px 10px;
    border-bottom: 1px solid var(--noteType-border-color);
  }

  .select-all-label {
    color: var(--text-color);
    font-weight: 500;
  }

  .selected-info {
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--desc-color);
  }

  .select-all {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-weight: 500;
  }

  .clear-btn {
    background: none;
    border: none;
    color: #409eff;
    cursor: pointer;
    padding: 2px 5px;
    font-size: 13px;
  }

  .clear-btn:hover {
    color: #66b1ff;
  }

  .filter-options {
    display: flex;
    flex-direction: column;
    flex-wrap: nowrap;
    gap: 4px;
    max-height: 290px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .filter-option {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 34px;
    padding: 0 8px;
    border-radius: 7px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    color: var(--text-color);
  }

  .filter-option:hover {
    background-color: var(--menu-item-h-bg-color);
  }

  .filter-options::-webkit-scrollbar {
    width: 6px;
  }

  .filter-options::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: rgba(130, 138, 156, 0.45);
  }

  .filter-options::-webkit-scrollbar-track {
    background: transparent;
  }

  .file-icon {
    display: inline-block;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    flex-shrink: 0;
  }
  @media (max-width: 768px) {
    .filter-container {
      display: block;
      min-width: 0;
    }

    .filter-dropdown {
      position: static;
    }

    .filter-button {
      width: 100%;
      justify-content: center;
      padding: 0 10px;
    }

    .filter-button-label {
      max-width: 5em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .filter-menu {
      position: absolute;
      left: auto;
      right: 0;
      width: min(320px, calc(100vw - 32px));
      max-height: min(420px, calc(100vh - 170px));
      box-sizing: border-box;
      overflow-y: auto;
      padding: 12px;
    }

    .filter-options {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      max-height: none;
      overflow: visible;
      padding-right: 0;
    }

    .filter-option {
      min-width: 0;
      padding: 0 6px;
    }

    .filter-option :deep(span:last-child) {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
</style>
