import { computed, ref } from 'vue';
import {
  getCommunityChatMessageAuthorAchievements,
  getCommunityChatMessageAuthorProfile,
  getCommunityChatOwnProfile,
  updateCommunityChatOwnProfile,
  type CommunityChatAchievementCollection,
  type CommunityChatAuthorProfile,
  type CommunityChatMessage,
  type CommunityChatOwnProfile,
  type CommunityChatPublicAchievement,
} from '@/api/communityChatApi';

const PROFILE_CACHE_TTL_MS = 60_000;
const PROFILE_CACHE_MAX_ENTRIES = 100;

interface CachedProfile {
  profile: CommunityChatAuthorProfile;
  cachedAt: number;
}

export interface CommunityChatProfileUpdateInput {
  bio: string;
  showCommunityTenure: boolean;
  featuredAchievementKeys: string[];
  baseRevision: number;
}

function validAuthorProfile(value: unknown): value is CommunityChatAuthorProfile {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray((value as CommunityChatAuthorProfile).achievements) &&
    typeof (value as CommunityChatAuthorProfile).achievementCount === 'number',
  );
}

function validOwnProfile(value: unknown): value is CommunityChatOwnProfile {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray((value as CommunityChatOwnProfile).availableAchievements) &&
    Array.isArray((value as CommunityChatOwnProfile).featuredAchievementKeys) &&
    validAuthorProfile((value as CommunityChatOwnProfile).publicPreview),
  );
}

function validAchievementCollection(value: unknown): value is CommunityChatAchievementCollection {
  return Boolean(
    value &&
    typeof value === 'object' &&
    Array.isArray((value as CommunityChatAchievementCollection).achievements) &&
    typeof (value as CommunityChatAchievementCollection).achievementCount === 'number',
  );
}

/**
 * 聊天室社区名片状态域。
 *
 * 公开资料以消息 publicId 为唯一入口，不在浏览器保存账号 ID；短缓存用于消除
 * 重复打开同一成员名片时的闪烁。个人编辑和全部成就使用独立竞态代次，避免
 * 快速切换成员时旧请求覆盖当前名片。
 */
export function useCommunityChatProfile() {
  const visible = ref(false);
  const openKind = ref<'message' | 'own'>('message');
  const targetMessage = ref<CommunityChatMessage | null>(null);
  const sessionKey = ref(0);
  const profile = ref<CommunityChatAuthorProfile | null>(null);
  const profileLoading = ref(false);
  const profileError = ref(false);
  const ownProfile = ref<CommunityChatOwnProfile | null>(null);
  const ownLoading = ref(false);
  const ownError = ref(false);
  const ownSaving = ref(false);
  const allAchievements = ref<CommunityChatPublicAchievement[] | null>(null);
  const allAchievementsLoading = ref(false);
  const allAchievementsError = ref(false);
  const profileCache = new Map<string, CachedProfile>();
  let profileGeneration = 0;
  let ownGeneration = 0;
  let allAchievementsGeneration = 0;

  const isOwn = computed(() => openKind.value === 'own' || Boolean(targetMessage.value?.isOwn));
  const targetPublicId = computed(() => targetMessage.value?.publicId || '');

  function pruneProfileCache() {
    const now = Date.now();
    for (const [key, entry] of profileCache) {
      if (now - entry.cachedAt > PROFILE_CACHE_TTL_MS) profileCache.delete(key);
    }
    while (profileCache.size > PROFILE_CACHE_MAX_ENTRIES) {
      const oldestKey = profileCache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      profileCache.delete(oldestKey);
    }
  }

  function readCachedProfile(messagePublicId: string) {
    const entry = profileCache.get(messagePublicId);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > PROFILE_CACHE_TTL_MS) {
      profileCache.delete(messagePublicId);
      return null;
    }
    // Map 的插入顺序同时作为简单 LRU；命中后移到末尾。
    profileCache.delete(messagePublicId);
    profileCache.set(messagePublicId, entry);
    return entry.profile;
  }

  function writeCachedProfile(messagePublicId: string, value: CommunityChatAuthorProfile) {
    profileCache.delete(messagePublicId);
    profileCache.set(messagePublicId, { profile: value, cachedAt: Date.now() });
    pruneProfileCache();
  }

  function resetSecondaryViews() {
    allAchievementsGeneration += 1;
    allAchievements.value = null;
    allAchievementsLoading.value = false;
    allAchievementsError.value = false;
  }

  function openForMessage(message: CommunityChatMessage) {
    openKind.value = 'message';
    targetMessage.value = message;
    sessionKey.value += 1;
    visible.value = true;
    resetSecondaryViews();
    profileError.value = false;

    if (message.isOwn && ownProfile.value) {
      profile.value = ownProfile.value.publicPreview;
      profileLoading.value = false;
      return;
    }

    const cached = readCachedProfile(message.publicId);
    if (cached) {
      profile.value = cached;
      profileLoading.value = false;
      return;
    }

    profile.value = null;
    void loadPublicProfile().catch(() => undefined);
  }

  function openOwnProfile() {
    openKind.value = 'own';
    targetMessage.value = null;
    sessionKey.value += 1;
    visible.value = true;
    resetSecondaryViews();
    profileError.value = false;
    if (ownProfile.value) {
      profile.value = ownProfile.value.publicPreview;
      profileLoading.value = false;
      return;
    }
    profile.value = null;
    profileLoading.value = true;
    void loadOwnProfile().catch(() => undefined);
  }

  function closeProfile(options: { reset?: boolean; clearIdentityCache?: boolean } = {}) {
    visible.value = false;
    if (!options.reset) return;
    profileGeneration += 1;
    allAchievementsGeneration += 1;
    targetMessage.value = null;
    profile.value = null;
    profileLoading.value = false;
    profileError.value = false;
    resetSecondaryViews();
    if (options.clearIdentityCache) {
      ownGeneration += 1;
      ownProfile.value = null;
      ownLoading.value = false;
      ownError.value = false;
      ownSaving.value = false;
      profileCache.clear();
    }
  }

  async function loadPublicProfile(options: { force?: boolean } = {}) {
    const messagePublicId = targetPublicId.value;
    if (!messagePublicId) return null;
    if (!options.force) {
      const cached = readCachedProfile(messagePublicId);
      if (cached) {
        profile.value = cached;
        profileLoading.value = false;
        profileError.value = false;
        return cached;
      }
    }

    const generation = ++profileGeneration;
    profileLoading.value = true;
    profileError.value = false;
    try {
      const response = await getCommunityChatMessageAuthorProfile(messagePublicId);
      const value = response.data as unknown;
      if (!validAuthorProfile(value)) throw new Error('COMMUNITY_PROFILE_INVALID');
      if (generation !== profileGeneration || messagePublicId !== targetPublicId.value) return null;
      writeCachedProfile(messagePublicId, value);
      profile.value = value;
      return value;
    } catch (error) {
      if (generation === profileGeneration && messagePublicId === targetPublicId.value) {
        profile.value = null;
        profileError.value = true;
      }
      throw error;
    } finally {
      if (generation === profileGeneration) profileLoading.value = false;
    }
  }

  async function loadOwnProfile(options: { force?: boolean } = {}) {
    if (ownProfile.value && !options.force) {
      ownError.value = false;
      if (isOwn.value) profile.value = ownProfile.value.publicPreview;
      if (openKind.value === 'own') profileLoading.value = false;
      return ownProfile.value;
    }

    const generation = ++ownGeneration;
    ownLoading.value = true;
    ownError.value = false;
    if (openKind.value === 'own') {
      profileLoading.value = true;
      profileError.value = false;
    }
    try {
      const response = await getCommunityChatOwnProfile();
      const value = response.data as unknown;
      if (!validOwnProfile(value)) throw new Error('COMMUNITY_OWN_PROFILE_INVALID');
      if (generation !== ownGeneration) return null;
      ownProfile.value = value;
      if (isOwn.value) profile.value = value.publicPreview;
      if (openKind.value === 'own') profileError.value = false;
      return value;
    } catch (error) {
      if (generation === ownGeneration) {
        ownError.value = true;
        if (openKind.value === 'own') {
          profile.value = null;
          profileError.value = true;
        }
      }
      throw error;
    } finally {
      if (generation === ownGeneration) {
        ownLoading.value = false;
        if (openKind.value === 'own') profileLoading.value = false;
      }
    }
  }

  async function loadAllAchievements(options: { force?: boolean } = {}) {
    if (allAchievements.value && !options.force) return allAchievements.value;
    const messagePublicId = targetPublicId.value;
    const ownTarget = isOwn.value;
    const requestKey = ownTarget ? `own:${sessionKey.value}` : `message:${messagePublicId}`;
    const generation = ++allAchievementsGeneration;
    allAchievementsLoading.value = true;
    allAchievementsError.value = false;
    try {
      let achievements: CommunityChatPublicAchievement[];
      if (ownTarget) {
        const own = await loadOwnProfile();
        if (!own) return null;
        achievements = own.availableAchievements;
      } else {
        if (!messagePublicId) return null;
        const response = await getCommunityChatMessageAuthorAchievements(messagePublicId);
        const collection = response.data as unknown;
        if (!validAchievementCollection(collection)) throw new Error('COMMUNITY_ACHIEVEMENTS_INVALID');
        achievements = collection.achievements;
      }
      const currentRequestKey = isOwn.value ? `own:${sessionKey.value}` : `message:${targetPublicId.value}`;
      if (generation !== allAchievementsGeneration || requestKey !== currentRequestKey) return null;
      allAchievements.value = achievements;
      return achievements;
    } catch (error) {
      if (generation === allAchievementsGeneration) allAchievementsError.value = true;
      throw error;
    } finally {
      if (generation === allAchievementsGeneration) allAchievementsLoading.value = false;
    }
  }

  async function saveOwnProfile(input: CommunityChatProfileUpdateInput) {
    if (ownSaving.value) return null;
    const generation = ownGeneration;
    ownSaving.value = true;
    try {
      const response = await updateCommunityChatOwnProfile(input);
      const value = response.data as unknown;
      if (!validOwnProfile(value)) throw new Error('COMMUNITY_OWN_PROFILE_INVALID');
      if (generation !== ownGeneration) return null;
      ownProfile.value = value;
      profile.value = value.publicPreview;
      allAchievements.value = value.availableAchievements;
      profileCache.clear();
      return value;
    } finally {
      if (generation === ownGeneration) ownSaving.value = false;
    }
  }

  return {
    visible,
    targetMessage,
    sessionKey,
    profile,
    profileLoading,
    profileError,
    ownProfile,
    ownLoading,
    ownError,
    ownSaving,
    allAchievements,
    allAchievementsLoading,
    allAchievementsError,
    isOwn,
    openForMessage,
    openOwnProfile,
    closeProfile,
    loadPublicProfile,
    loadOwnProfile,
    loadAllAchievements,
    saveOwnProfile,
  };
}
