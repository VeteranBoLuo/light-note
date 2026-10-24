<template>
  <BModal
    v-model:visible="visible"
    :title="t('accountSettings.changeEmail')"
    width="var(--ui-layout-480, 480px)"
    :mask-closable="false"
    :close-disabled="busy"
    @ok="submit"
  >
    <div class="email-form">
      <BLoading v-if="loading" :loading="true" />
      <div v-else-if="loadFailed" role="alert">
        {{ t('accountSettings.accountFailed') }}
        <BButton @click="loadAccount">{{ t('common.retry') }}</BButton>
      </div>
      <template v-else>
        <p class="email-hint">{{ t('accountSettings.changeEmailHint') }}</p>
        <p class="email-hint">{{ t('accountSettings.email') }}{{ account.email }}</p>
        <template v-if="!challenge">
          <div class="email-field">
            <label for="account-email-new">{{ t('accountSettings.newEmail') }}</label>
            <BInput
              id="account-email-new"
              v-model:value="email"
              type="email"
              :maxlength="254"
              autocomplete="email"
              :disabled="busy"
              :placeholder="t('accountSettings.newEmailPlaceholder')"
              @enter="submit"
            />
          </div>
          <div v-if="!useGithub && account.hasPassword !== false" class="email-field">
            <label for="account-email-password">{{ t('accountSettings.oldPassword') }}</label>
            <BInput
              id="account-email-password"
              v-model:value="oldPassword"
              type="password"
              :maxlength="64"
              autocomplete="current-password"
              :disabled="busy"
              :placeholder="t('accountSettings.oldPlaceholder')"
              @enter="submit"
            />
          </div>
          <p v-if="useGithub && account.recentGithub" class="email-verified">{{
            t('accountSettings.githubIdentityVerified')
          }}</p>
          <BButton
            v-if="account.githubBound && !account.recentGithub"
            type="text"
            :loading="githubStarting"
            :disabled="busy && !githubStarting"
            @click="verifyGithub"
            >{{ t('accountSettings.verifyGithubIdentity') }}</BButton
          >
          <p v-if="account.hasPassword === false && !account.githubBound" class="email-error" role="alert">
            {{ t('accountSettings.emailIdentityUnavailable') }}
          </p>
        </template>
        <template v-else>
          <p class="email-hint">{{ t('accountSettings.newEmailCodeSent', { email: maskedEmail }) }}</p>
          <div class="email-field">
            <label for="account-email-code">{{ t('accountSettings.emailCode') }}</label>
            <BInput
              id="account-email-code"
              v-model:value="code"
              type="tel"
              :maxlength="6"
              autocomplete="one-time-code"
              :disabled="busy"
              :placeholder="t('accountSettings.codePlaceholder')"
              @enter="submit"
            />
          </div>
          <BButton type="text" :disabled="busy" @click="editEmail">{{ t('accountSettings.editNewEmail') }}</BButton>
        </template>
        <p v-if="error" class="email-error" role="alert">{{ error }}</p>
      </template>
    </div>
    <template #footer>
      <div class="email-actions">
        <BButton :disabled="busy" @click="visible = false">{{ t('common.cancel') }}</BButton>
        <BButton
          type="primary"
          :loading="sending || saving"
          :disabled="loading || loadFailed || githubStarting || !canVerifyIdentity || (!challenge && countdown > 0)"
          @click="submit"
        >
          {{
            challenge
              ? t('accountSettings.confirmEmailChange')
              : countdown > 0
                ? t('accountSettings.resendIn', { n: countdown })
                : t('accountSettings.sendNewEmailCode')
          }}
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
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { isValidEmail } from '@/utils/validator';
  import { createGithubAuthorizationUrl, rememberGithubOAuthFlow } from '@/utils/githubOAuth';
  import { rememberAuthNavigationIntent } from '@/utils/authNavigationIntent';

  const visible = defineModel<boolean>('visible', { default: false });
  const { t } = useI18n();
  const user = useUserStore();
  const account = ref({ email: '', hasPassword: null as boolean | null, githubBound: false, recentGithub: false });
  const loading = ref(false),
    loadFailed = ref(false),
    sending = ref(false),
    saving = ref(false),
    githubStarting = ref(false);
  const email = ref(''),
    oldPassword = ref(''),
    code = ref(''),
    challenge = ref(''),
    maskedEmail = ref(''),
    error = ref('');
  const useGithub = computed(() => account.value.recentGithub || account.value.hasPassword === false);
  const countdown = ref(0);
  let generation = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const busy = computed(() => sending.value || saving.value || githubStarting.value);
  const canVerifyIdentity = computed(
    () =>
      Boolean(challenge.value) || (useGithub.value ? account.value.recentGithub : account.value.hasPassword !== false),
  );
  function stopTimer() {
    if (timer) clearInterval(timer);
    timer = undefined;
    countdown.value = 0;
  }
  function reset() {
    generation++;
    stopTimer();
    email.value = oldPassword.value = code.value = challenge.value = maskedEmail.value = error.value = '';
    sending.value = saving.value = githubStarting.value = false;
    account.value = { email: '', hasPassword: null, githubBound: false, recentGithub: false };
  }
  async function loadAccount() {
    const owner = ++generation;
    loading.value = true;
    loadFailed.value = false;
    try {
      const res = await apiBaseGet('/api/user/email-change/status');
      if (owner !== generation || !visible.value) return;
      if (res?.status !== 200) throw new Error();
      account.value = {
        email: res.data?.email || '',
        hasPassword: typeof res.data?.hasPassword === 'boolean' ? res.data.hasPassword : null,
        githubBound: res.data?.githubBound === true,
        recentGithub: res.data?.recentGithub === true,
      };
    } catch {
      if (owner === generation) loadFailed.value = true;
    } finally {
      if (owner === generation) loading.value = false;
    }
  }
  function editEmail() {
    challenge.value = code.value = error.value = '';
  }
  async function verifyGithub() {
    if (busy.value) return;
    const owner = generation;
    githubStarting.value = true;
    try {
      const url = await createGithubAuthorizationUrl({ flow: 'login' });
      if (owner !== generation || !visible.value) return;
      rememberAuthNavigationIntent('/settings?section=account');
      rememberGithubOAuthFlow('login');
      window.location.assign(url);
    } catch {
      if (owner === generation) error.value = t('auth.githubStartFailed');
    } finally {
      if (owner === generation) githubStarting.value = false;
    }
  }
  async function submit() {
    if (busy.value || loading.value || loadFailed.value || !visible.value || !canVerifyIdentity.value) return;
    error.value = '';
    if (!challenge.value) {
      if (countdown.value) return;
      if (!isValidEmail(email.value)) {
        error.value = t('accountSettings.newEmailPlaceholder');
        return;
      }
      if (!useGithub.value && !oldPassword.value) {
        error.value = t('accountSettings.oldPlaceholder');
        return;
      }
    } else if (!/^\d{6}$/.test(code.value)) {
      error.value = t('accountSettings.codePlaceholder');
      return;
    }
    const owner = generation;
    const confirming = Boolean(challenge.value);
    sending.value = !confirming;
    saving.value = confirming;
    try {
      const res = await apiBasePost(
        `/api/user/email-change/${confirming ? 'confirm' : 'request'}`,
        confirming
          ? { challenge: challenge.value, code: code.value }
          : { email: email.value.trim(), ...(!useGithub.value ? { oldPassword: oldPassword.value } : {}) },
        { silent: true },
      );
      if (owner !== generation || !visible.value) return;
      if (res?.status !== 200) {
        if (res?.data?.code === 'EMAIL_CHANGE_IDENTITY_REQUIRED') account.value.recentGithub = false;
        error.value = res?.msg || t('accountSettings.emailChangeFailed');
        return;
      }
      if (confirming) {
        message.success(t('accountSettings.emailChanged'));
        visible.value = false;
        window.dispatchEvent(new CustomEvent('light-note:auth-expired'));
      } else {
        if (typeof res.data?.challenge !== 'string' || !res.data.challenge) throw new Error();
        challenge.value = res.data.challenge;
        maskedEmail.value = String(res.data?.maskedEmail || '');
        oldPassword.value = '';
        code.value = '';
        countdown.value = Number(res.data?.resendAfter) || 60;
        if (timer) clearInterval(timer);
        timer = setInterval(() => {
          if (--countdown.value <= 0) stopTimer();
        }, 1000);
      }
    } catch {
      if (owner === generation) error.value = t('accountSettings.emailChangeFailed');
    } finally {
      if (owner === generation) sending.value = saving.value = false;
    }
  }
  watch(
    visible,
    (open) => {
      reset();
      if (open) void loadAccount();
    },
    { immediate: true, flush: 'sync' },
  );
  watch(
    () => [user.id, user.role, user.adminContext?.id, user.adminContext?.subjectUserId],
    () => {
      visible.value = false;
      reset();
    },
    { flush: 'sync' },
  );
  onBeforeUnmount(reset);
</script>

<style scoped lang="less">
  .email-form,
  .email-field {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .email-form {
    gap: var(--ui-space-16, 16px);
  }
  .email-field {
    gap: var(--ui-space-6, 6px);
  }
  .email-field label {
    color: var(--text-color);
    font-size: var(--ui-font-13, 13px);
  }
  .email-hint,
  .email-error,
  .email-verified {
    margin: 0;
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .email-hint {
    color: var(--desc-color);
  }
  .email-error {
    color: var(--danger-color);
  }
  .email-verified {
    color: var(--primary-color);
  }
  .email-form > :deep(.b_btn) {
    align-self: flex-start;
  }
  .email-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-12, 12px) var(--ui-space-20, 20px) var(--ui-space-18, 18px);
  }
</style>
