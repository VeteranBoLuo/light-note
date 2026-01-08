<template>
  <div class="translation-toggle">
    <button class="toggle-btn" @click="toggleTranslation" :class="{ active: enableTranslation }" title="翻译">
      <svg-icon size="14" :src="icon.ai.internet" />
      翻译
    </button>
    <div v-if="enableTranslation" class="translation-options">
      <div
        ref="sourceDropdown"
        class="lang-select"
        :class="{ open: openDropdown === 'source' }"
        @click.stop="toggleDropdown('source')"
      >
        <span class="selected-label">{{ getLabel(sourceLang) }}</span>
        <span class="chevron" aria-hidden="true"></span>
        <div v-if="openDropdown === 'source'" class="lang-options">
          <button
            v-for="lang in languages"
            :key="lang.value"
            class="lang-option"
            :class="{ active: lang.value === sourceLang }"
            @click.stop="chooseLang('source', lang.value)"
            type="button"
          >
            {{ lang.label }}
          </button>
        </div>
      </div>

      <span class="arrow">→</span>

      <div
        ref="targetDropdown"
        class="lang-select"
        :class="{ open: openDropdown === 'target' }"
        @click.stop="toggleDropdown('target')"
      >
        <span class="selected-label">{{ getLabel(targetLang) }}</span>
        <span class="chevron" aria-hidden="true"></span>
        <div v-if="openDropdown === 'target'" class="lang-options">
          <button
            v-for="lang in targetLanguages"
            :key="lang.value"
            class="lang-option"
            :class="{ active: lang.value === targetLang }"
            @click.stop="chooseLang('target', lang.value)"
            type="button"
          >
            {{ lang.label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
  const openDropdown = ref<'source' | 'target' | ''>('');

  const sourceDropdown = ref<HTMLElement | null>(null);
  const targetDropdown = ref<HTMLElement | null>(null);

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
    openDropdown.value = '';
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

  const getLabel = (value: string) => languages.find((lang) => lang.value === value)?.label || value;

  const toggleDropdown = (type: 'source' | 'target') => {
    openDropdown.value = type;
  };

  const chooseLang = (type: 'source' | 'target', value: string) => {
    if (type === 'source') {
      sourceLang.value = value;
    } else {
      targetLang.value = value;
    }
    updateConfig();
    openDropdown.value = '';
  };

  const handleClickOutside = (event: MouseEvent) => {
    const sourceOptions = sourceDropdown.value?.querySelector('.lang-options');
    const targetOptions = targetDropdown.value?.querySelector('.lang-options');
    const target = event.target as Node;
    console.log('Clicked outside:', sourceOptions?.contains(target), targetOptions?.contains(target));
    if (sourceOptions?.contains(target) || targetOptions?.contains(target)) return;
    openDropdown.value = '';
  };

  onMounted(() => {
    document.addEventListener('click', handleClickOutside);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('click', handleClickOutside);
  });

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
    height: 25px;
    position: relative;
    min-width: 100px;
    background: var(--bl-input-noBorder-bg-color);
    color: var(--text-color);
    font-size: 0.75rem;
    border-radius: 0.375rem;
    padding: 0.375rem 0.75rem;
    padding-right: 1.75rem;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    border-color: rgba(99, 102, 241, 0.3);
    box-sizing: border-box;
  }

  .lang-select:hover {
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
    border-color: var(--primary-color);
  }

  .lang-select.open {
    border-color: var(--primary-color);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  }

  .selected-label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chevron {
    position: absolute;
    right: 0.65rem;
    top: 50%;
    transform: translateY(-50%);
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid #6b7280;
    pointer-events: none;
    transition: transform 0.2s ease;
  }

  .lang-select.open .chevron {
    transform: translateY(-50%) rotate(180deg);
  }

  .lang-options {
    position: absolute;
    left: 0;
    bottom: calc(100% + 1px);
    width: 100%;
    background: var(--bl-input-noBorder-bg-color);
    border-radius: 0.5rem 0.5rem 0 0;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
    z-index: 10;
    overflow: hidden;
    border: 1px solid rgba(99, 102, 241, 0.18);
    max-height: 220px;
    overflow-y: auto;
  }

  .lang-option {
    width: 100%;
    text-align: left;
    padding: 0.45rem 0.7rem;
    background: transparent;
    border: none;
    color: var(--text-color);
    font-size: 0.75rem;
    cursor: pointer;
    transition:
      background 0.15s,
      color 0.15s;
  }

  .lang-option:hover {
    background: rgba(99, 102, 241, 0.08);
  }

  .lang-option.active {
    background: rgba(99, 102, 241, 0.16);
    color: var(--primary-color);
  }

  .arrow {
    font-size: 0.75rem;
    color: var(--text-color);
  }
</style>
