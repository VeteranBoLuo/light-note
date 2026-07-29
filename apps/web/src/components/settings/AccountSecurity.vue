<template>
  <div class="acc-sec">
    <!-- 绑定状态 -->
    <div class="field">
      <div class="field-head">
        <span class="field-label">账号绑定</span>
        <span class="field-desc">登录方式与绑定信息</span>
      </div>
      <div class="binding">
        <span class="bind-item">邮箱：{{ acc.email || '未绑定' }}</span>
        <span class="bind-item">GitHub：{{ acc.githubBound ? '已绑定' : '未绑定' }}</span>
        <span class="bind-item">登录方式：{{ loginTypeText }}</span>
      </div>
    </div>

    <!-- 修改密码 -->
    <div class="field">
      <div class="field-head">
        <span class="field-label">{{ hasPassword ? '修改密码' : '设置密码' }}</span>
        <span class="field-desc">{{
          hasPassword ? '修改后需重新登录' : 'GitHub 登录用户可设置密码,之后也能用邮箱+密码登录'
        }}</span>
      </div>
      <BButton size="small" @click="pwVisible = true">{{ hasPassword ? '修改密码' : '设置密码' }}</BButton>
    </div>

    <!-- 登录设备 / 会话 -->
    <div class="field field--col">
      <div class="field-head field-head--row">
        <span class="field-label">登录设备</span>
        <div class="sess-actions">
          <BButton size="small" :disabled="loading" @click="loadSessions">刷新</BButton>
          <BButton size="small" type="primary" :disabled="revoking || otherCount === 0" @click="revokeOthers">
            下线其他设备{{ otherCount > 0 ? `(${otherCount})` : '' }}
          </BButton>
        </div>
      </div>
      <div v-if="!sessions.length" class="sess-empty">{{ loading ? '加载中…' : '暂无会话' }}</div>
      <div v-for="s in sessions" :key="s.id" class="sess-item" :class="{ 'is-current': s.current }">
        <div class="sess-main">
          <span class="sess-device">{{ parseUA(s.userAgent) }}</span>
          <span class="sess-meta">{{ s.ip || '未知 IP' }} · 最近活跃 {{ fmt(s.lastActiveTime) }}</span>
        </div>
        <span v-if="s.current" class="sess-badge">本机</span>
        <span v-else class="sess-revoke dom-hover" @click="revokeOne(s.id)">下线</span>
      </div>
    </div>

    <!-- 账号注销 -->
    <div class="field danger-zone">
      <div class="field-head">
        <span class="field-label danger-zone__title">注销账号</span>
        <span class="field-desc">永久删除账号及云端内容，操作完成后无法恢复</span>
      </div>
      <BButton size="small" type="danger" @click="openDeletion">注销账号</BButton>
    </div>

    <!-- 改密弹窗 -->
    <BModal
      v-model:visible="pwVisible"
      :title="hasPassword ? '修改密码' : '设置密码'"
      :mask-closable="false"
      @ok="submitPassword"
    >
      <div class="pw-form">
        <div v-if="hasPassword" class="pw-row">
          <label>当前密码</label>
          <BInput v-model:value="oldPwd" type="password" maxlength="64" placeholder="请输入当前密码" />
        </div>
        <div class="pw-row">
          <label>新密码</label>
          <BInput v-model:value="newPwd" type="password" maxlength="64" placeholder="6-64 位" />
        </div>
        <div class="pw-row">
          <label>确认新密码</label>
          <BInput v-model:value="confirmPwd" type="password" maxlength="64" placeholder="再次输入新密码" />
        </div>
      </div>
    </BModal>

    <BModal
      v-model:visible="deletionVisible"
      title="注销账号"
      width="520px"
      :show-footer="false"
      :mask-closable="!deleting"
      :esc-closable="!deleting"
      @close="closeDeletion"
    >
      <div v-if="deletionStep === 'intro'" class="deletion-flow">
        <div class="deletion-warning">
          <strong>这是不可撤销的永久操作</strong>
          <ul>
            <li>所有设备会立即退出，原账号无法再次登录。</li>
            <li>书签、笔记、待办、AI 会话及云空间内容会被永久删除。</li>
            <li>备份只包含云文件的名称等元信息；需要保留的文件请先逐个下载原文件。</li>
          </ul>
        </div>
        <div class="deletion-backup">
          <div>
            <span class="deletion-backup__title">建议先保存个人数据</span>
            <span class="field-desc">导出书签、笔记、标签、AI 数据和云文件清单</span>
          </div>
          <BButton :loading="exporting" :disabled="codeSending" @click="exportAll">先导出备份</BButton>
        </div>
        <div class="deletion-actions">
          <BButton :disabled="codeSending" @click="closeDeletion">取消</BButton>
          <BButton type="danger" :loading="codeSending" :disabled="exporting" @click="sendDeletionCode">
            获取验证码并继续
          </BButton>
        </div>
      </div>

      <div v-else class="deletion-flow">
        <p class="deletion-code-tip">
          <span>6 位验证码已发送至 </span>
          <strong>{{ deletionMaskedEmail || acc.email }}</strong>
          <span>，5 分钟内有效。</span>
        </p>
        <div class="deletion-form-row">
          <label for="account-deletion-code">邮箱验证码</label>
          <BInput
            id="account-deletion-code"
            v-model:value="deletionCode"
            type="tel"
            maxlength="6"
            placeholder="请输入 6 位验证码"
            @enter="submitDeletion"
          />
        </div>
        <div class="deletion-form-row">
          <label for="account-deletion-confirmation">
            <span>输入“</span>
            <strong>{{ DELETION_CONFIRMATION_TEXT }}</strong>
            <span>”确认</span>
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
            {{ deletionCountdown > 0 ? `${deletionCountdown} 秒后可重新发送` : '重新发送验证码' }}
          </BButton>
        </div>
        <p class="deletion-policy-note">
          为履行安全和法定义务必须保留的有限审计记录，将按隐私政策限定期限保存并与账号身份解除关联。
        </p>
        <div class="deletion-actions">
          <BButton :disabled="deleting" @click="deletionStep = 'intro'">上一步</BButton>
          <BButton type="danger" :loading="deleting" :disabled="!canSubmitDeletion" @click="submitDeletion">
            永久注销账号
          </BButton>
        </div>
      </div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBaseGet, apiBasePost } from '@/http/request';
  import { clearLoginHistory } from '@/utils/authStorage';

  // 账号信息从 /me 拉(store 未存 github_id/login_type;password 用 sanitizeUser 的 '******'/'' 判断是否已设)
  const acc = ref({ email: '', githubBound: false, loginType: 'local', hasPassword: true });
  const hasPassword = computed(() => acc.value.hasPassword);
  const loginTypeText = computed(() => (acc.value.loginType === 'github' ? 'GitHub' : '邮箱密码'));

  async function loadAccount() {
    try {
      const res = await apiBaseGet('/api/user/me');
      const d: any = res?.data || {};
      acc.value = {
        email: d.email || '',
        githubBound: !!d.github_id,
        loginType: d.login_type || 'local',
        hasPassword: !!d.password,
      };
    } catch {
      /* 忽略,展示用默认 */
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
    if (!ua) return '未知设备';
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
            : '浏览器';
    return [os, br].filter(Boolean).join(' · ') || '未知设备';
  }

  async function loadSessions() {
    loading.value = true;
    try {
      const res = await apiBasePost('/api/user/getMySessions', {});
      if (res.status === 200) sessions.value = res.data || [];
    } finally {
      loading.value = false;
    }
  }
  async function revokeOne(id: string) {
    const res = await apiBasePost('/api/user/revokeSession', { id });
    if (res.status === 200) {
      message.success('已下线该设备');
      await loadSessions();
    }
  }
  async function revokeOthers() {
    if (otherCount.value === 0) return;
    revoking.value = true;
    try {
      const res = await apiBasePost('/api/user/revokeSession', { others: true });
      if (res.status === 200) {
        message.success(`已下线其他 ${res.data?.revoked ?? ''} 台设备`);
        await loadSessions();
      }
    } finally {
      revoking.value = false;
    }
  }

  // —— 改密 ——
  const pwVisible = ref(false);
  const oldPwd = ref('');
  const newPwd = ref('');
  const confirmPwd = ref('');

  async function submitPassword() {
    if (hasPassword.value && !oldPwd.value) return message.warning('请输入当前密码');
    if (!newPwd.value || newPwd.value.length < 6) return message.warning('新密码至少 6 位');
    if (newPwd.value !== confirmPwd.value) return message.warning('两次输入的新密码不一致');
    const body: any = { password: newPwd.value };
    if (hasPassword.value) {
      body.type = 'update';
      body.oldPassword = oldPwd.value;
    }
    const res = await apiBasePost('/api/user/configPassword', body);
    if (res.status === 200) {
      pwVisible.value = false;
      oldPwd.value = newPwd.value = confirmPwd.value = '';
      // 后端改密后会清所有会话,提示并跳登录
      message.success('密码已更新,请重新登录');
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('light-note:auth-expired'));
      }, 800);
    } else {
      message.error(res.msg || '修改失败');
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
    try {
      const res = await apiBasePost('/api/user/exportData', {}, { silent: true });
      if (res?.status !== 200 || !res.data) {
        message.error(res?.msg || '导出失败，请稍后重试');
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
      message.success('备份已开始下载');
    } catch {
      message.error('导出失败，请稍后重试');
    } finally {
      exporting.value = false;
    }
  }

  async function sendDeletionCode() {
    if (codeSending.value) return;
    codeSending.value = true;
    try {
      const res = await apiBasePost('/api/user/requestAccountDeletionCode', {}, { silent: true });
      if (res?.status !== 200) {
        message.error(res?.msg || '验证码发送失败，请稍后重试');
        return;
      }
      deletionMaskedEmail.value = String(res.data?.maskedEmail || '');
      deletionStep.value = 'verify';
      deletionCode.value = '';
      startDeletionCountdown();
      message.success('注销验证码已发送');
    } catch (error) {
      showDeletionTransportError(error, '验证码发送失败，请检查网络后重试');
    } finally {
      codeSending.value = false;
    }
  }

  async function submitDeletion() {
    if (!canSubmitDeletion.value) {
      message.warning(`请输入 6 位验证码，并输入“${DELETION_CONFIRMATION_TEXT}”确认`);
      return;
    }
    deleting.value = true;
    try {
      const res = await apiBasePost(
        '/api/user/deleteMyAccount',
        {
          code: String(deletionCode.value).trim(),
          confirmation: String(deletionConfirmation.value).trim(),
        },
        { silent: true },
      );
      if (res?.status !== 200) {
        message.error(res?.msg || '账号注销失败，请稍后重试');
        return;
      }

      deletionVisible.value = false;
      stopDeletionCountdown();
      clearLoginHistory();
      sessionStorage.setItem('manualLogout', '1');
      message.success('账号已注销，云端数据正在安全清理');
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('light-note:auth-expired'));
      }, 500);
    } catch (error) {
      showDeletionTransportError(error, '账号注销失败，请检查网络后重试');
    } finally {
      deleting.value = false;
    }
  }

  onMounted(() => {
    loadAccount();
    loadSessions();
  });

  onBeforeUnmount(() => {
    stopDeletionCountdown();
  });
</script>

<style scoped lang="less">
  .acc-sec {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .field--col {
    flex-direction: column;
    align-items: stretch;
  }
  .field-head {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .field-head--row {
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
    justify-content: flex-end;
    font-size: 12px;
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
  .sess-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--card-border-color) 14%, transparent);
  }
  .sess-item.is-current {
    border: 1px solid color-mix(in srgb, var(--primary-color) 45%, transparent);
  }
  .sess-main {
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
    color: #ec4899;
    cursor: pointer;
    flex-shrink: 0;
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
    border-top: 1px solid color-mix(in srgb, var(--danger-color, #e5484d) 28%, transparent);
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
