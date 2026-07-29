<template>
  <BModal
    v-model:visible="visible"
    :title="t('auth.githubConsentTitle')"
    width="min(520px, calc(100vw - 24px))"
    :show-footer="false"
    :mask-closable="!loading"
    :esc-closable="!loading"
    @close="cancel"
  >
    <div class="github-consent">
      <p class="github-consent__intro">{{ t('auth.githubConsentIntro') }}</p>
      <dl class="github-consent__details">
        <div>
          <dt>{{ t('auth.githubConsentRecipientLabel') }}</dt>
          <dd>{{ t('auth.githubConsentRecipient') }}</dd>
        </div>
        <div>
          <dt>{{ t('auth.githubConsentPurposeLabel') }}</dt>
          <dd>{{ t('auth.githubConsentPurpose') }}</dd>
        </div>
        <div>
          <dt>{{ t('auth.githubConsentDataLabel') }}</dt>
          <dd>{{ t('auth.githubConsentData') }}</dd>
        </div>
        <div>
          <dt>{{ t('auth.githubConsentLocationLabel') }}</dt>
          <dd>{{ t('auth.githubConsentLocation') }}</dd>
        </div>
      </dl>
      <p class="github-consent__choice">{{ t('auth.githubConsentChoice') }}</p>
      <div class="github-consent__links">
        <a
          href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
          target="_blank"
          rel="noopener noreferrer"
          >{{ t('auth.githubPrivacyLink') }}</a
        >
        <a href="/legal/privacy-policy.html" target="_blank" rel="noopener noreferrer">{{
          t('auth.lightNotePrivacyLink')
        }}</a>
      </div>
      <div class="github-consent__actions">
        <BButton :disabled="loading" @click="cancel">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="loading" @click="emit('confirm')">
          {{ t('auth.githubConsentContinue') }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';

  const props = withDefaults(defineProps<{ loading?: boolean }>(), { loading: false });
  const emit = defineEmits<{ confirm: []; cancel: [] }>();
  const visible = defineModel<boolean>('visible', { required: true });
  const { t } = useI18n();

  function cancel() {
    if (props.loading) return;
    visible.value = false;
    emit('cancel');
  }
</script>

<style scoped lang="less">
  .github-consent {
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: var(--text-color);
  }

  .github-consent__intro,
  .github-consent__choice {
    margin: 0;
    line-height: 1.65;
    color: var(--desc-color);
  }

  .github-consent__details {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 14px;
    border: 1px solid var(--menu-item-h-bg-color);
    border-radius: 10px;
    background: var(--modal-input-bg);
  }

  .github-consent__details > div {
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    gap: 10px;
    line-height: 1.55;
  }

  .github-consent__details dt {
    font-weight: 600;
  }

  .github-consent__details dd {
    margin: 0;
    color: var(--desc-color);
  }

  .github-consent__links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
  }

  .github-consent__links a {
    color: var(--primary-color);
    text-decoration: none;
  }

  .github-consent__actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  @media (max-width: 520px) {
    .github-consent__details > div {
      grid-template-columns: 1fr;
      gap: 2px;
    }

    .github-consent__actions {
      flex-direction: column-reverse;
    }

    .github-consent__actions :deep(.b_btn) {
      width: 100%;
    }
  }
</style>
