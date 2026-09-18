<template>
  <CommunityNavigation v-if="available" active="chat" />
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useUserStore } from '@/store';
  import { feedGet } from '@/api/communityFeedApi';
  import CommunityNavigation from './CommunityNavigation.vue';
  import { knownCommunityLayout, rememberCommunityLayout } from '@/utils/communityLayoutAvailability';
  const emit = defineEmits<{ available: [value: boolean] }>();
  const user = useUserStore();
  const owner = computed(() => `${user.id}|${user.role}|${user.adminContext?.id || ''}`);
  const available = ref(knownCommunityLayout(owner.value));
  watch(available, (value) => emit('available', value), { immediate: true });
  let generation = 0;
  watch(
    owner,
    async () => {
      const current = ++generation;
      const identity = owner.value;
      available.value = knownCommunityLayout(identity);
      try {
        const caps = await feedGet('feed/capabilities');
        if (current === generation) {
          rememberCommunityLayout(identity, caps.feedEnabled);
          available.value = caps.feedEnabled;
        }
      } catch {
        if (current === generation) {
          rememberCommunityLayout(identity, false);
          available.value = false;
        }
      }
    },
    { immediate: true },
  );
  onBeforeUnmount(() => generation++);
</script>
