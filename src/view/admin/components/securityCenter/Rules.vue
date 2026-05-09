<template>
  <div class="admin-table-card security-rules-card">
    <a-table
      :data-source="rules"
      :columns="ruleColumns"
      row-key="ruleCode"
      :pagination="false"
      :scroll="{ x: 860, y: tableScrollY }"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'severity'">
          <span class="security-pill" :class="`is-${record.severity}`">{{ record.severity }}</span>
        </template>
        <template v-else-if="column.dataIndex === 'enabled'">
          <span class="security-pill" :class="record.enabled ? 'is-low' : 'is-neutral'">{{
            record.enabled ? '启用' : '停用'
          }}</span>
        </template>
      </template>
    </a-table>
  </div>
</template>

<script lang="ts" setup>
  import { onMounted, ref } from 'vue';
  import { apiBasePost } from '@/http/request.ts';
  import { useTableScrollY } from '@/composables/useTableScrollY';
  import { ruleColumns } from './securityShared';

  const { tableScrollY } = useTableScrollY({ reservedHeight: 320 });

  const rules = ref<any[]>([]);

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
