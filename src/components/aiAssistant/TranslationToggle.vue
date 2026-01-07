<template>
  <div class="translation-toggle">
    <button class="toggle-btn" @click="toggleTranslation" :class="{ active: enableTranslation }" title="翻译">
      <svg-icon size="14" :src="icon.ai.internet" />
      翻译
    </button>
    <div v-if="enableTranslation" class="translation-options">
      <select v-model="sourceLang" @change="updateConfig" class="lang-select">
        <option v-for="lang in languages" :key="lang.value" :value="lang.value">
          {{ lang.label }}
        </option>
      </select>
      <span class="arrow">→</span>
      <select v-model="targetLang" @change="updateConfig" class="lang-select">
        <option v-for="lang in targetLanguages" :key="lang.value" :value="lang.value">
          {{ lang.label }}
        </option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, watch } from 'vue';
  import icon from '@/config/icon.ts';

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

  const languages = [
    { value: 'auto', label: '自动识别' },
    { value: 'zh', label: '中文' },
    { value: 'en', label: '英文' },
    { value: 'ja', label: '日文' },
    { value: 'ko', label: '韩文' },
    { value: 'fr', label: '法文' },
    { value: 'de', label: '德文' },
    { value: 'es', label: '西班牙文' },
  ];

  const targetLanguages = languages.filter((lang) => lang.value !== 'auto');

  const toggleTranslation = () => {
    const newValue = !props.enableTranslation;
    emit('update:enableTranslation', newValue);
    if (!newValue) {
      // 重置为默认
      sourceLang.value = 'auto';
      targetLang.value = 'en';
      updateConfig();
    }
  };

  const updateConfig = () => {
    emit('update:translationConfig', { source: sourceLang.value, target: targetLang.value });
  };

  watch(
    () => props.translationConfig,
    (newConfig) => {
      sourceLang.value = newConfig.source;
      targetLang.value = newConfig.target;
    },
    { immediate: true },
  );
</script>

<style scoped>
  .translation-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .toggle-btn {
    padding: 0.25rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--text-color);
    cursor: pointer;
    border-radius: 0.5rem;
    transition: all 0.2s;
    font-size: 0.75rem;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .toggle-btn:hover {
    background: rgba(0, 0, 0, 0.1);
  }

  .toggle-btn.active {
    background: var(--primary-color);
    color: white;
  }

  .toggle-btn.active:hover {
    background: #4f46e5;
  }

  .translation-options {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .lang-select {
    padding: 0.375rem 0.75rem;
    border: none;
    border-radius: 0.375rem;
    background: var(--bl-input-noBorder-bg-color);
    color: var(--text-color);
    font-size: 0.75rem;
    cursor: pointer;
    outline: none;
    min-width: 80px;
    appearance: none;
    background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6,9 12,15 18,9'%3e%3c/polyline%3e%3c/svg%3e");
    background-repeat: no-repeat;
    background-position: right 0.5rem center;
    background-size: 1rem;
    padding-right: 2rem;
  }

  .lang-select:hover {
    opacity: 0.8;
  }

  .lang-select:focus {
    opacity: 0.8;
    box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
  }

  .arrow {
    font-size: 0.75rem;
    color: var(--text-color);
  }
</style>
