<template>
  <!-- ui-density-fixed: 桌面弹框高度上限是视口预算；内部尺寸跟随密度，让紧凑档增加可见选项。 -->
  <BModal
    :visible="open"
    :title="t('profileAppearance.title')"
    width="var(--ui-layout-960, 960px)"
    height="min(88vh, 760px)"
    modal-class="appearance-studio-modal"
    content-class="appearance-studio-modal__content"
    fullscreen-mobile
    :close-disabled="busy || avatar.saving.value"
    @close="close"
  >
    <template #mobileHeader="{ close: closeModal }">
      <div class="appearance-studio__mobile-header">
        <BButton
          type="text"
          icon-only
          class="appearance-studio__back"
          :aria-label="t('common.back')"
          :disabled="busy || avatar.saving.value"
          @click="closeModal"
        >
          <SvgIcon :src="icon.arrow_left" size="23" aria-hidden="true" />
        </BButton>
        <h2>{{ t('profileAppearance.title') }}</h2>
        <BButton
          v-if="isTrying"
          type="text"
          class="appearance-studio__mobile-revert"
          :disabled="busy || avatar.saving.value"
          @click="revertTrial"
          >{{ t('profileAppearance.revert') }}</BButton
        >
      </div>
    </template>
    <template #title
      ><span class="appearance-studio__title"
        >{{ t('profileAppearance.title')
        }}<span v-if="isTrying" class="appearance-studio__trial" role="status"
          ><span class="appearance-studio__trial-dot" aria-hidden="true" />{{ t('profileAppearance.trying')
          }}<BButton type="text" size="small" @click="revertTrial">{{ t('profileAppearance.revert') }}</BButton></span
        ></span
      ></template
    >
    <div class="appearance-studio">
      <section class="appearance-studio__stage" :aria-label="t('profileAppearance.preview')">
        <ChatUserProfileContent
          identity-only
          stable-layout
          :compact="isMobileLayout"
          :profile="stageProfile"
          :community-actions="false"
          :chat-actions="false"
          authenticated
          ><template v-if="stageProfile.bio && !isMobileLayout" #identityDescription
            ><p class="appearance-studio__bio">{{ stageProfile.bio }}</p></template
          ></ChatUserProfileContent
        >
      </section>

      <div class="appearance-studio__toolbar">
        <BTabs v-model:active-tab="category" variant="line" :options="categoryOptions" />
        <BTabs
          v-if="category !== 'avatar'"
          v-model:active-tab="filter"
          class="appearance-studio__filters"
          variant="pill"
          :options="filterOptions"
        />
      </div>

      <div ref="listElement" v-auto-scrollbar class="appearance-studio__list">
        <ProfileAvatarOptions
          v-if="category === 'avatar'"
          :selected-id="avatar.selectedId.value"
          :source-kind="avatar.kind.value"
          :disabled="busy || avatar.saving.value"
          :preparing="avatar.preparing.value"
          :prepare-error="avatar.error.value === 'prepare'"
          @select="avatar.selectBuiltin"
          @upload="avatar.upload"
          @restore="avatar.selectDefault"
        />
        <BLoading
          v-else-if="shopLoading && !shop"
          class="appearance-studio__state"
          inline
          :loading="true"
          :title="t('common.loading')"
        />
        <div v-else-if="!shop" class="appearance-studio__state" role="status">
          <span>{{ t('profileAppearance.loadFailed') }}</span>
          <BButton size="small" @click="loadCatalog">{{ t('community.feed.retry') }}</BButton>
        </div>
        <template v-else>
          <div
            v-if="category === 'background'"
            class="appearance-studio__backgrounds"
            role="group"
            :aria-label="t('profileAppearance.background')"
          >
            <BButton
              v-for="option in visibleBackgroundOptions"
              :key="option.id ?? 'default'"
              class="appearance-tile appearance-tile--background"
              :class="{ 'is-selected': trial.background === option.id }"
              :aria-pressed="trial.background === option.id"
              @click="trial.background = option.id"
            >
              <span class="appearance-tile__art" :class="{ 'is-default': !option.id }">
                <ProfileBackgroundArt v-if="option.id" :background-id="option.id" thumbnail />
                <span v-else class="appearance-tile__swatch">{{ t('profileAppearance.defaultSwatch') }}</span>
                <span v-if="option.animated" class="appearance-tile__motion">{{ t('profileAppearance.motion') }}</span>
                <span v-if="trial.background === option.id" class="appearance-tile__check" aria-hidden="true"
                  ><SvgIcon :src="icon.filterPanel.check" size="12"
                /></span>
              </span>
              <span class="appearance-tile__copy">
                <strong>{{ option.name }}</strong>
                <small :class="metaState(option)"
                  ><SvgIcon v-if="metaIcon(option)" :src="metaIcon(option)!" size="12" aria-hidden="true" />{{
                    metaText(option)
                  }}</small
                >
              </span>
            </BButton>
          </div>

          <template v-else>
            <section
              v-for="group in visibleFrameGroups"
              :key="group.rarity"
              class="appearance-studio__group"
              :class="`is-${group.rarity}`"
            >
              <h4 class="appearance-studio__group-title"
                >{{ t(`growth.frameRarity.${group.rarity}`) }}<span>{{ group.options.length }}</span></h4
              >
              <div class="appearance-studio__frames" role="group" :aria-label="t(`growth.frameRarity.${group.rarity}`)">
                <BButton
                  v-for="option in group.options"
                  :key="option.id ?? 'none'"
                  class="appearance-tile appearance-tile--frame"
                  :class="{ 'is-selected': trial.frame === option.id }"
                  :aria-pressed="trial.frame === option.id"
                  @click="trial.frame = option.id"
                >
                  <span class="appearance-tile__frame">
                    <AvatarFramePreview
                      v-if="option.id"
                      :frame-id="option.id"
                      :src="avatarSrc"
                      :size="dimension(44, 'layout')"
                      layout-mode="slot"
                      pause-when-offscreen
                    />
                    <SvgIcon
                      v-else
                      class="appearance-tile__bare"
                      :src="avatarSrc"
                      :size="dimension(44, 'layout')"
                      :density-aware="false"
                    />
                    <span v-if="trial.frame === option.id" class="appearance-tile__check" aria-hidden="true"
                      ><SvgIcon :src="icon.filterPanel.check" size="12"
                    /></span>
                  </span>
                  <strong>{{ option.name }}</strong>
                  <small :class="metaState(option)"
                    ><SvgIcon v-if="metaIcon(option)" :src="metaIcon(option)!" size="12" aria-hidden="true" />{{
                      metaText(option)
                    }}</small
                  >
                </BButton>
              </div>
            </section>
          </template>

          <div v-if="filter === 'owned' && !ownedCount" class="appearance-studio__empty">
            <strong>{{ t('profileAppearance.emptyTitle') }}</strong>
            <span>{{ t('profileAppearance.emptyHint') }}</span>
            <BButton size="small" @click="filter = 'all'">{{ t('profileAppearance.showAll') }}</BButton>
          </div>
        </template>
      </div>
    </div>

    <template #footer>
      <div class="appearance-studio__footer">
        <template v-if="category === 'avatar'">
          <div class="appearance-studio__selection">
            <strong>{{ avatarName }}</strong>
            <small v-if="avatar.error.value === 'save'" role="alert">{{
              t('profileAppearance.avatarSaveFailed')
            }}</small>
            <small v-else>{{ avatarHint }}</small>
          </div>
          <div class="appearance-studio__actions">
            <span
              v-if="!avatar.changed.value && !avatar.preparing.value && !avatar.error.value && avatar.canEdit.value"
              class="appearance-studio__using"
            >
              <SvgIcon :src="icon.filterPanel.check" size="15" aria-hidden="true" />{{
                t('profileAppearance.action.using')
              }}
            </span>
            <BButton
              v-else
              class="appearance-studio__primary"
              type="primary"
              :loading="avatar.saving.value"
              :disabled="
                busy ||
                avatar.preparing.value ||
                avatar.error.value === 'prepare' ||
                Boolean(user.adminContext) ||
                (!avatar.changed.value && avatar.canEdit.value)
              "
              @click="useAvatar"
              >{{
                t(
                  user.adminContext
                    ? 'profileAppearance.avatarReadOnly'
                    : avatar.canEdit.value
                      ? 'myInfo.useAvatar'
                      : 'myInfo.loginToDecorate',
                )
              }}</BButton
            >
          </div>
        </template>
        <div v-else-if="shop" class="appearance-studio__selection">
          <strong
            >{{ current.name
            }}<span v-if="current.rarity" class="appearance-studio__chip" :class="`is-${current.rarity}`">{{
              t(`growth.frameRarity.${current.rarity}`)
            }}</span
            ><span v-if="current.animated" class="appearance-studio__chip">{{
              t('profileAppearance.motion')
            }}</span></strong
          >
          <small>{{
            isMobileLayout && current.category === 'background' && current.item
              ? t(
                  current.item.owned
                    ? 'profileAppearance.hint.backgroundOwnedShort'
                    : 'profileAppearance.hint.backgroundRedeemShort',
                )
              : footerHint
          }}</small>
        </div>
        <div v-if="category !== 'avatar' && shop" class="appearance-studio__actions">
          <span v-if="!shop.isVisitor" class="appearance-studio__balance" :title="t('profileAppearance.balance')"
            ><SvgIcon :src="icon.growth.coin" size="15" aria-hidden="true" />{{ shop.points.toLocaleString() }}</span
          >
          <span v-if="action.kind === 'using'" class="appearance-studio__using"
            ><SvgIcon :src="icon.filterPanel.check" size="15" aria-hidden="true" />{{
              t('profileAppearance.action.using')
            }}</span
          >
          <template v-else>
            <BButton v-if="action.kind === 'shortfall'" type="text" @click="goTo('tasks')">{{
              t('myInfo.earnPoints')
            }}</BButton>
            <BButton
              class="appearance-studio__primary"
              :type="action.primary ? 'primary' : undefined"
              :disabled="action.disabled || busy || !shop"
              :loading="busy"
              @click="runAction"
              ><SvgIcon v-if="action.kind === 'buy'" :src="icon.growth.coin" size="14" aria-hidden="true" />{{
                action.label
              }}</BButton
            >
          </template>
        </div>
      </div>
    </template>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore, useUserStore } from '@/store';
  import { useGrowth, type ShopItem } from '@/composables/useGrowth';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { useUiDensity } from '@/composables/useUiDensity';
  import { recordOperation } from '@/api/commonApi';
  import type { CommunityChatAuthorProfile } from '@/api/communityChatApi';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { profileBackground } from '@/config/profileBackgrounds';
  import { frameVariant, sortFramesByRarity } from '@/config/growthFrames';
  import icon from '@/config/icon';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import ChatUserProfileContent from '@/components/communityChat/ChatUserProfileContent.vue';
  import ProfileBackgroundArt from './ProfileBackgroundArt.vue';
  import AvatarFramePreview from './AvatarFramePreview.vue';
  import ProfileAvatarOptions from '@/components/personCenter/myInfo/ProfileAvatarOptions.vue';
  import { useProfileAvatar } from '@/composables/useProfileAvatar';
  import { BUILTIN_AVATARS } from '@/config/builtinAvatars';

  type DecorationCategory = 'background' | 'frame';
  type Category = 'avatar' | DecorationCategory;
  type Rarity = NonNullable<ShopItem['rarity']>;
  type Option = {
    category: DecorationCategory;
    id: string | null;
    name: string;
    item: ShopItem | null;
    rarity: Rarity | null;
    animated: boolean;
  };
  type ActionKind =
    'using' | 'use' | 'login' | 'buy' | 'claim' | 'achievement' | 'growth' | 'shortfall' | 'maintenance';

  const props = defineProps<{
    open: boolean;
    /** 保留资料表单的昵称、简介草稿；头像、背景与头像框由装扮试穿状态覆盖。 */
    profile: CommunityChatAuthorProfile;
    initialTab?: Category;
  }>();
  const emit = defineEmits<{
    'update:open': [value: boolean];
    navigate: [destination: 'growth' | 'tasks' | 'achievements'];
    'avatar-saved': [];
    saved: [];
  }>();

  const { t, te } = useI18n();
  const { dimension } = useUiDensity();
  const isMobileLayout = useMobileLayout();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const {
    growth,
    shop,
    shopLoading,
    dashboard,
    loadShop,
    loadDashboard,
    buyItem,
    equipFrame,
    equipBackground,
    claimAchievement,
  } = useGrowth();

  const category = ref<Category>('avatar');
  const avatar = useProfileAvatar(computed(() => props.open));
  const selectedAvatar = computed(() => BUILTIN_AVATARS.find((item) => item.id === avatar.selectedId.value));
  const avatarName = computed(() =>
    selectedAvatar.value
      ? t(selectedAvatar.value.nameKey)
      : t(
          avatar.kind.value === 'custom'
            ? 'myInfo.customAvatarSelected'
            : avatar.kind.value === 'default'
              ? 'myInfo.defaultAvatar'
              : 'myInfo.currentAvatar',
        ),
  );
  const avatarHint = computed(() =>
    selectedAvatar.value
      ? t(selectedAvatar.value.descriptionKey)
      : t('profileAppearance.avatarImmediate'),
  );
  const filter = ref<'all' | 'owned'>('all');
  const trial = reactive<{ background: string | null; frame: string | null }>({ background: null, frame: null });
  const busy = ref(false);
  const listElement = ref<HTMLElement | null>(null);
  let generation = 0;
  onBeforeUnmount(() => generation++);

  const avatarSrc = computed(() => avatar.source.value || icon.communityChat.defaultAvatar);
  const equipped = computed(() => {
    const frame = shop.value ? shop.value.equippedFrame : growth.value?.equippedFrame;
    const background = shop.value ? shop.value.equippedBackground : growth.value?.equippedBackground;
    return {
      background: profileBackground(background) ? (background as string) : null,
      frame: frame && frameVariant(frame) ? frame : null,
    };
  });

  const backgroundItems = computed(
    () => shop.value?.items.filter((item) => item.effect === 'background' && profileBackground(item.id)) || [],
  );
  const frameItems = computed(() =>
    sortFramesByRarity(
      (
        shop.value?.frames ||
        shop.value?.items.filter((item) => item.type === 'cosmetic' && item.effect === 'frame') ||
        []
      ).filter((item) => frameVariant(item.id)),
    ),
  );

  const defaultBackgroundOption = computed<Option>(() => ({
    category: 'background',
    id: null,
    name: t('profileBackgrounds.default'),
    item: null,
    rarity: null,
    animated: false,
  }));
  const noFrameOption = computed<Option>(() => ({
    category: 'frame',
    id: null,
    name: t('profileAppearance.noFrame'),
    item: null,
    rarity: null,
    animated: false,
  }));
  const backgroundOptions = computed<Option[]>(() => [
    defaultBackgroundOption.value,
    ...backgroundItems.value.map((item) => ({
      category: 'background' as const,
      id: item.id,
      name: t(`profileBackgrounds.${item.id}`),
      item,
      rarity: null,
      animated: Boolean(profileBackground(item.id)?.animated),
    })),
  ]);
  const frameOptions = computed<Option[]>(() =>
    frameItems.value.map((item) => ({
      category: 'frame' as const,
      id: item.id,
      name: itemName(item),
      item,
      rarity: item.rarity || 'basic',
      // 头像框在格子里实时播放动效，稀有度已标明档位，不再叠加「动态」标签。
      animated: false,
    })),
  );

  const passesFilter = (option: Option) => filter.value === 'all' || !option.item || option.item.owned;
  const visibleBackgroundOptions = computed(() => backgroundOptions.value.filter(passesFilter));
  const visibleFrameGroups = computed(() => {
    const groups = (['basic', 'rare', 'epic', 'legendary'] as Rarity[])
      .map((rarity) => ({
        rarity,
        options: frameOptions.value.filter((option) => option.rarity === rarity && passesFilter(option)),
      }))
      .filter((group) => group.options.length);
    // 「不佩戴」与背景的「默认背景」一样作为可选项放在首组，而不是工具栏里的文字操作。
    if (groups[0]?.rarity === 'basic') groups[0].options = [noFrameOption.value, ...groups[0].options];
    else groups.unshift({ rarity: 'basic', options: [noFrameOption.value] });
    return groups;
  });
  const ownedCount = computed(
    () =>
      (category.value === 'background' ? backgroundItems.value : frameItems.value).filter((item) => item.owned).length,
  );
  const categoryOptions = computed(() => [
    { key: 'avatar', label: t('profileAppearance.avatar') },
    { key: 'frame', label: t('profileAppearance.frame'), badge: shop.value ? frameItems.value.length : undefined },
    {
      key: 'background',
      label: t('profileAppearance.background'),
      badge: shop.value ? backgroundItems.value.length : undefined,
    },
  ]);
  const filterOptions = computed(() => [
    { key: 'all', label: t('profileAppearance.all') },
    { key: 'owned', label: t('profileAppearance.owned'), badge: shop.value ? ownedCount.value : undefined },
  ]);

  const current = computed<Option>(() => {
    if (category.value === 'background') {
      return backgroundOptions.value.find((option) => option.id === trial.background) || defaultBackgroundOption.value;
    }
    return frameOptions.value.find((option) => option.id === trial.frame) || noFrameOption.value;
  });
  const isTrying = computed(
    () =>
      avatar.changed.value ||
      avatar.preparing.value ||
      Boolean(avatar.error.value) ||
      trial.background !== equipped.value.background ||
      trial.frame !== equipped.value.frame,
  );
  const stageProfile = computed<CommunityChatAuthorProfile>(() => ({
    ...props.profile,
    avatar: avatarSrc.value,
    backgroundId: trial.background,
    frameId: trial.frame,
    frameRarity:
      frameItems.value.find((item) => item.id === trial.frame)?.rarity ??
      (trial.frame === props.profile.frameId ? props.profile.frameRarity : null),
  }));

  function itemName(item: ShopItem) {
    const key = `growth.shopItems.${item.id}.name`;
    return te(key) ? t(key) : item.name;
  }

  function itemDesc(item: ShopItem) {
    const key = `growth.shopItems.${item.id}.desc`;
    return te(key) ? t(key) : item.desc;
  }

  function canMeetLevel(item: ShopItem) {
    return Boolean(shop.value?.rootFrameAccess || !item.minLevel || (shop.value?.level || 0) >= item.minLevel);
  }

  function canEquipFrame(item: ShopItem) {
    return Boolean(item.canEquip || item.owned || shop.value?.rootFrameAccess);
  }

  function isAchievementFrame(item: ShopItem) {
    return item.acquisition === 'achievement' && Boolean(item.achievementKey);
  }

  function achievementFor(item: ShopItem) {
    return dashboard.value?.achievements.find((achievement) => achievement.key === item.achievementKey);
  }

  function achievementProgress(item: ShopItem) {
    const achievement = achievementFor(item);
    if (!achievement) return t('growth.frameAchievementLocked');
    if (achievement.claimable) return t('growth.frameAchievementReady');
    if (
      achievement.minLevel &&
      achievement.cur >= achievement.target &&
      Number(achievement.currentLevel || 0) < achievement.minLevel
    ) {
      return t('growth.frameAchievementLevelProgress', {
        cur: achievement.currentLevel || 0,
        target: achievement.minLevel,
      });
    }
    return `${Math.min(achievement.cur, achievement.target)}/${achievement.target}`;
  }

  function achievementRequirement(item: ShopItem) {
    const key = item.achievementKey ? `growth.achDesc.${item.achievementKey}` : '';
    const condition = key && te(key) ? t(key) : achievementProgress(item);
    const minLevel = achievementFor(item)?.minLevel || 0;
    return minLevel ? t('growth.frameAchievementConditionWithLevel', { condition, level: minLevel }) : condition;
  }

  const isEquipped = (option: Option) => option.id === equipped.value[option.category];
  const isUsable = (option: Option) =>
    !option.item || (option.category === 'frame' ? canEquipFrame(option.item) : option.item.owned);

  function metaText(option: Option) {
    if (isEquipped(option)) return t('profileAppearance.using');
    if (!option.item) {
      return t(option.category === 'background' ? 'profileAppearance.defaultMeta' : 'profileAppearance.noFrameMeta');
    }
    if (option.item.owned) return t('profileAppearance.owned');
    if (option.category === 'frame') {
      if (shop.value?.rootFrameAccess) return t('growth.shopRootPreview');
      if (isAchievementFrame(option.item)) return achievementProgress(option.item);
      if (!canMeetLevel(option.item)) return t('profileAppearance.levelUnlock', { n: option.item.minLevel });
    }
    return Number(option.item.cost || 0).toLocaleString();
  }

  function metaIcon(option: Option) {
    if (isEquipped(option)) return icon.filterPanel.check;
    if (!option.item || option.item.owned) return null;
    if (option.category === 'frame') {
      if (shop.value?.rootFrameAccess) return null;
      if (isAchievementFrame(option.item)) return icon.growth.reward;
      if (!canMeetLevel(option.item)) return icon.growth.lock;
    }
    return icon.growth.coin;
  }

  function metaState(option: Option) {
    const item = option.item;
    return {
      'is-using': isEquipped(option),
      'is-ready': Boolean(item && !item.owned && isAchievementFrame(item) && achievementFor(item)?.claimable),
    };
  }

  const footerHint = computed(() => {
    const option = current.value;
    const item = option.item;
    if (option.category === 'background') {
      if (!item) return t('profileAppearance.hint.defaultBackground');
      const description = t(`profileBackgrounds.${item.id}Description`).replace(/[。.]\s*$/, '');
      return `${description} · ${t(
        item.owned ? 'profileAppearance.hint.backgroundOwned' : 'profileAppearance.hint.backgroundRedeem',
      )}`;
    }
    if (!item) return t('profileAppearance.hint.noFrame');
    if (isAchievementFrame(item)) {
      return t('profileAppearance.hint.frameAchievement', {
        condition: achievementRequirement(item),
        progress: item.owned ? t('profileAppearance.hint.frameAchievementOwned') : achievementProgress(item),
      });
    }
    if (item.owned || shop.value?.rootFrameAccess) {
      return item.owned
        ? t('profileAppearance.hint.frameOwned', { desc: itemDesc(item) })
        : `${itemDesc(item)} · ${t('growth.shopRootPreview')}`;
    }
    if (!canMeetLevel(item)) return t('profileAppearance.hint.frameLevel', { desc: itemDesc(item), n: item.minLevel });
    return t('profileAppearance.hint.frameRedeem', { desc: itemDesc(item) });
  });

  const action = computed<{ kind: ActionKind; label: string; primary?: boolean; disabled?: boolean }>(() => {
    const option = current.value;
    const item = option.item;
    if (shop.value?.isVisitor) return { kind: 'login', label: t('myInfo.loginToDecorate'), primary: true };
    if (isEquipped(option)) return { kind: 'using', label: '' };
    if (isUsable(option)) {
      const background = option.category === 'background';
      const label = option.id
        ? t(background ? 'profileBackgrounds.use' : 'profileAppearance.action.use')
        : t(background ? 'profileAppearance.action.restoreDefault' : 'profileAppearance.action.removeFrame');
      return { kind: 'use', label, primary: true };
    }
    if (!item) return { kind: 'using', label: '' };
    if (option.category === 'frame' && !canMeetLevel(item)) return { kind: 'growth', label: t('myInfo.goToGrowth') };
    if (option.category === 'frame' && isAchievementFrame(item)) {
      return achievementFor(item)?.claimable
        ? { kind: 'claim', label: t('profileAppearance.action.claimAndUse'), primary: true }
        : { kind: 'achievement', label: t('growth.frameViewAchievement') };
    }
    if (!shop.value?.purchaseEnabled) {
      return { kind: 'maintenance', label: t('growth.shopMaintenanceShort'), disabled: true };
    }
    const shortfall = Number(item.cost || 0) - Number(shop.value?.points || 0);
    if (shortfall > 0) {
      return {
        kind: 'shortfall',
        label: t('profileAppearance.action.shortfall', { n: shortfall.toLocaleString() }),
        disabled: true,
      };
    }
    // 背景兑换后由用户再决定是否使用（见积分经济规则）；头像框沿用兑换即佩戴。
    const cost = Number(item.cost || 0).toLocaleString();
    return {
      kind: 'buy',
      label:
        option.category === 'background'
          ? t('profileBackgrounds.redeem', { n: cost })
          : t('profileAppearance.action.redeemAndUse', { n: cost }),
      primary: true,
    };
  });

  function resetTrial() {
    trial.background = equipped.value.background;
    trial.frame = equipped.value.frame;
  }

  function revertTrial() {
    if (!busy.value && !avatar.saving.value) {
      resetTrial();
      avatar.reset();
    }
  }

  async function loadCatalog() {
    const requestGeneration = generation;
    const touched = isTrying.value;
    const initialTrial = { ...trial };
    await Promise.all([loadShop(), loadDashboard()]);
    // 首次加载期间用户没有动过试穿时，以商店返回的权威佩戴状态为起点。
    if (
      requestGeneration === generation &&
      props.open &&
      !touched &&
      trial.background === initialTrial.background &&
      trial.frame === initialTrial.frame
    )
      resetTrial();
  }

  watch(
    () => props.open,
    (open) => {
      generation++;
      if (!open) return;
      category.value = props.initialTab || 'avatar';
      filter.value = 'all';
      busy.value = false;
      resetTrial();
      void loadCatalog();
    },
    { immediate: true },
  );
  watch([() => user.id, () => user.role, () => user.adminContext?.subjectUserId], () => {
    if (props.open) {
      busy.value = false;
      close();
    }
  });
  watch([category, filter], async () => {
    await nextTick();
    listElement.value?.scrollTo({ top: 0 });
  });

  function close() {
    if (busy.value || avatar.saving.value) return;
    generation++;
    avatar.reset();
    emit('update:open', false);
  }

  async function useAvatar() {
    if (!avatar.canEdit.value) {
      if (!user.adminContext) bookmark.isShowLogin = true;
      return;
    }
    if (await avatar.save()) {
      message.success(t('profileAppearance.avatarSaved'));
      recordOperation({ module: '个人资料', operation: '保存头像' });
      emit('avatar-saved');
      emit('saved');
    }
  }

  function goTo(destination: 'growth' | 'tasks' | 'achievements') {
    void closeCurrentMobileOverlayThen(close, () => emit('navigate', destination));
  }

  async function apply(option: Option) {
    const res = option.category === 'background' ? await equipBackground(option.id) : await equipFrame(option.id);
    return res?.status === 200 && Boolean(res.data?.ok);
  }

  function applySuccessText(option: Option) {
    if (option.category === 'background') {
      return t(option.id ? 'profileBackgrounds.used' : 'profileBackgrounds.restored');
    }
    return option.id ? t('growth.shopEquipOk', { name: option.name }) : t('growth.shopUnequipOk');
  }

  async function runGuarded(task: (isCurrent: () => boolean) => Promise<void>) {
    if (busy.value || !props.open) return;
    const requestGeneration = generation;
    const ownerId = user.id;
    const isCurrent = () => requestGeneration === generation && ownerId === user.id;
    busy.value = true;
    try {
      await task(isCurrent);
    } catch (error) {
      console.error('个人装扮操作失败:', error);
      if (isCurrent()) message.error(t('growth.operationFailed'));
    } finally {
      if (isCurrent()) busy.value = false;
    }
  }

  function useOption(option: Option) {
    return runGuarded(async (isCurrent) => {
      const ok = await apply(option);
      if (!isCurrent()) return;
      if (!ok) {
        message.error(t('growth.operationFailed'));
        return;
      }
      emit('saved');
      message.success(applySuccessText(option));
      recordOperation({
        module: '个人资料',
        operation:
          option.category === 'background'
            ? option.id
              ? `使用个人背景「${option.name}」`
              : '恢复默认个人背景'
            : option.id
              ? `佩戴头像框「${option.name}」`
              : '卸下头像框',
      });
    });
  }

  function redeemOption(option: Option) {
    const item = option.item;
    if (!item || !shop.value) return;
    const confirmationGeneration = generation;
    const confirmationOwner = user.id;
    const quote = { economyVersion: shop.value.economyVersion, expectedCost: Number(item.cost || 0) };
    const background = option.category === 'background';
    const cost = quote.expectedCost.toLocaleString();
    Alert.alert({
      title: t('profileAppearance.confirmTitle'),
      content: background
        ? t('profileBackgrounds.confirm', { n: cost, name: option.name })
        : t('profileAppearance.confirmContent', { n: cost, name: option.name }),
      okText: background
        ? t('profileBackgrounds.redeem', { n: cost })
        : t('profileAppearance.action.redeemAndUse', { n: cost }),
      cancelText: t('common.cancel'),
      onOk: () => {
        if (!props.open || confirmationGeneration !== generation || confirmationOwner !== user.id) return;
        return runGuarded(async (isCurrent) => {
          const res = await buyItem(item.id, quote);
          if (!isCurrent()) return;
          if (res?.status === 409 && res.data?.refresh) {
            message.warning(t('growth.economyCatalogChanged'));
            return;
          }
          const alreadyOwned = res?.status === 200 && res.data?.reason === 'owned';
          if (!(res?.status === 200 && (res.data?.ok || alreadyOwned))) {
            message.error(res?.data?.msg || t('growth.operationFailed'));
            return;
          }
          if (background) {
            // 试穿仍停在该背景，底部主操作随即变为「使用背景」。
            message.success(t(alreadyOwned ? 'profileBackgrounds.owned' : 'profileBackgrounds.purchased'));
            recordOperation({
              module: '个人资料',
              operation: `兑换个人背景「${option.name}」（-${quote.expectedCost} 积分）`,
            });
            return;
          }
          const ok = await apply(option);
          if (!isCurrent()) return;
          if (ok) {
            emit('saved');
            message.success(t('profileAppearance.redeemed', { name: option.name }));
          } else message.warning(t('profileAppearance.useFailedAfterGain', { name: option.name }));
          recordOperation({
            module: '个人资料',
            operation: `兑换头像框「${option.name}」（-${quote.expectedCost} 积分）${ok ? '并佩戴' : '，自动佩戴失败'}`,
          });
        });
      },
    });
  }

  function claimOption(option: Option) {
    const key = option.item?.achievementKey;
    if (!key) return;
    return runGuarded(async (isCurrent) => {
      const res = await claimAchievement(key);
      if (!isCurrent()) return;
      if (!(res?.status === 200 && res.data?.ok)) {
        message.error(res?.data?.msg || t('growth.operationFailed'));
        return;
      }
      const ok = await apply(option);
      if (!isCurrent()) return;
      if (ok) {
        emit('saved');
        message.success(t('profileAppearance.claimed', { name: option.name }));
      } else message.warning(t('profileAppearance.useFailedAfterGain', { name: option.name }));
      recordOperation({ module: '个人资料', operation: `领取成就头像框「${option.name}」${ok ? '并佩戴' : ''}` });
    });
  }

  function runAction() {
    const option = current.value;
    switch (action.value.kind) {
      case 'login':
        bookmark.isShowLogin = true;
        return;
      case 'use':
        return void useOption(option);
      case 'buy':
        return redeemOption(option);
      case 'claim':
        return void claimOption(option);
      case 'growth':
        return goTo('growth');
      case 'achievement':
        return goTo('achievements');
      default:
        return;
    }
  }
</script>

<style lang="less">
  .modal-content.appearance-studio-modal__content {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    padding-bottom: 0;
  }
</style>

<style scoped lang="less">
  .appearance-studio__mobile-header {
    box-sizing: border-box;
    width: 100%;
    height: var(--ui-layout-56, 56px);
    padding-inline: var(--ui-space-8, 8px);
    display: grid;
    grid-template-columns: var(--ui-control-44, 44px) minmax(0, 1fr) var(--ui-control-44, 44px);
    align-items: center;
  }
  .appearance-studio__mobile-header h2 {
    margin: 0;
    text-align: center;
    font-size: var(--ui-font-18, 18px);
  }
  .appearance-studio__back.b_btn {
    width: var(--ui-control-44, 44px);
    height: var(--ui-control-44, 44px);
    padding: 0;
  }
  .appearance-studio__mobile-revert.b_btn {
    padding: 0;
    font-size: var(--ui-font-12, 12px);
  }
  .appearance-studio__title {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
  }

  .appearance-studio__trial {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    height: var(--ui-control-26, 26px);
    padding: 0 var(--ui-space-2, 2px) 0 var(--ui-space-10, 10px);
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--text-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 400;
    white-space: nowrap;
  }

  .appearance-studio__trial :deep(.b_btn) {
    height: var(--ui-layout-22, 22px);
    padding: 0 var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
  }

  .appearance-studio__trial-dot {
    width: var(--ui-layout-8, 8px);
    height: var(--ui-layout-8, 8px);
    border-radius: 50%;
    background: var(--primary-color);
  }

  .appearance-studio {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  // 预览高度固定，配合名片的 stable-layout，任何切换都不会推动下方挑选区。
  .appearance-studio__stage {
    flex-shrink: 0;
    height: var(--ui-layout-176, 176px);
  }

  .appearance-studio__bio {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.6;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .appearance-studio__toolbar {
    flex-shrink: 0;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
    margin-top: var(--ui-space-12, 12px);
    border-bottom: 1px solid var(--surface-border-color);
  }

  // 分类下划线压在整行分隔线上，只保留一条线。
  .appearance-studio__toolbar :deep(.tab-container.is-line) {
    /* ui-density-fixed: 抵消 1px 分隔线，与描边宽度一致 */
    margin-bottom: -1px;
    border-bottom: 0;
  }

  .appearance-studio__toolbar :deep(.tab-container.is-pill) {
    margin-bottom: var(--ui-space-6, 6px);
  }

  .appearance-studio__list {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    margin-right: calc(-1 * var(--ui-space-12, 12px));
    padding: var(--ui-space-14, 14px) var(--ui-space-12, 12px) var(--ui-space-16, 16px) 0;
  }

  .appearance-studio__state,
  .appearance-studio__empty {
    display: grid;
    justify-items: center;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-32, 32px) 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    text-align: center;
  }

  .appearance-studio__empty strong {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }

  .appearance-tile {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    height: auto;
    min-width: 0;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-card-bg);
    color: var(--text-color);
    text-align: left;
    white-space: normal;
    line-height: 1.4;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .appearance-tile:hover,
  .appearance-tile:focus-visible,
  .appearance-tile:active {
    border-color: color-mix(in srgb, var(--primary-color) 45%, var(--surface-border-color));
    background: var(--surface-card-bg);
  }

  // 选中 = 正在试穿：实色描边 + 勾选标记；「使用中」由文字与图标单独表达。
  .appearance-tile.is-selected {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 1px var(--primary-color);
  }

  .appearance-tile__check {
    position: absolute;
    z-index: 2;
    top: var(--ui-space-6, 6px);
    right: var(--ui-space-6, 6px);
    width: var(--ui-layout-20, 20px);
    height: var(--ui-layout-20, 20px);
    display: grid;
    place-items: center;
    border: 2px solid var(--surface-card-bg);
    border-radius: 50%;
    background: var(--primary-color);
    color: #fff;
  }

  .appearance-tile strong {
    max-width: 100%;
    overflow: hidden;
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .appearance-tile small {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-3, 3px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }

  .appearance-tile small.is-using {
    color: var(--workspace-purple-text, var(--primary-color));
    font-weight: 500;
  }

  .appearance-tile small.is-ready {
    color: var(--workspace-note-text, var(--success-color));
    font-weight: 500;
  }

  .appearance-studio__backgrounds {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--ui-layout-240, 240px), 1fr));
    gap: var(--ui-space-12, 12px);
  }

  .appearance-tile--background {
    overflow: hidden;
  }

  // 缩略图比例接近真实名片横幅；大图交给上方预览。
  .appearance-tile__art {
    position: relative;
    display: block;
    aspect-ratio: 2.6;
    overflow: hidden;
    border-radius: 11px 11px 0 0;
    background: var(--workspace-canvas, var(--surface-panel-bg));
  }

  .appearance-tile__art :deep(.profile-background-art.is-thumbnail) {
    position: absolute;
    inset: 0;
    aspect-ratio: auto;
  }

  .appearance-tile__swatch {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }

  .appearance-tile__motion {
    position: absolute;
    z-index: 1;
    left: var(--ui-space-6, 6px);
    bottom: var(--ui-space-6, 6px);
    padding: var(--ui-space-1, 1px) var(--ui-space-6, 6px);
    border-radius: 6px;
    background: rgb(17 21 44 / 72%);
    color: #fff;
    font-size: var(--ui-font-11, 11px);
    line-height: 1.5;
  }

  .appearance-tile__copy {
    display: grid;
    gap: var(--ui-space-2, 2px);
    padding: var(--ui-space-8, 8px) var(--ui-space-10, 10px) var(--ui-space-10, 10px);
  }

  .appearance-studio__group + .appearance-studio__group {
    margin-top: var(--ui-space-18, 18px);
  }

  .appearance-studio__group-title {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    margin: 0 0 var(--ui-space-10, 10px);
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
    font-weight: 600;
  }

  .appearance-studio__group-title::before {
    content: '';
    /* ui-density-fixed: 稀有度色条是装饰笔画，保持细线宽度 */
    width: 3px;
    height: var(--ui-layout-12, 12px);
    border-radius: 2px;
    background: var(--appearance-rarity);
  }

  .appearance-studio__group-title span {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 400;
  }

  .is-basic {
    --appearance-rarity: #94a3b8;
  }

  .is-rare {
    --appearance-rarity: #38bdf8;
  }

  .is-epic {
    --appearance-rarity: #a78bfa;
  }

  .is-legendary {
    --appearance-rarity: #f59e0b;
  }

  .appearance-studio__frames {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--ui-layout-100, 100px), 1fr));
    gap: var(--ui-space-10, 10px);
  }

  .appearance-tile--frame {
    align-items: center;
    padding: var(--ui-space-8, 8px) var(--ui-space-6, 6px) var(--ui-space-10, 10px);
    text-align: center;
  }

  // 小槽位只承载头像本体，框体按统一设计画布向外溢出，前后景层级仍由 AvatarFramePreview 管理。
  .appearance-tile__frame {
    position: relative;
    width: var(--ui-layout-72, 72px);
    height: var(--ui-layout-72, 72px);
    margin-bottom: var(--ui-space-4, 4px);
    display: grid;
    place-items: center;
  }

  .appearance-tile--frame .appearance-tile__check {
    top: calc(-1 * var(--ui-space-2, 2px));
    right: calc(-1 * var(--ui-space-10, 10px));
  }

  .appearance-tile__bare {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
  }

  .appearance-studio__footer {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
    min-height: var(--ui-layout-64, 64px);
    padding: var(--ui-space-12, 12px) var(--ui-space-20, 20px);
    border-top: 1px solid var(--surface-border-color);
  }

  .appearance-studio__selection {
    min-width: 0;
    display: grid;
    gap: var(--ui-space-3, 3px);
  }

  .appearance-studio__selection strong {
    display: flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    color: var(--text-color);
    font-size: var(--ui-font-15, 15px);
  }

  .appearance-studio__selection small {
    overflow: hidden;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .appearance-studio__chip {
    padding: 0 var(--ui-space-6, 6px);
    border: 1px solid var(--appearance-rarity, var(--surface-border-color));
    border-radius: 6px;
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    font-weight: 500;
    line-height: 1.6;
    white-space: nowrap;
  }

  .appearance-studio__chip[class*='is-'] {
    color: var(--text-color);
  }

  .appearance-studio__actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
  }

  .appearance-studio__balance {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-4, 4px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    font-variant-numeric: tabular-nums;
  }

  .appearance-studio__using,
  .appearance-studio__primary {
    min-width: var(--ui-layout-120, 120px);
    height: var(--ui-control-36, 36px);
    gap: var(--ui-space-4, 4px);
  }

  .appearance-studio__using {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--workspace-purple-text, var(--primary-color));
    font-size: var(--ui-font-14, 14px);
    font-weight: 500;
  }

  @media (max-width: 767px) {
    // 移动全屏弹框内容区不带内边距，由业务内容留出页边。
    .appearance-studio {
      padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px) 0;
    }

    .appearance-studio__stage {
      height: var(--ui-layout-150, 150px);
    }
    .appearance-studio__stage :deep(.chat-profile-content__rarity) {
      display: none;
    }

    .appearance-studio__toolbar {
      gap: var(--ui-space-8, 8px);
      flex-wrap: wrap;
    }
    .appearance-studio__filters {
      width: 100%;
    }

    .appearance-studio__list {
      margin-right: 0;
      padding-right: 0;
      scrollbar-gutter: auto;
    }

    .appearance-studio__backgrounds {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .appearance-studio__frames {
      grid-template-columns: repeat(auto-fill, minmax(var(--ui-layout-80, 80px), 1fr));
      gap: var(--ui-space-8, 8px);
    }

    .appearance-studio__footer {
      padding: var(--ui-space-10, 10px) var(--ui-space-16, 16px)
        calc(var(--ui-space-10, 10px) + env(safe-area-inset-bottom));
    }

    .appearance-studio__selection small {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      white-space: normal;
    }

    .appearance-studio__balance {
      display: none;
    }

    // 底部独立主操作按移动端规范使用约 44px 高度。
    .appearance-studio__using,
    .appearance-studio__primary {
      min-width: var(--ui-layout-104, 104px);
      /* ui-density-fixed: 移动端固定标准密度，底部主操作按 44px 触控规范 */
      height: 44px;
    }
  }
</style>
