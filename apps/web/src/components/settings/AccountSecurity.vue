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
        <span class="field-desc">{{ hasPassword ? '修改后需重新登录' : 'GitHub 登录用户可设置密码,之后也能用邮箱+密码登录' }}</span>
      </div>
      <b-button size="small" @click="pwVisible = true">{{ hasPassword ? '修改密码' : '设置密码' }}</b-button>
    </div>

    <!-- 登录设备 / 会话 -->
    <div class="field field--col">
      <div class="field-head field-head--row">
        <span class="field-label">登录设备</span>
        <div class="sess-actions">
          <b-button size="small" :disabled="loading" @click="loadSessions">刷新</b-button>
          <b-button size="small" type="primary" :disabled="revoking || otherCount === 0" @click="revokeOthers">
            下线其他设备{{ otherCount > 0 ? `(${otherCount})` : '' }}
          </b-button>
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

    <!-- 改密弹窗 -->
    <BModal v-model:visible="pwVisible" :title="hasPassword ? '修改密码' : '设置密码'" :mask-closable="false" @ok="submitPassword">
      <div class="pw-form">
        <div v-if="hasPassword" class="pw-row">
          <label>当前密码</label>
          <b-input type="password" v-model:value="oldPwd" maxlength="64" placeholder="请输入当前密码" />
        </div>
        <div class="pw-row">
          <label>新密码</label>
          <b-input type="password" v-model:value="newPwd" maxlength="64" placeholder="6-64 位" />
        </div>
        <div class="pw-row">
          <label>确认新密码</label>
          <b-input type="password" v-model:value="confirmPwd" maxlength="64" placeholder="再次输入新密码" />
        </div>
      </div>
    </BModal>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBaseGet, apiBasePost } from '@/http/request';

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
    const os = /Windows/i.test(ua) ? 'Windows' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : '';
    const br = /Edg/i.test(ua) ? 'Edge' : /Chrome/i.test(ua) ? 'Chrome' : /Firefox/i.test(ua) ? 'Firefox' : /Safari/i.test(ua) ? 'Safari' : '浏览器';
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

  onMounted(() => {
    loadAccount();
    loadSessions();
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
</style>
