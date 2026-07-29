<template>
  <CommonContainer title="白名单" @backClick="router.push('/securityCenterMobile')">
    <div class="security-whitelist">
      <div class="admin-filters security-filters">
        <div class="admin-filters-main security-filters-main">
          <b-input
            v-model:value="filters.key"
            placeholder="搜索IP、用户、备注"
            class="security-search-input"
            @input="handleSearch"
          />
          <b-button type="primary" @click="openWhitelistModal">添加白名单</b-button>
        </div>
        <span class="admin-filters-hint">白名单对象仍会记录攻击日志和风险分，但不会触发自动封禁</span>
      </div>

      <div class="admin-table-card" ref="tableCardRef">
        <b-loading :loading="loading">
          <BTable
            :data="whitelist"
            :columns="mobileWhitelistColumns"
            :rowKey="'id'"
            :row-clickable="true"
            @row-click="onRowClick"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'targetLabel'">
                <div class="account-cell">
                  <strong>{{ getTargetName(record) }}</strong>
                  <span>{{ record.targetValue }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'targetType'">
                <span class="security-pill" :class="record.targetType === 'ip' ? 'is-medium' : 'is-low'">
                  {{ record.targetType === 'ip' ? 'IP' : '用户' }}
                </span>
              </template>
            </template>
          </BTable>
        </b-loading>
      </div>

      <BModal v-model:visible="detailVisible" title="白名单详情" width="90%" :show-footer="false">
        <div v-if="selectedRecord" class="mobile-detail">
          <div class="mobile-detail-row">
            <span class="detail-label">类型</span>
            <span class="detail-value">
              <span class="security-pill" :class="selectedRecord.targetType === 'ip' ? 'is-medium' : 'is-low'">{{ selectedRecord.targetType === 'ip' ? 'IP' : '用户' }}</span>
            </span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">对象</span>
            <span class="detail-value">{{ getTargetName(selectedRecord) }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">值</span>
            <span class="detail-value">{{ selectedRecord.targetValue }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">备注</span>
            <span class="detail-value">{{ selectedRecord.reason || '-' }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">状态</span>
            <span class="detail-value">
              <span class="security-pill" :class="selectedRecord.enabled ? 'is-low' : 'is-neutral'">{{ selectedRecord.enabled ? '启用' : '停用' }}</span>
            </span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">创建人</span>
            <span class="detail-value">{{ selectedRecord.createdByAlias || selectedRecord.createdBy || '-' }}</span>
          </div>
          <div v-if="selectedRecord.updatedAt" class="mobile-detail-row">
            <span class="detail-label">更新时间</span>
            <span class="detail-value">{{ selectedRecord.updatedAt }}</span>
          </div>
          <div class="mobile-detail-actions">
            <b-button size="small" @click.stop="removeWhitelist(selectedRecord)">移出</b-button>
          </div>
        </div>
      </BModal>

      <BModal
        v-model:visible="whitelistModalVisible"
        title="添加白名单"
        width="90%"
        :show-footer="false"
        :mask-closable="false"
        @close="resetWhitelistModal"
      >
        <div class="whitelist-modal">
          <div class="whitelist-tabs">
            <b-button :type="activeAddType === 'user' ? 'primary' : ''" @click="switchAddType('user')">用户</b-button>
            <b-button :type="activeAddType === 'ip' ? 'primary' : ''" @click="switchAddType('ip')">IP</b-button>
          </div>

          <div v-if="activeAddType === 'user'" class="whitelist-user-modal">
            <div class="whitelist-user-toolbar">
              <b-input v-model:value="userSearchKey" placeholder="搜索昵称或邮箱" @input="handleUserSearch" />
              <b-input v-model:value="userReason" placeholder="备注，例如：可信测试账号" />
            </div>
            <b-loading :loading="userLoading">
              <BTable
                class="whitelist-user-table"
                :data="userList"
                :columns="userColumns"
                :rowKey="'id'"
                :selectable="true"
                :selectedRows="selectedUserIds"
                @selectionChange="onUserSelectionChange"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'alias'">
                    <span class="ellipsis-cell" :title="record.alias || record.id">{{ record.alias || '-' }}</span>
                  </template>
                  <template v-else-if="column.key === 'email'">
                    <span class="ellipsis-cell" :title="record.email || record.id">{{ record.email || '-' }}</span>
                  </template>
                </template>
              </BTable>
            </b-loading>
          </div>

          <div v-else class="whitelist-ip-modal">
            <b-input v-model:value="ipForm.ip" placeholder="请输入IP地址" />
            <b-input v-model:value="ipForm.reason" placeholder="备注，例如：自用办公网络" />
          </div>
        </div>

        <template #footer>
          <div class="whitelist-modal-footer">
            <span>{{ activeAddType === 'user' ? `已选择 ${selectedUserIds.length} 个用户` : 'IP加入白名单后不会自动封禁' }}</span>
            <BSpace>
              <b-button @click="resetWhitelistModal">取消</b-button>
              <b-button type="primary" @click="submitWhitelist">{{ saving ? '保存中' : '加入白名单' }}</b-button>
            </BSpace>
          </div>
        </template>
      </BModal>
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
import { apiBasePost, apiQueryPost } from '@/http/request.ts';
import { useTableScrollY } from '@/composables/useTableScrollY';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BLoading from '@/components/base/BasicComponents/BLoading.vue';
import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
import BSpace from '@/components/base/BasicComponents/BSpace.vue';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';

const router = useRouter();

const mobileWhitelistColumns = [
  { title: '对象', key: 'targetLabel', width: '1fr' },
  { title: '类型', key: 'targetType', width: '60px' },
];

const filters = reactive({ key: '' });
const whitelist = ref<any[]>([]);
const loading = ref(false);
const searchTimer = ref<any>(null);

const detailVisible = ref(false);
const selectedRecord = ref<any>(null);

// Add whitelist modal
const whitelistModalVisible = ref(false);
const activeAddType = ref<'user' | 'ip'>('user');
const saving = ref(false);
const ipForm = reactive({ ip: '', reason: '' });
const userList = ref<any[]>([]);
const userLoading = ref(false);
const userSearchKey = ref('');
const userReason = ref('');
const selectedUserIds = ref<string[]>([]);
const selectedUserMap = ref<Record<string, any>>({});
const userSearchTimer = ref<any>(null);

const tableCardRef = ref<HTMLElement | null>(null);
useTableScrollY({ ref: tableCardRef });

const userColumns = [
  { title: '昵称', key: 'alias' },
  { title: '邮箱', key: 'email' },
];

function getTargetName(record: any) {
  if (record.targetType === 'ip') return record.label || record.targetValue;
  return record.label || record.userAlias || record.userEmail || record.targetValue;
}

function onRowClick(record: any) {
  selectedRecord.value = record;
  detailVisible.value = true;
}

async function queryWhitelist() {
  loading.value = true;
  try {
    const res = await apiQueryPost('/api/security/whitelist', {
      pageSize: 100,
      currentPage: 1,
      filters: {
        key: filters.key,
        enabled: 1,
      },
    });
    if (res.status === 200) {
      whitelist.value = res.data.items || [];
    }
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  clearTimeout(searchTimer.value);
  searchTimer.value = setTimeout(queryWhitelist, 300);
}

async function addIpWhitelist() {
  const ip = ipForm.ip.trim();
  if (!ip) {
    message.warning('请输入IP地址');
    return;
  }
  saving.value = true;
  try {
    const res = await apiBasePost('/api/security/whitelist/save', {
      targetType: 'ip',
      targetValue: ip,
      label: ip,
      reason: ipForm.reason,
    });
    if (res.status === 200) {
      message.success('已加入白名单');
      ipForm.ip = '';
      ipForm.reason = '';
      whitelistModalVisible.value = false;
      queryWhitelist();
    }
  } finally {
    saving.value = false;
  }
}

function openWhitelistModal() {
  whitelistModalVisible.value = true;
  activeAddType.value = 'user';
  queryUsers();
}

function switchAddType(type: 'user' | 'ip') {
  activeAddType.value = type;
  if (type === 'user' && userList.value.length === 0) {
    queryUsers();
  }
}

function resetWhitelistModal() {
  whitelistModalVisible.value = false;
  activeAddType.value = 'user';
  userSearchKey.value = '';
  userReason.value = '';
  selectedUserIds.value = [];
  selectedUserMap.value = {};
  ipForm.ip = '';
  ipForm.reason = '';
}

async function queryUsers() {
  userLoading.value = true;
  try {
    const res = await apiQueryPost('/api/user/getUserList', {
      pageSize: 50,
      currentPage: 1,
      filters: { key: userSearchKey.value },
    });
    if (res.status === 200) {
      userList.value = res.data.items || [];
      const nextMap = { ...selectedUserMap.value };
      userList.value.forEach((item) => {
        if (item?.id) nextMap[item.id] = item;
      });
      selectedUserMap.value = nextMap;
    }
  } finally {
    userLoading.value = false;
  }
}

function handleUserSearch() {
  clearTimeout(userSearchTimer.value);
  userSearchTimer.value = setTimeout(queryUsers, 300);
}

function onUserSelectionChange(keys: string[]) {
  selectedUserIds.value = keys;
  const nextMap = { ...selectedUserMap.value };
  userList.value.forEach((item) => {
    if (item?.id) nextMap[item.id] = item;
  });
  selectedUserMap.value = Object.fromEntries(keys.map((id) => [id, nextMap[id]]).filter(([, item]) => item));
}

async function addSelectedUsers() {
  if (!selectedUserIds.value.length) {
    message.warning('请选择用户');
    return;
  }
  const users = selectedUserIds.value.map((id) => selectedUserMap.value[id]).filter(Boolean);
  if (!users.length) {
    message.warning('请选择用户');
    return;
  }
  saving.value = true;
  try {
    const res = await apiBasePost('/api/security/whitelist/save', {
      items: users.map((item) => ({
        targetType: 'user',
        targetValue: item.id,
        label: item.alias || item.email || item.id,
        reason: userReason.value,
      })),
    });
    if (res.status === 200) {
      message.success('已加入白名单');
      resetWhitelistModal();
      queryWhitelist();
    }
  } finally {
    saving.value = false;
  }
}

function submitWhitelist() {
  if (saving.value) return;
  if (activeAddType.value === 'ip') {
    addIpWhitelist();
    return;
  }
  addSelectedUsers();
}

function removeWhitelist(record: any) {
  Alert.alert({
    title: '移出白名单',
    content: `确认将【${getTargetName(record)}】移出白名单？移出后后续风险行为可能触发自动封禁。`,
    okText: '确认移出',
    cancelText: '取消',
    onOk: async () => {
      const res = await apiBasePost('/api/security/whitelist/remove', { id: record.id });
      if (res.status === 200) {
        message.success('已移出白名单');
        queryWhitelist();
      }
    },
  });
}

onMounted(() => {
  queryWhitelist();
});
</script>

<style lang="less" scoped>
@import './securityCenter.less';

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

.security-whitelist {
  position: fixed;
  top: 60px;
  left: 20px;
  right: 20px;
  bottom: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.security-filters {
  flex-shrink: 0;
}

:deep(.table-container) {
  flex: 1;
  min-height: 0;
}

.whitelist-modal {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 12px;
}

.whitelist-tabs {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.whitelist-user-toolbar {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.whitelist-ip-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--security-border);
  border-radius: 8px;
  background: var(--security-sub-surface);
}

.whitelist-user-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.whitelist-user-table {
  height: 360px;
}

.whitelist-modal-footer {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  color: var(--desc-color);
  font-size: 13px;
}

@media (max-width: 960px) {
  .whitelist-modal-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
