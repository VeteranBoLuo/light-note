<template>
  <b-modal
    v-if="visible"
    :title="previewTitle"
    width="92vw"
    height="calc(100vh - 64px)"
    top="50%"
    :show-footer="false"
    v-model:visible="visible"
    @close="closePreview"
  >
    <iframe
      v-if="previewUrl"
      class="user-preview-frame"
      :name="ADMIN_LOGIN_PREVIEW_FRAME_NAME"
      :src="previewUrl"
    />
  </b-modal>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import userApi from '@/api/userApi.ts';
  import {
    ADMIN_LOGIN_PREVIEW_FRAME_NAME,
    clearAdminLoginPreview,
    getAdminLoginPreviewUrl,
    setAdminLoginPreview,
  } from '@/utils/authStorage.ts';

  const visible = defineModel<boolean>('visible');
  const { t } = useI18n();
  const props = defineProps<{
    userInfo?: any;
    mode?: 'readonly' | 'maintain';
  }>();

  const previewUrl = ref('');
  const openingId = ref(0);
  const contextToken = ref('');
  const previewTitle = computed(() => {
    const name = props.userInfo?.alias || props.userInfo?.email || '用户';
    return props.mode === 'maintain'
      ? t('guest.adminContextMaintainTitle', { name })
      : t('guest.userPreviewTitle', { name });
  });

  watch(
    () => [visible.value, props.userInfo?.id, props.mode],
    async () => {
      if (!visible.value || !props.userInfo?.id) {
        return;
      }
      const requestId = ++openingId.value;
      previewUrl.value = '';
      clearAdminLoginPreview();
      try {
        const mode = props.mode || 'readonly';
        const res = await userApi.startAdminContext(props.userInfo.id, mode);
        if (requestId !== openingId.value || !visible.value) return;
        if (res.status !== 200 || !res.data?.contextToken) {
          throw new Error(res.msg || t('guest.adminContextStartFailed'));
        }
        contextToken.value = res.data.contextToken;
        setAdminLoginPreview(res.data.contextToken, props.userInfo.preferences);
        previewUrl.value = getAdminLoginPreviewUrl('/home');
      } catch (error: any) {
        message.error(error?.message || t('guest.adminContextStartFailed'));
        closePreview();
      }
    },
    { immediate: true },
  );

  async function closePreview() {
    openingId.value += 1;
    if (contextToken.value) {
      try {
        await userApi.endAdminContext(contextToken.value);
      } catch {
        // 令牌可能已经过期；本地清理仍必须执行。
      }
    }
    visible.value = false;
    previewUrl.value = '';
    contextToken.value = '';
    clearAdminLoginPreview();
  }

  function handlePreviewMessage(event: MessageEvent) {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === 'light-note:admin-context-closed') {
      closePreview();
    }
  }

  onMounted(() => window.addEventListener('message', handlePreviewMessage));
  onBeforeUnmount(() => window.removeEventListener('message', handlePreviewMessage));
</script>

<style lang="less" scoped>
  .user-preview-frame {
    width: 100%;
    height: 100%;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--background-color);
  }
</style>
