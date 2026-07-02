<template>
  <div class="admin-panel-container">
    <section class="admin-panel">
      <header class="admin-header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / Log Cleanup</p>
          <h2 class="admin-title">日志清理</h2>
          <p class="admin-subtitle">按 IP 精确清理,或一键清理本地/回环调试数据(操作日志 · api 日志 · 转化漏斗)</p>
        </div>
      </header>

      <div class="log-cleanup__grid">
        <div class="log-cleanup__card">
          <h3 class="log-cleanup__card-title">按 IP 清理</h3>
          <p class="log-cleanup__card-hint">输入某个 IP,先查询命中数量,确认后物理删除该 IP 的全部日志(不可恢复)。</p>
          <div class="log-cleanup__row">
            <b-input
              v-model:value="ip"
              placeholder="如 14.155.225.67"
              class="log-cleanup__input"
              @enter="query('exact')"
            />
            <b-button @click="query('exact')">查询数量</b-button>
            <b-button type="danger" @click="clear('exact')">清空该 IP 日志</b-button>
          </div>
        </div>

        <div class="log-cleanup__card">
          <h3 class="log-cleanup__card-title">本地 / 回环调试数据</h3>
          <p class="log-cleanup__card-hint">匹配 ::1 / localhost / 127.* / ::ffff:127.* 等本地调试噪声,一键清理。</p>
          <div class="log-cleanup__row">
            <b-button @click="query('local')">查询本地日志数量</b-button>
            <b-button type="danger" @click="clear('local')">一键清理本地/回环日志</b-button>
          </div>
        </div>
      </div>

      <ul v-if="stats" class="admin-stats log-cleanup__stats">
        <li class="admin-stat-card">
          <span class="admin-stat-label">操作日志</span>
          <strong class="admin-stat-value">{{ stats.operationLogs }}</strong>
          <span class="admin-stat-hint">{{ statsLabel }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">api 日志</span>
          <strong class="admin-stat-value">{{ stats.apiLogs }}</strong>
          <span class="admin-stat-hint">{{ statsLabel }}</span>
        </li>
        <li class="admin-stat-card">
          <span class="admin-stat-label">转化漏斗</span>
          <strong class="admin-stat-value">{{ stats.conversionEvents }}</strong>
          <span class="admin-stat-hint">{{ statsLabel }}</span>
        </li>
      </ul>

      <p class="log-cleanup__note">
        注:操作日志的 IP 记录自 2026-07-02 起生效,此前的历史操作日志无 IP、无法按 IP 追溯清理。
      </p>
    </section>
  </div>
</template>

<script lang="ts" setup>
  import { ref } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';

  type Mode = 'exact' | 'local';
  interface LogStats {
    operationLogs: number;
    apiLogs: number;
    conversionEvents: number;
  }

  const ip = ref('');
  const stats = ref<LogStats | null>(null);
  const statsLabel = ref('');

  function payload(mode: Mode) {
    return mode === 'local' ? { mode: 'local' } : { ip: ip.value.trim() };
  }

  function query(mode: Mode) {
    if (mode === 'exact' && !ip.value.trim()) {
      message.error('请输入要查询的 IP');
      return;
    }
    apiBasePost('/api/common/getIpLogStats', payload(mode)).then((res) => {
      if (res.status === 200) {
        stats.value = res.data;
        statsLabel.value = mode === 'local' ? '本地/回环命中' : `IP ${ip.value.trim()}`;
      }
    });
  }

  function clear(mode: Mode) {
    if (mode === 'exact' && !ip.value.trim()) {
      message.error('请输入要清理的 IP');
      return;
    }
    const target = mode === 'local' ? '本地/回环调试' : `IP ${ip.value.trim()}`;
    Alert.alert({
      title: '确认清理',
      content: `将物理删除【${target}】在操作日志、api 日志、转化漏斗中的全部记录,不可恢复,确认继续?`,
      onOk() {
        apiBasePost('/api/common/clearLogsByIp', payload(mode)).then((res) => {
          if (res.status === 200) {
            const d = res.data || {};
            message.success(
              `清理完成:操作日志 ${d.operationLogs || 0} · api 日志 ${d.apiLogs || 0} · 转化漏斗 ${d.conversionEvents || 0}`,
            );
            query(mode);
          }
        });
      },
    });
  }
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';

  .log-cleanup__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 16px;
    margin-top: 8px;
  }

  .log-cleanup__card {
    padding: 18px;
    border-radius: 14px;
    background: var(--card-bg-color, var(--menu-body-bg-color));
    border: 1px solid var(--card-border-color);
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
    margin-top: 20px;
  }

  .log-cleanup__note {
    margin-top: 16px;
    font-size: 12px;
    color: var(--desc-color);
  }
</style>
