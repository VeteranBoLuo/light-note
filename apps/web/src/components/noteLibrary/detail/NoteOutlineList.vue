<template>
  <nav
    ref="rootRef"
    v-auto-scrollbar
    class="note-outline-list"
    :class="{ 'is-mobile': mobile, 'is-share': variant === 'share' }"
    :aria-label="t('noteDetail.catalogTitle')"
  >
    <BButton
      v-for="(heading, index) in headings"
      :key="headingKey(heading, index)"
      :ref="(component) => setItemRef(index, component)"
      class="toc-item"
      :class="{ active: activeIndex === index }"
      :style="{ '--toc-indent': `${headingIndent(heading.level)}px` }"
      :aria-current="activeIndex === index ? 'location' : undefined"
      @click="emit('select', index)"
      v-click-log="{ module: '笔记', operation: `点击目录【${heading.text}】` }"
    >
      <span class="toc-marker" aria-hidden="true" />
      <span class="toc-text">{{ heading.text || t('noteDetail.catalogUntitled') }}</span>
    </BButton>
    <p v-if="showEmpty && !headings.length" class="toc-empty">{{ t('noteDetail.catalogEmpty') }}</p>
  </nav>
</template>

<script lang="ts" setup>
  import { computed, nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { scrollNearestIntoContainer } from '@/utils/zoom';

  interface NoteOutlineItem {
    id?: string;
    text: string;
    level: number;
  }

  const props = withDefaults(
    defineProps<{
      headings: NoteOutlineItem[];
      activeIndex?: number | null;
      mobile?: boolean;
      showEmpty?: boolean;
      variant?: 'default' | 'share';
    }>(),
    {
      activeIndex: null,
      mobile: false,
      showEmpty: true,
      variant: 'default',
    },
  );
  const emit = defineEmits<{ select: [index: number] }>();
  const { t } = useI18n();
  const rootRef = ref<HTMLElement | null>(null);
  const itemRefs = new Map<number, HTMLElement>();
  const minimumHeadingLevel = computed(() =>
    props.headings.length ? Math.min(...props.headings.map((heading) => Number(heading.level) || 1)) : 1,
  );

  function headingIndent(level: number) {
    return Math.min(3, Math.max(0, Number(level || 1) - minimumHeadingLevel.value)) * 16;
  }

  function headingKey(heading: NoteOutlineItem, index: number) {
    return heading.id || `${heading.level}:${heading.text}:${index}`;
  }

  function setItemRef(index: number, component: any) {
    const element = component?.$el instanceof HTMLElement ? component.$el : component;
    if (element instanceof HTMLElement) itemRefs.set(index, element);
    else itemRefs.delete(index);
  }

  async function scrollActiveIntoView(behavior: ScrollBehavior = 'smooth') {
    await nextTick();
    const root = rootRef.value;
    const item = props.activeIndex === null ? null : itemRefs.get(props.activeIndex);
    if (root && item) scrollNearestIntoContainer(root, item, behavior);
  }

  watch(
    () => props.activeIndex,
    () => void scrollActiveIntoView('auto'),
  );

  defineExpose({ scrollActiveIntoView });
</script>

<style scoped lang="less">
  .note-outline-list {
    height: calc(100% - 12px);
    display: grid;
    align-content: start;
    gap: 2px;
    min-height: 0;
    margin: 6px 0;
    padding: 0;
    box-sizing: border-box;
    overflow-y: auto;
  }

  .toc-item.b_btn {
    position: relative;
    width: 100%;
    min-width: 0;
    min-height: 36px;
    height: auto;
    padding: 7px 10px 7px calc(10px + var(--toc-indent));
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 9px;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--catalog-color);
    background: transparent;
    text-align: left;
  }

  .toc-item.b_btn:hover {
    color: var(--text-color);
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 7%, transparent);
  }

  .toc-item.active {
    border-color: var(--resource-note-color, #00a884);
    color: var(--resource-note-color, #00a884);
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 11%, transparent);
    font-weight: 650;
  }

  .toc-marker {
    width: 5px;
    height: 5px;
    flex: 0 0 5px;
    border-radius: 50%;
    background: color-mix(in srgb, currentColor 42%, transparent);
  }

  .toc-item.active .toc-marker {
    background: currentColor;
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--resource-note-color, #00a884) 12%, transparent);
  }

  .note-outline-list.is-share .toc-item.active {
    border-color: transparent;
    color: var(--primary-color);
    background: var(--primary-btn-h-bg-color);
    box-shadow: inset 3px 0 0 var(--primary-color);
  }

  .note-outline-list.is-share .toc-item.active .toc-marker {
    background: var(--primary-color);
    box-shadow: none;
  }

  .toc-text {
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-outline-list.is-mobile {
    height: 100%;
    margin: 0;
    padding: 8px max(10px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom))
      max(10px, env(safe-area-inset-left));
    box-sizing: border-box;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .note-outline-list.is-mobile .toc-item.b_btn {
    min-height: 48px;
    padding-top: 11px;
    padding-bottom: 11px;
    border-radius: 12px;
  }

  .note-outline-list.is-mobile .toc-text {
    font-size: 15px;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .toc-empty {
    min-height: 180px;
    margin: 0;
    display: grid;
    place-items: center;
    color: var(--desc-color);
    font-size: 14px;
  }
</style>
