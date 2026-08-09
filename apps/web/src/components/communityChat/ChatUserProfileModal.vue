<template>
  <BModal
    v-model:visible="visible"
    :title="t('communityChat.profile.title')"
    width="min(480px, 92vw)"
    :show-footer="false"
  >
    <div class="chat-user-profile">
      <div v-if="loading" class="chat-user-profile__state">
        <BLoading inline loading :title="t('communityChat.profile.loading')" />
      </div>

      <div v-else-if="error || !profile" class="chat-user-profile__state" role="status">
        <span class="chat-user-profile__state-icon" aria-hidden="true">
          <SvgIcon :src="icon.message.info" size="20" />
        </span>
        <strong>{{ t('communityChat.profile.loadFailed') }}</strong>
        <span>{{ t('communityChat.profile.loadFailedDescription') }}</span>
        <BButton size="small" @click="emit('retry')">{{ t('communityChat.profile.retry') }}</BButton>
      </div>

      <template v-else>
        <header class="chat-user-profile__identity">
          <span class="chat-user-profile__avatar" aria-hidden="true">
            <AvatarFramePreview
              v-if="validFrameId"
              :frame-id="validFrameId"
              :src="profile.avatar || icon.navigation.user"
              :size="68"
            />
            <SvgIcon
              v-else
              class="chat-user-profile__avatar-image"
              :src="profile.avatar || icon.navigation.user"
              size="68"
            />
          </span>
          <span class="chat-user-profile__identity-copy">
            <strong>{{ profile.name || t('communityChat.memberFallback') }}</strong>
            <span class="chat-user-profile__identity-tags">
              <span class="chat-user-profile__level">Lv.{{ profile.level }} {{ profile.levelName }}</span>
              <span v-if="profile.role !== 'member'" class="chat-user-profile__role">
                {{ t(`communityChat.authorRole.${profile.role}`) }}
              </span>
            </span>
            <small v-if="profile.title">{{ profile.title }}</small>
          </span>
        </header>

        <section class="chat-user-profile__achievements" :aria-label="t('communityChat.profile.achievements')">
          <div class="chat-user-profile__section-heading">
            <span>
              <SvgIcon :src="icon.userCenter.growth" size="17" aria-hidden="true" />
              <strong>{{ t('communityChat.profile.achievements') }}</strong>
            </span>
            <small>{{ t('communityChat.profile.achievementCount', { count: profile.achievementCount }) }}</small>
          </div>

          <div v-if="profile.achievements.length" class="chat-user-profile__achievement-list">
            <span
              v-for="achievement in profile.achievements"
              :key="achievement.key"
              class="chat-user-profile__achievement"
            >
              <span aria-hidden="true">
                <SvgIcon :src="achievementIcon(achievement.group)" size="16" />
              </span>
              <span>
                <strong>{{ achievementName(achievement.key) }}</strong>
                <small>{{ achievementGroupName(achievement.group) }}</small>
              </span>
            </span>
          </div>
          <div v-else class="chat-user-profile__empty">
            <SvgIcon :src="icon.growth.level" size="20" aria-hidden="true" />
            <span>{{ t('communityChat.profile.noAchievements') }}</span>
          </div>
        </section>

        <p class="chat-user-profile__privacy">
          <SvgIcon :src="icon.growth.lock" size="14" aria-hidden="true" />
          <span>{{ t('communityChat.profile.privacy') }}</span>
        </p>
      </template>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatAuthorProfile } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import icon from '@/config/icon';
  import { frameVariant } from '@/config/growthFrames';

  const props = withDefaults(
    defineProps<{
      profile?: CommunityChatAuthorProfile | null;
      loading?: boolean;
      error?: boolean;
    }>(),
    {
      profile: null,
      loading: false,
      error: false,
    },
  );
  const emit = defineEmits<{ retry: [] }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t, te } = useI18n();

  const validFrameId = computed(() =>
    props.profile?.frameId && frameVariant(props.profile.frameId) ? props.profile.frameId : null,
  );

  const achievementIcons: Record<string, string> = {
    checkin: icon.growth.checkin,
    create: icon.growth.create,
    action: icon.growth.action,
    organize: icon.growth.organize,
    level: icon.growth.level,
    tenure: icon.growth.tenure,
  };

  function achievementIcon(group: string) {
    return achievementIcons[group] || icon.growth.reward;
  }

  function achievementName(key: string) {
    const i18nKey = `growth.achName.${key}`;
    return te(i18nKey) ? t(i18nKey) : key;
  }

  function achievementGroupName(group: string) {
    const i18nKey = `growth.achGroup.${group}`;
    return te(i18nKey) ? t(i18nKey) : group;
  }
</script>

<style scoped lang="less">
  .chat-user-profile {
    min-height: 220px;
    display: grid;
    gap: 18px;
    color: var(--text-color);
  }

  .chat-user-profile__state {
    min-height: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    color: var(--desc-color);
    text-align: center;
  }

  .chat-user-profile__state strong {
    color: var(--text-color);
    font-size: 14px;
  }

  .chat-user-profile__state > span:not(.chat-user-profile__state-icon) {
    max-width: 320px;
    font-size: 12px;
    line-height: 1.6;
  }

  .chat-user-profile__state-icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    color: var(--primary-color);
  }

  .chat-user-profile__identity {
    min-width: 0;
    padding: 14px;
    display: flex;
    align-items: center;
    gap: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--workspace-panel-bg-color);
  }

  .chat-user-profile__avatar {
    width: 74px;
    height: 74px;
    flex: 0 0 74px;
    display: grid;
    place-items: center;
  }

  .chat-user-profile__avatar-image {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    background: var(--card-background);
  }

  .chat-user-profile__avatar-image :deep(img),
  .chat-user-profile__avatar-image :deep(.icon-base64),
  .chat-user-profile__avatar-image :deep(.icon-fixed-base64) {
    width: 100% !important;
    height: 100% !important;
    border-radius: inherit;
    object-fit: cover;
  }

  .chat-user-profile__identity-copy {
    min-width: 0;
    display: grid;
    gap: 7px;
  }

  .chat-user-profile__identity-copy > strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-user-profile__identity-copy > small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .chat-user-profile__identity-tags {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chat-user-profile__level,
  .chat-user-profile__role {
    min-height: 22px;
    padding: 2px 8px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--card-background);
    font-size: 10px;
    font-weight: 700;
  }

  .chat-user-profile__role {
    border-color: var(--surface-border-color);
    color: var(--desc-color);
  }

  .chat-user-profile__achievements {
    min-width: 0;
    display: grid;
    gap: 10px;
  }

  .chat-user-profile__section-heading,
  .chat-user-profile__section-heading > span {
    display: flex;
    align-items: center;
  }

  .chat-user-profile__section-heading {
    justify-content: space-between;
    gap: 12px;
  }

  .chat-user-profile__section-heading > span {
    gap: 7px;
    color: var(--primary-color);
  }

  .chat-user-profile__section-heading strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .chat-user-profile__section-heading small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .chat-user-profile__achievement-list {
    max-height: min(300px, 38vh);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    overflow-y: auto;
  }

  .chat-user-profile__achievement {
    min-width: 0;
    min-height: 48px;
    padding: 7px 9px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .chat-user-profile__achievement > span:first-child {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    color: var(--primary-color);
  }

  .chat-user-profile__achievement > span:last-child {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .chat-user-profile__achievement strong,
  .chat-user-profile__achievement small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-user-profile__achievement strong {
    color: var(--text-color);
    font-size: 11px;
  }

  .chat-user-profile__achievement small {
    color: var(--desc-color);
    font-size: 9px;
  }

  .chat-user-profile__empty {
    min-height: 78px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 6px;
    border: 1px dashed var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .chat-user-profile__privacy {
    margin: 0;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.6;
  }

  .chat-user-profile__privacy :deep(.svg-icon) {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  @media (max-width: 520px) {
    .chat-user-profile__identity {
      padding: 12px;
    }

    .chat-user-profile__achievement-list {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  :global(html.light-note-mobile-rendering) .chat-user-profile__identity,
  :global(html.light-note-mobile-rendering) .chat-user-profile__achievement,
  :global(html.light-note-mobile-rendering) .chat-user-profile__level {
    box-shadow: none;
  }
</style>
