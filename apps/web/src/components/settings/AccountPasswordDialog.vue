<template>
  <BModal
    v-model:visible="visible"
    :title="title"
    width="var(--ui-layout-480, 480px)"
    :mask-closable="false"
    :close-disabled="saving || sending"
    @ok="submit"
  >
    <div class="password-form">
      <BLoading v-if="loading" :loading="true" />
      <div v-else-if="loadFailed" role="alert">
        {{ t('accountSettings.accountFailed') }}
        <BButton @click="loadAccount">{{ t('common.retry') }}</BButton>
      </div>
      <template v-else>
        <p class="password-hint">{{ t('accountSettings.passwordSessionHint') }}</p>
        <template v-if="useCode">
          <p class="password-email">{{ t('accountSettings.email') }}{{ email }}</p>
          <p v-if="!canReceiveEmail" class="password-error" role="alert">{{
            t('accountSettings.usableEmailRequired')
          }}</p>
          <div class="password-field">
            <label for="account-password-code">{{ t('accountSettings.emailCode') }}</label>
            <div class="password-code">
              <BInput
                id="account-password-code"
                v-model:value="code"
                :maxlength="6"
                autocomplete="one-time-code"
                :disabled="saving"
                :placeholder="t('accountSettings.codePlaceholder')"
              />
              <BButton :loading="sending" :disabled="!canReceiveEmail || countdown > 0 || saving" @click="sendCode">
                {{
                  countdown > 0
                    ? t('accountSettings.resendIn', { n: countdown })
                    : t('accountSettings.sendPasswordCode')
                }}
              </BButton>
            </div>
          </div>
        </template>
        <div v-else class="password-field">
          <label for="account-password-current">{{ t('accountSettings.oldPassword') }}</label>
          <BInput
            id="account-password-current"
            v-model:value="oldPassword"
            type="password"
            :maxlength="64"
            autocomplete="current-password"
            :disabled="saving"
            :placeholder="t('accountSettings.oldPlaceholder')"
          />
        </div>
        <div class="password-field">
          <label for="account-password-new">{{ t('accountSettings.newPassword') }}</label>
          <BInput
            id="account-password-new"
            v-model:value="password"
            type="password"
            :maxlength="64"
            autocomplete="new-password"
            :disabled="saving"
            :placeholder="t('accountSettings.newPlaceholder')"
          />
        </div>
        <div class="password-field">
          <label for="account-password-confirm">{{ t('accountSettings.confirmPassword') }}</label>
          <BInput
            id="account-password-confirm"
            v-model:value="confirmation"
            type="password"
            :maxlength="64"
            autocomplete="new-password"
            :disabled="saving"
            :placeholder="t('accountSettings.confirmPlaceholder')"
            @enter="submit"
          />
        </div>
        <BButton
          v-if="passwordState !== false"
          class="password-switch"
          type="text"
          :disabled="saving || sending"
          @click="toggleMode"
        >
          {{ useCode ? t('accountSettings.useCurrentPassword') : t('accountSettings.forgotPassword') }}
        </BButton>
        <p v-if="error" class="password-error" role="alert">{{ error }}</p>
      </template>
    </div>
    <template #footer>
      <div class="password-actions">
        <BButton :disabled="saving || sending" @click="visible = false">{{ t('common.cancel') }}</BButton>
        <BButton
          type="primary"
          :loading="saving"
          :disabled="loading || loadFailed || sending || (useCode && !canReceiveEmail)"
          @click="submit"
        >
          {{ t('common.confirm') }}
        </BButton>
      </div>
    </template>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { apiBaseGet, apiBasePost } from '@/http/request';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';

  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();
  const user = useUserStore();
  const passwordState = ref<boolean | null>(null);
  const email = ref('');
  const useCode = ref(true);
  const loading = ref(false);
  const loadFailed = ref(false);
  const saving = ref(false);
  const sending = ref(false);
  const error = ref('');
  const oldPassword = ref('');
  const password = ref('');
  const confirmation = ref('');
  const code = ref('');
  const countdown = ref(0);
  let generation = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const title = computed(() =>
    t(
      passwordState.value === false
        ? 'accountSettings.setPassword'
        : passwordState.value === true
          ? 'accountSettings.changePassword'
          : 'accountSettings.configurePassword',
    ),
  );
  const canReceiveEmail = computed(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value) && !/@users\.noreply\.github\.com$/i.test(email.value),
  );

  function clearFields() {
    oldPassword.value = password.value = confirmation.value = code.value = error.value = '';
  }
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = undefined;
    countdown.value = 0;
  }
  async function loadAccount() {
    const owner = ++generation;
    loading.value = true;
    loadFailed.value = false;
    try {
      const res = await apiBaseGet('/api/user/me');
      if (owner !== generation) return;
      if (res.status !== 200) throw new Error('ACCOUNT_LOAD_FAILED');
      email.value = res.data?.email || '';
      passwordState.value = typeof res.data?.hasPassword === 'boolean' ? res.data.hasPassword : null;
      useCode.value = passwordState.value !== true;
    } catch {
      if (owner === generation) loadFailed.value = true;
    } finally {
      if (owner === generation) loading.value = false;
    }
  }
  function toggleMode() {
    useCode.value = !useCode.value;
    clearFields();
  }
  async function sendCode() {
    if (sending.value || countdown.value || !canReceiveEmail.value || saving.value) return;
    const owner = generation;
    sending.value = true;
    error.value = '';
    try {
      const res = await apiBasePost('/api/user/sendEmail', { email: email.value });
      if (owner !== generation) return;
      if (res.status !== 200) {
        error.value = res.msg || t('accountSettings.sendFailed');
        return;
      }
      message.success(t('accountSettings.passwordCodeSent'));
      countdown.value = 60;
      timer = setInterval(() => {
        if (--countdown.value <= 0) stopTimer();
      }, 1000);
    } catch {
      if (owner === generation) error.value = t('accountSettings.sendFailed');
    } finally {
      if (owner === generation) sending.value = false;
    }
  }
  async function submit() {
    if (saving.value || sending.value || loading.value || loadFailed.value || !visible.value) return;
    error.value = '';
    if (useCode.value && (!canReceiveEmail.value || !/^\d{6}$/.test(code.value))) {
      error.value = t('accountSettings.codePlaceholder');
      return;
    }
    if (!useCode.value && !oldPassword.value) {
      error.value = t('accountSettings.oldPlaceholder');
      return;
    }
    if (password.value.length < 6 || password.value.length > 64) {
      error.value = t('accountSettings.newPlaceholder');
      return;
    }
    if (password.value !== confirmation.value) {
      error.value = t('accountSettings.mismatch');
      return;
    }
    const owner = generation;
    saving.value = true;
    try {
      const res = await apiBasePost('/api/user/configPassword', {
        password: password.value,
        ...(useCode.value ? { code: code.value } : { oldPassword: oldPassword.value }),
      });
      if (owner !== generation) return;
      if (res.status !== 200) {
        error.value = res.msg || t('accountSettings.updateFailed');
        return;
      }
      message.success(t('accountSettings.passwordUpdated'));
      visible.value = false;
      window.dispatchEvent(new CustomEvent('light-note:auth-expired'));
    } catch {
      if (owner === generation) error.value = t('accountSettings.updateFailed');
    } finally {
      if (owner === generation) saving.value = false;
    }
  }
  watch(
    visible,
    (open) => {
      generation++;
      clearFields();
      stopTimer();
      saving.value = sending.value = false;
      passwordState.value = null;
      email.value = '';
      if (open) void loadAccount();
    },
    { immediate: true, flush: 'sync' },
  );
  watch(
    () => [user.id, user.role, user.adminContext?.id, user.adminContext?.subjectUserId],
    () => {
      generation++;
      visible.value = false;
      clearFields();
      stopTimer();
    },
    { flush: 'sync' },
  );
  onBeforeUnmount(() => {
    generation++;
    stopTimer();
    clearFields();
  });
</script>

<style scoped lang="less">
  .password-form {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-16, 16px);
    min-width: 0;
  }
  .password-hint,
  .password-email {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .password-field {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-6, 6px);
  }
  .password-field label {
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
  }
  .password-code {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
  }
  .password-code > :first-child {
    flex: 1 1 var(--ui-layout-160, 160px);
    min-width: 0;
  }
  .password-switch {
    align-self: flex-start;
  }
  .password-error {
    margin: 0;
    color: var(--danger-color);
    font-size: var(--ui-font-13, 13px);
  }
  .password-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-12, 12px) var(--ui-space-20, 20px) var(--ui-space-18, 18px);
  }
</style>
