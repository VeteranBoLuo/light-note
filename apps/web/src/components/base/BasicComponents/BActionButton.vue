<template>
  <!--
    click 必须 .stop：这个按钮总是放在表格行、卡片这类本身可点击的容器里，
    「执行这个操作」绝不该顺带触发容器的点击（用户管理里点编辑/删除会连带弹出
    用户详情，就是这条漏了 —— 旁边的 keydown 一直是 .prevent.stop）。
    父组件写 @click.stop 挡不住：那是自定义事件，修饰符对它无效。
  -->
  <span
    class="b-action-button"
    :class="[`b-action-button--${action}`, { 'b-action-button--with-label': label }]"
    role="button"
    tabindex="0"
    :aria-label="tooltip"
    @click.stop="emit('click')"
    @keydown.enter.prevent.stop="emit('click')"
    @keydown.space.prevent.stop="emit('click')"
  >
    <SvgIcon :src="action === 'edit' ? icon.table_edit : icon.table_delete" size="17" />
    <span v-if="label" class="b-action-button__label">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  withDefaults(
    defineProps<{
      action: 'edit' | 'delete';
      tooltip: string;
      label?: string;
    }>(),
    { label: '' },
  );

  const emit = defineEmits<{ click: [] }>();
</script>

<style scoped lang="less">
  .b-action-button {
    --action-color: var(--primary-color);
    display: inline-flex;
    width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--action-color);
    background: transparent;
    cursor: pointer;
    user-select: none;
    transition:
      color 0.16s ease,
      background 0.16s ease,
      border-color 0.16s ease,
      box-shadow 0.16s ease,
      transform 0.16s ease;

    &:hover,
    &:focus-visible {
      color: var(--action-color);
      background: color-mix(in srgb, var(--action-color) 10%, var(--background-color));
      border-color: color-mix(in srgb, var(--action-color) 24%, transparent);
      box-shadow: 0 4px 10px color-mix(in srgb, var(--action-color) 12%, transparent);
      transform: translateY(-1px);
      outline: none;
    }

    &:active {
      transform: translateY(0) scale(0.95);
    }
  }

  .b-action-button--delete {
    --action-color: var(--danger-color, #f0445e);
  }

  .b-action-button--with-label {
    width: auto;
    min-width: 30px;
    padding: 0 9px;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
  }

  .b-action-button__label {
    line-height: 1;
  }
</style>
