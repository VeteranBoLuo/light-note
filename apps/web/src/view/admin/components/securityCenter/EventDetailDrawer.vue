<template>
  <b-drawer :open="visible" title="攻击事件详情" width="720" @close="$emit('close')">
    <div v-if="eventDetail.event" class="security-detail">
      <section>
        <h3>事件概览</h3>
        <div class="detail-grid">
          <span>规则</span><strong>{{ eventDetail.event.matchedRule || eventDetail.event.attackType }}</strong>
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
          <span>账号风险影响</span
          ><strong>
            +{{ eventDetail.event.userRiskDelta || 0 }}
            <em>{{ eventDetail.event.userRiskReverted ? '已回滚' : '未回滚' }}</em>
          </strong>
        </div>
      </section>

      <section>
        <h3>命中证据</h3>
        <ol class="security-evidence-list">
          <li v-for="item in eventDetail.evidence" :key="item.id" class="security-evidence-item">
            <span class="security-evidence-dot" :class="`is-${item.severity}`" aria-hidden="true"></span>
            <div>
              <strong>{{ item.ruleName }}</strong>
              <p>{{ item.evidenceMessage }}</p>
              <code>{{ item.matchedField }}: {{ item.matchedValuePreview }}</code>
            </div>
          </li>
        </ol>
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
          <BSelect v-model:value="handleForm.handledStatus" :options="handleStatusOptions" class="security-select" />
          <b-input v-model:value="handleForm.remark" placeholder="处理备注" class="handle-input" />
          <b-button type="primary" @click="submitHandle">保存</b-button>
        </div>
      </section>
    </div>
  </b-drawer>
</template>

<script lang="ts" setup>
  import { inject, reactive, watch } from 'vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { apiBaseGet, apiBasePost } from '@/http/request.ts';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import {
    BAN_IP,
    UNBAN_IP,
    BAN_ACCOUNT,
    UNBAN_ACCOUNT,
    excludesSecurityEventRisk,
    ipRecentColumns,
    securityHandledStatusConfirmText,
    securityHandledStatusOptions,
    type SecurityHandledStatus,
  } from './securityShared';

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
  const handleForm = reactive<{ handledStatus: SecurityHandledStatus; remark: string }>({
    handledStatus: 'processed',
    remark: '',
  });
  const handleStatusOptions = securityHandledStatusOptions;

  async function loadDetail() {
    if (!props.eventId) return;
    const res = await apiBaseGet(`/api/security/events/${props.eventId}`);
    if (res.status === 200) {
      Object.assign(eventDetail, res.data);
      handleForm.handledStatus = ({
        confirmed: 'processed',
        resolved: 'processed',
        ignored: 'processed',
      }[res.data.event.handledStatus] ||
        res.data.event.handledStatus ||
        'processed') as SecurityHandledStatus;
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
    const currentStatus = eventDetail.event.handledStatus || 'unhandled';
    const shouldExcludeRisk = excludesSecurityEventRisk(handleForm.handledStatus);
    const restoresRisk = excludesSecurityEventRisk(currentStatus) && !shouldExcludeRisk;
    if (shouldExcludeRisk || restoresRisk) {
      const riskText =
        riskParts.length > 0
          ? shouldExcludeRisk
            ? ` 本次将回滚 ${riskParts.join('、')}。`
            : ` 本次将重新计入 ${riskParts.join('、')}。`
          : '';
      Alert.alert({
        title: handleForm.handledStatus === 'authorized_test' ? '标记为授权测试' : '确认处置状态',
        content: `${securityHandledStatusConfirmText(handleForm.handledStatus)}${riskText}`,
        okText: '确认保存',
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
    { immediate: true },
  );
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
