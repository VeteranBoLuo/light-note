<template>
  <nav class="note-tag-sidebar" :aria-label="$t('note.tagDirectory')">
    <div class="note-tag-search">
      <BInput v-model:value="keyword" :placeholder="$t('note.searchTag')" clearable>
        <template #prefix>
          <SvgIcon :src="icon.navigation.search" size="15" />
        </template>
      </BInput>
    </div>

    <div v-if="loading" class="note-tag-skeleton-wrap">
      <div v-for="n in 8" :key="`tag-skeleton-${n}`" class="note-tag-skeleton-item"></div>
    </div>

    <div v-else ref="scrollRef" v-auto-scrollbar class="note-tag-scroll">
      <!-- 选中态用一条滑动指示条,定位取 offsetTop/offsetHeight(布局像素):
           界面缩放是 <html> 的 CSS zoom,getBoundingClientRect 返回的视觉坐标在缩放≠100% 时会错位 -->
      <div class="note-tag-indicator" :class="{ ready: indicatorReady }" :style="indicatorStyle" aria-hidden="true" />

      <div
        v-for="entry in fixedEntries"
        :key="entry.key"
        class="note-tag-item"
        :class="{ active: activeKey === entry.key }"
        :data-tag-key="entry.key"
        :title="entry.label"
        role="button"
        tabindex="0"
        :aria-current="activeKey === entry.key ? 'true' : undefined"
        v-click-log="OPERATION_LOG_MAP.noteLibrary.filterNote"
        @click="selectTag(entry.key)"
        @keydown.enter.prevent="selectTag(entry.key)"
        @keydown.space.prevent="selectTag(entry.key)"
      >
        <SvgIcon :src="entry.icon" size="16" class="note-tag-icon" />
        <span class="note-tag-name text-hidden">{{ entry.label }}</span>
        <span v-if="entry.count !== null" class="note-tag-count">{{ entry.count }}</span>
      </div>

      <div class="note-tag-divider" role="separator"></div>

      <div
        v-for="tag in filteredTags"
        :key="tag.id"
        class="note-tag-item"
        :class="{ active: activeKey === tag.id }"
        :data-tag-key="tag.id"
        :title="tag.name"
        role="button"
        tabindex="0"
        :aria-current="activeKey === tag.id ? 'true' : undefined"
        v-click-log="OPERATION_LOG_MAP.noteLibrary.filterNote"
        @click="selectTag(tag.id)"
        @keydown.enter.prevent="selectTag(tag.id)"
        @keydown.space.prevent="selectTag(tag.id)"
      >
        <SvgIcon :src="tag.iconUrl || icon.manage_categoryBtn_tag" size="16" class="note-tag-icon" />
        <span class="note-tag-name text-hidden">{{ tag.name }}</span>
        <span class="note-tag-count">{{ tag.noteCount }}</span>
      </div>

      <!-- 搜索无命中 ≠ 一个标签都没有,两种空态分开说 -->
      <div v-if="!filteredTags.length" class="note-tag-empty">
        {{ keyword.trim() ? $t('note.noTagMatch') : $t('note.noTag') }}
      </div>
    </div>
  </nav>
</template>

<script lang="ts" setup>
  import { computed, nextTick, ref, watch } from 'vue';
  import router from '@/router';
  import { scrollIntoContainer } from '@/utils/zoom';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { useI18n } from 'vue-i18n';

  interface NoteTagOption {
    id: string;
    name: string;
    iconUrl?: string;
    noteCount?: number;
  }

  const props = withDefaults(
    defineProps<{
      allTags?: NoteTagOption[];
      totalCount?: number;
      untaggedCount?: number | null;
      loading?: boolean;
      deferNavigation?: boolean;
    }>(),
    {
      allTags: () => [],
      totalCount: 0,
      untaggedCount: null,
      loading: false,
      deferNavigation: false,
    },
  );

  const { t } = useI18n();
  const emit = defineEmits<{ select: [key: string] }>();
  const keyword = ref('');
  const scrollRef = ref<HTMLElement | null>(null);
  const indicatorTop = ref(0);
  const indicatorHeight = ref(0);
  const indicatorReady = ref(false);

  const ALL_KEY = 'all';
  const UNTAGGED_KEY = 'null';

  // 筛选状态的唯一事实源仍是 URL query,侧栏只负责 push;
  // 列表重新取数由 NoteLibrary 对 query.tag 的 watch 驱动,与卡片视图的下拉筛选完全同源
  const activeKey = computed(() => {
    const rawTag = router.currentRoute.value.query.tag;
    const value = Array.isArray(rawTag) ? rawTag[0] : rawTag;
    if (value === undefined || value === null || value === '') return ALL_KEY;
    return String(value);
  });

  const fixedEntries = computed(() => [
    {
      key: ALL_KEY,
      label: t('note.allNote'),
      icon: icon.resource.note,
      count: props.totalCount,
    },
    {
      key: UNTAGGED_KEY,
      label: t('note.noTagNote'),
      icon: icon.filterPanel.noTag,
      // 后端未提供无标签统计时不显示占位数字,不猜 0
      count: props.untaggedCount === null || props.untaggedCount === undefined ? null : props.untaggedCount,
    },
  ]);

  const filteredTags = computed(() => {
    const lower = keyword.value.trim().toLowerCase();
    if (!lower) return props.allTags;
    return props.allTags.filter((tag) => tag.name?.toLowerCase().includes(lower));
  });

  const indicatorStyle = computed(() => ({
    transform: `translateY(${indicatorTop.value}px)`,
    height: `${indicatorHeight.value}px`,
  }));

  function syncIndicator() {
    const container = scrollRef.value;
    if (!container) {
      indicatorReady.value = false;
      return;
    }
    const target = container.querySelector<HTMLElement>(`[data-tag-key="${activeKey.value}"]`);
    // 当前选中的标签被搜索过滤掉时收起指示条,不停在错误的行上
    if (!target) {
      indicatorReady.value = false;
      return;
    }
    indicatorTop.value = target.offsetTop;
    indicatorHeight.value = target.offsetHeight;
    indicatorReady.value = true;
    revealActiveTag(container, target);
  }

  /*
   * 选中的标签可能不在可视区内 —— 典型场景是点笔记卡片上的标签直接筛选,
   * 目录不跟着走用户就看不到当前选中的是哪个。只在确实不可见时滚动,
   * 避免每次同步指示条都把列表抖一下。
   */
  function revealActiveTag(container: HTMLElement, target: HTMLElement) {
    const viewTop = container.scrollTop;
    const viewBottom = viewTop + container.clientHeight;
    const targetTop = target.offsetTop;
    const targetBottom = targetTop + target.offsetHeight;
    if (targetTop >= viewTop && targetBottom <= viewBottom) return;
    // 用 scrollIntoContainer 而不是裸写 scrollTo:界面缩放是 <html> 的 CSS zoom,
    // 视觉坐标与布局坐标是两套,该工具已经按 getRootZoom() 换算过
    scrollIntoContainer(container, target, Math.max(0, container.clientHeight / 2 - target.offsetHeight));
  }

  function selectTag(key: string) {
    emit('select', key);
    if (props.deferNavigation || key === activeKey.value) return;
    const query = { ...router.currentRoute.value.query };
    delete query._rt;
    if (key === ALL_KEY) {
      delete query.tag;
      void router.push({ path: '/noteLibrary', query });
      return;
    }
    query.tag = key;
    void router.push({ path: '/noteLibrary', query });
  }

  watch(
    [activeKey, filteredTags, () => props.loading],
    () => {
      void nextTick(syncIndicator);
    },
    { immediate: true },
  );
</script>

<style lang="less" scoped>
  .note-tag-sidebar {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .note-tag-search {
    flex-shrink: 0;
    // 与下方列表项右边缘对齐:4px 呼吸位 + 3px 滚动条槽
    padding-right: 7px;
  }

  // 暗色下 --bl-input-noBorder-bg-color 与 --workspace-panel-bg-color 同为 #252933,
  // 输入框会和侧栏底色糊在一起,所以把它抬到卡片表面层并补一圈边框(浅色同样受益)
  // BInput 默认的 --bl-input-noBorder-bg-color 是按页面底色调的(暗色恰好也是 #252933),
  // 放进同色的侧栏面板里会整个隐形。这里沿用顶部搜索框那套无边框语言,
  // 只把填充改成相对侧栏底色偏移:浅色下压暗、暗色下提亮,保持与页面级搜索框一致的对比方向。
  .note-tag-search :deep(.b-input) {
    height: 34px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--text-color) 6%, var(--workspace-panel-bg-color));

    &:hover,
    &:focus-visible {
      background: color-mix(in srgb, var(--text-color) 10%, var(--workspace-panel-bg-color));
    }
  }

  // 滚动条行为由 v-auto-scrollbar 指令 + .auto-scrollbar 全局样式提供,这里只管布局
  .note-tag-scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-right: 4px;
  }

  .note-tag-indicator {
    position: absolute;
    // 右侧让开滚动条槽位,与列表项右边缘对齐(absolute 的包含块是 padding box,不能用 inset-inline: 0)
    left: 0;
    right: 4px;
    top: 0;
    border-radius: 9px;
    background: color-mix(in srgb, var(--resource-note-color, #00a884) 12%, transparent);
    opacity: 0;
    pointer-events: none;
    transition:
      transform 260ms cubic-bezier(0.22, 0.61, 0.36, 1),
      height 200ms ease,
      opacity 160ms ease;

    &.ready {
      opacity: 1;
    }
  }

  .note-tag-item {
    position: relative;
    z-index: 1;
    height: 34px;
    padding: 0 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-radius: 9px;
    box-sizing: border-box;
    cursor: pointer;
    font-size: 13px;
    color: var(--desc-color);
    transition: color 160ms ease;

    &:hover {
      color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 7%, transparent);
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--resource-note-color, #00a884) 60%, transparent);
      outline-offset: -2px;
    }

    &.active {
      color: var(--resource-note-color, #00a884);
      background: transparent;
    }
  }

  .note-tag-icon {
    flex-shrink: 0;
  }

  .note-tag-name {
    flex: 1;
    min-width: 0;
  }

  .note-tag-count {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--sub-text-color, var(--desc-color));
    font-variant-numeric: tabular-nums;
  }

  .note-tag-item.active .note-tag-count {
    color: inherit;
  }

  .note-tag-divider {
    height: 1px;
    margin: 6px 4px;
    background: var(--card-border-color);
  }

  .note-tag-empty {
    padding: 10px;
    font-size: 12px;
    color: var(--desc-color);
    text-align: center;
  }

  .note-tag-skeleton-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow: hidden;
  }

  .note-tag-skeleton-item {
    position: relative;
    overflow: hidden;
    flex-shrink: 0;
    height: 34px;
    border-radius: 9px;
    background: var(--card-background);

    &::after {
      content: '';
      position: absolute;
      top: 0;
      left: -60%;
      width: 60%;
      height: 100%;
      background: linear-gradient(90deg, transparent, var(--skeleton-body-bg-color), transparent);
      animation: note-tag-skeleton-shine 2s infinite;
    }
  }

  @keyframes note-tag-skeleton-shine {
    0% {
      left: -60%;
    }
    100% {
      left: 120%;
    }
  }

  // 平板等粗指针设备保证触控高度
  @media (pointer: coarse) {
    .note-tag-item {
      height: 42px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .note-tag-indicator {
      transition: none;
    }

    .note-tag-skeleton-item::after {
      animation: none;
    }
  }
</style>
