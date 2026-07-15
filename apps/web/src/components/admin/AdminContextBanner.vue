<template>
  <div
    v-if="user.adminContext && !isEmbeddedPreview"
    class="admin-context-banner"
    :class="`mode-${user.adminContext.mode}`"
  >
    <div class="admin-context-copy">
      <strong>{{ modeTitle }}</strong>
      <span>{{ subjectLabel }}</span>
      <span class="admin-context-countdown">{{ countdownLabel }}</span>
    </div>
    <BButton size="small" :disabled="ending" @click="endContext">
      {{ t('guest.adminContextExit') }}
    </BButton>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import userApi from '@/api/userApi.ts';
  import useUserStore from '@/store/useUser.ts';
  import { ADMIN_LOGIN_PREVIEW_FRAME_NAME, clearAdminLoginPreview } from '@/utils/authStorage.ts';

  const { t } = useI18n();
  const user = useUserStore();
  const now = ref(Date.now());
  const ending = ref(false);
  let timer: number | null = null;
  const isEmbeddedPreview =
    typeof window !== 'undefined' && window.name === ADMIN_LOGIN_PREVIEW_FRAME_NAME;

  const modeTitle = computed(() =>
    user.adminContext?.mode === 'maintain'
      ? t('guest.adminContextMaintain')
      : t('guest.adminContextReadonly'),
  );
  const subjectLabel = computed(() =>
    t('guest.adminContextSubject', {
      name: user.adminContext?.subjectAlias || user.adminContext?.subjectUserId || '-',
    }),
  );
  const secondsLeft = computed(() =>
    Math.max(0, Math.ceil((new Date(user.adminContext?.expiresAt || 0).getTime() - now.value) / 1000)),
  );
  const countdownLabel = computed(() => {
    const minutes = Math.floor(secondsLeft.value / 60);
    const seconds = secondsLeft.value % 60;
    return t('guest.adminContextRemaining', {
      time: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
    });
  });

  async function endContext() {
    if (ending.value) return;
    ending.value = true;
    try {
      await userApi.endAdminContext();
    } catch {
      // 服务端已过期时也允许本地安全退出。
    } finally {
      clearAdminLoginPreview();
      window.parent?.postMessage({ type: 'light-note:admin-context-closed' }, window.location.origin);
      message.success(t('guest.adminContextEnded'));
      ending.value = false;
    }
  }

  function handleExpired(event: Event) {
    const msg = (event as CustomEvent<{ msg?: string }>).detail?.msg;
    message.warning(msg || t('guest.adminContextExpired'));
    window.parent?.postMessage({ type: 'light-note:admin-context-closed' }, window.location.origin);
  }

  onMounted(() => {
    if (isEmbeddedPreview) return;
    timer = window.setInterval(() => (now.value = Date.now()), 1000);
    window.addEventListener('light-note:admin-context-expired', handleExpired);
  });
  onBeforeUnmount(() => {
    if (timer !== null) window.clearInterval(timer);
    window.removeEventListener('light-note:admin-context-expired', handleExpired);
  });
</script>

<style scoped lang="less">
  .admin-context-banner {
    position: fixed;
    top: 8px;
    left: 50%;
    z-index: 990;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 16px;
    max-width: calc(100vw - 32px);
    padding: 8px 10px 8px 14px;
    border: 1px solid rgba(97, 92, 237, 0.35);
    border-radius: 10px;
    background: color-mix(in srgb, var(--background-color) 94%, #615ced 6%);
    color: var(--text-color);
    box-shadow: 0 8px 28px rgba(17, 24, 39, 0.16);
  }
  .mode-maintain {
    border-color: rgba(245, 158, 11, 0.55);
    background: color-mix(in srgb, var(--background-color) 92%, #f59e0b 8%);
  }
  .admin-context-copy {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    font-size: 13px;
    white-space: nowrap;
  }
  .admin-context-countdown {
    color: var(--desc-color);
    font-variant-numeric: tabular-nums;
  }
  @media (max-width: 768px) {
    .admin-context-banner {
      top: 6px;
      width: calc(100vw - 20px);
      justify-content: space-between;
    }
    .admin-context-copy {
      gap: 4px;
      align-items: flex-start;
      flex-direction: column;
      white-space: normal;
    }
  }
</style>
