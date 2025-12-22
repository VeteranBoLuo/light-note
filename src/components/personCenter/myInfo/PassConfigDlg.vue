<template>
  <b-modal
    :mask-closable="false"
    v-model:visible="visible"
    :title="user.password ? t('myInfo.changePassword') : t('myInfo.setPassword')"
    @ok="submit"
  >
    <div class="password-cfg-container">
      <b-form ref="passCfgRef" form-id="userEditForm" :form-data="formData" :fields="formFields" layout="vertical" />
    </div>
  </b-modal>
</template>

<script lang="ts" setup>
  import { useUserStore } from '@/store';
  import { computed, ref, watch } from 'vue';
  import BForm from '@/components/base/BasicComponents/BForm/BForm.vue';
  import { apiBasePost } from '@/http/request.ts';
  import { message } from 'ant-design-vue';
  import { checkEndCondition, EndCondition } from '@/utils/validator.ts';
  import { useI18n } from 'vue-i18n';
  const user = useUserStore();
  const visible = defineModel('visible');
  const { t } = useI18n();
  const type = computed(() => {
    return user.password ? t('myInfo.changePassword') : t('myInfo.setPassword');
  });

  const formData = ref<{ type?: string; password: string; confirmPassword: string; oldPassword?: string }>({
    confirmPassword: '',
    password: '',
  });

  const formFields: any = computed(() => {
    if (type.value === t('myInfo.changePassword')) {
      return [
        {
          label: t('myInfo.oldPassword'),
          name: 'oldPassword',
          required: true,
        },
        {
          label: t('myInfo.newPassword'),
          name: 'password',
          required: true,
        },
        {
          label: t('myInfo.confirmNewPassword'),
          name: 'confirmPassword',
          required: true,
        },
      ];
    }
    return [
      {
        label: t('myInfo.password'),
        name: 'password',
        required: true,
      },
      {
        label: t('myInfo.confirmPassword'),
        name: 'confirmPassword',
        required: true,
      },
    ];
  });
  const passCfgRef = ref(null);
  function submit() {
    const isPass = passCfgRef.value?.validateForm();
    let condition: EndCondition[] = [];
    if (isPass) {
      if (type.value === t('myInfo.setPassword')) {
        condition = [
          {
            endCondition: formData.value.password !== formData.value.confirmPassword,
            message: t('myInfo.passwordMismatch'),
          },
          {
            endCondition: formData.value.password.length > 12,
            message: t('myInfo.passwordTooLong'),
          },
          {
            endCondition: formData.value.password.length < 6,
            message: t('myInfo.passwordTooShort'),
          },
        ];
      } else {
        condition = [
          {
            endCondition: formData.value.password !== formData.value.confirmPassword,
            message: t('myInfo.passwordMismatch'),
          },
          {
            endCondition: formData.value.password.length > 16,
            message: t('myInfo.newPasswordTooLong'),
          },
          {
            endCondition: formData.value.password.length < 6,
            message: t('myInfo.newPasswordTooShort'),
          },
        ];
      }
      if (checkEndCondition(condition)) {
        return;
      }
      formData.value.type = type.value === '修改密码' ? 'update' : 'sZet';
      apiBasePost('/api/user/configPassword', formData.value).then((res) => {
        if (res.status === 200) {
          user.password = formData.value.password;
          message.success(
            type.value === t('myInfo.changePassword')
              ? t('myInfo.changePasswordSuccess')
              : t('myInfo.setPasswordSuccess'),
          );
          visible.value = false;
          formData.value = { confirmPassword: '', password: '' };
        }
      });
    }
  }

  watch(
    () => visible.value,
    (val) => {
      if (!val) {
        formData.value = { confirmPassword: '', password: '' };
      }
    },
  );
</script>

<style lang="less" scoped>
  .password-cfg-container {
    width: 600px;
  }
</style>
