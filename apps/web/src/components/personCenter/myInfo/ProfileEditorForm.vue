<template>
  <div class="unified-profile-form">
    <div class="home-container" :class="{ 'home-container--framed': equippedFrameId }">
      <div style="width: 100%" class="flex-justify-center">
        <BButton
          class="user_icon"
          :class="{ 'user_icon--framed': equippedFrameId }"
          :disabled="user.role === 'visitor' || !user.id"
          :aria-label="t('myInfo.chooseAvatar')"
          v-click-log="{ module: '我的信息', operation: `选择头像` }"
          @click="avatarPickerOpen = true"
        >
          <AvatarFramePreview
            v-if="equippedFrameId"
            :frame-id="equippedFrameId"
            :src="headPicture || icon.navigation.user"
            :size="dimension(80, 'icon')"
            :decorative="false"
          />
          <svg-icon v-else :src="headPicture || icon.navigation.user" :size="80" />
          <span v-if="user.role !== 'visitor' && user.id" class="user_icon__edit" aria-hidden="true">
            <SvgIcon :src="icon.card_edit" :size="13" />
          </span>
        </BButton>
      </div>
      <div class="home-user-body">
        <div class="flex-align-center" style="gap: var(--ui-space-20, 20px)">
          <div class="flex-justify-center" style="gap: var(--ui-space-20, 20px)">
            <span class="user-item-label">{{ t('myInfo.role') }}</span>
            <span style="color: #8f9096">{{ getRoleName() }}</span>
          </div>
          <div class="flex-align-center-gap"
            ><svg-icon :src="icon.login.password" /><a class="dom-hover" @click="handleConfigPassword">{{
              user.password ? t('myInfo.changePassword') : t('myInfo.setPassword')
            }}</a></div
          >
          <PassConfigDlg v-model:visible="configPassVisible" />
        </div>
        <div class="user-item">
          <span class="user-item-label">{{ t('myInfo.avatarDecorations') }}</span>
          <BButton class="frame-picker-entry" @click="frameDrawerOpen = true">
            <span class="frame-picker-entry__current">
              <SvgIcon :src="icon.growth.reward" size="18" aria-hidden="true" />
              <span>{{
                equippedFrameName ? t('myInfo.equippedFrame', { name: equippedFrameName }) : t('myInfo.noFrameEquipped')
              }}</span>
            </span>
            <span class="frame-picker-entry__action">{{ t('myInfo.chooseAvatarFrame') }}</span>
          </BButton>
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
  <AvatarFramePickerDrawer v-model:open="frameDrawerOpen" :z-index="720" @navigate="handleFrameNavigation" />
  <AvatarPicker
    v-model:open="avatarPickerOpen"
    :current-src="headPicture"
    :frame-id="equippedFrameId"
    :z-index="730"
    @select="handleAvatarSelected"
  />
</template>

<script lang="ts" setup>
  import { useUiDensity } from '@/composables/useUiDensity';
  const { dimension } = useUiDensity();
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
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import AvatarFramePickerDrawer from '@/components/growth/AvatarFramePickerDrawer.vue';
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
  const { growth, load: loadGrowth, loadGrowthTasks } = useGrowth();
  const { t, te } = useI18n();
  const frameDrawerOpen = ref(false);
  const avatarPickerOpen = ref(false);
  const equippedFrameId = computed(() => {
    const id = growth.value?.equippedFrame;
    return frameVariant(id) ? id : null;
  });
  const equippedFrameName = computed(() => {
    const id = equippedFrameId.value;
    if (!id) return '';
    const key = `growth.shopItems.${id}.name`;
    return te(key) ? t(key) : id;
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
      frameDrawerOpen.value = false;
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
  .home-container {
    box-sizing: border-box;
    width: 100%;
    padding: 0;
    font-size: var(--ui-font-14, 14px);
  }
  // 80px 头像下，最高档素材盒(artSize 137)会达到约 171px；弹窗正文从标题分隔线开始裁切，必须在正文内部预留上半径出血。
  .home-container--framed {
    padding-top: var(--ui-layout-56, 56px);
  }
  .home-user-body {
    margin-top: var(--ui-space-30, 30px);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-space-18, 18px);
  }
  .home-container--framed .home-user-body {
    margin-top: var(--ui-layout-54, 54px);
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
  .user_icon {
    height: var(--ui-layout-80, 80px);
    width: var(--ui-layout-80, 80px);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #f5f5f5;
    border-radius: 50%;
    cursor: pointer;
    overflow: hidden;
    position: relative;
    padding: 0;
    line-height: normal;
    background: var(--surface-card-bg);
    &:hover {
      border-color: var(--primary-color);
    }
  }
  .user_icon--framed {
    overflow: visible;
    border-color: transparent;
  }
  // 游客仍不可编辑头像，但媒体预览不能继承 BButton 的整层透明度，否则位图边缘会与弹窗背景混合发虚。
  .user_icon.disabled {
    opacity: 1;
  }
  .user_icon__edit {
    position: absolute;
    right: 0;
    bottom: 0;
    width: var(--ui-layout-25, 25px);
    height: var(--ui-layout-25, 25px);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 3px solid var(--background-color);
    border-radius: 50%;
    color: #fff;
    background: var(--primary-color);
    pointer-events: none;
  }
  .frame-picker-entry {
    width: 100%;
    min-height: var(--ui-layout-56, 56px);
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--text-color);
    background: var(--surface-panel-bg);
    text-align: left;
  }
  .frame-picker-entry__current {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    color: var(--text-color);
  }
  .frame-picker-entry__current > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .frame-picker-entry__current :deep(.svg-icon) {
    flex: 0 0 auto;
    color: var(--primary-color);
  }
  .frame-picker-entry__action {
    flex: 0 0 auto;
    color: var(--primary-color);
    font-weight: 700;
  }
  @media (max-width: 1000px) {
    .home-container {
      width: 100%;
    }
    .home-user-body {
      gap: 20px;
    }
    .user-item {
      gap: 10px;
    }
    .user_icon {
      width: 80px;
      height: 80px;
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
