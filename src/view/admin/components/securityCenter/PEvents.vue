<template>
  <CommonContainer title="攻击日志" @backClick="router.push('/securityCenterMobile')">
    <div>
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
              <template v-else-if="column.key === 'matchedRule'">
                <span class="ellipsis-cell">{{ record.matchedRule || record.attackType || '-' }}</span>
              </template>
              <template v-else-if="column.key === 'sourceIp'">
                <a-tooltip :title="record.sourceIp">
                  <span class="ellipsis-cell">{{ record.sourceIp }}</span>
                </a-tooltip>
              </template>
              <template v-else-if="column.key === 'blocked'">
                <span class="security-pill" :class="record.blocked ? 'is-high' : 'is-low'">{{
                  record.blocked ? '已拦截' : '已放行'
                }}</span>
              </template>
              <template v-else-if="column.key === 'handledStatus'">
                <span class="security-pill" :class="statusPillClass(record.handledStatus)">{{
                  statusText(record.handledStatus)
                }}</span>
              </template>
            </template>
          </BTable>
        </b-loading>
      </div>

      <a-drawer
        :open="eventDetailVisible"
        title="攻击事件详情"
        placement="right"
        :width="drawerWidth"
        @close="eventDetailVisible = false"
      >
        <div v-if="eventDetail.event" class="security-detail">
          <section>
            <h3>事件概览</h3>
            <div class="detail-grid">
              <span>规则</span><strong>{{ eventDetail.event.matchedRule || eventDetail.event.attackType }}</strong>
              <span>类型</span><strong>{{ eventDetail.event.attackType }}</strong>
              <span>等级</span><strong>{{ eventDetail.event.severity }}</strong>
              <span>分数</span><strong>{{ eventDetail.event.threatScore }}</strong>
              <span>IP</span><strong>{{ eventDetail.event.sourceIp }}</strong>
              <span>账号</span
              ><strong>{{ eventDetail.event.alias || eventDetail.event.email || eventDetail.event.userId }}</strong>
              <span>接口</span><strong>{{ eventDetail.event.requestPath }}</strong>
            </div>
          </section>

          <section>
            <h3>命中证据</h3>
            <a-timeline>
              <a-timeline-item
                v-for="item in eventDetail.evidence"
                :key="item.id"
                :color="severityColor(item.severity)"
              >
                <strong>{{ item.ruleName }}</strong>
                <p>{{ item.evidenceMessage }}</p>
              </a-timeline-item>
            </a-timeline>
          </section>

          <section>
            <h3>处置</h3>
            <div class="quick-actions">
              <b-button @click="handleBanIp(eventDetail.event.sourceIp)">封禁此IP 1小时</b-button>
              <b-button @click="handleUnbanIp(eventDetail.event.sourceIp)">解封此IP</b-button>
              <b-button v-if="eventDetail.event.userId" @click="handleBanAccount(eventDetail.event.userId)"
                >封禁关联账号</b-button
              >
              <b-button v-if="eventDetail.event.userId" @click="handleUnbanAccount(eventDetail.event.userId)"
                >解封关联账号</b-button
              >
            </div>
          </section>
        </div>
      </a-drawer>
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { apiBaseGet, apiBasePost, apiQueryPost } from '@/http/request.ts';
import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import BLoading from '@/components/base/BasicComponents/BLoading.vue';
import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
import { bookmarkStore } from '@/store';
import { statusText, statusPillClass, severityColor } from './securityShared';

const route = useRoute();
const router = useRouter();
const bookmark = bookmarkStore();

const drawerWidth = bookmark.isMobile ? '100%' : '720px';

const mobileEventColumns = [
  { title: '等级', key: 'severity' },
  { title: '规则', key: 'matchedRule' },
  { title: 'IP', key: 'sourceIp' },
  { title: '拦截', key: 'blocked' },
  { title: '状态', key: 'handledStatus' },
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

const eventDetailVisible = ref(false);
const eventDetail = reactive<any>({ event: null, evidence: [], ipRecent: [] });
const currentEventId = ref<string | null>(null);

function onRowClick(record: any) {
  currentEventId.value = record.eventId;
  eventDetailVisible.value = true;
  loadDetail(record.eventId);
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

async function loadDetail(eventId: string) {
  const res = await apiBaseGet(`/api/security/events/${eventId}`);
  if (res.status === 200) {
    Object.assign(eventDetail, res.data);
  }
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
      eventDetailVisible.value = false;
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
</style>

<style lang="less">
.ant-drawer-content,
.ant-drawer-header {
  background: var(--background-color) !important;
  color: var(--text-color) !important;
}

.ant-drawer-title,
.ant-drawer-close {
  color: var(--text-color) !important;
}

.ant-drawer-header {
  border-bottom-color: var(--card-border-color) !important;
}

.ant-drawer-body {
  background: var(--background-color) !important;
}
</style>
