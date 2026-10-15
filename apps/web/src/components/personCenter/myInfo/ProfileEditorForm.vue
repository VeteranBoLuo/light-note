<template>
  <div class="unified-profile-form">
    <div class="profile-identity-card">
      <ChatUserProfileContent
        identity-only
        stable-layout
        :compact="isMobileLayout"
        :profile="identityProfile"
        :community-actions="false"
        :chat-actions="false"
        authenticated
      />
      <div class="profile-identity-card__actions">
        <BButton
          size="small"
          :disabled="isGuest"
          v-click-log="{ module: '我的信息', operation: `选择头像` }"
          @click="avatarPickerOpen = true"
          >{{ t('profileAppearance.changeAvatar') }}</BButton
        >
        <BButton size="small" @click="appearanceOpen = true"
          ><SvgIcon :src="icon.common.magicWand" size="14" aria-hidden="true" />{{
            t('profileAppearance.title')
          }}</BButton
        >
      </div>
    </div>
    <div class="home-container">
      <div class="home-user-body">
        <div class="profile-account-row">
          <span class="user-item-label">{{ t('myInfo.role') }}</span>
          <strong>{{ getRoleName() }}</strong>
          <BButton type="text" class="profile-account-row__password" @click="handleConfigPassword"
            ><SvgIcon :src="icon.login.password" size="14" aria-hidden="true" />{{
              user.password ? t('myInfo.changePassword') : t('myInfo.setPassword')
            }}</BButton
          >
          <PassConfigDlg v-model:visible="configPassVisible" />
        </div>
        <div class="user-item">
          <span class="user-item-label">{{ t('myInfo.nickname') }}</span>
          <b-input
            style="width: 100%"
            :disabled="saving || isGuest"
            v-model:value="userData.alias"
            :placeholder="t('myInfo.enterNickname')"
          />
        </div>

        <section class="community-profile-fields" v-if="user.id && user.role !== 'visitor'">
          <p v-if="profile.ownLoading.value" role="status">{{ t('common.loading') }}</p>
          <p v-else-if="profile.ownError.value" role="alert"
            >{{ t('communityChat.profile.ownLoadFailed') }}
            <BButton @click="loadCommunity">{{ t('community.feed.retry') }}</BButton></p
          >
          <template v-else-if="profile.ownProfile.value">
            <label class="user-item"
              ><span class="profile-field-heading"
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
        <p class="private-info-hint">{{ t('community.feed.privateAccountHint') }}</p>
        <div class="user-item">
          <span class="user-item-label">{{ t('myInfo.email') }}</span>
          <b-input :disabled="saving || isGuest" v-model:value="userData.email" :placeholder="t('myInfo.enterEmail')" />
        </div>
      </div>
    </div>
    <p v-if="isGuest"
      >{{ t('myInfo.visitorDescription') }}
      <BButton @click="bookmark.isShowLogin = true">{{ t('myInfo.loginToEdit') }}</BButton></p
    >
    <div v-else class="profile-save-footer">
      <div style="display: flex; justify-content: flex-end">
        <b-button
          type="primary"
          :loading="saving"
          :disabled="!dirty || profile.ownLoading.value || bioLength > 60"
          @click="saveUserInfo"
          >{{ t('myInfo.save') }}</b-button
        >
      </div>
    </div>
  </div>
  <ProfileAppearanceStudio v-model:open="appearanceOpen" :profile="identityProfile" @navigate="handleFrameNavigation" />
  <AvatarPicker
    v-model:open="avatarPickerOpen"
    :current-src="headPicture"
    :frame-id="equippedFrameId"
    :z-index="730"
    @select="handleAvatarSelected"
  />
</template>

<script lang="ts" setup>
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed, ref } from 'vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import { useCommunityChatProfile } from '@/composables/useCommunityChatProfile';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import userApi from '@/api/userApi.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';

  import PassConfigDlg from '@/components/personCenter/myInfo/PassConfigDlg.vue';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import ProfileAppearanceStudio from '@/components/growth/ProfileAppearanceStudio.vue';
  import ChatUserProfileContent from '@/components/communityChat/ChatUserProfileContent.vue';
  import type { CommunityChatAuthorProfile } from '@/api/communityChatApi';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { profileBackground } from '@/config/profileBackgrounds';
  import AvatarPicker from '@/components/personCenter/myInfo/AvatarPicker.vue';
  import { resolveAccountRoleLabelKey } from '@/config/accountRole';
  import { frameVariant } from '@/config/growthFrames.ts';
  const user = useUserStore();
  const isGuest = computed(() => !user.id || user.role === 'visitor');
  const headPicture = ref<string>('');
  const avatarChanged = ref(false);
  const saving = ref(false);
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
  const accountSignature = () => JSON.stringify([userData.value.alias, userData.value.email || '', headPicture.value]);
  const accountDirty = computed(() => accountSignature() !== accountBaseline.value);
  const communityDirty = computed(() =>
    Boolean(profile.ownProfile.value && bio.value !== profile.ownProfile.value.bio),
  );
  const dirty = computed(() => accountDirty.value || communityDirty.value);
  async function loadCommunity() {
    try {
      const value = await profile.loadOwnProfile({ force: true });
      if (value) {
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
  const avatarPickerOpen = ref(false);
  const equippedFrameId = computed(() => {
    const id = growth.value?.equippedFrame;
    return frameVariant(id) ? id : null;
  });
  // 名片预览与「个人装扮」共用：身份字段取社区公开预览，昵称、头像、简介跟随当前未保存的编辑，
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
      avatar: headPicture.value,
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
  function handleAvatarSelected(source: string) {
    headPicture.value = source;
    avatarChanged.value = true;
  }

  async function saveUserInfo() {
    if (saving.value) return;
    if (user.role === 'visitor' || !user.id) {
      message.warn(t('myInfo.pleaseLogin'));
      return;
    }
    userData.value.email = String(userData.value.email || '').trim();
    if (!userData.value.alias || !userData.value.alias.trim()) {
      message.warning(t('myInfo.enterNickname'));
      return;
    }
    if (userData.value.email && !validateEmail(userData.value.email)) {
      message.warning(t('myInfo.invalidEmail'));
      return;
    }
    saving.value = true;
    try {
      const payload: { id: string; alias: string; email: string; headPicture?: string } = {
        id: user.id,
        headPicture: headPicture.value,
        alias: userData.value.alias,
        email: userData.value.email,
      };
      if (!avatarChanged.value) delete payload.headPicture;
      if (accountDirty.value) {
        const res = await userApi.updateUserInfo(payload);
        if (res.status !== 200) throw new Error('PROFILE_SAVE_FAILED');
        const refreshed = await userApi.getUserInfoById({ id: user.id });
        user.setUserInfo(refreshed.data);
        accountBaseline.value = accountSignature();
        avatarChanged.value = false;
      }
      if (communityDirty.value && profile.ownProfile.value) {
        const result = await profile.saveOwnProfile({
          bio: bio.value,
          showCommunityTenure: true,
          featuredAchievementKeys: profile.ownProfile.value.featuredAchievementKeys,
          baseRevision: profile.ownProfile.value.revision,
        });
        if (!result) throw new Error('PROFILE_SAVE_FAILED');
      }
      recordOperation({ module: '我的信息', operation: '保存个人信息成功' });
      message.success(t('myInfo.saveSuccess'));
      void loadGrowthTasks(true);
      emit('saved');
      emit('close');
    } catch {
      message.warning(t('community.profilePartial'));
    } finally {
      saving.value = false;
    }
  }

  function validateEmail(email) {
    const regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    return regex.test(email);
  }

  function getRoleName() {
    return t(resolveAccountRoleLabelKey(user.role, user.id));
  }
  const configPassVisible = ref(false);
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

  const userData = ref({ alias: user.alias, email: user.email });
  headPicture.value = user.headPicture || '';
  accountBaseline.value = accountSignature();
  void loadGrowth();
  if (user.id && user.role !== 'visitor') void loadCommunity();
</script>

<style lang="less" scoped>
  .profile-bio-input :deep(textarea) {
    overflow-wrap: anywhere;
    word-break: break-all;
  }
  // 名片即资料页的门面：与「个人装扮」预览共用 stable-layout，按钮压在右下角不随背景或头像框位移。
  .profile-identity-card {
    position: relative;
    height: var(--ui-layout-176, 176px);
  }
  .profile-identity-card__actions {
    position: absolute;
    z-index: 2;
    right: var(--ui-space-12, 12px);
    bottom: var(--ui-space-12, 12px);
    display: flex;
    gap: var(--ui-space-8, 8px);
  }
  .profile-identity-card__actions :deep(.b_btn) {
    gap: var(--ui-space-4, 4px);
    border: 1px solid var(--surface-border-color);
    background: var(--card-background);
  }
  .home-container {
    box-sizing: border-box;
    width: 100%;
    padding: 0;
    font-size: var(--ui-font-14, 14px);
  }
  .home-user-body {
    margin-top: var(--ui-space-18, 18px);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-space-18, 18px);
  }
  .profile-account-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }
  .profile-account-row strong {
    color: var(--text-color);
    font-weight: 500;
  }
  .profile-account-row__password {
    margin-left: auto;
    gap: var(--ui-space-4, 4px);
  }
  .user-item {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-10, 10px);
    width: 100%;
    .user-item-label {
      width: var(--ui-layout-80, 80px);
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }
  }
  @media (max-width: 1000px) {
    .home-user-body {
      gap: 20px;
    }
    .user-item {
      gap: 10px;
    }
  }
  .community-profile-fields {
    width: 100%;
    display: grid;
    gap: var(--ui-space-18, 18px);
  }
  .profile-field-heading {
    display: flex;
    justify-content: space-between;
  }
  .profile-field-heading small,
  .private-info-hint {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: normal;
  }
  .private-info-hint {
    width: 100%;
    border-top: 1px solid var(--surface-border-color);
    padding-top: var(--ui-space-18, 18px);
    margin: 0 0 calc(-1 * var(--ui-space-8, 8px));
  }
  .profile-save-footer {
    margin-top: var(--ui-space-20, 20px);
    padding-top: var(--ui-space-16, 16px);
    border-top: 1px solid var(--surface-border-color);
  }
</style>
