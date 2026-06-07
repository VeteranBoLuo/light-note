<template>
  <CommonContainer title="账号封禁" @backClick="router.push('/securityCenterMobile')">
    <div class="security-page-body">
      <div class="admin-filters security-filters">
        <div class="admin-filters-main security-filters-main">
          <b-input
            v-model:value="accountFilters.key"
            placeholder="搜索账号/邮箱"
            class="security-search-input"
            @input="handleAccountSearch"
          />
          <b-button type="primary" @click="searchAccountBans">搜索</b-button>
        </div>
      </div>
      <div class="admin-table-card">
        <BTable
          :data="accountBans"
          :columns="mobileAccountColumns"
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
          </template>
        </BTable>
      </div>

      <BModal v-model:visible="detailVisible" title="封禁详情" width="90%" :show-footer="false">
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
            <span class="detail-label">封禁原因</span>
            <span class="detail-value">{{ selectedRecord.banReason || '-' }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">封禁时间</span>
            <span class="detail-value">{{ selectedRecord.bannedAt || '-' }}</span>
          </div>
          <div class="mobile-detail-actions">
            <b-button size="small" @click.stop="handleUnbanAccount(selectedRecord)">解封账号</b-button>
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

const router = useRouter();

const mobileAccountColumns = [
  { title: '账号', key: 'account', width: '1fr' },
  { title: '封禁原因', key: 'banReason', width: '1fr' },
];

const accountBans = ref<any[]>([]);
const accountTotal = ref(0);
const accountPage = reactive({ currentPage: 1, pageSize: 100 });
const accountFilters = reactive<any>({ key: '' });
const accountSearchTimer = ref<any>(null);

const detailVisible = ref(false);
const selectedRecord = ref<any>(null);

function onRowClick(record: any) {
  selectedRecord.value = record;
  detailVisible.value = true;
}

async function searchAccountBans() {
  const res = await apiQueryPost('/api/security/accountBans', {
    currentPage: accountPage.currentPage,
    pageSize: accountPage.pageSize,
    filters: { key: accountFilters.key },
  });
  if (res.status === 200) {
    accountBans.value = res.data.items;
    accountTotal.value = res.data.total;
  }
}

function handleAccountSearch() {
  clearTimeout(accountSearchTimer.value);
  accountSearchTimer.value = setTimeout(() => {
    accountPage.currentPage = 1;
    searchAccountBans();
  }, 300);
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
        searchAccountBans();
      }
    },
  });
}

onMounted(() => {
  searchAccountBans();
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
