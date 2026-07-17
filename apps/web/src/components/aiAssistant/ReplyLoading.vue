<template>
  <BLoading inline :loading="true" :title="label || t('ai.toolProgress.understanding')" />
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';

  defineProps<{
    label?: string;
  }>();

  const { t } = useI18n();
</script>
