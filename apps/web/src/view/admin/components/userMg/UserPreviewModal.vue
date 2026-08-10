<template>
  <b-modal
    v-if="visible"
    :title="previewTitle"
    width="92vw"
    height="calc(100vh - 64px)"
    top="50%"
    :show-footer="false"
    fullscreen-mobile
    modal-class="user-preview-modal"
    content-class="user-preview-modal-content"
    v-model:visible="visible"
    @close="closePreview"
  >
    <template #title>
      <div class="preview-modal-heading">
        <div class="preview-modal-title">{{ previewTitle }}</div>
        <div v-if="contextInfo" class="preview-context-status" :class="`mode-${contextInfo.mode}`">
          <strong>{{ modeTitle }}</strong>
          <span class="preview-context-subject">{{ subjectLabel }}</span>
          <span class="preview-context-countdown">{{ countdownLabel }}</span>
        </div>
      </div>
    </template>
    <template #mobileHeader="{ close }">
      <div class="preview-mobile-admin-rail">
        <BButton class="preview-mobile-exit" :aria-label="t('guest.adminContextExit')" @click="close">
          <SvgIcon :src="icon.navigation.exit" size="18" aria-hidden="true" />
          <span>{{ t('guest.adminContextExit') }}</span>
        </BButton>
        <div class="preview-mobile-title" :aria-label="previewTitle">{{ previewTitle }}</div>
        <div
          class="preview-mobile-context"
          :class="`mode-${contextInfo?.mode || props.mode || 'readonly'}`"
          :aria-label="`${modeTitle}，${countdownLabel}`"
        >
          <strong>{{ modeShortTitle }}</strong>
          <span>{{ countdownTime }}</span>
        </div>
      </div>
    </template>
    <div class="user-preview-frame-shell">
      <iframe
        v-if="previewUrl"
        class="user-preview-frame"
        :title="previewTitle"
        :name="ADMIN_LOGIN_PREVIEW_FRAME_NAME"
        :src="previewUrl"
      />
      <div v-else class="user-preview-loading" aria-live="polite">
        <BLoading inline loading :title="t('common.loading')" />
      </div>
    </div>
  </b-modal>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';
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
  let disposed = false;
  let timer: number | null = null;
  const previewTitle = computed(() => {
    const name = props.userInfo?.adminRemark || props.userInfo?.alias || props.userInfo?.email || '用户';
    return props.mode === 'maintain'
      ? t('guest.adminContextMaintainTitle', { name })
      : t('guest.userPreviewTitle', { name });
  });
  const modeTitle = computed(() =>
    contextInfo.value?.mode === 'maintain' ? t('guest.adminContextMaintain') : t('guest.adminContextReadonly'),
  );
  const modeShortTitle = computed(() =>
    contextInfo.value?.mode === 'maintain' || props.mode === 'maintain'
      ? t('guest.adminContextMaintainShort')
      : t('guest.adminContextReadonlyShort'),
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
    return t('guest.adminContextRemaining', { time: countdownTime.value });
  });
  const countdownTime = computed(() => {
    const minutes = Math.floor(secondsLeft.value / 60);
    const seconds = secondsLeft.value % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  });

  function clearLocalPreview() {
    const token = contextToken.value;
    previewUrl.value = '';
    contextToken.value = '';
    contextInfo.value = null;
    clearAdminLoginPreview();
    return token;
  }

  async function revokeContextToken(token: string) {
    if (!token) return;
    try {
      await userApi.endAdminContext(token);
    } catch {
      // 令牌可能已经过期或网络已断开；本地授权材料仍必须立即清理。
    }
  }

  function disposeCurrentPreview(hide = false) {
    openingId.value += 1;
    const token = clearLocalPreview();
    if (hide) visible.value = false;
    if (token) void revokeContextToken(token);
  }

  watch(
    () => [visible.value, props.userInfo?.id, props.mode],
    async () => {
      if (!visible.value || !props.userInfo?.id) {
        if (contextToken.value || previewUrl.value) disposeCurrentPreview(false);
        return;
      }
      const requestId = ++openingId.value;
      const previousToken = clearLocalPreview();
      if (previousToken) void revokeContextToken(previousToken);
      try {
        const mode = props.mode || 'readonly';
        const res = await userApi.startAdminContext(props.userInfo.id, mode);
        const responseToken = String(res.data?.contextToken || '');
        if (requestId !== openingId.value || !visible.value || disposed) {
          if (responseToken) void revokeContextToken(responseToken);
          return;
        }
        if (res.status !== 200 || !res.data?.contextToken) {
          throw new Error(res.msg || t('guest.adminContextStartFailed'));
        }
        contextToken.value = responseToken;
        contextInfo.value = res.data.context || {
          mode: res.data.mode as 'readonly' | 'maintain',
          subjectUserId: res.data.target?.id,
          subjectAlias: res.data.target?.alias,
          expiresAt: res.data.expiresAt,
        };
        now.value = Date.now();
        setAdminLoginPreview(responseToken, props.userInfo.preferences);
        previewUrl.value = getAdminLoginPreviewUrl('/home');
      } catch (error: any) {
        if (requestId !== openingId.value || !visible.value || disposed) return;
        message.error(error?.message || t('guest.adminContextStartFailed'));
        closePreview();
      }
    },
    { immediate: true },
  );

  function closePreview() {
    disposeCurrentPreview(true);
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
    disposed = true;
    disposeCurrentPreview(false);
    if (timer !== null) window.clearInterval(timer);
    window.removeEventListener('message', handlePreviewMessage);
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-breakpoints.less';
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
    padding: 6px 8px 6px 12px;
    transform: translate(-50%, -50%);
    border: 1px solid rgba(97, 92, 237, 0.35);
    border-radius: 10px;
    background: color-mix(in srgb, var(--background-color) 94%, var(--primary-color) 6%);
    color: var(--text-color);
    font-size: 13px;
    white-space: nowrap;
    box-shadow: 0 6px 20px rgba(17, 24, 39, 0.08);
  }
  .preview-context-status.mode-maintain {
    border-color: rgba(245, 158, 11, 0.55);
    background: color-mix(in srgb, var(--background-color) 92%, var(--warning-color) 8%);
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
    display: block;
    width: 100%;
    height: 100%;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--background-color);
  }
  .user-preview-frame-shell {
    display: flex;
    width: 100%;
    height: 100%;
    min-height: 0;
    background: var(--background-color);
  }
  .user-preview-loading {
    display: grid;
    width: 100%;
    min-height: 180px;
    place-items: center;
  }
  .preview-mobile-admin-rail {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-height: calc(52px + env(safe-area-inset-top));
    padding: env(safe-area-inset-top) 8px 0;
    box-sizing: border-box;
    background: var(--card-background);
  }
  .preview-mobile-exit.b_btn {
    gap: 4px;
    min-width: 0;
    height: 44px;
    padding: 0 6px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--text-color);
    font-size: 12px;
  }
  .preview-mobile-title {
    min-width: 0;
    overflow: hidden;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preview-mobile-context {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 28px;
    padding: 0 7px;
    border: 1px solid rgba(97, 92, 237, 0.62);
    border-radius: 999px;
    background: var(--primary-btn-bg-color);
    color: var(--primary-color);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .preview-mobile-context.mode-maintain {
    border-color: rgba(245, 158, 11, 0.72);
    background: rgba(245, 158, 11, 0.12);
    color: var(--warning-color);
  }
  @media (max-width: @admin-bp-desktop) {
    .preview-context-subject {
      display: none;
    }
    .preview-modal-title {
      max-width: 34%;
    }
  }
  @media (max-width: @admin-bp-mobile) {
    :deep(.user-preview-modal-content) {
      min-height: 0;
    }
    .user-preview-frame {
      border: 0;
      border-radius: 0;
    }
    .preview-mobile-exit.b_btn span {
      display: none;
    }
  }
  @media (min-width: 390px) and (max-width: @admin-bp-mobile) {
    .preview-mobile-exit.b_btn span {
      display: inline;
    }
  }
</style>
