<template>
  <div class="view-body" :class="title !== '注册' ? 'hide' : ''">
    <span @click="bookmark.isShowLogin = false" class="dom-hover login-close-icon" style="color: var(--primary-text)">
      游客体验
    </span>
    <div class="view-page">
      <b style="font-size: 30px; justify-self: center; color: #161824">注册</b>
      <a-form
        :label-col="{
          span: 4,
        }"
        ref="registerRef"
        :model="formData"
      >
        <a-form-item
          label=""
          name="email"
          @blur="validateFun('email')"
          :rules="[
            {
              type: 'email',
              message: '请输入正确的邮箱格式',
            },
          ]"
        >
          <b-input height="40px" theme="al-day" v-model:value="formData.email" placeholder="邮箱" @blur="validateFun">
            <template #prefix>
              <svg-icon :src="icon.login.email" size="16" />
            </template>
          </b-input>
        </a-form-item>
        <a-form-item
          label=""
          name="password"
          :rules="[
            {
              max: 16,
              message: '密码长度不能超过16个字符',
            },
            {
              min: 6,
              message: '密码长度不能少于6个字符',
            },
          ]"
        >
          <span class="flex-center">
            <b-input
              theme="al-day"
              height="40px"
              maxlength="20"
              type="password"
              autocomplete="new-password"
              placeholder="密码"
              @blur="validateFun('password')"
              v-model:value="formData.password"
            >
              <template #prefix>
                <svg-icon :src="icon.login.password" size="16" />
              </template>
            </b-input>
          </span>
        </a-form-item>
        <a-form-item
          label=""
          name="rPassword"
          :rules="[
            {
              max: 16,
              message: '密码长度不能超过16个字符',
            },
            {
              min: 6,
              message: '密码长度不能少于6个字符',
            },
          ]"
        >
          <span class="flex-center">
            <b-input
              theme="al-day"
              height="40px"
              maxlength="20"
              type="password"
              placeholder="确认密码"
              @blur="validateFun('rPassword')"
              v-model:value="formData.rPassword"
            >
              <template #prefix>
                <svg-icon :src="icon.login.password" size="16" />
              </template>
            </b-input>
          </span>
        </a-form-item>
        <a-form-item>
          <b-button
            type="primary"
            class="handle-btn"
            :class="{ 'disable-btn': disable }"
            @click="handleRegister"
            v-click-log="OPERATION_LOG_MAP.register.register"
            >注册
          </b-button>
        </a-form-item>
      </a-form>
      <span class="tips-text"
        >已有账号？前往<a style="cursor: pointer !important; color: #3b82f6; margin-left: 2px" @click="title = '登录'"
          >登录</a
        ></span
      >
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, reactive, ref } from 'vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import userApi from '@/api/userApi.ts';
  import { message } from 'ant-design-vue';
  import { bookmarkStore } from '@/store';
  import { OPERATION_LOG_MAP } from '@/config/logMap.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { checkEndCondition } from '@/utils/validator.ts';
  import { cloneDeep } from 'lodash-es';
  const title = defineModel('title');
  const formData = reactive({
    password: '',
    rPassword: '',
    email: '',
    role: 'admin',
    theme: 'day',
  });
  const bookmark = bookmarkStore();
  const disable = computed(() => {
    return !formData.rPassword || !formData.password || !formData.email;
  });
  async function validateFun(names?: any) {
    await registerRef.value.validate(names);
  }
  const registerRef = ref();
  const emit = defineEmits(['update:success']);
  async function handleRegister() {
    const condition = [
      {
        endCondition: formData.rPassword !== formData.password,
        message: '两次密码输入不一致',
      },
      {
        endCondition: formData.password.length > 16,
        message: '密码长度不能大于16位',
      },
      {
        endCondition: formData.password.length < 6,
        message: '密码长度不能小于6位',
      },
    ];
    if (checkEndCondition(condition) || disable.value) {
      return;
    }
    await validateFun();
    formData.role = 'admin';
    const params = cloneDeep(formData);
    delete params.rPassword;
    apiBasePost('/api/user/registerUser', params).then((res: any) => {
      if (res.status === 200) {
        message.success('注册成功');
        title.value = '登录';
        emit('update:success', formData);
      }
    });
  }

  defineExpose({
    handleRegister,
  });
</script>

<style lang="less" scoped>
  :deep(:-webkit-autofill) {
    -webkit-text-fill-color: #161824 !important; //这个地方的颜色是字体颜色，可以根据实际情况修改
  }
</style>
