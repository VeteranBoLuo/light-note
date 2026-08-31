<template>
  <BButton
    class="note-parent-link"
    :title="pathText"
    :aria-label="`${$t('note.parentPage')}：${pathText}`"
    @click.stop="emit('activate')"
  >
    <span class="note-parent-link__icon-shell" aria-hidden="true">
      <SvgIcon :src="icon.resource.note" size="12" />
    </span>
    <span class="note-parent-link__label">{{ $t('note.parentPage') }}</span>
    <span class="note-parent-link__separator" aria-hidden="true">›</span>
    <span class="note-parent-link__text">{{ pathText }}</span>
  </BButton>
</template>

<script lang="ts" setup>
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  defineProps<{ pathText: string }>();
  const emit = defineEmits<{ activate: [] }>();
</script>

<style lang="less" scoped>
  .note-parent-link {
    // 父级入口是层级导航，不复用格式徽章的中性胶囊表面。
    --primary-color: var(--resource-note-color, #00a884);
    --primary-btn-bg-color: transparent;
    --primary-btn-h-bg-color: color-mix(in srgb, var(--resource-note-color, #00a884) 8%, transparent);

    min-width: 0;
    width: fit-content;
    max-width: 100%;
    height: 24px;
    padding: 0 5px 0 2px;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 5px;
    overflow: hidden;
    border: 0;
    border-radius: 7px;
    color: var(--desc-color);
    background: transparent;
    font-size: 12px;
    line-height: 22px;
    text-align: left;
    white-space: nowrap;

    &:focus-visible {
      outline-color: var(--resource-note-color, #00a884);

      .note-parent-link__text {
        color: var(--text-color);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
    }

    &__icon-shell {
      width: 18px;
      height: 18px;
      flex: 0 0 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 5px;
      color: var(--resource-note-color, #00a884);
      background: color-mix(in srgb, var(--resource-note-color, #00a884) 12%, var(--card-background));
    }

    &__label {
      flex: 0 0 auto;
      color: var(--resource-note-color, #00a884);
      font-weight: 600;
    }

    &__separator {
      flex: 0 0 auto;
      color: var(--resource-note-color, #00a884);
      font-size: 15px;
      line-height: 1;
      opacity: 0.62;
    }

    &__text {
      min-width: 0;
      overflow: hidden;
      color: var(--desc-color);
      text-overflow: ellipsis;
      transition: color 0.16s ease;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .note-parent-link:hover {
      .note-parent-link__text {
        color: var(--text-color);
        text-decoration: underline;
        text-underline-offset: 2px;
      }
    }
  }
</style>
