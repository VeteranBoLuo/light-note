<template>
  <div class="unified-profile-form">
    <div class="profile-form-body">
      <ProfileEditorIdentity
        :profile="identityProfile"
        :avatar-editable="!saving && !isGuest"
        @edit-avatar="appearanceOpen = true"
      >
        <template #actions>
          <BButton
            size="small"
            class="profile-appearance-action"
            :disabled="saving || isGuest"
            @click="appearanceOpen = true"
            ><SvgIcon :src="icon.common.magicWand" size="14" aria-hidden="true" />{{
              t('profileAppearance.title')
            }}</BButton
          >
        </template>
      </ProfileEditorIdentity>
      <section class="profile-public-fields">
        <label class="user-item">
          <span class="user-item-heading"
            >{{ t('myInfo.nickname') }}<small>{{ t('accountSettings.communityVisible') }}</small></span
          >
          <BInput
            height="40px"
            :disabled="saving || isGuest"
            v-model:value="userData.alias"
            :placeholder="t('myInfo.enterNickname')"
          />
        </label>

        <section class="community-profile-fields" v-if="user.id && user.role !== 'visitor'">
          <div v-if="profile.ownLoading.value" class="profile-community-state"
            ><BLoading inline loading :title="t('common.loading')"
          /></div>
          <div v-else-if="profile.ownError.value" class="profile-community-state" role="alert">
            <span>{{ t('communityChat.profile.ownLoadFailed') }}</span>
            <BButton type="text" @click="loadCommunity">{{ t('community.feed.retry') }}</BButton>
          </div>
          <template v-else-if="profile.ownProfile.value">
            <label class="user-item"
              ><span class="user-item-heading"
                >{{ t('communityChat.profile.bioLabel') }} <small>{{ bioLength }}/60</small></span
              >
              <BInput
                v-model:value="bio"
                class="profile-bio-input"
                type="textarea"
                :rows="3"
                @compositionstart="bioComposing = true"
                @compositionend="finishBioInput"
                @input="limitBio"
                :disabled="saving"
                :placeholder="t('communityChat.profile.bioPlaceholder')"
              />
            </label>
          </template>
        </section>
      </section>
      <section class="profile-account-fields" aria-labelledby="profile-account-heading">
        <header
          ><h2 id="profile-account-heading">{{ t('settings.accountSecurityTitle') }}</h2
          ><span>{{ t('accountSettings.privateAccount') }}</span></header
        >
        <div class="profile-account-fields-panel">
          <div class="profile-account-fields-row">
            <div class="profile-account-fields-copy"
              ><span>{{ t('accountSettings.loginEmail') }}</span
              ><strong>{{ user.email || '—' }}</strong></div
            >
            <BButton type="text" :disabled="saving || isGuest || !!user.adminContext" @click="emailVisible = true">{{
              t('accountSettings.changeEmail')
            }}</BButton>
          </div>
          <div class="profile-account-fields-row">
            <div class="profile-account-fields-copy"
              ><span>{{ t('accountSettings.loginPassword') }}</span
              ><strong>{{
                t(
                  passwordLoading
                    ? 'accountSettings.loading'
                    : passwordState === true
                      ? 'accountSettings.passwordSet'
                      : passwordState === false
                        ? 'accountSettings.passwordNotSet'
                        : 'accountSettings.passwordUnknown',
                )
              }}</strong></div
            >
            <BButton
              type="text"
              :disabled="saving || isGuest || !!user.adminContext || passwordLoading"
              @click="handleConfigPassword"
              >{{
                t(
                  passwordState === true
                    ? 'myInfo.changePassword'
                    : passwordState === false
                      ? 'myInfo.setPassword'
                      : 'accountSettings.configurePassword',
                )
              }}</BButton
            >
          </div>
        </div>
        <PassConfigDlg v-model:visible="configPassVisible" />
      </section>
      <section
        v-if="isGuest"
        class="profile-visitor-hint"
        :class="{ 'is-mobile': isMobileLayout }"
        aria-labelledby="profile-login-heading"
      >
        <div class="profile-visitor-hint__copy">
          <h2 id="profile-login-heading">{{ t('myInfo.visitorAccessTitle') }}</h2>
          <p>{{ t('myInfo.visitorDescription') }}</p>
        </div>
        <BButton type="primary" @click="bookmark.isShowLogin = true">{{ t('myInfo.loginToEdit') }}</BButton>
      </section>
    </div>
    <component
      :is="isMobileLayout ? MobileStickyActionBar : 'footer'"
      v-if="!isGuest"
      class="profile-save-footer"
      :above-navigation="isMobileLayout ? false : undefined"
    >
      <span v-if="!isMobileLayout" role="status">{{ dirty ? t('accountSettings.profileUnsaved') : '' }}</span>
      <BButton :disabled="saving" @click="requestClose()">{{ t('common.cancel') }}</BButton>
      <BButton
        type="primary"
        :loading="saving"
        :disabled="!dirty || !userData.alias?.trim() || profile.ownLoading.value || bioLength > 60"
        @click="saveUserInfo"
        >{{ t('myInfo.saveChanges') }}</BButton
      >
    </component>
  </div>
  <AccountEmailDialog v-model:visible="emailVisible" />
  <ProfileAppearanceStudio
    v-model:open="appearanceOpen"
    :profile="identityProfile"
    @navigate="handleFrameNavigation"
    @avatar-saved="handleAvatarSaved"
  />
</template>

<script lang="ts" setup>
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed, ref, watch, onBeforeUnmount } from 'vue';
  import { apiBaseGet } from '@/http/request';
  import AccountEmailDialog from '@/components/settings/AccountEmailDialog.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import { useCommunityChatProfile } from '@/composables/useCommunityChatProfile';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import userApi from '@/api/userApi.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import MobileStickyActionBar from '@/components/mobile/MobileStickyActionBar.vue';
  import icon from '@/config/icon.ts';

  import PassConfigDlg from '@/components/personCenter/myInfo/PassConfigDlg.vue';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import ProfileAppearanceStudio from '@/components/growth/ProfileAppearanceStudio.vue';
  import ProfileEditorIdentity from './ProfileEditorIdentity.vue';
  import type { CommunityChatAuthorProfile } from '@/api/communityChatApi';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { profileBackground } from '@/config/profileBackgrounds';
  import { frameVariant } from '@/config/growthFrames.ts';
  const user = useUserStore();
  const isGuest = computed(() => !user.id || user.role === 'visitor');
  const saving = ref(false);
  let identityGeneration = 0;
  const emit = defineEmits<{ close: []; saved: []; navigate: [path: string] }>();
  const profile = useCommunityChatProfile();
  const bio = ref('');
  const bioComposing = ref(false);
  function limitBio() {
    if (!bioComposing.value) bio.value = Array.from(bio.value).slice(0, 60).join('');
  }
  function finishBioInput() {
    bioComposing.value = false;
    limitBio();
  }
  const bioLength = computed(() => Array.from(bio.value).length);
  const accountBaseline = ref('');
  const accountSignature = () => JSON.stringify([userData.value.alias]);
  const accountDirty = computed(() => accountSignature() !== accountBaseline.value);
  const communityDirty = computed(() =>
    Boolean(profile.ownProfile.value && bio.value !== profile.ownProfile.value.bio),
  );
  const dirty = computed(() => accountDirty.value || communityDirty.value);
  async function loadCommunity() {
    const generation = identityGeneration;
    try {
      const value = await profile.loadOwnProfile({ force: true });
      if (value && generation === identityGeneration) {
        bio.value = value.bio;
      }
    } catch {
      /* Keep account fields usable when community is unavailable. */
    }
  }
  function requestClose(onStay = () => {}) {
    if (saving.value) return;
    if (!dirty.value) {
      emit('close');
      return;
    }
    Alert.alert({
      title: t('community.feed.discardProfileTitle'),
      content: t('community.feed.discardProfileHint'),
      okText: t('community.feed.discardChanges'),
      cancelText: t('community.feed.continueEditing'),
      onOk: () => emit('close'),
      onCancel: onStay,
    });
  }
  defineExpose({ requestClose, dirty, saving });

  const bookmark = bookmarkStore();
  const { growth, shop, load: loadGrowth, loadGrowthTasks } = useGrowth();
  const { t } = useI18n();
  const isMobileLayout = useMobileLayout();
  const appearanceOpen = ref(false);
  const equippedFrameId = computed(() => {
    const id = growth.value?.equippedFrame;
    return frameVariant(id) ? id : null;
  });
  // 身份字段取社区公开预览，昵称、头像、简介跟随当前未保存的编辑，
  // 背景与头像框取成长快照的实时佩戴状态（装扮内使用后立即同步，无需重新拉取社区资料）。
  const identityProfile = computed<CommunityChatAuthorProfile>(() => {
    const preview = profile.ownProfile.value?.publicPreview;
    const frameId = equippedFrameId.value;
    const backgroundId = growth.value?.equippedBackground;
    return {
      name: String(userData.value.alias || '').trim() || preview?.name || t('communityChat.memberFallback'),
      userPublicId: preview?.userPublicId,
      communityId: preview?.communityId,
      role: preview?.role || 'member',
      avatar: user.headPicture || '',
      frameId,
      frameRarity:
        shop.value?.frames?.find((item) => item.id === frameId)?.rarity ??
        (frameId && frameId === preview?.frameId ? preview.frameRarity : null) ??
        null,
      level: growth.value?.level ?? preview?.level ?? 1,
      levelName: growth.value?.name ?? preview?.levelName ?? '',
      title: preview?.title ?? null,
      backgroundId: profileBackground(backgroundId) ? backgroundId : null,
      bio: bio.value,
      communityTenureLabel: null,
      achievements: [],
      achievementCount: 0,
      hasMoreAchievements: false,
    };
  });
  function handleAvatarSaved() {
    void loadGrowthTasks(true);
    emit('saved');
  }

  async function saveUserInfo() {
    if (saving.value) return;
    if (user.role === 'visitor' || !user.id) {
      message.warn(t('myInfo.pleaseLogin'));
      return;
    }
    if (!userData.value.alias || !userData.value.alias.trim()) {
      message.warning(t('myInfo.enterNickname'));
      return;
    }
    saving.value = true;
    const generation = identityGeneration;
    const ownerId = user.id;
    try {
      const payload = {
        id: ownerId,
        alias: userData.value.alias,
      };
      if (accountDirty.value) {
        const res = await userApi.updateUserInfo(payload);
        if (generation !== identityGeneration) return;
        if (res.status !== 200) throw new Error('PROFILE_SAVE_FAILED');
        const refreshed = await userApi.getUserInfoById({ id: ownerId });
        if (generation !== identityGeneration) return;
        if (refreshed.status !== 200 || refreshed.data?.id !== ownerId) throw new Error('PROFILE_READ_FAILED');
        user.setUserInfo(refreshed.data);
        if (generation !== identityGeneration) return;
        accountBaseline.value = accountSignature();
      }
      if (communityDirty.value && profile.ownProfile.value) {
        const result = await profile.saveOwnProfile({
          bio: bio.value,
          showCommunityTenure: true,
          featuredAchievementKeys: profile.ownProfile.value.featuredAchievementKeys,
          baseRevision: profile.ownProfile.value.revision,
        });
        if (generation !== identityGeneration) return;
        if (!result) throw new Error('PROFILE_SAVE_FAILED');
      }
      recordOperation({ module: '我的信息', operation: '保存个人信息成功' });
      message.success(t('myInfo.saveSuccess'));
      void loadGrowthTasks(true);
      emit('saved');
      emit('close');
    } catch {
      if (generation === identityGeneration) message.warning(t('community.profilePartial'));
    } finally {
      saving.value = false;
    }
  }

  const configPassVisible = ref(false);
  const emailVisible = ref(false);
  const passwordState = ref<boolean | null>(null);
  const passwordLoading = ref(false);
  watch(
    () => [user.id, user.role, user.adminContext],
    async (current, previous) => {
      const generation = ++identityGeneration;
      if (previous) {
        appearanceOpen.value = false;
        profile.closeProfile({ reset: true, clearIdentityCache: true });
        emit('close');
      }
      emailVisible.value = false;
      configPassVisible.value = false;
      passwordState.value = null;
      passwordLoading.value = false;
      if (isGuest.value || user.adminContext) return;
      passwordLoading.value = true;
      try {
        const result = await apiBaseGet('/api/user/me', undefined, { silent: true });
        if (generation === identityGeneration && result.status === 200 && result.data?.id === user.id)
          passwordState.value = typeof result.data.hasPassword === 'boolean' ? result.data.hasPassword : null;
      } catch {
        /* Unknown state retains the dedicated verification flow. */
      } finally {
        if (generation === identityGeneration) passwordLoading.value = false;
      }
    },
    { immediate: true, flush: 'sync' },
  );
  onBeforeUnmount(() => {
    identityGeneration++;
    profile.closeProfile({ reset: true, clearIdentityCache: true });
  });
  function handleConfigPassword() {
    if (isGuest.value) {
      bookmark.isShowLogin = true;
      return;
    }
    configPassVisible.value = true;
  }

  function handleFrameNavigation(destination: 'growth' | 'tasks' | 'achievements') {
    const navigate = () => {
      appearanceOpen.value = false;
      emit('navigate', destination === 'growth' ? '/growth' : '/growth?section=' + destination);
    };
    if (!dirty.value) {
      navigate();
      return;
    }
    Alert.alert({
      title: t('community.feed.discardProfileTitle'),
      content: t('community.feed.discardProfileHint'),
      okText: t('community.feed.discardChanges'),
      cancelText: t('community.feed.continueEditing'),
      onOk: navigate,
    });
  }

  const userData = ref({ alias: user.alias });
  accountBaseline.value = accountSignature();
  void loadGrowth();
  if (user.id && user.role !== 'visitor') void loadCommunity();
</script>

<style lang="less" scoped>
  .profile-public-fields {
    display: grid;
    gap: var(--ui-space-16, 16px);
    padding-block: var(--ui-space-20, 20px);
  }
  .user-item {
    display: grid;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
    line-height: 1.5;
  }
  .user-item-heading {
    display: flex;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
  }
  .user-item-heading > small {
    font-weight: 400;
  }
  .user-item small,
  .profile-account-fields header > span,
  .profile-save-footer > span {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .profile-bio-input :deep(textarea) {
    height: var(--ui-layout-80, 80px);
    min-height: var(--ui-layout-80, 80px);
    padding-block: var(--ui-space-10, 10px);
    font-size: var(--ui-font-14, 14px);
    resize: vertical;
  }
  .profile-account-fields {
    border-top: 1px solid var(--surface-divider-color);
    padding-top: var(--ui-space-16, 16px);
  }
  .profile-account-fields-panel {
    margin-top: var(--ui-space-12, 12px);
    padding-inline: var(--ui-space-16, 16px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-panel-bg);
  }
  .profile-account-fields header,
  .profile-account-fields-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
  }
  .profile-account-fields h2 {
    margin: 0;
    font-size: var(--ui-font-14, 14px);
    font-weight: 700;
  }
  .profile-account-fields-row {
    min-height: var(--ui-layout-54, 54px);
    padding-block: var(--ui-space-8, 8px);
    box-sizing: border-box;
  }
  .profile-account-fields-row + .profile-account-fields-row {
    border-top: 1px solid var(--surface-border-color);
  }
  .profile-account-fields-copy {
    display: flex;
    align-items: center;
    flex: 1;
    gap: var(--ui-space-16, 16px);
    min-width: 0;
  }
  .profile-account-fields-copy > span {
    flex: 0 0 var(--ui-layout-72, 72px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }
  .profile-account-fields-copy > strong {
    min-width: 0;
    font-size: var(--ui-font-13, 13px);
    font-weight: 500;
    overflow-wrap: anywhere;
  }
  .profile-account-fields-row > .b_btn {
    flex-shrink: 0;
    padding-inline: var(--ui-space-4, 4px);
    font-size: var(--ui-font-13, 13px);
  }
  .profile-visitor-hint {
    display: flex;
    align-items: center;
    gap: var(--ui-space-20, 20px);
    margin-top: var(--ui-space-20, 20px);
    padding: var(--ui-space-16, 16px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-panel-bg);

    &__copy {
      flex: 1;
      min-width: 0;
    }

    h2 {
      margin: 0;
      color: var(--text-color);
      font-size: var(--ui-font-14, 14px);
      line-height: 1.5;
    }

    p {
      margin: var(--ui-space-4, 4px) 0 0;
      color: var(--desc-color);
      font-size: var(--ui-font-13, 13px);
      line-height: 1.65;
    }

    > .b_btn {
      flex: 0 0 auto;
      min-width: var(--ui-layout-112, 112px);
      height: var(--ui-control-36, 36px);
      padding-inline: var(--ui-space-16, 16px);
      white-space: nowrap;
    }

    &.is-mobile {
      flex-direction: column;
      align-items: stretch;
      gap: var(--ui-space-12, 12px);

      > .b_btn {
        width: 100%;
        height: var(--ui-control-44, 44px);
      }
    }
  }

  .profile-save-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--ui-space-10, 10px);
    padding: var(--ui-space-16, 16px) var(--ui-space-24, 24px);
    border-top: 1px solid var(--surface-border-color);
  }
  .profile-save-footer > .b_btn {
    min-width: var(--ui-layout-80, 80px);
    height: var(--ui-control-36, 36px);
    line-height: var(--ui-control-36, 36px);
  }
  .profile-save-footer > span {
    flex: 1;
    min-width: 0;
    line-height: 1.5;
  }

  .unified-profile-form {
    width: 100%;
    min-height: 0;
    display: flex;
    flex: 1;
    flex-direction: column;
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }
  .profile-form-body {
    min-height: 0;
    overflow-y: auto;
    padding: var(--ui-space-20, 20px) var(--ui-space-24, 24px);
  }
  .profile-appearance-action.b_btn {
    height: var(--ui-control-32, 32px);
    gap: var(--ui-space-5, 5px);
    padding-inline: var(--ui-space-10, 10px);
    font-size: var(--ui-font-13, 13px);
    border: 1px solid var(--surface-border-color);
    background: var(--card-background);
    border-radius: 8px;
  }
  .profile-community-state {
    min-height: var(--ui-layout-108, 108px);
    display: grid;
    align-content: center;
    gap: var(--ui-space-8, 8px);
    color: var(--desc-color);
  }
  .user-item :deep(input) {
    font-size: var(--ui-font-14, 14px);
  }
  .profile-save-footer {
    flex-shrink: 0;
  }
  .profile-save-footer > span {
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  html.light-note-mobile-rendering .profile-form-body {
    padding: var(--ui-space-20, 20px);
    padding-bottom: calc(var(--ui-space-108, 108px) + env(safe-area-inset-bottom));
  }
  html.light-note-mobile-rendering .profile-account-fields-copy {
    display: grid;
    gap: var(--ui-space-3, 3px);
  }
  .profile-save-footer.mobile-sticky-action-bar {
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 0;
    border: 0;
    border-top: 1px solid var(--surface-border-color);
    box-shadow: none;
    padding: var(--ui-space-16, 16px) var(--ui-space-20, 20px);
    padding-bottom: calc(var(--ui-space-16, 16px) + env(safe-area-inset-bottom));
  }
  .profile-save-footer.mobile-sticky-action-bar > .b_btn {
    height: var(--ui-control-44, 44px);
    line-height: var(--ui-control-44, 44px);
    flex: 0 0 auto;
  }
  .profile-save-footer.mobile-sticky-action-bar > .b_btn:last-child {
    flex: 1;
  }
</style>
