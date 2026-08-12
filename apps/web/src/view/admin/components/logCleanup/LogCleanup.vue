<template>
  <AdminDataPage eyebrow="Admin / Log Cleanup" title="日志清理" :subtitle="pageSubtitle">
    <div class="log-cleanup__grid">
      <section class="log-cleanup__card">
        <h3 class="log-cleanup__card-title">按 IP 清理</h3>
        <p class="log-cleanup__card-hint">输入某个 IP，先查询命中数量，确认后物理删除该 IP 的全部日志（不可恢复）。</p>
        <div class="log-cleanup__row">
          <BInput
            v-model:value="ip"
            placeholder="如 14.155.225.67"
            class="log-cleanup__input"
            :disabled="busy"
            @enter="query('exact')"
          />
          <BButton :loading="busy === 'query-exact'" :disabled="Boolean(busy)" @click="query('exact')">
            查询数量
          </BButton>
          <BButton
            type="danger"
            :loading="busy === 'clear-exact'"
            :disabled="Boolean(busy) || !ip.trim()"
            @click="clear('exact')"
          >
            清空该 IP 日志
          </BButton>
        </div>
      </section>

      <section class="log-cleanup__card">
        <h3 class="log-cleanup__card-title">本地 / 回环调试数据</h3>
        <p class="log-cleanup__card-hint">匹配 ::1 / localhost / 127.* / ::ffff:127.* 等本地调试噪声，一键清理。</p>
        <div class="log-cleanup__row">
          <BButton :loading="busy === 'query-local'" :disabled="Boolean(busy)" @click="query('local')">
            查询本地日志数量
          </BButton>
          <BButton
            type="danger"
            :loading="busy === 'clear-local'"
            :disabled="Boolean(busy)"
            @click="clear('local')"
          >
            一键清理本地/回环日志
          </BButton>
        </div>
      </section>
    </div>

    <ul v-if="stats" class="admin-stats log-cleanup__stats">
      <li class="admin-stat-card">
        <span class="admin-stat-label">操作日志</span>
        <strong class="admin-stat-value">{{ formatNumber(stats.operationLogs) }}</strong>
        <span class="admin-stat-hint">{{ statsLabel }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">api 日志</span>
        <strong class="admin-stat-value">{{ formatNumber(stats.apiLogs) }}</strong>
        <span class="admin-stat-hint">{{ statsLabel }}</span>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">转化漏斗</span>
        <strong class="admin-stat-value">{{ formatNumber(stats.conversionEvents) }}</strong>
        <span class="admin-stat-hint">{{ statsLabel }}</span>
      </li>
    </ul>
    <p v-else class="log-cleanup__empty">先查询以查看命中数量，确认后再执行清理。</p>

    <p class="log-cleanup__note">
      注：操作日志的 IP 记录自 2026-07-02 起生效，此前的历史操作日志无 IP、无法按 IP 追溯清理。
    </p>

    <AdminRiskActionModal
      v-model:visible="confirmVisible"
      title="确认清理日志"
      :impact="confirmImpact"
      confirm-phrase="确认清理日志"
      :loading="busy === 'clear-exact' || busy === 'clear-local'"
      @confirm="confirmClear"
    />
  </AdminDataPage>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';

  type Mode = 'exact' | 'local';
  type BusyState = '' | 'query-exact' | 'query-local' | 'clear-exact' | 'clear-local';
  interface LogStats {
    operationLogs: number;
    apiLogs: number;
    conversionEvents: number;
  }

  const pageSubtitle = '按 IP 精确清理，或一键清理本地/回环调试数据（操作日志 · api 日志 · 转化漏斗）';
  const ip = ref('');
  const stats = ref<LogStats | null>(null);
  const statsLabel = ref('');
  const confirmVisible = ref(false);
  const pendingMode = ref<Mode>('exact');
  // 破坏性操作必须有明确的进行中状态，并在此期间互斥：否则重复点击会发出多次删除请求。
  const busy = ref<BusyState>('');
  const confirmImpact = computed(() => {
    const target = pendingMode.value === 'local' ? '本地/回环调试数据' : `IP ${ip.value.trim()}`;
    return `将物理删除【${target}】在操作日志、API 日志、转化漏斗中的全部记录，无法恢复。`;
  });

  function formatNumber(value: number) {
    return Number(value || 0).toLocaleString('zh-CN');
  }

  function payload(mode: Mode) {
    return mode === 'local' ? { mode: 'local' } : { ip: ip.value.trim() };
  }

  async function query(mode: Mode) {
    if (mode === 'exact' && !ip.value.trim()) {
      message.error('请输入要查询的 IP');
      return;
    }
    busy.value = mode === 'local' ? 'query-local' : 'query-exact';
    try {
      const res = await apiBasePost('/api/common/getIpLogStats', payload(mode));
      if (res.status === 200) {
        stats.value = res.data;
        statsLabel.value = mode === 'local' ? '本地/回环命中' : `IP ${ip.value.trim()}`;
      }
    } finally {
      busy.value = '';
    }
  }

  function clear(mode: Mode) {
    if (mode === 'exact' && !ip.value.trim()) {
      message.error('请输入要清理的 IP');
      return;
    }
    pendingMode.value = mode;
    confirmVisible.value = true;
  }

  async function confirmClear(action: { reason: string; confirmed: true; confirmText: string }) {
    const mode = pendingMode.value;
    busy.value = mode === 'local' ? 'clear-local' : 'clear-exact';
    try {
      const res = await apiBasePost('/api/common/clearLogsByIp', { ...payload(mode), ...action });
      if (res.status === 200) {
        const d = res.data || {};
        confirmVisible.value = false;
        message.success(
          `清理完成：操作日志 ${d.operationLogs || 0} · API 日志 ${d.apiLogs || 0} · 转化漏斗 ${
            d.conversionEvents || 0
          } · 审计 ${String(d.auditId || '').slice(0, 8)}`,
        );
        busy.value = '';
        await query(mode);
      }
    } finally {
      busy.value = '';
    }
  }
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';

  .log-cleanup__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
  }

  .log-cleanup__card {
    padding: 18px;
    border-radius: 14px;
    background: var(--card-background);
    border: 1px solid var(--surface-border-color);
  }

  .log-cleanup__card-title {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 700;
    color: var(--text-color);
  }

  .log-cleanup__card-hint {
    margin: 0 0 14px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--desc-color);
  }

  .log-cleanup__row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .log-cleanup__input {
    flex: 1 1 200px;
    min-width: 160px;
  }

  .log-cleanup__stats {
    margin-top: 4px;
  }

  .log-cleanup__empty,
  .log-cleanup__note {
    font-size: 12px;
    color: var(--desc-color);
  }
</style>
