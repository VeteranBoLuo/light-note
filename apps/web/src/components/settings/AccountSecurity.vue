<template>
  <div class="acc-sec">
    <SettingsSectionCard :title="t('accountSettings.binding')" :description="t('accountSettings.bindingDesc')">
      <div v-if="accountFailed" role="alert" class="account-error"
        >{{ t('accountSettings.accountFailed') }} <BButton @click="loadAccount">{{ t('common.retry') }}</BButton></div
      >
      <!-- 绑定状态 -->
      <div class="account-field">
        <div class="binding">
          <span class="bind-item">{{ t('accountSettings.email') }}{{ acc.email || t('accountSettings.unbound') }}</span>
          <span class="bind-item"
            >GitHub：{{ acc.githubBound ? t('accountSettings.bound') : t('accountSettings.unbound') }}</span
          >
          <span class="bind-item">{{ t('accountSettings.method') }}{{ loginTypeText }}</span>
        </div>
      </div>

      <!-- 修改密码 -->
      <div class="account-field">
        <div class="field-head">
          <span class="field-label">{{
            hasPassword ? t('accountSettings.changePassword') : t('accountSettings.setPassword')
          }}</span>
          <span class="field-desc">{{
            hasPassword ? t('accountSettings.passwordDesc') : t('accountSettings.setPasswordDesc')
          }}</span>
        </div>
        <BButton size="small" :disabled="accountLoading || accountFailed" @click="pwVisible = true">{{
          hasPassword ? t('accountSettings.changePassword') : t('accountSettings.setPassword')
        }}</BButton>
      </div>
    </SettingsSectionCard>
    <SettingsSectionCard>
      <!-- 登录设备 / 会话 -->
      <div class="account-field account-field--col">
        <div class="field-head field-head--row">
          <span class="field-label">{{ t('accountSettings.devices') }}</span>
          <div class="sess-actions">
            <BButton size="small" :loading="loading" @click="loadSessions">{{ t('accountSettings.refresh') }}</BButton>
            <BButton
              size="small"
              :loading="revoking"
              :disabled="revoking || loading || otherCount === 0"
              @click="revokeOthers"
            >
              {{ t('accountSettings.revokeOthers', { n: otherCount }) }}
            </BButton>
          </div>
        </div>
        <p v-if="sessionsError" role="alert" class="account-error">{{ sessionsError }}</p>
        <div v-if="!sessions.length && !sessionsError" class="sess-empty">{{
          loading ? t('accountSettings.loading') : t('accountSettings.empty')
        }}</div>
        <div v-for="s in sessions" :key="s.id" class="sess-item" :class="{ 'is-current': s.current }">
          <div class="sess-main">
            <span class="sess-device">{{ parseUA(s.userAgent) }}</span>
            <span class="sess-meta"
              >{{ s.ip || t('accountSettings.unknownIP') }} · {{ t('accountSettings.recent') }}
              {{ fmt(s.lastActiveTime) }}</span
            >
          </div>
          <span v-if="s.current" class="sess-badge">{{ t('accountSettings.current') }}</span>
          <BButton
            v-else
            class="sess-revoke"
            :loading="revokingId === s.id"
            :disabled="revoking || loading"
            @click="revokeOne(s.id)"
            >{{ t('accountSettings.revoke') }}</BButton
          >
        </div>
      </div>
    </SettingsSectionCard>
    <SettingsSectionCard class="account-danger-card">
      <!-- 账号注销 -->
      <div class="account-field danger-zone">
        <div class="field-head">
          <span class="field-label danger-zone__title">{{ t('accountSettings.delete') }}</span>
          <span class="field-desc">{{ t('accountSettings.deleteDesc') }}</span>
        </div>
        <BButton size="small" type="danger" :disabled="accountLoading || accountFailed" @click="openDeletion">{{
          t('accountSettings.delete')
        }}</BButton>
      </div>
    </SettingsSectionCard>
    <!-- 改密弹窗 -->
    <BModal
      v-model:visible="pwVisible"
      :title="hasPassword ? t('accountSettings.changePassword') : t('accountSettings.setPassword')"
      :mask-closable="false"
      :close-disabled="passwordSaving"
      @ok="submitPassword"
    >
      <div class="pw-form">
        <div v-if="hasPassword" class="pw-row">
          <label>{{ t('accountSettings.oldPassword') }}</label>
          <BInput
            v-model:value="oldPwd"
            type="password"
            maxlength="64"
            autocomplete="current-password"
            :placeholder="t('accountSettings.oldPlaceholder')"
          />
        </div>
        <div class="pw-row">
          <label>{{ t('accountSettings.newPassword') }}</label>
          <BInput
            v-model:value="newPwd"
            type="password"
            maxlength="64"
            autocomplete="new-password"
            :placeholder="t('accountSettings.newPlaceholder')"
          />
        </div>
        <div class="pw-row">
          <label>{{ t('accountSettings.confirmPassword') }}</label>
          <BInput
            v-model:value="confirmPwd"
            type="password"
            maxlength="64"
            autocomplete="new-password"
            :placeholder="t('accountSettings.confirmPlaceholder')"
          />
        </div>
      </div>
      <template #footer
        ><div class="password-actions"
          ><BButton :disabled="passwordSaving" @click="pwVisible = false">{{ t('common.cancel') }}</BButton
          ><BButton type="primary" :loading="passwordSaving" @click="submitPassword">{{
            t('common.confirm')
          }}</BButton></div
        ></template
      >
    </BModal>

    <BModal
      v-model:visible="deletionVisible"
      :title="t('accountSettings.delete')"
      width="520px"
      :show-footer="false"
      :mask-closable="!deleting"
      :esc-closable="!deleting"
      @close="closeDeletion"
    >
      <div v-if="deletionStep === 'intro'" class="deletion-flow">
        <div class="deletion-warning">
          <strong>{{ t('accountSettings.irreversible') }}</strong>
          <ul>
            <li>{{ t('accountSettings.deleteDevices') }}</li>
            <li>{{ t('accountSettings.deleteContent') }}</li>
            <li>{{ t('accountSettings.backupScope') }}</li>
          </ul>
        </div>
        <div class="deletion-backup">
          <div>
            <span class="deletion-backup__title">{{ t('accountSettings.backupTitle') }}</span>
            <span class="field-desc">{{ t('accountSettings.backupDesc') }}</span>
          </div>
          <BButton :loading="exporting" :disabled="codeSending" @click="exportAll">{{
            t('accountSettings.export')
          }}</BButton>
        </div>
        <div class="deletion-actions">
          <BButton :disabled="codeSending" @click="closeDeletion">{{ t('accountSettings.cancel') }}</BButton>
          <BButton type="danger" :loading="codeSending" :disabled="exporting" @click="sendDeletionCode">
            {{ t('accountSettings.getCode') }}
          </BButton>
        </div>
      </div>

      <div v-else class="deletion-flow">
        <p class="deletion-code-tip">
          <span>{{ t('accountSettings.codePrefix') }} </span>
          <strong>{{ deletionMaskedEmail || acc.email }}</strong>
          <span>{{ t('accountSettings.codeSuffix') }}</span>
        </p>
        <div class="deletion-form-row">
          <label for="account-deletion-code">{{ t('accountSettings.emailCode') }}</label>
          <BInput
            id="account-deletion-code"
            v-model:value="deletionCode"
            type="tel"
            maxlength="6"
            :placeholder="t('accountSettings.codePlaceholder')"
            @enter="submitDeletion"
          />
        </div>
        <div class="deletion-form-row">
          <label for="account-deletion-confirmation">
            <span>{{ t('accountSettings.confirmationPrefix') }}</span>
            <strong>{{ DELETION_CONFIRMATION_TEXT }}</strong>
            <span>{{ t('accountSettings.confirmationSuffix') }}</span>
          </label>
          <BInput
            id="account-deletion-confirmation"
            v-model:value="deletionConfirmation"
            maxlength="8"
            :placeholder="DELETION_CONFIRMATION_TEXT"
            @enter="submitDeletion"
          />
        </div>
        <div class="deletion-resend">
          <BButton size="small" :disabled="deletionCountdown > 0 || codeSending || deleting" @click="sendDeletionCode">
            {{
              deletionCountdown > 0
                ? t('accountSettings.resendIn', { n: deletionCountdown })
                : t('accountSettings.resend')
            }}
          </BButton>
        </div>
        <p class="deletion-policy-note">
          {{ t('accountSettings.retention') }}
        </p>
        <div class="deletion-actions">
          <BButton :disabled="deleting" @click="deletionStep = 'intro'">{{ t('accountSettings.previous') }}</BButton>
          <BButton type="danger" :loading="deleting" :disabled="!canSubmitDeletion" @click="submitDeletion">
            {{ t('accountSettings.deleteForever') }}
          </BButton>
        </div>
      </div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import SettingsSectionCard from '@/view/settings/components/SettingsSectionCard.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBaseGet, apiBasePost } from '@/http/request';
  import { clearLoginHistory } from '@/utils/authStorage';

  const { t } = useI18n();
  const user = useUserStore();
  let generation = 0;
  const accountFailed = ref(false);
  const accountLoading = ref(true);
  const passwordSaving = ref(false);
  // 账号信息从 /me 拉(store 未存 github_id/login_type;password 用 sanitizeUser 的 '******'/'' 判断是否已设)
  const acc = ref({ email: '', githubBound: false, loginType: 'local', hasPassword: true });
  const hasPassword = computed(() => acc.value.hasPassword);
  const loginTypeText = computed(() =>
    acc.value.loginType === 'github' ? 'GitHub' : t('accountSettings.emailPassword'),
  );

  async function loadAccount() {
    const owner = generation;
    accountFailed.value = false;
    accountLoading.value = true;
    try {
      const res = await apiBaseGet('/api/user/me');
      if (owner !== generation) return;
      if (res?.status !== 200) throw new Error('ACCOUNT_LOAD_FAILED');
      const d: any = res?.data || {};
      acc.value = {
        email: d.email || '',
        githubBound: !!d.github_id,
        loginType: d.login_type || 'local',
        hasPassword: !!d.password,
      };
    } catch {
      if (owner === generation) accountFailed.value = true;
    } finally {
      if (owner === generation) accountLoading.value = false;
    }
  }

  // —— 会话列表 ——
  interface Sess {
    id: string;
    ip: string;
    userAgent: string;
    createTime?: string;
    lastActiveTime?: string;
    current?: boolean;
  }
  const sessions = ref<Sess[]>([]);
  const loading = ref(false);
  const revoking = ref(false);
  const otherCount = computed(() => sessions.value.filter((s) => !s.current).length);

  function fmt(t?: string) {
    if (!t) return '—';
    const d = new Date(t);
    if (Number.isNaN(d.getTime())) return String(t);
    const p = (n: number) => String(n).padStart(2, '0');
    // 本地时区(勿用 toISOString,会差时区)
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  // 轻量 UA 解析,仅用于展示设备
  function parseUA(ua: string) {
    if (!ua) return t('accountSettings.unknownDevice');
    const os = /Windows/i.test(ua)
      ? 'Windows'
      : /iPhone|iPad/i.test(ua)
        ? 'iOS'
        : /Android/i.test(ua)
          ? 'Android'
          : /Mac/i.test(ua)
            ? 'macOS'
            : /Linux/i.test(ua)
              ? 'Linux'
              : '';
    const br = /Edg/i.test(ua)
      ? 'Edge'
      : /Chrome/i.test(ua)
        ? 'Chrome'
        : /Firefox/i.test(ua)
          ? 'Firefox'
          : /Safari/i.test(ua)
            ? 'Safari'
            : t('accountSettings.browser');
    return [os, br].filter(Boolean).join(' · ') || t('accountSettings.unknownDevice');
  }

  const sessionsError = ref('');
  const revokingId = ref<string | null>(null);
  let sessionRequest = 0;
  async function loadSessions() {
    const owner = generation;
    const requestId = ++sessionRequest;
    loading.value = true;
    sessionsError.value = '';
    try {
      const res = await apiBasePost('/api/user/getMySessions', {});
      if (owner !== generation || requestId !== sessionRequest) return;
      if (res.status !== 200) throw new Error('SESSIONS_FAILED');
      sessions.value = res.data || [];
    } catch {
      if (owner === generation && requestId === sessionRequest)
        sessionsError.value = t('accountSettings.sessionsFailed');
    } finally {
      if (owner === generation && requestId === sessionRequest) loading.value = false;
    }
  }
  function confirmRevoke(body: { id?: string; others?: boolean }, content: string) {
    const owner = generation;
    Alert.alert({
      title: t('accountSettings.revoke'),
      content,
      okText: t('accountSettings.revoke'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (owner !== generation || revoking.value) return;
        revoking.value = true;
        revokingId.value = body.id || null;
        sessionsError.value = '';
        try {
          const res = await apiBasePost('/api/user/revokeSession', body);
          if (owner !== generation) return;
          if (res.status !== 200) throw new Error('REVOKE_FAILED');
          message.success(
            body.others
              ? t('accountSettings.revokedOthers', { n: res.data?.revoked ?? 0 })
              : t('accountSettings.revoked'),
          );
          await loadSessions();
        } catch {
          if (owner === generation) sessionsError.value = t('accountSettings.revokeFailed');
        } finally {
          if (owner === generation) {
            revoking.value = false;
            revokingId.value = null;
          }
        }
      },
    });
  }
  function revokeOne(id: string) {
    const session = sessions.value.find((item) => item.id === id);
    if (!session || session.current || revoking.value) return;
    confirmRevoke({ id }, t('accountSettings.confirmOne', { device: parseUA(session.userAgent) }));
  }
  function revokeOthers() {
    if (!otherCount.value || revoking.value) return;
    confirmRevoke({ others: true }, t('accountSettings.confirmOthers', { n: otherCount.value }));
  }

  // —— 改密 ——
  const pwVisible = ref(false);
  const oldPwd = ref('');
  const newPwd = ref('');
  const confirmPwd = ref('');

  async function submitPassword() {
    if (hasPassword.value && !oldPwd.value) return message.warning(t('accountSettings.oldPlaceholder'));
    if (!newPwd.value || newPwd.value.length < 6) return message.warning(t('accountSettings.minPassword'));
    if (newPwd.value !== confirmPwd.value) return message.warning(t('accountSettings.mismatch'));
    const body: any = { password: newPwd.value };
    if (hasPassword.value) {
      body.type = 'update';
      body.oldPassword = oldPwd.value;
    }
    if (passwordSaving.value) return;
    const owner = generation;
    passwordSaving.value = true;
    try {
      const res = await apiBasePost('/api/user/configPassword', body);
      if (owner !== generation) return;
      if (res.status === 200) {
        pwVisible.value = false;
        oldPwd.value = newPwd.value = confirmPwd.value = '';
        // 后端改密后会清所有会话,提示并跳登录
        message.success(t('accountSettings.passwordUpdated'));
        setTimeout(() => {
          if (owner !== generation) return;
          window.dispatchEvent(new CustomEvent('light-note:auth-expired'));
        }, 800);
      } else {
        message.error(res.msg || t('accountSettings.updateFailed'));
      }
    } catch {
      if (owner === generation) message.error(t('accountSettings.updateFailed'));
    } finally {
      if (owner === generation) passwordSaving.value = false;
    }
  }

  // —— 账号注销 ——
  const DELETION_CONFIRMATION_TEXT = '注销账号';
  const deletionVisible = ref(false);
  const deletionStep = ref<'intro' | 'verify'>('intro');
  const deletionMaskedEmail = ref('');
  const deletionCode = ref('');
  const deletionConfirmation = ref('');
  const deletionCountdown = ref(0);
  const codeSending = ref(false);
  const deleting = ref(false);
  const exporting = ref(false);
  let deletionCountdownTimer: number | null = null;

  const canSubmitDeletion = computed(
    () =>
      /^\d{6}$/.test(String(deletionCode.value || '').trim()) &&
      String(deletionConfirmation.value || '').trim() === DELETION_CONFIRMATION_TEXT &&
      !deleting.value,
  );

  function stopDeletionCountdown() {
    if (deletionCountdownTimer !== null) {
      window.clearInterval(deletionCountdownTimer);
      deletionCountdownTimer = null;
    }
  }

  function startDeletionCountdown(seconds = 60) {
    stopDeletionCountdown();
    deletionCountdown.value = seconds;
    deletionCountdownTimer = window.setInterval(() => {
      deletionCountdown.value -= 1;
      if (deletionCountdown.value <= 0) {
        deletionCountdown.value = 0;
        stopDeletionCountdown();
      }
    }, 1000);
  }

  function resetDeletionFlow() {
    stopDeletionCountdown();
    deletionStep.value = 'intro';
    deletionMaskedEmail.value = '';
    deletionCode.value = '';
    deletionConfirmation.value = '';
    deletionCountdown.value = 0;
    codeSending.value = false;
  }

  function openDeletion() {
    resetDeletionFlow();
    deletionVisible.value = true;
  }

  function showDeletionTransportError(error: any, fallback: string) {
    const code = String(error?.code || '');
    const alreadyReported =
      code === 'HTTP_429' ||
      code.startsWith('HTTP_5') ||
      code.startsWith('ADMIN_') ||
      code === 'USER_BANNED' ||
      code === 'IP_BANNED';
    if (!alreadyReported) {
      message.error(error?.message || fallback);
    }
  }

  function closeDeletion() {
    if (deleting.value) return;
    deletionVisible.value = false;
    resetDeletionFlow();
  }

  async function exportAll() {
    if (exporting.value) return;
    exporting.value = true;
    const owner = generation;
    try {
      const res = await apiBasePost('/api/user/exportData', {}, { silent: true });
      if (owner !== generation) return;
      if (res?.status !== 200 || !res.data) {
        message.error(res?.msg || t('accountSettings.exportFailed'));
        return;
      }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const date = new Date();
      const pad = (value: number) => String(value).padStart(2, '0');
      const download = document.createElement('a');
      download.href = url;
      download.download = `轻笺备份_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
      document.body.appendChild(download);
      download.click();
      document.body.removeChild(download);
      URL.revokeObjectURL(url);
      message.success(t('accountSettings.downloaded'));
    } catch {
      if (owner !== generation) return;
      message.error(t('accountSettings.exportFailed'));
    } finally {
      if (owner === generation) exporting.value = false;
    }
  }

  async function sendDeletionCode() {
    if (codeSending.value) return;
    codeSending.value = true;
    const owner = generation;
    try {
      const res = await apiBasePost('/api/user/requestAccountDeletionCode', {}, { silent: true });
      if (owner !== generation) return;
      if (res?.status !== 200) {
        message.error(res?.msg || t('accountSettings.sendFailed'));
        return;
      }
      deletionMaskedEmail.value = String(res.data?.maskedEmail || '');
      deletionStep.value = 'verify';
      deletionCode.value = '';
      startDeletionCountdown();
      message.success(t('accountSettings.codeSent'));
    } catch (error) {
      if (owner !== generation) return;
      showDeletionTransportError(error, t('accountSettings.sendNetwork'));
    } finally {
      if (owner === generation) codeSending.value = false;
    }
  }

  async function submitDeletion() {
    if (!canSubmitDeletion.value) {
      message.warning(t('accountSettings.confirmRequired', { text: DELETION_CONFIRMATION_TEXT }));
      return;
    }
    deleting.value = true;
    const owner = generation;
    try {
      const res = await apiBasePost(
        '/api/user/deleteMyAccount',
        {
          code: String(deletionCode.value).trim(),
          confirmation: String(deletionConfirmation.value).trim(),
        },
        { silent: true },
      );
      if (owner !== generation) return;
      if (res?.status !== 200) {
        message.error(res?.msg || t('accountSettings.deleteFailed'));
        return;
      }

      deletionVisible.value = false;
      stopDeletionCountdown();
      clearLoginHistory();
      sessionStorage.setItem('manualLogout', '1');
      message.success(t('accountSettings.deleted'));
      window.setTimeout(() => {
        if (owner !== generation) return;
        window.dispatchEvent(new CustomEvent('light-note:auth-expired'));
      }, 500);
    } catch (error) {
      if (owner !== generation) return;
      showDeletionTransportError(error, t('accountSettings.deleteNetwork'));
    } finally {
      if (owner === generation) deleting.value = false;
    }
  }

  watch(
    () => [user.id, user.role, user.adminContext?.id, user.adminContext?.subjectUserId],
    () => {
      generation++;
      sessions.value = [];
      acc.value = { email: '', githubBound: false, loginType: 'local', hasPassword: true };
      revoking.value = false;
      passwordSaving.value = false;
      exporting.value = false;
      deleting.value = false;
      revokingId.value = null;
      pwVisible.value = false;
      oldPwd.value = newPwd.value = confirmPwd.value = '';
      deletionVisible.value = false;
      resetDeletionFlow();
      void loadAccount();
      void loadSessions();
    },
    { immediate: true, flush: 'sync' },
  );

  onBeforeUnmount(() => {
    generation++;
    stopDeletionCountdown();
  });
</script>

<style scoped lang="less">
  .acc-sec {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 0;
  }
  .acc-sec .account-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    box-sizing: border-box;
    min-height: 56px;
    padding: 12px 0;
    border-bottom: 1px solid var(--card-border-color);
    &:last-child {
      border-bottom: 0;
    }
  }
  .acc-sec .account-field--col {
    gap: 0;
    padding: 0;
    min-height: 0;
    flex-direction: column;
    align-items: stretch;
  }
  .field-head {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .acc-sec .field-head--row {
    margin-bottom: 8px;
    gap: 8px;
    width: 100%;
    max-width: none;
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .field-label {
    font-size: 14px;
    color: var(--text-color);
  }
  .field-desc {
    font-size: 12px;
    color: var(--desc-color);
  }
  .binding {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    justify-content: flex-start;
    width: 100%;
    font-size: 14px;
    color: var(--desc-color);
  }
  .sess-actions {
    display: flex;
    gap: 8px;
  }
  .sess-empty {
    font-size: 12px;
    color: var(--desc-color);
    padding: 6px 0;
  }
  .acc-sec .sess-item {
    width: 100%;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    box-sizing: border-box;
    padding: 10px 0;
    min-height: 58px;
    border-bottom: 1px solid var(--card-border-color);
  }
  .sess-item:last-child {
    border-bottom: 0;
  }
  .acc-sec :deep(.settings-section-card__head) {
    padding-bottom: 10px;
  }
  .sess-item.is-current {
    .sess-device {
      font-weight: 600;
    }
  }
  .acc-sec .sess-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .sess-device {
    font-size: 13px;
    color: var(--text-color);
  }
  .sess-meta {
    overflow-wrap: anywhere;
    font-size: 12px;
    color: var(--desc-color);
  }
  .sess-badge {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color) 15%, transparent);
    color: var(--primary-color);
  }
  .sess-revoke {
    font-size: 12px;
    color: var(--primary-color);
    cursor: pointer;
    flex-shrink: 0;
  }
  .account-danger-card {
    border-color: var(--danger-color);
  }
  .account-error {
    color: var(--danger-color);
    font-size: 13px;
  }
  .sess-actions {
    flex-wrap: wrap;
  }
  .password-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px 18px;
  }
  .pw-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .pw-row {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .pw-row label {
    font-size: 13px;
    color: var(--desc-color);
  }
  .danger-zone {
    border-top: 0;
    padding-top: 16px;
  }
  .danger-zone__title {
    color: var(--danger-color, #e5484d);
  }
  .deletion-flow {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
  }
  .deletion-warning {
    padding: 14px 16px;
    border-radius: 10px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--danger-color, #e5484d) 9%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--danger-color, #e5484d) 32%, transparent);
  }
  .deletion-warning strong {
    color: var(--danger-color, #e5484d);
    font-size: 14px;
  }
  .deletion-warning ul {
    margin: 10px 0 0;
    padding-left: 20px;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.7;
  }
  .deletion-backup {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .deletion-backup > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .deletion-backup__title {
    font-size: 14px;
    color: var(--text-color);
  }
  .deletion-code-tip,
  .deletion-policy-note {
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
  }
  .deletion-code-tip strong {
    color: var(--text-color);
  }
  .deletion-form-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .deletion-form-row label {
    color: var(--text-color);
    font-size: 13px;
  }
  .deletion-resend {
    display: flex;
    justify-content: flex-start;
  }
  .deletion-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  @media (max-width: 767px) {
    .field:not(.field--col),
    .deletion-backup {
      align-items: flex-start;
      flex-direction: column;
    }
    .binding {
      justify-content: flex-start;
    }
    .deletion-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .deletion-actions :deep(.b_btn) {
      width: 100%;
    }
  }
</style>
