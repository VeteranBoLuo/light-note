<template>
  <div class="feed-mentions">
    <BButton class="mention-toggle" :aria-expanded="expanded" :disabled="disabled" @click="expanded = !expanded"
      >@ {{ t('community.feed.mentions') }}<span v-if="model.length"> · {{ model.length }}/10</span></BButton
    >
    <div v-if="expanded" class="mention-panel">
      <div class="mention-search"
        ><BInput
          v-model:value="query"
          :placeholder="t('community.feed.mentionSearch')"
          :disabled="disabled"
          :aria-label="t('community.feed.mentionSearch')"
          @keydown.enter.prevent="search"
        /><BButton :disabled="disabled" :loading="loading" @click="search">{{ t('common.search') }}</BButton></div
      >
      <div v-if="model.length" class="mention-selected"
        ><BButton
          v-for="id in model"
          :key="id"
          size="small"
          :disabled="disabled"
          @click="model = model.filter((x) => x !== id)"
          >{{ names[id] || id.slice(0, 8) }} ×</BButton
        ></div
      >
      <p v-if="loading" role="status">{{ t('community.feed.loading') }}</p>
      <p v-else-if="searched && !error && !members.length" role="status">{{ t('community.feed.noMembers') }}</p>
      <p v-if="error" role="alert">{{ t('community.feed.error') }}</p>
      <div v-for="member in members" :key="member.userPublicId" class="mention-result"
        ><span
          >{{ member.name }} <small>{{ member.communityId }}</small></span
        ><BButton
          size="small"
          :disabled="disabled || model.includes(member.userPublicId) || model.length >= 10"
          @click="choose(member)"
          >{{ t('community.feed.select') }}</BButton
        ></div
      >
    </div>
  </div>
</template>
<script setup lang="ts">
  import { ref, watch, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { feedGet } from '@/api/communityFeedApi';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  defineProps<{ disabled?: boolean }>();
  const model = defineModel<string[]>({ required: true });
  const { t } = useI18n();
  const user = useUserStore();
  const expanded = ref(false),
    searched = ref(false);
  const query = ref(''),
    members = ref<any[]>([]),
    names = ref<Record<string, string>>({}),
    loading = ref(false),
    error = ref(false);
  let generation = 0;
  watch(
    () => user.id,
    () => {
      generation++;
      members.value = [];
      searched.value = false;
      names.value = {};
      query.value = '';
      loading.value = false;
    },
  );
  onBeforeUnmount(() => generation++);
  async function search() {
    searched.value = true;
    const current = ++generation;
    loading.value = true;
    error.value = false;
    try {
      const data = await feedGet('members', { q: query.value });
      if (current === generation) members.value = data.items;
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  function choose(member: any) {
    names.value[member.userPublicId] = member.name;
    model.value = [...model.value, member.userPublicId];
  }
</script>

<style scoped lang="less">
  .mention-toggle {
    background: transparent;
    color: var(--primary-color);
    padding: 0;
    font-size: var(--ui-font-13, 13px);
  }
  .mention-panel {
    margin-top: var(--ui-space-8, 8px);
    padding: var(--ui-space-12, 12px);
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--card-background);
  }
  .mention-search,
  .mention-selected,
  .mention-result {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  .mention-search .input-container {
    flex: 1;
    min-width: 0;
  }
  .mention-selected {
    flex-wrap: wrap;
    margin-top: var(--ui-space-10, 10px);
  }
  .mention-result {
    justify-content: space-between;
    padding-top: var(--ui-space-10, 10px);
    font-size: var(--ui-font-13, 13px);
  }
  .mention-result small {
    color: var(--desc-color);
    margin-left: var(--ui-space-6, 6px);
  }
</style>
