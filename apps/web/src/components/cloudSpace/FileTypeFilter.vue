<template>
  <div class="filter-container">
    <BPopover v-model:open="showFilterMenu" trigger="click" placement="bottom-right">
      <b-button
        class="filter-button"
        :class="{ 'filter-button--active': showFilterMenu }"
        v-click-log="{ module: '云空间', operation: '切换文件类型筛选' }"
      >
        <svg-icon :src="icon.cloudSpace.filter" class="filter-icon" />
        <span class="filter-button-label">{{ $t('cloudSpace.fileType') }}</span>
        <span v-if="selectedCount > 0 && selectedCount < fileTypes.length" class="filter-badge">
          {{ selectedCount }}
        </span>
        <i :class="['arrow', { 'arrow-up': showFilterMenu }]"></i>
      </b-button>

      <template #content>
        <div class="filter-menu">
          <div class="filter-header">
            <BCheckbox
              :indeterminate="indeterminate"
              v-model:checked="allTypesSelected"
              @change="(checked: boolean) => toggleSelectAll({ target: { checked } })"
            >
              <span class="select-all-label">{{ $t('common.selectAll') }}</span>
            </BCheckbox>
            <span class="selected-info">{{ selectedCount }}/{{ fileTypes.length }}</span>
          </div>
          <div class="filter-options">
            <BCheckbox
              v-for="type in fileTypes"
              :key="type.value"
              :checked="cloud.typeCheckValue.includes(type.value)"
              class="filter-option"
              @change="
                (checked: boolean) => {
                  if (checked) {
                    if (!cloud.typeCheckValue.includes(type.value))
                      cloud.typeCheckValue = [...cloud.typeCheckValue, type.value];
                  } else {
                    cloud.typeCheckValue = cloud.typeCheckValue.filter((v) => v !== type.value);
                  }
                }
              "
            >
              {{ type.label }}
            </BCheckbox>
          </div>
        </div>
      </template>
    </BPopover>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, watch } from 'vue';
  import icon from '@/config/icon.ts';
  import { cloudSpaceStore } from '@/store';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import { useI18n } from 'vue-i18n';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
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
</script>

<style scoped>
  .filter-container {
    display: inline-block;
    position: relative;
  }

  .filter-button {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 36px;
    padding: 0 12px;
    border-radius: 10px;
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
    border-color: color-mix(in srgb, var(--resource-file-color, #ff8a00) 42%, transparent);
    color: var(--resource-file-color, #ff8a00);
    background: color-mix(in srgb, var(--resource-file-color, #ff8a00) 8%, var(--menu-body-bg-color));
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--resource-file-color, #ff8a00) 11%, transparent);
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
    background: var(--resource-file-color, #ff8a00);
  }

  .arrow {
    display: inline-block;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 5px solid currentColor;
    transition: transform 0.3s;
  }

  .arrow-up {
    transform: rotate(180deg);
  }

  .filter-menu {
    width: 214px;
    max-height: min(340px, calc(100dvh - 24px));
    padding: 6px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    --primary-color: var(--resource-file-color, #ff8a00);
  }

  .filter-header {
    flex: 0 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding: 2px 8px 10px 4px;
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
    min-height: 0;
    max-height: none;
    flex: 1;
    overflow-y: auto;
    padding: 0 2px 2px 0;
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
      width: min(320px, calc(100vw - 32px));
      max-height: min(420px, calc(100dvh - 24px));
      box-sizing: border-box;
      overflow: hidden;
      padding: 12px;
    }

    .filter-options {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      max-height: none;
      overflow-y: auto;
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
