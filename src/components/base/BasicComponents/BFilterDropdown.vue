<template>
  <div class="filter-container">
    <!-- 下拉筛选按钮 -->
    <div class="filter-dropdown">
      <div @click="toggleFilterMenu">
        <slot name="filterBtn">
          <div class="filter-button">
            <svg-icon :src="icon.cloudSpace.filter" />
            <span>{{ title }}</span>
            <i :class="['arrow', { 'arrow-up': showFilterMenu }]"></i>
          </div>
        </slot>
      </div>
      <!-- 筛选菜单 -->
      <div v-show="showFilterMenu" class="filter-menu">
        <div class="filter-header">
          <a-checkbox :indeterminate="indeterminate" v-model:checked="allTypesSelected" @change="toggleSelectAll">
            <span style="color: var(--text-color)">全选</span>
          </a-checkbox>
        </div>
        <a-checkbox-group class="filter-options" v-model:value="checkValue">
          <a-checkbox v-for="type in filterOptions" :key="type.value" :value="type.value" class="filter-option">
            {{ type.label }}
          </a-checkbox>
        </a-checkbox-group>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { PropType, ref, watch } from 'vue';
  import { closeOpenWindow } from '@/utils/common.ts';
  import icon from '@/config/icon.ts';

  const props = defineProps({
    title: {
      type: String,
      default: '筛选',
    },
    filterOptions: {
      type: Array as PropType<FilterTypeOption[]>,
      default: () => [
        { value: 'image', label: '图片' },
        { value: 'pdf', label: 'PDF' },
        { value: 'word', label: 'Word' },
        { value: 'audio', label: '音频' },
        { value: 'video', label: '视频' },
        { value: 'other', label: '其他' },
      ],
    },
  });

  // 类型定义
  interface FilterTypeOption {
    label: string;
    value: string;
  }
  // 响应式数据
  const showFilterMenu = ref(false);

  // 计算属性
  const allTypesSelected = ref(true);

  const indeterminate = ref(false);

  const checkValue: any = defineModel('check');

  // 筛选逻辑
  const toggleSelectAll = (e) => {
    if (e.target.checked) {
      checkValue.value = props.filterOptions.map((type) => type.value);
    } else {
      checkValue.value = [];
      indeterminate.value = false;
    }
    emit('selectAll', e.target.checked);
  };
  const emit = defineEmits(['change', 'selectAll', 'openChange']);

  watch(
    () => checkValue.value,
    (val: string[]) => {
      indeterminate.value = !!val.length && val.length < props.filterOptions.length;
      allTypesSelected.value = val.length === props.filterOptions.length;
      emit('change', val);
    },
  );
  const toggleFilterMenu = () => {
    showFilterMenu.value = !showFilterMenu.value;
    if (showFilterMenu.value) {
      closeOpenWindow('filter-container', showFilterMenu);
    } else {
      closeOpenWindow('filter-container', showFilterMenu, false);
    }
    emit('openChange', showFilterMenu.value);
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
    border-radius: 6px;
    white-space: nowrap;
    text-align: center;
    box-sizing: border-box;
    cursor: pointer;
    height: 32px;
    line-height: 32px;
    width: max-content;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0 15px;
    font-size: 14px;
    gap: 8px;
    color: var(--text-color);
    background-color: var(--primary-btn-bg-color);
    transition: all 0.3s;
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

  :deep(.ant-checkbox-inner) {
    transition: none !important;
  }
</style>
