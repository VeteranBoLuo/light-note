<template>
  <div class="admin-panel-container">
    <section class="admin-panel security-panel">
      <header class="admin-header security-header">
        <div class="admin-title-block">
          <p class="admin-eyebrow">Admin / Security</p>
          <h2 class="admin-title">安全中心</h2>
          <p class="admin-subtitle">查看攻击态势、拦截记录、IP风险和处置状态</p>
        </div>
        <div class="security-header-actions">
          <b-button @click="activeTab = 'accountBans'">账号封禁</b-button>
          <b-button type="primary" @click="refreshAll">刷新</b-button>
        </div>
      </header>

      <a-tabs v-model:activeKey="activeTab" class="security-tabs">
        <a-tab-pane key="overview" tab="威胁总览">
          <ul class="admin-stats security-stats">
            <li v-for="card in statCards" :key="card.label" class="admin-stat-card security-stat-card">
              <span class="admin-stat-label">{{ card.label }}</span>
              <strong class="admin-stat-value">{{ card.value }}</strong>
              <span class="admin-stat-hint">{{ card.hint }}</span>
            </li>
          </ul>

          <div class="security-grid">
            <section class="security-section">
              <h3>攻击类型分布</h3>
              <a-table :data-source="overview.typeDistribution" :columns="typeColumns" size="small" :pagination="false" row-key="attackType" />
            </section>
            <section class="security-section">
              <h3>24小时趋势</h3>
              <a-table :data-source="overview.trend" :columns="trendColumns" size="small" :pagination="false" row-key="time" />
            </section>
            <section class="security-section">
              <h3>Top 攻击 IP</h3>
              <a-table :data-source="overview.topIps" :columns="topIpColumns" size="small" :pagination="false" row-key="sourceIp" />
            </section>
            <section class="security-section">
              <h3>Top 被攻击接口</h3>
              <a-table :data-source="overview.topPaths" :columns="topPathColumns" size="small" :pagination="false" row-key="requestPath" />
            </section>
          </div>
        </a-tab-pane>

        <a-tab-pane key="events" tab="攻击日志">
          <div class="admin-filters security-filters">
            <div class="admin-filters-main security-filters-main">
              <b-input v-model:value="eventFilters.key" placeholder="搜索IP/接口/类型/用户" class="security-search-input" @input="handleEventSearch" />
              <a-select v-model:value="eventFilters.severity" allow-clear placeholder="威胁等级" class="security-select" @change="searchEvents">
                <a-select-option value="low">low</a-select-option>
                <a-select-option value="medium">medium</a-select-option>
                <a-select-option value="high">high</a-select-option>
                <a-select-option value="critical">critical</a-select-option>
              </a-select>
              <a-select v-model:value="eventFilters.actionTaken" allow-clear placeholder="处置动作" class="security-select" @change="searchEvents">
                <a-select-option value="log">记录</a-select-option>
                <a-select-option value="block">拦截</a-select-option>
                <a-select-option value="ban">封禁</a-select-option>
              </a-select>
              <a-select v-model:value="eventFilters.handledStatus" allow-clear placeholder="处理状态" class="security-select" @change="searchEvents">
                <a-select-option value="unhandled">未处理</a-select-option>
                <a-select-option value="confirmed">已确认</a-select-option>
                <a-select-option value="false_positive">误报</a-select-option>
                <a-select-option value="ignored">已忽略</a-select-option>
                <a-select-option value="resolved">已解决</a-select-option>
              </a-select>
              <b-button type="primary" @click="searchEvents">搜索</b-button>
            </div>
            <span class="admin-filters-hint">支持查看命中证据、脱敏请求快照、同IP近期行为和处置备注</span>
          </div>

          <div class="admin-table-card">
            <a-table
              :data-source="events"
              :columns="eventColumns"
              row-key="eventId"
              :pagination="false"
              :scroll="{ x: 1180, y: tableScrollY }"
              :loading="eventLoading"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'createdAt'">
                  <a-tooltip :title="record.createdAt">
                    <span class="ellipsis-cell">{{ record.createdAt }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.dataIndex === 'severity'">
                  <span class="security-pill" :class="`is-${record.severity}`">{{ record.severity }}</span>
                </template>
                <template v-else-if="column.dataIndex === 'attackType'">
                  <a-tooltip :title="record.attackType">
                    <span class="ellipsis-cell">{{ record.attackType }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.dataIndex === 'user'">
                  <a-tooltip :title="eventUserTooltip(record)">
                    <span class="ellipsis-cell">{{ eventUserText(record) }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.dataIndex === 'sourceIp'">
                  <a-tooltip :title="record.sourceIp">
                    <span class="ellipsis-cell">{{ record.sourceIp }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.dataIndex === 'requestPath'">
                  <a-tooltip :title="record.requestPath">
                    <span class="ellipsis-cell">{{ record.requestPath }}</span>
                  </a-tooltip>
                </template>
                <template v-else-if="column.dataIndex === 'threatScore'">
                  <a-progress :percent="record.threatScore" size="small" :show-info="true" :stroke-color="scoreColor(record.threatScore)" trail-color="var(--security-progress-trail)" />
                </template>
                <template v-else-if="column.dataIndex === 'blocked'">
                  <span class="security-pill" :class="record.blocked ? 'is-high' : 'is-low'">{{ record.blocked ? '已拦截' : '已放行' }}</span>
                </template>
                <template v-else-if="column.dataIndex === 'handledStatus'">
                  <span class="security-pill is-neutral">{{ statusText(record.handledStatus) }}</span>
                </template>
                <template v-else-if="column.dataIndex === 'action'">
                  <b-button size="small" @click="openEventDetail(record)">详情</b-button>
                </template>
              </template>
            </a-table>
          </div>

          <footer class="admin-footer">
            <a-pagination :current="eventPage.currentPage" :page-size="eventPage.pageSize" show-size-changer size="small" :total="eventTotal" @change="onEventPageChange" />
          </footer>
        </a-tab-pane>

        <a-tab-pane key="ips" tab="IP画像">
          <div class="admin-filters security-filters">
            <div class="admin-filters-main security-filters-main">
              <b-input v-model:value="ipFilters.key" placeholder="搜索IP或封禁原因" class="security-search-input" @input="handleIpSearch" />
              <b-button type="primary" @click="searchIps">搜索</b-button>
            </div>
          </div>
          <div class="admin-table-card">
            <a-table :data-source="ipList" :columns="ipColumns" row-key="ip" :pagination="false" :scroll="{ y: tableScrollY }" :custom-row="ipRecordRow">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'riskScore'">
                  <a-progress :percent="record.riskScore || 0" size="small" :stroke-color="scoreColor(record.riskScore || 0)" trail-color="var(--security-progress-trail)" />
                </template>
                <template v-else-if="column.dataIndex === 'isBanned'">
                  <span class="security-pill" :class="record.isBanned ? 'is-high' : 'is-low'">{{ record.isBanned ? '封禁中' : '正常' }}</span>
                </template>
                <template v-else-if="column.dataIndex === 'action'">
                  <b-button size="small" @click="openIpAccounts(record)">账户</b-button>
                </template>
              </template>
            </a-table>
          </div>
          <footer class="admin-footer">
            <a-pagination :current="ipPage.currentPage" :page-size="ipPage.pageSize" show-size-changer size="small" :total="ipTotal" @change="onIpPageChange" />
          </footer>
        </a-tab-pane>

        <a-tab-pane key="accountBans" tab="账号封禁">
          <div class="admin-filters security-filters">
            <div class="admin-filters-main security-filters-main">
              <b-input v-model:value="accountFilters.key" placeholder="搜索账号/邮箱/封禁原因" class="security-search-input" @input="handleAccountSearch" />
              <b-button type="primary" @click="searchAccountBans">搜索</b-button>
            </div>
            <span class="admin-filters-hint">账号封禁会让该账号退出登录；登录时会明确提示账号已被封禁</span>
          </div>
          <div class="admin-table-card">
            <a-table :data-source="accountBans" :columns="accountColumns" row-key="userId" :pagination="false" :scroll="{ y: tableScrollY }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'account'">
                  <div class="account-cell">
                    <strong>{{ record.alias || record.email || record.userId }}</strong>
                    <span>{{ record.email || record.userId }}</span>
                  </div>
                </template>
                <template v-else-if="column.dataIndex === 'role'">
                  <span class="security-pill is-neutral">{{ record.role }}</span>
                </template>
                <template v-else-if="column.dataIndex === 'action'">
                  <b-button size="small" @click="unbanAccount(record.userId)">解封账号</b-button>
                </template>
              </template>
            </a-table>
          </div>
          <footer class="admin-footer">
            <a-pagination :current="accountPage.currentPage" :page-size="accountPage.pageSize" show-size-changer size="small" :total="accountTotal" @change="onAccountPageChange" />
          </footer>
        </a-tab-pane>

        <a-tab-pane key="rules" tab="规则库">
          <div class="admin-table-card security-rules-card">
            <a-table :data-source="rules" :columns="ruleColumns" row-key="ruleCode" :pagination="false">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'severity'">
                  <span class="security-pill" :class="`is-${record.severity}`">{{ record.severity }}</span>
                </template>
                <template v-else-if="column.dataIndex === 'enabled'">
                  <span class="security-pill" :class="record.enabled ? 'is-low' : 'is-neutral'">{{ record.enabled ? '启用' : '停用' }}</span>
                </template>
              </template>
            </a-table>
          </div>
        </a-tab-pane>
      </a-tabs>
    </section>

    <a-drawer v-model:open="detailVisible" title="攻击事件详情" placement="right" width="720">
      <div v-if="eventDetail.event" class="security-detail">
        <section>
          <h3>事件概览</h3>
          <div class="detail-grid">
            <span>类型</span><strong>{{ eventDetail.event.attackType }}</strong>
            <span>等级</span><strong>{{ eventDetail.event.severity }}</strong>
            <span>分数</span><strong>{{ eventDetail.event.threatScore }}</strong>
            <span>动作</span><strong>{{ eventDetail.event.actionTaken }}</strong>
            <span>IP</span><strong>{{ eventDetail.event.sourceIp }}</strong>
            <span>账号</span><strong>{{ eventAccountText }}</strong>
            <span>用户ID</span><strong>{{ eventDetail.event.userId || '未识别' }}</strong>
            <span>接口</span><strong>{{ eventDetail.event.requestPath }}</strong>
          </div>
        </section>

        <section>
          <h3>命中证据</h3>
          <a-timeline>
            <a-timeline-item v-for="item in eventDetail.evidence" :key="item.id" :color="severityColor(item.severity)">
              <strong>{{ item.ruleName }}</strong>
              <p>{{ item.evidenceMessage }}</p>
              <code>{{ item.matchedField }}: {{ item.matchedValuePreview }}</code>
            </a-timeline-item>
          </a-timeline>
        </section>

        <section>
          <h3>请求快照</h3>
          <pre>{{ eventDetail.event.payloadSummary }}</pre>
        </section>

        <section>
          <h3>同IP近期事件</h3>
          <a-table :data-source="eventDetail.ipRecent" :columns="ipRecentColumns" size="small" row-key="eventId" :pagination="false" />
        </section>

        <section>
          <h3>处置</h3>
          <div class="quick-actions">
            <b-button @click="banIp(eventDetail.event.sourceIp)">封禁此IP 1小时</b-button>
            <b-button @click="unbanIp(eventDetail.event.sourceIp)">解封此IP</b-button>
            <b-button v-if="eventDetail.event.userId" @click="banAccount(eventDetail.event.userId)">封禁关联账号</b-button>
            <b-button v-if="eventDetail.event.userId" @click="unbanAccount(eventDetail.event.userId)">解封关联账号</b-button>
          </div>
          <div class="handle-row">
            <a-select v-model:value="handleForm.handledStatus" class="security-select">
              <a-select-option value="confirmed">已确认</a-select-option>
              <a-select-option value="false_positive">误报</a-select-option>
              <a-select-option value="ignored">已忽略</a-select-option>
              <a-select-option value="resolved">已解决</a-select-option>
            </a-select>
            <b-input v-model:value="handleForm.remark" placeholder="处理备注" class="handle-input" />
            <b-button type="primary" @click="submitHandle">保存</b-button>
          </div>
        </section>
      </div>
    </a-drawer>

    <a-drawer v-model:open="ipAccountVisible" title="IP关联账号" placement="right" width="760">
      <div class="security-detail">
        <section>
          <h3>{{ currentIp }} 使用过的账号</h3>
          <div class="ip-account-actions">
            <span>共 {{ ipAccounts.length }} 个账号</span>
            <div class="table-actions">
              <b-button v-if="currentIpInfo?.isBanned" @click="unbanIp(currentIp)">解封此IP</b-button>
              <b-button v-else @click="banIp(currentIp)">封禁此IP 1小时</b-button>
              <b-button :disabled="selectedIpAccountIds.length === 0" @click="banSelectedIpAccounts">封禁选中账号</b-button>
            </div>
          </div>
          <a-table
            :data-source="ipAccounts"
            :columns="ipAccountColumns"
            row-key="userId"
            size="small"
            :pagination="false"
            :loading="ipAccountLoading"
            :row-selection="{ selectedRowKeys: selectedIpAccountIds, onChange: onIpAccountSelect }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'account'">
                <div class="account-cell">
                  <strong>{{ record.alias || record.email || record.userId }}</strong>
                  <span>{{ record.email || record.userId }}</span>
                </div>
              </template>
              <template v-else-if="column.dataIndex === 'delFlag'">
                <span class="security-pill" :class="Number(record.delFlag) === 1 ? 'is-high' : 'is-low'">{{ Number(record.delFlag) === 1 ? '已封禁' : '正常' }}</span>
              </template>
              <template v-else-if="column.dataIndex === 'lastSeenAt'">
                <a-tooltip :title="record.lastSeenAt">
                  <span class="ellipsis-cell">{{ record.lastSeenAt || '-' }}</span>
                </a-tooltip>
              </template>
              <template v-else-if="column.dataIndex === 'action'">
                <b-button v-if="Number(record.delFlag) !== 1" size="small" @click="banAccount(record.userId)">封禁账号</b-button>
                <b-button v-else size="small" @click="unbanAccount(record.userId)">解封账号</b-button>
              </template>
            </template>
          </a-table>
        </section>
      </div>
    </a-drawer>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, reactive, ref, watch } from 'vue';
  import { message, Modal } from 'ant-design-vue';
  import { apiBaseGet, apiBasePost, apiQueryPost } from '@/http/request.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { useTableScrollY } from '@/composables/useTableScrollY';

  const activeTab = ref('overview');
  const { tableScrollY } = useTableScrollY({ reservedHeight: 360 });

  const overview = reactive<any>({
    summary: {},
    typeDistribution: [],
    trend: [],
    topIps: [],
    topPaths: [],
    recentEvents: [],
  });

  const events = ref<any[]>([]);
  const eventTotal = ref(0);
  const eventLoading = ref(false);
  const eventPage = reactive({ currentPage: 1, pageSize: 10 });
  const eventFilters = reactive<any>({
    key: '',
    severity: undefined,
    actionTaken: undefined,
    handledStatus: undefined,
  });

  const ipList = ref<any[]>([]);
  const ipTotal = ref(0);
  const ipPage = reactive({ currentPage: 1, pageSize: 10 });
  const ipFilters = reactive<any>({ key: '' });
  const accountBans = ref<any[]>([]);
  const accountTotal = ref(0);
  const accountPage = reactive({ currentPage: 1, pageSize: 10 });
  const accountFilters = reactive<any>({ key: '' });
  const rules = ref<any[]>([]);
  const detailVisible = ref(false);
  const ipAccountVisible = ref(false);
  const ipAccountLoading = ref(false);
  const currentIp = ref('');
  const ipAccounts = ref<any[]>([]);
  const selectedIpAccountIds = ref<string[]>([]);
  const eventDetail = reactive<any>({ event: null, evidence: [], ipRecent: [], ipInfo: null });
  const handleForm = reactive({ handledStatus: 'confirmed', remark: '' });
  const eventSearchTimer = ref<any>(null);
  const ipSearchTimer = ref<any>(null);
  const accountSearchTimer = ref<any>(null);

  const statCards = computed(() => {
    const summary = overview.summary || {};
    return [
      { label: '7日安全事件', value: summary.total || 0, hint: '累计命中' },
      { label: '今日事件', value: summary.todayTotal || 0, hint: '当天新增' },
      { label: '高危/严重', value: summary.highRisk || 0, hint: '需关注' },
      { label: '已拦截', value: summary.blocked || 0, hint: '防护动作' },
      { label: '活跃攻击IP', value: summary.activeIps || 0, hint: '近7日' },
      { label: '今日严重', value: summary.todayCritical || 0, hint: 'critical' },
    ];
  });

  const eventColumns = [
    { title: '时间', dataIndex: 'createdAt', ellipsis: true, width: 165 },
    { title: '等级', dataIndex: 'severity', width: 82 },
    { title: '分数', dataIndex: 'threatScore', width: 120 },
    { title: '类型', dataIndex: 'attackType', ellipsis: true, width: 135 },
    { title: '用户昵称', dataIndex: 'user', ellipsis: true, width: 130 },
    { title: '来源IP', dataIndex: 'sourceIp', ellipsis: true, width: 145 },
    { title: '接口', dataIndex: 'requestPath', ellipsis: true, width: 220 },
    { title: '拦截', dataIndex: 'blocked', width: 82 },
    { title: '状态', dataIndex: 'handledStatus', width: 95 },
    { title: '操作', dataIndex: 'action', width: 90 },
  ];
  const typeColumns = [
    { title: '攻击类型', dataIndex: 'attackType' },
    { title: '数量', dataIndex: 'total', width: 90 },
  ];
  const trendColumns = [
    { title: '时间', dataIndex: 'time' },
    { title: '事件', dataIndex: 'total', width: 90 },
    { title: '拦截', dataIndex: 'blocked', width: 90 },
  ];
  const topIpColumns = [
    { title: 'IP', dataIndex: 'sourceIp' },
    { title: '次数', dataIndex: 'total', width: 80 },
    { title: '最高分', dataIndex: 'maxScore', width: 90 },
  ];
  const topPathColumns = [
    { title: '接口', dataIndex: 'requestPath', ellipsis: true },
    { title: '次数', dataIndex: 'total', width: 80 },
    { title: '最高分', dataIndex: 'maxScore', width: 90 },
  ];
  const ipColumns = [
    { title: 'IP', dataIndex: 'ip', ellipsis: true },
    { title: '风险分', dataIndex: 'riskScore', width: 140 },
    { title: '攻击次数', dataIndex: 'totalAttacks', width: 100 },
    { title: '高危', dataIndex: 'highRiskCount', width: 80 },
    { title: '严重', dataIndex: 'criticalCount', width: 80 },
    { title: '状态', dataIndex: 'isBanned', width: 90 },
    { title: '最近攻击', dataIndex: 'lastAttackTime', ellipsis: true },
    { title: '操作', dataIndex: 'action', width: 90 },
  ];
  const accountColumns = [
    { title: '账号', dataIndex: 'account', ellipsis: true },
    { title: '角色', dataIndex: 'role', width: 90 },
    { title: '封禁原因', dataIndex: 'banReason', ellipsis: true },
    { title: '封禁时间', dataIndex: 'bannedAt', ellipsis: true, width: 160 },
    { title: '操作', dataIndex: 'action', width: 110 },
  ];
  const ruleColumns = [
    { title: '规则', dataIndex: 'ruleName', ellipsis: true },
    { title: '类型', dataIndex: 'attackType', width: 160 },
    { title: '等级', dataIndex: 'severity', width: 100 },
    { title: '基础分', dataIndex: 'baseScore', width: 90 },
    { title: '置信度', dataIndex: 'confidence', width: 90 },
    { title: '动作', dataIndex: 'action', width: 90 },
    { title: '状态', dataIndex: 'enabled', width: 90 },
  ];
  const ipRecentColumns = [
    { title: '时间', dataIndex: 'createdAt', ellipsis: true },
    { title: '类型', dataIndex: 'attackType', ellipsis: true },
    { title: '等级', dataIndex: 'severity', width: 90 },
    { title: '分数', dataIndex: 'threatScore', width: 80 },
  ];
  const ipAccountColumns = [
    { title: '账号', dataIndex: 'account', ellipsis: true },
    { title: '状态', dataIndex: 'delFlag', width: 90 },
    { title: '安全事件', dataIndex: 'securityEvents', width: 90 },
    { title: '访问次数', dataIndex: 'apiRequests', width: 90 },
    { title: '最近出现', dataIndex: 'lastSeenAt', ellipsis: true, width: 160 },
    { title: '来源', dataIndex: 'sources', ellipsis: true, width: 110 },
    { title: '操作', dataIndex: 'action', width: 100 },
  ];

  const eventAccountText = computed(() => {
    const event = eventDetail.event || {};
    return event.alias || event.email || event.userId || '未识别';
  });
  const currentIpInfo = computed(() => ipList.value.find((item) => item.ip === currentIp.value));

  function severityColor(severity: string) {
    return { low: 'blue', medium: 'orange', high: 'volcano', critical: 'red' }[severity] || 'default';
  }

  function scoreColor(score: number) {
    if (score >= 80) return 'var(--security-critical)';
    if (score >= 50) return 'var(--security-high)';
    if (score >= 20) return 'var(--security-medium)';
    return 'var(--security-low)';
  }

  function statusText(status: string) {
    return (
      {
        unhandled: '未处理',
        confirmed: '已确认',
        false_positive: '误报',
        ignored: '已忽略',
        resolved: '已解决',
      }[status] || status
    );
  }

  function eventUserText(record: any) {
    return record.alias || record.email || record.userId || '-';
  }

  function eventUserTooltip(record: any) {
    const parts = [record.alias, record.email, record.userId].filter(Boolean);
    return parts.length ? parts.join(' / ') : '未识别用户';
  }

  async function loadOverview() {
    const res = await apiBasePost('/api/security/overview', {});
    if (res.status === 200) {
      Object.assign(overview, res.data);
    }
  }

  async function searchEvents() {
    eventLoading.value = true;
    const res = await apiQueryPost('/api/security/events', {
      currentPage: eventPage.currentPage,
      pageSize: eventPage.pageSize,
      filters: {
        key: eventFilters.key,
        severity: eventFilters.severity,
        actionTaken: eventFilters.actionTaken,
        handledStatus: eventFilters.handledStatus,
      },
    }).finally(() => {
      eventLoading.value = false;
    });
    if (res.status === 200) {
      events.value = res.data.items;
      eventTotal.value = res.data.total;
    }
  }

  async function searchIps() {
    const res = await apiQueryPost('/api/security/ipReputation', {
      currentPage: ipPage.currentPage,
      pageSize: ipPage.pageSize,
      filters: { key: ipFilters.key },
    });
    if (res.status === 200) {
      ipList.value = res.data.items;
      ipTotal.value = res.data.total;
    }
  }

  async function openIpAccounts(record: any) {
    const ip = typeof record === 'string' ? record : record?.ip;
    if (!ip) return;
    currentIp.value = ip;
    ipAccountVisible.value = true;
    ipAccountLoading.value = true;
    selectedIpAccountIds.value = [];
    const res = await apiBasePost('/api/security/ipAccounts', { ip }).finally(() => {
      ipAccountLoading.value = false;
    });
    if (res.status === 200) {
      ipAccounts.value = res.data.items;
    }
  }

  function onIpAccountSelect(keys: string[]) {
    selectedIpAccountIds.value = keys;
  }

  function ipRecordRow(record: any) {
    return {
      class: 'clickable-row',
      onClick: (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (target.closest('button')) {
          return;
        }
        openIpAccounts(record);
      },
    };
  }

  async function searchAccountBans() {
    const res = await apiQueryPost('/api/security/accountBans', {
      currentPage: accountPage.currentPage,
      pageSize: accountPage.pageSize,
      filters: { key: accountFilters.key },
    });
    if (res.status === 200) {
      accountBans.value = res.data.items;
      accountTotal.value = res.data.total;
    }
  }

  async function loadRules() {
    const res = await apiBasePost('/api/security/rules', {});
    if (res.status === 200) {
      rules.value = res.data.items;
    }
  }

  async function openEventDetail(record: any) {
    const res = await apiBaseGet(`/api/security/events/${record.eventId}`);
    if (res.status === 200) {
      Object.assign(eventDetail, res.data);
      handleForm.handledStatus = res.data.event.handledStatus || 'confirmed';
      handleForm.remark = res.data.event.remark || '';
      detailVisible.value = true;
    }
  }

  async function submitHandle() {
    if (!eventDetail.event?.eventId) return;
    const res = await apiBasePost(`/api/security/events/${eventDetail.event.eventId}/handle`, handleForm);
    if (res.status === 200) {
      message.success('处置状态已保存');
      detailVisible.value = false;
      searchEvents();
      loadOverview();
    }
  }

  async function banIp(ip: string) {
    if (!ip) return;
    Modal.confirm({
      title: '封禁IP',
      content: `确认封禁 ${ip} 1小时？封禁期内该IP的普通业务访问会被拦截。`,
      okText: '确认封禁',
      cancelText: '取消',
      onOk: async () => {
        const res = await apiBasePost('/api/security/ipBan', { ip, minutes: 60, reason: '管理员在安全中心手动封禁' });
        if (res.status === 200) {
          message.success('已封禁IP');
          searchIps();
          loadOverview();
          if (ipAccountVisible.value && currentIp.value) {
            openIpAccounts(currentIp.value);
          }
        }
      },
    });
  }

  async function unbanIp(ip: string) {
    if (!ip) return;
    Modal.confirm({
      title: '解封IP',
      content: `确认解封 ${ip}？`,
      okText: '确认解封',
      cancelText: '取消',
      onOk: async () => {
        const res = await apiBasePost('/api/security/ipUnban', { ip });
        if (res.status === 200) {
          message.success('已解封IP');
          searchIps();
          loadOverview();
          if (ipAccountVisible.value && currentIp.value) {
            openIpAccounts(currentIp.value);
          }
        }
      },
    });
  }

  async function banAccount(userId: string) {
    if (!userId) return;
    Modal.confirm({
      title: '封禁账号',
      content: `确认封禁账号 ${userId}？该账号会退出登录并无法访问业务接口。`,
      okText: '确认封禁',
      cancelText: '取消',
      onOk: async () => {
        const res = await apiBasePost('/api/security/accountBan', { userId, reason: '管理员在安全中心手动封禁' });
        if (res.status === 200) {
          message.success('已封禁账号');
          searchAccountBans();
          if (ipAccountVisible.value && currentIp.value) {
            openIpAccounts(currentIp.value);
          }
          if (detailVisible.value) {
            detailVisible.value = false;
          }
        }
      },
    });
  }

  async function unbanAccount(userId: string) {
    if (!userId) return;
    Modal.confirm({
      title: '解封账号',
      content: `确认解封账号 ${userId}？`,
      okText: '确认解封',
      cancelText: '取消',
      onOk: async () => {
        const res = await apiBasePost('/api/security/accountUnban', { userId });
        if (res.status === 200) {
          message.success('已解封账号');
          searchAccountBans();
          if (ipAccountVisible.value && currentIp.value) {
            openIpAccounts(currentIp.value);
          }
        }
      },
    });
  }

  function banSelectedIpAccounts() {
    const ids = selectedIpAccountIds.value.filter((id) => {
      const item = ipAccounts.value.find((account) => account.userId === id);
      return item && Number(item.delFlag) !== 1;
    });
    if (ids.length === 0) {
      message.warning('请选择未封禁账号');
      return;
    }
    Modal.confirm({
      title: '批量封禁账号',
      content: `确认封禁选中的 ${ids.length} 个账号？这些账号会退出登录并无法访问业务接口。`,
      okText: '确认封禁',
      cancelText: '取消',
      onOk: async () => {
        await Promise.all(ids.map((userId) => apiBasePost('/api/security/accountBan', { userId, reason: `管理员按IP ${currentIp.value} 批量封禁` })));
        message.success('已封禁选中账号');
        selectedIpAccountIds.value = [];
        searchAccountBans();
        if (currentIp.value) {
          openIpAccounts(currentIp.value);
        }
      },
    });
  }

  function onEventPageChange(page: number, pageSize: number) {
    eventPage.currentPage = pageSize !== eventPage.pageSize ? 1 : page;
    eventPage.pageSize = pageSize;
    searchEvents();
  }

  function onIpPageChange(page: number, pageSize: number) {
    ipPage.currentPage = pageSize !== ipPage.pageSize ? 1 : page;
    ipPage.pageSize = pageSize;
    searchIps();
  }

  function onAccountPageChange(page: number, pageSize: number) {
    accountPage.currentPage = pageSize !== accountPage.pageSize ? 1 : page;
    accountPage.pageSize = pageSize;
    searchAccountBans();
  }

  function handleEventSearch() {
    clearTimeout(eventSearchTimer.value);
    eventSearchTimer.value = setTimeout(() => {
      eventPage.currentPage = 1;
      searchEvents();
    }, 300);
  }

  function handleIpSearch() {
    clearTimeout(ipSearchTimer.value);
    ipSearchTimer.value = setTimeout(() => {
      ipPage.currentPage = 1;
      searchIps();
    }, 300);
  }

  function handleAccountSearch() {
    clearTimeout(accountSearchTimer.value);
    accountSearchTimer.value = setTimeout(() => {
      accountPage.currentPage = 1;
      searchAccountBans();
    }, 300);
  }

  function refreshAll() {
    loadOverview();
    searchEvents();
    searchIps();
    searchAccountBans();
    loadRules();
  }

  watch(activeTab, (tab) => {
    if (tab === 'events' && events.value.length === 0) searchEvents();
    if (tab === 'ips' && ipList.value.length === 0) searchIps();
    if (tab === 'accountBans' && accountBans.value.length === 0) searchAccountBans();
    if (tab === 'rules' && rules.value.length === 0) loadRules();
  });

  onMounted(() => {
    refreshAll();
  });
</script>

<style lang="less" scoped>
  @import '@/assets/css/admin-manage.less';

  .security-panel {
    overflow: hidden;
    --security-surface: color-mix(in srgb, var(--background-color) 94%, var(--menu-item-h-bg-color) 6%);
    --security-sub-surface: color-mix(in srgb, var(--background-color) 88%, var(--menu-item-bg-color) 12%);
    --security-border: color-mix(in srgb, var(--card-border-color) 70%, transparent);
    --security-muted: var(--desc-color);
    --security-progress-trail: color-mix(in srgb, var(--card-border-color) 35%, transparent);
    --security-low: #2f8f61;
    --security-medium: #9a6a00;
    --security-high: #bd4b18;
    --security-critical: #c93a4b;
  }

  .security-header-actions {
    display: flex;
    gap: 8px;
  }

  .security-tabs {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  :deep(.ant-tabs-content-holder),
  :deep(.ant-tabs-content),
  :deep(.ant-tabs-tabpane-active) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .security-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    overflow: auto;
    max-height: calc(100vh - 310px);
    padding-right: 4px;
  }

  .security-section {
    border: 1px solid var(--security-border);
    border-radius: 8px;
    padding: 12px;
    background: var(--security-surface);
    min-height: 220px;
  }

  .security-section h3,
  .security-detail h3 {
    margin: 0 0 12px;
    font-size: 15px;
    color: var(--text-color);
  }

  .security-filters {
    margin-bottom: 10px;
  }

  .security-filters-main {
    flex-wrap: wrap;
  }

  .security-search-input {
    min-width: 220px;
    flex: 1;
  }

  .security-select {
    min-width: 130px;
  }

  .security-rules-card {
    max-height: calc(100vh - 230px);
  }

  .security-detail {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 8px 12px;
    color: var(--text-color);
  }

  .detail-grid span {
    color: var(--security-muted);
  }

  pre {
    max-height: 260px;
    overflow: auto;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--security-border);
    background: var(--pre-bg-color);
    color: #ffffff;
    white-space: pre-wrap;
    word-break: break-word;
  }

  code {
    display: block;
    padding: 8px;
    border-radius: 6px;
    border: 1px solid var(--security-border);
    background: var(--security-sub-surface);
    color: var(--text-color);
    word-break: break-all;
  }

  .security-pill {
    display: inline-flex;
    min-height: 22px;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    padding: 2px 8px;
    border: 1px solid var(--security-border);
    background: var(--common-tag-bg-color);
    color: var(--common-tag-h-color);
    font-size: 12px;
    line-height: 18px;
    white-space: nowrap;
  }

  .security-pill.is-low {
    border-color: color-mix(in srgb, var(--security-low) 38%, transparent);
    background: color-mix(in srgb, var(--security-low) 12%, var(--background-color));
    color: color-mix(in srgb, var(--security-low) 82%, var(--text-color));
  }

  .security-pill.is-medium {
    border-color: color-mix(in srgb, var(--security-medium) 38%, transparent);
    background: color-mix(in srgb, var(--security-medium) 12%, var(--background-color));
    color: color-mix(in srgb, var(--security-medium) 86%, var(--text-color));
  }

  .security-pill.is-high,
  .security-pill.is-critical {
    border-color: color-mix(in srgb, var(--security-high) 38%, transparent);
    background: color-mix(in srgb, var(--security-high) 12%, var(--background-color));
    color: color-mix(in srgb, var(--security-high) 86%, var(--text-color));
  }

  .security-pill.is-critical {
    border-color: color-mix(in srgb, var(--security-critical) 42%, transparent);
    background: color-mix(in srgb, var(--security-critical) 13%, var(--background-color));
    color: color-mix(in srgb, var(--security-critical) 88%, var(--text-color));
  }

  .security-pill.is-neutral {
    color: var(--desc-color);
  }

  .account-cell {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
  }

  .account-cell strong {
    color: var(--text-color);
  }

  .account-cell span {
    overflow: hidden;
    color: var(--desc-color);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .quick-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }

  .table-actions,
  .ip-account-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .table-actions {
    flex-wrap: wrap;
  }

  .ip-account-actions {
    justify-content: space-between;
    margin-bottom: 10px;
    color: var(--desc-color);
  }

  .ellipsis-cell {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: middle;
    white-space: nowrap;
  }

  .handle-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .handle-input {
    flex: 1;
  }

  :deep(.ant-tabs-tab) {
    color: var(--desc-color);
  }

  :deep(.ant-tabs-tab.ant-tabs-tab-active .ant-tabs-tab-btn) {
    color: var(--text-color);
  }

  :deep(.ant-tabs-ink-bar) {
    background: var(--primary-color, var(--text-color));
  }

  :deep(.ant-table) {
    background: var(--background-color);
    color: var(--text-color);
  }

  :deep(.ant-table-thead > tr > th) {
    background: var(--table-header-bg-color);
    color: var(--text-color);
    border-bottom-color: var(--security-border);
  }

  :deep(.ant-table-tbody > tr > td) {
    border-bottom-color: var(--security-border);
    color: var(--text-color);
  }

  :deep(.ant-table-tbody > tr.ant-table-row:hover > td) {
    background: var(--menu-item-bg-color);
  }

  :deep(.clickable-row) {
    cursor: pointer;
  }

  :deep(.ant-drawer-content),
  :deep(.ant-drawer-header) {
    background: var(--background-color);
    color: var(--text-color);
  }

  :deep(.ant-drawer-title),
  :deep(.ant-drawer-close) {
    color: var(--text-color);
  }

  :deep(.ant-drawer-header) {
    border-bottom-color: var(--security-border);
  }

  @media (max-width: 960px) {
    .security-grid {
      grid-template-columns: 1fr;
      max-height: none;
    }

    .handle-row {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
