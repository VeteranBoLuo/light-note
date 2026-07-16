<template>
  <BModal
    v-model:visible="visible"
    :title="official ? t('coBuild.officialFormTitle') : t('coBuild.formTitle')"
    :show-footer="false"
    width="min(620px, 92vw)"
    :mask-closable="!submitting"
    @close="close"
  >
    <div class="request-form">
      <p class="form-hint">{{ official ? t('coBuild.officialFormHint') : t('coBuild.formHint') }}</p>

      <div class="form-field">
        <label>{{ t('coBuild.titleLabel') }}</label>
        <BInput v-model:value="draft.title" :maxlength="160" :placeholder="t('coBuild.titlePlaceholder')" />
        <span class="field-counter">{{ draft.title.length }}/160</span>
      </div>

      <div class="form-field">
        <label>{{ t('coBuild.contentLabel') }}</label>
        <BInput
          v-model:value="draft.content"
          type="textarea"
          :rows="7"
          :maxlength="6000"
          :placeholder="t('coBuild.contentPlaceholder')"
        />
        <span class="field-counter">{{ draft.content.length }}/6000</span>
      </div>

      <div class="form-field">
        <label>{{ t('coBuild.categoryLabel') }}</label>
        <BSelect v-model:value="draft.category" :options="categoryOptions" />
      </div>

      <div v-if="!official" class="identity-setting">
        <div>
          <strong>{{ t('coBuild.showIdentity') }}</strong>
          <span>{{ t('coBuild.showIdentityDesc') }}</span>
        </div>
        <BSwitch v-model:checked="draft.showIdentity" />
      </div>

      <div class="form-actions">
        <BButton @click="close">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="submitting" :disabled="!canSubmit" @click="submit">
          {{ official ? t('coBuild.submitOfficial') : t('coBuild.submit') }}
        </BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import {
    createFeatureRequest,
    createOfficialFeatureRequest,
    type FeatureRequestCategory,
  } from '@/api/featureRequestApi';
  import { recordOperation } from '@/api/commonApi';

  const props = withDefaults(defineProps<{ official?: boolean }>(), { official: false });
  const emit = defineEmits<{ saved: [] }>();
  const visible = defineModel<boolean>('visible');
  const { t } = useI18n();

  const draft = reactive({
    title: '',
    content: '',
    category: 'experience' as FeatureRequestCategory,
    showIdentity: true,
  });
  const submitting = ref(false);

  const categoryKeys: FeatureRequestCategory[] = ['bookmark', 'note', 'cloud', 'tag', 'ai', 'experience', 'other'];
  const categoryOptions = computed(() =>
    categoryKeys.map((value) => ({ value, label: t(`coBuild.category.${value}`) })),
  );
  const canSubmit = computed(() => draft.title.trim().length >= 4 && draft.content.trim().length >= 10);

  function reset() {
    draft.title = '';
    draft.content = '';
    draft.category = 'experience';
    draft.showIdentity = true;
  }

  function close() {
    if (submitting.value) return;
    visible.value = false;
  }

  async function submit() {
    if (!canSubmit.value || submitting.value) return;
    submitting.value = true;
    try {
      const payload = {
        title: draft.title.trim(),
        content: draft.content.trim(),
        category: draft.category,
        showIdentity: draft.showIdentity,
      };
      const res = props.official ? await createOfficialFeatureRequest(payload) : await createFeatureRequest(payload);
      if (res?.status !== 200) return;
      message.success(t(props.official ? 'coBuild.officialSubmitSuccess' : 'coBuild.submitSuccess'));
      recordOperation({
        module: '共建轻笺',
        operation: props.official ? '发布官方规划' : '提交产品建议',
      });
      emit('saved');
      visible.value = false;
      reset();
    } catch (error) {
      console.error('提交共建建议失败:', error);
    } finally {
      submitting.value = false;
    }
  }

  watch(visible, (open) => {
    if (!open && !submitting.value) reset();
  });
</script>

<style scoped lang="less">
  .request-form {
    display: grid;
    gap: 18px;
  }
  .form-hint {
    margin: 0;
    padding: 12px 14px;
    border-radius: 10px;
    color: var(--desc-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--surface-panel-bg));
    font-size: 13px;
    line-height: 1.65;
  }
  .form-field {
    position: relative;
    display: grid;
    gap: 8px;
  }
  .form-field label,
  .identity-setting strong {
    color: var(--text-color);
    font-size: 14px;
    font-weight: 650;
  }
  .field-counter {
    justify-self: end;
    margin-top: -4px;
    color: var(--desc-color);
    font-size: 11px;
  }
  .identity-setting {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--surface-panel-bg);
  }
  .identity-setting > div {
    display: grid;
    gap: 5px;
  }
  .identity-setting span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 2px;
  }
  :deep(.b-textarea) {
    resize: vertical;
    min-height: 148px;
    border-color: var(--surface-border-color);
    background: var(--surface-panel-bg) !important;
    font-family: inherit;
    line-height: 1.65;
  }
  :deep(.b-input),
  :deep(.select-trigger) {
    min-height: 40px;
    border: 1px solid var(--surface-border-color) !important;
    background: var(--surface-panel-bg);
  }
  @media (max-width: 767px) {
    .request-form {
      gap: 14px;
    }
    .form-actions :deep(.b_btn) {
      flex: 1;
      width: auto;
    }
  }
</style>
