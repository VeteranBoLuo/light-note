<template>
  <section class="points-simulator">
    <div class="points-simulator__intro">
      <div>
        <h2>只读策略模拟器</h2>
        <p>用假设参数估算周/月/年产出和商品达成周期；不会读取或修改生产策略。</p>
      </div>
      <span>simulation only</span>
    </div>

    <div class="points-simulator__inputs">
      <label v-for="field in fields" :key="field.key">
        <span>{{ field.label }}</span>
        <BInput v-model:value="form[field.key]" :type="field.type || 'number'" :placeholder="field.placeholder" />
        <small>{{ field.hint }}</small>
      </label>
    </div>
    <div class="points-simulator__actions">
      <BButton type="primary" :loading="loading" @click="simulate">运行模拟</BButton>
      <BButton :disabled="loading" @click="reset">恢复 C5 默认值</BButton>
      <BButton :disabled="!result || loading" @click="exportResult('json')">导出 JSON</BButton>
      <BButton :disabled="!result || loading" @click="exportResult('csv')">导出 CSV</BButton>
    </div>

    <template v-if="result">
      <div class="points-simulator__metrics">
        <article
          ><span>稳定周产出</span><strong>{{ format(result.stableWeek) }}</strong></article
        >
        <article
          ><span>年重复产出</span><strong>{{ format(result.repeatedAnnual) }}</strong></article
        >
        <article
          ><span>首年一次性产出</span><strong>{{ format(result.firstYearOneTime) }}</strong></article
        >
        <article
          ><span>预计年消耗</span><strong>{{ format(result.expectedConsumption) }}</strong></article
        >
        <article
          ><span>预计净发行</span><strong>{{ format(result.expectedNetIssuance) }}</strong></article
        >
      </div>
      <div class="points-simulator__grid">
        <article class="points-simulator__panel">
          <h3>等级档位节奏</h3>
          <BTable :data="tierRows" :columns="tierColumns" row-key="tier" />
        </article>
        <article class="points-simulator__panel">
          <h3>商品目标周期</h3>
          <BTable :data="goalRows" :columns="goalColumns" row-key="itemId" />
        </article>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref } from 'vue';
  import growthApi from '@/api/growthApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';

  type FormKey =
    | 'checkinDaily'
    | 'dailyQuestDaily'
    | 'weeklyChallenges'
    | 'freeDrawExpected'
    | 'achievementPool'
    | 'milestonePool'
    | 'activeRatio'
    | 'consumptionRatio'
    | 'activeUsers';
  const defaults: Record<FormKey, string> = {
    checkinDaily: '20',
    dailyQuestDaily: '40',
    weeklyChallenges: '250',
    freeDrawExpected: '15',
    achievementPool: '7850',
    milestonePool: '6350',
    activeRatio: '0.35',
    consumptionRatio: '0.65',
    activeUsers: '1000',
  };
  const form = reactive<Record<FormKey, string>>({ ...defaults });
  const loading = ref(false);
  const result = ref<any>(null);
  const fields: Array<{ key: FormKey; label: string; hint: string; placeholder?: string; type?: string }> = [
    { key: 'checkinDaily', label: '签到日均', hint: '默认按连续签到最高 20 估算' },
    { key: 'dailyQuestDaily', label: '每日任务总额', hint: 'C5 默认 15 + 25' },
    { key: 'weeklyChallenges', label: '每周挑战总额', hint: 'C5 默认 250' },
    { key: 'freeDrawExpected', label: '单次免费惊喜期望', hint: '仅模拟随机回流' },
    { key: 'achievementPool', label: '成就一次性池', hint: '单用户可获得总量假设' },
    { key: 'milestonePool', label: '里程碑一次性池', hint: '单用户可获得总量假设' },
    { key: 'activeRatio', label: '活跃率', hint: '0～1 之间的小数' },
    { key: 'consumptionRatio', label: '消耗率', hint: '0～1 之间的小数' },
    { key: 'activeUsers', label: '模拟用户数', hint: '仅参与总量估算' },
  ];
  const tierColumns = [
    { title: '档位', key: 'tierLabel', width: '90px' },
    { title: '免费次数/日', key: 'drawsLabel', width: '110px' },
    { title: '周期望', key: 'weekLabel', width: '110px' },
    { title: '月期望', key: 'monthLabel', width: '110px' },
    { title: '年期望', key: 'yearLabel', width: '120px' },
  ];
  const goalColumns = [
    { title: '商品', key: 'name', width: 'minmax(160px, 1fr)', ellipsis: false },
    { title: '积分', key: 'costLabel', width: '100px' },
    { title: '稳定周数', key: 'weeksLabel', width: '110px' },
  ];
  const format = (value: unknown) => Number(value || 0).toLocaleString('zh-CN');
  const tierRows = computed(() =>
    (result.value?.tiers || []).map((row: any) => ({
      ...row,
      tierLabel: `Lv.${row.tier}`,
      drawsLabel: format(row.freeDrawsPerDay),
      weekLabel: format(row.expectedWeek),
      monthLabel: format(row.expectedMonth),
      yearLabel: format(row.expectedYear),
    })),
  );
  const goalRows = computed(() =>
    (result.value?.goalCycles || []).map((row: any) => ({
      ...row,
      costLabel: format(row.cost),
      weeksLabel: row.stableWeeks == null ? '—' : `${row.stableWeeks} 周`,
    })),
  );

  async function simulate() {
    loading.value = true;
    try {
      const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Number(value)]));
      const response = await growthApi.adminPointsSimulator(payload);
      if (response.status === 200) result.value = response.data;
      else message.error(response.msg || '策略模拟失败');
    } finally {
      loading.value = false;
    }
  }
  function reset() {
    Object.assign(form, defaults);
    void simulate();
  }
  function download(content: string, type: string, suffix: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `points-c5-simulation-${new Date().toISOString().slice(0, 10)}.${suffix}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function exportResult(formatType: 'json' | 'csv') {
    if (!result.value) return;
    if (formatType === 'json') {
      download(JSON.stringify(result.value, null, 2), 'application/json;charset=utf-8', 'json');
      return;
    }
    const escapeCsv = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [
      ['type', 'name', 'value', 'extra'],
      ['summary', 'stableWeek', result.value.stableWeek, ''],
      ['summary', 'repeatedAnnual', result.value.repeatedAnnual, ''],
      ['summary', 'firstYearOneTime', result.value.firstYearOneTime, ''],
      ['summary', 'expectedConsumption', result.value.expectedConsumption, ''],
      ['summary', 'expectedNetIssuance', result.value.expectedNetIssuance, ''],
      ...(result.value.tiers || []).map((row: any) => [
        'tier',
        `Lv.${row.tier}`,
        row.expectedWeek,
        `month=${row.expectedMonth};year=${row.expectedYear};freeDrawsPerDay=${row.freeDrawsPerDay}`,
      ]),
      ...(result.value.goalCycles || []).map((row: any) => [
        'goal',
        row.name || row.itemId,
        row.cost,
        `stableWeeks=${row.stableWeeks ?? ''}`,
      ]),
    ];
    download(`\uFEFF${rows.map((row) => row.map(escapeCsv).join(',')).join('\n')}`, 'text/csv;charset=utf-8', 'csv');
  }
  defineExpose({ reload: simulate });
  onMounted(simulate);
</script>

<style scoped lang="less">
  @import '@/assets/css/admin-breakpoints.less';
  .points-simulator {
    display: grid;
    gap: 16px;
  }
  .points-simulator__intro {
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
  small {
    color: var(--desc-color);
    font-size: 12px;
  }
  .points-simulator__intro > span {
    padding: 5px 9px;
    border: 1px solid var(--success-color);
    border-radius: 999px;
    color: var(--success-color);
    font-size: 11px;
  }
  .points-simulator__inputs {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .points-simulator__inputs label {
    display: grid;
    gap: 5px;
  }
  .points-simulator__inputs label > span {
    color: var(--text-color);
    font-size: 12px;
    font-weight: 600;
  }
  .points-simulator__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .points-simulator__metrics {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 10px;
  }
  .points-simulator__metrics article,
  .points-simulator__panel {
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--workbench-subcard-bg);
  }
  .points-simulator__metrics article {
    display: grid;
    gap: 5px;
    padding: 13px;
  }
  .points-simulator__metrics span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .points-simulator__metrics strong {
    color: var(--text-color);
    font-size: 18px;
    font-variant-numeric: tabular-nums;
  }
  .points-simulator__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .points-simulator__panel {
    display: grid;
    min-width: 0;
    gap: 12px;
    padding: 15px;
    overflow: hidden;
  }
  @media (max-width: @admin-bp-mobile) {
    .points-simulator__intro {
      align-items: flex-start;
    }
    .points-simulator__inputs {
      grid-template-columns: 1fr 1fr;
    }
    .points-simulator__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .points-simulator__grid {
      grid-template-columns: 1fr;
    }
  }
</style>
