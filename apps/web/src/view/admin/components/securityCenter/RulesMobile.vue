<template>
  <CommonContainer title="规则库" @backClick="router.push('/securityCenterMobile')">
    <div class="security-page-body">
      <div class="admin-table-card">
        <BTable
          :data="rules"
          :columns="mobileRuleColumns"
          :rowKey="'ruleCode'"
          :row-clickable="true"
          @row-click="onRowClick"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'severity'">
              <span class="security-pill" :class="`is-${record.severity}`">{{ record.severity }}</span>
            </template>
          </template>
        </BTable>
      </div>

      <BModal v-model:visible="detailVisible" title="规则详情" width="90%" :show-footer="false">
        <div v-if="selectedRecord" class="mobile-detail">
          <div class="mobile-detail-row">
            <span class="detail-label">规则名</span>
            <span class="detail-value">{{ selectedRecord.ruleName }}</span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">等级</span>
            <span class="detail-value">
              <span class="security-pill" :class="`is-${selectedRecord.severity}`">{{ selectedRecord.severity }}</span>
            </span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">状态</span>
            <span class="detail-value">
              <span class="security-pill" :class="selectedRecord.enabled ? 'is-low' : 'is-neutral'">{{ selectedRecord.enabled ? '启用' : '停用' }}</span>
            </span>
          </div>
          <div class="mobile-detail-row">
            <span class="detail-label">规则编码</span>
            <span class="detail-value">{{ selectedRecord.ruleCode }}</span>
          </div>
          <div class="mobile-detail-row" v-if="selectedRecord.description">
            <span class="detail-label">描述</span>
            <span class="detail-value">{{ selectedRecord.description }}</span>
          </div>
        </div>
      </BModal>
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { apiBasePost } from '@/http/request.ts';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
import router from '@/router';

const rules = ref<any[]>([]);

const mobileRuleColumns = [
  { title: '规则', key: 'ruleName', width: '1fr' },
  { title: '等级', key: 'severity', width: '80px' },
];

const detailVisible = ref(false);
const selectedRecord = ref<any>(null);

function onRowClick(record: any) {
  selectedRecord.value = record;
  detailVisible.value = true;
}

async function loadRules() {
  const res = await apiBasePost('/api/security/rules', {});
  if (res.status === 200) {
    rules.value = res.data.items;
  }
}

onMounted(() => {
  loadRules();
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

.admin-table-card {
  flex: 1;
  min-height: 0;
}

.admin-table-card :deep(.table-container) {
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
</style>
