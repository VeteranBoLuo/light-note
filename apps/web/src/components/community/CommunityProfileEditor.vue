<template>
  <div class="profile-editor"
    ><template v-if="available">
      <BLoading
        v-if="section !== 'posts'"
        class="profile-loading"
        :loading="state.ownLoading.value"
        :title="t('common.loading')"
      >
        <p v-if="state.ownError.value || !state.ownProfile.value" role="alert"
          >{{ t('communityChat.profile.ownLoadFailed') }}
          <BButton @click="load">{{ t('community.feed.retry') }}</BButton></p
        >
        <section v-else class="profile-fields">
          <h2>{{ t('community.profileFields') }}</h2
          ><p>{{ t('community.profileFieldsHint') }}</p>
          <template v-if="section === 'achievements'">
            <h3
              >{{ t('communityChat.profile.featuredLabel') }} <small>{{ featured.length }}/3</small></h3
            >
            <div class="achievement-choices">
              <BButton
                v-for="item in state.ownProfile.value.availableAchievements"
                :key="item.key"
                :aria-pressed="featured.includes(item.key)"
                :disabled="saving || (featured.length >= 3 && !featured.includes(item.key))"
                @click="toggleAchievement(item.key)"
              >
                <AchievementEmblem :achievement-key="item.key" :group="item.group" :size="28" />
                {{ t('growth.achName.' + item.key)
                }}<span v-if="featured.includes(item.key)">{{ featured.indexOf(item.key) + 1 }}</span>
              </BButton>
            </div>
            <p v-if="!state.ownProfile.value.availableAchievements.length">{{
              t('communityChat.profile.noAvailableAchievements')
            }}</p>
          </template>
        </section>
      </BLoading>
      <CommunityProfileShowcase v-if="section === 'posts'" ref="showcase" embedded :disabled="saving" />
      <footer>
        <span role="status"
          >{{ saveError ? t('community.profilePartial') : saved ? t('community.feed.profileSaved') : '' }}
          <BButton v-if="saveError" :disabled="saving" @click="load">{{
            t('community.reloadProfileDraft')
          }}</BButton></span
        >
        <BButton
          type="primary"
          :loading="saving"
          :disabled="state.ownLoading.value || !dirty || !state.ownProfile.value || bioLength > 60"
          @click="save"
          >{{ t('community.profileSave') }}</BButton
        >
      </footer> </template
    ><p v-else>{{ t('community.preferenceUnavailable') }}</p></div
  >
</template>
<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import CommunityProfileShowcase from '@/components/community/CommunityProfileShowcase.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import AchievementEmblem from '@/components/growth/AchievementEmblem.vue';
  import { useCommunityChatProfile } from '@/composables/useCommunityChatProfile';
  defineProps<{ section: 'achievements' | 'posts' }>();
  const emit = defineEmits<{ saved: [] }>();
  const { t } = useI18n(),
    user = useUserStore(),
    state = useCommunityChatProfile();
  const showcase = ref<InstanceType<typeof CommunityProfileShowcase>>();
  const bio = ref(''),
    tenure = ref(true),
    featured = ref<string[]>([]),
    revision = ref(0);
  const baseline = ref(''),
    saving = ref(false),
    saved = ref(false),
    saveError = ref(false);
  const bioLength = computed(() =>
    typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(bio.value)).length
      : Array.from(bio.value).length,
  );
  const signature = () => JSON.stringify([bio.value, tenure.value, featured.value]);
  const cardDirty = computed(() => !!baseline.value && signature() !== baseline.value);
  const dirty = computed(() => cardDirty.value || !!showcase.value?.dirty);
  defineExpose({ dirty, saving });
  const available = computed(() => Boolean(user.id && user.role !== 'visitor' && !user.adminContext));
  const owner = computed(() => `${user.id}|${user.role}|${user.adminContext?.id || ''}`);
  function applyProfile() {
    const value = state.ownProfile.value;
    if (!value) return;
    bio.value = value.bio;
    tenure.value = value.showCommunityTenure;
    featured.value = [...value.featuredAchievementKeys];
    revision.value = value.revision;
    baseline.value = signature();
  }
  async function load() {
    try {
      const result = await state.loadOwnProfile({ force: true });
      if (result) applyProfile();
    } catch {
      /* inline error */
    }
  }
  function toggleAchievement(key: string) {
    featured.value = featured.value.includes(key)
      ? featured.value.filter((x) => x !== key)
      : [...featured.value, key].slice(0, 3);
    saved.value = false;
  }
  async function save() {
    if (saving.value || state.ownLoading.value || !dirty.value || bioLength.value > 60) return;
    const current = owner.value;
    saving.value = true;
    saved.value = saveError.value = false;
    try {
      if (cardDirty.value) {
        const result = await state.saveOwnProfile({
          bio: bio.value,
          showCommunityTenure: tenure.value,
          featuredAchievementKeys: [...featured.value],
          baseRevision: revision.value,
        });
        if (current !== owner.value || !result) return;
        revision.value = result.revision;
        baseline.value = signature();
      }
      const result = await showcase.value?.save();
      if (current !== owner.value) return;
      if (result === false) throw new Error('SHOWCASE_SAVE_FAILED');
      saved.value = true;
      emit('saved');
    } catch {
      if (current === owner.value) saveError.value = true;
    } finally {
      if (current === owner.value) saving.value = false;
    }
  }
  watch(
    owner,
    () => {
      state.closeProfile({ reset: true, clearIdentityCache: true });
      baseline.value = bio.value = '';
      featured.value = [];
      saving.value = saved.value = saveError.value = false;
      if (available.value) void load();
    },
    { immediate: true, flush: 'sync' },
  );
  watch([signature, () => showcase.value?.dirty], () => {
    if (!saving.value) saved.value = false;
  });
  onBeforeUnmount(() => state.closeProfile({ reset: true, clearIdentityCache: true }));
</script>
<style scoped>
  .profile-editor :deep(.showcase-section) {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
  .profile-editor :deep(.profile-showcase) {
    margin-top: 0;
  }
  .profile-editor :deep(.featured-choices) {
    height: var(--ui-layout-400, 400px);
    max-height: 50vh;
  }

  .profile-editor {
    max-width: var(--ui-layout-1120, 1120px);
    margin: 0;
  }
  h1 {
    font-size: var(--ui-font-24, 24px);
    margin: 0;
  }
  h2 {
    font-size: var(--ui-font-17, 17px);
    margin: 0 0 var(--ui-space-12, 12px);
  }
  h3 {
    font-size: var(--ui-font-14, 14px);
    display: flex;
    justify-content: space-between;
  }
  p,
  small {
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.7;
    font-weight: 400;
  }
  header {
    margin-bottom: var(--ui-space-28, 28px);
  }
  .profile-loading {
    min-height: var(--ui-layout-260, 260px);
    height: auto;
  }
  .profile-fields {
    padding-top: var(--ui-space-28, 28px);
  }
  .achievement-choices {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ui-space-10, 10px);
  }
  .achievement-choices .b_btn {
    width: 100%;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    height: auto;
    min-width: 0;
    white-space: normal;
    text-align: left;
    justify-content: flex-start;
    background: var(--workspace-content);
    font-size: var(--ui-font-12, 12px);
    padding: var(--ui-space-12, 12px) var(--ui-space-8, 8px);
    border: 1px solid var(--workspace-border);
  }
  .achievement-choices [aria-pressed='true'] {
    color: var(--primary-color);
    border-color: var(--primary-color);
  }
  footer {
    position: sticky;
    bottom: 0;
    z-index: 2;
    background: var(--workspace-open-canvas);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
    margin-top: var(--ui-space-12, 12px);
    padding: var(--ui-space-12, 12px) 0 0;
    border-top: 1px solid var(--workspace-divider);
  }
  footer span {
    font-size: var(--ui-font-13, 13px);
    color: var(--desc-color);
  }
  footer .b_btn {
    flex-shrink: 0;
  }
  @media (max-width: 767px) {
    .achievement-choices {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
