<template>
  <section class="points-sources">
    <div class="points-sources__toolbar">
      <div>
        <h2>来源与去向</h2>
        <p>来源按获取策略版本聚合；新版消费以幂等收据为准，旧消费流水单独列示。</p>
      </div>
      <div class="points-sources__filters">
        <BSelect
          v-model:value="rangeMode"
          class="points-sources__range"
          :options="rangeOptions"
          @change="handleRangeChange"
        />
        <template v-if="rangeMode === 'custom'">
          <BInput v-model:value="customStartDate" type="date" aria-label="来源统计开始日期" />
          <BInput v-model:value="customEndDate" type="date" aria-label="来源统计结束日期" />
        </template>
        <BInput v-model:value="policyVersion" placeholder="获取策略版本" clearable />
        <BInput v-model:value="economyVersion" placeholder="消费经济版本" clearable />
        <BButton size="small" :loading="loading" @click="reload">应用筛选</BButton>
      </div>
    </div>

    <div class="points-sources__grid">
      <article class="points-sources__panel">
        <header
          ><h3>积分来源</h3><span>{{ data?.sources?.length || 0 }} 组</span></header
        >
        <BTable :data="sourceRows" :columns="sourceColumns" row-key="rowKey" :loading="loading" />
      </article>
      <article class="points-sources__panel">
        <header><h3>新版消费去向</h3><span>经济收据</span></header>
        <BTable :data="destinationRows" :columns="destinationColumns" row-key="rowKey" :loading="loading" />
      </article>
    </div>

    <article class="points-sources__panel">
      <header><h3>旧版消费流水</h3><span>兼容观察，不与新版收据重复合并</span></header>
      <BTable :data="legacyRows" :columns="legacyColumns" row-key="rowKey" :loading="loading" />
    </article>

    <article class="points-sources__panel">
      <header
        ><h3>商品表现</h3
        ><span>首次兑换用户有界样本（最多 {{ format(data?.productPerformanceMeta?.sampleLimit) }}）</span></header
      >
      <BTable :data="productRows" :columns="productColumns" row-key="rowKey" :loading="loading" />
      <p class="points-sources__footnote">
        AI 实耗率与空间真实增长需建立不可变使用归因后才展示；当前不使用余额倒推，避免给出错误结论。
      </p>
    </article>
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import growthApi from '@/api/growthApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { pointsReasonLabel } from './pointsLogSource';

  const props = withDefaults(defineProps<{ hideInternal?: boolean }>(), { hideInternal: true });
  const loading = ref(false);
  const data = ref<any>(null);
  const rangeMode = ref<number | 'custom'>(28);
  const customStartDate = ref('');
  const customEndDate = ref('');
  const policyVersion = ref('');
  const economyVersion = ref('');
  const rangeOptions = [
    { label: '近 7 天', value: 7 },
    { label: '近 28 天', value: 28 },
    { label: '近 90 天', value: 90 },
    { label: '自定义', value: 'custom' },
  ];
  const sourceColumns = [
    { title: '来源 / 策略', key: 'name', width: 'minmax(200px, 1fr)', ellipsis: false },
    { title: '产出', key: 'issuedLabel', width: '110px' },
    { title: '用户', key: 'usersLabel', width: '90px' },
    { title: '笔数', key: 'operationsLabel', width: '90px' },
  ];
  const destinationColumns = [
    { title: '操作 / 商品', key: 'name', width: 'minmax(180px, 1fr)', ellipsis: false },
    { title: '消耗', key: 'spentLabel', width: '100px' },
    { title: '用户', key: 'usersLabel', width: '80px' },
    { title: '附加输出', key: 'output', width: 'minmax(160px, 1fr)', ellipsis: false },
  ];
  const legacyColumns = [
    { title: '来源', key: 'name', width: 'minmax(200px, 1fr)', ellipsis: false },
    { title: '消耗', key: 'spentLabel', width: '100px' },
    { title: '用户', key: 'usersLabel', width: '90px' },
    { title: '笔数', key: 'operationsLabel', width: '90px' },
  ];
  const productColumns = [
    { title: '商品', key: 'name', width: 'minmax(170px, 1fr)', ellipsis: false },
    { title: '人数 / 次数', key: 'volumeLabel', width: '120px' },
    { title: '消耗', key: 'spentLabel', width: '100px' },
    { title: '首兑账号天数 P50', key: 'registrationLabel', width: '145px' },
    { title: '兑前余额 P50', key: 'preBalanceLabel', width: '125px' },
    { title: '30 天再消费', key: 'repurchaseLabel', width: '120px' },
    { title: '佩戴率', key: 'wearLabel', width: '90px' },
    { title: '使用归因', key: 'attributionLabel', width: '120px', ellipsis: false },
  ];
  const format = (value: unknown) => Number(value || 0).toLocaleString('zh-CN');
  const sourceRows = computed(() =>
    (data.value?.sources || []).map((row: any, index: number) => ({
      ...row,
      rowKey: `${row.reason}:${row.policyVersion}:${index}`,
      name: `${pointsReasonLabel(row.reason)} · ${row.policyVersion}`,
      issuedLabel: `+${format(row.issued)}`,
      usersLabel: format(row.users),
      operationsLabel: format(row.operations),
    })),
  );
  const destinationRows = computed(() =>
    (data.value?.destinations || []).map((row: any, index: number) => ({
      ...row,
      rowKey: `${row.economyVersion}:${row.operationType}:${row.itemId || '-'}:${index}`,
      name: `${row.operationType}${row.itemId ? ` · ${row.itemId}` : ''} · ${row.economyVersion}`,
      spentLabel: `-${format(row.spent)}`,
      usersLabel: format(row.users),
      output:
        [
          row.pointsReturned ? `返还 ${format(row.pointsReturned)} 分` : '',
          row.aiTokens ? `AI ${format(row.aiTokens)}` : '',
          row.storageMb ? `空间 ${format(row.storageMb)}MB` : '',
          row.makeupCards ? `补签卡 ${format(row.makeupCards)}` : '',
          row.draws ? `抽数 ${format(row.draws)}` : '',
        ]
          .filter(Boolean)
          .join(' · ') || '无附加资产',
    })),
  );
  const legacyRows = computed(() =>
    (data.value?.legacyDestinations || []).map((row: any, index: number) => ({
      ...row,
      rowKey: `${row.reason}:${row.ref || '-'}:${index}`,
      name: `${pointsReasonLabel(row.reason)}${row.ref ? ` · ${row.ref}` : ''}`,
      spentLabel: `-${format(row.spent)}`,
      usersLabel: format(row.users),
      operationsLabel: format(row.operations),
    })),
  );
  const productRows = computed(() =>
    (data.value?.productPerformance || []).map((row: any, index: number) => ({
      ...row,
      rowKey: `${row.economyVersion}:${row.itemId}:${index}`,
      name: row.name || row.itemId,
      volumeLabel: `${format(row.users)} 人 / ${format(row.operations)} 次`,
      spentLabel: format(row.spent),
      registrationLabel:
        row.firstPurchaseRegistrationDaysP50 == null
          ? '样本不足'
          : `${format(row.firstPurchaseRegistrationDaysP50)} 天`,
      preBalanceLabel: row.prePurchaseBalanceP50 == null ? '旧收据无快照' : format(row.prePurchaseBalanceP50),
      repurchaseLabel: row.repurchase30dRatio == null ? '观察期未满' : `${row.repurchase30dRatio}%`,
      wearLabel: row.frameWearRate == null ? '不适用' : `${row.frameWearRate}%`,
      attributionLabel: row.usageAttributionStatus === 'awaiting_immutable_usage_attribution' ? '待归因事实' : '不适用',
    })),
  );

  async function reload() {
    const payload: Record<string, unknown> = {
      policyVersion: policyVersion.value.trim() || undefined,
      economyVersion: economyVersion.value.trim() || undefined,
      hideInternal: props.hideInternal,
    };
    if (rangeMode.value === 'custom') {
      if (!customStartDate.value || !customEndDate.value) {
        message.info('请选择自定义开始和结束日期');
        return;
      }
      payload.startDate = customStartDate.value;
      payload.endDate = customEndDate.value;
    } else payload.presetDays = rangeMode.value;
    loading.value = true;
    try {
      const result = await growthApi.adminPointsGovernanceSources(payload);
      if (result.status === 200) data.value = result.data;
      else message.error(result.msg || '来源与去向加载失败');
    } finally {
      loading.value = false;
    }
  }

  function handleRangeChange() {
    if (rangeMode.value !== 'custom') void reload();
  }

  defineExpose({ reload });
  onMounted(reload);
</script>

<style scoped lang="less">
  @import '@/assets/css/admin-breakpoints.less';
  .points-sources {
    display: grid;
    gap: 16px;
  }
  .points-sources__toolbar,
  .points-sources__panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h2 {
    color: var(--text-color);
    font-size: 18px;
  }
  h3 {
    color: var(--text-color);
    font-size: 14px;
  }
  p,
  header span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-sources__footnote {
    color: var(--desc-color);
    font-size: 11px;
  }
  .points-sources__range {
    width: 132px;
    flex: 0 0 auto;
  }
  .points-sources__filters {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
  }
  .points-sources__filters :deep(.input-container) {
    width: 148px;
  }
  .points-sources__grid {
    display: grid;
    grid-template-columns: 1fr 1.15fr;
    gap: 16px;
  }
  .points-sources__panel {
    display: grid;
    min-width: 0;
    gap: 12px;
    padding: 15px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--workbench-subcard-bg);
    overflow: hidden;
  }
  @media (max-width: @admin-bp-mobile) {
    .points-sources__toolbar {
      align-items: flex-start;
      flex-direction: column;
    }
    .points-sources__filters {
      width: 100%;
      justify-content: flex-start;
    }
    .points-sources__range {
      width: 100%;
    }
    .points-sources__filters :deep(.input-container) {
      width: min(100%, 178px);
    }
    .points-sources__grid {
      grid-template-columns: 1fr;
    }
  }
</style>
