<template>
  <div ref="containerRef" style="width: 100%">
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
            <!-- 循环遍历菜单项，显示出来 -->
            <div @click="handleClick(label)" class="context-menu-item menu-item" v-for="label in menu" :key="label">
              {{ label }}
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
  import bookmarkStore from '@/store/bookmark';
  import { ref, onMounted, onUnmounted } from 'vue';
  const bookmark = bookmarkStore();
  const showMenu = ref(false);
  const props = defineProps({
    // 接收传递进来的菜单项
    menu: {
      type: Array,
      default: () => [],
    },
  });
  // 声明一个事件，选中菜单项的时候返回数据
  const emit = defineEmits(['select']);

  function handleClick(e) {
    emit('select', e);
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
      e.preventDefault(); // 阻止浏览器的默认行为
      mouseX.value = e.x;
      mouseY.value = e.y + 5;
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
  .context-menu-wrapper {
    position: fixed;
    z-index: 9999;
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
