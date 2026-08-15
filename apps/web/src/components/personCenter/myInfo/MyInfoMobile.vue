<template>
  <CommonContainer :title="t('myInfo.title')" @backClick="handleBack">
    <div class="profile-page">
      <section class="profile-hero" :class="{ 'profile-hero--framed': equippedFrameId }" aria-live="polite">
        <BButton
          class="profile-avatar"
          :class="{ 'profile-avatar--disabled': isGuest, 'profile-avatar--framed': equippedFrameId }"
          :disabled="isGuest"
          :aria-label="t('myInfo.chooseAvatar')"
          v-click-log="{ module: '我的信息', operation: `选择头像` }"
          @click="avatarPickerOpen = true"
        >
          <AvatarFramePreview
            v-if="equippedFrameId"
            :frame-id="equippedFrameId"
            :src="headPicture || icon.navigation.user"
            :size="64"
            :decorative="false"
          />
          <div v-else class="profile-avatar__image">
            <SvgIcon :src="headPicture || icon.navigation.user" :size="84" />
          </div>
          <span v-if="!isGuest" class="profile-avatar__edit" aria-hidden="true">
            <SvgIcon :src="icon.card_edit" :size="14" />
          </span>
        </BButton>

        <div class="profile-hero__copy">
          <strong class="profile-hero__name">{{ displayAlias }}</strong>
          <span v-if="isGuest" class="profile-hero__hint">{{ t('myInfo.visitorEditHint') }}</span>
          <span class="profile-role-pill">{{ getRoleName() }}</span>
        </div>
      </section>

      <BButton class="profile-decoration-row" @click="frameDrawerOpen = true">
        <span class="profile-decoration-row__icon"><SvgIcon :src="icon.growth.reward" :size="19" /></span>
        <span class="profile-decoration-row__copy">
          <strong>{{ t('myInfo.avatarDecorations') }}</strong>
          <small>{{
            equippedFrameName ? t('myInfo.equippedFrame', { name: equippedFrameName }) : t('myInfo.noFrameEquipped')
          }}</small>
        </span>
        <SvgIcon class="profile-decoration-row__arrow" :src="icon.arrow_right" :size="18" aria-hidden="true" />
      </BButton>

      <section v-if="isGuest" class="profile-visitor-card">
        <div class="profile-visitor-card__title">{{ t('myInfo.visitorTitle') }}</div>
        <p class="profile-visitor-card__description">{{ t('myInfo.visitorDescription') }}</p>
        <BButton class="profile-login-button" type="primary" @click="handleLogin">
          {{ t('myInfo.loginToEdit') }}
        </BButton>
      </section>

      <template v-else>
        <section class="profile-section">
          <div class="profile-section__heading">{{ t('myInfo.basicInfo') }}</div>

          <div class="profile-field">
            <label class="profile-field__label">{{ t('myInfo.nickname') }}</label>
            <div class="profile-input">
              <BInput
                v-model:value="userData.alias"
                :maxlength="50"
                height="46px"
                :placeholder="t('myInfo.enterNickname')"
              />
            </div>
          </div>

          <div class="profile-field">
            <label class="profile-field__label">{{ t('myInfo.email') }}</label>
            <div class="profile-input">
              <BInput
                v-model:value="userData.email"
                type="email"
                autocomplete="email"
                :maxlength="100"
                height="46px"
                :placeholder="t('myInfo.enterEmail')"
              />
            </div>
          </div>
        </section>

        <section class="profile-section profile-section--security">
          <div class="profile-section__heading">{{ t('myInfo.security') }}</div>
          <BButton class="profile-action-row" @click="handleConfigPassword">
            <span class="profile-action-row__main">
              <span class="profile-action-row__icon" aria-hidden="true">
                <SvgIcon :src="icon.growth.lock" :size="19" />
              </span>
              <span class="profile-action-row__text">
                <strong>{{ t('myInfo.password') }}</strong>
                <small>{{ user.password ? t('myInfo.passwordSet') : t('myInfo.passwordUnset') }}</small>
              </span>
            </span>
            <SvgIcon class="profile-action-row__arrow" :src="icon.arrow_right" :size="18" aria-hidden="true" />
          </BButton>
        </section>
      </template>

      <div v-if="!isGuest && !hasChanges" class="profile-saved-state" role="status">
        <SvgIcon :src="icon.message.success" :size="16" aria-hidden="true" />
        {{ t('myInfo.saved') }}
      </div>

      <MobileStickyActionBar v-if="!isGuest && hasChanges" :above-navigation="false">
        <BButton class="profile-save-button" type="primary" size="large" :loading="saving" @click="saveUserInfo">
          {{ t('myInfo.save') }}
        </BButton>
      </MobileStickyActionBar>
    </div>

    <PassConfigDlg v-model:visible="configPassVisible" />
    <AvatarFramePickerDrawer v-model:open="frameDrawerOpen" @navigate="handleFrameNavigation" />
    <AvatarPicker
      v-model:open="avatarPickerOpen"
      :current-src="headPicture"
      :frame-id="equippedFrameId"
      @select="handleAvatarSelected"
    />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import userApi from '@/api/userApi.ts';
  import { recordOperation } from '@/api/commonApi.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { backRouterPage } from '@/utils/common';
  import icon from '@/config/icon.ts';
  import PassConfigDlg from './PassConfigDlg.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import AvatarFramePickerDrawer from '@/components/growth/AvatarFramePickerDrawer.vue';
  import AvatarPicker from './AvatarPicker.vue';
  import { resolveAccountRoleLabelKey } from '@/config/accountRole';
  import MobileStickyActionBar from '@/components/mobile/MobileStickyActionBar.vue';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { frameVariant } from '@/config/growthFrames';
  import router from '@/router';

  interface ProfileSnapshot {
    alias: string;
    email: string;
    headPicture: string;
  }

  const user = useUserStore();
  const bookmark = bookmarkStore();
  const { growth, load: loadGrowth, loadGrowthTasks } = useGrowth();
  const { t, te } = useI18n();

  const headPicture = ref('');
  const avatarChanged = ref(false);
  const saving = ref(false);
  const configPassVisible = ref(false);
  const frameDrawerOpen = ref(false);
  const avatarPickerOpen = ref(false);
  const visible = defineModel<boolean>('visible');
  const userData = ref({ alias: '', email: '' });
  const originalProfile = ref({ alias: '', email: '' });

  const isGuest = computed(() => user.role === 'visitor' || !user.id);
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
  const displayAlias = computed(() => userData.value.alias.trim() || t('personCenter.defaultNickname'));
  const hasChanges = computed(() => {
    if (isGuest.value) return false;
    return (
      avatarChanged.value ||
      userData.value.alias !== originalProfile.value.alias ||
      userData.value.email.trim() !== originalProfile.value.email
    );
  });

  function handleFrameNavigation(destination: 'growth' | 'tasks' | 'achievements') {
    frameDrawerOpen.value = false;
    const target =
      destination === 'achievements'
        ? { path: '/growth', query: { section: 'achievements' } }
        : destination === 'tasks'
          ? { path: '/growth', query: { section: 'tasks' } }
          : '/growth';
    void router.push(target);
  }

  function getUserSnapshot(): ProfileSnapshot {
    return {
      alias: String(user.alias || ''),
      email: String(user.email || ''),
      headPicture: String(user.headPicture || ''),
    };
  }

  function syncProfile(snapshot: ProfileSnapshot = getUserSnapshot()) {
    userData.value = { alias: snapshot.alias, email: snapshot.email };
    originalProfile.value = { alias: snapshot.alias, email: snapshot.email };
    headPicture.value = snapshot.headPicture;
    avatarChanged.value = false;
  }

  syncProfile();

  onMounted(() => {
    loadGrowth();
  });

  watch(
    () => ({ alias: user.alias, email: user.email, headPicture: user.headPicture }),
    () => {
      // 用户正在编辑时不要被其他请求刷新出来的用户信息覆盖。
      if (!hasChanges.value) syncProfile();
    },
    { deep: true },
  );

  function handleAvatarSelected(source: string) {
    if (isGuest.value) return;
    headPicture.value = source;
    avatarChanged.value = true;
  }

  function handleConfigPassword() {
    configPassVisible.value = true;
  }

  function handleLogin() {
    bookmark.isShowLogin = true;
  }

  function handleBack() {
    if (!hasChanges.value) {
      backRouterPage();
      return;
    }

    Alert.alert({
      title: t('myInfo.unsavedTitle'),
      content: t('myInfo.unsavedContent'),
      cancelText: t('myInfo.keepEditing'),
      okText: t('myInfo.discardChanges'),
      onOk: backRouterPage,
    });
  }

  async function saveUserInfo() {
    if (isGuest.value) {
      handleLogin();
      return;
    }
    if (!hasChanges.value) return;

    const alias = userData.value.alias.trim();
    const email = userData.value.email.trim();
    if (!alias) {
      message.warning(t('myInfo.enterNickname'));
      return;
    }
    if (email && !validateEmail(email)) {
      message.warning(t('myInfo.invalidEmail'));
      return;
    }

    saving.value = true;
    try {
      const payload: { id: string; alias: string; email: string; headPicture?: string } = {
        id: user.id,
        headPicture: headPicture.value,
        alias,
        email,
      };
      if (!avatarChanged.value) delete payload.headPicture;

      const res = await userApi.updateUserInfo(payload);
      if (res.status !== 200) return;

      recordOperation({ module: '我的信息', operation: '保存个人信息成功' });
      message.success(t('myInfo.saveSuccess'));

      const userPromise = await userApi.getUserInfoById({ id: user.id });
      user.setUserInfo(userPromise.data);
      syncProfile({
        alias: String(userPromise.data.alias || alias),
        email: String(userPromise.data.email || email),
        headPicture: String(userPromise.data.headPicture || ''),
      });
      await loadGrowthTasks(true);

      if (visible.value !== undefined) {
        visible.value = false;
      } else {
        backRouterPage();
      }
    } catch (err) {
      console.error('后台错误：' + err);
    } finally {
      saving.value = false;
    }
  }

  function validateEmail(email: string) {
    const regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
    return regex.test(email);
  }

  function getRoleName() {
    return t(resolveAccountRoleLabelKey(user.role, user.id));
  }
</script>

<style lang="less" scoped>
  .profile-page {
    width: 100%;
    max-width: 560px;
    min-height: 100%;
    margin: 0 auto;
    padding: 8px 0 0;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .profile-hero {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 4px 8px 10px;
  }

  .profile-hero--framed {
    padding-top: 14px;
  }

  .profile-avatar {
    width: 88px;
    height: 88px;
    position: relative;
    flex: 0 0 88px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    color: var(--primary-color);
    background: var(--surface-panel-bg);
    cursor: pointer;
    padding: 0;
    line-height: normal;
    transition:
      border-color 0.2s,
      background-color 0.2s;

    &:hover {
      border-color: var(--primary-color);
      background: var(--surface-card-bg);
    }
  }

  .profile-avatar__image {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border-radius: 50%;

    :deep(img),
    :deep(.icon-base64),
    :deep(.icon-fixed-base64) {
      width: 100% !important;
      height: 100% !important;
      display: block;
      border-radius: 50%;
      object-fit: cover;
    }
  }

  .profile-avatar--disabled {
    cursor: default;

    &:hover {
      border-color: var(--surface-border-color);
      background: var(--surface-panel-bg);
    }
  }

  .profile-avatar.profile-avatar--framed {
    width: auto;
    height: auto;
    flex: 0 0 auto;
    overflow: visible;
    border-color: transparent;
    background: transparent;
  }

  .profile-avatar__edit {
    position: absolute;
    right: 1px;
    bottom: 1px;
    width: 27px;
    height: 27px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 3px solid var(--background-color);
    border-radius: 50%;
    color: #fff;
    background: var(--primary-color);
    pointer-events: none;
  }

  .profile-decoration-row {
    width: 100%;
    min-height: 64px;
    justify-content: flex-start;
    gap: 11px;
    padding: 10px 12px;
    border: 1px solid var(--primary-color);
    border-radius: 14px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--primary-color) 6%, var(--surface-card-bg));
    text-align: left;
  }

  .profile-decoration-row__icon {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 36px;
    border-radius: 11px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, var(--surface-card-bg));
  }

  .profile-decoration-row__copy {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 4px;
  }

  .profile-decoration-row__copy strong,
  .profile-decoration-row__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-decoration-row__copy strong {
    font-size: 14px;
  }

  .profile-decoration-row__copy small {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 400;
  }

  .profile-decoration-row__arrow {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .profile-hero__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }

  .profile-hero__name {
    max-width: 190px;
    overflow: hidden;
    color: var(--text-color);
    font-size: 20px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-hero__hint {
    max-width: 210px;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-role-pill {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 10px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 25%, var(--surface-border-color));
    border-radius: 999px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    font-size: 12px;
    line-height: 1;
  }

  .profile-section,
  .profile-visitor-card {
    padding: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--surface-card-bg);
    box-sizing: border-box;
  }

  .profile-section__heading {
    margin-bottom: 14px;
    color: var(--desc-color);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .profile-field + .profile-field {
    margin-top: 14px;
  }

  .profile-field__label {
    display: block;
    margin-bottom: 7px;
    color: var(--text-color);
    font-size: 14px;
    font-weight: 600;
  }

  .profile-input {
    width: 100%;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--surface-panel-bg);
    transition:
      border-color 0.2s,
      box-shadow 0.2s;

    &:focus-within {
      border-color: var(--primary-color);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 12%, transparent);
    }

    :deep(.input-container) {
      width: 100%;
    }

    :deep(.b-input) {
      border: 0 !important;
      background: transparent !important;
      color: var(--text-color);
    }
  }

  .profile-action-row {
    width: 100%;
    min-height: 62px;
    justify-content: space-between;
    padding: 9px 10px 9px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--text-color);
    background: var(--surface-panel-bg);
    text-align: left;

    &:hover {
      border-color: var(--primary-color);
      background: var(--surface-card-bg);
    }
  }

  .profile-action-row__main {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .profile-action-row__icon {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 34px;
    border-radius: 10px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 11%, transparent);
  }

  .profile-action-row__text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      font-size: 14px;
      line-height: 1.25;
    }

    small {
      color: var(--desc-color);
      font-size: 12px;
      font-weight: 400;
      line-height: 1.25;
    }
  }

  .profile-action-row__arrow {
    flex: 0 0 auto;
    color: var(--desc-color);
  }

  .profile-visitor-card {
    padding: 18px 16px;
  }

  .profile-visitor-card__title {
    color: var(--text-color);
    font-size: 16px;
    font-weight: 650;
  }

  .profile-visitor-card__description {
    margin: 7px 0 15px;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.55;
  }

  .profile-login-button,
  .profile-save-button {
    width: 100%;
  }

  .profile-saved-state {
    display: flex;
    min-height: 36px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--desc-color);
    font-size: 12px;
  }

  html.light-note-mobile-rendering .profile-decoration-row {
    border-color: var(--primary-color);
    background: var(--surface-panel-bg);
  }

  @media (max-width: 360px) {
    .profile-hero {
      gap: 12px;
      padding-left: 0;
      padding-right: 0;
    }

    .profile-avatar {
      width: 80px;
      height: 80px;
      flex-basis: 80px;
    }

    .profile-hero__name {
      max-width: 165px;
      font-size: 18px;
    }

    .profile-hero__hint {
      max-width: 175px;
    }
  }
</style>
