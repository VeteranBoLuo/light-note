<template>
  <div class="flex-center icon-hover" v-if="hover">
    <OriginalIcon :src="src" :color="color" :size="size" :img-id="imgId" />
  </div>
  <OriginalIcon v-else :src="src" :color="color" :size="size" :img-id="imgId" />
</template>

<script lang="ts" setup>
  import { PropType } from 'vue';

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
    hover: {
      type: Boolean,
      default: false,
    },
  });
</script>

<style lang="less" scoped>
  @media (min-width: 600px) {
    .icon-hover {
      padding: 6px;
      cursor: pointer;
      box-sizing: border-box;
      &:hover {
        background-color: var(--menu-item-h-bg-color);
        border-radius: 8px;
      }
    }
  }
</style>
