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
        >‹</button
      >

      <template v-for="p in visiblePages" :key="p">
        <span v-if="p === '...'" class="bpagination__ellipsis">…</span>
        <button
          v-else
          class="bpagination__btn"
          :class="{ 'bpagination__btn--active': p === current }"
          @click="goTo(p as number)"
          >{{ p }}</button
        >
      </template>

      <button
        class="bpagination__btn bpagination__btn--nav"
        :disabled="current >= totalPages"
        @click="goTo(current + 1)"
        :title="t('common.nextPage')"
        >›</button
      >
    </div>

    <BSelect
      class="bpagination__sizer"
      dropdown-class-name="bpagination__sizer-dropdown"
      dropdown-width="content"
      :value="pageSize"
      :options="sizeOptions"
      @change="selectSize"
    >
      <template #selected-label>{{ t('common.perPage', { n: pageSize }) }}</template>
      <template #arrow><SvgIcon :src="icon.pagination.chevron" :size="10" :density-aware="false" /></template>
    </BSelect>
  </div>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';

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

  function selectSize(value: string | number | (string | number)[]) {
    emit('sizeChange', Number(value));
  }

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
    gap: var(--ui-space-16, 16px);
    flex-wrap: wrap;
    padding: var(--ui-space-2, 2px) 0;
  }

  .bpagination__total {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    white-space: nowrap;
    flex-shrink: 0;
    min-width: var(--ui-layout-60, 60px);
  }

  .bpagination__pages {
    display: flex;
    align-items: center;
    gap: var(--ui-space-2, 2px);
    flex-shrink: 0;
  }

  .bpagination__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--ui-layout-30, 30px);
    height: var(--ui-control-30, 30px);
    padding: 0 var(--ui-space-6, 6px);
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
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
      font-size: var(--ui-font-16, 16px);
      font-weight: 300;
      padding: 0 var(--ui-space-4, 4px);
      min-width: var(--ui-layout-26, 26px);
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
    width: var(--ui-layout-28, 28px);
    height: var(--ui-control-30, 30px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    user-select: none;
    opacity: 0.4;
  }

  .bpagination__sizer {
    flex-shrink: 0;
    position: relative;
  }

  // Keep the original pagination appearance while sharing BSelect positioning and keyboard handling.
  .bpagination__sizer :deep(.select-trigger) {
    // Preserve the host pagination box model when replacing its legacy trigger.
    box-sizing: inherit;
    display: inline-flex;
    gap: var(--ui-space-6, 6px);
    height: var(--ui-control-30, 30px);
    padding: 0 var(--ui-space-10, 10px);
    border-color: var(--menu-item-h-bg-color);
    background: transparent;
    font-size: var(--ui-font-12, 12px);
    transition: all 0.15s ease;
  }
  .bpagination__sizer :deep(.select-text) {
    flex: none;
    font-size: inherit;
  }
  .bpagination__sizer :deep(.select-trigger:hover) {
    border-color: #615ced;
    background: var(--menu-item-h-bg-color);
  }
  .bpagination__sizer.is-open :deep(.select-trigger) {
    border-color: #615ced;
  }
  .bpagination__sizer :deep(.select-suffix) {
    position: static;
    transform: none;
    width: var(--ui-layout-10, 10px);
  }
  .bpagination__sizer :deep(.select-arrow) {
    width: var(--ui-layout-10, 10px);
    height: var(--ui-layout-6, 6px);
  }
  .bpagination__sizer :deep(.select-arrow > *) {
    width: var(--ui-layout-10, 10px) !important;
    height: var(--ui-layout-6, 6px) !important;
  }
  :global(.bpagination__sizer-dropdown.select-dropdown) {
    border-color: var(--menu-item-h-bg-color);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  }
  :global(.bpagination__sizer-dropdown .select-option) {
    height: auto;
    padding: var(--ui-space-6, 6px) var(--ui-space-12, 12px);
    margin-top: 0;
    font-size: var(--ui-font-12, 12px);
  }
  :global(.bpagination__sizer-dropdown.select-dropdown .select-option + .select-option) {
    margin-top: 0;
  }
  :global(.bpagination__sizer-dropdown .select-option:hover),
  :global(.bpagination__sizer-dropdown .select-option.is-active) {
    background: var(--menu-item-h-bg-color);
  }
  :global(.bpagination__sizer-dropdown .select-option.is-selected) {
    background: var(--common-tag-bg-color);
    color: var(--text-color);
  }
</style>
