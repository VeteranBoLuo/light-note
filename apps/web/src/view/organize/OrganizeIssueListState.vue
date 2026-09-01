<template>
  <BLoading :loading="loading" :title="t('organize.loading')" class="organize-list-state">
    <div v-if="error && empty" class="organize-state organize-state--error" role="alert">
      <strong>{{ t('organize.loadFailedTitle') }}</strong>
      <span>{{ t('organize.loadFailedDescription') }}</span>
      <BButton size="small" type="primary" @click="emit('retry')">{{ t('organize.retry') }}</BButton>
    </div>
    <div v-else-if="empty && !loading" class="organize-state organize-state--empty">
      <span class="organize-state__mark" aria-hidden="true">
        <SvgIcon :src="icon.message.success" size="25" />
      </span>
      <strong>{{ emptyTitle }}</strong>
      <span>{{ emptyDescription }}</span>
    </div>
    <div v-else class="organize-list-state__content">
      <div v-if="error" class="organize-inline-warning is-error" role="status">
        {{ t('organize.partialListError') }}
      </div>
      <slot />
    </div>
  </BLoading>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';

  withDefaults(
    defineProps<{
      loading?: boolean;
      error?: boolean;
      empty?: boolean;
      emptyTitle?: string;
      emptyDescription?: string;
    }>(),
    {
      loading: false,
      error: false,
      empty: false,
      emptyTitle: '',
      emptyDescription: '',
    },
  );

  const emit = defineEmits<{ retry: [] }>();
  const { t } = useI18n();
</script>

<style scoped lang="less">
  .organize-list-state {
    min-height: 240px;
    flex: 1 1 auto;
  }

  .organize-list-state__content {
    min-height: 100%;
  }

  .organize-state {
    min-height: 230px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    box-sizing: border-box;
    color: var(--desc-color);
    text-align: center;
  }

  .organize-state strong {
    color: var(--text-color);
    font-size: 16px;
  }

  .organize-state__mark {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border: 2px solid var(--success-color, #00a884);
    border-radius: 50%;
    color: var(--success-color, #00a884);
    font-size: 21px;
    font-weight: 800;
  }

  .organize-state--error {
    border: 1px solid var(--danger-color, #dc3f4f);
    border-radius: 14px;
    background: var(--card-background);
  }

  .organize-inline-warning {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    padding: 9px 11px;
    border: 1px solid var(--danger-color, #dc3f4f);
    border-radius: 10px;
    color: var(--danger-color, #dc3f4f);
    background: var(--card-background);
    font-size: 12px;
    line-height: 1.45;
  }
</style>
