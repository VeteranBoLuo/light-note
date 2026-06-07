<template>
  <CommonContainer title="攻击日志" @backClick="router.push('/securityCenterMobile')">
    <div class="security-page-body">
      <div class="admin-filters security-filters">
        <div class="admin-filters-main security-filters-main">
          <b-input
            v-model:value="eventFilters.key"
            placeholder="搜索IP/接口/规则/用户"
            class="security-search-input"
            @input="handleEventSearch"
          />
          <b-button type="primary" @click="searchEvents">搜索</b-button>
        </div>
        <div class="flex-align-center-gap" v-if="eventFilters.userId" style="margin-top: 8px">
          <span class="filter-account-tag"> 当前账号：{{ eventFilters.userLabel || eventFilters.userId }} </span>
          <b-button size="small" type="primary" @click="clearEventAccountFilter">清除</b-button>
        </div>
      </div>

      <div class="admin-table-card">
        <div class="event-batch-bar" v-if="selectedEventIds.length">
          <span>已选择 {{ selectedEventIds.length }} 条</span>
          <div class="event-batch-actions">
            <b-button size="small" type="primary" @click="confirmBatchHandle('processed')">已处理</b-button>
            <b-button size="small" @click="confirmBatchHandle('false_positive')">误报</b-button>
            <b-button size="small" @click="confirmBatchHandle('unhandled')">未处理</b-button>
            <b-button size="small" @click="selectedEventIds = []">取消</b-button>
          </div>
        </div>
        <b-loading :loading="eventLoading">
          <BTable
            :data="events"
            :columns="mobileEventColumns"
            :rowKey="'eventId'"
            :row-clickable="true"
            :selectable="true"
            :selected-rows="selectedEventIds"
            @row-click="onRowClick"
            @selectionChange="selectedEventIds = $event"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'severity'">
                <span class="security-pill" :class="`is-${record.severity}`">{{ record.severity }}</span>
              </template>
              <template v-else-if="column.key === 'ruleIp'">
                <div class="rule-ip-cell">
                  <span class="ellipsis-cell">{{ record.matchedRule || record.attackType || '-' }}</span>
                  <span class="rule-ip-sub">{{ record.sourceIp }}</span>
                </div>
              </template>
            </template>
          </BTable>
        </b-loading>
      </div>

      <BModal v-model:visible="detailVisible" title="攻击事件详情" width="90%" :show-footer="false">
        <div v-if="selectedRecord" class="mobile-detail">
          <div class="mobile-detail-row">
            <span class="detail-label">等级</span>
            <span class="detail-value">
              <span class="security-pill" :class="`is-${selectedRecord.severity}`">{{ selectedRecord.severity }}</span>
            </span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">规则</span>
            <span class="detail-value">{{ selectedRecord.matchedRule || selectedRecord.attackType || '-' }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">类型</span>
            <span class="detail-value">{{ selectedRecord.attackType || '-' }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">来源IP</span>
            <span class="detail-value">{{ selectedRecord.sourceIp }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">威胁分</span>
            <span class="detail-value">{{ selectedRecord.threatScore }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">接口</span>
            <span class="detail-value">{{ selectedRecord.requestPath || '-' }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">账号</span>
            <span class="detail-value">{{ selectedRecord.alias || selectedRecord.email || selectedRecord.userId || '-' }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">拦截</span>
            <span class="detail-value">
              <span class="security-pill" :class="selectedRecord.blocked ? 'is-high' : 'is-low'">{{ selectedRecord.blocked ? '已拦截' : '已放行' }}</span>
            </span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">状态</span>
            <span class="detail-value">
              <span class="security-pill" :class="statusPillClass(selectedRecord.handledStatus)">{{ statusText(selectedRecord.handledStatus) }}</span>
            </span>
          </div>
          <div class="mobile-detail-actions">
            <b-button size="small" @click.stop="handleBanIp(selectedRecord.sourceIp)">封禁此IP 1小时</b-button>
            <b-button size="small" @click.stop="handleUnbanIp(selectedRecord.sourceIp)">解封此IP</b-button>
            <b-button v-if="selectedRecord.userId" size="small" @click.stop="handleBanAccount(selectedRecord.userId)">封禁关联账号</b-button>
            <b-button v-if="selectedRecord.userId" size="small" @click.stop="handleUnbanAccount(selectedRecord.userId)">解封关联账号</b-button>
          </div>
        </div>
      </BModal>
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';
import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import BLoading from '@/components/base/BasicComponents/BLoading.vue';
import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
import { statusText, statusPillClass } from './securityShared';

const route = useRoute();
const router = useRouter();

const mobileEventColumns = [
  { title: '等级', key: 'severity', width: '80px' },
  { title: '规则-IP', key: 'ruleIp', width: '1fr' },
];

const events = ref<any[]>([]);
const eventTotal = ref(0);
const eventLoading = ref(false);
const eventPage = reactive({ currentPage: 1, pageSize: 100 });
const eventFilters = reactive<any>({
  key: '',
  severity: undefined,
  actionTaken: undefined,
  handledStatus: undefined,
  userId: undefined,
  userLabel: '',
});
const eventSearchTimer = ref<any>(null);
const selectedEventIds = ref<string[]>([]);
const batchLoading = ref(false);

const detailVisible = ref(false);
const selectedRecord = ref<any>(null);

function onRowClick(record: any) {
  selectedRecord.value = record;
  detailVisible.value = true;
}

async function searchEvents() {
  eventLoading.value = true;
  const res = await apiQueryPost('/api/security/events', {
    currentPage: eventPage.currentPage,
    pageSize: eventPage.pageSize,
    filters: {
      key: eventFilters.key,
      severity: eventFilters.severity,
      actionTaken: eventFilters.actionTaken,
      handledStatus: eventFilters.handledStatus,
      userId: eventFilters.userId,
    },
  }).finally(() => {
    eventLoading.value = false;
  });
  if (res.status === 200) {
    events.value = res.data.items;
    eventTotal.value = res.data.total;
    selectedEventIds.value = selectedEventIds.value.filter((id) => events.value.some((event) => event.eventId === id));
  }
}

function handleEventSearch() {
  clearTimeout(eventSearchTimer.value);
  eventSearchTimer.value = setTimeout(() => {
    eventPage.currentPage = 1;
    searchEvents();
  }, 300);
}

function clearEventAccountFilter() {
  eventFilters.userId = undefined;
  eventFilters.userLabel = '';
  eventPage.currentPage = 1;
  router.replace({ query: {} });
  searchEvents();
}

function applyRouteFilters() {
  eventFilters.userId = route.query.userId ? String(route.query.userId) : undefined;
  eventFilters.userLabel = route.query.userLabel ? String(route.query.userLabel) : '';
  eventFilters.handledStatus = route.query.handledStatus ? String(route.query.handledStatus) : eventFilters.handledStatus;
  eventFilters.severity = route.query.severity ? String(route.query.severity) : eventFilters.severity;
}

const batchStatusText = {
  processed: '已处理',
  false_positive: '误报',
  unhandled: '未处理',
};

function confirmBatchHandle(handledStatus: 'processed' | 'false_positive' | 'unhandled') {
  if (!selectedEventIds.value.length || batchLoading.value) return;
  Alert.alert({
    title: '批量处理攻击日志',
    content:
      handledStatus === 'false_positive'
        ? `确认将选中的 ${selectedEventIds.value.length} 条攻击日志标记为误报？误报会回滚对应风险分。`
        : `确认将选中的 ${selectedEventIds.value.length} 条攻击日志标记为${batchStatusText[handledStatus]}？`,
    okText: '确认处理',
    cancelText: '取消',
    onOk: async () => {
      batchLoading.value = true;
      const res = await apiBasePost('/api/security/events/batchHandle', {
        eventIds: selectedEventIds.value,
        handledStatus,
        remark: `管理员批量标记为${batchStatusText[handledStatus]}`,
      }).finally(() => {
        batchLoading.value = false;
      });
      if (res.status === 200) {
        message.success(res.msg || '批量处理成功');
        selectedEventIds.value = [];
        searchEvents();
      }
    },
  });
}

function isWhitelistConflict(res: any) {
  return res?.status === 409 && res?.data?.whitelistConflict;
}

function confirmWhitelistForce(content: string, onOk: () => Promise<void>) {
  Alert.alert({
    title: '移出白名单并封禁',
    content,
    okText: '移出白名单并封禁',
    cancelText: '取消',
    onOk,
  });
}

async function handleBanIp(ip: string) {
  if (!ip) return;
  const submit = async (force = false) => {
    const res = await apiBasePost('/api/security/ipBan', {
      ip,
      minutes: 60,
      reason: '管理员在安全中心手动封禁',
      force,
    });
    if (res.status === 200) {
      message.success('已封禁IP');
      searchEvents();
      return;
    }
    if (isWhitelistConflict(res)) {
      confirmWhitelistForce(`确认将 ${ip} 移出白名单并封禁 1 小时？`, () => submit(true));
    }
  };
  Alert.alert({
    title: '封禁IP',
    content: `确认封禁 ${ip} 1小时？`,
    okText: '确认封禁',
    cancelText: '取消',
    onOk: () => submit(),
  });
}

async function handleUnbanIp(ip: string) {
  if (!ip) return;
  Alert.alert({
    title: '解封IP',
    content: `确认解封 ${ip}？`,
    okText: '确认解封',
    cancelText: '取消',
    onOk: async () => {
      const res = await apiBasePost('/api/security/ipUnban', { ip });
      if (res.status === 200) {
        message.success('已解封IP');
        searchEvents();
      }
    },
  });
}

async function handleBanAccount(userId: string) {
  if (!userId) return;
  const submit = async (force = false) => {
    const res = await apiBasePost('/api/security/accountBan', {
      userId,
      reason: '管理员在安全中心手动封禁',
      force,
    });
    if (res.status === 200) {
      message.success('已封禁账号');
      detailVisible.value = false;
      searchEvents();
      return;
    }
    if (isWhitelistConflict(res)) {
      confirmWhitelistForce(`确认将账号【${userId}】移出白名单并封禁？`, () => submit(true));
    }
  };
  Alert.alert({
    title: '封禁账号',
    content: `确认封禁账号【${userId}】吗？`,
    okText: '确认封禁',
    cancelText: '取消',
    onOk: () => submit(),
  });
}

async function handleUnbanAccount(userId: string) {
  if (!userId) return;
  Alert.alert({
    title: '解封账号',
    content: `确认解封账号【${userId}】吗？`,
    okText: '确认解封',
    cancelText: '取消',
    onOk: async () => {
      const res = await apiBasePost('/api/security/accountUnban', { userId });
      if (res.status === 200) {
        message.success('已解封账号');
        searchEvents();
      }
    },
  });
}

watch(
  () => [route.query.userId, route.query.userLabel, route.query.handledStatus, route.query.severity],
  () => {
    applyRouteFilters();
    eventPage.currentPage = 1;
    searchEvents();
  },
);

onMounted(() => {
  applyRouteFilters();
  searchEvents();
});
</script>

<style lang="less" scoped>
@import './securityCenter.less';

.security-page-body {
  position: fixed;
  top: 60px;
  left: 20px;
  right: 20px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.admin-filters {
  flex-shrink: 0;
}

.admin-table-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.loader-container) {
  flex: 1;
  min-height: 0;
}

:deep(.table-container) {
  flex: 1;
  min-height: 0;
}

.mobile-detail {
  padding: 4px 0;
}

.mobile-detail-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 10px 0;
  border-bottom: 1px solid var(--menu-item-h-bg-color);
  &:last-child { border-bottom: none; }
}

.detail-label {
  font-size: 12px;
  color: var(--desc-color);
  flex-shrink: 0;
  width: 80px;
}

.detail-value {
  font-size: 13px;
  color: var(--text-color);
  text-align: right;
  word-break: break-all;
}

.mobile-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 12px;
}

.rule-ip-cell {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.rule-ip-sub {
  font-size: 11px;
  color: var(--desc-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
