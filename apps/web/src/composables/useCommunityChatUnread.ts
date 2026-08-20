import { computed, readonly, ref } from 'vue';
import { getCommunityChatRooms, type CommunityChatRoom, type CommunityChatRoomDirectory } from '@/api/communityChatApi';

const rooms = ref<CommunityChatRoom[]>([]);
const loading = ref(false);
const realtimeAvailable = ref(false);
let refreshPromise: Promise<CommunityChatRoomDirectory | null> | null = null;
let refreshQueuedAfterCurrent = false;
let generation = 0;
let localReadVersion = 0;
const roomReadVersions = new Map<string, number>();

export interface CommunityChatDirectorySyncToken {
  generation: number;
  localReadVersion: number;
}

const totalUnread = computed(() => rooms.value.reduce((total, room) => total + Math.max(0, room.unreadCount), 0));
const totalMentions = computed(() => rooms.value.reduce((total, room) => total + Math.max(0, room.mentionCount), 0));

function captureDirectorySyncToken(): CommunityChatDirectorySyncToken {
  return { generation, localReadVersion };
}

function syncDirectory(
  directory: CommunityChatRoomDirectory | null | undefined,
  requestToken?: CommunityChatDirectorySyncToken,
) {
  // 账号切换后，旧页面或旧轮询即使晚返回也不能重新种入上一账号的角标。
  if (requestToken && requestToken.generation !== generation) return;
  if (!directory?.messagingEnabled) realtimeAvailable.value = false;
  else if (directory.access) realtimeAvailable.value = Boolean(directory.access.realtimeEnabled);
  const nextRooms = directory?.messagingEnabled ? directory.items || [] : [];
  rooms.value = nextRooms.map((room) => {
    const roomReadVersion = roomReadVersions.get(room.slug) || 0;
    // 请求发出后用户可能已经进入聊天室并完成已读写入。此时响应携带的是旧未读数，
    // 必须保留本地清零；下一次在已读之后发出的权威请求仍可正常带回真正的新消息。
    return requestToken && roomReadVersion > requestToken.localReadVersion
      ? { ...room, unreadCount: 0, mentionCount: 0 }
      : room;
  });
}

function markRoomRead(roomSlug: string) {
  localReadVersion += 1;
  roomReadVersions.set(roomSlug, localReadVersion);
  rooms.value = rooms.value.map((room) =>
    room.slug === roomSlug ? { ...room, unreadCount: 0, mentionCount: 0 } : room,
  );
}

function reset() {
  generation += 1;
  rooms.value = [];
  loading.value = false;
  realtimeAvailable.value = false;
  refreshPromise = null;
  refreshQueuedAfterCurrent = false;
  localReadVersion = 0;
  roomReadVersions.clear();
}

async function refresh(options: { afterCurrent?: boolean } = {}) {
  if (refreshPromise) {
    if (options.afterCurrent) refreshQueuedAfterCurrent = true;
    return refreshPromise;
  }
  const requestGeneration = generation;
  loading.value = true;
  const currentPromise = (async () => {
    let directory: CommunityChatRoomDirectory | null = null;
    do {
      refreshQueuedAfterCurrent = false;
      const requestToken = captureDirectorySyncToken();
      directory = await getCommunityChatRooms()
        .then((response) => {
          const nextDirectory = response.data as CommunityChatRoomDirectory;
          if (requestGeneration === generation) syncDirectory(nextDirectory, requestToken);
          return nextDirectory;
        })
        .catch(() => null);
    } while (requestGeneration === generation && refreshQueuedAfterCurrent);
    return directory;
  })().finally(() => {
    if (requestGeneration === generation) loading.value = false;
    if (refreshPromise === currentPromise) refreshPromise = null;
  });
  refreshPromise = currentPromise;
  return currentPromise;
}

export function useCommunityChatUnread() {
  return {
    rooms: readonly(rooms),
    loading: readonly(loading),
    realtimeAvailable: readonly(realtimeAvailable),
    totalUnread,
    totalMentions,
    captureDirectorySyncToken,
    markRoomRead,
    refresh,
    reset,
    syncDirectory,
  };
}
