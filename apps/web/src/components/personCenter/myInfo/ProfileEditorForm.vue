<template>
  <div class="unified-profile-form">
    <ProfileEditorIdentity
      :profile="identityProfile"
      :avatar-editable="!saving && !isGuest"
      @edit-avatar="appearanceOpen = true"
    >
      <template #actions>
        <BButton type="text" class="profile-appearance-action" :disabled="saving" @click="appearanceOpen = true"
          ><SvgIcon :src="icon.common.magicWand" size="14" aria-hidden="true" />{{
            t('profileAppearance.title')
          }}</BButton
        >
      </template>
    </ProfileEditorIdentity>
    <section class="profile-public-fields">
      <label class="user-item">
        <span>{{ t('myInfo.nickname') }}</span>
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
    </section>
    <section class="profile-account-fields" aria-labelledby="profile-account-heading">
      <h2 id="profile-account-heading">{{ t('settings.accountSecurityTitle') }}</h2>
      <label class="user-item">
        <span>{{ t('myInfo.email') }}</span>
        <BInput
          height="40px"
          :disabled="saving || isGuest"
          v-model:value="userData.email"
          :placeholder="t('myInfo.enterEmail')"
        />
      </label>
      <p class="private-info-hint">{{ t('community.feed.privateAccountHint') }}</p>
      <div class="profile-account-row">
        <span class="profile-account-role"
          >{{ t('myInfo.accountRole') }}<strong>{{ getRoleName() }}</strong></span
        >
        <BButton type="text" class="profile-account-row__password" :disabled="saving" @click="handleConfigPassword">
          {{ user.password ? t('myInfo.changePassword') : t('myInfo.setPassword') }}
          <SvgIcon :src="icon.arrow_right" size="13" aria-hidden="true" />
        </BButton>
      </div>
      <PassConfigDlg v-model:visible="configPassVisible" />
    </section>
    <p v-if="isGuest" class="profile-visitor-hint"
      >{{ t('myInfo.visitorDescription') }}
      <BButton @click="bookmark.isShowLogin = true">{{ t('myInfo.loginToEdit') }}</BButton></p
    >
    <component
      :is="isMobileLayout ? MobileStickyActionBar : 'footer'"
      v-else
      class="profile-save-footer"
      :above-navigation="isMobileLayout ? false : undefined"
    >
      <BButton
        type="primary"
        :loading="saving"
        :disabled="!dirty || !userData.alias?.trim() || profile.ownLoading.value || bioLength > 60"
        @click="saveUserInfo"
        >{{ t(isMobileLayout ? 'myInfo.saveChanges' : 'myInfo.save') }}</BButton
      >
    </component>
  </div>
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
  import { computed, ref } from 'vue';
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
  import { resolveAccountRoleLabelKey } from '@/config/accountRole';
  import { frameVariant } from '@/config/growthFrames.ts';
  const user = useUserStore();
  const isGuest = computed(() => !user.id || user.role === 'visitor');
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
  const accountSignature = () => JSON.stringify([userData.value.alias, userData.value.email || '']);
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
      const payload = {
        id: user.id,
        alias: userData.value.alias,
        email: userData.value.email,
      };
      if (accountDirty.value) {
        const res = await userApi.updateUserInfo(payload);
        if (res.status !== 200) throw new Error('PROFILE_SAVE_FAILED');
        const refreshed = await userApi.getUserInfoById({ id: user.id });
        user.setUserInfo(refreshed.data);
        accountBaseline.value = accountSignature();
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
  accountBaseline.value = accountSignature();
  void loadGrowth();
  if (user.id && user.role !== 'visitor') void loadCommunity();
</script>

<style lang="less" scoped>
  .unified-profile-form {
    width: 100%;
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
  }
  .profile-bio-input :deep(textarea) {
    display: block;
    height: var(--ui-layout-86, 86px);
    min-height: var(--ui-layout-86, 86px);
    padding-top: var(--ui-space-10, 10px);
    padding-bottom: var(--ui-space-10, 10px);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.57;
    overflow-wrap: anywhere;
    resize: vertical;
  }
  .profile-appearance-action.b_btn {
    height: var(--ui-control-32, 32px);
    padding: 0 var(--ui-space-8, 8px);
    gap: var(--ui-space-6, 6px);
    font-size: var(--ui-font-13, 13px);
  }
  .profile-public-fields {
    display: grid;
    gap: var(--ui-space-20, 20px);
    margin-top: var(--ui-space-20, 20px);
  }
  .profile-account-fields {
    margin-top: var(--ui-space-24, 24px);
    padding-top: var(--ui-space-20, 20px);
    border-top: 1px solid var(--surface-divider-color);
  }
  .profile-account-fields h2 {
    margin: 0 0 var(--ui-space-18, 18px);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.43;
    font-weight: 700;
  }
  .profile-account-row {
    margin-top: var(--ui-space-12, 12px);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  .profile-account-role {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .profile-account-row strong {
    color: var(--text-color);
    font-weight: 400;
  }
  .profile-account-row__password {
    margin-left: auto;
    gap: var(--ui-space-5, 5px);
    font-size: var(--ui-font-13, 13px);
  }
  .user-item {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-9, 9px);
    width: 100%;
    line-height: 1.43;
  }
  .user-item :deep(input) {
    font-size: var(--ui-font-15, 15px);
  }
  .community-profile-fields {
    width: 100%;
  }
  .profile-community-state {
    min-height: var(--ui-layout-116, 116px);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: var(--ui-space-8, 8px);
    color: var(--desc-color);
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
    margin: var(--ui-space-8, 8px) 0 0;
    line-height: 1.58;
  }
  .profile-visitor-hint {
    margin: var(--ui-space-20, 20px) 0 0;
    line-height: 1.6;
  }
  .profile-save-footer:not(.mobile-sticky-action-bar) {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--ui-space-20, 20px);
    padding-top: var(--ui-space-16, 16px);
    border-top: 1px solid var(--surface-border-color);
  }
  .profile-save-footer.mobile-sticky-action-bar {
    max-width: calc(var(--ui-layout-560, 560px) - 2 * var(--ui-space-14, 14px));
    margin-inline: auto;
  }
</style>
