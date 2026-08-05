<template>
  <div ref="containerRef" class="flex-align-center-gap tab-container" :class="`is-${variant}`" role="tablist">
    <div
      class="dom-hover tab"
      v-for="tab in resolvedOptions"
      :key="tab.key ?? tab.label"
      :class="{
        'is-active': activeValue === (tab.key ?? tab.label),
        'has-badge': tab.badge !== undefined,
      }"
      role="tab"
      :tabindex="activeValue === (tab.key ?? tab.label) ? 0 : -1"
      :aria-selected="activeValue === (tab.key ?? tab.label)"
      @click="tabChange(tab)"
      @keydown="handleTabKeydown($event, tab, resolvedOptions.indexOf(tab))"
    >
      <span>{{ tab.label }}</span>
      <span v-if="tab.badge !== undefined" class="tab-badge" :class="{ 'is-zero': Number(tab.badge) === 0 }">
        {{ tab.badge }}
      </span>
    </div>
    <div v-if="variant === 'line'" class="underline"></div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

  export interface TabItem {
    label: string;
    key?: string;
    badge?: string | number;
  }

  const emit = defineEmits(['change']);
  const props = withDefaults(
    defineProps<{
      options: (string | TabItem)[];
      variant?: 'line' | 'pill' | 'segment';
    }>(),
    {
      options: () => [],
      variant: 'line',
    },
  );

  const activeTab = defineModel<string>('activeTab');
  const containerRef = ref<HTMLElement | null>(null);

  const resolvedOptions = computed<TabItem[]>(() =>
    props.options.map((opt) => (typeof opt === 'string' ? { label: opt } : opt)),
  );

  const activeValue = computed(() => {
    const active = activeTab.value;
    if (active == null) return '';
    const matched = resolvedOptions.value.find((t) => t.key === active || t.label === active);
    return matched ? (matched.key ?? matched.label) : active;
  });

  function tabChange(tab: string | TabItem) {
    const resolved = typeof tab === 'string' ? resolvedOptions.value.find((t) => (t.key ?? t.label) === tab) : tab;
    if (!resolved) return;
    const value = resolved.key ?? resolved.label;
    if (activeValue.value === value) {
      syncUnderline(value);
      return;
    }
    activeTab.value = value;
    emit('change', value);
  }

  function handleTabKeydown(event: KeyboardEvent, tab: TabItem, index: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      tabChange(tab);
      return;
    }
    const horizontalKey = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    if (!horizontalKey && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const count = resolvedOptions.value.length;
    if (!count) return;
    const targetIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? count - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + count) % count;
    const target = resolvedOptions.value[targetIndex];
    if (!target) return;
    tabChange(target);
    nextTick(() => containerRef.value?.querySelectorAll<HTMLElement>('[role="tab"]')[targetIndex]?.focus());
  }

  function syncUnderline(value: string) {
    if (props.variant !== 'line') return;
    const tabs = containerRef.value?.querySelectorAll<HTMLElement>('.tab');
    const underline = containerRef.value?.querySelector<HTMLElement>('.underline');
    const index = resolvedOptions.value.findIndex((tab) => (tab.key ?? tab.label) === value);
    if (index >= 0 && tabs?.[index] && underline) {
      underline.style.width = `${tabs[index].offsetWidth}px`;
      underline.style.left = `${tabs[index].offsetLeft}px`;
    }
  }

  watch(
    () => [
      activeTab.value,
      ...resolvedOptions.value.map((tab) => `${tab.key ?? tab.label}:${tab.label}:${tab.badge ?? ''}`),
    ],
    ([value]) => {
      if (!value) return;
      nextTick(() => syncUnderline(String(value)));
    },
    {
      immediate: true,
    },
  );

  /*
   * 下划线的宽度/位置是按 tab 的 offsetWidth 量出来的,只在切换时算一次。
   * 刚进页面时布局还没稳(相邻面板在加载、字体还没换上),量到的是中间态的尺寸,
   * 之后没人再算 —— 表现就是刷新后下划线横跨了两个 tab(实测量到 405px,实际 tab 只有 295px)。
   * 这里补上尺寸变化后的重算。
   */
  let underlineObserver: ResizeObserver | null = null;
  const resyncTimers: number[] = [];
  const resync = () => syncUnderline(String(activeValue.value));

  onMounted(() => {
    if (props.variant !== 'line') return;
    if (typeof ResizeObserver !== 'undefined' && containerRef.value) {
      underlineObserver = new ResizeObserver(resync);
      underlineObserver.observe(containerRef.value);
      // tab 自身宽度变化(文案变长、字体换成中文字体)时容器尺寸可能不变,逐个也观察上
      containerRef.value.querySelectorAll<HTMLElement>('.tab').forEach((tab) => underlineObserver?.observe(tab));
    }
    // 兜底:窗口尺寸变化、字体加载完成,以及挂载后的几个时间点各校验一次。
    // 相邻面板(如 AI 助手)是异步挂载的,首次计算往往落在它出现之前 —— 那时 tab 还占着整行,
    // 量到的宽度比最终值大一截,下划线就会横跨到隔壁 tab 上。
    // ResizeObserver 理论上能覆盖,但实测在这个场景里不总是触发,所以补上定时校验。
    window.addEventListener('resize', resync);
    (document as any).fonts?.ready?.then?.(resync);
    requestAnimationFrame(() => requestAnimationFrame(resync));
    [120, 400, 1000].forEach((delay) => {
      const timer = window.setTimeout(resync, delay);
      resyncTimers.push(timer);
    });
  });

  onBeforeUnmount(() => {
    underlineObserver?.disconnect();
    underlineObserver = null;
    window.removeEventListener('resize', resync);
    resyncTimers.forEach((timer) => window.clearTimeout(timer));
    resyncTimers.length = 0;
  });
</script>

<style scoped lang="less">
  .tab-container {
    position: relative;
    border-bottom: 1px solid var(--card-border-color);
    padding-bottom: 5px;
    margin-bottom: 10px;
    display: flex;
    gap: 24px;
  }

  .tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    cursor: pointer;
    padding: 4px 0;
    color: var(--desc-color);
    transition: color 0.2s;
    white-space: nowrap;

    &.is-active {
      color: var(--text-color);
      font-weight: 500;
    }
  }
  .tab-badge {
    min-width: 18px;
    height: 18px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--hover-background);
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1;
  }
  .tab-badge.is-zero {
    opacity: 0.65;
  }
  .underline {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background-color: #615ced;
    transition:
      left 0.3s ease,
      width 0.3s ease;
  }
  .tab-container.is-pill {
    gap: 4px;
    margin: 0;
    padding: 0;
    border-bottom: 0;
  }
  .is-pill .tab {
    min-height: 34px;
    box-sizing: border-box;
    padding: 7px 10px;
    border: 1px solid transparent;
    border-radius: 9px;
    transition:
      color 0.18s ease,
      background 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;
  }
  .is-pill .tab:hover {
    background: color-mix(in srgb, var(--primary-color) 7%, transparent);
    color: var(--text-color);
  }
  .is-pill .tab.is-active {
    border-color: color-mix(in srgb, var(--primary-color) 18%, transparent);
    background: color-mix(in srgb, var(--primary-color) 10%, var(--background-color));
    color: var(--primary-color);
    box-shadow: 0 3px 10px color-mix(in srgb, var(--primary-color) 9%, transparent);
  }
  .is-pill .tab.is-active .tab-badge {
    background: var(--primary-color);
    color: #fff;
    opacity: 1;
  }

  .tab-container.is-segment {
    gap: 0;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--surface-border-color, var(--card-border-color));
    border-radius: 0;
    background: var(--card-background, var(--background-color));
  }

  .is-segment .tab {
    position: relative;
    min-height: 32px;
    margin: 0;
    padding: 0 14px;
    border-right: 1px solid var(--surface-border-color, var(--card-border-color));
    color: var(--desc-color);
    font-size: 12px;
    line-height: 32px;
    transition:
      color 0.16s ease,
      background 0.16s ease,
      box-shadow 0.16s ease;
  }

  .is-segment .tab:last-of-type {
    border-right: 0;
  }

  .is-segment .tab:hover {
    color: var(--text-color);
    background: color-mix(in srgb, var(--primary-color) 4%, var(--card-background));
  }

  .is-segment .tab.is-active {
    color: var(--primary-color);
    font-weight: 650;
    background: color-mix(in srgb, var(--primary-color) 8%, var(--card-background));
    box-shadow: inset 0 -2px 0 var(--primary-color);
  }
</style>
