import { computed, ref, watch, type Ref } from 'vue';
import { COMMUNITY_CHAT_EMOJI_RECENT_LIMIT } from '@/config/communityChatEmoji';

const STORAGE_VERSION = 1;

function storageKey(ownerId: string) {
  return `light-note:community-chat:emoji-recent:v${STORAGE_VERSION}:${ownerId || 'visitor'}`;
}

function readRecent(ownerId: string) {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(ownerId)) || '[]');
    return Array.isArray(parsed)
      ? [...new Set(parsed.map((item) => String(item || '')).filter(Boolean))].slice(
          0,
          COMMUNITY_CHAT_EMOJI_RECENT_LIMIT,
        )
      : [];
  } catch {
    return [];
  }
}

export function useCommunityChatEmojiRecent(ownerId: Ref<string>) {
  const recent = ref<string[]>(readRecent(ownerId.value));

  watch(ownerId, (nextOwnerId) => {
    recent.value = readRecent(nextOwnerId);
  });

  function remember(emoji: string) {
    const value = String(emoji || '').trim();
    if (!value) return;
    recent.value = [value, ...recent.value.filter((item) => item !== value)].slice(
      0,
      COMMUNITY_CHAT_EMOJI_RECENT_LIMIT,
    );
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey(ownerId.value), JSON.stringify(recent.value));
    }
  }

  return { recent: computed(() => recent.value), remember };
}
