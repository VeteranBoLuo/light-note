<template>
  <section class="community-notification-settings" :class="{ 'is-compact': compact }">
    <div class="community-notification-settings__head">
      <div>
        <strong>{{ t('communityChat.notifications.title') }}</strong>
        <span>{{ t('communityChat.notifications.description') }}</span>
      </div>
      <BSwitch
        :checked="settings.enabled"
        :disabled="loading || saving || Boolean(error)"
        :aria-label="t('communityChat.notifications.masterSwitch')"
        @change="changeEnabled"
      />
    </div>

    <div v-if="loading" class="community-notification-settings__state" role="status">
      <BLoading inline loading :title="t('communityChat.notifications.loading')" />
    </div>
    <div v-else-if="error" class="community-notification-settings__state is-error" role="status">
      <span>{{ t('communityChat.notifications.loadFailed') }}</span>
      <BButton size="small" @click="loadSettings">{{ t('communityChat.notifications.retry') }}</BButton>
    </div>
    <template v-else>
      <div
        class="community-notification-settings__rail"
        :class="{ 'is-disabled': !settings.enabled || saving }"
        role="radiogroup"
        :aria-label="t('communityChat.notifications.levelLabel')"
      >
        <BButton
          v-for="option in levelOptions"
          :key="option.value"
          class="community-notification-settings__option"
          :class="{ 'is-current': settings.level === option.value }"
          :disabled="!settings.enabled || saving"
          role="radio"
          :aria-checked="settings.level === option.value"
          @click="changeLevel(option.value)"
        >
          <span class="community-notification-settings__dot" aria-hidden="true"></span>
          <span>{{ option.label }}</span>
        </BButton>
      </div>

      <div class="community-notification-settings__explanation" aria-live="polite">
        <strong>{{ currentExplanationLabel }}</strong>
        <span>{{ currentExplanationDescription }}</span>
      </div>

      <div class="community-notification-settings__channels">
        <span :class="{ 'is-active': settings.enabled }">
          <i aria-hidden="true"></i>{{ t('communityChat.notifications.inAppChannel') }}
        </span>
        <span> <i aria-hidden="true"></i>{{ t('communityChat.notifications.appChannelLater') }} </span>
      </div>
      <p class="community-notification-settings__hint">
        {{ t('communityChat.notifications.visibilityHint') }}
      </p>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    getCommunityChatNotificationSettings,
    updateCommunityChatNotificationSettings,
    type CommunityChatNotificationLevel,
    type CommunityChatNotificationSettings,
  } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import { useCommunityChatUnread } from '@/composables/useCommunityChatUnread';
  import { useNotification } from '@/composables/useNotification';

  withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });
  const emit = defineEmits<{ saved: [settings: CommunityChatNotificationSettings] }>();
  const { t } = useI18n();
  const communityUnread = useCommunityChatUnread();
  const { refreshUnread } = useNotification();

  const DEFAULT_SETTINGS: CommunityChatNotificationSettings = {
    enabled: true,
    level: 'mentions',
    defaultEnabled: true,
    replyCountsAsMention: true,
    channels: {
      inApp: { available: true, enabled: true },
      browser: { available: false, enabled: false },
      android: { available: false, enabled: false },
    },
  };
  const settings = ref<CommunityChatNotificationSettings>({ ...DEFAULT_SETTINGS });
  const loading = ref(true);
  const saving = ref(false);
  const error = ref(false);
  let loadGeneration = 0;

  const levelOptions = computed(() => [
    {
      value: 'official' as const,
      label: t('communityChat.notifications.levelOfficial'),
      description: t('communityChat.notifications.levelOfficialDescription'),
    },
    {
      value: 'mentions_only' as const,
      label: t('communityChat.notifications.levelMentionsOnly'),
      description: t('communityChat.notifications.levelMentionsOnlyDescription'),
    },
    {
      value: 'mentions' as const,
      label: t('communityChat.notifications.levelMentions'),
      description: t('communityChat.notifications.levelMentionsDescription'),
    },
    {
      value: 'all' as const,
      label: t('communityChat.notifications.levelAll'),
      description: t('communityChat.notifications.levelAllDescription'),
    },
  ]);
  const activeLevelIndex = computed(() =>
    Math.max(
      0,
      levelOptions.value.findIndex((item) => item.value === settings.value.level),
    ),
  );
  const currentLevel = computed(
    () => levelOptions.value[activeLevelIndex.value] || levelOptions.value.find((item) => item.value === 'mentions')!,
  );
  const currentLevelLabel = computed(() => currentLevel.value.label);
  const currentLevelDescription = computed(() => currentLevel.value.description);
  const currentExplanationLabel = computed(() =>
    settings.value.enabled ? currentLevelLabel.value : t('communityChat.notifications.disabledLabel'),
  );
  const currentExplanationDescription = computed(() =>
    settings.value.enabled ? currentLevelDescription.value : t('communityChat.notifications.disabledDescription'),
  );

  function normalizeSettings(value: Partial<CommunityChatNotificationSettings> | null | undefined) {
    const level: CommunityChatNotificationLevel = ['official', 'mentions_only', 'mentions', 'all'].includes(
      String(value?.level),
    )
      ? (value?.level as CommunityChatNotificationLevel)
      : 'mentions';
    const enabled = value?.enabled === undefined ? true : value.enabled === true;
    return {
      ...DEFAULT_SETTINGS,
      ...value,
      enabled,
      level,
      channels: {
        ...DEFAULT_SETTINGS.channels,
        ...(value?.channels || {}),
        inApp: { available: true, enabled },
        browser: { available: false, enabled: false },
        android: { available: false, enabled: false },
      },
    } as CommunityChatNotificationSettings;
  }

  async function loadSettings() {
    const generation = ++loadGeneration;
    loading.value = true;
    error.value = false;
    try {
      const response = await getCommunityChatNotificationSettings();
      if (generation !== loadGeneration) return;
      settings.value = normalizeSettings(response.data as CommunityChatNotificationSettings);
    } catch {
      if (generation === loadGeneration) error.value = true;
    } finally {
      if (generation === loadGeneration) loading.value = false;
    }
  }

  async function save(next: { enabled: boolean; level: CommunityChatNotificationLevel }) {
    if (saving.value) return;
    const previous = settings.value;
    settings.value = normalizeSettings({ ...settings.value, ...next });
    saving.value = true;
    try {
      const response = await updateCommunityChatNotificationSettings(next);
      settings.value = normalizeSettings(response.data as CommunityChatNotificationSettings);
      emit('saved', settings.value);
      if (!settings.value.enabled) communityUnread.reset();
      await Promise.allSettled([refreshUnread(), communityUnread.refresh()]);
      message.success(t('communityChat.notifications.saved'));
    } catch (saveError: any) {
      settings.value = previous;
      message.error(saveError?.message || t('communityChat.notifications.saveFailed'));
    } finally {
      saving.value = false;
    }
  }

  function changeEnabled(enabled: boolean) {
    void save({ enabled, level: settings.value.level });
  }

  function changeLevel(level: CommunityChatNotificationLevel) {
    if (!settings.value.enabled || level === settings.value.level) return;
    void save({ enabled: true, level });
  }

  onMounted(loadSettings);
</script>

<style scoped lang="less">
  .community-notification-settings {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    display: grid;
    gap: 16px;
    color: var(--text-color);
  }

  .community-notification-settings__head {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }

  .community-notification-settings__head > div,
  .community-notification-settings__explanation {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .community-notification-settings__head strong,
  .community-notification-settings__explanation strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .community-notification-settings__head span,
  .community-notification-settings__explanation span,
  .community-notification-settings__hint {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.6;
  }

  .community-notification-settings__state {
    min-height: 112px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color);
  }

  .community-notification-settings__state.is-error {
    flex-direction: column;
    color: var(--danger-color);
    font-size: 12px;
  }

  .community-notification-settings__rail {
    min-width: 0;
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .community-notification-settings__option {
    width: 100%;
    height: auto;
    min-height: 42px;
    padding: 8px 7px;
    display: flex;
    justify-content: center;
    gap: 7px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--card-background) !important;
    font-size: 11px;
    white-space: normal;
  }

  .community-notification-settings__dot {
    width: 12px;
    height: 12px;
    box-sizing: border-box;
    border: 2px solid var(--surface-border-color);
    border-radius: 50%;
    background: var(--card-background);
    transition:
      border-color 0.18s ease,
      background 0.18s ease,
      transform 0.18s ease;
  }

  .community-notification-settings__option.is-current {
    border-color: var(--primary-color) !important;
    color: var(--primary-color);
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color)) !important;
    font-weight: 700;
  }

  .community-notification-settings__option.is-current .community-notification-settings__dot {
    border-color: var(--primary-color);
    background: var(--primary-color);
    transform: scale(1.08);
  }

  .community-notification-settings__rail.is-disabled {
    opacity: 0.48;
  }

  .community-notification-settings__explanation {
    min-height: 58px;
    padding: 10px 12px;
    box-sizing: border-box;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color));
  }

  .community-notification-settings__channels {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .community-notification-settings__channels span {
    min-height: 26px;
    padding: 3px 9px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--card-background);
    font-size: 10px;
  }

  .community-notification-settings__channels span.is-active {
    border-color: var(--success-color);
    color: var(--success-color);
  }

  .community-notification-settings__channels i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }

  .community-notification-settings__hint {
    margin: -6px 0 0;
  }

  .community-notification-settings.is-compact {
    gap: 13px;
  }

  @media (max-width: 767px) {
    .community-notification-settings__rail {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .community-notification-settings__option {
      min-height: 44px;
      font-size: 11px;
    }

    .community-notification-settings__head span {
      max-width: 260px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .community-notification-settings__dot {
      transition: none;
    }
  }
</style>
