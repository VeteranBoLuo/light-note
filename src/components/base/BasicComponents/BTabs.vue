<template>
  <div class="flex-align-center-gap tab-container">
    <div style="font-size: 14px" class="dom-hover tab" v-for="tab in options" :key="tab" @click="tabChange(tab)">
      {{ tab }}
    </div>
    <div class="underline"></div>
  </div>
</template>

<script lang="ts" setup>
  import { nextTick, watch } from 'vue';

  const emit = defineEmits(['change']);
  const props = withDefaults(defineProps<{ options: string[] }>(), {
    options: () => [],
  });

  const activeTab = defineModel('activeTab');
  function tabChange(tab) {
    activeTab.value = tab;
    const tabs = document.querySelectorAll('.tab');
    const underline: HTMLElement = document.querySelector('.underline');
    const index = props.options.indexOf(tab);
    // 根据选中的tab更新下划线的位置和宽度
    const tabWidth = tabs[index].offsetWidth;
    const tabPosition = tabs[index].offsetLeft;
    underline.style.width = `${tabWidth}px`;
    underline.style.left = `${tabPosition}px`;
    emit('change', tab);
  }

  watch(
    () => activeTab.value,
    (val) => {
      if (val) {
        nextTick(() => {
          tabChange(val);
        });
      }
    },
    {
      immediate: true,
    },
  );
</script>

<style scoped lang="less">
  .tab-container {
    position: relative;
    border-bottom: 1px solid var(--phone-menu-item-border-color);
    padding-bottom: 5px;
    margin-bottom: 10px;
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
</style>
