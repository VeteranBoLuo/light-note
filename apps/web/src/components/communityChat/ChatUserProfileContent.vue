<template>
  <div class="chat-profile-content" :class="{ 'chat-profile-content--editing': view === 'edit' }">
    <div v-if="loading" class="chat-profile-content__state">
      <BLoading inline loading :title="t('communityChat.profile.loading')" />
    </div>

    <div v-else-if="error || !profile" class="chat-profile-content__state" role="status">
      <span class="chat-profile-content__state-icon" aria-hidden="true">
        <SvgIcon :src="icon.message.info" size="20" />
      </span>
      <strong>{{ t('communityChat.profile.loadFailed') }}</strong>
      <span>{{ t('communityChat.profile.loadFailedDescription') }}</span>
      <BButton size="small" @click="emit('retry')">{{ t('communityChat.profile.retry') }}</BButton>
    </div>

    <template v-else>
      <div v-if="view !== 'summary'" class="chat-profile-content__subview-header">
        <BButton class="chat-profile-content__back" @click="view = 'summary'">
          <SvgIcon :src="icon.arrow_left" size="16" aria-hidden="true" />
          {{ t('communityChat.profile.backToCard') }}
        </BButton>
        <strong>{{ subviewTitle }}</strong>
      </div>

      <template v-if="view === 'summary'">
        <ProfileIdentity :profile="profile" />

        <section class="chat-profile-content__bio" :aria-label="t('communityChat.profile.bio')">
          <div class="chat-profile-content__section-heading">
            <span>
              <SvgIcon :src="icon.userCenter.info" size="16" aria-hidden="true" />
              <strong>{{ t('communityChat.profile.bio') }}</strong>
            </span>
          </div>
          <p :class="{ 'is-empty': !profile.bio }">
            {{ profile.bio || t('communityChat.profile.bioEmpty') }}
          </p>
          <p v-if="profile.communityTenureLabel" class="chat-profile-content__tenure">
            <SvgIcon :src="icon.growth.tenure" size="15" aria-hidden="true" />
            <span>{{ profile.communityTenureLabel }}</span>
          </p>
        </section>

        <section class="chat-profile-content__achievements" :aria-label="t('communityChat.profile.achievements')">
          <div class="chat-profile-content__section-heading">
            <span>
              <SvgIcon :src="icon.userCenter.growth" size="17" aria-hidden="true" />
              <strong>{{ t('communityChat.profile.featuredAchievements') }}</strong>
            </span>
            <small>{{ t('communityChat.profile.achievementCount', { count: profile.achievementCount }) }}</small>
          </div>

          <AchievementGrid :achievements="featuredAchievements" />

          <BButton v-if="hasMoreAchievements" class="chat-profile-content__view-all" @click="openAllAchievements">
            {{ t('communityChat.profile.viewAllAchievements', { count: profile.achievementCount }) }}
            <SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" />
          </BButton>
        </section>

        <div v-if="isOwn" class="chat-profile-content__actions chat-profile-content__actions--own">
          <BButton type="primary" @click="beginEdit">
            <SvgIcon :src="icon.communityChat.profileEdit" size="16" aria-hidden="true" />
            {{ t('communityChat.profile.editAction') }}
          </BButton>
          <BButton @click="openPreview">
            <SvgIcon :src="icon.communityChat.profilePreview" size="16" aria-hidden="true" />
            {{ t('communityChat.profile.previewAction') }}
          </BButton>
        </div>

        <div
          v-else-if="authenticated"
          class="chat-profile-content__actions chat-profile-content__actions--moderation"
          :class="{ 'is-single': profile.role === 'official' }"
        >
          <BButton v-if="profile.role !== 'official'" @click="emit('block')">
            <SvgIcon :src="icon.navigation.permissions" size="16" aria-hidden="true" />
            {{ t('communityChat.blocks.action') }}
          </BButton>
          <BButton type="danger" @click="emit('report')">
            <SvgIcon :src="icon.message.warning" size="16" aria-hidden="true" />
            {{ t('communityChat.report.action') }}
          </BButton>
        </div>

        <div v-else class="chat-profile-content__visitor-action">
          <span>{{ t('communityChat.profile.visitorHint') }}</span>
          <BButton type="primary" @click="emit('login')">{{ t('communityChat.guestLoginAction') }}</BButton>
        </div>

        <p class="chat-profile-content__privacy">
          <SvgIcon :src="icon.growth.lock" size="14" aria-hidden="true" />
          <span>{{ t('communityChat.profile.privacy') }}</span>
        </p>
      </template>

      <section v-else-if="view === 'achievements'" class="chat-profile-content__subview">
        <div v-if="allAchievementsLoading" class="chat-profile-content__subview-state">
          <BLoading inline loading :title="t('communityChat.profile.loadingAchievements')" />
        </div>
        <div v-else-if="allAchievementsError" class="chat-profile-content__subview-state" role="status">
          <SvgIcon :src="icon.message.warning" size="22" aria-hidden="true" />
          <span>{{ t('communityChat.profile.achievementsLoadFailed') }}</span>
          <BButton size="small" @click="emit('loadAllAchievements')">
            {{ t('communityChat.profile.retry') }}
          </BButton>
        </div>
        <template v-else>
          <p class="chat-profile-content__subview-description">
            {{ t('communityChat.profile.allAchievementsDescription', { count: profile.achievementCount }) }}
          </p>
          <AchievementGrid :achievements="allAchievements || profile.achievements" expanded />
        </template>
      </section>

      <section v-else-if="view === 'preview'" class="chat-profile-content__subview">
        <div v-if="!previewProfile" class="chat-profile-content__subview-state" role="status">
          <SvgIcon :src="icon.message.warning" size="22" aria-hidden="true" />
          <span>{{ t('communityChat.profile.ownLoadFailed') }}</span>
          <BButton size="small" @click="emit('retry')">{{ t('communityChat.profile.retry') }}</BButton>
        </div>
        <template v-else>
          <p class="chat-profile-content__subview-description">{{ t('communityChat.profile.previewDescription') }}</p>
          <ProfileIdentity :profile="previewProfile" />
          <div class="chat-profile-content__preview-card">
            <p :class="{ 'is-empty': !previewProfile.bio }">
              {{ previewProfile.bio || t('communityChat.profile.bioEmpty') }}
            </p>
            <p v-if="previewProfile.communityTenureLabel" class="chat-profile-content__tenure">
              <SvgIcon :src="icon.growth.tenure" size="15" aria-hidden="true" />
              <span>{{ previewProfile.communityTenureLabel }}</span>
            </p>
            <AchievementGrid :achievements="previewProfile.achievements.slice(0, 3)" />
          </div>
        </template>
      </section>

      <section v-else class="chat-profile-content__subview chat-profile-content__editor">
        <div v-if="ownLoading && !ownProfile" class="chat-profile-content__subview-state">
          <BLoading inline loading :title="t('communityChat.profile.loadingOwn')" />
        </div>
        <div v-else-if="ownError || !ownProfile" class="chat-profile-content__subview-state" role="status">
          <SvgIcon :src="icon.message.warning" size="22" aria-hidden="true" />
          <span>{{ t('communityChat.profile.ownLoadFailed') }}</span>
          <BButton size="small" @click="emit('requestOwn')">{{ t('communityChat.profile.retry') }}</BButton>
        </div>
        <template v-else>
          <div class="chat-profile-content__editor-scroll">
            <label class="chat-profile-content__field">
              <span>
                <strong>{{ t('communityChat.profile.bioLabel') }}</strong>
                <small :class="{ 'is-invalid': draftBioLength > 60 }">{{ draftBioLength }}/60</small>
              </span>
              <BInput
                v-model:value="draftBio"
                type="textarea"
                :rows="3"
                :placeholder="t('communityChat.profile.bioPlaceholder')"
              />
            </label>

            <div class="chat-profile-content__toggle-row">
              <span>
                <strong>{{ t('communityChat.profile.tenureVisibility') }}</strong>
                <small>{{ t('communityChat.profile.tenureVisibilityDescription') }}</small>
              </span>
              <BSwitch v-model:checked="draftShowTenure" />
            </div>

            <div class="chat-profile-content__featured-editor">
              <div class="chat-profile-content__section-heading">
                <span>
                  <SvgIcon :src="icon.userCenter.growth" size="17" aria-hidden="true" />
                  <strong>{{ t('communityChat.profile.featuredLabel') }}</strong>
                </span>
                <small>{{ t('communityChat.profile.featuredLimit', { count: draftFeaturedKeys.length }) }}</small>
              </div>

              <div v-if="selectedAchievements.length" class="chat-profile-content__selected-list">
                <article
                  v-for="(achievement, index) in selectedAchievements"
                  :key="achievement.key"
                  class="chat-profile-content__selected-item"
                  role="button"
                  tabindex="0"
                  :aria-label="
                    t('communityChat.profile.viewAchievementDetail', { name: achievementName(achievement.key) })
                  "
                  @click="openAchievementDetail(achievement)"
                  @keydown.enter.self="openAchievementDetail(achievement)"
                  @keydown.space.self.prevent="openAchievementDetail(achievement)"
                >
                  <AchievementEmblem
                    class="chat-profile-content__achievement-icon"
                    :achievement-key="achievement.key"
                    :group="achievement.group"
                    :size="30"
                  />
                  <span>
                    <strong>{{ achievementName(achievement.key) }}</strong>
                    <small>{{ achievementGroupName(achievement.group) }}</small>
                  </span>
                  <span class="chat-profile-content__order-actions">
                    <BButton
                      size="small"
                      :disabled="index === 0"
                      :aria-label="t('communityChat.profile.moveUp', { name: achievementName(achievement.key) })"
                      @click.stop="moveAchievement(index, -1)"
                    >
                      {{ t('communityChat.profile.moveUpShort') }}
                    </BButton>
                    <BButton
                      size="small"
                      :disabled="index === selectedAchievements.length - 1"
                      :aria-label="t('communityChat.profile.moveDown', { name: achievementName(achievement.key) })"
                      @click.stop="moveAchievement(index, 1)"
                    >
                      {{ t('communityChat.profile.moveDownShort') }}
                    </BButton>
                    <BButton
                      size="small"
                      :aria-label="
                        t('communityChat.profile.removeAchievement', { name: achievementName(achievement.key) })
                      "
                      @click.stop="removeAchievement(achievement.key)"
                    >
                      {{ t('communityChat.profile.removeShort') }}
                    </BButton>
                  </span>
                </article>
              </div>
              <p v-else class="chat-profile-content__selection-empty">
                {{ t('communityChat.profile.noFeaturedSelected') }}
              </p>

              <div class="chat-profile-content__available-heading">
                <strong>{{ t('communityChat.profile.availableAchievements') }}</strong>
                <small>{{ t('communityChat.profile.availableAchievementsHint') }}</small>
              </div>
              <div v-if="availableUnselectedAchievements.length" class="chat-profile-content__available-grid">
                <article
                  v-for="achievement in availableUnselectedAchievements"
                  :key="achievement.key"
                  class="chat-profile-content__available-item"
                  role="button"
                  tabindex="0"
                  :aria-label="
                    t('communityChat.profile.viewAchievementDetail', { name: achievementName(achievement.key) })
                  "
                  @click="openAchievementDetail(achievement)"
                  @keydown.enter.self="openAchievementDetail(achievement)"
                  @keydown.space.self.prevent="openAchievementDetail(achievement)"
                >
                  <AchievementEmblem
                    class="chat-profile-content__achievement-icon"
                    :achievement-key="achievement.key"
                    :group="achievement.group"
                    :size="30"
                  />
                  <span>
                    <strong>{{ achievementName(achievement.key) }}</strong>
                    <small>{{ achievementGroupName(achievement.group) }}</small>
                  </span>
                  <BButton
                    class="chat-profile-content__add-achievement"
                    size="small"
                    :disabled="draftFeaturedKeys.length >= 3"
                    :aria-label="t('communityChat.profile.addAchievement', { name: achievementName(achievement.key) })"
                    @click.stop="addAchievement(achievement.key)"
                  >
                    <SvgIcon :src="icon.common.plus" size="16" aria-hidden="true" />
                  </BButton>
                </article>
              </div>
              <p v-else class="chat-profile-content__selection-empty">
                {{ t('communityChat.profile.noAvailableAchievements') }}
              </p>
            </div>
          </div>

          <div class="chat-profile-content__editor-actions">
            <BButton @click="view = 'summary'">{{ t('common.cancel') }}</BButton>
            <BButton type="primary" :loading="saving" :disabled="draftBioLength > 60" @click="saveDraft">
              {{ t('communityChat.profile.saveAction') }}
            </BButton>
          </div>
        </template>
      </section>
    </template>
  </div>

  <BModal
    v-if="detailAchievement"
    v-model:visible="detailVisible"
    :title="t('communityChat.profile.achievementDetailTitle')"
    width="min(380px, 90vw)"
    :show-footer="false"
    :mask-closable="true"
  >
    <div class="chat-profile-content__achievement-detail">
      <AchievementEmblem
        :achievement-key="detailAchievement.key"
        :group="detailAchievement.group"
        :size="104"
        showcase
      />
      <div class="chat-profile-content__achievement-detail-copy">
        <strong>{{ achievementName(detailAchievement.key) }}</strong>
        <span>{{ achievementGroupName(detailAchievement.group) }}</span>
      </div>
      <p>{{ achievementDescription(detailAchievement.key) }}</p>
      <span class="chat-profile-content__achievement-unlocked">
        {{ t('communityChat.profile.achievementUnlocked') }}
      </span>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, defineComponent, h, ref, watch, type PropType } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type {
    CommunityChatAuthorProfile,
    CommunityChatOwnProfile,
    CommunityChatPublicAchievement,
  } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSwitch from '@/components/base/BasicComponents/BSwitch.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AchievementEmblem from '@/components/growth/AchievementEmblem.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import icon from '@/config/icon';
  import { frameVariant } from '@/config/growthFrames';
  import type { CommunityChatProfileUpdateInput } from '@/composables/useCommunityChatProfile';

  type ProfileView = 'summary' | 'achievements' | 'preview' | 'edit';

  const props = withDefaults(
    defineProps<{
      profile?: CommunityChatAuthorProfile | null;
      loading?: boolean;
      error?: boolean;
      authenticated?: boolean;
      isOwn?: boolean;
      ownProfile?: CommunityChatOwnProfile | null;
      ownLoading?: boolean;
      ownError?: boolean;
      saving?: boolean;
      allAchievements?: CommunityChatPublicAchievement[] | null;
      allAchievementsLoading?: boolean;
      allAchievementsError?: boolean;
      sessionKey?: number;
    }>(),
    {
      profile: null,
      loading: false,
      error: false,
      authenticated: false,
      isOwn: false,
      ownProfile: null,
      ownLoading: false,
      ownError: false,
      saving: false,
      allAchievements: null,
      allAchievementsLoading: false,
      allAchievementsError: false,
      sessionKey: 0,
    },
  );

  const emit = defineEmits<{
    retry: [];
    requestOwn: [];
    loadAllAchievements: [];
    save: [input: CommunityChatProfileUpdateInput];
    block: [];
    report: [];
    login: [];
    viewChange: [view: ProfileView];
  }>();
  const { t, te } = useI18n();
  const view = ref<ProfileView>('summary');
  const detailAchievement = ref<CommunityChatPublicAchievement | null>(null);
  const detailVisible = ref(false);
  const draftBio = ref('');
  const draftShowTenure = ref(true);
  const draftFeaturedKeys = ref<string[]>([]);
  const draftBaseRevision = ref(0);
  const featuredAchievements = computed(() => (props.profile?.achievements || []).slice(0, 3));
  const hasMoreAchievements = computed(() => {
    if (!props.profile) return false;
    return (
      Boolean(props.profile.hasMoreAchievements) ||
      props.profile.achievementCount > featuredAchievements.value.length ||
      props.profile.achievements.length > featuredAchievements.value.length
    );
  });
  const previewProfile = computed(() => props.ownProfile?.publicPreview || props.profile || null);

  function achievementName(key: string) {
    const i18nKey = `growth.achName.${key}`;
    return te(i18nKey) ? t(i18nKey) : key;
  }

  function achievementGroupName(group: string) {
    const i18nKey = `growth.achGroup.${group}`;
    return te(i18nKey) ? t(i18nKey) : group;
  }

  function achievementDescription(key: string) {
    const i18nKey = `growth.achDesc.${key}`;
    return te(i18nKey) ? t(i18nKey) : t('communityChat.profile.achievementDescriptionFallback');
  }

  function openAchievementDetail(achievement: CommunityChatPublicAchievement) {
    detailAchievement.value = achievement;
    detailVisible.value = true;
  }

  const ProfileIdentity = defineComponent({
    name: 'CommunityChatProfileIdentity',
    props: {
      profile: { type: Object as PropType<CommunityChatAuthorProfile>, required: true },
    },
    setup(identityProps) {
      return () => {
        const profile = identityProps.profile;
        const validFrameId = profile.frameId && frameVariant(profile.frameId) ? profile.frameId : null;
        const avatar = validFrameId
          ? h(AvatarFramePreview, {
              frameId: validFrameId,
              src: profile.avatar || icon.communityChat.defaultAvatar,
              size: 68,
            })
          : h(SvgIcon, {
              class: 'chat-profile-content__avatar-image',
              src: profile.avatar || icon.communityChat.defaultAvatar,
              size: 68,
            });
        const tags = [h('span', { class: 'chat-profile-content__level' }, `Lv.${profile.level} ${profile.levelName}`)];
        if (profile.role !== 'member') {
          tags.push(h('span', { class: 'chat-profile-content__role' }, t(`communityChat.authorRole.${profile.role}`)));
        }
        const shouldHighlightFrame = profile.frameRarity === 'epic' || profile.frameRarity === 'legendary';
        if (validFrameId && shouldHighlightFrame) {
          tags.push(
            h(
              'span',
              { class: ['chat-profile-content__rarity', `is-${profile.frameRarity}`] },
              t(`communityChat.profile.rarity.${profile.frameRarity}`),
            ),
          );
        }
        return h('header', { class: 'chat-profile-content__identity' }, [
          h('span', { class: 'chat-profile-content__avatar', 'aria-hidden': 'true' }, [avatar]),
          h('span', { class: 'chat-profile-content__identity-copy' }, [
            h('strong', profile.name || t('communityChat.memberFallback')),
            profile.communityId
              ? h('small', { class: 'chat-profile-content__community-id' }, `@${profile.communityId}`)
              : null,
            h('span', { class: 'chat-profile-content__identity-tags' }, tags),
            profile.title ? h('small', profile.title) : null,
          ]),
        ]);
      };
    },
  });

  const AchievementGrid = defineComponent({
    name: 'CommunityChatAchievementGrid',
    props: {
      achievements: {
        type: Array as PropType<CommunityChatPublicAchievement[]>,
        default: () => [],
      },
      expanded: { type: Boolean, default: false },
    },
    setup(gridProps) {
      return () => {
        if (!gridProps.achievements.length) {
          return h('div', { class: 'chat-profile-content__empty' }, [
            h(SvgIcon, { src: icon.growth.level, size: 20, 'aria-hidden': 'true' }),
            h('span', t('communityChat.profile.noAchievements')),
          ]);
        }
        return h(
          'div',
          {
            class: [
              'chat-profile-content__achievement-list',
              { 'chat-profile-content__achievement-list--expanded': gridProps.expanded },
            ],
          },
          gridProps.achievements.map((achievement) =>
            h(
              'span',
              {
                class: 'chat-profile-content__achievement',
                key: achievement.key,
                role: 'button',
                tabindex: 0,
                'aria-label': t('communityChat.profile.viewAchievementDetail', {
                  name: achievementName(achievement.key),
                }),
                onClick: () => openAchievementDetail(achievement),
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  openAchievementDetail(achievement);
                },
              },
              [
                h(AchievementEmblem, {
                  achievementKey: achievement.key,
                  group: achievement.group,
                  size: 30,
                }),
                h('span', [
                  h('strong', achievementName(achievement.key)),
                  h('small', achievementGroupName(achievement.group)),
                ]),
              ],
            ),
          ),
        );
      };
    },
  });

  const subviewTitle = computed(() => {
    if (view.value === 'achievements') return t('communityChat.profile.allAchievements');
    if (view.value === 'preview') return t('communityChat.profile.previewTitle');
    return t('communityChat.profile.editTitle');
  });

  const draftBioLength = computed(() => {
    const value = String(draftBio.value || '');
    if (typeof Intl?.Segmenter === 'function') {
      return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)).length;
    }
    return Array.from(value).length;
  });

  const selectedAchievements = computed(() => {
    const byKey = new Map((props.ownProfile?.availableAchievements || []).map((item) => [item.key, item]));
    return draftFeaturedKeys.value
      .map((key) => byKey.get(key))
      .filter((item): item is CommunityChatPublicAchievement => Boolean(item));
  });

  const availableUnselectedAchievements = computed(() => {
    const selected = new Set(draftFeaturedKeys.value);
    return (props.ownProfile?.availableAchievements || []).filter((item) => !selected.has(item.key));
  });

  function syncDraft() {
    if (!props.ownProfile) return;
    draftBio.value = props.ownProfile.bio || '';
    draftShowTenure.value = props.ownProfile.showCommunityTenure;
    draftFeaturedKeys.value = [...props.ownProfile.featuredAchievementKeys];
    draftBaseRevision.value = props.ownProfile.revision;
  }

  function beginEdit() {
    view.value = 'edit';
    syncDraft();
    emit('requestOwn');
  }

  function openPreview() {
    view.value = 'preview';
  }

  function openAllAchievements() {
    view.value = 'achievements';
    emit('loadAllAchievements');
  }

  function addAchievement(key: string) {
    if (draftFeaturedKeys.value.length >= 3 || draftFeaturedKeys.value.includes(key)) return;
    draftFeaturedKeys.value = [...draftFeaturedKeys.value, key];
  }

  function removeAchievement(key: string) {
    draftFeaturedKeys.value = draftFeaturedKeys.value.filter((item) => item !== key);
  }

  function moveAchievement(index: number, offset: -1 | 1) {
    const targetIndex = index + offset;
    if (index < 0 || targetIndex < 0 || targetIndex >= draftFeaturedKeys.value.length) return;
    const next = [...draftFeaturedKeys.value];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    draftFeaturedKeys.value = next;
  }

  function saveDraft() {
    if (!props.ownProfile || props.saving || draftBioLength.value > 60) return;
    emit('save', {
      bio: draftBio.value,
      showCommunityTenure: draftShowTenure.value,
      featuredAchievementKeys: [...draftFeaturedKeys.value],
      baseRevision: draftBaseRevision.value,
    });
  }

  watch(view, (nextView) => emit('viewChange', nextView), { immediate: true });

  watch(
    () => props.sessionKey,
    () => {
      view.value = 'summary';
      syncDraft();
    },
  );

  watch(
    () => props.ownProfile?.revision,
    (revision) => {
      if (revision === undefined || props.saving) return;
      if (view.value !== 'edit' || revision !== draftBaseRevision.value) syncDraft();
    },
  );

  watch(
    () => props.saving,
    (saving, wasSaving) => {
      if (!wasSaving || saving || !props.ownProfile) return;
      if (props.ownProfile.revision !== draftBaseRevision.value) {
        syncDraft();
        view.value = 'summary';
      }
    },
  );
</script>

<style lang="less">
  .chat-profile-content {
    min-height: 260px;
    display: grid;
    align-content: start;
    gap: 16px;
    color: var(--text-color);
  }

  .chat-profile-content--editing {
    height: 100%;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .chat-profile-content__state,
  .chat-profile-content__subview-state {
    min-height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 9px;
    color: var(--desc-color);
    text-align: center;
  }

  .chat-profile-content__state strong {
    color: var(--text-color);
    font-size: 14px;
  }

  .chat-profile-content__state > span:not(.chat-profile-content__state-icon) {
    max-width: 340px;
    font-size: 11px;
    line-height: 1.6;
  }

  .chat-profile-content__state-icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 13px;
    color: var(--primary-color);
  }

  .chat-profile-content__identity {
    min-width: 0;
    padding: 15px;
    display: flex;
    align-items: center;
    gap: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--workspace-panel-bg-color);
  }

  .chat-profile-content__avatar {
    width: 76px;
    height: 76px;
    flex: 0 0 76px;
    display: grid;
    place-items: center;
  }

  .chat-profile-content__avatar-image {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    background-color: var(--card-background);
  }

  .chat-profile-content__avatar-image img,
  .chat-profile-content__avatar-image .icon-base64,
  .chat-profile-content__avatar-image .icon-fixed-base64 {
    width: 100% !important;
    height: 100% !important;
    border-radius: inherit;
    object-fit: cover;
  }

  .chat-profile-content__identity-copy {
    min-width: 0;
    display: grid;
    gap: 7px;
  }

  .chat-profile-content__identity-copy > strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-profile-content__identity-copy > small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .chat-profile-content__community-id {
    width: fit-content;
    padding: 2px 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--primary-color) !important;
    background: var(--card-background);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    letter-spacing: 0.02em;
  }

  .chat-profile-content__identity-tags {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chat-profile-content__level,
  .chat-profile-content__role,
  .chat-profile-content__rarity {
    min-height: 22px;
    padding: 2px 8px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--card-background);
    font-size: 10px;
    font-weight: 700;
  }

  .chat-profile-content__role {
    border-color: var(--surface-border-color);
    color: var(--desc-color);
  }

  .chat-profile-content__rarity.is-epic,
  .chat-profile-content__rarity.is-legendary {
    border-color: #ad6800;
    color: #874d00;
  }

  .chat-profile-content__bio,
  .chat-profile-content__achievements,
  .chat-profile-content__featured-editor,
  .chat-profile-content__subview {
    min-width: 0;
    display: grid;
    gap: 10px;
  }

  .chat-profile-content__bio > p,
  .chat-profile-content__preview-card > p,
  .chat-profile-content__subview-description {
    margin: 0;
    color: var(--text-color);
    font-size: 11px;
    line-height: 1.7;
  }

  .chat-profile-content__bio > p.is-empty,
  .chat-profile-content__preview-card > p.is-empty {
    color: var(--desc-color);
  }

  .chat-profile-content__tenure {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--desc-color) !important;
  }

  .chat-profile-content__section-heading,
  .chat-profile-content__section-heading > span {
    display: flex;
    align-items: center;
  }

  .chat-profile-content__section-heading {
    justify-content: space-between;
    gap: 12px;
  }

  .chat-profile-content__section-heading > span {
    gap: 7px;
    color: var(--primary-color);
  }

  .chat-profile-content__section-heading strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .chat-profile-content__section-heading small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .chat-profile-content__achievement-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .chat-profile-content__achievement-list--expanded {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chat-profile-content__achievement {
    min-width: 0;
    min-height: 50px;
    padding: 7px 9px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
    cursor: pointer;
  }

  .chat-profile-content__achievement:focus-visible,
  .chat-profile-content__selected-item:focus-visible,
  .chat-profile-content__available-item:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .chat-profile-content__achievement-icon {
    align-self: center;
  }

  .chat-profile-content__achievement > span:last-child,
  .chat-profile-content__selected-item > span:nth-child(2),
  .chat-profile-content__available-item > span:nth-child(2) {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .chat-profile-content__achievement strong,
  .chat-profile-content__achievement small,
  .chat-profile-content__selected-item strong,
  .chat-profile-content__selected-item small,
  .chat-profile-content__available-item strong,
  .chat-profile-content__available-item small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-profile-content__achievement strong,
  .chat-profile-content__selected-item strong,
  .chat-profile-content__available-item strong {
    color: var(--text-color);
    font-size: 11px;
  }

  .chat-profile-content__achievement small,
  .chat-profile-content__selected-item small,
  .chat-profile-content__available-item small {
    color: var(--desc-color);
    font-size: 9px;
  }

  .chat-profile-content__empty,
  .chat-profile-content__selection-empty {
    min-height: 72px;
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 6px;
    border: 1px dashed var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    font-size: 10px;
    text-align: center;
  }

  .chat-profile-content__view-all {
    width: 100%;
    min-height: 36px;
    gap: 5px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .chat-profile-content__actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: 8px;
  }

  .chat-profile-content__actions--own {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chat-profile-content__actions--moderation {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chat-profile-content__actions--moderation.is-single {
    grid-template-columns: minmax(0, 1fr);
  }

  .chat-profile-content__actions .b_btn {
    width: 100%;
    gap: 5px;
  }

  .chat-profile-content__visitor-action {
    padding: 11px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }

  .chat-profile-content__visitor-action > span {
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.5;
  }

  .chat-profile-content__privacy {
    margin: 0;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.6;
  }

  .chat-profile-content__privacy .svg-icon {
    flex: 0 0 auto;
    margin-top: 1px;
  }

  .chat-profile-content__subview-header {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  }

  .chat-profile-content__subview-header > strong {
    grid-column: 2;
    overflow: hidden;
    color: var(--text-color);
    font-size: 14px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-profile-content__back {
    min-width: 78px;
    padding-inline: 8px;
    gap: 3px;
    color: var(--desc-color);
    background: transparent;
  }

  .chat-profile-content__subview-description {
    color: var(--desc-color);
  }

  .chat-profile-content__preview-card {
    padding: 12px;
    display: grid;
    gap: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color);
  }

  .chat-profile-content__field {
    min-width: 0;
    display: grid;
    gap: 7px;
  }

  .chat-profile-content__field > span,
  .chat-profile-content__available-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .chat-profile-content__field strong,
  .chat-profile-content__available-heading strong,
  .chat-profile-content__toggle-row strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .chat-profile-content__field small,
  .chat-profile-content__available-heading small,
  .chat-profile-content__toggle-row small {
    color: var(--desc-color);
    font-size: 9px;
  }

  .chat-profile-content__field small.is-invalid {
    color: var(--danger-color, #d9363e);
  }

  .chat-profile-content__field .b-textarea {
    width: 100%;
    min-height: 84px;
    box-sizing: border-box;
    resize: vertical;
  }

  .chat-profile-content__toggle-row {
    padding: 11px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }

  .chat-profile-content__toggle-row > span {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .chat-profile-content__selected-list {
    display: grid;
    gap: 7px;
  }

  .chat-profile-content__selected-item {
    min-width: 0;
    padding: 8px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
    cursor: pointer;
  }

  .chat-profile-content__order-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .chat-profile-content__order-actions .b_btn {
    min-width: 30px;
    padding-inline: 7px;
    font-size: 9px;
  }

  .chat-profile-content__available-heading {
    margin-top: 4px;
  }

  .chat-profile-content__available-grid {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 12px;
    row-gap: 8px;
  }

  .chat-profile-content__available-item {
    min-width: 0;
    max-width: 100%;
    height: auto;
    min-height: 48px;
    padding: 7px;
    box-sizing: border-box;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--text-color);
    background: var(--card-background);
    line-height: normal;
    text-align: left;
    cursor: pointer;
  }

  .chat-profile-content__available-item:hover,
  .chat-profile-content__selected-item:hover,
  .chat-profile-content__achievement:hover {
    border-color: var(--primary-color);
  }

  .chat-profile-content__add-achievement.b_btn {
    width: 30px;
    min-width: 30px;
    padding: 0;
    color: var(--primary-color);
    font-size: 17px;
  }

  .chat-profile-content__editor {
    min-height: 0;
    height: 100%;
    overflow: hidden;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 0;
  }

  .chat-profile-content__editor-scroll {
    min-height: 0;
    min-width: 0;
    padding: 2px 6px 18px 2px;
    box-sizing: border-box;
    display: grid;
    align-content: start;
    gap: 10px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .chat-profile-content__editor-actions {
    position: relative;
    z-index: 3;
    margin: 0 -20px -20px;
    padding: 12px 20px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    border-top: 1px solid var(--surface-border-color);
    background-color: var(--background-color);
    box-shadow: 0 -10px 24px rgba(15, 23, 42, 0.06);
  }

  .chat-profile-content__achievement-detail {
    min-width: 0;
    padding: 8px 6px 6px;
    display: grid;
    justify-items: center;
    gap: 12px;
    text-align: center;
  }

  .chat-profile-content__achievement-detail-copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .chat-profile-content__achievement-detail-copy strong {
    color: var(--text-color);
    font-size: 18px;
  }

  .chat-profile-content__achievement-detail-copy span,
  .chat-profile-content__achievement-detail p {
    color: var(--desc-color);
    font-size: 11px;
  }

  .chat-profile-content__achievement-detail p {
    margin: 0;
    line-height: 1.7;
  }

  .chat-profile-content__achievement-unlocked {
    min-height: 26px;
    padding: 3px 11px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
    font-size: 10px;
    font-weight: 700;
  }

  @media (max-width: 520px) {
    .chat-profile-content {
      min-height: 0;
      gap: 14px;
    }

    .chat-profile-content__identity {
      padding: 12px;
    }

    .chat-profile-content__achievement-list,
    .chat-profile-content__achievement-list--expanded {
      grid-template-columns: minmax(0, 1fr);
    }

    .chat-profile-content__available-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .chat-profile-content__visitor-action {
      align-items: stretch;
      flex-direction: column;
    }

    .chat-profile-content__visitor-action .b_btn,
    .chat-profile-content__editor-actions .b_btn {
      min-height: 44px;
    }

    .chat-profile-content__selected-item {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .chat-profile-content__order-actions {
      grid-column: 1 / -1;
      justify-content: flex-end;
    }

    .chat-profile-content__available-item {
      min-height: 58px;
      padding: 7px;
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .chat-profile-content__add-achievement.b_btn {
      grid-column: auto;
      width: 30px;
    }

    .chat-profile-content__editor-actions {
      margin-right: -16px;
      margin-bottom: calc(-16px - env(safe-area-inset-bottom));
      margin-left: -16px;
      padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
    }
  }

  html.light-note-mobile-rendering .chat-profile-content__identity,
  html.light-note-mobile-rendering .chat-profile-content__achievement,
  html.light-note-mobile-rendering .chat-profile-content__level,
  html.light-note-mobile-rendering .chat-profile-content__selected-item,
  html.light-note-mobile-rendering .chat-profile-content__toggle-row {
    box-shadow: none;
  }

  html.light-note-mobile-rendering .chat-profile-content__editor-actions {
    box-shadow: none;
  }
</style>
