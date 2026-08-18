<template>
  <b-modal :mask-closable="false" :title="t('myInfo.title')" v-model:visible="visible" @close="visible = false">
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
            :size="80"
            :decorative="false"
          />
          <svg-icon v-else :src="headPicture || icon.navigation.user" :size="80" />
          <span v-if="user.role !== 'visitor' && user.id" class="user_icon__edit" aria-hidden="true">
            <SvgIcon :src="icon.card_edit" :size="13" />
          </span>
        </BButton>
      </div>
      <div class="home-user-body">
        <div class="flex-align-center" style="gap: 20px">
          <div class="flex-justify-center" style="gap: 20px">
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
          <b-input style="width: 100%" v-model:value="userData.alias" :placeholder="t('myInfo.enterNickname')" />
        </div>

        <div class="user-item">
          <span class="user-item-label">{{ t('myInfo.email') }}</span>
          <b-input v-model:value="userData.email" :placeholder="t('myInfo.enterEmail')" />
        </div>
      </div>
    </div>
    <template #footer>
      <div style="padding: 0 20px 16px; display: flex; justify-content: center">
        <b-button style="margin-top: 10px; width: 100%" type="primary" :loading="saving" @click="saveUserInfo">{{
          t('myInfo.save')
        }}</b-button>
      </div>
    </template>
  </b-modal>
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
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed, Ref, ref, watch } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import userApi from '@/api/userApi.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import PassConfigDlg from '@/components/personCenter/myInfo/PassConfigDlg.vue';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import AvatarFramePickerDrawer from '@/components/growth/AvatarFramePickerDrawer.vue';
  import AvatarPicker from '@/components/personCenter/myInfo/AvatarPicker.vue';
  import { resolveAccountRoleLabelKey } from '@/config/accountRole';
  import { frameVariant } from '@/config/growthFrames.ts';
  import router from '@/router';
  const user = useUserStore();
  const headPicture = ref<string>('');
  const avatarChanged = ref(false);
  const saving = ref(false);
  const visible = <Ref<boolean>>defineModel('visible');

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

  watch(
    visible,
    (isVisible) => {
      if (isVisible) void loadGrowth();
    },
    { immediate: true },
  );

  function handleAvatarSelected(source: string) {
    headPicture.value = source;
    avatarChanged.value = true;
  }

  async function saveUserInfo() {
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
      const res = await userApi.updateUserInfo(payload);
      if (res.status === 200) {
        recordOperation({ module: '我的信息', operation: '保存个人信息成功' });
        message.success(t('myInfo.saveSuccess'));
        const userPromise = await userApi.getUserInfoById({ id: user.id });
        user.setUserInfo(userPromise.data);
        avatarChanged.value = false;
        await loadGrowthTasks(true);
        visible.value = false;
      }
    } catch (err) {
      console.error('后台错误：' + err);
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
    configPassVisible.value = true;
  }

  function handleFrameNavigation(destination: 'growth' | 'tasks' | 'achievements') {
    frameDrawerOpen.value = false;
    visible.value = false;
    const target =
      destination === 'achievements'
        ? { path: '/growth', query: { section: 'achievements' } }
        : destination === 'tasks'
          ? { path: '/growth', query: { section: 'tasks' } }
          : '/growth';
    void router.push(target);
  }

  const userData = ref({ alias: user.alias, email: user.email });
  headPicture.value = user.headPicture || '';
  watch(
    () => ({ alias: user.alias, email: user.email, pic: user.headPicture }),
    (val) => {
      headPicture.value = val.pic || '';
      userData.value = { alias: val.alias, email: val.email };
    },
    {
      deep: true,
    },
  );
</script>

<style lang="less" scoped>
  .home-container {
    box-sizing: border-box;
    width: 400px;
    padding: 10px;
    font-size: 14px;
  }
  // 80px 头像下，最高档素材盒(artSize 137)会达到约 171px；弹窗正文从标题分隔线开始裁切，必须在正文内部预留上半径出血。
  .home-container--framed {
    padding-top: 56px;
  }
  .home-user-body {
    margin-top: 30px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
  }
  .home-container--framed .home-user-body {
    margin-top: 54px;
  }
  .user-item {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    .user-item-label {
      width: 80px;
      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }
  }
  .user_icon {
    height: 80px;
    width: 80px;
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
    width: 25px;
    height: 25px;
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
    min-height: 56px;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
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
    gap: 8px;
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
      width: 90%;
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
</style>
