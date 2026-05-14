<template>
  <CommonContainer title="规则库" @backClick="router.push('/securityCenterMobile')">
    <div class="admin-table-card">
      <BTable :data="rules" :columns="mobileRuleColumns" :rowKey="'ruleCode'">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'severity'">
            <span class="security-pill" :class="`is-${record.severity}`">{{ record.severity }}</span>
          </template>
          <template v-else-if="column.key === 'enabled'">
            <span class="security-pill" :class="record.enabled ? 'is-low' : 'is-neutral'">{{
              record.enabled ? '启用' : '停用'
            }}</span>
          </template>
        </template>
      </BTable>
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import { apiBasePost } from '@/http/request.ts';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
import router from '@/router';

const rules = ref<any[]>([]);

const mobileRuleColumns = [
  { title: '规则', key: 'ruleName' },
  { title: '等级', key: 'severity' },
  { title: '状态', key: 'enabled' },
];

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
</style>
