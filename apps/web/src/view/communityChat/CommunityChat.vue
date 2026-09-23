<template>
  <div v-auto-scrollbar class="community-surface">
    <CommunityLayout
      chat
      :disabled="!feedAvailable && !preview"
      class="community-chat-page"
      :class="{ 'has-header-navigation': !preview && (bootstrapLoading || (messagingReady && access)) }"
    >
      <template #navigation>
        <CommunityNavigation v-if="preview" active="chat" />
        <CommunityFeedLink v-else @available="feedAvailable = $event" />
      </template>
      <template #aside><CommunityContext chat /></template>
      <section v-if="preview" class="community-chat-unavailable" role="status">
        <h1>{{ t('community.feed.previewChatTitle') }}</h1>
        <p>{{ t('community.feed.previewChatDescription') }}</p>
        <BButton type="primary" @click="router.push('/community/feed')">{{ t('community.feed.backFeed') }}</BButton>
      </section>
      <section
        v-else-if="bootstrapLoading"
        class="community-chat-bootstrap"
        :aria-label="t('communityChat.bootstrapLoading')"
        aria-busy="true"
      >
        <div class="community-chat-bootstrap__conversation" aria-hidden="true">
          <div class="community-chat-bootstrap__header"
            ><span class="bootstrap-icon"></span><span class="bootstrap-title"></span
          ></div>
          <div class="community-chat-bootstrap__messages">
            <ChatMessageSkeleton :label="t('communityChat.messagesLoading')" />
          </div>
          <div class="community-chat-bootstrap__composer"><span></span></div>
        </div>
      </section>

      <CommunityChatWorkspace
        v-else-if="messagingReady && access"
        :access="access"
        :rooms="serverRooms"
        @room-read="handleRoomRead"
        @access-invalidated="loadDirectory({ background: true })"
      >
        <template v-if="feedAvailable && isMobile" #header-title="{ room }">
          <CommunityNavigation active="chat" :label="room.name" />
        </template>
      </CommunityChatWorkspace>

      <section v-else class="community-chat-unavailable" role="status">
        <span class="community-chat-unavailable__icon" aria-hidden="true">
          <SvgIcon :src="icon.ai.conversations" size="26" />
        </span>
        <h1>{{ unavailableTitle }}</h1>
        <p>{{ unavailableDescription }}</p>
        <BButton type="primary" :loading="bootstrapLoading" @click="loadDirectory">
          {{ t('communityChat.retryWorkspace') }}
        </BButton>
      </section>
    </CommunityLayout>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useCommunityPreview } from '@/composables/useCommunityPreview';
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import {
    getCommunityChatRooms,
    type CommunityChatAccess,
    type CommunityChatRoom,
    type CommunityChatRoomDirectory,
  } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useCommunityChatUnread } from '@/composables/useCommunityChatUnread';
  import icon from '@/config/icon';
  import { useUserStore } from '@/store';
  import ChatMessageSkeleton from '@/components/communityChat/ChatMessageSkeleton.vue';
  import CommunityChatWorkspace from './CommunityChatWorkspace.vue';
  import CommunityNavigation from '@/components/community/CommunityNavigation.vue';
  import { knownCommunityLayout } from '@/utils/communityLayoutAvailability';
  import CommunityLayout from '@/components/community/CommunityLayout.vue';
  import CommunityContext from '@/components/community/CommunityContext.vue';
  import CommunityFeedLink from '@/components/community/CommunityFeedLink.vue';

  const { t } = useI18n();
  const isMobile = useMobileLayout();
  const user = useUserStore();
  const router = useRouter();
  const { preview, identity } = useCommunityPreview();
  const feedAvailable = ref(knownCommunityLayout(`${user.id}|${user.role}|${user.adminContext?.id || ''}`));
  const access = ref<CommunityChatAccess | null>(null);
  const serverRooms = ref<CommunityChatRoom[]>([]);
  const directoryMessagingEnabled = ref(false);
  const bootstrapLoading = ref(true);
  const communityUnread = useCommunityChatUnread();
  let directoryRefreshTimer: number | undefined;
  let lastDirectoryRefreshAt = 0;
  let directoryGeneration = 0;

  const DIRECTORY_FALLBACK_REFRESH_MS = 8_000;
  const DIRECTORY_REALTIME_SAFETY_REFRESH_MS = 60_000;

  useMobileTopBar(['communityChat'], {
    searchMode: 'icon',
  });

  const messagingReady = computed(
    () =>
      access.value?.canEnter === true &&
      access.value?.canRead === true &&
      directoryMessagingEnabled.value &&
      serverRooms.value.length > 0,
  );
  const unavailableTitle = computed(() =>
    access.value?.status === 'restricted'
      ? t('communityChat.restrictedTitle')
      : t('communityChat.workspaceUnavailableTitle'),
  );
  const unavailableDescription = computed(() =>
    access.value?.status === 'restricted'
      ? t('communityChat.restrictedDescription')
      : t('communityChat.workspaceUnavailableDescription'),
  );

  async function loadDirectory({ background = false } = {}) {
    if (preview.value) {
      directoryGeneration++;
      access.value = null;
      serverRooms.value = [];
      directoryMessagingEnabled.value = false;
      bootstrapLoading.value = false;
      return;
    }
    if (background && bootstrapLoading.value) return;
    const generation = ++directoryGeneration;
    if (!background) bootstrapLoading.value = true;
    const unreadSyncToken = communityUnread.captureDirectorySyncToken();
    try {
      const response = await getCommunityChatRooms();
      if (generation !== directoryGeneration) return;
      const directory = response.data as CommunityChatRoomDirectory;
      access.value = directory?.access || null;
      serverRooms.value = directory?.items || [];
      directoryMessagingEnabled.value = Boolean(directory?.messagingEnabled);
      communityUnread.syncDirectory(directory, unreadSyncToken);
      lastDirectoryRefreshAt = Date.now();
    } catch {
      if (generation !== directoryGeneration) return;
      if (!background) {
        access.value = null;
        serverRooms.value = [];
        directoryMessagingEnabled.value = false;
        communityUnread.reset();
      }
    } finally {
      if (generation === directoryGeneration && !background) bootstrapLoading.value = false;
    }
  }

  function handleRoomRead(roomSlug: string) {
    serverRooms.value = serverRooms.value.map((room) => (room.slug === roomSlug ? { ...room, unreadCount: 0 } : room));
  }

  onMounted(() => {
    void loadDirectory();
    directoryRefreshTimer = window.setInterval(() => {
      const refreshInterval = access.value?.realtimeEnabled
        ? DIRECTORY_REALTIME_SAFETY_REFRESH_MS
        : DIRECTORY_FALLBACK_REFRESH_MS;
      if (
        document.visibilityState === 'visible' &&
        messagingReady.value &&
        Date.now() - lastDirectoryRefreshAt >= refreshInterval
      ) {
        void loadDirectory({ background: true });
      }
    }, DIRECTORY_FALLBACK_REFRESH_MS);
  });

  watch(
    () => identity.value,
    (_next, previous) => {
      if (previous) void loadDirectory();
    },
  );

  onBeforeUnmount(() => {
    directoryGeneration++;
    if (directoryRefreshTimer !== undefined) window.clearInterval(directoryRefreshTimer);
  });
</script>

<style scoped lang="less">
  @media (max-width: 767px) {
    .community-chat-page.has-header-navigation :deep(.community-layout-nav) {
      display: none;
    }
  }
  .community-chat-page {
    --chat-header-height: var(--ui-layout-58, 58px);
    --chat-composer-height: var(--ui-layout-108, 108px);
    height: 100%;
    min-height: 0;
  }
  .community-chat-page:not(.is-disabled) :deep(.community-workspace) {
    flex: 1;
    min-height: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
  .community-chat-page:not(.is-disabled) :deep(.community-conversation-header) {
    background: var(--workspace-open-canvas);
    border-bottom: 1px solid var(--workspace-divider);
  }
  .community-chat-page:not(.is-disabled) :deep(.community-message-stream) {
    background: var(--workspace-open-canvas);
  }
  .community-chat-bootstrap {
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--card-background);
  }
  .community-chat-page:not(.is-disabled) .community-chat-bootstrap__header {
    background: var(--workspace-open-canvas);
  }
  .community-chat-page:not(.is-disabled) .community-chat-bootstrap {
    border: 0;
    border-radius: 0;
  }
  .community-chat-bootstrap__conversation {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: var(--chat-header-height) minmax(0, 1fr) var(--chat-composer-height);
  }
  .community-chat-bootstrap__header {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-7, 7px) var(--ui-space-14, 14px);
    box-sizing: border-box;
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .bootstrap-icon,
  .bootstrap-title,
  .community-chat-bootstrap__composer > span {
    display: block;
    border: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
    box-sizing: border-box;
  }
  .bootstrap-icon {
    width: var(--ui-layout-32, 32px);
    height: var(--ui-layout-32, 32px);
    border-radius: 10px;
  }
  .bootstrap-title {
    width: var(--ui-layout-180, 180px);
    height: var(--ui-layout-30, 30px);
    border-radius: 6px;
  }
  .community-chat-bootstrap__messages {
    position: relative;
    min-height: 0;
  }
  .community-chat-bootstrap__composer {
    padding: var(--ui-space-7, 7px) var(--ui-space-14, 14px) var(--ui-space-12, 12px);
    border-top: 1px solid var(--surface-divider-color);
    box-sizing: border-box;
  }
  .community-chat-bootstrap__composer > span {
    height: 100%;
    border-radius: 14px;
  }

  .community-chat-unavailable {
    height: 100%;
    min-height: var(--ui-layout-320, 320px);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--card-background);
    text-align: center;
  }

  .community-chat-unavailable__icon {
    width: var(--ui-layout-52, 52px);
    height: var(--ui-layout-52, 52px);
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 16px;
    color: var(--primary-color);
  }

  .community-chat-unavailable h1 {
    margin: var(--ui-space-4, 4px) 0 0;
    color: var(--text-color);
    font-size: var(--ui-font-20, 20px);
  }

  .community-chat-unavailable p {
    max-width: var(--ui-layout-480, 480px);
    margin: 0 var(--ui-space-18, 18px) var(--ui-space-6, 6px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.7;
  }

  @media (max-width: 767px) {
    .community-chat-page {
      --chat-header-height: 52px;
      --chat-composer-height: calc(99px + env(safe-area-inset-bottom));
    }

    .community-chat-bootstrap,
    .community-chat-unavailable {
      border: 0;
      border-radius: 0;
    }

    .community-chat-bootstrap__header {
      padding: 6px 10px;
    }
    .bootstrap-icon {
      width: 30px;
      height: 30px;
    }
    .community-chat-bootstrap__composer {
      padding: 5px 8px calc(8px + env(safe-area-inset-bottom));
    }

    .community-chat-unavailable {
      min-height: 0;
    }

    .community-chat-unavailable .b_btn {
      min-height: 42px;
    }
  }
</style>
