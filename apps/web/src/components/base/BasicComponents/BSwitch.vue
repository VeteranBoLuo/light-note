<template>
  <label
    class="b-switch"
    :class="{ 'is-checked': displayedChecked, 'is-disabled': disabled }"
    role="switch"
    :tabindex="disabled ? -1 : 0"
    :aria-checked="displayedChecked"
    :aria-disabled="disabled || undefined"
    @click="toggle"
    @keydown.enter.prevent="toggle"
    @keydown.space.prevent="toggle"
  >
    <span class="b-switch__track">
      <span class="b-switch__thumb" />
    </span>
  </label>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';

  const props = withDefaults(
    defineProps<{
      checked?: boolean;
      /** Defer visual changes to the parent, for confirmed or queued writes. */
      controlled?: boolean;
      disabled?: boolean;
    }>(),
    {
      checked: false,
      controlled: false,
      disabled: false,
    },
  );

  const emit = defineEmits<{
    'update:checked': [value: boolean];
    change: [value: boolean];
  }>();

  const localChecked = ref(props.checked);
  const displayedChecked = computed(() => (props.controlled ? props.checked : localChecked.value));

  watch(
    () => props.checked,
    (val) => {
      localChecked.value = val;
    },
    { immediate: true },
  );

  function toggle() {
    if (props.disabled) return;
    const newVal = !displayedChecked.value;
    if (!props.controlled) localChecked.value = newVal;
    emit('update:checked', newVal);
    emit('change', newVal);
  }
</script>

<style scoped>
  .b-switch {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    vertical-align: middle;
  }

  .b-switch.is-disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .b-switch__track {
    position: relative;
    width: var(--ui-layout-40, 40px);
    height: var(--ui-layout-22, 22px);
    border-radius: 11px;
    background: var(--card-border-color, #6e6e77);
    transition: background 0.25s ease;
    flex-shrink: 0;
  }

  .b-switch__thumb {
    position: absolute;
    top: 3px;
    left: 3px;
    /* ui-density-fixed: 滑块左右各保留固定 3px 留白，与 left: 3px 及轨道端点一致。 */
    width: calc(var(--ui-layout-22, 22px) - 6px);
    /* ui-density-fixed: 滑块上下各保留固定 3px 留白，与 top: 3px 一致。 */
    height: calc(var(--ui-layout-22, 22px) - 6px);
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    transition: transform 0.25s ease;
  }

  .b-switch.is-checked .b-switch__track {
    background: var(--primary-color, #615ced);
  }

  .b-switch.is-checked .b-switch__thumb {
    transform: translateX(calc(var(--ui-layout-40, 40px) - var(--ui-layout-22, 22px)));
  }

  .b-switch:hover .b-switch__track {
    opacity: 0.85;
  }
</style>
