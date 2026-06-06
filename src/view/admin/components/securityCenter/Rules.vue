<template>
  <div class="admin-table-card security-rules-card" ref="tableCardRef">
    <BTable :data="rules" :columns="ruleColumns" :rowKey="'ruleCode'">
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
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import { useTableScrollY } from '@/composables/useTableScrollY';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import { ruleColumns } from './securityShared';
  const rules = ref<any[]>([]);

  const tableCardRef = ref<HTMLElement | null>(null);
  useTableScrollY({ ref: tableCardRef });
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
