<template>
  <BCard as="section" class="settings-section-card" variant="card" padding="18px 22px 4px" radius="14px">
    <header v-if="title || $slots.title" class="settings-section-card__head">
      <div
        ><h2
          ><slot name="title">{{ title }}</slot></h2
        ><p v-if="description">{{ description }}</p></div
      >
      <slot name="extra" />
    </header>
    <slot />
  </BCard>
</template>
<script setup lang="ts">
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  defineProps<{ title?: string; description?: string }>();
</script>
<style scoped lang="less">
  .settings-section-card {
    min-width: 0;
    --b-card-shadow: none;
  }
  .settings-section-card__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--surface-divider-color, var(--border-color));
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-color);
  }
  p {
    margin: 5px 0 0;
    font-size: 12px;
    line-height: 1.7;
    color: var(--desc-color);
  }
  :global(.settings-page .is-mobile-sub .settings-section-card) {
    --b-card-padding: 16px 16px 3px;
    --b-card-radius: 12px;
  }
</style>
