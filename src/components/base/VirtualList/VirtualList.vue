<template>
  <div ref="listContainerRef" class="listContainerClass" @scroll="listContainerScroll">
    <div ref="listRef" :style="listStyle">
      <div v-for="(item, index) in showList" :key="index" class="itemClass">
        <slot name="item" :item="item">
          {{ item }}
        </slot>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue';

  const props = withDefaults(
    defineProps<{
      dataList: any;
      containHeight: number;
      itemHeight: number;
    }>(),
    {
      dataList: [],
      containHeight: 800,
      itemHeight: 40,
    },
  );

  const listContainerRef = ref<HTMLElement>(); // 容器引用
  const listRef = ref<HTMLElement>(); // 列表引用

  let startIndex = ref<number>(0); // 开始下标

  const containHeightPx = computed<string>(() => {
    //容器高度,用于样式
    return props.containHeight + 'px';
  });

  const itemHeightPx = computed<string>(() => {
    //列表项高度,用于样式
    return props.itemHeight + 'px';
  });

  // 可视区域数量
  const showNum = computed(() => {
    return ~~(props.containHeight / props.itemHeight); // ~~转换成数字类型，有向下取整的妙用
  });

  // 结束下标 = 开始下标 + 可视区域数量
  const endIndex = computed(() => {
    return startIndex.value + showNum.value;
  });

  // 展示的列表
  const showList = computed(() => {
    return props.dataList.slice(startIndex.value, endIndex.value);
  });

  // 列表的padding
  const listStyle = computed(() => {
    return {
      paddingTop: startIndex.value * props.itemHeight + 'px',
      paddingBottom: (props.dataList.length - endIndex.value) * props.itemHeight + 'px',
    };
  });

  // 监听滚动条的变化
  const listContainerScroll = () => {
    // 获取滚动条卷入的高度
    let scrollTop = listContainerRef.value!.scrollTop;

    // 更新开始下标
    startIndex.value = Math.floor(scrollTop / props.itemHeight);
  };
</script>

<style lang="less" scoped>
  .listContainerClass {
    height: v-bind(containHeightPx);
    overflow: auto;
    border: 1px solid black;
    .itemClass {
      height: v-bind(itemHeightPx);
    }
  }
</style>
