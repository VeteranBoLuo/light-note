<template>
  <transition name="scale-suggestion-slide">
    <section
      v-if="visible"
      class="scale-suggestion"
      role="dialog"
      aria-modal="false"
      :aria-labelledby="titleId"
    >
      <span class="scale-suggestion__icon" aria-hidden="true">
        <SvgIcon :src="icon.navigation.system" size="22" />
      </span>
      <div class="scale-suggestion__copy">
        <strong :id="titleId">{{ t('uiScaleSuggestion.title') }}</strong>
        <span>{{ t('uiScaleSuggestion.description') }}</span>
      </div>
      <div class="scale-suggestion__actions">
        <BButton class="scale-suggestion__keep" :disabled="saving" @click="keepCurrentScale">
          {{ t('uiScaleSuggestion.keep') }}
        </BButton>
        <BButton type="primary" :loading="saving" @click="useCompactScale">
          {{ t('uiScaleSuggestion.apply') }}
        </BButton>
      </div>
      <BButton class="scale-suggestion__close" :aria-label="t('common.close')" @click="keepCurrentScale">
        <SvgIcon :src="icon.common.close" size="15" />
      </BButton>
    </section>
  </transition>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useRoute } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, useUserStore } from '@/store';
  import { updatePreference } from '@/utils/savePreference';
  import { shouldSuggestCompactScale } from '@/utils/uiScaleSuggestion';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon.ts';

  const SUGGESTION_VERSION = 'v1';
  const SHOW_DELAY = 800;
  const titleId = 'display-scale-suggestion-title';
  const route = useRoute();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const visible = ref(false);
  const saving = ref(false);
  let showTimer = 0;
  let activeUserId = '';
  let dismissedInSession = false;

  function storageKey() {
    return `ln_ui_scale_suggestion_${SUGGESTION_VERSION}:${user.id}`;
  }

  function hasDismissedSuggestion() {
    if (!user.id) return false;
    if (dismissedInSession) return true;
    try {
      return localStorage.getItem(storageKey()) === 'done';
    } catch {
      return false;
    }
  }

  function markSuggestionDone() {
    if (!user.id) return;
    dismissedInSession = true;
    try {
      localStorage.setItem(storageKey(), 'done');
    } catch {
      /* 隐私模式下无法持久化时，仅在当前会话关闭提示 */
    }
  }

  function canShowSuggestion() {
    if (activeUserId !== user.id) {
      activeUserId = user.id;
      dismissedInSession = false;
    }
    return shouldSuggestCompactScale({
      viewportWidth: window.innerWidth,
      routeName: String(route.name || ''),
      uiScale: user.preferences.uiScale,
      isRegistered: Boolean(user.id) && user.role !== 'visitor',
      isMobile: bookmark.isMobile,
      isAdminPreview: user.adminPreview,
      hasFinePointer: window.matchMedia?.('(pointer: fine)')?.matches ?? true,
      dismissed: hasDismissedSuggestion(),
    });
  }

  function scheduleSuggestion() {
    window.clearTimeout(showTimer);
    if (!canShowSuggestion()) {
      visible.value = false;
      return;
    }
    showTimer = window.setTimeout(() => {
      if (canShowSuggestion()) visible.value = true;
    }, SHOW_DELAY);
  }

  function keepCurrentScale() {
    markSuggestionDone();
    visible.value = false;
  }

  async function useCompactScale() {
    if (saving.value) return;
    saving.value = true;
    try {
      await updatePreference({ uiScale: 'small' });
      markSuggestionDone();
      visible.value = false;
      message.success(t('uiScaleSuggestion.applied'));
    } catch (error) {
      console.error('应用小号界面失败：', error);
      message.error(t('uiScaleSuggestion.applyFailed'));
    } finally {
      saving.value = false;
    }
  }

  watch(
    () => [
      route.name,
      user.id,
      user.role,
      user.adminPreview,
      user.preferences.uiScale,
      bookmark.isMobile,
    ],
    scheduleSuggestion,
  );

  onMounted(() => {
    window.addEventListener('resize', scheduleSuggestion);
    scheduleSuggestion();
  });

  onBeforeUnmount(() => {
    window.clearTimeout(showTimer);
    window.removeEventListener('resize', scheduleSuggestion);
  });
</script>

<style scoped lang="less">
  .scale-suggestion {
    position: fixed;
    left: 50%;
    bottom: 22px;
    z-index: 400;
    width: min(820px, calc(100% - 40px));
    min-height: 74px;
    transform: translateX(-50%);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 12px 46px 12px 14px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--card-border-color));
    border-radius: 16px;
    background: color-mix(in srgb, var(--card-background, var(--background-color)) 96%, var(--primary-color));
    box-shadow: 0 18px 48px -22px rgba(25, 25, 55, 0.48);
    color: var(--text-color);
  }

  .scale-suggestion__icon {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, transparent);
  }

  .scale-suggestion__copy {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong {
      font-size: 14px;
      line-height: 1.45;
    }

    span {
      color: var(--desc-color);
      font-size: 12px;
      line-height: 1.5;
    }
  }

  .scale-suggestion__actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .scale-suggestion__actions :deep(.b_btn) {
    height: 34px;
    border-radius: 9px;
  }

  .scale-suggestion__keep {
    color: var(--desc-color);
  }

  .scale-suggestion__close {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 8px;
    color: var(--desc-color);
    background: transparent;
  }

  .scale-suggestion-slide-enter-active,
  .scale-suggestion-slide-leave-active {
    transition:
      transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.22s ease;
  }

  .scale-suggestion-slide-enter-from,
  .scale-suggestion-slide-leave-to {
    transform: translate(-50%, 120%);
    opacity: 0;
  }

  @media (max-width: 1080px) {
    .scale-suggestion {
      display: none;
    }
  }
</style>
