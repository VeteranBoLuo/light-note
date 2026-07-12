<template>
  <div class="pops">
    <header class="pops-header">
      <h2 class="pops-title">积分运营</h2>
      <p class="pops-subtitle">监控积分经济健康度(发放/消耗/存量、抽奖返还率),按需给指定账号手动发放或扣减积分/存储/补签卡。仅站长可见。</p>
    </header>

    <!-- 总览 -->
    <div class="pops-cards">
      <div class="pops-card">
        <span class="pops-card-label">累计发放</span>
        <b class="pops-card-num up">+{{ (ov?.issued || 0).toLocaleString('en-US') }}</b>
      </div>
      <div class="pops-card">
        <span class="pops-card-label">累计消耗</span>
        <b class="pops-card-num down">-{{ (ov?.spent || 0).toLocaleString('en-US') }}</b>
      </div>
      <div class="pops-card">
        <span class="pops-card-label">当前存量</span>
        <b class="pops-card-num">{{ (ov?.outstanding || 0).toLocaleString('en-US') }}</b>
      </div>
      <div class="pops-card">
        <span class="pops-card-label">抽奖积分返还率</span>
        <b class="pops-card-num">{{ ov?.lottery?.payoutRatio ?? 0 }}%</b>
        <span class="pops-card-sub">抽 {{ ov?.lottery?.draws || 0 }} 次 · 花 {{ ov?.lottery?.cost || 0 }} · 返 {{ ov?.lottery?.winPoints || 0 }}</span>
      </div>
    </div>

    <div class="pops-cols">
      <!-- 按来源分布 -->
      <div class="pops-block">
        <div class="pops-block-head">
          <span>按来源分布</span>
          <b-button size="small" :disabled="loading" @click="loadOverview">刷新</b-button>
        </div>
        <div class="pops-reasons">
          <div v-for="r in ov?.byReason || []" :key="r.reason" class="pops-reason">
            <span class="pops-reason-name">{{ reasonLabel(r.reason) }}</span>
            <span class="pops-reason-delta" :class="r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''">{{ r.delta > 0 ? '+' + r.delta : r.delta }}</span>
            <span class="pops-reason-cnt">{{ r.cnt }} 笔</span>
          </div>
          <div v-if="!ov?.byReason?.length" class="pops-empty">暂无数据</div>
        </div>
      </div>

      <!-- Top 持有人 -->
      <div class="pops-block">
        <div class="pops-block-head"><span>积分持有 Top 10(共 {{ ov?.holders || 0 }} 人持有)</span></div>
        <div class="pops-top">
          <div v-for="(u, i) in ov?.top || []" :key="u.userId" class="pops-top-row">
            <span class="pops-top-rank">{{ i + 1 }}</span>
            <code class="pops-top-uid dom-hover" @click="pickUser(u.userId)">{{ u.userId }}</code>
            <b class="pops-top-pts">🪙 {{ u.points.toLocaleString('en-US') }}</b>
          </div>
          <div v-if="!ov?.top?.length" class="pops-empty">暂无持有人</div>
        </div>
      </div>
    </div>

    <!-- 单账号查询 + 手动发放 -->
    <div class="pops-block">
      <div class="pops-block-head"><span>账号查询 / 手动发放</span></div>
      <div class="pops-grant">
        <div class="pops-field"><label>用户ID</label><b-input v-model:value="form.userId" placeholder="目标用户 user_id" /></div>
        <div class="pops-field-row">
          <div class="pops-field"><label>积分(±)</label><b-input v-model:value="form.points" type="number" placeholder="如 100 或 -50" /></div>
          <div class="pops-field"><label>存储MB(±)</label><b-input v-model:value="form.storageMb" type="number" placeholder="如 512" /></div>
          <div class="pops-field"><label>补签卡(±)</label><b-input v-model:value="form.cards" type="number" placeholder="0~2" /></div>
        </div>
        <div class="pops-field"><label>备注</label><b-input v-model:value="form.note" placeholder="发放原因(记入流水 ref)" /></div>
        <div class="pops-actions">
          <b-button size="small" :disabled="!form.userId || querying" @click="queryUser">查询</b-button>
          <b-button type="primary" size="small" :disabled="!form.userId || granting" @click="grant">发放 / 扣减</b-button>
        </div>
      </div>

      <div v-if="detail" class="pops-detail">
        <div class="pops-detail-bal">
          <span>余额 🪙 <b>{{ detail.balance?.points ?? 0 }}</b></span>
          <span>扩容 💾 <b>{{ detail.balance?.storageBonusMb ?? 0 }}MB</b></span>
          <span>补签卡 🎫 <b>{{ detail.balance?.cards ?? 0 }}</b></span>
          <span>抽奖 🎰 <b>{{ detail.balance?.lotteryCount ?? 0 }}</b> 次</span>
        </div>
        <div class="pops-detail-log">
          <div v-for="(l, i) in detail.log || []" :key="i" class="pops-log-row">
            <span class="pops-log-reason">{{ reasonLabel(l.reason) }}</span>
            <span class="pops-log-delta" :class="l.delta > 0 ? 'up' : l.delta < 0 ? 'down' : ''">{{ l.delta > 0 ? '+' + l.delta : l.delta || '·' }}</span>
            <span class="pops-log-time">{{ fmtTime(l.create_time) }}</span>
          </div>
          <div v-if="!detail.log?.length" class="pops-empty">该账号暂无流水</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import growthApi from '@/api/growthApi.ts';

  const REASON_LABELS: Record<string, string> = {
    checkin: '每日签到',
    quest: '每日任务',
    streak_milestone: '连签里程碑',
    achievement: '成就奖励',
    buy: '兑换商品',
    lottery_cost: '抽奖消耗',
    lottery_win: '抽奖·积分',
    lottery_storage: '抽奖·存储',
    lottery_free: '免费抽奖',
    weekly: '每周挑战',
    admin: '运营调整',
    storage: '存储扩容',
  };
  function reasonLabel(reason: string) {
    const base = reason?.startsWith('storage:') ? 'storage' : reason;
    return REASON_LABELS[base] || reason;
  }
  function fmtTime(v: string) {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v || '');
    const p = (n: number) => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  const ov = ref<any>(null);
  const loading = ref(false);
  const detail = ref<any>(null);
  const querying = ref(false);
  const granting = ref(false);
  const form = ref({ userId: '', points: '', storageMb: '', cards: '', note: '' });

  async function loadOverview() {
    loading.value = true;
    try {
      const res = await growthApi.adminPointsOverview();
      if (res.status === 200) ov.value = res.data;
    } finally {
      loading.value = false;
    }
  }

  function pickUser(uid: string) {
    form.value.userId = uid;
    queryUser();
  }

  async function queryUser() {
    if (!form.value.userId) return;
    querying.value = true;
    try {
      const res = await growthApi.adminUserPoints(form.value.userId.trim());
      if (res.status === 200) {
        detail.value = res.data;
        if (!res.data?.balance) message.info('该账号无成长数据');
      }
    } finally {
      querying.value = false;
    }
  }

  async function grant() {
    if (!form.value.userId) return;
    const points = Number(form.value.points) || 0;
    const storageMb = Number(form.value.storageMb) || 0;
    const cards = Number(form.value.cards) || 0;
    if (!points && !storageMb && !cards) {
      message.info('请至少填写一项发放数量');
      return;
    }
    granting.value = true;
    try {
      const res = await growthApi.adminGrantPoints({ userId: form.value.userId.trim(), points, storageMb, cards, note: form.value.note });
      if (res.status === 200 && res.data?.ok) {
        message.success(`已更新:积分 ${res.data.points} / 存储 ${res.data.storageBonusMb}MB / 补签卡 ${res.data.cards}`);
        form.value.points = '';
        form.value.storageMb = '';
        form.value.cards = '';
        await Promise.all([queryUser(), loadOverview()]);
      } else {
        message.error(res.data?.msg || '发放失败');
      }
    } finally {
      granting.value = false;
    }
  }

  onMounted(loadOverview);
</script>

<style scoped lang="less">
  .pops {
    display: flex;
    flex-direction: column;
    gap: 16px;
    color: var(--text-color);
    padding-bottom: 24px;
  }
  .pops-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pops-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
  }
  .pops-subtitle {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--desc-color);
  }
  .pops-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
  }
  .pops-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 62%, transparent);
    background: var(--workbench-subcard-bg);
  }
  .pops-card-label {
    font-size: 12px;
    color: var(--desc-color);
  }
  .pops-card-num {
    font-size: 20px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .pops-card-num.up {
    color: #16a34a;
  }
  .pops-card-num.down {
    color: #dc2626;
  }
  .pops-card-sub {
    font-size: 11px;
    color: var(--desc-color);
  }
  .pops-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: 720px) {
    .pops-cols {
      grid-template-columns: 1fr;
    }
  }
  .pops-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--card-border-color) 62%, transparent);
    background: var(--workbench-subcard-bg);
  }
  .pops-block-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 600;
    color: var(--desc-color);
  }
  .pops-reason,
  .pops-top-row,
  .pops-log-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px dashed color-mix(in srgb, var(--card-border-color) 30%, transparent);
    font-size: 12.5px;
  }
  .pops-reason-name {
    flex: 1 1 auto;
  }
  .pops-reason-delta,
  .pops-log-delta,
  .pops-top-pts {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }
  .up {
    color: #16a34a;
  }
  .down {
    color: #dc2626;
  }
  .pops-reason-cnt {
    color: var(--desc-color);
    font-size: 11px;
    width: 52px;
    text-align: right;
  }
  .pops-top-rank {
    width: 20px;
    color: var(--desc-color);
    font-weight: 700;
  }
  .pops-top-uid {
    flex: 1 1 auto;
    font-family: monospace;
    font-size: 11.5px;
    color: var(--primary-color);
    cursor: pointer;
    word-break: break-all;
  }
  .pops-empty {
    font-size: 12px;
    color: var(--desc-color);
    padding: 8px 0;
  }
  .pops-grant {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pops-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1 1 auto;
  }
  .pops-field label {
    font-size: 12px;
    color: var(--desc-color);
  }
  .pops-field-row {
    display: flex;
    gap: 10px;
  }
  .pops-actions {
    display: flex;
    gap: 10px;
    margin-top: 2px;
  }
  .pops-detail {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid color-mix(in srgb, var(--card-border-color) 40%, transparent);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .pops-detail-bal {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    font-size: 13px;
  }
  .pops-detail-log {
    display: flex;
    flex-direction: column;
    max-height: 240px;
    overflow-y: auto;
  }
  .pops-log-reason {
    flex: 1 1 auto;
  }
  .pops-log-time {
    color: var(--desc-color);
    font-size: 11px;
    width: 92px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
