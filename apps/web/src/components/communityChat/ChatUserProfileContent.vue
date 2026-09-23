<template>
  <div class="chat-profile-content">
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
        <div :class="{ 'chat-profile-content__hero': $slots.identityActions }">
          <ProfileIdentity :profile="profile"><slot name="identityDescription" /></ProfileIdentity>
          <slot name="identityActions" />
        </div>
        <CommunityProfileActions
          v-if="communityActions && profile.userPublicId"
          :user-public-id="profile.userPublicId"
          :prepared-profile="actionsProfile"
          @navigate="emit('navigate', $event)"
        />

        <section
          v-if="!$slots.identityDescription"
          class="chat-profile-content__bio"
          :aria-label="t('communityChat.profile.bio')"
        >
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
            <slot name="achievementActions" />
          </div>

          <AchievementGrid :achievements="featuredAchievements" />

          <BButton
            v-if="hasMoreAchievements && !compact"
            type="text"
            class="chat-profile-content__view-all"
            @click="openAllAchievements"
          >
            {{ t('communityChat.profile.viewAllAchievements', { count: profile.achievementCount }) }}
            <SvgIcon :src="icon.arrow_right" size="15" aria-hidden="true" />
          </BButton>
        </section>

        <div v-if="isOwn" class="chat-profile-content__actions chat-profile-content__actions--own">
          <BButton type="primary" @click="beginEdit">
            <SvgIcon :src="icon.communityChat.profileEdit" size="16" aria-hidden="true" />
            {{ t('community.feed.editProfile') }}
          </BButton>
        </div>

        <div
          v-else-if="authenticated && chatActions"
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

        <div v-else-if="!authenticated && chatActions" class="chat-profile-content__visitor-action">
          <span>{{ t('communityChat.profile.visitorHint') }}</span>
          <BButton type="primary" @click="emit('login')">{{ t('communityChat.guestLoginAction') }}</BButton>
        </div>

        <p v-if="!compact" class="chat-profile-content__privacy">
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
    </template>
  </div>

  <BModal
    v-if="detailAchievement"
    v-model:visible="detailVisible"
    :title="t('communityChat.profile.achievementDetailTitle')"
    width="min(var(--ui-layout-380, 380px), 90vw)"
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
  import CommunityProfileActions from '@/components/community/CommunityProfileActions.vue';
  import { computed, defineComponent, h, ref, watch, type PropType } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type {
    CommunityChatAuthorProfile,
    CommunityChatOwnProfile,
    CommunityChatPublicAchievement,
  } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AchievementEmblem from '@/components/growth/AchievementEmblem.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import GrowthLevelChip from '@/components/growth/GrowthLevelChip.vue';
  import icon from '@/config/icon';
  import { frameVariant } from '@/config/growthFrames';
  import type {
    CommunityChatProfileUpdateInput,
    CommunityProfileActionsState,
  } from '@/composables/useCommunityChatProfile';

  type ProfileView = 'summary' | 'achievements';

  const props = withDefaults(
    defineProps<{
      compact?: boolean;
      communityActions?: boolean;
      chatActions?: boolean;
      actionsProfile?: CommunityProfileActionsState | null;
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
      compact: false,
      communityActions: true,
      chatActions: true,
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
    navigate: [path: string];
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
  const featuredAchievements = computed(() => (props.profile?.achievements || []).slice(0, 3));
  const hasMoreAchievements = computed(() => {
    if (!props.profile) return false;
    return (
      Boolean(props.profile.hasMoreAchievements) ||
      props.profile.achievementCount > featuredAchievements.value.length ||
      props.profile.achievements.length > featuredAchievements.value.length
    );
  });

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
    setup(identityProps, { slots }) {
      return () => {
        const profile = identityProps.profile;
        const validFrameId = profile.frameId && frameVariant(profile.frameId) ? profile.frameId : null;
        const avatar = validFrameId
          ? h(AvatarFramePreview, {
              frameId: validFrameId,
              src: profile.avatar || icon.communityChat.defaultAvatar,
              size: props.compact ? 52 : 68,
            })
          : h(SvgIcon, {
              class: 'chat-profile-content__avatar-image',
              densityAware: false,
              src: profile.avatar || icon.communityChat.defaultAvatar,
              size: props.compact ? 52 : 68,
            });
        const tags = [
          h(GrowthLevelChip, {
            class: 'chat-profile-content__level',
            level: profile.level,
            name: profile.levelName,
          }),
        ];
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
          h(
            'span',
            {
              class: ['chat-profile-content__avatar', { 'is-framed': validFrameId }],
              'aria-hidden': 'true',
            },
            [avatar],
          ),
          h('div', { class: 'chat-profile-content__identity-copy' }, [
            h('strong', profile.name || t('communityChat.memberFallback')),
            profile.communityId
              ? h('small', { class: 'chat-profile-content__community-id' }, `@${profile.communityId}`)
              : null,
            h('span', { class: 'chat-profile-content__identity-tags' }, tags),
            profile.title ? h('small', profile.title) : null,
            slots.default?.(),
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
                  size: props.compact ? 38 : 30,
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

  const subviewTitle = computed(() => t('communityChat.profile.allAchievements'));
  function beginEdit() {
    emit('navigate', '/community/profile');
  }
  function openAllAchievements() {
    view.value = 'achievements';
    emit('loadAllAchievements');
  }
  watch(view, (nextView) => emit('viewChange', nextView), { immediate: true });
  watch(
    () => props.sessionKey,
    () => {
      view.value = 'summary';
    },
  );
</script>

<style lang="less">
  .chat-profile-content {
    min-height: var(--ui-layout-260, 260px);
    display: grid;
    align-content: start;
    gap: var(--ui-space-16, 16px);
    color: var(--text-color);
  }

  .chat-profile-content--editing {
    height: 100%;
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .chat-profile-content__state,
  .chat-profile-content__subview-state {
    min-height: var(--ui-layout-240, 240px);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: var(--ui-space-9, 9px);
    color: var(--desc-color);
    text-align: center;
  }

  .chat-profile-content__state strong {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }

  .chat-profile-content__state > span:not(.chat-profile-content__state-icon) {
    max-width: var(--ui-layout-340, 340px);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.6;
  }

  .chat-profile-content__state-icon {
    width: var(--ui-layout-40, 40px);
    height: var(--ui-layout-40, 40px);
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 13px;
    color: var(--primary-color);
  }

  .chat-profile-content__identity {
    min-width: 0;
    padding: var(--ui-space-15, 15px);
    display: flex;
    align-items: center;
    gap: var(--ui-space-14, 14px);
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

  // 名片头像框沿用组件的真实外径占位，避免高阶主题越过 76px 头像盒后压住昵称与标签。
  .chat-profile-content__avatar.is-framed {
    width: auto;
    min-width: 0;
    height: auto;
    min-height: 76px;
    flex: 0 0 auto;
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
    gap: var(--ui-space-7, 7px);
  }

  .chat-profile-content__identity-copy > strong {
    overflow: hidden;
    color: var(--text-color);
    font-size: var(--ui-font-18, 18px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-profile-content__identity-copy > small {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }

  .chat-profile-content__community-id {
    width: fit-content;
    padding: var(--ui-space-2, 2px) var(--ui-space-7, 7px);
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
    gap: var(--ui-space-6, 6px);
  }

  .chat-profile-content__level.growth-level-chip {
    min-height: var(--ui-layout-22, 22px);
    padding: var(--ui-space-2, 2px) var(--ui-space-8, 8px);
    font-size: var(--ui-font-10, 10px);
  }

  .chat-profile-content__role,
  .chat-profile-content__rarity {
    min-height: var(--ui-layout-22, 22px);
    padding: var(--ui-space-2, 2px) var(--ui-space-8, 8px);
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--card-background);
    font-size: var(--ui-font-10, 10px);
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
    gap: var(--ui-space-10, 10px);
  }

  .chat-profile-content__bio > p,
  .chat-profile-content__subview-description {
    margin: 0;
    color: var(--text-color);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.7;
  }

  .chat-profile-content__bio > p.is-empty {
    color: var(--desc-color);
  }

  .chat-profile-content__tenure {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    color: var(--desc-color) !important;
  }

  .chat-profile-content__section-heading,
  .chat-profile-content__section-heading > span {
    display: flex;
    align-items: center;
  }

  .chat-profile-content__section-heading {
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
  }

  .chat-profile-content__section-heading > span {
    gap: var(--ui-space-7, 7px);
    color: var(--primary-color);
  }

  .chat-profile-content__section-heading strong {
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
  }

  .chat-profile-content__section-heading small {
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
  }

  .chat-profile-content__achievement-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-8, 8px);
  }

  .chat-profile-content__achievement-list--expanded {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .chat-profile-content__achievement {
    min-width: 0;
    min-height: var(--ui-layout-50, 50px);
    padding: var(--ui-space-7, 7px) var(--ui-space-9, 9px);
    box-sizing: border-box;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: var(--ui-space-8, 8px);
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
    gap: var(--ui-space-2, 2px);
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
    font-size: var(--ui-font-11, 11px);
  }

  .chat-profile-content__achievement small,
  .chat-profile-content__selected-item small,
  .chat-profile-content__available-item small {
    color: var(--desc-color);
    font-size: var(--ui-font-9, 9px);
  }

  .chat-profile-content__empty,
  .chat-profile-content__selection-empty {
    min-height: var(--ui-layout-72, 72px);
    margin: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: var(--ui-space-6, 6px);
    border: 1px dashed var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
    text-align: center;
  }

  .chat-profile-content__view-all.b_btn {
    width: auto;
    padding: var(--ui-space-6, 6px) 0;
    border: 0;
    font-size: var(--ui-font-13, 13px);
    min-height: var(--ui-layout-36, 36px);
    gap: var(--ui-space-5, 5px);
    color: var(--primary-color);
    background: transparent;
  }

  .chat-profile-content__actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
    gap: var(--ui-space-8, 8px);
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
    gap: var(--ui-space-5, 5px);
  }

  .chat-profile-content__visitor-action {
    padding: var(--ui-space-11, 11px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }

  .chat-profile-content__visitor-action > span {
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
    line-height: 1.5;
  }

  .chat-profile-content__privacy {
    margin: 0;
    display: flex;
    align-items: flex-start;
    gap: var(--ui-space-6, 6px);
    color: var(--desc-color);
    font-size: var(--ui-font-10, 10px);
    line-height: 1.6;
  }

  .chat-profile-content__privacy .svg-icon {
    flex: 0 0 auto;
    margin-top: var(--ui-space-1, 1px);
  }

  .chat-profile-content__subview-header {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--ui-space-10, 10px);
  }

  .chat-profile-content__subview-header > strong {
    grid-column: 2;
    overflow: hidden;
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-profile-content__back {
    min-width: var(--ui-layout-78, 78px);
    padding-inline: var(--ui-space-8, 8px);
    gap: var(--ui-space-3, 3px);
    color: var(--desc-color);
    background: transparent;
  }

  .chat-profile-content__subview-description {
    color: var(--desc-color);
  }

  .chat-profile-content__achievement-detail {
    min-width: 0;
    padding: var(--ui-space-8, 8px) var(--ui-space-6, 6px) var(--ui-space-6, 6px);
    display: grid;
    justify-items: center;
    gap: var(--ui-space-12, 12px);
    text-align: center;
  }

  .chat-profile-content__achievement-detail-copy {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-4, 4px);
  }

  .chat-profile-content__achievement-detail-copy strong {
    color: var(--text-color);
    font-size: var(--ui-font-18, 18px);
  }

  .chat-profile-content__achievement-detail-copy span,
  .chat-profile-content__achievement-detail p {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }

  .chat-profile-content__achievement-detail p {
    margin: 0;
    line-height: 1.7;
  }

  .chat-profile-content__achievement-unlocked {
    min-height: var(--ui-layout-26, 26px);
    padding: var(--ui-space-3, 3px) var(--ui-space-11, 11px);
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
    font-size: var(--ui-font-10, 10px);
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

    .chat-profile-content__visitor-action {
      align-items: stretch;
      flex-direction: column;
    }

    .chat-profile-content__visitor-action .b_btn {
      min-height: 44px;
    }
  }

  html.light-note-mobile-rendering .chat-profile-content__identity,
  html.light-note-mobile-rendering .chat-profile-content__achievement,
  html.light-note-mobile-rendering .chat-profile-content__level {
    box-shadow: none;
  }
</style>
