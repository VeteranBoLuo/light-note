<template>
  <CommonContainer :title="t('myInfo.title')">
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
            <div class="user_icon" v-click-log="{ module: '我的信息', operation: `上传头像` }">
              <svg-icon :src="headPicture || icon.navigation.user" :size="bookmark.isMobile ? 80 : 100" />
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
        </div>
        <div class="user-item">
          <span class="user-item-label">{{ t('myInfo.nickname') }}</span>
          <b-input style="width: 100%" v-model:value="userData.alias" :placeholder="t('myInfo.enterNickname')" />
        </div>

        <div class="user-item">
          <span class="user-item-label">{{ t('myInfo.email') }}</span>
          <b-input v-model:value="userData.email" :placeholder="t('myInfo.enterEmail')" />
        </div>

        <div class="user-item">
          <span class="user-item-label">{{ t('myInfo.password') }}</span>
          <b-button class="password-action" @click="handleConfigPassword">
            {{ user.password ? t('myInfo.changePassword') : t('myInfo.setPassword') }}
          </b-button>
        </div>
      </div>
    </div>
    <b-button
      class="container-footer-btn"
      type="primary"
      :loading="saving"
      @click="saveUserInfo"
      >{{ t('myInfo.save') }}</b-button
    >
    <PassConfigDlg v-model:visible="configPassVisible" />
  </CommonContainer>
</template>

<script lang="ts" setup>
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { Ref, ref, watch } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import userApi from '@/api/userApi.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import icon from '@/config/icon.ts';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { useI18n } from 'vue-i18n';
  import { backRouterPage } from '@/utils/common';
  import { recordOperation } from '@/api/commonApi.ts';
  import PassConfigDlg from './PassConfigDlg.vue';
  import { useGrowth } from '@/composables/useGrowth.ts';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import { compressAvatarFile } from '@/utils/compressAvatar.ts';
  const user = useUserStore();
  const headPicture = ref<string>('');
  const avatarChanged = ref(false);
  const saving = ref(false);
  const configPassVisible = ref(false);
  const visible = <Ref<boolean>>defineModel('visible');

  const bookmark = bookmarkStore();
  const { loadGrowthTasks } = useGrowth();
  const { t } = useI18n();
  const MAX_AVATAR_FILE_SIZE = 5000 * 1024;

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

  function handleConfigPassword() {
    configPassVisible.value = true;
  }

  async function saveUserInfo() {
    if (user.role === 'visitor' || !user.id) {
      message.warn(t('myInfo.pleaseLogin'));
      return;
    }
    userData.value.email = String(userData.value.email || '').trim();
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
    gap: 30px;
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
  .password-action {
    width: 100%;
  }
  .user_icon {
    height: 100px;
    width: 100px;
    display: flex;
    align-items: center;
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
