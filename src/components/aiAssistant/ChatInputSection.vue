<template>
  <footer class="input-section">
    <div class="input-container">
      <textarea
        :value="modelValue"
        @input="onInput"
        @keydown.enter.exact.prevent="handleSend"
        @keydown.shift.enter="handleNewLine"
        :placeholder="t('ai.inputPlaceholder')"
        :disabled="isLoading"
        rows="1"
        ref="textInput"
        class="text-input"
      ></textarea>
      <div class="input-actions">
        <button
          class="search-btn"
          @click="toggleInternetSearch"
          :class="{ active: useInternetSearch }"
          title="联网搜索"
        >
          <svg-icon size="14" :src="icon.ai.internet" />
          联网搜索
        </button>
        <button class="search-btn" @click="toggleThinking" :class="{ active: enableThinking }" title="深度思考">
          <svg-icon size="14" :src="icon.ai.thinking" />
          深度思考
        </button>
        <button
          @click="isLoading ? stopFn() : sendFn()"
          v-click-log="{ module: 'AI助手', operation: isLoading ? '暂停' : '发送' }"
          :disabled="!modelValue.trim() && !isLoading"
          class="send-btn"
          :class="{ stop: isLoading }"
        >
          {{ isLoading ? t('ai.pause') : t('ai.send') }}
        </button>
      </div>
    </div>
    <div v-if="!isMobile" class="input-hint">{{ t('ai.inputHint') }}</div>
  </footer>
</template>

<script setup lang="ts">
  import { onMounted, ref, nextTick, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon.ts';

  const { t } = useI18n();

  const props = defineProps<{
    modelValue: string;
    isLoading: boolean;
    useInternetSearch: boolean;
    enableThinking: boolean;
    isMobile: boolean;
    sendFn: () => void;
    stopFn: () => void;
    toggleInternetSearch: () => void;
    toggleThinking: () => void;
  }>();

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
  }>();

  const textInput = ref<HTMLTextAreaElement | null>(null);

  const adjustTextareaHeight = () => {
    if (textInput.value) {
      textInput.value.style.height = 'auto';
      textInput.value.style.height = Math.min(textInput.value.scrollHeight, 120) + 'px';
    }
  };

  const onInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement;
    emit('update:modelValue', target.value);
    adjustTextareaHeight();
  };

  const handleSend = () => {
    props.sendFn();
  };

  const handleNewLine = () => {
    nextTick(adjustTextareaHeight);
  };

  onMounted(() => {
    adjustTextareaHeight();
  });

  watch(
    () => props.modelValue,
    () => {
      nextTick(adjustTextareaHeight);
    },
  );
</script>

<style scoped>
  .input-section {
    background: var(--background-color);
    border-top: 1px solid #e1e5e9;
    padding: 1.5rem;
    flex-shrink: 0;
  }

  .input-container {
    position: relative;
    border: 1px solid #d1d5db;
    border-radius: 0.75rem;
    background-color: var(--menu-container-bg-color);
    padding: 0.75rem 0.75rem 2rem 0.75rem;
    min-height: 60px;
  }

  .text-input {
    width: 100%;
    height: 100%;
    min-height: 40px;
    border: none;
    background: transparent;
    color: var(--text-color);
    font-size: 1rem;
    line-height: 1.5;
    resize: none;
    outline: none;
    transition: all 0.2s;
    max-height: 120px;
    font-family: inherit;
  }

  .text-input:focus {
    box-shadow: none;
  }

  .text-input::placeholder {
    color: #9ca3af;
  }

  .input-actions {
    position: absolute;
    bottom: 0.75rem;
    right: 0.75rem;
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .search-btn {
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

  .search-btn:hover {
    background: rgba(0, 0, 0, 0.1);
  }

  .search-btn.active {
    background: var(--primary-color);
    color: white;
  }

  .search-btn.active:hover {
    background: #4f46e5;
  }

  .send-btn {
    padding: 0.25rem 0.75rem;
    border: none;
    border-radius: 0.5rem;
    background: var(--primary-color);
    color: white;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 50px;
  }

  .send-btn:hover:not(:disabled) {
    background: #4f46e5;
  }

  .send-btn.stop {
    background: #dc2626;
  }

  .send-btn.stop:hover:not(:disabled) {
    background: #b91c1c;
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .input-hint {
    text-align: center;
    font-size: 0.75rem;
    color: #6b7280;
    margin-top: 0.5rem;
  }

  @media (max-width: 600px) {
    .input-section {
      padding: 1rem;
    }
  }
</style>
