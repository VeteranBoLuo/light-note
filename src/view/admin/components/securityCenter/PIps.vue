<template>
  <CommonContainer title="IP画像" @backClick="router.push('/securityCenterMobile')">
    <div>
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
              <a-progress
                :title="record.riskScore || 0"
                :percent="record.riskScore || 0"
                size="small"
                :stroke-color="scoreColor(record.riskScore || 0)"
                trail-color="var(--security-progress-trail)"
                :show-info="false"
              />
            </template>
            <template v-else-if="column.key === 'isBanned'">
              <span class="security-pill" :class="record.isBanned ? 'is-high' : 'is-low'">{{
                record.isBanned ? '封禁中' : '正常'
              }}</span>
            </template>
          </template>
        </BTable>
      </div>

      <a-drawer
        :open="ipAccountVisible"
        title="IP关联账号"
        placement="right"
        :width="drawerWidth"
        @close="ipAccountVisible = false"
      >
        <div class="security-detail">
          <section>
            <h3>{{ currentIp }} 使用过的账号</h3>
            <div class="ip-account-actions">
              <span>共 {{ ipAccounts.length }} 个账号</span>
              <div class="table-actions">
                <b-button v-if="currentIpBanned" @click="handleUnbanIp(currentIp)">解封此IP</b-button>
                <b-button v-else @click="handleBanIp(currentIp)">封禁此IP 1小时</b-button>
              </div>
            </div>
            <b-loading :loading="ipAccountLoading">
              <BTable
                :data="ipAccounts"
                :columns="mobileIpAccountColumns"
                :rowKey="'userId'"
                @row-click="onIpAccountRowClick"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'account'">
                    <div class="account-cell">
                      <strong>{{ record.alias || record.email || record.userId }}</strong>
                      <span>{{ record.email || record.userId }}</span>
                    </div>
                  </template>
                  <template v-else-if="column.key === 'delFlag'">
                    <span class="security-pill" :class="Number(record.delFlag) === 1 ? 'is-high' : 'is-low'">{{
                      Number(record.delFlag) === 1 ? '已封禁' : '正常'
                    }}</span>
                  </template>
                </template>
              </BTable>
            </b-loading>
          </section>
        </div>
      </a-drawer>
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { message, Modal } from 'ant-design-vue';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import BLoading from '@/components/base/BasicComponents/BLoading.vue';
import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
import { bookmarkStore } from '@/store';
import { scoreColor } from './securityShared';

const router = useRouter();
const bookmark = bookmarkStore();

const drawerWidth = bookmark.isMobile ? '100%' : '720px';

const mobileIpColumns = [
  { title: 'IP', key: 'ip' },
  { title: '来源地', key: 'city' },
  { title: '风险分', key: 'riskScore' },
  { title: '状态', key: 'isBanned' },
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

const ipAccountVisible = ref(false);
const currentIp = ref('');
const currentIpBanned = ref(false);
const ipAccounts = ref<any[]>([]);
const ipAccountLoading = ref(false);

function onRowClick(record: any) {
  currentIp.value = record.ip;
  currentIpBanned.value = record.isBanned || false;
  ipAccountVisible.value = true;
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

function onIpAccountRowClick(record: any) {
  const query = new URLSearchParams({
    userId: record.userId,
    userLabel: record.alias || record.email || record.userId,
  }).toString();
  router.push(`/securityEvents?${query}`);
  ipAccountVisible.value = false;
}

async function handleBanIp(ip: string) {
  if (!ip) return;
  Modal.confirm({
    title: '封禁IP',
    content: `确认封禁 ${ip} 1小时？`,
    okText: '确认封禁',
    cancelText: '取消',
    onOk: async () => {
      const res = await apiBasePost('/api/security/ipBan', { ip, minutes: 60, reason: '管理员在安全中心手动封禁' });
      if (res.status === 200) {
        message.success('已封禁IP');
        currentIpBanned.value = true;
        searchIps();
      }
    },
  });
}

async function handleUnbanIp(ip: string) {
  if (!ip) return;
  Modal.confirm({
    title: '解封IP',
    content: `确认解封 ${ip}？`,
    okText: '确认解封',
    cancelText: '取消',
    onOk: async () => {
      const res = await apiBasePost('/api/security/ipUnban', { ip });
      if (res.status === 200) {
        message.success('已解封IP');
        currentIpBanned.value = false;
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
