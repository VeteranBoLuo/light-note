<template>
  <b-modal :mask-closable="false" :title="t('myInfo.title')" v-model:visible="visible" @close="visible = false">
    <div class="home-container">
      <div style="width: 100%" class="flex-justify-center">
        <BUpload
          accept="image/*"
          :multiple="false"
          :max-total-size="MAX_AVATAR_FILE_SIZE"
          raw-file
          @change="handleAvatarChange"
        >
          <template #default>
            <div
              class="user_icon"
              :class="{ 'user_icon--framed': equippedFrameId }"
              v-click-log="{ module: '我的信息', operation: `上传头像` }"
            >
              <AvatarFramePreview
                v-if="equippedFrameId"
                :frame-id="equippedFrameId"
                :src="headPicture || icon.navigation.user"
                :size="80"
                :decorative="false"
              />
              <svg-icon v-else :src="headPicture || icon.navigation.user" :size="80" />
            </div>
          </template>
        </BUpload>
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
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import { compressAvatarFile } from '@/utils/compressAvatar.ts';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import AvatarFramePickerDrawer from '@/components/growth/AvatarFramePickerDrawer.vue';
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
  const MAX_AVATAR_FILE_SIZE = 5000 * 1024;
  const frameDrawerOpen = ref(false);
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

  async function handleAvatarChange(files: File[]) {
    const file = files?.[0];
    if (!file) return;
    try {
      headPicture.value = await compressAvatarFile(file);
      avatarChanged.value = true;
    } catch (error) {
      console.error('头像压缩失败:', error);
      message.error(t('myInfo.imageProcessingFailed'));
    }
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
    const roleNames = {
      admin: t('myInfo.admin'),
      visitor: t('myInfo.visitor'),
      root: t('myInfo.root'),
    };
    return roleNames[user.role] || t('myInfo.unknownRole');
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
    width: 400px;
    padding: 10px;
    font-size: 14px;
  }
  .home-user-body {
    margin-top: 30px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;
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
    &:hover::after {
      content: ''; /* 移除硬编码文本 */
      position: absolute; /* 绝对定位，相对于.preview-div定位 */
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: rgba(0, 0, 0, 0.5); /* 半透明的黑色背景 */
      color: white; /* 文字颜色 */
      display: flex; /* 使用flex布局使文字居中 */
      justify-content: center; /* 水平居中 */
      align-items: center; /* 垂直居中 */
      font-size: 12px; /* 文字大小 */
    }
  }
  .user_icon--framed {
    overflow: visible;
    border-color: transparent;
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
