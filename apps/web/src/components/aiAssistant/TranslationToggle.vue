<template>
  <div class="translation-toggle">
    <BButton
      v-if="!enableTranslation"
      size="small"
      class="toggle-btn"
      :title="t('ai.translation.translate')"
      @click="enableTranslationMode"
      v-click-log="{ module: 'AI助手', operation: '开启翻译' }"
    >
      <svg-icon size="14" :src="icon.ai.internet" />
      {{ t('ai.translation.translate') }}
    </BButton>
    <BPopover
      v-else
      v-model:open="configOpen"
      trigger="click"
      placement="top-right"
      overlay-class-name="translation-config-popover"
    >
      <BButton size="small" type="primary" class="toggle-btn toggle-btn--enabled" :title="translationSummary">
        <svg-icon size="14" :src="icon.ai.internet" />
        <span>{{ t('ai.translation.translate') }}</span>
        <span class="translation-summary">{{ translationSummary }}</span>
      </BButton>
      <template #content>
        <div class="translation-config-panel">
          <div class="translation-config-panel__header">
            <strong>{{ t('ai.translation.settings') }}</strong>
            <BButton size="small" class="translation-disable-btn" @click="disableTranslationMode">
              {{ t('ai.translation.turnOff') }}
            </BButton>
          </div>
          <div class="translation-field">
            <span>{{ t('ai.translation.sourceLanguage') }}</span>
            <BSelect
              v-model:value="sourceLang"
              class="language-select"
              :options="sourceLanguages"
              @change="updateConfig('source')"
            />
          </div>
          <div class="translation-field">
            <span>{{ t('ai.translation.targetLanguage') }}</span>
            <BSelect
              v-model:value="targetLang"
              class="language-select"
              :options="targetLanguages"
              @change="updateConfig('target')"
            />
          </div>
        </div>
      </template>
    </BPopover>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
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
  const configOpen = ref(false);
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
  const sourceLabel = computed(
    () => sourceLanguages.value.find((language) => language.value === sourceLang.value)?.label || '',
  );
  const targetLabel = computed(
    () => targetLanguages.value.find((language) => language.value === targetLang.value)?.label || '',
  );
  const translationSummary = computed(() => `${sourceLabel.value} → ${targetLabel.value}`);

  function enableTranslationMode() {
    emit('update:enableTranslation', true);
  }

  function disableTranslationMode() {
    configOpen.value = false;
    sourceLang.value = 'auto';
    targetLang.value = 'zh';
    emit('update:enableTranslation', false);
    emitConfig();
    recordOperation({ module: 'AI助手', operation: '关闭翻译' });
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
  .translation-toggle {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .toggle-btn {
    min-height: 28px;
    gap: 0.25rem;
    color: var(--text-color);
  }

  .toggle-btn--enabled {
    max-width: 190px;
    color: #fff;
    background: var(--primary-color);
  }

  .translation-summary {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 768px) {
    .toggle-btn--enabled {
      max-width: min(190px, calc(100vw - 150px));
    }
  }
</style>

<style lang="less">
  .translation-config-popover {
    width: min(300px, calc(100vw - 24px));
    max-width: calc(100vw - 24px);
  }

  .translation-config-panel {
    padding: 12px;
    box-sizing: border-box;
  }

  .translation-config-panel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;

    strong {
      min-width: 0;
      color: var(--text-color);
      font-size: 13px;
    }
  }

  .translation-disable-btn {
    flex: 0 0 auto;
    color: var(--desc-color) !important;
  }

  .translation-field {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    align-items: center;
    gap: 10px;

    & + & {
      margin-top: 10px;
    }

    > span {
      color: var(--desc-color);
      font-size: 12px;
    }
  }

  .translation-config-panel .language-select {
    width: 100%;
    min-width: 0;
    font-size: 12px;
  }

  .translation-config-panel .language-select .select-trigger {
    min-height: 30px;
  }
</style>
