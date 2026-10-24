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
  type GridScrollAnchor = NonNullable<ReturnType<InstanceType<typeof BVirtualList>['captureScrollAnchor']>> & {
    rowHeight: number;
  };
  function captureFileAnchor(): GridScrollAnchor | null {
    const root = probeRef.value?.parentElement;
    if (!root) return null;
    const top = root.getBoundingClientRect().top;
    // 同步密度监听时数值 token 已改变，但 DOM 仍是旧布局；从可见行读取旧锚点。
    const card = [...root.querySelectorAll<HTMLElement>('[data-cloud-file-id]')].find(
      (element) => element.getBoundingClientRect().bottom > top + 1,
    );
    const row = card?.closest<HTMLElement>('[data-virtual-index]');
    if (!card || !row) return null;
    const rect = row.getBoundingClientRect();
    return {
      key: card.dataset.cloudFileId!,
      index: Number(row.dataset.virtualIndex),
      offset: top - rect.top,
      rowHeight: rect.height,
    };
  }
  let pendingAnchor: GridScrollAnchor | null = null;
  async function restoreFileAnchor(
    anchor: GridScrollAnchor,
    isCurrent: () => boolean = () => true,
    layoutChanged = false,
  ) {
    const index = rows.value.findIndex((row) => row.items.some((item) => String(item.id) === anchor.key));
    if (index < 0 || !isCurrent()) return;
    const key = String(rows.value[index].id);
    listRef.value?.restoreScrollAnchor({ ...anchor, offset: 0, key, index });
    await nextTick();
    if (!isCurrent()) return;
    const row = probeRef.value?.parentElement?.querySelector<HTMLElement>(`[data-virtual-index="${index}"]`);
    const height = row?.getBoundingClientRect().height;
    // 仅在布局变化时缩放行内阅读比例；上传更新仍保留原像素偏移。
    const offset =
      layoutChanged && height && anchor.rowHeight && height < anchor.rowHeight
        ? (anchor.offset * height) / anchor.rowHeight
        : anchor.offset;
    listRef.value?.restoreScrollAnchor({ ...anchor, offset, key, index });
  }
  watch(
    () => props.items,
    async (_, __, onCleanup) => {
      let cancelled = false;
      onCleanup(() => {
        cancelled = true;
      });
      // 父组件更新前，子列表仍持有旧分行；新增文件后按文件键找到新的所在行。
      const anchor = captureFileAnchor();
      if (!anchor || (anchor.index === 0 && anchor.offset <= 0)) return;
      await nextTick();
      await nextTick();
      const current = captureFileAnchor();
      // 筛选或排序可能显式回到顶部，不能用旧阅读位置覆盖该操作。
      if (!cancelled && current && (current.index > 0 || current.offset > 0))
        await restoreFileAnchor(anchor, () => !cancelled);
    },
    { flush: 'pre' },
  );
  async function measureColumns() {
    const probe = probeRef.value;
    if (!probe?.clientWidth) return;
    // Ask the browser to resolve the actual tracks, including clamp(), cqi,
    // density tokens and the mobile breakpoint. Parsing a custom property as a
    // number would silently discard those layout rules.
    const tracks = getComputedStyle(probe).gridTemplateColumns;
    const nextColumns = Math.max(1, tracks === 'none' ? 1 : tracks.split(/\s+/).length);
    const nextGap = window.matchMedia('(max-width: 720px)').matches ? 12 : 14;
    const anchor = pendingAnchor || captureFileAnchor();
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
    if (anchor) await restoreFileAnchor(anchor, () => ticket === revision, true);
    if (ticket !== revision) return;
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
      pendingAnchor = captureFileAnchor() || null;
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
