<template>
  <div class="banned-page">
    <div class="banned-card">
      <div class="banned-icon">🚫</div>
      <h1 class="banned-title">账号已被封禁</h1>
      <p class="banned-desc">你的账号目前无法使用。如有异议，可在下方提交申诉，管理员会在「反馈」中处理并回复。</p>

      <template v-if="!submitted">
        <textarea
          v-model="content"
          class="banned-textarea"
          maxlength="500"
          placeholder="请说明你的情况（必填，500 字以内）"
        />
        <input v-model="phone" class="banned-input" maxlength="50" placeholder="联系方式（选填，便于回复）" />
        <button class="banned-submit" :disabled="submitting || !content.trim()" @click="submit">
          {{ submitting ? '提交中…' : '提交申诉' }}
        </button>
      </template>
      <div v-else class="banned-success">✅ 申诉已提交，我们会尽快处理。</div>

      <a class="banned-back" @click="logoutToGuest">退出登录</a>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import { apiBasePost } from '@/http/request';
  import userApi from '@/api/userApi.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';

  const content = ref('');
  const phone = ref('');
  const submitting = ref(false);
  const submitted = ref(false);

  async function submit() {
    if (submitting.value || !content.value.trim()) return;
    submitting.value = true;
    try {
      const res = await apiBasePost(
        '/api/user/appeal',
        { content: content.value.trim(), phone: phone.value.trim() },
        { silent: true }, // 由本组件统一提示,避免与全局错误提示重复弹两次
      );
      if (res.status === 200) {
        submitted.value = true;
      } else {
        message.error(res.msg || '提交失败，请稍后再试');
      }
    } catch {
      message.error('提交失败，请稍后再试');
    } finally {
      submitting.value = false;
    }
  }
  // 退出登录:清掉「被封会话」→ 变回游客,否则申诉后仍被 banned 会话粘住、进首页又被踹回 /banned
  async function logoutToGuest() {
    try {
      sessionStorage.setItem('manualLogout', '1'); // 抑制「登录已过期」提示
      await userApi.logout();
    } catch {
      /* 登出失败也强制回到游客态 */
    }
    window.location.href = '/landing'; // 整页刷新确保干净游客态
  }
</script>

<style lang="less" scoped>
  .banned-page {
    min-height: 100vh;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    background: var(--background-color);
  }
  .banned-card {
    width: 100%;
    max-width: 440px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    padding: 32px 28px;
    border-radius: 16px;
    border: 1px solid var(--card-border-color);
    background: var(--card-bg-color, var(--background-color));
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
    color: var(--text-color);
  }
  .banned-icon {
    font-size: 44px;
  }
  .banned-title {
    margin: 0;
    font-size: 22px;
    font-weight: 600;
  }
  .banned-desc {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--desc-color, var(--text-color));
    opacity: 0.85;
    text-align: center;
  }
  .banned-textarea {
    width: 100%;
    min-height: 96px;
    resize: vertical;
    padding: 10px 12px;
    box-sizing: border-box;
    border-radius: 10px;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    color: var(--text-color);
    font-size: 14px;
    outline: none;
  }
  .banned-input {
    width: 100%;
    padding: 10px 12px;
    box-sizing: border-box;
    border-radius: 10px;
    border: 1px solid var(--card-border-color);
    background: var(--background-color);
    color: var(--text-color);
    font-size: 14px;
    outline: none;
  }
  .banned-textarea:focus,
  .banned-input:focus {
    border-color: #615ced;
  }
  .banned-submit {
    width: 100%;
    border: 0;
    cursor: pointer;
    color: #fff;
    background: #615ced;
    font-size: 15px;
    font-weight: 500;
    padding: 10px;
    border-radius: 10px;
    transition: opacity 0.2s;
  }
  .banned-submit:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .banned-submit:not(:disabled):hover {
    opacity: 0.9;
  }
  .banned-success {
    font-size: 14px;
    color: var(--text-color);
    text-align: center;
  }
  .banned-back {
    font-size: 13px;
    color: #615ced;
    cursor: pointer;
    margin-top: 4px;
  }
  .banned-back:hover {
    text-decoration: underline;
  }
</style>
