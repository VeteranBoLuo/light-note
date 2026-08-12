<template>
  <BModal
    v-if="!isMobileLayout"
    v-model:visible="visible"
    :title="t('communityChat.profile.title')"
    width="min(560px, 92vw)"
    :height="contentView === 'edit' ? 'min(82dvh, 840px)' : 'auto'"
    :show-footer="false"
    :content-class="
      ['chat-user-profile-modal__content', contentView === 'edit' ? 'chat-user-profile-modal__content--editing' : '']
        .filter(Boolean)
        .join(' ')
    "
  >
    <ChatUserProfileContent v-bind="contentProps" v-on="contentListeners" />
  </BModal>

  <BDrawer
    v-else
    :open="visible"
    :title="t('communityChat.profile.title')"
    placement="bottom"
    height="min(86dvh, 780px)"
    body-padding="14px 16px calc(16px + env(safe-area-inset-bottom))"
    mobile-centered-header
    @close="visible = false"
  >
    <div class="chat-user-profile-drawer__content" :class="{ 'is-editing': contentView === 'edit' }">
      <ChatUserProfileContent v-bind="contentProps" v-on="contentListeners" />
    </div>
  </BDrawer>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type {
    CommunityChatAuthorProfile,
    CommunityChatOwnProfile,
    CommunityChatPublicAchievement,
  } from '@/api/communityChatApi';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import ChatUserProfileContent from '@/components/communityChat/ChatUserProfileContent.vue';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import type { CommunityChatProfileUpdateInput } from '@/composables/useCommunityChatProfile';

  const props = withDefaults(
    defineProps<{
      profile?: CommunityChatAuthorProfile | null;
      loading?: boolean;
      error?: boolean;
      authenticated?: boolean;
      isOwn?: boolean;
      ownProfile?: CommunityChatOwnProfile | null;
      ownLoading?: boolean;
      ownError?: boolean;
      saving?: boolean;
      allAchievements?: CommunityChatPublicAchievement[] | null;
      allAchievementsLoading?: boolean;
      allAchievementsError?: boolean;
      sessionKey?: number;
    }>(),
    {
      profile: null,
      loading: false,
      error: false,
      authenticated: false,
      isOwn: false,
      ownProfile: null,
      ownLoading: false,
      ownError: false,
      saving: false,
      allAchievements: null,
      allAchievementsLoading: false,
      allAchievementsError: false,
      sessionKey: 0,
    },
  );

  const emit = defineEmits<{
    retry: [];
    requestOwn: [];
    loadAllAchievements: [];
    save: [input: CommunityChatProfileUpdateInput];
    block: [];
    report: [];
    login: [];
  }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();
  const isMobileLayout = useMobileLayout();
  const contentView = ref<'summary' | 'achievements' | 'preview' | 'edit'>('summary');

  const contentProps = computed(() => ({
    profile: props.profile,
    loading: props.loading,
    error: props.error,
    authenticated: props.authenticated,
    isOwn: props.isOwn,
    ownProfile: props.ownProfile,
    ownLoading: props.ownLoading,
    ownError: props.ownError,
    saving: props.saving,
    allAchievements: props.allAchievements,
    allAchievementsLoading: props.allAchievementsLoading,
    allAchievementsError: props.allAchievementsError,
    sessionKey: props.sessionKey,
  }));

  const contentListeners = {
    retry: () => emit('retry'),
    requestOwn: () => emit('requestOwn'),
    loadAllAchievements: () => emit('loadAllAchievements'),
    save: (input: CommunityChatProfileUpdateInput) => emit('save', input),
    block: () => emit('block'),
    report: () => emit('report'),
    login: () => emit('login'),
    viewChange: (view: 'summary' | 'achievements' | 'preview' | 'edit') => {
      contentView.value = view;
    },
  };
</script>

<style lang="less">
  .chat-user-profile-modal__content {
    max-height: min(72vh, 720px);
    overflow-y: auto;
  }

  .chat-user-profile-modal__content--editing {
    max-height: none;
    overflow: hidden;
  }

  .chat-user-profile-drawer__content.is-editing {
    height: 100%;
    min-height: 0;
  }

  .chat-user-profile-drawer__content.is-editing > .chat-profile-content {
    height: 100%;
    min-height: 0;
  }
</style>
