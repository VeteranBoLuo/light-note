<template>
  <BModal
    v-model:visible="visible"
    :title="title"
    :show-footer="false"
    :mask-closable="false"
    width="min(560px, 92vw)"
    @close="finish(null)"
  >
    <div class="bookmark-url-decision">
      <p class="bookmark-url-decision__description">{{ description }}</p>
      <div class="bookmark-url-decision__options">
        <BButton
          v-for="option in options"
          :key="option.id"
          class="bookmark-url-decision__option"
          :type="option.recommended ? 'primary' : undefined"
          @click="finish(option.id)"
        >
          <span class="bookmark-url-decision__option-content">
            <span class="bookmark-url-decision__option-heading">
              <strong>{{ option.label }}</strong>
              <small v-if="option.recommended">{{ recommendedText }}</small>
            </span>
            <span v-if="option.description" class="bookmark-url-decision__option-description">
              {{ option.description }}
            </span>
          </span>
        </BButton>
      </div>
      <div class="bookmark-url-decision__footer">
        <BButton @click="finish(null)">{{ cancelText }}</BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  interface BookmarkUrlDecisionOption {
    id: string;
    label: string;
    description?: string;
    recommended?: boolean;
  }

  defineProps<{
    title: string;
    description: string;
    options: BookmarkUrlDecisionOption[];
    cancelText: string;
    recommendedText: string;
  }>();
  const emit = defineEmits<{ resolve: [value: string | null] }>();
  const visible = ref(true);
  let settled = false;

  function finish(value: string | null) {
    if (settled) return;
    settled = true;
    visible.value = false;
    emit('resolve', value);
  }
</script>

<style scoped lang="less">
  .bookmark-url-decision {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .bookmark-url-decision__description {
    margin: 0;
    color: var(--desc-color);
    line-height: 1.65;
  }

  .bookmark-url-decision__options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  :deep(.bookmark-url-decision__option) {
    width: 100%;
    height: auto;
    min-height: 62px;
    padding: 12px 14px;
    line-height: 1.35;
    white-space: normal;
    justify-content: flex-start;
    text-align: left;
  }

  .bookmark-url-decision__option-content {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 5px;
  }

  .bookmark-url-decision__option-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }

  .bookmark-url-decision__option-heading strong {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .bookmark-url-decision__option-heading small {
    flex-shrink: 0;
    font-weight: 500;
    opacity: 0.82;
  }

  .bookmark-url-decision__option-description {
    font-size: 12px;
    opacity: 0.78;
    overflow-wrap: anywhere;
  }

  .bookmark-url-decision__footer {
    display: flex;
    justify-content: flex-end;
  }
</style>
