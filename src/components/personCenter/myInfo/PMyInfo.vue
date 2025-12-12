<template>
  <CommonContainer :title="t('myInfo.title')">
    <div class="home-container">
      <div style="width: 100%" class="flex-justify-center">
        <div class="user_icon" @click="uploadImg" v-click-log="{ module: '我的信息', operation: `上传头像` }">
          <svg-icon :src="headPicture || icon.navigation.user" :size="bookmark.isMobileDevice ? 80 : 100" />
        </div>
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
      </div>
    </div>
    <b-button
      class="container-footer-btn"
      type="primary"
      @click="saveUserInfo"
      v-click-log="{ module: '我的信息', operation: `保存` }"
      >{{ t('myInfo.save') }}</b-button
    >
  </CommonContainer>
</template>

<script lang="ts" setup>
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { Ref, ref, watch } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import userApi from '@/api/userApi.ts';
  import { message } from 'ant-design-vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { cloneDeep } from 'lodash-es';
  import icon from '@/config/icon.ts';
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { useI18n } from 'vue-i18n';
  const user = useUserStore();
  const headPicture = ref<string>('');
  const visible = <Ref<boolean>>defineModel('visible');

  const bookmark = bookmarkStore();
  const { t } = useI18n();
  function uploadImg() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.addEventListener('change', function (event: any) {
      const file = event.target.files[0]; // 获取用户选择的文件
      if (file) {
        // 检查文件大小是否超过5M
        const maxFileSize = 5000 * 1024;
        if (file.size > maxFileSize) {
          message.warning(t('myInfo.imageSizeLimit'));
          return; // 如果文件过大，终止函数执行
        }
        const reader = new FileReader(); // 创建FileReader对象
        reader.onload = function (e) {
          const base64 = e.target.result; // 直接获取Base64编码的字符串
          headPicture.value = base64.toString();
        };
        reader.onerror = function (error) {
          console.error('Error reading file:', error);
        };
        reader.readAsDataURL(file); // 读取文件内容，结果为Base64编码的字符串
      }
    });
    input.click(); // 触发文件选择对话框
  }

  function saveUserInfo() {
    if (!['admin', 'root'].includes(user.role)) {
      message.warn(t('myInfo.pleaseLogin'));
      return;
    }
    if (userData.value.email && !validateEmail(userData.value.email)) {
      message.warning(t('myInfo.invalidEmail'));
      return;
    }
    userApi
      .updateUserInfo({
        id: localStorage.getItem('userId'),
        headPicture: headPicture.value,
        alias: userData.value.alias,
        email: userData.value.email,
      })
      .then(async (res) => {
        if (res.status === 200) {
          message.success(t('myInfo.saveSuccess'));
          const userPromise = await userApi.getUserInfoById({ id: localStorage.getItem('userId') });
          user.setUserInfo(userPromise.data);
          visible.value = false;
        }
      })
      .catch((err) => {
        console.error('后台错误：' + err);
      });
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
  const userData = ref(cloneDeep(user));
  headPicture.value = cloneDeep(user.headPicture);
  watch(
    () => user,
    () => {
      headPicture.value = cloneDeep(user.headPicture);
      userData.value = cloneDeep(user);
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
