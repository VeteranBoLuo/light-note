<template>
  <div class="filter-container">
    <!-- 下拉筛选按钮 -->
    <div class="filter-dropdown">
      <div @click="toggleFilterMenu">
        <slot name="filterBtn">
          <div class="filter-button">
            <svg-icon :src="icon.cloudSpace.filter" />
            <span>{{ title || $t('common.filter') }}</span>
            <i :class="['arrow', { 'arrow-up': showFilterMenu }]"></i>
          </div>
        </slot>
      </div>
      <!-- 筛选菜单 -->
      <div v-show="showFilterMenu" class="filter-menu">
        <div class="filter-header">
          <BCheckbox :indeterminate="indeterminate" v-model:checked="allTypesSelected" @change="(checked: boolean) => toggleSelectAll({ target: { checked } })">
            <span style="color: var(--text-color)">{{ $t('common.selectAll') }}</span>
          </BCheckbox>
        </div>
        <div class="filter-options">
          <BCheckbox
            v-for="type in filterOptions"
            :key="type.value"
            :checked="checkValue.includes(type.value)"
            class="filter-option"
            @change="(checked: boolean) => { if (checked) { if (!checkValue.includes(type.value)) checkValue.push(type.value); } else { const idx = checkValue.indexOf(type.value); if (idx > -1) checkValue.splice(idx, 1); } }"
          >
            {{ $t(type.label) }}
          </BCheckbox>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { PropType, ref, watch } from 'vue';
  import { closeOpenWindow } from '@/utils/common.ts';
  import icon from '@/config/icon.ts';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';

  const props = defineProps({
    title: {
      type: String,
      default: '',
    },
    filterOptions: {
      type: Array as PropType<FilterTypeOption[]>,
      default: () => [
        { value: 'image', label: 'common.typeImage' },
        { value: 'pdf', label: 'PDF' },
        { value: 'word', label: 'Word' },
        { value: 'audio', label: 'common.typeAudio' },
        { value: 'video', label: 'common.typeVideo' },
        { value: 'other', label: 'common.typeOther' },
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
    margin-left: var(--ui-space-10, 10px);
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
    height: var(--ui-control-32, 32px);
    line-height: var(--ui-control-32, 32px);
    width: max-content;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 0 var(--ui-space-15, 15px);
    font-size: var(--ui-font-14, 14px);
    gap: var(--ui-space-8, 8px);
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
    margin-top: var(--ui-space-5, 5px);
    border-radius: 8px;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
    z-index: 300;
    width: var(--ui-layout-200, 200px);
    padding: var(--ui-space-12, 12px);
    background-color: var(--menu-body-bg-color);
  }

  .filter-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: var(--ui-space-10, 10px);
    padding-bottom: var(--ui-space-10, 10px);
    margin-left: var(--ui-space-5, 5px);
    border-bottom: 1px solid #eee;
  }

  .select-all {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    cursor: pointer;
    font-weight: 500;
  }

  .clear-btn {
    background: none;
    border: none;
    color: #409eff;
    cursor: pointer;
    padding: var(--ui-space-2, 2px) var(--ui-space-5, 5px);
    font-size: var(--ui-font-13, 13px);
  }

  .clear-btn:hover {
    color: #66b1ff;
  }

  .filter-options {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
    max-height: var(--ui-layout-300, 300px);
    overflow-y: auto;
  }

  .filter-option {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-6, 6px);
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
    width: var(--ui-layout-18, 18px);
    height: var(--ui-layout-18, 18px);
    border-radius: 3px;
    flex-shrink: 0;
  }
</style>
