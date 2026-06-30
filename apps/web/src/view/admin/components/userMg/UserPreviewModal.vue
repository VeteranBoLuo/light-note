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
  import { computed, ref, watch } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import {
    ADMIN_LOGIN_PREVIEW_FRAME_NAME,
    clearAdminLoginPreview,
    getAdminLoginPreviewUrl,
    setAdminLoginPreview,
  } from '@/utils/authStorage.ts';

  const visible = defineModel<boolean>('visible');
  const props = defineProps<{
    userInfo?: any;
  }>();

  const previewUrl = ref('');
  const previewTitle = computed(() => {
    const name = props.userInfo?.alias || props.userInfo?.email || '用户';
    return `以 ${name} 身份预览`;
  });

  watch(
    () => [visible.value, props.userInfo?.id],
    () => {
      if (!visible.value || !props.userInfo?.id) {
        return;
      }
      setAdminLoginPreview(props.userInfo.id, props.userInfo.preferences);
      previewUrl.value = getAdminLoginPreviewUrl('/home');
    },
    { immediate: true },
  );

  function closePreview() {
    visible.value = false;
    previewUrl.value = '';
    clearAdminLoginPreview();
  }
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
