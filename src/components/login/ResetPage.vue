<template>
  <div class="view-body" :class="title !== '重置' ? 'hide' : ''">
    <span @click="bookmark.isShowLogin = false" class="dom-hover login-close-icon" style="color: var(--primary-text)">
      游客体验
    </span>
    <div class="view-page">
      <span>
        <span class="dom-hover" style="color: var(--primary-text)" @click="title = '登录'">返回</span>
        <b style="font-size: 30px; color: #161824; position: absolute; left: 50%; transform: translateX(-50%)"
          >重置密码</b
        >
      </span>
      <a-form
        style="position: relative; top: 10%"
        :label-col="{
          span: 4,
        }"
        ref="resetRef"
        :model="formData"
      >
        <a-form-item
          label=""
          name="email"
          :rules="[
            {
              type: 'email',
              message: '请输入正确的邮箱格式',
            },
          ]"
        >
          <b-input
            @blur="validateFun('email')"
            theme="al-day"
            height="40px"
            v-model:value="formData.email"
            placeholder="邮箱"
          >
            <template #prefix>
              <svg-icon :src="icon.login.email" size="16" />
            </template>
          </b-input>
        </a-form-item>
        <a-form-item
          label=""
          name="password"
          @blur="validateFun('password')"
          :rules="[
            {
              max: 15,
              message: '密码长度不能超过15个字符',
            },
            {
              min: 6,
              message: '密码长度不能少于6个字符',
            },
          ]"
        >
          <b-input
            height="40px"
            theme="al-day"
            type="password"
            autocomplete="new-password"
            @blur="validateFun('password')"
            v-model:value="formData.password"
            placeholder="新密码"
          >
            <template #prefix>
              <svg-icon :src="icon.login.password" size="16" />
            </template>
          </b-input>
        </a-form-item>
        <a-form-item label="" name="rPassword" @blur="validateFun('rPassword')">
          <b-input
            height="40px"
            theme="al-day"
            type="password"
            autocomplete="new-password"
            v-model:value="formData.rPassword"
            placeholder="密码确认"
            @blur="validateFun('rPassword')"
          >
            <template #prefix>
              <svg-icon :src="icon.login.password" size="16" />
            </template>
          </b-input>
        </a-form-item>
        <a-form-item label="" name="rPassword">
          <span class="flex-center">
            <b-input :maxlength="6" theme="al-day" height="40px" placeholder="验证码" v-model:value="formData.code">
              <template #prefix>
                <svg-icon :src="icon.login.code" size="16" />
              </template>
              <template #suffix>
                <span style="color: var(--primary-text)" class="dom-hover" @click="sendEmail">{{
                  codeTime == 0 ? '获取验证码' : codeTime + 's'
                }}</span>
              </template>
            </b-input>
          </span>
        </a-form-item>
        <a-form-item>
          <b-button class="handle-btn" type="primary" @click="verifyCode" :class="{ 'disable-btn': disable }"
            >提交</b-button
          >
        </a-form-item>
      </a-form>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore } from '@/store';
  import { computed, reactive, ref } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import { message } from 'ant-design-vue';
  import { checkEndCondition } from '@/utils/validator.ts';

  const title = defineModel('title');
  const formData = reactive({
    email: '',
    password: '',
    rPassword: '',
    code: '',
  });

  const bookmark = bookmarkStore();
  const disable = computed(() => {
    return !formData.password || !formData.rPassword || !formData.email || !formData.code;
  });
  const resetRef = ref();
  async function validateFun(names: any) {
    await resetRef.value.validate(names);
  }

  function handleReset() {
    if (disable.value) {
      return;
    }
  }

  const codeTime = ref(0);
  function sendEmail() {
    if (codeTime.value !== 0) {
      return;
    }
    if (!formData.email) {
      message.warning('请填写邮箱');
      return;
    }
    apiBasePost('/api/user/sendEmail', { email: formData.email }).then((res) => {
      if (res.status === 200) {
        message.success('验证码发送成功！');
        codeTime.value = 60;
        const timer = setInterval(() => {
          codeTime.value--;
          if (codeTime.value === 0) {
            clearInterval(timer);
          }
        }, 1000);
      }
    });
  }
  const emit = defineEmits(['update:success']);

  function verifyCode() {
    const condition = [
      {
        endCondition: formData.password !== formData.rPassword,
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
    if (checkEndCondition(condition)) {
      return;
    }
    apiBasePost('/api/user/verifyCode', formData).then((res) => {
      if (res.status === 200) {
        title.value = '登录';
        message.success('验证通过,密码重置成功');
        emit('update:success', formData);
      }
    });
  }

  defineExpose({
    handleReset,
  });
</script>
<style lang="less" scoped>
  :deep(:-webkit-autofill) {
    -webkit-text-fill-color: #161824 !important;
  }
</style>
