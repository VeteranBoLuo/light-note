<template>
  <div class="community-chat-page is-workspace">
    <section
      v-if="bootstrapLoading"
      class="community-chat-bootstrap"
      :aria-label="t('communityChat.bootstrapLoading')"
      aria-busy="true"
    >
      <div class="community-chat-bootstrap__conversation" aria-hidden="true">
        <span class="community-chat-bootstrap__header"></span>
        <div class="community-chat-bootstrap__messages">
          <span v-for="index in 4" :key="index" :class="{ 'is-own': index % 3 === 0 }"></span>
        </div>
        <span class="community-chat-bootstrap__composer"></span>
      </div>
    </section>

    <CommunityChatWorkspace
      v-else-if="messagingReady && access"
      :access="access"
      :rooms="serverRooms"
      @room-read="handleRoomRead"
      @access-invalidated="loadDirectory({ background: true })"
    />

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
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    getCommunityChatRooms,
    type CommunityChatAccess,
    type CommunityChatRoom,
    type CommunityChatRoomDirectory,
  } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useCommunityChatUnread } from '@/composables/useCommunityChatUnread';
  import icon from '@/config/icon';
  import { useUserStore } from '@/store';
  import CommunityChatWorkspace from './CommunityChatWorkspace.vue';

  const { t } = useI18n();
  const user = useUserStore();
  const access = ref<CommunityChatAccess | null>(null);
  const serverRooms = ref<CommunityChatRoom[]>([]);
  const directoryMessagingEnabled = ref(false);
  const bootstrapLoading = ref(true);
  const communityUnread = useCommunityChatUnread();
  let directoryRefreshTimer: number | undefined;

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
    if (!background) bootstrapLoading.value = true;
    try {
      const response = await getCommunityChatRooms();
      const directory = response.data as CommunityChatRoomDirectory;
      access.value = directory?.access || null;
      serverRooms.value = directory?.items || [];
      directoryMessagingEnabled.value = Boolean(directory?.messagingEnabled);
      communityUnread.syncDirectory(directory);
    } catch {
      if (!background) {
        access.value = null;
        serverRooms.value = [];
        directoryMessagingEnabled.value = false;
        communityUnread.reset();
      }
    } finally {
      if (!background) bootstrapLoading.value = false;
    }
  }

  function handleRoomRead(roomSlug: string) {
    serverRooms.value = serverRooms.value.map((room) => (room.slug === roomSlug ? { ...room, unreadCount: 0 } : room));
  }

  onMounted(() => {
    void loadDirectory();
    directoryRefreshTimer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && messagingReady.value) {
        void loadDirectory({ background: true });
      }
    }, 8_000);
  });

  watch(
    () => [user.id, user.role],
    (_next, previous) => {
      if (previous) void loadDirectory();
    },
  );

  onBeforeUnmount(() => {
    if (directoryRefreshTimer !== undefined) window.clearInterval(directoryRefreshTimer);
  });
</script>

<style scoped lang="less">
  .community-chat-page {
    width: 100%;
    height: 100%;
    overflow: hidden;
    color: var(--text-color);
    background: var(--surface-page-bg, var(--background-color));
  }

  .community-chat-page.is-workspace {
    padding: 18px;
    box-sizing: border-box;
  }

  .community-chat-page > :is(.community-workspace, .community-chat-bootstrap, .community-chat-unavailable) {
    width: 100%;
    max-width: 1080px;
    margin: 0 auto;
  }

  .community-chat-bootstrap {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--card-background);
  }

  .community-chat-bootstrap__header,
  .community-chat-bootstrap__messages > span,
  .community-chat-bootstrap__composer {
    display: block;
    border: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
    animation: community-bootstrap-pulse 1.25s ease-in-out infinite alternate;
  }

  .community-chat-bootstrap__conversation {
    min-width: 0;
    min-height: 0;
    padding: 12px 18px;
    display: grid;
    grid-template-rows: 52px minmax(0, 1fr) 72px;
    gap: 16px;
  }

  .community-chat-bootstrap__header,
  .community-chat-bootstrap__composer {
    border-radius: 13px;
  }

  .community-chat-bootstrap__messages {
    padding: 12px;
    display: grid;
    align-content: start;
    gap: 18px;
  }

  .community-chat-bootstrap__messages > span {
    width: min(440px, 70%);
    height: 70px;
    border-radius: 16px;
  }

  .community-chat-bootstrap__messages > span.is-own {
    justify-self: end;
  }

  .community-chat-unavailable {
    height: 100%;
    min-height: 320px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--card-background);
    text-align: center;
  }

  .community-chat-unavailable__icon {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 16px;
    color: var(--primary-color);
  }

  .community-chat-unavailable h1 {
    margin: 4px 0 0;
    color: var(--text-color);
    font-size: 20px;
  }

  .community-chat-unavailable p {
    max-width: 480px;
    margin: 0 18px 6px;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.7;
  }

  @keyframes community-bootstrap-pulse {
    from {
      opacity: 0.48;
    }
    to {
      opacity: 0.88;
    }
  }

  @media (max-width: 767px) {
    .community-chat-page.is-workspace {
      padding: 0;
    }

    .community-chat-bootstrap,
    .community-chat-unavailable {
      border: 0;
      border-radius: 0;
    }

    .community-chat-bootstrap {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, 1fr);
    }

    .community-chat-bootstrap__conversation {
      padding: 10px 12px;
      grid-template-rows: 52px minmax(0, 1fr) 72px;
      gap: 10px;
    }

    .community-chat-bootstrap__messages {
      padding-inline: 2px;
    }

    .community-chat-bootstrap__messages > span {
      width: 82%;
    }

    .community-chat-unavailable {
      min-height: 100%;
    }

    .community-chat-unavailable .b_btn {
      min-height: 42px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .community-chat-bootstrap__header,
    .community-chat-bootstrap__messages > span,
    .community-chat-bootstrap__composer {
      animation: none;
    }
  }
</style>
