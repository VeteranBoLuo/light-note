<template>
  <div
    class="checkbox_container"
    @click="checkClick"
    :style="{
      backgroundColor: isCheck ? 'var(--primary-color)' : '',
      borderRadius: type === 'circle' ? '8px' : 'unset',
    }"
  >
    <svg v-show="isCheck" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
      <g fill="none" fill-rule="evenodd">
        <path
          d="m12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.018-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"
        />
        <path
          fill="#fff"
          d="M21.546 5.111a1.5 1.5 0 0 1 0 2.121L10.303 18.475a1.6 1.6 0 0 1-2.263 0L2.454 12.89a1.5 1.5 0 1 1 2.121-2.121l4.596 4.596L19.424 5.111a1.5 1.5 0 0 1 2.122 0"
        />
      </g>
    </svg>
  </div>
</template>

<script lang="ts" setup>
  const isCheck = defineModel('isCheck');

  const props = withDefaults(defineProps<{ type?: 'normal' | 'circle' }>(), {
    type: 'normal',
  });
  const emit = defineEmits(['change']);
  function checkClick() {
    isCheck.value = !isCheck.value;
    emit('change', isCheck.value);
  }
</script>

<style lang="less">
  .checkbox_container {
    height: 12px;
    width: 12px;
    border: 1px solid #ccc;
    border-radius: 8px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }
</style>
