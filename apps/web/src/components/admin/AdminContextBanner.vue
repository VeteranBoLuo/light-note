<template>
  <div v-if="user.adminContext && mobile" class="admin-preview-rail">
    <BButton
      class="admin-preview-rail__exit"
      :aria-label="t('guest.adminContextExit')"
      :disabled="ending"
      :aria-busy="ending || undefined"
      @click="endContext"
    >
      <SvgIcon :src="icon.navigation.exit" size="18" aria-hidden="true" />
      <span>{{ t('guest.adminContextExit') }}</span>
    </BButton>
    <div class="admin-preview-rail__subject" :title="subjectLabel">{{ subjectName }}</div>
    <div
      class="admin-preview-rail__status"
      :class="`mode-${user.adminContext.mode}`"
      :aria-label="`${modeTitle}，${countdownLabel}`"
    >
      <strong>{{ modeShortTitle }}</strong>
      <span>{{ countdownTime }}</span>
    </div>
  </div>
  <div v-else-if="user.adminContext" class="admin-context-banner" :class="`mode-${user.adminContext.mode}`">
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
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import userApi from '@/api/userApi.ts';
  import useUserStore from '@/store/useUser.ts';
  import { clearAdminLoginPreview, getAdminLoginPreviewReturnUrl } from '@/utils/authStorage.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  defineProps<{ mobile?: boolean }>();

  const { t } = useI18n();
  const user = useUserStore();
  const now = ref(Date.now());
  const ending = ref(false);
  let timer: number | null = null;
  let leaving = false;

  const modeTitle = computed(() =>
    user.adminContext?.mode === 'maintain' ? t('guest.adminContextMaintain') : t('guest.adminContextReadonly'),
  );
  const modeShortTitle = computed(() =>
    user.adminContext?.mode === 'maintain' ? t('guest.adminContextMaintainShort') : t('guest.adminContextReadonlyShort'),
  );
  const subjectName = computed(() => user.adminContext?.subjectAlias || user.adminContext?.subjectUserId || '-');
  const subjectLabel = computed(() =>
    t('guest.adminContextSubject', {
      name: subjectName.value,
    }),
  );
  const secondsLeft = computed(() =>
    Math.max(0, Math.ceil((new Date(user.adminContext?.expiresAt || 0).getTime() - now.value) / 1000)),
  );
  const countdownTime = computed(() => {
    const minutes = Math.floor(secondsLeft.value / 60);
    const seconds = secondsLeft.value % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  });
  const countdownLabel = computed(() => t('guest.adminContextRemaining', { time: countdownTime.value }));

  async function endContext() {
    if (ending.value || leaving) return;
    ending.value = true;
    const returnTo = getAdminLoginPreviewReturnUrl();
    try {
      await userApi.endAdminContext();
    } catch {
      // 服务端已过期时也允许本地安全退出。
    } finally {
      clearAdminLoginPreview();
      message.success(t('guest.adminContextEnded'));
      leavePreview(returnTo);
    }
  }

  function leavePreview(returnTo: string) {
    if (leaving) return;
    leaving = true;
    window.location.replace(returnTo);
  }

  onMounted(() => {
    timer = window.setInterval(() => (now.value = Date.now()), 1000);
  });
  watch(secondsLeft, (value, previous) => {
    if (value !== 0 || previous === 0 || leaving) return;
    const returnTo = getAdminLoginPreviewReturnUrl();
    clearAdminLoginPreview();
    message.warning(t('guest.adminContextExpired'));
    leavePreview(returnTo);
  });
  onBeforeUnmount(() => {
    if (timer !== null) window.clearInterval(timer);
  });
</script>

<style scoped lang="less">
  .admin-preview-rail {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    flex: 0 0 auto;
    gap: 6px;
    width: 100%;
    min-height: calc(52px + env(safe-area-inset-top));
    padding: env(safe-area-inset-top) 8px 0;
    box-sizing: border-box;
    border-bottom: 1px solid var(--border-color);
    background: var(--card-background);
    color: var(--text-color);
  }
  .admin-preview-rail__exit.b_btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 44px;
    height: 44px;
    padding: 0 6px;
    background: transparent;
    color: var(--text-color);
    font-size: 12px;
  }
  @media (hover: hover) and (pointer: fine) {
    .admin-preview-rail__exit.b_btn:hover {
      background: var(--hover-background);
    }
  }
  .admin-preview-rail__subject {
    min-width: 0;
    overflow: hidden;
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .admin-preview-rail__status {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 28px;
    padding: 0 7px;
    border: 1px solid var(--workspace-purple-text);
    border-radius: 999px;
    color: var(--workspace-purple-text);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .admin-preview-rail__status.mode-maintain {
    border-color: var(--warning-color);
    background: transparent;
    color: var(--warning-color);
  }

  .admin-context-banner {
    position: fixed;
    top: 8px;
    right: clamp(260px, 18vw, 360px);
    z-index: 200;
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
  @media (min-width: 768px) and (max-width: 1399px) {
    .admin-context-banner {
      top: 66px;
      right: 16px;
    }
  }
  @media (max-width: 768px) {
    .admin-context-banner {
      top: 6px;
      right: auto;
      left: 10px;
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
