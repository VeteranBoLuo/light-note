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
    <template #title>
      <div class="preview-modal-heading">
        <div class="preview-modal-title">{{ previewTitle }}</div>
        <div
          v-if="contextInfo"
          class="preview-context-status"
          :class="`mode-${contextInfo.mode}`"
        >
          <strong>{{ modeTitle }}</strong>
          <span class="preview-context-subject">{{ subjectLabel }}</span>
          <span class="preview-context-countdown">{{ countdownLabel }}</span>
          <BButton size="small" :disabled="closing" @click.stop="closePreview">
            {{ t('guest.adminContextExit') }}
          </BButton>
        </div>
      </div>
    </template>
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
  import BButton from '@/components/base/BasicComponents/BButton.vue';
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
  interface AdminContextInfo {
    mode: 'readonly' | 'maintain';
    subjectUserId?: string;
    subjectAlias?: string;
    expiresAt?: string;
  }

  const previewUrl = ref('');
  const openingId = ref(0);
  const contextToken = ref('');
  const contextInfo = ref<AdminContextInfo | null>(null);
  const now = ref(Date.now());
  const closing = ref(false);
  let timer: number | null = null;
  const previewTitle = computed(() => {
    const name = props.userInfo?.alias || props.userInfo?.email || '用户';
    return props.mode === 'maintain'
      ? t('guest.adminContextMaintainTitle', { name })
      : t('guest.userPreviewTitle', { name });
  });
  const modeTitle = computed(() =>
    contextInfo.value?.mode === 'maintain'
      ? t('guest.adminContextMaintain')
      : t('guest.adminContextReadonly'),
  );
  const subjectLabel = computed(() =>
    t('guest.adminContextSubject', {
      name:
        contextInfo.value?.subjectAlias ||
        contextInfo.value?.subjectUserId ||
        props.userInfo?.alias ||
        props.userInfo?.email ||
        '-',
    }),
  );
  const secondsLeft = computed(() => {
    const expiresAt = new Date(contextInfo.value?.expiresAt || 0).getTime();
    if (!Number.isFinite(expiresAt)) return 0;
    return Math.max(0, Math.ceil((expiresAt - now.value) / 1000));
  });
  const countdownLabel = computed(() => {
    const minutes = Math.floor(secondsLeft.value / 60);
    const seconds = secondsLeft.value % 60;
    return t('guest.adminContextRemaining', {
      time: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    });
  });

  watch(
    () => [visible.value, props.userInfo?.id, props.mode],
    async () => {
      if (!visible.value || !props.userInfo?.id) {
        return;
      }
      const requestId = ++openingId.value;
      previewUrl.value = '';
      contextInfo.value = null;
      clearAdminLoginPreview();
      try {
        const mode = props.mode || 'readonly';
        const res = await userApi.startAdminContext(props.userInfo.id, mode);
        if (requestId !== openingId.value || !visible.value) return;
        if (res.status !== 200 || !res.data?.contextToken) {
          throw new Error(res.msg || t('guest.adminContextStartFailed'));
        }
        contextToken.value = res.data.contextToken;
        contextInfo.value = res.data.context || {
          mode: res.data.mode as 'readonly' | 'maintain',
          subjectUserId: res.data.target?.id,
          subjectAlias: res.data.target?.alias,
          expiresAt: res.data.expiresAt,
        };
        now.value = Date.now();
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
    if (closing.value) return;
    closing.value = true;
    openingId.value += 1;
    const token = contextToken.value;
    visible.value = false;
    previewUrl.value = '';
    contextToken.value = '';
    contextInfo.value = null;
    clearAdminLoginPreview();
    if (token) {
      try {
        await userApi.endAdminContext(token);
      } catch {
        // 令牌可能已经过期；本地清理仍必须执行。
      }
    }
    closing.value = false;
  }

  function handlePreviewMessage(event: MessageEvent) {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type === 'light-note:admin-context-closed') {
      closePreview();
    }
  }

  onMounted(() => {
    timer = window.setInterval(() => (now.value = Date.now()), 1000);
    window.addEventListener('message', handlePreviewMessage);
  });
  onBeforeUnmount(() => {
    if (timer !== null) window.clearInterval(timer);
    window.removeEventListener('message', handlePreviewMessage);
  });
</script>

<style lang="less" scoped>
  .preview-modal-heading {
    min-width: 0;
    flex: 1;
  }
  .preview-modal-title {
    max-width: calc(50% - 220px);
    overflow: hidden;
    color: var(--text-color);
    font-size: 16px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preview-context-status {
    position: absolute;
    top: 50%;
    left: 50%;
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100% - 360px);
    padding: 6px 8px 6px 12px;
    transform: translate(-50%, -50%);
    border: 1px solid rgba(97, 92, 237, 0.35);
    border-radius: 10px;
    background: color-mix(in srgb, var(--background-color) 94%, #615ced 6%);
    color: var(--text-color);
    font-size: 13px;
    white-space: nowrap;
    box-shadow: 0 6px 20px rgba(17, 24, 39, 0.08);
  }
  .preview-context-status.mode-maintain {
    border-color: rgba(245, 158, 11, 0.55);
    background: color-mix(in srgb, var(--background-color) 92%, #f59e0b 8%);
  }
  .preview-context-subject {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .preview-context-countdown {
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  .user-preview-frame {
    width: 100%;
    height: 100%;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--background-color);
  }
  @media (max-width: 1100px) {
    .preview-context-subject {
      display: none;
    }
    .preview-modal-title {
      max-width: 34%;
    }
  }
</style>
