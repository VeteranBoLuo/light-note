<template>
  <div class="bookmark-recognition-notice" role="status">
    <strong>{{ failure.message }}</strong>
    <p>{{ failure.hint }}</p>
    <div class="bookmark-recognition-notice__actions">
      <BButton v-if="failure.retryable" type="text" size="small" :disabled="disabled" @click="$emit('retry')">
        {{ $t('bookmarkMeta.recovery.retry') }}
      </BButton>
      <BButton type="text" size="small" :disabled="disabled" @click="$emit('manual', failure.focusTarget)">
        {{ $t(failure.focusTarget === 'url' ? 'bookmarkMeta.recovery.checkUrl' : 'bookmarkMeta.recovery.manual') }}
      </BButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import type { BookmarkRecognitionFailure } from '@/utils/bookmarkRecognitionFailure';
  defineProps<{ failure: BookmarkRecognitionFailure; disabled?: boolean }>();
  defineEmits<{ retry: []; manual: [target: 'name' | 'url'] }>();
</script>

<style scoped>
  .bookmark-recognition-notice {
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border: 1px solid var(--message-warning-color);
    border-radius: 8px;
    color: var(--text-color);
    background: var(--card-background);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .bookmark-recognition-notice p {
    margin: var(--ui-space-4, 4px) 0;
  }
  .bookmark-recognition-notice__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
  }
</style>
