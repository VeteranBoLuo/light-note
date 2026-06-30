<template>
  <CommonContainer title="IP画像" @backClick="router.push('/securityCenterMobile')">
    <div class="security-page-body">
      <div class="admin-filters security-filters">
        <div class="admin-filters-main security-filters-main">
          <b-input
            v-model:value="ipFilters.key"
            placeholder="搜索IP"
            class="security-search-input"
            @input="handleIpSearch"
          />
          <b-button type="primary" @click="searchIps">搜索</b-button>
        </div>
      </div>
      <div class="admin-table-card">
        <BTable
          :data="ipList"
          :columns="mobileIpColumns"
          :rowKey="'ip'"
          :row-clickable="true"
          @row-click="onRowClick"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'riskScore'">
              <span :style="{ color: scoreColor(record.riskScore || 0), fontWeight: 600 }">{{ record.riskScore || 0 }}</span>
            </template>
          </template>
        </BTable>
      </div>

      <BModal v-model:visible="detailVisible" title="IP详情" width="90%" :show-footer="false">
        <div v-if="selectedRecord" class="mobile-detail">
          <div class="mobile-detail-row">
            <span class="detail-label">IP</span>
            <span class="detail-value">{{ selectedRecord.ip }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">来源地</span>
            <span class="detail-value">{{ selectedRecord.city || '-' }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">风险分</span>
            <span class="detail-value">{{ selectedRecord.riskScore || 0 }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">状态</span>
            <span class="detail-value">
              <span class="security-pill" :class="selectedRecord.isBanned ? 'is-high' : 'is-low'">{{ selectedRecord.isBanned ? '封禁中' : '正常' }}</span>
            </span>
          </div>
          <div class="mobile-detail-actions">
            <b-button v-if="selectedRecord.isBanned" size="small" @click.stop="handleUnbanIp(selectedRecord.ip)">解封此IP</b-button>
            <b-button v-else size="small" @click.stop="handleBanIp(selectedRecord.ip)">封禁此IP 1小时</b-button>
          </div>
          <div class="ip-accounts-section">
            <h3>关联账号</h3>
            <b-loading :loading="ipAccountLoading">
              <BTable
                :data="ipAccounts"
                :columns="mobileIpAccountColumns"
                :rowKey="'userId'"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'account'">
                    <div class="account-cell">
                      <strong>{{ record.alias || record.email || record.userId }}</strong>
                      <span>{{ record.email || record.userId }}</span>
                    </div>
                  </template>
                  <template v-else-if="column.key === 'delFlag'">
                    <span class="security-pill" :class="Number(record.delFlag) === 1 ? 'is-high' : 'is-low'">{{ Number(record.delFlag) === 1 ? '已封禁' : '正常' }}</span>
                  </template>
                </template>
              </BTable>
            </b-loading>
          </div>
        </div>
      </BModal>
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';
import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import BLoading from '@/components/base/BasicComponents/BLoading.vue';
import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
import { scoreColor } from './securityShared';

const router = useRouter();

const mobileIpColumns = [
  { title: 'IP', key: 'ip', width: '1fr' },
  { title: '风险分', key: 'riskScore', width: '80px' },
];

const mobileIpAccountColumns = [
  { title: '账号', key: 'account' },
  { title: '状态', key: 'delFlag' },
];

const ipList = ref<any[]>([]);
const ipTotal = ref(0);
const ipPage = reactive({ currentPage: 1, pageSize: 100 });
const ipFilters = reactive<any>({ key: '' });
const ipSearchTimer = ref<any>(null);

const detailVisible = ref(false);
const selectedRecord = ref<any>(null);
const ipAccounts = ref<any[]>([]);
const ipAccountLoading = ref(false);

function onRowClick(record: any) {
  selectedRecord.value = record;
  detailVisible.value = true;
  loadIpAccounts(record.ip);
}

async function searchIps() {
  const res = await apiQueryPost('/api/security/ipReputation', {
    currentPage: ipPage.currentPage,
    pageSize: ipPage.pageSize,
    filters: { key: ipFilters.key },
  });
  if (res.status === 200) {
    ipList.value = res.data.items;
    ipTotal.value = res.data.total;
  }
}

function handleIpSearch() {
  clearTimeout(ipSearchTimer.value);
  ipSearchTimer.value = setTimeout(() => {
    ipPage.currentPage = 1;
    searchIps();
  }, 300);
}

async function loadIpAccounts(ip: string) {
  ipAccountLoading.value = true;
  const res = await apiBasePost('/api/security/ipAccounts', { ip }).finally(() => {
    ipAccountLoading.value = false;
  });
  if (res.status === 200) {
    ipAccounts.value = res.data.items;
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
      if (selectedRecord.value) selectedRecord.value.isBanned = true;
      searchIps();
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
        if (selectedRecord.value) selectedRecord.value.isBanned = false;
        searchIps();
      }
    },
  });
}

onMounted(() => {
  searchIps();
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

.ip-accounts-section {
  margin-top: 16px;
  h3 {
    margin: 0 0 10px;
    font-size: 15px;
    color: var(--text-color);
  }
}
</style>
