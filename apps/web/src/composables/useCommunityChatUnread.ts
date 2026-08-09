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
let refreshPromise: Promise<CommunityChatRoomDirectory | null> | null = null;
let generation = 0;

const totalUnread = computed(() => rooms.value.reduce((total, room) => total + Math.max(0, room.unreadCount), 0));
const totalMentions = computed(() => rooms.value.reduce((total, room) => total + Math.max(0, room.mentionCount), 0));

function syncDirectory(directory: CommunityChatRoomDirectory | null | undefined) {
  rooms.value = directory?.messagingEnabled ? directory.items || [] : [];
}

function markRoomRead(roomSlug: string) {
  rooms.value = rooms.value.map((room) => (room.slug === roomSlug ? { ...room, unreadCount: 0 } : room));
}

function reset() {
  generation += 1;
  rooms.value = [];
  loading.value = false;
  refreshPromise = null;
}

async function refresh() {
  if (refreshPromise) return refreshPromise;
  const requestGeneration = generation;
  loading.value = true;
  const currentPromise = getCommunityChatAccess()
    .then(async (accessResponse) => {
      const access = accessResponse.data as CommunityChatAccess;
      if (!access?.canEnter || !access.messagingEnabled) {
        if (requestGeneration === generation) syncDirectory(null);
        return null;
      }
      const response = await getCommunityChatRooms();
      const directory = response.data as CommunityChatRoomDirectory;
      if (requestGeneration === generation) syncDirectory(directory);
      return directory;
    })
    .catch(() => null)
    .finally(() => {
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
    totalUnread,
    totalMentions,
    markRoomRead,
    refresh,
    reset,
    syncDirectory,
  };
}
