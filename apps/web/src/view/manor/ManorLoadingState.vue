<template>
  <section class="manor-loading">
    <BLoading inline loading :title="title">
      <template #indicator>
        <span class="manor-loading__crest"><SvgIcon :src="icon.manor.entry" :size="64" /></span>
      </template>
      <template #title>
        <span class="manor-loading__title">{{ title }}</span>
        <BProgress class="manor-loading__progress" :percent="percent" :aria-label="t('manor.loading')" stroke-color="linear-gradient(90deg, #7cc062, #4f9a46)" trail-color="rgba(255,255,255,.54)" />
        <span class="manor-loading__detail">{{ percent }}% · {{ detail }}</span>
      </template>
    </BLoading>
  </section>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import { computed } from 'vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BProgress from '@/components/base/BasicComponents/BProgress.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import './manorLoading.css';

  const { t } = useI18n();
  const props = withDefaults(defineProps<{ progress?: number }>(), { progress: 0 });
  const percent = computed(() => Number.isFinite(props.progress) ? Math.min(100, Math.max(0, Math.round(props.progress))) : 0);
  const title = computed(() => t(percent.value === 100 ? 'manor.loadingReady' : 'manor.loading'));
  const detail = computed(() => t(percent.value === 100 ? 'manor.loadingWelcome' : percent.value < 70 ? 'manor.loadingHint' : 'manor.loadingFinishing'));
</script>
