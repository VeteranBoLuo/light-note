<template>
  <svg-icon v-if="!src" :src="icon.nullImg" :size="size" :color="color" />
  <div
    v-else-if="iconType === 'base64'"
    :class="getBase64Class(src)"
    :style="{
      width: size + 'px',
      height: size + 'px',
      '--src': `url(${src})`,
      color: color,
    }"
  />
  <div
    v-else-if="iconType === 'svg'"
    :class="getBase64Class(SvgToBase64Src())"
    :style="{
      width: size + 'px',
      height: size + 'px',
      '--src': `url(${SvgToBase64Src()})`,
      color: color,
    }"
  />
  <span
    v-else-if="iconType === 'css'"
    :style="[extractContentWithinBraces(src), { fontSize: size + 'px', color: color }]"
  ></span>
  <img :id="imgId" :src="src" v-else :width="size" :height="size" alt="" />
</template>

<script setup lang="ts">
  /**
   * 支持的图片类型有 base64、svg、iconify图片组件、css、img
   * 当图片的fill、stroke为固定颜色时，component类型不受影响外，其他类型均无法修改颜色,
   * 当图片类型是base64时，可修改颜色时采用的是mask-image方案，不可修改颜色时则是background-image方案
   * */
  import { computed, PropType } from 'vue';
  import icon from '@/config/icon.ts';

  const props = defineProps({
    src: {
      type: String as PropType<string>,
      required: true,
    },
    color: {
      type: String as PropType<string>,
      default: '',
    },
    size: {
      type: [String, Number] as PropType<string | number>,
      default: '16',
    },
    imgId: {
      type: String,
      default: () => Math.floor(Math.random() * 9000000).toString(),
    },
  });
  // 判断图片类型
  const iconType = computed(() => {
    if (props.src?.includes('data:image/svg+xml;base64,')) {
      return 'base64';
    } else if (isCss(props.src)) {
      // css图片
      return 'css';
    } else if (props.src?.includes('<svg')) {
      // svg图片
      return 'svg';
    }
    // 地址图片等
    return 'none';
  });

  // 获取base64图片的class
  function getBase64Class(src) {
    const base64Svg = src.split(',')[1];
    // 解码Base64字符串
    const svgString = atob(base64Svg);
    if (svgString.includes('currentColor')) {
      // 可修改颜色的base64
      return 'icon-base64';
    } else {
      // 不可修改颜色的base64
      return 'icon-fixed-base64';
    }
  }

  // 判断是否是css图片
  function isCss(str) {
    return str?.startsWith('.') && str?.endsWith('}');
  }

  // 获取css图片的样式
  function extractContentWithinBraces(str) {
    const regex = /\{([^}]+)\}/;
    const matches = str.match(regex);
    return matches ? matches[1] : null;
  }

  // 将svg转换为base64
  function SvgToBase64Src() {
    const encodedSvg = window.btoa(props.src);
    // 创建数据 URI
    return `data:image/svg+xml;base64,${encodedSvg}`;
  }

  // 获取iconify组件的图标名称
  function extractIconValue(str: string) {
    if (!str) {
      return 'mdi:home-outline';
    }
    const regex = /icon="([^"]+)"/;
    const match = str.match(regex);
    return match ? match[1] : str;
  }
</script>
<style lang="less" scoped>
  .icon-base64 {
    overflow: hidden;
    border: none;
    outline: none;
    display: inline-block;
    -webkit-mask-image: var(--src);
    mask-image: var(--src);
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-size: 100% 100%;
    mask-size: 100% 100%;
    background-color: currentColor;
    -webkit-mask-position: center;
    mask-position: center;
  }
  .icon-fixed-base64 {
    overflow: hidden;
    border: none;
    outline: none;
    display: inline-block;
    background-image: var(--src);
    background-repeat: no-repeat;
    background-size: 100% 100%;
    /* 设置一个透明的背景色 */
    background-color: transparent;
    -webkit-mask-position: center;
    mask-position: center;
  }
</style>
