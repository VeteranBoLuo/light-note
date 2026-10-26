<template>
  <section class="manor-loading">
    <BLoading inline loading :title="t('manor.loading')">
      <template #indicator>
        <span class="manor-loading__crest"><SvgIcon :src="icon.manor.entry" :size="64" /></span>
      </template>
    </BLoading>
  </section>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import './manorLoading.css';

  const { t } = useI18n();
</script>
