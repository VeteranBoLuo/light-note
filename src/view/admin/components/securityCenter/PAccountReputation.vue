<template>
  <CommonContainer title="账号画像" @backClick="router.push('/securityCenterMobile')">
    <div class="security-page-body">
      <div class="admin-filters security-filters">
        <div class="admin-filters-main security-filters-main">
          <b-input
            v-model:value="acctRepFilters.key"
            placeholder="搜索账号/邮箱"
            class="security-search-input"
            @input="handleAcctRepSearch"
          />
          <b-button type="primary" @click="searchAccountReputation">搜索</b-button>
        </div>
      </div>
      <div class="admin-table-card">
        <BTable
          :data="accountRepList"
          :columns="mobileAccountRepColumns"
          :rowKey="'userId'"
          :row-clickable="true"
          @row-click="onRowClick"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'account'">
              <div class="account-cell">
                <strong>{{ record.alias || record.email || record.userId }}</strong>
                <span>{{ record.email || record.userId }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'riskScore'">
              <span :style="{ color: scoreColor(record.riskScore || 0), fontWeight: 600 }">{{ record.riskScore || 0 }}</span>
            </template>
          </template>
        </BTable>
      </div>

      <BModal v-model:visible="detailVisible" title="账号详情" width="90%" :show-footer="false">
        <div v-if="selectedRecord" class="mobile-detail">
          <div class="mobile-detail-row">
            <span class="detail-label">账号</span>
            <span class="detail-value">{{ selectedRecord.alias || selectedRecord.email || selectedRecord.userId }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">用户ID</span>
            <span class="detail-value">{{ selectedRecord.userId }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">风险分</span>
            <span class="detail-value">{{ selectedRecord.riskScore || 0 }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">状态</span>
            <span class="detail-value">
              <span class="security-pill" :class="Number(selectedRecord.delFlag) === 1 ? 'is-high' : 'is-low'">{{ Number(selectedRecord.delFlag) === 1 ? '已封禁' : '正常' }}</span>
            </span>
          </div>
          <div class="mobile-detail-actions">
            <b-button v-if="Number(selectedRecord.delFlag) !== 1" size="small" @click.stop="handleBanAccount(selectedRecord)">封禁账号</b-button>
            <b-button v-else size="small" @click.stop="handleUnbanAccount(selectedRecord)">解封账号</b-button>
          </div>
        </div>
      </BModal>
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';
import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
import { scoreColor } from './securityShared';

const router = useRouter();

const mobileAccountRepColumns = [
  { title: '账号', key: 'account', width: '1fr' },
  { title: '风险分', key: 'riskScore', width: '80px' },
];

const accountRepList = ref<any[]>([]);
const acctRepTotal = ref(0);
const acctRepPage = reactive({ currentPage: 1, pageSize: 100 });
const acctRepFilters = reactive<any>({ key: '' });
const acctRepSearchTimer = ref<any>(null);

const detailVisible = ref(false);
const selectedRecord = ref<any>(null);

function onRowClick(record: any) {
  selectedRecord.value = record;
  detailVisible.value = true;
}

async function searchAccountReputation() {
  const res = await apiQueryPost('/api/security/accountReputation', {
    currentPage: acctRepPage.currentPage,
    pageSize: acctRepPage.pageSize,
    filters: { key: acctRepFilters.key },
  });
  if (res.status === 200) {
    accountRepList.value = res.data.items;
    acctRepTotal.value = res.data.total;
  }
}

function handleAcctRepSearch() {
  clearTimeout(acctRepSearchTimer.value);
  acctRepSearchTimer.value = setTimeout(() => {
    acctRepPage.currentPage = 1;
    searchAccountReputation();
  }, 300);
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

async function handleBanAccount(account: any) {
  const userId = typeof account === 'string' ? account : account?.userId;
  if (!userId) return;
  const submit = async (force = false) => {
    const res = await apiBasePost('/api/security/accountBan', {
      userId,
      reason: '管理员在安全中心手动封禁',
      force,
    });
    if (res.status === 200) {
      message.success('已封禁账号');
      searchAccountReputation();
      return;
    }
    if (isWhitelistConflict(res)) {
      confirmWhitelistForce(`确认将账号【${account.alias || userId}】移出白名单并封禁？`, () => submit(true));
    }
  };
  Alert.alert({
    title: '封禁账号',
    content: `确认封禁账号【${account.alias || userId}】吗？`,
    okText: '确认封禁',
    cancelText: '取消',
    onOk: () => submit(),
  });
}

async function handleUnbanAccount(account: any) {
  const userId = typeof account === 'string' ? account : account?.userId;
  if (!userId) return;
  Alert.alert({
    title: '解封账号',
    content: `确认解封账号【${account.alias || userId}】吗？`,
    okText: '确认解封',
    cancelText: '取消',
    onOk: async () => {
      const res = await apiBasePost('/api/security/accountUnban', { userId });
      if (res.status === 200) {
        message.success('已解封账号');
        searchAccountReputation();
      }
    },
  });
}

onMounted(() => {
  searchAccountReputation();
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
</style>
