<template>
  <BModal
    v-model:visible="visible"
    :title="t('communityChat.report.title')"
    width="min(500px, 92vw)"
    :show-footer="false"
    :mask-closable="!submitting"
  >
    <div class="chat-report-modal">
      <p class="chat-report-modal__description">
        {{ t('communityChat.report.description', { name: authorName || t('communityChat.memberFallback') }) }}
      </p>

      <label id="community-chat-report-reason-label">{{ t('communityChat.report.reasonLabel') }}</label>
      <BSelect
        v-model:value="reasonCode"
        class="chat-report-modal__reason"
        :options="reasonOptions"
        :aria-labelledby="'community-chat-report-reason-label'"
        :disabled="submitting"
      />

      <label for="community-chat-report-detail">{{ detailLabel }}</label>
      <BInput
        id="community-chat-report-detail"
        v-model:value="detail"
        type="textarea"
        :rows="4"
        :maxlength="500"
        :disabled="submitting"
        :placeholder="t('communityChat.report.detailPlaceholder')"
      />
      <p class="chat-report-modal__evidence-hint">{{ t('communityChat.report.evidenceHint') }}</p>

      <div class="chat-report-modal__actions">
        <BButton :disabled="submitting" @click="visible = false">{{ t('common.cancel') }}</BButton>
        <BButton type="danger" :loading="submitting" :disabled="!canSubmit" @click="submit">
          {{ t('communityChat.report.submit') }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatReportReason } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';

  const REPORT_REASONS: readonly CommunityChatReportReason[] = [
    'spam',
    'harassment',
    'hate',
    'sexual',
    'violence',
    'privacy',
    'fraud',
    'self_harm',
    'other',
  ];

  const props = withDefaults(
    defineProps<{
      authorName?: string;
      submitting?: boolean;
    }>(),
    {
      authorName: '',
      submitting: false,
    },
  );
  const emit = defineEmits<{
    submit: [payload: { reasonCode: CommunityChatReportReason; detail: string }];
  }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();
  const reasonCode = ref<CommunityChatReportReason>('spam');
  const detail = ref('');

  const reasonOptions = computed(() =>
    REPORT_REASONS.map((value) => ({ value, label: t(`communityChat.report.reason.${value}`) })),
  );
  const detailLabel = computed(() =>
    reasonCode.value === 'other'
      ? t('communityChat.report.detailRequiredLabel')
      : t('communityChat.report.detailLabel'),
  );
  const canSubmit = computed(() => !props.submitting && (reasonCode.value !== 'other' || Boolean(detail.value.trim())));

  function submit() {
    if (!canSubmit.value) return;
    emit('submit', { reasonCode: reasonCode.value, detail: detail.value.trim() });
  }

  watch(visible, (nextVisible) => {
    if (!nextVisible) return;
    reasonCode.value = 'spam';
    detail.value = '';
  });
</script>

<style scoped lang="less">
  .chat-report-modal {
    display: grid;
    gap: 11px;
    color: var(--text-color);
  }

  .chat-report-modal__description,
  .chat-report-modal__evidence-hint {
    margin: 0;
    color: var(--desc-color);
    line-height: 1.6;
  }

  .chat-report-modal__description {
    font-size: 13px;
  }

  .chat-report-modal__evidence-hint {
    font-size: 11px;
  }

  .chat-report-modal label {
    font-size: 13px;
    font-weight: 650;
  }

  .chat-report-modal__actions {
    margin-top: 3px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  @media (max-width: 767px) {
    .chat-report-modal__actions :deep(.b_btn) {
      min-height: 42px;
    }
  }
</style>
