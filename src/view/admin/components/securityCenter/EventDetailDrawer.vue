<template>
  <a-drawer :open="visible" title="攻击事件详情" placement="right" width="720" @close="$emit('close')">
    <div v-if="eventDetail.event" class="security-detail">
      <section>
        <h3>事件概览</h3>
        <div class="detail-grid">
          <span>类型</span><strong>{{ eventDetail.event.attackType }}</strong> <span>等级</span
          ><strong>{{ eventDetail.event.severity }}</strong> <span>分数</span
          ><strong>{{ eventDetail.event.threatScore }}</strong> <span>动作</span
          ><strong>{{ eventDetail.event.actionTaken }}</strong> <span>IP</span
          ><strong>{{ eventDetail.event.sourceIp }}</strong> <span>账号</span
          ><strong>{{ eventDetail.event.alias || eventDetail.event.email || eventDetail.event.userId }}</strong>
          <span>用户ID</span><strong>{{ eventDetail.event.userId || '未识别' }}</strong> <span>接口</span
          ><strong>{{ eventDetail.event.requestPath }}</strong> <span>IP风险影响</span
          ><strong>
            +{{ eventDetail.event.ipRiskDelta || 0 }}
            <em>{{ eventDetail.event.ipRiskReverted ? '已回滚' : '未回滚' }}</em>
          </strong>
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
        <BTable :data="eventDetail.ipRecent" :columns="ipRecentColumns" :rowKey="'eventId'" />
      </section>

      <section>
        <h3>处置</h3>
        <div class="quick-actions">
          <b-button @click="banIp?.(eventDetail.event.sourceIp)">封禁此IP 1小时</b-button>
          <b-button @click="unbanIp?.(eventDetail.event.sourceIp)">解封此IP</b-button>
          <b-button v-if="eventDetail.event.userId" @click="banAccount?.(eventDetail.event.userId)"
            >封禁关联账号</b-button
          >
          <b-button v-if="eventDetail.event.userId" @click="unbanAccount?.(eventDetail.event.userId)"
            >解封关联账号</b-button
          >
        </div>
        <div class="handle-row">
          <a-select v-model:value="handleForm.handledStatus" class="security-select">
            <a-select-option value="unhandled">未处理</a-select-option>
            <a-select-option value="processed">已处理</a-select-option>
            <a-select-option value="false_positive">误报</a-select-option>
          </a-select>
          <b-input v-model:value="handleForm.remark" placeholder="处理备注" class="handle-input" />
          <b-button type="primary" @click="submitHandle">保存</b-button>
        </div>
      </section>
    </div>
  </a-drawer>
</template>

<script lang="ts" setup>
import { inject, reactive, watch } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { apiBaseGet, apiBasePost } from '@/http/request.ts';
import BButton from '@/components/base/BasicComponents/BButton.vue';
import BInput from '@/components/base/BasicComponents/BInput.vue';
import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
import { BAN_IP, UNBAN_IP, BAN_ACCOUNT, UNBAN_ACCOUNT, severityColor, ipRecentColumns } from './securityShared';

const props = defineProps<{ visible: boolean; eventId: string | null }>();
const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const banIp = inject(BAN_IP);
const unbanIp = inject(UNBAN_IP);
const banAccount = inject(BAN_ACCOUNT);
const unbanAccount = inject(UNBAN_ACCOUNT);

const eventDetail = reactive<any>({ event: null, evidence: [], ipRecent: [], ipInfo: null, userInfo: null });
const handleForm = reactive({ handledStatus: 'processed', remark: '' });

async function loadDetail() {
  if (!props.eventId) return;
  const res = await apiBaseGet(`/api/security/events/${props.eventId}`);
  if (res.status === 200) {
    Object.assign(eventDetail, res.data);
    handleForm.handledStatus =
      {
        confirmed: 'processed',
        resolved: 'processed',
        ignored: 'processed',
      }[res.data.event.handledStatus] ||
      res.data.event.handledStatus ||
      'processed';
    handleForm.remark = res.data.event.remark || '';
  }
}

async function doSubmitHandle() {
  if (!eventDetail.event?.eventId) return;
  const res = await apiBasePost(`/api/security/events/${eventDetail.event.eventId}/handle`, handleForm);
  if (res.status === 200) {
    message.success(res.msg || '处置状态已保存');
    emit('saved');
    emit('close');
  }
}

async function submitHandle() {
  if (!eventDetail.event?.eventId) return;
  const riskParts: string[] = [];
  if (Number(eventDetail.event.ipRiskDelta || 0) > 0 && !eventDetail.event.ipRiskReverted) {
    riskParts.push(`${eventDetail.event.ipRiskDelta} 分 IP风险`);
  }
  if (Number(eventDetail.event.userRiskDelta || 0) > 0 && !eventDetail.event.userRiskReverted) {
    riskParts.push(`${eventDetail.event.userRiskDelta} 分 账号风险`);
  }
  const riskText = riskParts.length > 0 ? `，并撤销本次事件带来的 ${riskParts.join('、')}影响` : '';
  if (handleForm.handledStatus === 'false_positive' && riskParts.length > 0) {
    Modal.confirm({
      title: '标记为误报',
      content: `确认标记为误报？系统会保留攻击日志${riskText}。`,
      okText: '确认误报',
      cancelText: '取消',
      onOk: doSubmitHandle,
    });
    return;
  }
  await doSubmitHandle();
}

watch(
  () => props.visible,
  (v) => {
    if (v && props.eventId) {
      loadDetail();
    } else if (!v) {
      Object.assign(eventDetail, { event: null, evidence: [], ipRecent: [], ipInfo: null, userInfo: null });
    }
  },
);
</script>

<style lang="less" scoped>
@import './securityCenter.less';
</style>

<style lang="less">
.ant-drawer-content,
.ant-drawer-header {
  background: var(--background-color) !important;
  color: var(--text-color) !important;
}

.ant-drawer-title,
.ant-drawer-close {
  color: var(--text-color) !important;
}

.ant-drawer-header {
  border-bottom-color: var(--card-border-color) !important;
}

.ant-drawer-body {
  background: var(--background-color) !important;
}
</style>
