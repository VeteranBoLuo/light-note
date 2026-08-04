<template>
  <AdminDataPage
    eyebrow="Admin / 积分"
    title="积分运营"
    subtitle="监控积分经济健康度（发放/消耗/存量、抽奖返还率），按需给指定账号手动发放或扣减积分/存储/补签卡。仅站长可见。"
    layout="scroll"
  >
    <template #actions>
      <BButton size="small" :loading="loading" @click="loadOverview">刷新</BButton>
    </template>

    <!-- 总览：复用共享指标卡，不再自造 pops-card 一套 -->
    <ul class="admin-stats">
      <li class="admin-stat-card">
        <span class="admin-stat-label">累计发放</span>
        <strong class="admin-stat-value up">+{{ (ov?.issued || 0).toLocaleString('en-US') }}</strong>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">累计消耗</span>
        <strong class="admin-stat-value down">-{{ (ov?.spent || 0).toLocaleString('en-US') }}</strong>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">当前存量</span>
        <strong class="admin-stat-value">{{ (ov?.outstanding || 0).toLocaleString('en-US') }}</strong>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">抽奖积分返还率</span>
        <strong class="admin-stat-value">{{ ov?.lottery?.payoutRatio ?? 0 }}%</strong>
        <span class="admin-stat-hint"
          >抽 {{ ov?.lottery?.draws || 0 }} 次 · 花 {{ ov?.lottery?.cost || 0 }} · 返
          {{ ov?.lottery?.winPoints || 0 }}</span
        >
      </li>
    </ul>

    <div class="pops-cols">
      <!-- 按来源分布 -->
      <div class="pops-block">
        <div class="pops-block-head"><span>按来源分布</span></div>
        <div class="pops-reasons">
          <div v-for="r in ov?.byReason || []" :key="r.reason" class="pops-reason">
            <span class="pops-reason-name">{{ reasonLabel(r.reason) }}</span>
            <span class="pops-reason-delta" :class="r.delta > 0 ? 'up' : r.delta < 0 ? 'down' : ''">{{
              r.delta > 0 ? '+' + r.delta : r.delta
            }}</span>
            <span class="pops-reason-cnt">{{ r.cnt }} 笔</span>
          </div>
          <div v-if="!ov?.byReason?.length" class="pops-empty">暂无数据</div>
        </div>
      </div>

      <!-- Top 持有人 -->
      <div class="pops-block">
        <div class="pops-block-head"
          ><span>积分持有 Top 10(共 {{ ov?.holders || 0 }} 人持有)</span></div
        >
        <div class="pops-top">
          <div v-for="(u, i) in ov?.top || []" :key="u.userId" class="pops-top-row">
            <span class="pops-top-rank">{{ i + 1 }}</span>
            <!-- 回填入口用真 button：键盘用户否则只能手抄 userId -->
            <button
              type="button"
              class="pops-top-user dom-hover"
              :title="'点击回填 · ' + u.userId"
              :aria-label="`回填用户 ${u.alias || u.email || u.userId}`"
              @click="pickUser(u.userId)"
            >
              <span class="pops-top-alias">{{ u.alias || '(未设昵称)' }}</span>
              <span class="pops-top-email">{{ u.email || u.userId }}</span>
            </button>
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
        <div class="pops-field"
          ><label>用户ID</label><b-input v-model:value="form.userId" placeholder="目标用户 user_id"
        /></div>
        <div class="pops-field-row">
          <div class="pops-field"
            ><label>积分(±)</label><b-input v-model:value="form.points" type="number" placeholder="如 100 或 -50"
          /></div>
          <div class="pops-field"
            ><label>存储MB(±)</label><b-input v-model:value="form.storageMb" type="number" placeholder="如 512"
          /></div>
          <div class="pops-field"
            ><label>补签卡(±)</label><b-input v-model:value="form.cards" type="number" placeholder="0~2"
          /></div>
        </div>
        <div class="pops-field"
          ><label>备注</label><b-input v-model:value="form.note" placeholder="发放原因(记入流水 ref)"
        /></div>
        <div class="pops-actions">
          <b-button size="small" :disabled="!form.userId || querying" @click="queryUser">查询</b-button>
          <b-button type="primary" size="small" :disabled="!form.userId || granting" @click="grant()"
            >发放 / 扣减</b-button
          >
        </div>
      </div>

      <div v-if="detail" class="pops-detail">
        <div v-if="detail.user" class="pops-detail-user">
          <b>{{ detail.user.alias || '(未设昵称)' }}</b>
          <span>{{ detail.user.email || '—' }}</span>
          <code>{{ form.userId.trim() }}</code>
        </div>
        <div class="pops-detail-bal">
          <span
            >余额 🪙 <b>{{ detail.balance?.points ?? 0 }}</b></span
          >
          <span
            >扩容 💾 <b>{{ detail.balance?.storageBonusMb ?? 0 }}MB</b></span
          >
          <span
            >补签卡 🎫 <b>{{ detail.balance?.cards ?? 0 }}</b></span
          >
          <span
            >抽奖 🎰 <b>{{ detail.balance?.lotteryCount ?? 0 }}</b> 次</span
          >
        </div>
        <div class="pops-detail-log">
          <div v-for="(l, i) in detail.log || []" :key="i" class="pops-log-row">
            <span class="pops-log-reason">{{ reasonLabel(l.reason) }}</span>
            <span class="pops-log-delta" :class="l.delta > 0 ? 'up' : l.delta < 0 ? 'down' : ''">{{
              l.delta > 0 ? '+' + l.delta : l.delta || '·'
            }}</span>
            <span class="pops-log-time">{{ fmtTime(l.createTime) }}</span>
          </div>
          <div v-if="!detail.log?.length" class="pops-empty">该账号暂无流水</div>
        </div>
      </div>
    </div>
  </AdminDataPage>
</template>

<script setup lang="ts">
  import { onMounted, ref } from 'vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
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

  async function grant(confirmedGrant = false) {
    if (!form.value.userId) return;
    const points = Number(form.value.points) || 0;
    const storageMb = Number(form.value.storageMb) || 0;
    const cards = Number(form.value.cards) || 0;
    if (!points && !storageMb && !cards) {
      message.info('请至少填写一项发放数量');
      return;
    }
    // 直接改动用户资产，必须先让操作者复核账号与数量（此前只有 disabled，没有确认）
    const parts = [
      points ? `积分 ${points > 0 ? '+' : ''}${points}` : '',
      storageMb ? `存储 ${storageMb > 0 ? '+' : ''}${storageMb}MB` : '',
      cards ? `补签卡 ${cards > 0 ? '+' : ''}${cards}` : '',
    ].filter(Boolean);
    // Alert 只有 onOk（无 onCancel），统一用回调续跑而不是 await Promise
    if (!confirmedGrant) {
      Alert.alert({
        title: points < 0 || storageMb < 0 || cards < 0 ? '确认扣减' : '确认发放',
        content: `目标账号 ${form.value.userId.trim()}\n${parts.join(' · ')}\n\n将立即写入并记入积分流水，确认继续？`,
        onOk: () => grant(true),
      });
      return;
    }
    granting.value = true;
    try {
      const res = await growthApi.adminGrantPoints({
        userId: form.value.userId.trim(),
        points,
        storageMb,
        cards,
        note: form.value.note,
      });
      if (res.status === 200 && res.data?.ok) {
        message.success(
          `已更新:积分 ${res.data.points} / 存储 ${res.data.storageBonusMb}MB / 补签卡 ${res.data.cards}`,
        );
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
  @import '@/assets/css/admin-breakpoints.less';
  @import '@/assets/css/admin-mixins.less';
  /* 骨架与指标卡已迁到 AdminDataPage + .admin-stat-*，原 .pops-header/.pops-card* 全部删除。
     这里只保留指标卡内的正负值语义色。 */
  .admin-stat-value.up {
    color: var(--success-color);
  }
  .admin-stat-value.down {
    color: var(--danger-color);
  }
  .pops-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  @media (max-width: @admin-bp-mobile) {
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
    color: var(--success-color);
  }
  .down {
    color: var(--danger-color);
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
  .pops-top-user {
    .admin-focus-ring(6px);
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    text-align: left;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    cursor: pointer;
  }
  .pops-top-alias {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pops-top-email {
    font-size: 11px;
    color: var(--desc-color);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
  .pops-detail-user {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 10px;
  }
  .pops-detail-user b {
    font-size: 14px;
  }
  .pops-detail-user span {
    font-size: 12px;
    color: var(--desc-color);
  }
  .pops-detail-user code {
    font-size: 11px;
    color: var(--desc-color);
    font-family: monospace;
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
