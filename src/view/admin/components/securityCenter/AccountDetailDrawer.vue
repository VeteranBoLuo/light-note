<template>
  <b-drawer :open="visible" title="账号详情" width="640" @close="$emit('close')">
    <div class="security-detail">
      <section>
        <h3>{{ displayName }}</h3>
        <div class="detail-section">
          <div class="detail-row">
            <span class="detail-label">用户ID</span>
            <span class="detail-value">{{ account.userId }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">昵称</span>
            <span class="detail-value">{{ account.alias || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">邮箱</span>
            <span class="detail-value">{{ account.email || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">角色</span>
            <span class="detail-value">
              <span class="security-pill is-neutral">{{ account.role }}</span>
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">状态</span>
            <span class="detail-value">
              <span class="security-pill" :class="Number(account.delFlag) === 1 ? 'is-high' : 'is-low'">
                {{ Number(account.delFlag) === 1 ? '已封禁' : '正常' }}
              </span>
            </span>
          </div>
        </div>
      </section>

      <section>
        <h3>风险数据</h3>
        <div class="detail-section">
          <div class="detail-row">
            <span class="detail-label">风险分</span>
            <span class="detail-value" :style="{ color: scoreColor(account.riskScore || 0), fontWeight: 600 }">
              {{ account.riskScore || 0 }}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">事件次数</span>
            <span class="detail-value">{{ account.totalEvents || 0 }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">高危事件</span>
            <span class="detail-value" :style="{ color: (account.highRiskCount || 0) > 0 ? 'var(--security-high)' : undefined }">
              {{ account.highRiskCount || 0 }}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">严重事件</span>
            <span class="detail-value" :style="{ color: (account.criticalCount || 0) > 0 ? 'var(--security-critical)' : undefined }">
              {{ account.criticalCount || 0 }}
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">最近事件</span>
            <span class="detail-value">{{ account.lastEventAt || '-' }}</span>
          </div>
        </div>
      </section>

      <section>
        <div class="detail-actions">
          <b-button v-if="Number(account.delFlag) !== 1" @click="handleBan">封禁账号</b-button>
          <b-button v-else @click="handleUnban">解封账号</b-button>
          <b-button @click="handleViewEvents">查看攻击日志 →</b-button>
        </div>
      </section>
    </div>
  </b-drawer>
</template>

<script lang="ts" setup>
  import { computed } from 'vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import { scoreColor } from './securityShared';

  const props = defineProps<{
    visible: boolean;
    account: any;
  }>();

  const emit = defineEmits<{
    close: [];
    ban: [account: any];
    unban: [account: any];
    viewEvents: [userId: string, label: string];
  }>();

  const displayName = computed(() => {
    return props.account?.alias || props.account?.email || props.account?.userId || '';
  });

  function handleBan() {
    emit('ban', props.account);
  }

  function handleUnban() {
    emit('unban', props.account);
  }

  function handleViewEvents() {
    emit('viewEvents', props.account.userId, displayName.value);
  }
</script>

<style lang="less" scoped>
  @import './securityCenter.less';

  .detail-section {
    padding: 8px 0;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--menu-item-h-bg-color);

    &:last-child {
      border-bottom: none;
    }
  }

  .detail-label {
    font-size: 13px;
    color: var(--desc-color);
    flex-shrink: 0;
  }

  .detail-value {
    font-size: 13px;
    color: var(--text-color);
    text-align: right;
    word-break: break-all;
  }

  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding-top: 8px;
  }
</style>

