<template>
  <div
    class="toolbox-feedback"
    :class="[`is-${state}`, { 'is-compact': compact }]"
    :role="state === 'loading' ? undefined : state === 'error' ? 'alert' : 'status'"
  >
    <BLoading v-if="state === 'loading'" inline loading :title="title" />
    <template v-else>
      <SvgIcon
        v-if="state === 'error'"
        class="toolbox-feedback__icon"
        :src="icon.message.error"
        size="18"
        aria-hidden="true"
      />
      <div class="toolbox-feedback__copy"
        ><strong v-if="title">{{ title }}</strong
        ><slot
      /></div>
      <div v-if="$slots.actions" class="toolbox-feedback__actions"><slot name="actions" /></div>
    </template>
  </div>
</template>
<script setup lang="ts">
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  withDefaults(defineProps<{ state?: 'empty' | 'loading' | 'error'; title?: string; compact?: boolean }>(), {
    state: 'empty',
    title: '',
    compact: false,
  });
</script>
<style scoped>
  .toolbox-feedback {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
    min-width: 0;
    padding: var(--ui-space-24, 24px) var(--ui-space-16, 16px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
    text-align: center;
  }
  .toolbox-feedback.is-compact {
    padding: var(--ui-space-12, 12px) 0;
  }
  .toolbox-feedback.is-error {
    justify-content: flex-start;
    align-items: flex-start;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-8, 8px) 0;
    color: var(--danger-color);
    text-align: left;
  }
  .toolbox-feedback__icon {
    flex: none;
    margin-top: var(--ui-space-2, 2px);
  }
  .toolbox-feedback__copy {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .is-error .toolbox-feedback__copy {
    flex: 1;
  }
  .toolbox-feedback__copy strong {
    display: block;
    color: var(--text-color);
  }
  .toolbox-feedback__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    max-width: 100%;
  }
</style>
