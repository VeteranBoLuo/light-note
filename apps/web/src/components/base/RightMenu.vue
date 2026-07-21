<template>
  <div ref="containerRef" class="right-menu-anchor">
    <!-- 定义插槽，传递的内容就要显示在插槽之中 -->
    <slot></slot>
    <!-- 设置一个 div 用来显示菜单 -->
    <Teleport to="body">
      <Transition @beforeEnter="handleBeforeEnter" @enter="handleEnter">
        <div
          v-if="showMenu"
          class="context-menu-wrapper"
          :style="{
            left: mouseX + 'px',
            top: mouseY + 'px',
          }"
        >
          <div class="context-menu">
            <template v-for="(item, index) in normalizedMenu" :key="item.key || `divider-${index}`">
              <div v-if="item.divider" class="context-menu-divider" />
              <div
                v-else
                class="context-menu-item menu-item"
                :class="{
                  'context-menu-item--danger': item.danger,
                  'context-menu-item--disabled': item.disabled,
                }"
                @click="handleClick(item)"
              >
                <SvgIcon v-if="item.icon" :src="item.icon" size="15" />
                <span>{{ item.label }}</span>
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
  import bookmarkStore from '@/store/bookmark';
  import { computed, ref, onMounted, onUnmounted } from 'vue';
  import { getRootZoom } from '@/utils/zoom';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  const bookmark = bookmarkStore();
  const showMenu = ref(false);
  const props = defineProps({
    // 接收传递进来的菜单项
    menu: {
      type: Array,
      default: () => [],
    },
  });
  // 兼容历史字符串菜单，同时允许新页面使用稳定 key、图标、分隔线和危险态。
  const normalizedMenu = computed(() =>
    props.menu.map((item) => {
      if (typeof item === 'string') return { key: item, label: item };
      if (item?.divider) return { divider: true, key: item.key };
      return {
        ...item,
        key: item?.key || item?.label,
        label: item?.label || '',
      };
    }),
  );
  // 声明一个事件，选中菜单项的时候返回数据
  const emit = defineEmits(['select']);

  function handleClick(item) {
    if (item.disabled) return;
    showMenu.value = false;
    emit('select', item.key);
  }
  function handleClose() {
    showMenu.value = false;
  }

  function handleBeforeEnter(el) {
    el.style.height = 0;
  }

  function handleEnter(el) {
    const h = el.clientHeight;
    el.style.height = h + 'px';
    requestAnimationFrame(() => {
      el.style.transition = '.2s';
    });
  }

  function clickListener() {
    showMenu.value = false;
  }
  function wheelChange(event) {
    if (event.target?.className !== 'context-menu-item menu-item') {
      showMenu.value = false;
    }
  }

  const containerRef = ref();
  const mouseX = ref(0);
  const mouseY = ref(0);
  onMounted(() => {
    containerRef.value.addEventListener('contextmenu', (e) => {
      if (!bookmark.isDesktop) {
        return;
      }
      // Prevent nested context-menu wrappers from all opening at once.
      e.stopPropagation();
      e.preventDefault(); // 阻止浏览器的默认行为
      // 界面缩放(html zoom)下 e.x/e.y 是视觉坐标,写进 zoom 子树的 fixed 会二次缩放 → ÷ zoom 换布局坐标
      const zoom = getRootZoom();
      mouseX.value = e.x / zoom;
      mouseY.value = e.y / zoom + 5;
      showMenu.value = true;
      window.addEventListener('click', clickListener, true);
      window.addEventListener('contextmenu', handleClose, true);
      window.addEventListener('wheel', wheelChange, true);
    });
  });
  onUnmounted(() => {
    window.removeEventListener('click', clickListener, true);
    window.removeEventListener('contextmenu', handleClose, true);
    window.removeEventListener('wheel', wheelChange, true);
  });
</script>
<style lang="less">
  .right-menu-anchor {
    width: 100%;
  }

  @media (max-width: 767px) {
    .right-menu-anchor {
      min-width: 0;
      max-width: 100%;
    }
  }

  .context-menu-wrapper {
    position: fixed;
    z-index: 500;
  }

  .context-menu {
    width: 188px;
    padding: 4px 0;
    border-radius: 10px;
    background: var(--menu-body-bg-color);
    border: 1px solid var(--card-border-color);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    overflow: hidden;
    color: var(--text-color);
  }

  [data-theme='night'] .context-menu {
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
  }

  .context-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 28px;
    font-size: 13px;
    line-height: 1.2;
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      color 0.16s ease;
  }

  .context-menu-item:hover {
    background: var(--menu-item-h-bg-color);
  }

  .context-menu-item--danger {
    color: var(--danger-color, #f04455);
  }

  .context-menu-item--danger:hover {
    background: color-mix(in srgb, var(--danger-color, #f04455) 9%, var(--menu-body-bg-color));
  }

  .context-menu-item--disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }

  .context-menu-divider {
    height: 1px;
    margin: 4px 8px;
    background: var(--card-border-color);
  }

  /*Transition样式设置*/
  .v-enter-active,
  .v-leave-active {
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }
  .v-enter-from,
  .v-leave-to {
    opacity: 0;
    transform: translateY(-2px) scale(0.99);
  }

  @media (prefers-reduced-motion: reduce) {
    .v-enter-active,
    .v-leave-active {
      transition: none;
    }
  }
</style>
