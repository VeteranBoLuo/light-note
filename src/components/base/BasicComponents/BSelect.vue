<template>
  <div class="select-container">
    <BInput
      v-model:value="value"
      placeholder="请选择"
      :class="{ isOpen: isOpen }"
      class="select-input"
      @click="clickSelect"
    />
    <div class="options-body" v-if="options.length > 0" v-show="isOpen" :class="{ in: isOpen }">
      <div
        class="select-option"
        :style="{ backgroundColor: value === item.value ? '#e8f5ff' : '' }"
        v-for="(item, index) in options"
        :key="index"
        @click="select(item)"
        >{{ item.label }}
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { BaseOptions } from '@/config/bookmarkCfg.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { ref } from 'vue';

  const props = withDefaults(defineProps<{ options: BaseOptions[] }>(), {
    options: () => [],
  });
  const value = defineModel('value');
  const isOpen = ref(false);

  function clickSelect() {
    isOpen.value = !isOpen.value;
  }

  function select(item) {
    value.value = item.value;
    isOpen.value = false;
  }
</script>

<style lang="less" scoped>
  .select-container {
    font-size: 13px;
    width: 100%;
    :deep(.select-input) {
      width: 100% !important;
      min-width: 100px !important;
      cursor: pointer;
      .b-input {
        pointer-events: none;
      }
      &:hover {
        .b-input {
          border: 1px solid #4096ff !important;
        }
      }
    }
  }

  .options-body {
    position: absolute;
    border-radius: 6px;
    z-index: 99999;
    width: 100%;
    box-sizing: border-box;
    padding: 2px;
    background-color: white;
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
    margin-top: 2px;
  }

  .select-option {
    width: 100%;
    height: 33px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding-left: 0.75rem;
    border-radius: 6px;
    color: black;
    cursor: pointer;

    &:hover {
      background-color: #f5f5f5;
    }
  }

  .isOpen {
    :deep(.b-input) {
      border: 1px solid #4096ff !important;
      box-shadow: 0 0 0 2px rgba(5, 145, 255, 0.1);
    }
  }

  .in {
    animation: in-animation 0.3s ease;
  }
  @keyframes in-animation {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
</style>
