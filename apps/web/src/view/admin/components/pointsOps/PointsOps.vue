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
        <span class="admin-stat-label">每日惊喜积分发行</span>
        <strong class="admin-stat-value up">+{{ (ov?.lottery?.freeWinPoints || 0).toLocaleString('en-US') }}</strong>
        <span class="admin-stat-hint">与积分抽奖返还分开统计</span>
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

      <div class="pops-block">
        <div class="pops-block-head"><span>按经济版本 / 操作统计</span></div>
        <div class="pops-reasons">
          <div v-for="r in ov?.byEconomyVersion || []" :key="`${r.economyVersion}:${r.operationType}`" class="pops-reason">
            <span class="pops-reason-name">{{ r.economyVersion }} · {{ r.operationType }}</span>
            <span class="pops-reason-cnt">{{ r.operations }} 笔<span v-if="r.replays"> · 回放 {{ r.replays }}</span></span>
          </div>
          <div v-if="!ov?.byEconomyVersion?.length" class="pops-empty">暂无新版消费收据</div>
        </div>
      </div>

      <div class="pops-block">
        <div class="pops-block-head"><span>新版商品 / 奖池资产输出</span></div>
        <div class="pops-reasons">
          <div
            v-for="r in ov?.operationMetrics || []"
            :key="`${r.economyVersion}:${r.operationType}:${r.itemId || '-'}`"
            class="pops-reason"
          >
            <span class="pops-reason-name">
              {{ operationMetricName(r) }}
              <small>{{ operationMetricDetail(r) }}</small>
            </span>
            <span class="pops-reason-cnt">{{ r.operations }} 笔</span>
          </div>
          <div v-if="!ov?.operationMetrics?.length" class="pops-empty">暂无新版资产输出</div>
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
            <BButton
              class="pops-top-user dom-hover"
              :title="'点击回填 · ' + u.userId"
              :aria-label="`回填用户 ${u.alias || u.email || u.userId}`"
              @click="selectUser(u)"
            >
              <span class="pops-top-alias">{{ u.alias || '(未设昵称)' }}</span>
              <span class="pops-top-email">{{ u.email || u.userId }}</span>
            </BButton>
            <b class="pops-top-pts">
              <SvgIcon :src="icon.growth.coin" size="15" aria-hidden="true" />
              {{ u.points.toLocaleString('en-US') }}
            </b>
          </div>
          <div v-if="!ov?.top?.length" class="pops-empty">暂无持有人</div>
        </div>
      </div>
    </div>

    <!-- 单账号查询 + 手动发放 -->
    <div class="pops-block">
      <div class="pops-block-head"><span>选择用户 / 手动调整</span></div>
      <AdminUserPicker @select="selectUser" />

      <div v-if="selectedUser" class="pops-selected-user">
        <div>
          <strong>{{ selectedUser.alias || '(未设昵称)' }}</strong>
          <span>{{ selectedUser.email || '未绑定邮箱' }}</span>
          <code>{{ selectedUser.userId }}</code>
        </div>
        <BButton size="small" :loading="querying" @click="queryUser">刷新资产</BButton>
      </div>
      <p v-else class="pops-select-hint">先按昵称、邮箱或 ID 搜索并选择用户，Top 10 仅作为排行榜快捷入口。</p>

      <div v-if="selectedUser" class="pops-grant">
        <div class="pops-field-row">
          <div class="pops-field"
            ><label>积分(±)</label><BInput v-model:value="form.points" type="number" placeholder="如 100 或 -50"
          /></div>
          <div class="pops-field"
            ><label>存储MB(±)</label><BInput v-model:value="form.storageMb" type="number" placeholder="如 512"
          /></div>
          <div class="pops-field"
            ><label>补签卡(±)</label><BInput v-model:value="form.cards" type="number" placeholder="0~2"
          /></div>
        </div>
        <div class="pops-field"
          ><label>流水备注（可选）</label><BInput v-model:value="form.note" placeholder="如活动编号；操作原因将在确认时填写"
        /></div>
        <div class="pops-actions">
          <BButton type="primary" size="small" :disabled="!selectedUser || querying || granting" @click="openGrant">
            发放 / 扣减
          </BButton>
        </div>
      </div>

      <div v-if="detail" class="pops-detail">
        <div v-if="detail.user" class="pops-detail-user">
          <b>{{ detail.user.alias || '(未设昵称)' }}</b>
          <span>{{ detail.user.email || '—' }}</span>
          <code>{{ selectedUser?.userId }}</code>
        </div>
        <div class="pops-detail-bal">
          <span><SvgIcon :src="icon.growth.coin" size="15" aria-hidden="true" />余额 <b>{{ detail.balance?.points ?? 0 }}</b></span>
          <span><SvgIcon :src="icon.growth.storage" size="15" aria-hidden="true" />扩容 <b>{{ detail.balance?.storageBonusMb ?? 0 }}MB</b></span>
          <span><SvgIcon :src="icon.growth.reward" size="15" aria-hidden="true" />补签卡 <b>{{ detail.balance?.cards ?? 0 }}</b></span>
          <span><SvgIcon :src="icon.noteDetail.history" size="15" aria-hidden="true" />抽奖 <b>{{ detail.balance?.lotteryCount ?? 0 }}</b> 次</span>
        </div>
        <div class="pops-detail-log">
          <BTable v-if="detail.log?.length" :data="logRows" :columns="logColumns" row-key="rowKey">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'source'">
                <span class="pops-log-source">
                  <strong>{{ record.source.title }}</strong>
                  <small v-if="record.source.detail">{{ record.source.detail }}</small>
                  <code v-if="record.source.raw">{{ record.source.raw }}</code>
                </span>
              </template>
              <span
                v-else-if="column.key === 'deltaLabel'"
                class="pops-log-delta"
                :class="record.delta > 0 ? 'up' : record.delta < 0 ? 'down' : ''"
                >{{ record.deltaLabel }}</span
              >
              <template v-else>{{ record[column.key] }}</template>
            </template>
          </BTable>
          <div v-else class="pops-empty">该账号暂无流水</div>
        </div>
      </div>
    </div>

    <AdminRiskActionModal
      v-model:visible="grantVisible"
      :title="grantTitle"
      :impact="grantImpact"
      confirm-phrase="确认调整资产"
      :loading="granting"
      @confirm="confirmGrant"
    />
  </AdminDataPage>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import AdminRiskActionModal from '@/components/admin/AdminRiskActionModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import growthApi from '@/api/growthApi.ts';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import AdminUserPicker, { type AdminUserSearchResult } from './AdminUserPicker.vue';
  import { describePointsLogSource, pointsReasonLabel } from './pointsLogSource';

  const { t, te } = useI18n();
  function reasonLabel(reason: string) {
    return pointsReasonLabel(reason);
  }
  function operationMetricName(metric: any) {
    if (metric.itemId) {
      return translateIfPresent(`growth.shopItems.${metric.itemId}.name`) || metric.itemId;
    }
    return metric.operationType === 'lottery_free'
      ? '每日惊喜'
      : metric.operationType === 'lottery_paid'
        ? '积分抽奖'
        : metric.operationType;
  }
  function translateIfPresent(key: string) {
    return te(key) ? t(key) : '';
  }
  function operationMetricDetail(metric: any) {
    const parts = [
      metric.costPoints ? `消耗 ${Number(metric.costPoints).toLocaleString('en-US')} 分` : '',
      metric.pointsRewarded ? `返还 ${Number(metric.pointsRewarded).toLocaleString('en-US')} 分` : '',
      metric.aiTokensGranted ? `AI ${Number(metric.aiTokensGranted).toLocaleString('en-US')}` : '',
      metric.storageMbGranted ? `空间 ${Number(metric.storageMbGranted).toLocaleString('en-US')}MB` : '',
      metric.makeupCardsGranted ? `补签卡 ${metric.makeupCardsGranted}` : '',
      metric.drawCount ? `抽数 ${metric.drawCount}` : '',
      metric.pityHits ? `保底 ${metric.pityHits}` : '',
    ].filter(Boolean);
    return parts.join(' · ') || '无积分或资产输出';
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
  const grantVisible = ref(false);
  const selectedUser = ref<AdminUserSearchResult | null>(null);
  const form = ref({ userId: '', points: '', storageMb: '', cards: '', note: '' });
  const logColumns = [
    { title: '时间', key: 'timeLabel', width: '130px', ellipsis: false },
    { title: '真实来源', key: 'source', width: 'minmax(220px, 1fr)', ellipsis: false },
    { title: '变动', key: 'deltaLabel', width: '90px', ellipsis: false },
  ];
  const logRows = computed(() =>
    (detail.value?.log || []).map((item: any, index: number) => ({
      ...item,
      rowKey: `${item.createTime || ''}:${index}`,
      timeLabel: fmtTime(item.createTime),
      deltaLabel: item.delta > 0 ? `+${item.delta}` : item.delta || '·',
      source: describePointsLogSource(
        item,
        (key) => t(key),
        (key) => te(key),
      ),
    })),
  );

  async function loadOverview() {
    loading.value = true;
    try {
      const res = await growthApi.adminPointsOverview();
      if (res.status === 200) ov.value = res.data;
    } finally {
      loading.value = false;
    }
  }

  function selectUser(user: AdminUserSearchResult) {
    selectedUser.value = user;
    form.value.userId = user.userId;
    detail.value = null;
    void queryUser();
  }

  async function queryUser() {
    if (!selectedUser.value?.userId) return;
    querying.value = true;
    try {
      const res = await growthApi.adminUserPoints(selectedUser.value.userId);
      if (res.status === 200) {
        detail.value = res.data;
        if (res.data?.user) selectedUser.value = { ...selectedUser.value, ...res.data.user };
        if (!res.data?.balance) message.info('该账号无成长数据');
      }
    } finally {
      querying.value = false;
    }
  }

  const adjustment = computed(() => ({
    points: parseAdjustment(form.value.points),
    storageMb: parseAdjustment(form.value.storageMb),
    cards: parseAdjustment(form.value.cards),
  }));
  const grantTitle = computed(() =>
    adjustment.value.points < 0 || adjustment.value.storageMb < 0 || adjustment.value.cards < 0
      ? '确认扣减资产'
      : '确认发放资产',
  );
  const grantImpact = computed(() => {
    if (!selectedUser.value) return '';
    const parts = [
      adjustment.value.points
        ? `积分 ${adjustment.value.points > 0 ? '+' : ''}${adjustment.value.points}`
        : '',
      adjustment.value.storageMb
        ? `存储 ${adjustment.value.storageMb > 0 ? '+' : ''}${adjustment.value.storageMb}MB`
        : '',
      adjustment.value.cards ? `补签卡 ${adjustment.value.cards > 0 ? '+' : ''}${adjustment.value.cards}` : '',
    ].filter(Boolean);
    return `目标：${selectedUser.value.alias || '(未设昵称)'}（${selectedUser.value.userId}）。${parts.join(
      ' · ',
    )}。预计调整后：积分 ${projectedBalance.value.points} / 存储 ${projectedBalance.value.storageMb}MB / 补签卡 ${
      projectedBalance.value.cards
    }。`;
  });

  function openGrant() {
    if (!selectedUser.value?.userId) return;
    const { points, storageMb, cards } = adjustment.value;
    if (!points && !storageMb && !cards) {
      message.info('请至少填写一项发放数量');
      return;
    }
    grantVisible.value = true;
  }

  async function confirmGrant(action: { reason: string; confirmed: true; confirmText: string }) {
    if (!selectedUser.value?.userId) return;
    const { points, storageMb, cards } = adjustment.value;
    granting.value = true;
    try {
      const res = await growthApi.adminGrantPoints({
        userId: selectedUser.value.userId,
        points,
        storageMb,
        cards,
        note: form.value.note,
        ...action,
      });
      if (res.status === 200 && res.data?.ok) {
        grantVisible.value = false;
        message.success(
          `已更新：积分 ${res.data.points} / 存储 ${res.data.storageBonusMb}MB / 补签卡 ${
            res.data.cards
          } · 审计 ${String(res.data.auditId || '').slice(0, 8)}`,
        );
        form.value.points = '';
        form.value.storageMb = '';
        form.value.cards = '';
        await Promise.all([queryUser(), loadOverview()]);
      } else {
        message.error(res.msg || '发放失败');
      }
    } finally {
      granting.value = false;
    }
  }

  function parseAdjustment(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.trunc(number) : 0;
  }

  const projectedBalance = computed(() => ({
    points: Number(detail.value?.balance?.points || 0) + parseAdjustment(form.value.points),
    storageMb: Number(detail.value?.balance?.storageBonusMb || 0) + parseAdjustment(form.value.storageMb),
    cards: Number(detail.value?.balance?.cards || 0) + parseAdjustment(form.value.cards),
  }));

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

    .pops-field-row {
      flex-direction: column;
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
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .pops-reason-name small {
    color: var(--desc-color);
    font-size: 10px;
    font-weight: 400;
    line-height: 1.35;
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
    min-width: 52px;
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
  .pops-selected-user {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border: 2px solid var(--primary-color);
    border-radius: 10px;
    background: var(--card-background);

    > div {
      display: grid;
      min-width: 0;
      gap: 2px;
    }

    strong {
      color: var(--text-color);
      font-size: 14px;
    }

    span,
    code {
      overflow: hidden;
      color: var(--desc-color);
      font-size: 11px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .pops-select-hint {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
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
  .pops-log-source {
    display: grid;
    min-width: 0;
    gap: 2px;

    strong {
      color: var(--text-color);
      font-size: 12px;
    }

    small,
    code {
      overflow: hidden;
      color: var(--desc-color);
      font-size: 10.5px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
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

  @media (max-width: @admin-bp-mobile) {
    .pops-selected-user {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
