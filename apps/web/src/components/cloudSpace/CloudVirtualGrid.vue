<template>
  <div class="cloud-virtual-grid" data-mobile-resource-scroll>
    <div ref="probeRef" class="cloud-virtual-grid__row cloud-virtual-grid__probe" aria-hidden="true" />
    <BVirtualList
      ref="listRef"
      :items="rows"
      :item-height="278"
      :gap="gap"
      :overscan="2"
      dynamic-height
      scroll-mode="ancestor"
      :retained-keys="retainedRows"
      :loading="loading"
      :has-more="hasMore"
      :show-loading-indicator="false"
      @load-more="$emit('load-more')"
    >
      <template #default="{ item: row }">
        <div class="cloud-virtual-grid__row">
          <slot v-for="item in row.items" :key="item.id" :item="item" />
        </div>
      </template>
    </BVirtualList>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import { useUiDensity } from '@/composables/useUiDensity';

  const props = defineProps<{
    items: Array<{ id: string | number; [key: string]: any }>;
    retainedKeys?: Array<string | number>;
    loading?: boolean;
    hasMore?: boolean;
  }>();
  defineEmits<{ 'load-more': [] }>();
  const { density } = useUiDensity();
  const probeRef = ref<HTMLElement | null>(null);
  const listRef = ref<InstanceType<typeof BVirtualList> | null>(null);
  const columns = ref(1);
  const gap = ref(14);
  const regroupingFocusKey = ref<string | null>(null);
  const rows = computed(() => {
    const result = [];
    for (let index = 0; index < props.items.length; index += columns.value) {
      result.push({ id: props.items[index].id, items: props.items.slice(index, index + columns.value) });
    }
    return result;
  });
  const retainedRows = computed(() => {
    const keys = new Set(props.retainedKeys || []);
    return keys.size || regroupingFocusKey.value !== null
      ? rows.value
          .filter((row) => row.items.some((item) => keys.has(item.id) || String(item.id) === regroupingFocusKey.value))
          .map((row) => row.id)
      : [];
  });
  let observer: ResizeObserver | null = null;
  let revision = 0;
  let pendingAnchor: ReturnType<InstanceType<typeof BVirtualList>['captureScrollAnchor']> = null;
  async function measureColumns() {
    const probe = probeRef.value;
    if (!probe?.clientWidth) return;
    // Ask the browser to resolve the actual tracks, including clamp(), cqi,
    // density tokens and the mobile breakpoint. Parsing a custom property as a
    // number would silently discard those layout rules.
    const tracks = getComputedStyle(probe).gridTemplateColumns;
    const nextColumns = Math.max(1, tracks === 'none' ? 1 : tracks.split(/\s+/).length);
    const nextGap = window.matchMedia('(max-width: 720px)').matches ? 12 : 14;
    const anchor = pendingAnchor || listRef.value?.captureScrollAnchor();
    pendingAnchor = null;
    if (nextColumns === columns.value && nextGap === gap.value) return;
    const focused = document.activeElement as HTMLElement | null;
    const card = focused?.closest<HTMLElement>('[data-cloud-file-id]');
    const ownsFocus = card && probe.parentElement?.contains(card);
    const focusPath = [];
    if (ownsFocus) {
      let element = focused;
      while (element && element !== card) {
        focusPath.unshift(Array.prototype.indexOf.call(element.parentElement?.children || [], element));
        element = element.parentElement;
      }
      regroupingFocusKey.value = card.dataset.cloudFileId || null;
    }
    const ticket = ++revision;
    columns.value = nextColumns;
    gap.value = nextGap;
    await nextTick();
    await nextTick();
    if (ticket !== revision) return;
    if (anchor) {
      const index = rows.value.findIndex((row) => row.items.some((item) => String(item.id) === anchor.key));
      if (index >= 0) listRef.value?.restoreScrollAnchor({ ...anchor, key: String(rows.value[index].id), index });
    }
    if (
      ownsFocus &&
      regroupingFocusKey.value !== null &&
      (document.activeElement === focused || document.activeElement === document.body)
    ) {
      const replacement = [...(probe.parentElement?.querySelectorAll<HTMLElement>('[data-cloud-file-id]') || [])].find(
        (element) => element.dataset.cloudFileId === regroupingFocusKey.value,
      );
      const target = focusPath.reduce<Element | undefined>((element, index) => element?.children[index], replacement);
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }
    regroupingFocusKey.value = null;
  }
  watch(
    density,
    () => {
      pendingAnchor = listRef.value?.captureScrollAnchor() || null;
    },
    { flush: 'sync' },
  );
  watch(density, measureColumns, { flush: 'post' });
  onMounted(() => {
    measureColumns();
    observer = new ResizeObserver(measureColumns);
    if (probeRef.value) observer.observe(probeRef.value);
  });
  onBeforeUnmount(() => {
    revision++;
    observer?.disconnect();
  });
</script>

<style scoped>
  .cloud-virtual-grid__row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--file-card-min-width), 1fr));
    gap: var(--ui-space-14, 14px);
  }
  .cloud-virtual-grid__probe {
    height: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
  }
  @media (max-width: 720px) {
    .cloud-virtual-grid__row {
      grid-template-columns: repeat(auto-fill, minmax(var(--ui-layout-220, 220px), 1fr));
      gap: var(--ui-space-12, 12px);
    }
  }
</style>
