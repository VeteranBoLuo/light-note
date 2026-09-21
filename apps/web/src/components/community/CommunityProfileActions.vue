<template>
  <div
    v-if="userPublicId && !user.adminContext && (loading || profile || loadError)"
    class="community-profile-actions"
    :aria-busy="loading"
  >
    <BLoading v-if="loading" inline loading :title="t('community.feed.loading')" />
    <template v-else-if="profile">
      <BButton
        type="text"
        class="community-profile-actions__home"
        @click="$emit('navigate', '/community/people/' + userPublicId)"
      >
        {{ t('community.feed.profile') }}
        <SvgIcon :src="icon.arrow_right" size="14" aria-hidden="true" />
      </BButton>
      <BButton v-if="profile.isOwn" @click="$emit('navigate', '/community/manage')">
        {{ t('community.feed.manage') }}
      </BButton>
      <BButton
        v-else-if="user.id && user.role !== 'visitor'"
        class="community-profile-actions__follow"
        :type="profile.following ? undefined : 'primary'"
        :loading="busy"
        @click="follow"
      >
        {{ t('community.feed.' + (profile.following ? 'unfollow' : 'follow')) }}
      </BButton>
    </template>
    <template v-else-if="loadError">
      <span role="status">{{ t('community.feed.loadError') }}</span>
      <BButton size="small" @click="loadProfile">{{ t('community.feed.retry') }}</BButton>
    </template>
    <p v-if="error" role="alert">{{ t('community.feed.error') }}</p>
  </div>
</template>
<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import type { CommunityProfileActionsState } from '@/composables/useCommunityChatProfile';
  import { feedGet, feedOperation } from '@/api/communityFeedApi';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  const props = defineProps<{ userPublicId: string; preparedProfile?: CommunityProfileActionsState | null }>();
  defineEmits<{ navigate: [path: string] }>();
  const { t } = useI18n(),
    user = useUserStore(),
    profile = ref<CommunityProfileActionsState | null>(null),
    busy = ref(false),
    loading = ref(true),
    loadError = ref(false),
    error = ref(false);
  let generation = 0;
  async function loadProfile() {
    const current = ++generation;
    const targetId = props.userPublicId;
    profile.value = null;
    busy.value = false;
    error.value = false;
    loadError.value = false;
    loading.value = true;
    try {
      if (props.preparedProfile !== undefined) {
        profile.value = props.preparedProfile;
        return;
      }
      if (!targetId || user.adminContext) return;
      const caps = await feedGet('feed/capabilities');
      if (!caps.feedEnabled || current !== generation) return;
      const data = await feedGet('profiles/' + targetId, { summary: 'true' });
      if (current === generation) profile.value = data;
    } catch {
      if (current === generation) loadError.value = true;
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  watch(
    [
      () => props.userPublicId,
      () => props.preparedProfile,
      () => `${user.id}|${user.role}|${user.adminContext?.id || ''}`,
    ],
    loadProfile,
    {
      immediate: true,
    },
  );
  async function follow() {
    if (!profile.value || busy.value) return;
    const targetProfile = profile.value;
    const current = generation;
    busy.value = true;
    error.value = false;
    try {
      await feedOperation(
        'relations',
        { userPublicId: props.userPublicId, action: 'follow', enabled: !targetProfile.following },
        'put',
      )();
      if (current === generation) targetProfile.following = !targetProfile.following;
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) busy.value = false;
    }
  }
  onBeforeUnmount(() => generation++);
</script>
<style scoped>
  .community-profile-actions {
    min-height: 32px;
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin: 0;
  }
  .community-profile-actions__home {
    gap: 4px;
  }

  .community-profile-actions__follow {
    min-width: 108px;
  }
</style>
