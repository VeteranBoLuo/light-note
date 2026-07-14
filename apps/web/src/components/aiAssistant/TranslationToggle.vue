<template>
  <div class="translation-toggle">
    <BButton
      size="small"
      class="toggle-btn"
      :class="{ active: enableTranslation }"
      :title="t('ai.translation.translate')"
      @click="toggleTranslation"
      v-click-log="{ module: 'AI助手', operation: enableTranslation ? '关闭翻译' : '开启翻译' }"
    >
      <svg-icon size="14" :src="icon.ai.internet" />
      {{ t('ai.translation.translate') }}
    </BButton>
    <div v-if="enableTranslation" class="translation-options">
      <BSelect
        v-model:value="sourceLang"
        class="language-select"
        :options="sourceLanguages"
        @change="updateConfig('source')"
      />
      <span class="arrow" aria-hidden="true">→</span>
      <BSelect
        v-model:value="targetLang"
        class="language-select"
        :options="targetLanguages"
        @change="updateConfig('target')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import { recordOperation } from '@/api/commonApi.ts';

  const { t } = useI18n();
  const props = defineProps<{
    enableTranslation: boolean;
    translationConfig: { source: string; target: string };
  }>();
  const emit = defineEmits<{
    (e: 'update:enableTranslation', value: boolean): void;
    (e: 'update:translationConfig', value: { source: string; target: string }): void;
  }>();

  const sourceLang = ref(props.translationConfig.source);
  const targetLang = ref(props.translationConfig.target);
  const sourceLanguages = computed(() => [
    { value: 'auto', label: t('ai.translation.autoDetect') },
    { value: 'zh', label: t('ai.translation.chinese') },
    { value: 'en', label: t('ai.translation.english') },
    { value: 'ja', label: t('ai.translation.japanese') },
    { value: 'ko', label: t('ai.translation.korean') },
    { value: 'fr', label: t('ai.translation.french') },
    { value: 'de', label: t('ai.translation.german') },
    { value: 'es', label: t('ai.translation.spanish') },
  ]);
  const targetLanguages = computed(() => sourceLanguages.value.filter((language) => language.value !== 'auto'));

  function toggleTranslation() {
    const enabled = !props.enableTranslation;
    emit('update:enableTranslation', enabled);
    if (!enabled) {
      sourceLang.value = 'auto';
      targetLang.value = 'zh';
      emitConfig();
    }
  }

  function updateConfig(side: 'source' | 'target') {
    const label = sourceLanguages.value.find(
      (language) => language.value === (side === 'source' ? sourceLang.value : targetLang.value),
    )?.label;
    emitConfig();
    recordOperation({ module: 'AI助手', operation: `选择${side === 'source' ? '源' : '目标'}语言【${label || ''}】` });
  }

  function emitConfig() {
    emit('update:translationConfig', { source: sourceLang.value, target: targetLang.value });
  }

  watch(
    () => props.translationConfig,
    (config) => {
      sourceLang.value = config.source;
      targetLang.value = config.target;
    },
    { immediate: true, deep: true },
  );
</script>

<style scoped>
  .translation-toggle,
  .translation-options {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .toggle-btn {
    min-height: 28px;
    gap: 0.25rem;
    color: var(--text-color);
  }

  .toggle-btn.active {
    color: #fff;
    background: var(--primary-color);
  }

  .language-select {
    width: 108px;
    font-size: 0.75rem;
  }

  .language-select :deep(.select-trigger) {
    min-height: 28px;
  }

  .arrow {
    color: var(--desc-color);
    font-size: 0.75rem;
  }

  @media (max-width: 768px) {
    .translation-toggle {
      align-items: flex-start;
      flex-direction: column;
    }

    .language-select {
      width: min(120px, 36vw);
    }
  }
</style>
