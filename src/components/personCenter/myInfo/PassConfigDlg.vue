<template>
  <b-modal
    :mask-closable="false"
    v-model:visible="visible"
    :title="user.password ? '修改密码' : '设置密码'"
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
  import { checkEndCondition, endCondition } from '@/utils/validator.ts';
  const user = useUserStore();
  const visible = defineModel('visible');
  const type = computed(() => {
    return user.password ? '修改密码' : '设置密码';
  });

  const formData = ref<{ type?: string; password: string; confirmPassword: string; oldPassword?: string }>({
    confirmPassword: '',
    password: '',
  });

  const formFields: any = computed(() => {
    if (type.value === '修改密码') {
      return [
        {
          label: '原密码',
          name: 'oldPassword',
          required: true,
        },
        {
          label: '新密码',
          name: 'password',
          required: true,
        },
        {
          label: '确认新密码',
          name: 'confirmPassword',
          required: true,
        },
      ];
    }
    return [
      {
        label: '密码',
        name: 'password',
        required: true,
      },
      {
        label: '确认新密码',
        name: 'confirmPassword',
        required: true,
      },
    ];
  });
  const passCfgRef = ref(null);
  function submit() {
    const isPass = passCfgRef.value?.validateForm();
    let condition: endCondition[] = [];
    if (isPass) {
      if (type.value === '设置密码') {
        condition = [
          {
            endCondition: formData.value.password !== formData.value.confirmPassword,
            message: '两次密码输入不一致',
          },
          {
            endCondition: formData.value.password.length > 12,
            message: '密码长度不能大于12位',
          },
          {
            endCondition: formData.value.password.length < 6,
            message: '密码长度不能小于6位',
          },
        ];
      } else {
        condition = [
          {
            endCondition: formData.value.oldPassword !== formData.value.confirmPassword,
            message: '两次密码输入不一致',
          },
          {
            endCondition: formData.value.password.length > 16,
            message: '新密码长度不能大于16位',
          },
          {
            endCondition: formData.value.password.length < 6,
            message: '新密码长度不能小于6位',
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
          message.success(type.value + '成功');
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
