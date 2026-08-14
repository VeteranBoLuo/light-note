<template>
  <div
    class="b-select"
    ref="containerRef"
    :data-b-select-id="selectId"
    :class="{
      'is-multiple': isMultiple,
      'is-open': isOpen,
      'is-disabled': disabled,
      'is-input-invalid': editable && !inlineInputValid,
      'is-tag-tone': chipTone === 'tag',
    }"
  >
    <div
      class="select-trigger"
      :role="usesInlineInput ? undefined : 'combobox'"
      :tabindex="usesInlineInput || disabled ? -1 : 0"
      :aria-expanded="usesInlineInput ? undefined : isOpen"
      :aria-disabled="disabled || undefined"
      :aria-busy="loading || undefined"
      :aria-controls="usesInlineInput ? undefined : listboxId"
      :aria-haspopup="usesInlineInput ? undefined : 'listbox'"
      :aria-activedescendant="usesInlineInput ? undefined : activeOptionDomId"
      :aria-label="usesInlineInput ? undefined : ariaLabel || undefined"
      :aria-labelledby="usesInlineInput ? undefined : ariaLabelledby || undefined"
      @click="toggleOpen"
      @keydown="handleTriggerKeydown"
      @mouseenter="isHovering = true"
      @mouseleave="isHovering = false"
      ref="triggerRef"
    >
      <!-- 单选：显示文字 -->
      <template v-if="!isMultiple">
        <input
          v-if="usesInlineInput"
          v-model="searchText"
          class="select-search-inline"
          :class="{ 'has-editable-value': editable && Boolean(displayText) }"
          :placeholder="displayText || placeholderText"
          :inputmode="inputmode"
          :maxlength="maxlength || undefined"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="isOpen"
          :aria-busy="loading || undefined"
          :aria-controls="listboxId"
          :aria-activedescendant="activeOptionDomId"
          :aria-label="ariaLabel || undefined"
          :aria-labelledby="ariaLabelledby || undefined"
          :aria-invalid="editable && !inlineInputValid ? 'true' : undefined"
          :disabled="disabled"
          @click.stop
          @input="handleSearchInput"
          @focus="keepOpen"
          @blur="handleInlineBlur"
          @keydown.stop="handleTriggerKeydown"
        />
        <span v-else class="select-text" :class="{ 'is-placeholder': !displayText }">
          {{ displayText || placeholderText }}
        </span>
      </template>

      <!-- 多选：显示标签 -->
      <template v-else>
        <span v-for="tag in visibleTags" :key="tag.value" class="select-tag" :title="tag.label">
          <span class="select-tag-label">{{ tag.label }}</span>
          <span class="select-tag-remove" @click.stop="removeTag(tag.value)">&times;</span>
        </span>
        <span v-if="overflowCount > 0" class="select-tag is-overflow">+{{ overflowCount }}</span>
        <span v-if="selectedTags.length === 0" class="select-text is-placeholder">{{ placeholderText }}</span>
      </template>

      <!-- 后缀 -->
      <span class="select-suffix">
        <span v-if="loading" class="select-loading" aria-hidden="true"></span>
        <span v-else-if="showClear" class="select-clear" @click.stop="handleClear">&times;</span>
        <span v-else class="select-arrow">&#9662;</span>
      </span>
    </div>

    <Teleport to="body">
      <div
        ref="dropdownRef"
        class="select-dropdown"
        :id="listboxId"
        role="listbox"
        :aria-multiselectable="isMultiple || undefined"
        :aria-busy="loading || undefined"
        :data-b-select-id="selectId"
        :class="{ 'has-footer': $slots['dropdown-footer'] }"
        v-show="isOpen"
        :style="dropdownStyle"
        @click.stop
      >
        <div v-if="showSearch && isMultiple" class="select-search-bar">
          <input
            v-model="searchText"
            class="select-search-input"
            :placeholder="t('common.searchPlaceholder')"
            role="combobox"
            aria-autocomplete="list"
            :aria-expanded="isOpen"
            :aria-busy="loading || undefined"
            :aria-controls="listboxId"
            :aria-activedescendant="activeOptionDomId"
            :aria-label="ariaLabel || undefined"
            :aria-labelledby="ariaLabelledby || undefined"
            @click.stop
            @input="handleSearchInput"
            @keydown.stop="handleTriggerKeydown"
          />
        </div>
        <div
          v-for="(item, optionIndex) in filteredOptions"
          :key="item.value"
          :id="optionDomId(optionIndex)"
          class="select-option"
          :class="{
            'is-selected': isSelected(item.value),
            'is-disabled': item.disabled,
            'is-active': activeOptionIndex === optionIndex,
          }"
          role="option"
          :aria-selected="isSelected(item.value)"
          :aria-disabled="Boolean(item.disabled)"
          @click="selectOption(item)"
        >
          <span v-if="isMultiple" class="select-option-check">
            <span v-if="isSelected(item.value)" class="check-icon">&#10003;</span>
          </span>
          <span class="select-option-label">{{ item.label }}</span>
        </div>
        <div v-if="filteredOptions.length === 0" class="select-no-data">{{ t('common.noMatch') }}</div>
        <div v-if="$slots['dropdown-footer']" class="select-dropdown-footer">
          <slot name="dropdown-footer" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
  import type { BaseOptions } from '@/config/bookmarkCfg.ts';
  import { getRootZoom } from '@/utils/zoom';
  import { useI18n } from 'vue-i18n';

  const props = withDefaults(
    defineProps<{
      options: BaseOptions[];
      placeholder?: string;
      allowClear?: boolean;
      mode?: 'single' | 'multiple';
      showSearch?: boolean;
      filterOption?: (value: string, option: BaseOptions) => boolean;
      maxTagCount?: number;
      chipTone?: 'default' | 'tag';
      ariaLabel?: string;
      ariaLabelledby?: string;
      disabled?: boolean;
      loading?: boolean;
      editable?: boolean;
      inputmode?: 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';
      maxlength?: number;
    }>(),
    {
      options: () => [],
      placeholder: '',
      allowClear: false,
      mode: 'single',
      showSearch: false,
      maxTagCount: 0,
      chipTone: 'default',
      ariaLabel: '',
      ariaLabelledby: '',
      disabled: false,
      loading: false,
      editable: false,
      inputmode: 'text',
      maxlength: 0,
    },
  );

  const emit = defineEmits<{
    change: [value: any];
    search: [value: string];
    validityChange: [valid: boolean];
  }>();

  const modelValue = defineModel('value');

  const { t } = useI18n();
  const placeholderText = computed(() => props.placeholder || t('common.pleaseSelect'));

  const isMultiple = computed(() => props.mode === 'multiple');
  const usesInlineInput = computed(() => props.showSearch || (props.editable && !isMultiple.value));
  const isOpen = ref(false);
  const isHovering = ref(false);
  const searchText = ref('');
  const containerRef = ref<HTMLElement>();
  const triggerRef = ref<HTMLElement>();
  const dropdownStyle = ref({ top: '0px', left: '0px', width: '0px' });
  const dropdownRef = ref<HTMLElement>();
  const selectId = `b-select-${Math.random().toString(36).slice(2, 10)}`;
  const listboxId = `${selectId}-listbox`;
  const activeOptionIndex = ref(-1);
  const inlineInputValid = ref(true);
  let placementAbove = false;

  // 当前选中值（标准化为数组）
  const currentValues = computed<any[]>(() => {
    const v = modelValue.value;
    if (isMultiple.value) {
      return Array.isArray(v) ? v : [];
    }
    return v != null && v !== '' ? [v] : [];
  });

  // 选中项标签
  const selectedTags = computed(() => {
    return props.options.filter((opt) => currentValues.value.includes(opt.value));
  });

  // 可见标签（受 maxTagCount 限制）
  const visibleTags = computed(() => {
    if (props.maxTagCount > 0 && selectedTags.value.length > props.maxTagCount) {
      return selectedTags.value.slice(0, props.maxTagCount);
    }
    return selectedTags.value;
  });

  // 溢出数量
  const overflowCount = computed(() => {
    if (props.maxTagCount > 0 && selectedTags.value.length > props.maxTagCount) {
      return selectedTags.value.length - props.maxTagCount;
    }
    return 0;
  });

  // 是否可清除
  const showClear = computed(() => {
    if (!props.allowClear) return false;
    if (isMultiple.value) return currentValues.value.length > 0;
    return (modelValue.value != null && modelValue.value !== '') || (props.showSearch && Boolean(searchText.value));
  });

  // 单选显示文本
  const displayText = computed(() => {
    if (isMultiple.value) return '';
    const v = modelValue.value;
    if (v == null || v === '') return '';
    const matched = props.options.find((opt) => opt.value === v);
    return matched ? matched.label : String(v);
  });

  // 过滤后的选项
  const filteredOptions = computed(() => {
    if (!searchText.value) return props.options;
    const kw = searchText.value;
    if (props.filterOption) {
      return props.options.filter((opt) => props.filterOption!(kw, opt));
    }
    // 默认：不区分大小写搜索 label 和 value
    const upper = kw.toUpperCase();
    return props.options.filter(
      (opt) => String(opt.label).toUpperCase().includes(upper) || String(opt.value).toUpperCase().includes(upper),
    );
  });

  const activeOptionDomId = computed(() =>
    isOpen.value && activeOptionIndex.value >= 0 ? optionDomId(activeOptionIndex.value) : undefined,
  );

  function optionDomId(index: number) {
    return `${selectId}-option-${index}`;
  }

  function firstEnabledIndex() {
    return filteredOptions.value.findIndex((item) => !item.disabled);
  }

  function lastEnabledIndex() {
    for (let index = filteredOptions.value.length - 1; index >= 0; index -= 1) {
      if (!filteredOptions.value[index]?.disabled) return index;
    }
    return -1;
  }

  function moveActiveOption(direction: 1 | -1) {
    const options = filteredOptions.value;
    if (!options.length) {
      activeOptionIndex.value = -1;
      return;
    }
    let index = activeOptionIndex.value;
    for (let attempts = 0; attempts < options.length; attempts += 1) {
      index = (index + direction + options.length) % options.length;
      if (!options[index]?.disabled) {
        activeOptionIndex.value = index;
        return;
      }
    }
    activeOptionIndex.value = -1;
  }

  function openForKeyboard(direction: 1 | -1) {
    if (!isOpen.value) {
      isOpen.value = true;
      const selectedIndex = filteredOptions.value.findIndex((item) => isSelected(item.value) && !item.disabled);
      activeOptionIndex.value =
        selectedIndex >= 0 ? selectedIndex : direction === 1 ? firstEnabledIndex() : lastEnabledIndex();
      return;
    }
    moveActiveOption(direction);
  }

  function handleTriggerKeydown(event: KeyboardEvent) {
    if (props.disabled) return;
    // 中文等输入法在候选词组成阶段会用 Enter / 方向键确认或切换候选。
    // 此时不能把按键当作下拉导航，否则会误选当前高亮项。
    if (event.isComposing || event.key === 'Process' || event.keyCode === 229) return;

    const typingInSearch = event.target instanceof HTMLInputElement;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openForKeyboard(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Home' && isOpen.value && !typingInSearch) {
      event.preventDefault();
      activeOptionIndex.value = firstEnabledIndex();
      return;
    }
    if (event.key === 'End' && isOpen.value && !typingInSearch) {
      event.preventDefault();
      activeOptionIndex.value = lastEnabledIndex();
      return;
    }
    if (event.key === 'Escape' && isOpen.value) {
      event.preventDefault();
      // 收起下拉时阻止冒泡:否则 Esc 会继续冒泡到外层(如 BDrawer)把整个抽屉一起关掉。
      event.stopPropagation();
      if (props.editable) {
        searchText.value = '';
        setInlineInputValid(true);
      }
      isOpen.value = false;
      return;
    }
    if (event.key === 'Enter' && props.editable && typingInSearch && searchText.value.trim()) {
      event.preventDefault();
      const match = findEditableMatch(searchText.value, true);
      if (match) {
        selectOption(match);
      } else {
        setInlineInputValid(false);
      }
      return;
    }
    if (event.key === 'Enter' || (event.key === ' ' && !typingInSearch)) {
      event.preventDefault();
      if (!isOpen.value) {
        openForKeyboard(1);
        return;
      }
      const item = filteredOptions.value[activeOptionIndex.value];
      if (item && !item.disabled) selectOption(item);
    }
  }

  function isSelected(value: any): boolean {
    return currentValues.value.includes(value);
  }

  function selectOption(item: BaseOptions) {
    if (props.disabled || item.disabled) return;
    if (isMultiple.value) {
      const arr = [...currentValues.value];
      const idx = arr.indexOf(item.value);
      if (idx > -1) {
        arr.splice(idx, 1);
      } else {
        arr.push(item.value);
      }
      modelValue.value = arr;
      emit('change', arr);
      searchText.value = '';
    } else {
      modelValue.value = item.value;
      emit('change', item.value);
      searchText.value = '';
      setInlineInputValid(true);
      isOpen.value = false;
      activeOptionIndex.value = -1;
    }
  }

  function removeTag(value: any) {
    if (props.disabled || !isMultiple.value) return;
    const arr = currentValues.value.filter((v: any) => v !== value);
    modelValue.value = arr;
    emit('change', arr);
  }

  function handleClear() {
    if (props.disabled) return;
    if (isMultiple.value) {
      modelValue.value = [];
      emit('change', []);
    } else {
      modelValue.value = '';
      emit('change', '');
    }
    searchText.value = '';
    setInlineInputValid(true);
    if (props.showSearch) emit('search', '');
    isOpen.value = false;
  }

  function toggleOpen() {
    if (props.disabled) return;
    isOpen.value = !isOpen.value;
    // 打开时的定位统一交给 watch(isOpen),覆盖 toggleOpen / 内联搜索框 @focus @input / keepOpen 所有打开路径
    if (isOpen.value) {
      searchText.value = '';
      setInlineInputValid(true);
      activeOptionIndex.value = -1;
    } else {
      activeOptionIndex.value = -1;
    }
  }

  function keepOpen() {
    if (props.disabled) return;
    if (!isOpen.value) isOpen.value = true;
  }

  function handleSearchInput() {
    keepOpen();
    if (props.editable) {
      const raw = searchText.value.trim();
      const exactMatch = raw ? findEditableMatch(raw, false) : undefined;
      const pendingMatch = raw && !exactMatch ? findEditableMatch(raw, true) : undefined;
      if (exactMatch) {
        if (modelValue.value !== exactMatch.value) {
          modelValue.value = exactMatch.value;
          emit('change', exactMatch.value);
        }
        // 直接输入完整有效值后无需继续展示只剩一项的浮层，避免时间选择器内遮挡日历。
        isOpen.value = false;
        activeOptionIndex.value = -1;
      }
      // 空文本仍表示“展示当前选中值”；可补零的单数字也是有效编辑中状态，失焦时再正式提交。
      setInlineInputValid(!raw || Boolean(exactMatch || pendingMatch));
    }
    emit('search', searchText.value);
  }

  function handleInlineBlur() {
    if (!props.editable) return;
    const raw = searchText.value.trim();
    if (!raw) {
      setInlineInputValid(true);
      return;
    }
    const match = findEditableMatch(raw, true);
    if (!match) {
      setInlineInputValid(false);
      return;
    }
    if (modelValue.value !== match.value) {
      modelValue.value = match.value;
      emit('change', match.value);
    }
    searchText.value = '';
    setInlineInputValid(true);
  }

  function findEditableMatch(raw: string, allowNumericAlias: boolean) {
    const normalized = raw.trim().toLocaleLowerCase();
    const exactMatches = props.options.filter(
      (option) =>
        !option.disabled &&
        (String(option.value).trim().toLocaleLowerCase() === normalized ||
          String(option.label).trim().toLocaleLowerCase() === normalized),
    );
    if (exactMatches.length === 1) return exactMatches[0];
    if (!allowNumericAlias || !/^\d+$/.test(normalized)) return undefined;
    const numericValue = Number(normalized);
    const numericMatches = props.options.filter((option) => {
      if (option.disabled) return false;
      const value = String(option.value).trim();
      return /^\d+$/.test(value) && Number(value) === numericValue;
    });
    return numericMatches.length === 1 ? numericMatches[0] : undefined;
  }

  function setInlineInputValid(valid: boolean) {
    if (inlineInputValid.value === valid) return;
    inlineInputValid.value = valid;
    emit('validityChange', valid);
  }

  function updateDropdownPosition() {
    if (!triggerRef.value) return;
    // 界面缩放(html zoom)下,gBCR 是视觉坐标、fixed 会被二次缩放,坐标 ÷ zoom 换算回布局坐标;
    // clientHeight/offsetHeight 本就是布局像素、不换算(见 utils/zoom.ts)。
    const zoom = getRootZoom();
    const rect = triggerRef.value.getBoundingClientRect();
    const rTop = rect.top / zoom;
    const rBottom = rect.bottom / zoom;
    const rLeft = rect.left / zoom;
    const triggerWidth = rect.width / zoom;
    const viewportWidth = document.documentElement.clientWidth / zoom;
    const viewportGutter = 8 / zoom;
    const availableWidth = Math.max(viewportWidth - viewportGutter * 2, 0);
    const preferredMinWidth = document.documentElement.clientWidth <= 720 ? triggerWidth : 180;
    const dropdownWidth = Math.min(Math.max(triggerWidth, preferredMinWidth), availableWidth);
    const dropdownLeft = Math.min(
      Math.max(rLeft, viewportGutter),
      Math.max(viewportGutter, viewportWidth - viewportGutter - dropdownWidth),
    );

    if (placementAbove) {
      // 已翻到上面，保持上方，重新计算高度
      requestAnimationFrame(() => {
        if (!dropdownRef.value) return;
        const dh = dropdownRef.value.offsetHeight;
        dropdownStyle.value = {
          top: `${rTop - dh - 4}px`,
          left: `${dropdownLeft}px`,
          width: `${dropdownWidth}px`,
        };
      });
      return;
    }

    // 先放下面
    dropdownStyle.value = {
      top: `${rBottom + 4}px`,
      left: `${dropdownLeft}px`,
      width: `${dropdownWidth}px`,
    };

    // 等渲染完成后测量实际高度，空间不够就翻到上面
    requestAnimationFrame(() => {
      if (!dropdownRef.value) return;
      const dh = dropdownRef.value.offsetHeight;
      // documentElement.clientHeight 是视口高度(视觉像素),需 ÷zoom 换布局坐标再与 rBottom(布局)比较
      const spaceBelow = document.documentElement.clientHeight / zoom - rBottom - 4;
      if (spaceBelow < dh && rTop - 4 > dh) {
        placementAbove = true;
        dropdownStyle.value = {
          top: `${rTop - dh - 4}px`,
          left: `${dropdownLeft}px`,
          width: `${dropdownWidth}px`,
        };
      } else {
        placementAbove = false;
      }
    });
  }

  function isOwnedEventTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    const dropdown = target.closest<HTMLElement>('.select-dropdown[data-b-select-id]');
    return Boolean(containerRef.value?.contains(target) || dropdown?.dataset.bSelectId === selectId);
  }

  // 外层 BPopover 会阻止 click 冒泡，必须在捕获阶段识别兄弟选择器并关闭当前浮层。
  function handleClickOutside(e: MouseEvent) {
    if (isOwnedEventTarget(e.target)) return;
    isOpen.value = false;
  }

  // 键盘 Tab 在相邻可输入选择器间移动时也保持同一时间只展开一个浮层。
  function handleFocusOutside(e: FocusEvent) {
    if (isOwnedEventTarget(e.target)) return;
    isOpen.value = false;
  }

  onMounted(() => {
    document.addEventListener('click', handleClickOutside, true);
    document.addEventListener('focusin', handleFocusOutside, true);
    if (isMultiple.value) {
      searchText.value = '';
    }
  });

  onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside, true);
    document.removeEventListener('focusin', handleFocusOutside, true);
  });

  // 窗口滚动/缩放时更新位置
  watch(isOpen, (val) => {
    if (val) {
      // 无论从哪条路径打开(点击 / 单选可搜索时内联 input 的 focus·input / keepOpen),都在此统一算定位。
      // 修复:「单选+可搜索」的内联 input 带 @click.stop 绕过了 toggleOpen,导致面板从未计算位置、停在左上角(0,0)。
      placementAbove = false;
      nextTick(() => updateDropdownPosition());
      window.addEventListener('scroll', updateDropdownPosition, true);
      window.addEventListener('resize', updateDropdownPosition);
    } else {
      window.removeEventListener('scroll', updateDropdownPosition, true);
      window.removeEventListener('resize', updateDropdownPosition);
    }
  });

  watch(filteredOptions, (options) => {
    if (!isOpen.value) return;
    if (
      activeOptionIndex.value >= 0 &&
      (!options[activeOptionIndex.value] || options[activeOptionIndex.value]?.disabled)
    ) {
      activeOptionIndex.value = firstEnabledIndex();
    }
  });
</script>

<style lang="less" scoped>
  .b-select {
    position: relative;
    display: inline-block;
    vertical-align: middle;

    &.is-multiple {
      .select-trigger {
        height: auto;
        min-height: 32px;
        flex-wrap: wrap;
        gap: 4px;
        padding: 2px 30px 2px 4px;
      }
    }

    &.is-open {
      .select-trigger {
        border-color: var(--primary-color);
      }
      .select-arrow {
        transform: rotate(180deg);
      }
    }

    &.is-disabled {
      opacity: 0.58;

      .select-trigger {
        cursor: not-allowed;
        background: color-mix(in srgb, var(--background-color) 92%, var(--card-border-color));
      }
    }

    &.is-input-invalid {
      .select-trigger {
        border-color: var(--error-color);
        box-shadow: 0 0 0 1px var(--error-color);
      }
    }
  }

  .select-trigger {
    display: flex;
    align-items: center;
    height: 32px;
    padding: 0 30px 0 11px;
    border: 1px solid var(--card-border-color, #d9d9d9);
    border-radius: 6px;
    cursor: pointer;
    background: var(--background-color);
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
    box-sizing: border-box;
    user-select: none;
    position: relative;

    &:hover {
      border-color: var(--primary-color);
    }

    &:focus-visible {
      border-color: var(--primary-color);
      outline: 2px solid color-mix(in srgb, var(--primary-color) 24%, transparent);
      outline-offset: 1px;
    }
  }

  .select-search-inline {
    flex: 1;
    min-width: 30px;
    border: none;
    outline: none;
    background: transparent;
    font-size: 14px;
    color: var(--text-color);
    padding: 0;
    margin: 0;

    &::placeholder {
      color: var(--desc-color, #999);
    }

    &.has-editable-value::placeholder {
      color: var(--text-color);
      opacity: 1;
    }
  }

  .select-text {
    flex: 1;
    font-size: 14px;
    color: var(--text-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &.is-placeholder {
      color: var(--desc-color, #999);
    }
  }

  .select-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 6px;
    border-radius: 4px;
    font-size: 12px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--primary-color) 20%, transparent);
    max-width: 160px;
    cursor: default;

    &.is-overflow {
      background: transparent;
      border-color: transparent;
      color: var(--desc-color, #999);
      font-weight: 500;
    }
  }

  &.is-tag-tone .select-tag:not(.is-overflow) {
    border-color: var(--chip-tag-border);
    color: var(--chip-tag-fg);
    background: var(--chip-tag-bg);
  }

  &.is-tag-tone .select-tag.is-overflow {
    border-color: var(--chip-neutral-border);
    color: var(--chip-neutral-fg);
    background: var(--chip-neutral-bg);
  }

  &.is-tag-tone .select-tag-remove {
    color: var(--chip-tag-fg);

    &:hover {
      color: var(--chip-tag-hover-fg);
    }
  }

  .select-tag-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .select-tag-remove {
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    color: var(--desc-color);
    display: flex;
    align-items: center;
    flex-shrink: 0;

    &:hover {
      color: var(--text-color);
    }
  }

  .select-suffix {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    flex-shrink: 0;
    width: 16px;
    justify-content: center;
  }

  .select-clear {
    font-size: 16px;
    color: var(--desc-color, #999);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;

    &:hover {
      color: var(--text-color);
    }
  }

  .select-loading {
    width: 14px;
    height: 14px;
    box-sizing: border-box;
    border: 2px solid var(--card-border-color, #d9d9d9);
    border-top-color: var(--primary-color);
    border-radius: 50%;
    animation: b-select-spin 0.75s linear infinite;
  }

  @keyframes b-select-spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global(.disable-animations) .select-loading {
    animation: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .select-loading {
      animation: none;
    }
  }

  .select-arrow {
    font-size: 10px;
    color: var(--desc-color, #999);
    transition: transform 0.2s;
    line-height: 1;
  }

  .select-dropdown {
    position: fixed;
    z-index: 900;
    box-sizing: border-box;
    padding: 4px;
    border-radius: 6px;
    background: var(--ant-select-dropdown-bg-color, #fff);
    border: 1px solid var(--card-border-color, #d9d9d9);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    max-height: 240px;
    overflow-y: auto;
  }

  .select-search-bar {
    padding: 4px 4px 8px;
    border-bottom: 1px solid var(--card-border-color, #eee);
    margin-bottom: 4px;
  }

  .select-search-input {
    width: 100%;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--card-border-color, #d9d9d9);
    border-radius: 4px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--background-color);
    outline: none;
    box-sizing: border-box;

    &:focus {
      border-color: var(--primary-color);
    }

    &::placeholder {
      color: var(--desc-color, #999);
    }
  }

  .select-option {
    height: 32px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--text-color);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.15s;

    &:hover,
    &.is-active {
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }

    &.is-selected {
      background: color-mix(in srgb, var(--primary-color) 20%, transparent);
      color: var(--primary-color);
      font-weight: 500;
    }

    &.is-disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  /* 选项之间留出细小的背景缝隙,避免 hover/选中态连成一整块 */
  .select-option + .select-option {
    margin-top: 2px;
  }

  .select-option-check {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    border: 1.5px solid var(--card-border-color, #d9d9d9);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition: all 0.15s;

    .is-selected & {
      border-color: var(--primary-color);
      background: var(--primary-color);
    }
  }

  .check-icon {
    font-size: 11px;
    color: #fff;
    line-height: 1;
  }

  .select-option-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .select-no-data {
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: var(--desc-color, #999);
  }

  /* 有底部插槽时去掉下拉的下内边距,让 footer 贴合底边(否则会留一条缝) */
  .select-dropdown.has-footer {
    padding-bottom: 0;
  }

  /* 下拉底部插槽:粘在底部,与选项列表用分隔线隔开(如"新增标签"入口) */
  .select-dropdown-footer {
    position: sticky;
    bottom: 0;
    margin: 4px -4px 0;
    padding: 4px;
    border-top: 1px solid var(--card-border-color, #eee);
    background: var(--ant-select-dropdown-bg-color, #fff);
  }

  [data-theme='night'] {
    .select-option {
      &:hover {
        background: color-mix(in srgb, var(--primary-color) 18%, transparent);
      }
      &.is-selected {
        background: color-mix(in srgb, var(--primary-color) 28%, transparent);
      }
    }

    .select-tag {
      background: color-mix(in srgb, var(--primary-color) 20%, transparent);
      border-color: color-mix(in srgb, var(--primary-color) 26%, transparent);
    }
  }
</style>
