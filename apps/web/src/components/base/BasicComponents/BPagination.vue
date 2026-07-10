<template>
  <div class="bpagination">
    <span class="bpagination__total">{{ t('common.totalItems', { n: total }) }}</span>

    <!-- 页码 -->
    <div class="bpagination__pages">
      <button
        class="bpagination__btn bpagination__btn--nav"
        :disabled="current === 1"
        @click="goTo(current - 1)"
        :title="t('common.prevPage')"
      >‹</button>

      <template v-for="p in visiblePages" :key="p">
        <span v-if="p === '...'" class="bpagination__ellipsis">…</span>
        <button
          v-else
          class="bpagination__btn"
          :class="{ 'bpagination__btn--active': p === current }"
          @click="goTo(p as number)"
        >{{ p }}</button>
      </template>

      <button
        class="bpagination__btn bpagination__btn--nav"
        :disabled="current >= totalPages"
        @click="goTo(current + 1)"
        :title="t('common.nextPage')"
      >›</button>
    </div>

    <!-- 每页条数（自定义下拉） -->
    <div class="bpagination__sizer" ref="sizerRef">
      <div
        class="bpagination__sizer-trigger"
        :class="{ 'bpagination__sizer-trigger--open': dropdownOpen }"
        @click="toggleDropdown"
      >
        <span>{{ t('common.perPage', { n: pageSize }) }}</span>
        <svg
          class="bpagination__sizer-arrow"
          :class="{ 'bpagination__sizer-arrow--open': dropdownOpen }"
          width="10" height="6" viewBox="0 0 10 6" fill="none"
        ><path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </div>
      <Teleport to="body">
        <div
          v-if="dropdownOpen"
          class="bpagination__sizer-dropdown"
          :style="dropdownStyle"
        >
          <div
            v-for="opt in sizeOptions"
            :key="opt.value"
            class="bpagination__sizer-option"
            :class="{ 'bpagination__sizer-option--selected': opt.value === pageSize }"
            @click="selectSize(opt.value)"
          >{{ opt.label }}</div>
        </div>
      </Teleport>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
  import { getRootZoom } from '@/utils/zoom';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();

  const props = defineProps({
    current: { type: Number, default: 1 },
    pageSize: { type: Number, default: 10 },
    total: { type: Number, default: 0 },
  });

  const emit = defineEmits<{
    pageChange: [page: number];
    sizeChange: [size: number];
  }>();

  const sizeOptions = computed(() => [
    { label: t('common.perPage', { n: 10 }), value: 10 },
    { label: t('common.perPage', { n: 20 }), value: 20 },
    { label: t('common.perPage', { n: 50 }), value: 50 },
    { label: t('common.perPage', { n: 100 }), value: 100 },
  ]);

  // 下拉状态
  const dropdownOpen = ref(false);
  const sizerRef = ref<HTMLElement | null>(null);
  const dropdownStyle = ref({});

  function toggleDropdown() {
    if (dropdownOpen.value) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  function openDropdown() {
    if (!sizerRef.value) return;
    // 界面缩放(html zoom):gBCR 含 zoom → ÷ zoom 换布局坐标;clientHeight 是布局像素、不换算
    const zoom = getRootZoom();
    const rect = sizerRef.value.getBoundingClientRect();
    const rTop = rect.top / zoom;
    const rBottom = rect.bottom / zoom;
    const rLeft = rect.left / zoom;
    const rWidth = rect.width / zoom;
    const estimatedHeight = 140; // 4 个选项预估高度
    const gap = 4;
    // documentElement.clientHeight 是视口高度(视觉像素),÷zoom 换布局坐标再与 rBottom(布局)比较
    const spaceBelow = document.documentElement.clientHeight / zoom - rBottom;
    const showAbove = spaceBelow < estimatedHeight && rTop > estimatedHeight;

    dropdownStyle.value = {
      position: 'fixed',
      left: `${rLeft}px`,
      top: showAbove ? `${rTop - gap - estimatedHeight}px` : `${rBottom + gap}px`,
      minWidth: `${rWidth}px`,
    };
    dropdownOpen.value = true;
  }

  function closeDropdown() {
    dropdownOpen.value = false;
  }

  function selectSize(value: number) {
    emit('sizeChange', value);
    closeDropdown();
  }

  // 点击外部关闭
  function onDocumentClick(e: MouseEvent) {
    if (!dropdownOpen.value) return;
    const target = e.target as Node;
    if (sizerRef.value && !sizerRef.value.contains(target)) {
      closeDropdown();
    }
  }

  onMounted(() => {
    document.addEventListener('click', onDocumentClick, true);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('click', onDocumentClick, true);
  });

  const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));

  const visiblePages = computed(() => {
    const pages: (number | '...')[] = [];
    const total = totalPages.value;
    const cur = props.current;

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
      return pages;
    }

    pages.push(1);
    if (cur > 3) pages.push('...');

    const start = Math.max(2, cur - 1);
    const end = Math.min(total - 1, cur + 1);
    for (let i = start; i <= end; i++) pages.push(i);

    if (cur < total - 2) pages.push('...');
    pages.push(total);

    return pages;
  });

  function goTo(page: number) {
    if (page < 1 || page > totalPages.value || page === props.current) return;
    emit('pageChange', page);
  }
</script>

<style lang="less" scoped>
  .bpagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
    padding: 2px 0;
  }

  .bpagination__total {
    font-size: 12px;
    color: var(--desc-color);
    white-space: nowrap;
    flex-shrink: 0;
    min-width: 60px;
  }

  .bpagination__pages {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .bpagination__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    padding: 0 6px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--desc-color);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
    line-height: 1;
    font-family: inherit;

    &:hover:not(:disabled) {
      background: var(--menu-item-h-bg-color);
      color: var(--text-color);
    }

    &--nav {
      font-size: 16px;
      font-weight: 300;
      padding: 0 4px;
      min-width: 26px;
    }

    &--active {
      background: rgba(99, 92, 237, 0.15);
      border-color: rgba(99, 92, 237, 0.3);
      color: #8a85ff;
      font-weight: 600;

      &:hover:not(:disabled) {
        background: rgba(99, 92, 237, 0.25);
        color: #a5a0ff;
      }
    }

    &:disabled {
      opacity: 0.2;
      cursor: not-allowed;
    }
  }

  .bpagination__ellipsis {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 30px;
    color: var(--desc-color);
    font-size: 13px;
    user-select: none;
    opacity: 0.4;
  }

  .bpagination__sizer {
    flex-shrink: 0;
    position: relative;
  }

  .bpagination__sizer-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border: 1px solid var(--menu-item-h-bg-color);
    border-radius: 6px;
    background: transparent;
    color: var(--text-color);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
    user-select: none;

    &:hover {
      border-color: #615ced;
      background: var(--menu-item-h-bg-color);
    }

    &--open {
      border-color: #615ced;
    }
  }

  .bpagination__sizer-arrow {
    flex-shrink: 0;
    color: var(--desc-color);
    transition: transform 0.2s ease;

    &--open {
      transform: rotate(180deg);
    }
  }

  .bpagination__sizer-dropdown {
    z-index: 1050;
    background: var(--ant-select-dropdown-bg-color);
    border: 1px solid var(--menu-item-h-bg-color);
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    overflow: hidden;
  }

  .bpagination__sizer-option {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--text-color);
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.12s ease;
    white-space: nowrap;
    user-select: none;

    &:hover {
      background: var(--menu-item-h-bg-color);
    }

    &--selected {
      background: var(--common-tag-bg-color);
      color: var(--text-color);
      font-weight: 500;
    }
  }
</style>
