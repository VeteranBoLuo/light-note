<template>
  <div class="phone-list-container">
    <section class="phone-balance-card">
      <div>
        <span>{{ t('aiMonitor.balance.title') }}</span>
        <strong>{{ balanceDisplay }}</strong>
        <small v-if="balanceHint">{{ balanceHint }}</small>
      </div>
      <BButton size="small" :loading="balanceLoading" @click="fetchBalance(true)">
        {{ t('aiMonitor.balance.refresh') }}
      </BButton>
    </section>
    <div class="phone-search-bar">
      <b-input
        v-model:value="searchValue"
        placeholder="搜索用户/提问/工具"
        height="36px"
        @input="handleSearch"
      >
        <template #prefix>
          <svg-icon :src="icon.navigation.search" size="16" />
        </template>
      </b-input>
    </div>

    <div class="phone-list-body">
      <div v-if="logList.length === 0" class="phone-empty">暂无 AI 调用记录</div>
      <div v-for="item in logList" :key="item.id" class="phone-list-item" @click="selected = item; detailVisible = true">
        <div class="phone-item-main">
          <span class="phone-item-user">{{ item.userAlias || '未知' }}</span>
          <span class="phone-item-cost">¥{{ Number(item.cost || 0).toFixed(4) }}</span>
        </div>
        <div class="phone-item-question">{{ item.question || '-' }}</div>
        <div class="phone-item-meta">
          <span>{{ formatToolsUsed(item.toolsUsed) }}</span>
          <span>·</span>
          <span>{{ item.totalTokens || 0 }} tk</span>
          <span>·</span>
          <span>{{ item.status === 'success' ? '✓' : '✗' }}</span>
          <span>·</span>
          <span>{{ formatTime(item.createdAt) }}</span>
        </div>
      </div>
    </div>

    <div class="phone-pagination" v-if="total > pageSize">
      <b-button :disabled="currentPage <= 1" @click="currentPage--; fetchLogs()">上一页</b-button>
      <span>{{ currentPage }} / {{ Math.ceil(total / pageSize) }}</span>
      <b-button :disabled="currentPage >= Math.ceil(total / pageSize)" @click="currentPage++; fetchLogs()">下一页</b-button>
    </div>

    <BModal v-model:visible="detailVisible" title="调用详情" width="90%" :show-footer="false">
      <div v-if="selected" class="detail-grid">
        <div class="detail-row"><strong>用户：</strong>{{ selected.userAlias }}</div>
        <div class="detail-row"><strong>提问：</strong>{{ selected.question }}</div>
        <div class="detail-row"><strong>工具：</strong>{{ formatToolsUsed(selected.toolsUsed) }}</div>
        <div class="detail-row"><strong>供应商：</strong>{{ selected.provider || '-' }} / {{ selected.model || '-' }}</div>
        <div class="detail-row"><strong>Request ID：</strong>{{ selected.requestId || '-' }}</div>
        <div class="detail-row"><strong>API 次数：</strong>{{ selected.iterations }}</div>
        <div class="detail-row"><strong>Token：</strong>{{ selected.promptTokens }} + {{ selected.completionTokens }} = {{ selected.totalTokens }}</div>
        <div class="detail-row"><strong>费用：</strong>¥{{ Number(selected.cost || 0).toFixed(6) }}</div>
        <div class="detail-row"><strong>耗时：</strong>{{ selected.durationMs }} ms</div>
        <div class="detail-row"><strong>阶段耗时：</strong>Planner {{ selected.plannerMs ?? '-' }} / Tool {{ selected.toolMs ?? '-' }} / Final {{ selected.finalMs ?? '-' }} ms</div>
        <div class="detail-row"><strong>Usage：</strong>{{ selected.usageStatus || '-' }}</div>
        <div class="detail-row"><strong>状态：</strong>{{ selected.status }}</div>
        <div class="detail-row"><strong>时间：</strong>{{ formatTime(selected.createdAt) }}</div>
      </div>
    </BModal>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { apiBasePost } from '@/http/request.ts';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';

  const { t } = useI18n();

  const logList = ref<any[]>([]);
  const currentPage = ref(1);
  const pageSize = ref(20);
  const total = ref(0);
  const searchValue = ref('');
  const selected = ref<any>(null);
  const detailVisible = ref(false);
  const balance = ref<any>(null);
  const balanceLoading = ref(false);
  const balanceError = ref(false);
  let timer: number | null = null;

  const balanceDisplay = computed(() => {
    if (balanceLoading.value && !balance.value) return t('aiMonitor.balance.loading');
    if (!balance.value) return t('aiMonitor.balance.unavailable');
    const symbol = balance.value.currency === 'CNY' ? '¥' : `${balance.value.currency || ''} `;
    return `${symbol}${Number(balance.value.totalBalance || 0).toFixed(2)}`;
  });
  const balanceHint = computed(() => {
    if (balanceError.value && !balance.value) return t('aiMonitor.balance.failed');
    if (!balance.value) return '';
    if (!balance.value.isAvailable) return t('aiMonitor.balance.disabled');
    return balance.value.stale ? t('aiMonitor.balance.cached') : '';
  });

  function handleSearch() {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => { currentPage.value = 1; fetchLogs(); }, 500);
  }

  function fetchLogs() {
    apiBasePost('/api/common/getAgentLogs', {
      keyword: searchValue.value || undefined,
      pageSize: pageSize.value,
      currentPage: currentPage.value,
      hideInternal: true,
    }).then((res: any) => {
      if (res.status === 200) {
        logList.value = res.data.items || [];
        total.value = res.data.total || 0;
      }
    });
  }

  async function fetchBalance(forceRefresh = false) {
    if (balanceLoading.value) return;
    balanceLoading.value = true;
    balanceError.value = false;
    try {
      const res: any = await apiBasePost('/api/common/getDeepSeekBalance', { forceRefresh }, { silent: true });
      if (res.status === 200 && res.data) balance.value = res.data;
      else balanceError.value = true;
    } catch {
      balanceError.value = true;
    } finally {
      balanceLoading.value = false;
    }
  }

  function formatTime(t: string) {
    if (!t) return '';
    return new Date(t).toLocaleString('zh-CN');
  }

  function formatToolsUsed(value: unknown) {
    if (!value) return '无工具';
    try {
      const parsed = JSON.parse(String(value));
      if (!Array.isArray(parsed)) return String(value);
      return parsed.map((tool) => `${tool.name}${tool.status ? `(${tool.status})` : ''}`).join('、');
    } catch {
      return String(value);
    }
  }

  onMounted(() => { fetchLogs(); fetchBalance(); });
</script>

<style lang="less" scoped>
  .phone-list-container { display: flex; flex-direction: column; height: 100%; }
  .phone-balance-card { margin: 12px 16px 0; padding: 12px; border: 1px solid color-mix(in srgb, var(--primary-color) 24%, var(--card-border-color)); border-radius: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px; background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background)); color: var(--text-color); }
  .phone-balance-card > div { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
  .phone-balance-card span, .phone-balance-card small { color: var(--desc-color); }
  .phone-balance-card strong { font-size: 20px; }
  .phone-search-bar { padding: 12px 16px; flex-shrink: 0; }
  .phone-list-body { flex: 1; overflow-y: auto; padding: 0 16px 16px; }
  .phone-empty { text-align: center; opacity: 0.35; padding: 60px 0; font-size: 14px; }
  .phone-list-item { padding: 12px 0; border-bottom: 1px solid var(--card-border-color); cursor: pointer; }
  .phone-item-main { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
  .phone-item-user { font-weight: 600; color: var(--text-color); }
  .phone-item-cost { color: var(--primary-color); font-size: 13px; }
  .phone-item-question { font-size: 13px; color: var(--text-color); opacity: 0.8; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .phone-item-meta { display: flex; gap: 4px; font-size: 12px; color: var(--desc-color); }
  .phone-pagination { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 12px; border-top: 1px solid var(--card-border-color); }
  .detail-grid { display: flex; flex-direction: column; gap: 8px; color: var(--text-color); }
  .detail-row { font-size: 14px; line-height: 1.6; }
</style>
