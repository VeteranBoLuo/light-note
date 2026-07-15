<template>
  <footer class="input-section">
    <div v-if="quota && !quota.exempt && quota.quota" class="ai-quota" :title="t('ai.quotaTip')">
      <span class="ai-quota-txt"
        >{{ t('ai.quotaToday') }} {{ fmtTokens(quota.used) }} / {{ fmtTokens(quota.quota) }}</span
      >
      <div class="ai-quota-bar"><div class="ai-quota-fill" :style="{ width: quotaPercent + '%' }"></div></div>
    </div>
    <div v-else-if="quota && quota.exempt" class="ai-quota ai-quota--free">
      {{ quota.role === 'root' ? t('ai.quotaUnlimited') : t('ai.quotaExempt') }}
    </div>
    <div class="input-container">
      <AiContextPicker :model-value="contexts" @update:model-value="$emit('update:contexts', $event)" />
      <BInput
        :value="modelValue"
        type="textarea"
        @input="onInput"
        @enter="handleSend"
        :placeholder="t('ai.inputPlaceholder')"
        :rows="1"
        ref="textInput"
        class="text-input"
      />
      <div class="composer-toolbar">
        <span v-if="!isMobile" class="input-hint">{{ t('ai.inputHint') }}</span>
        <div class="input-actions">
          <TranslationToggle
            v-if="showTranslation"
            :enableTranslation="enableTranslation"
            :translationConfig="translationConfig"
            @update:enableTranslation="$emit('update:enableTranslation', $event)"
            @update:translationConfig="$emit('update:translationConfig', $event)"
          />
          <BButton
            @click="isLoading ? stopFn() : sendFn()"
            v-click-log="{ module: 'AI助手', operation: isLoading ? '暂停' : '发送' }"
            :disabled="!modelValue.trim() && !isLoading"
            class="send-btn"
            :class="{ stop: isLoading }"
          >
            {{ isLoading ? t('ai.pause') : t('ai.send') }}
          </BButton>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
  import { onMounted, ref, nextTick, watch, computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import TranslationToggle from './TranslationToggle.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import AiContextPicker, { type AiResourceContext } from './AiContextPicker.vue';

  const { t } = useI18n();

  const props = defineProps<{
    modelValue: string;
    isLoading: boolean;
    quota?: { exempt?: boolean; role?: string; used?: number; quota?: number; remaining?: number } | null;
    showTranslation: boolean;
    enableTranslation: boolean;
    translationConfig: { source: string; target: string };
    isMobile: boolean;
    sendFn: () => void;
    stopFn: () => void;
    contexts: AiResourceContext[];
  }>();

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'update:enableTranslation', value: boolean): void;
    (e: 'update:translationConfig', value: { source: string; target: string }): void;
    (e: 'update:contexts', value: AiResourceContext[]): void;
  }>();

  const textInput = ref<{ focus: () => void } | null>(null);

  // AI 额度:已用占比 + token 紧凑格式(12.3k / 800k)
  const quotaPercent = computed(() => {
    const q = props.quota;
    if (!q || !q.quota) return 0;
    return Math.min(100, Math.round(((q.used || 0) / q.quota) * 100));
  });
  function fmtTokens(n?: number) {
    const v = Number(n || 0);
    return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : String(v);
  }

  const adjustTextareaHeight = () => {};

  const onInput = (value: string) => {
    emit('update:modelValue', value);
    adjustTextareaHeight();
  };

  const handleSend = (event: KeyboardEvent) => {
    if (event?.isComposing || event?.keyCode === 229) return;

    // 如果输入为空，仅中断（不发送）
    if (!props.modelValue.trim()) {
      if (props.isLoading) props.stopFn();
      return;
    }

    // 中断当前回复（如果有），然后发送新消息
    props.stopFn();
    props.sendFn();
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

  // 供父组件调用：编辑消息回填内容后，聚焦输入框并把光标移到末尾
  function focus() {
    nextTick(() => {
      textInput.value?.focus();
      adjustTextareaHeight();
    });
  }

  defineExpose({ focus });
</script>

<style scoped>
  .input-section {
    background: var(--background-color);
    padding: 0.5rem 1.25rem 0.75rem;
    flex-shrink: 0;
    min-width: 0;
    box-sizing: border-box;
  }

  .input-container {
    position: relative;
    border: 0;
    border-radius: 1rem;
    background-color: var(--menu-container-bg-color);
    padding: 0.7rem 0.75rem 0.6rem;
    min-height: 48px;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--text-color) 8%, transparent),
      0 8px 24px rgba(15, 23, 42, 0.06);
    transition: box-shadow 0.2s ease;
  }

  .input-container:focus-within {
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--primary-color) 48%, transparent),
      0 10px 28px rgba(15, 23, 42, 0.08);
  }

  .text-input {
    display: block;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    min-height: 40px;
    box-sizing: border-box;
  }

  .text-input :deep(.input-container) {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }

  .text-input :deep(.b-textarea) {
    min-height: 40px;
    max-height: 120px;
    resize: none;
    border: none;
    padding: 0;
    background: transparent !important;
    font-size: 1rem;
    line-height: 1.5;
  }

  .text-input :deep(.b-textarea:hover),
  .text-input :deep(.b-textarea:focus),
  .text-input :deep(.b-textarea:active) {
    border: 0;
    box-shadow: none;
  }

  .text-input:focus {
    box-shadow: none;
  }

  .text-input :deep(.b-textarea::placeholder) {
    color: var(--desc-color);
  }

  .composer-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: 28px;
    margin-top: 0.25rem;
  }

  .input-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 0.5rem;
  }

  .send-btn {
    padding: 0.25rem 0.75rem;
    border-radius: 0.5rem;
    background: var(--primary-color);
    color: white;
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.2s;
    min-width: 50px;
    height: 28px;
    line-height: 1;
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

  .ai-quota {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 2px 7px;
    font-size: 11.5px;
    color: var(--desc-color);
  }
  .ai-quota-txt {
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
  }
  .ai-quota-bar {
    flex: 1;
    height: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 13%, transparent);
    overflow: hidden;
  }
  .ai-quota-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--primary-color), color-mix(in srgb, var(--primary-color) 68%, #22d3ee));
    transition: width 0.3s ease;
  }
  .ai-quota--free {
    color: var(--primary-color);
    font-weight: 600;
  }
  .input-hint {
    font-size: 0.75rem;
    color: var(--desc-color);
    white-space: nowrap;
  }

  @media (max-width: 600px) {
    .input-section {
      padding: 0.4rem 0.35rem calc(0.45rem + env(safe-area-inset-bottom));
    }

    .input-container {
      padding: 0.6rem 0.65rem 0.5rem;
      border-radius: 0.875rem;
    }

    .composer-toolbar {
      justify-content: flex-end;
    }
  }
</style>
