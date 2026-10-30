<template>
  <BModal
    v-model:visible="visible"
    :title="title"
    width="min(var(--ui-layout-520, 520px), 94vw)"
    :show-footer="false"
    :mask-closable="!loading"
    :esc-closable="!loading"
    :close-disabled="loading"
    content-class="admin-risk-action-content"
    fullscreen-mobile
  >
    <div class="admin-risk-action">
      <p class="admin-risk-action__impact">{{ impact }}</p>

      <!-- 业务专属参数（如静默时长）放在原因之前，弹框的原因、确认与审计规则保持统一。 -->
      <slot />

      <label class="admin-risk-action__field">
        <span
          >{{ t('adminRiskAction.reasonLabel') }} <b>{{ t('adminRiskAction.reasonRule') }}</b></span
        >
        <BInput
          v-model:value="reason"
          type="textarea"
          :rows="4"
          :maxlength="500"
          :disabled="loading"
          :placeholder="t('adminRiskAction.reasonPlaceholder')"
        />
      </label>

      <label v-if="confirmPhrase" class="admin-risk-action__field">
        <span
          >{{ t('adminRiskAction.confirmPhraseLabel') }}
          <b>{{ t('adminRiskAction.confirmPhraseRule', { phrase: confirmPhrase }) }}</b></span
        >
        <BInput
          v-model:value="confirmText"
          :disabled="loading"
          :placeholder="confirmPhrase"
          autocomplete="off"
          @enter="submit"
        />
      </label>

      <p class="admin-risk-action__audit">{{ t('adminRiskAction.auditHint') }}</p>
      <div class="admin-risk-action__footer">
        <BButton :disabled="loading" @click="visible = false">{{ t('common.cancel') }}</BButton>
        <BButton type="danger" :loading="loading" :disabled="!canSubmit" @click="submit">
          {{ confirmLabel || t('adminRiskAction.defaultConfirm') }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';

  const props = withDefaults(
    defineProps<{
      title: string;
      impact: string;
      confirmPhrase?: string;
      confirmLabel?: string;
      /** 可选的业务默认原因；弹窗每次打开时重新预填，用户仍可编辑。 */
      defaultReason?: string;
      loading?: boolean;
    }>(),
    {
      confirmPhrase: '',
      confirmLabel: '',
      defaultReason: '',
      loading: false,
    },
  );

  const { t } = useI18n();

  const visible = defineModel<boolean>('visible', { default: false });
  const emit = defineEmits<{
    confirm: [payload: { reason: string; confirmed: true; confirmText: string }];
  }>();
  const reason = ref('');
  const confirmText = ref('');
  const canSubmit = computed(
    () =>
      !props.loading &&
      reason.value.trim().length >= 6 &&
      (!props.confirmPhrase || confirmText.value.trim() === props.confirmPhrase),
  );

  watch(
    visible,
    (open) => {
      reason.value = open ? props.defaultReason.trim().slice(0, 500) : '';
      confirmText.value = '';
    },
    { immediate: true },
  );

  function submit() {
    if (!canSubmit.value) return;
    emit('confirm', {
      reason: reason.value.trim(),
      confirmed: true,
      confirmText: confirmText.value.trim(),
    });
  }
</script>

<style scoped lang="less">
  .admin-risk-action {
    display: grid;
    gap: var(--ui-space-16, 16px);
  }

  .admin-risk-action__impact,
  .admin-risk-action__audit {
    margin: 0;
    line-height: 1.65;
  }

  .admin-risk-action__impact {
    padding: var(--ui-space-12, 12px) var(--ui-space-14, 14px);
    border: 1px solid var(--error-color, #d14343);
    border-radius: 10px;
    background: var(--surface-background, var(--card-background));
    color: var(--text-color);
  }

  .admin-risk-action__field {
    display: grid;
    gap: var(--ui-space-8, 8px);
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
  }

  .admin-risk-action__field b {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 500;
  }

  .admin-risk-action__audit {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }

  .admin-risk-action__footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--ui-space-10, 10px);
  }

  html.light-note-mobile-rendering .admin-risk-action__impact {
    box-shadow: none;
  }

  /* 手机全屏时 BModal 不给内容区留白，由弹框自己排版：内容可滚动，取消与确认固定在底部。 */
  :global(.modal-view.is-mobile-fullscreen .modal-content.admin-risk-action-content) {
    overflow-x: hidden;
    overflow-y: auto;
  }

  :global(.modal-view.is-mobile-fullscreen .admin-risk-action) {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    min-height: 100%;
    padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px) 0;
  }

  :global(.modal-view.is-mobile-fullscreen .admin-risk-action__footer) {
    position: sticky;
    bottom: 0;
    margin-top: auto;
    padding: var(--ui-space-12, 12px) 0 calc(var(--ui-space-12, 12px) + env(safe-area-inset-bottom));
    background: var(--background-color);
  }
</style>
