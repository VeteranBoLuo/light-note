<template>
  <section class="community-preferences" :aria-label="t('community.preferencesTitle')">
    <h2>{{ t('community.preferencesTitle') }}</h2>
    <p>{{ t('community.preferencesDescription') }}</p>
    <template v-if="preferences.owner.value">
      <BLoading v-if="preferences.loading.value" inline loading :title="t('community.entryLoading')" />
      <div class="community-preferences__choices">
        <BButton
          :disabled="preferences.loading.value || preferences.saving.value || !preferences.value.value"
          :aria-pressed="preferences.value.value?.defaultView !== 'feed'"
          @click="preferences.save('chat')"
          >{{ t('community.chat') }}</BButton
        >
        <BButton
          :disabled="preferences.loading.value || preferences.saving.value || !preferences.value.value?.feedEnabled"
          :aria-pressed="preferences.value.value?.defaultView === 'feed'"
          @click="preferences.save('feed')"
          >{{ t(preferences.value.value?.feedEnabled ? 'community.feed.title' : 'community.feedUnavailable') }}</BButton
        >
      </div>
      <p v-if="preferences.value.value?.defaultView === 'feed' && !preferences.value.value?.feedEnabled">{{
        t('community.feedFallback')
      }}</p>
      <div v-if="preferences.error.value" class="community-preferences__error" role="status">
        <span>{{
          t(preferences.error.value === 'save' ? 'community.preferenceSaveFailed' : 'community.preferenceLoadFailed')
        }}</span>
        <BButton size="small" @click="preferences.load()">{{ t('community.reloadPreferences') }}</BButton>
      </div>
    </template>
    <p v-else>{{ t('community.preferenceUnavailable') }}</p>
  </section>
</template>
<script setup lang="ts">
  import { watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import { useCommunityPreferences } from '@/composables/useCommunityPreferences';
  const { t } = useI18n();
  const preferences = useCommunityPreferences();
  watch(
    preferences.owner,
    () => {
      void preferences.load();
    },
    { immediate: true },
  );
</script>
<style scoped lang="less">
  .community-preferences {
    min-width: 0;
    color: var(--text-color);
  }
  h2 {
    margin: 0;
    font-size: 15px;
  }
  p {
    font-size: 13px;
    line-height: 1.7;
    color: var(--desc-color);
  }
  .community-preferences__choices,
  .community-preferences__error {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .community-preferences__choices [aria-pressed='true'] {
    outline: 1px solid var(--primary-color);
    outline-offset: -1px;
    color: var(--primary-color);
  }
  .community-preferences__error {
    margin-top: 10px;
    color: var(--danger-color, var(--text-color));
    font-size: 13px;
  }
</style>
