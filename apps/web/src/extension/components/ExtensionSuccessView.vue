<template>
  <section class="ln-extension-view ln-extension-centered ln-extension-success">
    <span class="ln-extension-success__icon">
      <SvgIcon :src="icon.message.success" size="38" aria-hidden="true" />
    </span>
    <span class="ln-extension-success__eyebrow">{{ t('browserExtension.success.eyebrow') }}</span>
    <h1>{{ result.title }}</h1>
    <p>{{ description }}</p>
    <div class="ln-extension-success__actions">
      <BButton type="primary" block @click="emit('continue')">{{ t('browserExtension.success.continue') }}</BButton>
      <BButton block @click="openResource">{{ t('browserExtension.success.open') }}</BButton>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
  import { extensionResourceUrl } from '../success';
  import type { ExtensionSuccess } from '../types';

  const props = defineProps<{ result: ExtensionSuccess }>();
  const emit = defineEmits<{ continue: [] }>();
  const { t } = useI18n();
  const description = computed(() => {
    if (props.result.count && props.result.count > 1) {
      return t('browserExtension.success.filesDescription', { count: props.result.count });
    }
    if (props.result.duplicate) return t('browserExtension.success.duplicateDescription');
    return t(`browserExtension.success.${props.result.type}Description`);
  });

  function openResource() {
    window.open(extensionResourceUrl(props.result), '_blank', 'noopener,noreferrer');
  }
</script>
