<template>
  <div class="community-settings-panel">
    <CommunityChatNotificationSettingsPanel compact @saved="$emit('notificationSaved', $event)" />
    <section v-if="enabled" class="community-feed-notifications">
      <h2>{{ t('community.feed.feedNotifications') }}</h2>
      <BLoading class="community-section-loading" :loading="loading" :title="t('community.feed.loading')">
        <template v-if="options">
          <label v-for="field in fields" :key="field.key" class="community-settings-row"
            ><span>{{ t(field.label) }}</span
            ><BSwitch
              :checked="options[field.key]"
              :disabled="busy || loading || error"
              :aria-label="t(field.label)"
              @change="save(field.key, $event)"
          /></label>
        </template>
        <p v-if="error" role="alert"
          >{{ t('community.feed.error') }} <BButton @click="load">{{ t('community.feed.retry') }}</BButton></p
        >
      </BLoading>
    </section>
    <slot />
  </div>
</template>
<script setup lang="ts">
  import { onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { feedGet, feedOperation } from '@/api/communityFeedApi';
  import type { CommunityChatNotificationSettings } from '@/api/communityChatApi';
  import CommunityChatNotificationSettingsPanel from '@/components/communityChat/CommunityChatNotificationSettingsPanel.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  const emit = defineEmits<{
    notificationSaved: [settings: CommunityChatNotificationSettings];
    feedRevision: [revision: number];
  }>();
  const { t } = useI18n(),
    user = useUserStore();
  const fields = [
    { key: 'commentNotificationsEnabled', label: 'community.feed.commentNotifications' },
    { key: 'mentionNotificationsEnabled', label: 'community.feed.mentionNotifications' },
  ];
  const enabled = ref(false),
    options = ref<any>(null),
    loading = ref(false),
    busy = ref(false),
    error = ref(false);
  let generation = 0;
  async function load() {
    const current = ++generation;
    loading.value = true;
    error.value = false;
    try {
      const caps = await feedGet('feed/capabilities');
      if (current !== generation) return;
      enabled.value = caps.feedEnabled;
      if (!caps.feedEnabled) {
        options.value = null;
        return;
      }
      const data = await feedGet('profiles/options/me');
      if (current === generation) options.value = data;
    } catch {
      if (current === generation) {
        enabled.value = true;
        error.value = true;
      }
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  async function save(field: string, value: boolean) {
    if (busy.value || !options.value) return;
    const current = generation;
    busy.value = true;
    try {
      const result = await feedOperation(
        'profiles/options/me',
        { expectedRevision: options.value.revision, [field]: value },
        'put',
      )();
      if (current !== generation) return;
      options.value = { ...options.value, [field]: value, revision: result.revision };
      emit('feedRevision', result.revision);
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) busy.value = false;
    }
  }
  watch(
    () => `${user.id}|${user.role}|${user.adminContext?.id || ''}`,
    () => {
      generation++;
      options.value = null;
      enabled.value = false;
      busy.value = false;
      if (user.id && user.role !== 'visitor' && !user.adminContext) void load();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => generation++);
</script>
<style scoped lang="less">
  .community-settings-panel {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .community-feed-notifications {
    padding: 20px 0;
    border-top: 1px solid var(--workspace-divider);
  }
  .community-feed-notifications h2 {
    font-size: 16px;
    margin: 0 0 16px;
  }
  .community-settings-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    padding: 12px 0;
    font-size: 14px;
  }
  .community-feed-notifications p {
    font-size: 13px;
    color: var(--desc-color);
  }
</style>

<style scoped>
  .community-section-loading {
    height: auto;
    min-height: 120px;
  }
  .community-section-loading[aria-busy='true'] :deep(.b-loading-content) {
    pointer-events: none;
  }
</style>
