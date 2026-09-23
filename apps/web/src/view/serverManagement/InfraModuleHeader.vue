<template>
  <header class="infra-module-header">
    <div class="infra-module-header__main">
      <span class="infra-module-header__icon"><SvgIcon :src="iconSrc" size="22" aria-hidden="true" /></span>
      <div>
        <h1>{{ title }}</h1>
        <p>{{ subtitle }}</p>
      </div>
    </div>
    <div class="infra-module-header__actions">
      <span v-if="cadence" class="infra-module-header__cadence">{{ cadence }}</span>
      <BButton :loading="loading" :aria-label="refreshLabel" @click="$emit('refresh')">
        <SvgIcon v-if="!loading" :src="icon.infrastructure.refresh" size="16" aria-hidden="true" />
        {{ refreshLabel }}
      </BButton>
    </div>
  </header>
</template>

<script setup lang="ts">
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  defineProps<{
    title: string;
    subtitle: string;
    iconSrc: string;
    cadence?: string;
    loading?: boolean;
    refreshLabel: string;
  }>();
  defineEmits<{ refresh: [] }>();
</script>

<style scoped lang="less">
  .infra-module-header {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-18, 18px);
  }
  .infra-module-header__main,
  .infra-module-header__actions {
    display: flex;
    align-items: center;
  }
  .infra-module-header__main {
    min-width: 0;
    gap: var(--ui-space-12, 12px);
  }
  .infra-module-header__icon {
    width: var(--ui-layout-44, 44px);
    height: var(--ui-layout-44, 44px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    color: var(--primary-color);
    background: var(--card-background);
  }
  h1,
  p {
    margin: 0;
  }
  h1 {
    font-size: var(--ui-font-22, 22px);
    line-height: 1.35;
  }
  p,
  .infra-module-header__cadence {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  p {
    margin-top: var(--ui-space-4, 4px);
    line-height: 1.45;
  }
  .infra-module-header__actions {
    flex: 0 0 auto;
    gap: var(--ui-space-10, 10px);
  }
  .infra-module-header__cadence {
    padding: var(--ui-space-5, 5px) var(--ui-space-8, 8px);
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    background: var(--card-background);
  }
  @media (max-width: 760px) {
    .infra-module-header {
      align-items: flex-start;
    }
    .infra-module-header__cadence {
      display: none;
    }
    .infra-module-header__actions :deep(button) {
      font-size: 0;
    }
  }
</style>
