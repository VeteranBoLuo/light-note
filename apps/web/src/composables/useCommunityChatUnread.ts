import { computed, readonly, ref } from 'vue';
import {
  getCommunityChatAccess,
  getCommunityChatRooms,
  type CommunityChatAccess,
  type CommunityChatRoom,
  type CommunityChatRoomDirectory,
} from '@/api/communityChatApi';

const rooms = ref<CommunityChatRoom[]>([]);
const loading = ref(false);
const realtimeAvailable = ref(false);
let refreshPromise: Promise<CommunityChatRoomDirectory | null> | null = null;
let refreshQueuedAfterCurrent = false;
let generation = 0;

const totalUnread = computed(() => rooms.value.reduce((total, room) => total + Math.max(0, room.unreadCount), 0));
const totalMentions = computed(() => rooms.value.reduce((total, room) => total + Math.max(0, room.mentionCount), 0));

function syncDirectory(directory: CommunityChatRoomDirectory | null | undefined) {
  if (!directory?.messagingEnabled) realtimeAvailable.value = false;
  else if (directory.access) realtimeAvailable.value = Boolean(directory.access.realtimeEnabled);
  rooms.value = directory?.messagingEnabled ? directory.items || [] : [];
}

function markRoomRead(roomSlug: string) {
  rooms.value = rooms.value.map((room) => (room.slug === roomSlug ? { ...room, unreadCount: 0 } : room));
}

function reset() {
  generation += 1;
  rooms.value = [];
  loading.value = false;
  realtimeAvailable.value = false;
  refreshPromise = null;
  refreshQueuedAfterCurrent = false;
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
      directory = await getCommunityChatAccess()
        .then(async (accessResponse) => {
          const access = accessResponse.data as CommunityChatAccess;
          if (requestGeneration === generation) realtimeAvailable.value = Boolean(access?.realtimeEnabled);
          if (!access?.canEnter || !access.messagingEnabled) {
            if (requestGeneration === generation) syncDirectory(null);
            return null;
          }
          const response = await getCommunityChatRooms();
          const nextDirectory = response.data as CommunityChatRoomDirectory;
          if (requestGeneration === generation) syncDirectory(nextDirectory);
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
    markRoomRead,
    refresh,
    reset,
    syncDirectory,
  };
}
