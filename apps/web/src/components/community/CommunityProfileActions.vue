<template>
  <div v-if="profile && !user.adminContext" class="community-profile-actions"
    ><BButton size="small" @click="$emit('navigate', '/community/people/' + userPublicId)">{{
      t('community.feed.profile')
    }}</BButton
    ><BButton v-if="profile.isOwn" size="small" @click="$emit('navigate', '/community/manage')">{{
      t('community.feed.manage')
    }}</BButton
    ><BButton v-else-if="user.id && user.role !== 'visitor'" size="small" :loading="busy" @click="follow">{{
      t('community.feed.' + (profile.following ? 'unfollow' : 'follow'))
    }}</BButton
    ><p v-if="error" role="alert">{{ t('community.feed.error') }}</p></div
  >
</template>
<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { feedGet, feedOperation } from '@/api/communityFeedApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  const props = defineProps<{ userPublicId: string }>();
  defineEmits<{ navigate: [path: string] }>();
  const { t } = useI18n(),
    user = useUserStore(),
    profile = ref<any>(null),
    busy = ref(false),
    error = ref(false);
  let generation = 0;
  watch(
    [() => props.userPublicId, () => `${user.id}|${user.role}|${user.adminContext?.id || ''}`],
    async () => {
      const current = ++generation;
      profile.value = null;
      busy.value = false;
      error.value = false;
      if (!props.userPublicId) return;
      try {
        const caps = await feedGet('feed/capabilities');
        if (!caps.feedEnabled || current !== generation) return;
        const data = await feedGet('profiles/' + props.userPublicId, { summary: 'true' });
        if (current === generation) profile.value = data;
      } catch {}
    },
    { immediate: true },
  );
  async function follow() {
    const current = generation;
    busy.value = true;
    error.value = false;
    try {
      await feedOperation(
        'relations',
        { userPublicId: props.userPublicId, action: 'follow', enabled: !profile.value.following },
        'put',
      )();
      if (current === generation) profile.value.following = !profile.value.following;
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
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 12px 0;
  }
</style>
