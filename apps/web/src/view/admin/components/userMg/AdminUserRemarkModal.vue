<template>
  <BModal
    v-model:visible="visible"
    :title="t('adminUserManagement.remarkModalTitle')"
    width="min(440px, calc(100vw - 32px))"
    :show-footer="false"
    :mask-closable="!saving"
    :esc-closable="!saving"
    initial-focus=".admin-user-remark__input input"
    @close="close"
  >
    <div v-if="user" class="admin-user-remark">
      <div class="admin-user-remark__target">
        {{ t('adminUserManagement.remarkTarget', { name: targetName }) }}
      </div>
      <BInput
        v-model:value="remarkName"
        class="admin-user-remark__input"
        :maxlength="80"
        :disabled="saving"
        :placeholder="t('adminUserManagement.remarkPlaceholder')"
        @enter="save"
      />
      <div class="admin-user-remark__meta">
        <span>{{ t('adminUserManagement.remarkPrivacy') }}</span>
        <span>{{ remarkName.length }}/80</span>
      </div>
      <div class="admin-user-remark__hint">{{ t('adminUserManagement.remarkClearHint') }}</div>
      <div class="admin-user-remark__actions">
        <BButton :disabled="saving" @click="close">{{ t('common.cancel') }}</BButton>
        <BButton type="primary" :loading="saving" @click="save">
          {{ t('adminUserManagement.remarkSave') }}
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
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import userApi from '@/api/userApi.ts';

  export interface AdminUserRemarkTarget {
    id: string;
    alias?: string;
    email?: string;
    adminRemark?: string;
  }

  const props = defineProps<{
    user: AdminUserRemarkTarget | null;
  }>();
  const emit = defineEmits<{
    saved: [payload: { targetUserId: string; adminRemark: string }];
  }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();
  const remarkName = ref('');
  const saving = ref(false);
  const targetName = computed(() => props.user?.alias || props.user?.email || props.user?.id || '-');

  watch(
    () => [visible.value, props.user?.id, props.user?.adminRemark] as const,
    ([isVisible]) => {
      if (!isVisible) return;
      remarkName.value = props.user?.adminRemark || '';
    },
    { immediate: true },
  );

  function close() {
    if (saving.value) return;
    visible.value = false;
  }

  async function save() {
    const targetUserId = props.user?.id;
    if (!targetUserId || saving.value) return;
    saving.value = true;
    try {
      const response = await userApi.saveAdminUserRemark(targetUserId, remarkName.value);
      if (response.status !== 200) {
        throw new Error(response.msg || t('adminUserManagement.remarkSaveFailed'));
      }
      const adminRemark = String(response.data?.adminRemark ?? remarkName.value).trim();
      emit('saved', { targetUserId, adminRemark });
      message.success(adminRemark ? t('adminUserManagement.remarkSaved') : t('adminUserManagement.remarkCleared'));
      visible.value = false;
    } catch (error: any) {
      message.error(error?.message || t('adminUserManagement.remarkSaveFailed'));
    } finally {
      saving.value = false;
    }
  }
</script>

<style scoped lang="less">
  .admin-user-remark {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .admin-user-remark__target {
    overflow: hidden;
    color: var(--text-color);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .admin-user-remark__input {
    :deep(.b-input) {
      height: 40px;
      border: 1px solid var(--card-border-color) !important;
      background: var(--background-color);
    }
  }

  .admin-user-remark__meta {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    color: var(--desc-color);
    font-size: 12px;

    span:first-child {
      flex: 1;
    }

    span:last-child {
      flex: none;
      font-variant-numeric: tabular-nums;
    }
  }

  .admin-user-remark__hint {
    color: var(--sub-text-color);
    font-size: 12px;
  }

  .admin-user-remark__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 4px;
  }
</style>
