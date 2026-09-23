<template>
  <div class="flex-center icon-hover" v-if="hover">
    <OriginalIcon :src="src || icon.nullImg" :color="color" :size="effectiveSize" :img-id="imgId" />
  </div>
  <OriginalIcon v-else :src="src || icon.nullImg" :color="color" :size="effectiveSize" :img-id="imgId" />
</template>

<script lang="ts" setup>
  import { computed, PropType } from 'vue';
  import { useUiDensity } from '@/composables/useUiDensity';
  import icon from '@/config/icon';
  import OriginalIcon from './OriginalIcon.vue';

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
    densityAware: {
      type: Boolean,
      default: true,
    },
    hover: {
      type: Boolean,
      default: false,
    },
  });
  const { dimension } = useUiDensity();
  const effectiveSize = computed(() => {
    const size = Number(props.size);
    return props.densityAware && Number.isFinite(size) ? dimension(size, 'icon') : props.size;
  });
</script>

<style lang="less" scoped>
  @media (min-width: 600px) {
    .icon-hover {
      padding: var(--ui-space-6, 6px);
      cursor: pointer;
      box-sizing: border-box;
      &:hover {
        background-color: var(--menu-item-h-bg-color);
        border-radius: 8px;
      }
    }
  }
</style>
