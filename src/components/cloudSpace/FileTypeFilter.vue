<template>
  <div class="filter-container">
    <!-- 下拉筛选按钮 -->
    <div class="filter-dropdown">
      <b-button class="filter-button" @click="toggleFilterMenu">
        <svg-icon :src="icon.cloudSpace.filter" />
        <span>{{ $t('cloudSpace.fileType') }}</span>
        <i :class="['arrow', { 'arrow-up': showFilterMenu }]"></i>
      </b-button>

      <!-- 筛选菜单 -->
      <div v-show="showFilterMenu" class="filter-menu">
        <div class="filter-header">
          <a-checkbox :indeterminate="indeterminate" v-model:checked="allTypesSelected" @change="toggleSelectAll">
            <span style="color: var(--text-color)">{{ $t('common.selectAll') }}</span>
          </a-checkbox>
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
  import { ref, watch } from 'vue';
  import { closeOpenWindow } from '@/utils/common.ts';
  import icon from '@/config/icon.ts';
  import { cloudSpaceStore } from '@/store';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();
  // 文件类型定义
  interface FileTypeOption {
    value: string;
    label: string;
  }
  // 文件类型选项
  const fileTypes = ref<FileTypeOption[]>([
    { value: 'image', label: t('cloudSpace.image') },
    { value: 'text', label: t('cloudSpace.text', '文本') },
    { value: 'pdf', label: t('cloudSpace.pdf') },
    { value: 'word', label: t('cloudSpace.word') },
    { value: 'excel', label: t('cloudSpace.excel') },
    { value: 'audio', label: t('cloudSpace.audio') },
    { value: 'video', label: t('cloudSpace.video') },
    { value: 'other', label: t('cloudSpace.other') },
  ]);
  const cloud = cloudSpaceStore();
  // 响应式数据
  const showFilterMenu = ref(false);

  // 计算属性
  const allTypesSelected = ref(true);

  const indeterminate = ref(false);

  // 筛选逻辑
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
    gap: 8px;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.3s;
    color: var(--catalog-color);
  }

  .filter-button:hover {
    border-color: #c0c4cc;
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
    margin-top: 5px;
    border-radius: 8px;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
    z-index: 1000;
    width: 200px;
    padding: 12px;
    background-color: var(--menu-body-bg-color);
  }

  .filter-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
    padding-bottom: 10px;
    margin-left: 5px;
    border-bottom: 1px solid #eee;
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
    gap: 10px;
    max-height: 300px;
    overflow-y: auto;
  }

  .filter-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
    color: var(--text-color);
  }

  .filter-option:hover {
    background-color: var(--menu-item-h-bg-color);
  }

  .file-icon {
    display: inline-block;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    flex-shrink: 0;
  }
</style>
