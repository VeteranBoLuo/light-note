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
  import { ref, onMounted, onUnmounted } from 'vue';
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
    padding: 5px 0;
    background-color: var(--menu-body-bg-color);
    width: 150px;
    border-radius: 12px;
    box-shadow: 0 0 2px rgba(0, 0, 0, 0.6);
    overflow: hidden;
    .context-menu-item {
      padding-left: 10px;
      font-size: 12px;
      height: 26px;
      display: flex;
      align-items: center;
      cursor: pointer;
    }
  }
  /*Transition样式设置*/
  .v-enter-active,
  .v-leave-active {
    transition: opacity 0.5s ease;
  }
  .v-enter-from,
  .v-leave-to {
    opacity: 0;
  }
</style>
