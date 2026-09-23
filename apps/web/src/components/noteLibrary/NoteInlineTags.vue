<template>
  <div
    v-if="tags.length"
    ref="root"
    class="note-inline-tags"
    :class="{ 'is-compact': compact }"
    :style="{ width: compact ? undefined : `${naturalWidth}px` }"
  >
    <div ref="measure" class="note-inline-tags__measure" aria-hidden="true" inert>
      <ResourceTagChip v-for="(tag, index) in tags.slice(0, 2)" :key="index" :tag="tag" max-width="var(--ui-layout-120, 120px)" />
      <BChip tone="tag">+{{ tags.length }}</BChip>
    </div>
    <BPopover v-model:open="open" class="note-inline-tags__trigger" placement="bottom-right">
      <ResourceTagChip
        v-for="(tag, index) in tags.slice(0, visibleCount)"
        :key="`${tag.id}-${index}`"
        :tag="tag"
        interactive
        class="note-inline-tags__chip"
        :aria-expanded="open"
      />
      <BChip
        v-if="tags.length > visibleCount"
        tone="tag"
        interactive
        class="note-inline-tags__more"
        :aria-label="t('noteDetail.tagsWithCount', { count: tags.length })"
        :aria-expanded="open"
      >
        {{ visibleCount ? `+${tags.length - visibleCount}` : `# ${tags.length}` }}
      </BChip>
      <template #content>
        <div class="note-inline-tags__panel">
          <strong>{{ t('noteDetail.tagsWithCount', { count: tags.length }) }}</strong>
          <div v-auto-scrollbar class="note-inline-tags__list">
            <ResourceTagChip
              v-for="(tag, index) in tags"
              :key="`${tag.id}-${index}`"
              :tag="tag"
              :interactive="tag.id !== undefined && tag.id !== null && tag.id !== ''"
              @click="openTag(tag)"
            />
          </div>
        </div>
      </template>
    </BPopover>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useUiDensity } from '@/composables/useUiDensity';
  import { useRouter } from 'vue-router';
  import { resolveResourceRoute } from '@/utils/resourceNavigation';
  import { useI18n } from 'vue-i18n';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';
  import type { NoteTag } from '@/composables/useNoteTags';

  const props = defineProps<{ tags: NoteTag[]; compact?: boolean }>();
  const { t } = useI18n();
  const router = useRouter();
  const root = ref<HTMLElement | null>(null);
  const open = ref(false);
  const width = ref(0);
  const measure = ref<HTMLElement | null>(null);
  const chipWidths = ref<number[]>([]);
  const { dimension } = useUiDensity();
  const moreWidth = ref(dimension(36, 'layout'));
  const rowWidth = (count: number) =>
    chipWidths.value.slice(0, count).reduce((sum, item) => sum + item, 0) +
    (props.tags.length > count ? moreWidth.value : 0) +
    Math.max(0, count + (props.tags.length > count ? 1 : 0) - 1) * dimension(5);
  const naturalWidth = computed(() => Math.min(dimension(280, 'layout'), Math.max(dimension(44, 'layout'), rowWidth(Math.min(2, props.tags.length)))));
  const visibleCount = computed(() => {
    if (props.compact || !chipWidths.value.length) return 0;
    for (let count = Math.min(2, props.tags.length); count > 0; count--) {
      if (rowWidth(count) <= width.value + 1) return count;
    }
    return 0;
  });
  function openTag(tag: NoteTag) {
    if (tag.id === undefined || tag.id === null || tag.id === '') return;
    const target = resolveResourceRoute({ type: 'tag', id: String(tag.id) });
    if (!target) return;
    open.value = false;
    void router.push(target);
  }
  function measureChips() {
    if (!measure.value) return;
    const children = Array.from(measure.value.children) as HTMLElement[];
    // Preserve fractional text widths so the allocated row never rounds below its content.
    const widths = children.map((item) => Math.ceil(item.getBoundingClientRect().width));
    chipWidths.value = widths.slice(0, -1);
    moreWidth.value = widths.at(-1) || dimension(36, 'layout');
  }
  let measureObserver: ResizeObserver | undefined;
  watch(
    measure,
    (element) => {
      measureObserver?.disconnect();
      if (!element || typeof ResizeObserver === 'undefined') return;
      measureChips();
      measureObserver = new ResizeObserver(measureChips);
      measureObserver.observe(element);
    },
    { flush: 'post' },
  );
  let observer: ResizeObserver | undefined;
  watch(
    root,
    (element) => {
      observer?.disconnect();
      if (!element || typeof ResizeObserver === 'undefined') return;
      width.value = element.clientWidth;
      observer = new ResizeObserver(([entry]) => {
        width.value = entry.contentRect.width;
      });
      observer.observe(element);
    },
    { flush: 'post' },
  );
  watch(
    () => props.tags,
    () => {
      open.value = false;
      measureChips();
    },
    { flush: 'post', deep: true },
  );
  onBeforeUnmount(() => {
    observer?.disconnect();
    measureObserver?.disconnect();
  });
</script>

<style scoped lang="less">
  .note-inline-tags {
    position: relative;
    flex: 0 1 auto;
    min-width: var(--ui-layout-44, 44px);
    max-width: var(--ui-layout-280, 280px);
    &.is-compact {
      flex: 0 0 auto;
      width: auto;
    }
  }
  .note-inline-tags__measure {
    position: fixed;
    top: 0;
    left: 0;
    display: flex;
    gap: var(--ui-space-5, 5px);
    width: max-content;
    visibility: hidden;
    pointer-events: none;
  }
  .note-inline-tags__trigger {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--ui-space-5, 5px);
    min-width: 0;
  }
  .note-inline-tags__chip {
    flex: 0 1 auto;
    max-width: var(--ui-layout-120, 120px);
  }
  .note-inline-tags__more {
    flex: 0 0 auto;
  }
  .note-inline-tags__panel {
    width: var(--ui-layout-280, 280px);
    max-width: calc(100vw - 48px);
    padding: var(--ui-space-12, 12px);
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
  }
  .note-inline-tags__list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    max-height: var(--ui-layout-240, 240px);
    overflow: auto;
    margin-top: var(--ui-space-10, 10px);
    :deep(.resource-tag-chip) {
      max-width: 100%;
    }
    :deep(.resource-tag-chip__text) {
      white-space: normal;
      overflow-wrap: anywhere;
      text-align: left;
    }
  }
</style>
