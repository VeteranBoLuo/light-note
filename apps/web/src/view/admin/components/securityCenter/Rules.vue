<template>
  <div class="security-v2-page security-quality-v2">
    <header class="security-v2-header">
      <div><h2>{{ t('securityV2.quality.title') }}</h2><p>{{ t('securityV2.quality.subtitle') }}</p></div>
    </header>

    <div class="security-review-toolbar">
      <BInput v-model:value="keyword" class="security-review-search" :placeholder="t('securityV2.quality.search')" />
      <BSelect v-model:value="modeFilter" class="security-review-select" :options="modeFilterOptions" />
      <BSelect v-model:value="days" class="security-review-select" :options="dayOptions" @change="loadRules" />
    </div>

    <div class="security-v2-table-card security-quality-table">
      <BTable :data="filteredRules" :columns="columns" row-key="ruleCode" :row-clickable="true" :loading="loading" @row-click="handleRuleRowClick">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'rule'">
            <span class="security-event-title"><strong>{{ record.ruleCode }}</strong><small>{{ record.ruleName }} · {{ record.description || '-' }}</small></span>
          </template>
          <template v-else-if="column.key === 'mode'">
            <BSelect :value="record.mode" class="security-inline-mode" :options="modeOptions" @click.stop @change="(value) => handleModeChange(record, value)" />
          </template>
          <template v-else-if="column.key === 'falseRate'"><b :class="falsePositiveClass(record.falsePositiveRate)">{{ number(record.falsePositiveRate) }}%</b></template>
          <template v-else-if="column.key === 'primaryRoute'"><span class="security-route-cell">{{ record.primaryRoute || '-' }}</span></template>
        </template>
      </BTable>
      <div v-if="!loading && !filteredRules.length" class="security-empty">{{ t('securityV2.common.noData') }}</div>
    </div>

    <section class="security-banner is-info">
      <span class="security-pill is-info">{{ t('securityV2.common.principle') }}</span>
      <div><strong>{{ t('securityV2.quality.principleTitle') }}</strong><p>{{ t('securityV2.quality.principleDesc') }}</p></div>
    </section>

    <BDrawer :open="drawerOpen" :title="t('securityV2.quality.drawerTitle', { code: activeRule?.ruleCode || '-' })" width="680px" :mobile-full-screen="true" body-padding="0" @close="drawerOpen = false">
      <div class="security-rule-drawer">
        <section class="security-rule-current">
          <div class="security-rule-current-head">
            <div>
              <strong>{{ activeRule?.ruleName || activeRule?.ruleCode || '-' }}</strong>
              <p>{{ activeRule?.description || '-' }}</p>
              <small v-if="activeRule?.hasOverride && activeRule?.reason">{{ t('securityV2.quality.currentReason', { reason: activeRule.reason }) }}</small>
            </div>
            <span class="security-pill is-neutral">
              {{ activeRule?.hasOverride ? t('securityV2.quality.publishedPolicy', { version: activeRule.policyVersion || 1 }) : t('securityV2.quality.systemDefault') }}
            </span>
          </div>
          <div class="security-rule-hit-route">
            <span>{{ t('securityV2.quality.primaryHitRoute', { days }) }}</span>
            <code>{{ activeRule?.primaryRoute || t('securityV2.quality.noPrimaryHitRoute') }}</code>
          </div>
        </section>

        <div class="security-rule-form">
          <label class="security-setting"><span>{{ t('securityV2.quality.mode') }}</span><BSelect v-model:value="draft.mode" :options="modeOptions" /></label>
          <label class="security-setting"><span>{{ t('securityV2.quality.scoreOverride') }}</span><BInput v-model:value="draft.scoreOverride" type="number" /></label>
          <label class="security-setting"><span>{{ t('securityV2.quality.routeScope') }}</span><BInput v-model:value="draft.routePattern" :placeholder="t('securityV2.quality.routePlaceholder')" /></label>
          <label class="security-setting"><span>{{ t('securityV2.quality.methodScope') }}</span><BSelect v-model:value="draft.requestMethod" :options="methodOptions" /></label>
          <label class="security-setting"><span>{{ t('securityV2.quality.fieldScope') }}</span><BInput v-model:value="draft.fieldPattern" :placeholder="t('securityV2.quality.fieldPlaceholder')" /></label>
          <label class="security-setting"><span>{{ t('securityV2.quality.expiry') }}</span><BDateTimePicker v-model:value="draft.expiresAt" :disabled="draft.permanent" /></label>
          <label class="security-setting is-wide"><span>{{ t('securityV2.quality.reason') }}</span><BInput v-model:value="draft.reason" :placeholder="t('securityV2.quality.reasonPlaceholder')" /></label>
          <BCheckbox v-model="draft.permanent" class="security-permanent-check">{{ t('securityV2.quality.permanentConfirm') }}</BCheckbox>
        </div>

        <section class="security-banner is-info security-rule-mode-guide">
          <span class="security-pill is-info">{{ t('securityV2.quality.modeGuide') }}</span>
          <div><strong>{{ t('securityV2.quality.modeGuideTitle') }}</strong><p>{{ t('securityV2.quality.modeGuideDesc') }}</p></div>
        </section>

        <section class="security-detail-section">
          <h4>{{ t('securityV2.quality.replayTitle') }}</h4>
          <div class="security-replay">
            <strong>{{ t('securityV2.quality.replayIntro', { count: replay.samples || 0, evaluated: replay.evaluatedSamples || 0 }) }}</strong>
            <p class="security-replay-note">{{ t('securityV2.quality.replayScopeHint') }}</p>
            <div class="security-replay-grid">
              <div><span>{{ t('securityV2.quality.falseReduced') }}</span><b class="is-success">{{ replay.projectedFalsePositiveBlocksRemoved || 0 }}</b></div>
              <div><span>{{ t('securityV2.quality.confirmedChange') }}</span><b>{{ replay.projectedConfirmedBlocksChanged || 0 }}</b></div>
              <div><span>{{ t('securityV2.quality.uncertain') }}</span><b class="is-warning">{{ replay.unknown || 0 }}</b></div>
            </div>
          </div>
        </section>
        <section v-if="replay.sampleDiffs?.length" class="security-detail-section">
          <h4>{{ t('securityV2.quality.sampleDiffTitle') }}</h4>
          <article v-for="sample in replay.sampleDiffs" :key="sample.eventId" class="security-evidence">
            <i :class="sample.outcome === 'unchanged' ? '' : 'is-success-dot'"></i>
            <div>
              <strong>{{ replayOutcome(sample.outcome) }}</strong>
              <p>{{ sample.requestMethod || '-' }} {{ sample.requestPath || '-' }} · {{ sample.matchedField || '-' }}</p>
              <code>{{ sample.matchedValuePreview || '-' }}</code>
            </div>
            <span class="security-pill" :class="dispositionClass(sample.disposition)">{{ dispositionLabel(sample.disposition) }}</span>
          </article>
        </section>
      </div>
      <footer class="security-detail-footer security-rule-footer">
        <BButton :loading="replayLoading" @click="runReplay">{{ t('securityV2.quality.runReplay') }}</BButton>
        <BButton type="primary" :loading="saving" @click="publishRule">{{ t('securityV2.quality.publish') }}</BButton>
      </footer>
    </BDrawer>
  </div>
</template>

<script lang="ts" setup>
  import { computed, onMounted, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { apiBasePost } from '@/http/request';
  import { securityCenterMessages } from './securityCenterI18n';

  const { t } = useI18n({ useScope: 'local', messages: securityCenterMessages });
  const rules = ref<any[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const replayLoading = ref(false);
  const keyword = ref('');
  const modeFilter = ref('all');
  const days = ref(7);
  const drawerOpen = ref(false);
  const activeRule = ref<any>(null);
  const replay = reactive<any>({ samples: 0, evaluatedSamples: 0, projectedFalsePositiveBlocksRemoved: 0, projectedConfirmedBlocksChanged: 0, unknown: 0, sampleDiffs: [] });
  const allScope = '*';
  const draft = reactive<any>({ mode: 'observe', scoreOverride: '', routePattern: allScope, requestMethod: allScope, fieldPattern: allScope, expiresAt: '', reason: '', permanent: false });
  type RuleMode = 'observe' | 'block' | 'off';
  const ruleModes = new Set<RuleMode>(['observe', 'block', 'off']);
  const number = (value: unknown) => Number(value || 0);
  const columns = computed(() => [
    { title: t('securityV2.quality.rule'), key: 'rule', width: 'minmax(230px,1.2fr)' },
    { title: t('securityV2.quality.mode'), key: 'mode', width: '115px' },
    { title: t('securityV2.quality.rawHits'), key: 'rawHits', width: '64px' },
    { title: t('securityV2.quality.confirmed'), key: 'confirmedHits', width: '64px' },
    { title: t('securityV2.quality.falseRate'), key: 'falseRate', width: '85px' },
    { title: t('securityV2.quality.primaryRoute'), key: 'primaryRoute', width: 'minmax(110px,.7fr)' },
  ]);
  const modeOptions = computed(() => [
    { value: 'observe', label: t('securityV2.common.observe') },
    { value: 'block', label: t('securityV2.common.block') },
    { value: 'off', label: t('securityV2.common.off') },
  ]);
  const modeFilterOptions = computed(() => [{ value: 'all', label: t('securityV2.quality.allModes') }, ...modeOptions.value]);
  const dayOptions = computed(() => [{ value: 7, label: t('securityV2.common.days7') }, { value: 30, label: t('securityV2.common.days30') }]);
  const methodOptions = computed(() => [
    { value: allScope, label: t('securityV2.quality.allMethods') },
    ...['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((value) => ({ value, label: value })),
  ]);
  const filteredRules = computed(() => rules.value.filter((rule) => {
    const key = keyword.value.trim().toLowerCase();
    return (modeFilter.value === 'all' || rule.mode === modeFilter.value) && (!key || `${rule.ruleCode} ${rule.ruleName}`.toLowerCase().includes(key));
  }));

  function falsePositiveClass(rate: unknown) { const value = number(rate); return value >= 50 ? 'is-danger' : value >= 20 ? 'is-warning' : 'is-success'; }
  function replayOutcome(outcome: string) { return t(`securityV2.quality.${outcome === 'no_longer_matched' ? 'noLongerMatched' : outcome === 'no_longer_blocked' ? 'noLongerBlocked' : outcome === 'would_participate_in_blocking' ? 'wouldBlock' : 'unchanged'}`); }
  function dispositionLabel(disposition: string) { return t(`securityV2.review.${disposition === 'false_positive' ? 'falsePositive' : disposition === 'confirmed_attack' ? 'confirmed' : disposition === 'authorized_test' ? 'authorized' : disposition === 'benign_anomaly' ? 'benign' : 'pending'}`); }
  function dispositionClass(disposition: string) { return disposition === 'confirmed_attack' ? 'is-danger' : disposition === 'false_positive' || disposition === 'authorized_test' ? 'is-success' : 'is-warning'; }
  function isRuleMode(value: unknown): value is RuleMode { return ruleModes.has(String(value) as RuleMode); }
  function scopeValue(value: unknown) { return String(value || '').trim() || allScope; }
  function serializeScope(value: unknown) {
    const normalized = String(value || '').trim();
    return normalized === allScope ? '' : normalized;
  }
  function buildRulePayload() {
    return {
      mode: draft.mode,
      scoreOverride: draft.scoreOverride,
      routePattern: serializeScope(draft.routePattern),
      requestMethod: serializeScope(draft.requestMethod),
      fieldPattern: serializeScope(draft.fieldPattern),
      expiresAt: draft.permanent ? null : draft.expiresAt,
      reason: String(draft.reason || '').trim(),
      permanent: draft.permanent,
    };
  }
  function openRule(rule: any, initialMode?: unknown) {
    if (!rule) return;
    activeRule.value = rule;
    const mode = isRuleMode(initialMode) ? initialMode : isRuleMode(rule.mode) ? rule.mode : 'observe';
    Object.assign(draft, {
      mode,
      scoreOverride: rule.effectiveScore ?? rule.scoreOverride ?? rule.baseScore ?? '',
      routePattern: scopeValue(rule.routePattern),
      requestMethod: scopeValue(rule.requestMethod).toUpperCase(),
      fieldPattern: scopeValue(rule.fieldPattern),
      expiresAt: rule.expiresAt || '',
      reason: '',
      permanent: !rule.expiresAt,
    });
    Object.assign(replay, { samples: 0, evaluatedSamples: 0, projectedFalsePositiveBlocksRemoved: 0, projectedConfirmedBlocksChanged: 0, unknown: 0, sampleDiffs: [] });
    drawerOpen.value = true;
  }
  function handleRuleRowClick(rule: any) { openRule(rule); }
  function handleModeChange(rule: any, mode: unknown) { openRule(rule, mode); }
  async function loadRules() {
    loading.value = true;
    const res = await apiBasePost('/api/security/v2/rules/quality', { days: days.value }, { silent: true }).catch(() => null).finally(() => { loading.value = false; });
    if (res?.status === 200) rules.value = res.data?.items || [];
  }
  async function runReplay() {
    if (!activeRule.value) return;
    replayLoading.value = true;
    const res = await apiBasePost(`/api/security/v2/rules/${encodeURIComponent(activeRule.value.ruleCode)}/replay`, buildRulePayload()).catch(() => null).finally(() => { replayLoading.value = false; });
    if (res?.status === 200) { Object.assign(replay, res.data || {}); message.success(t('securityV2.quality.replayed')); }
  }
  async function publishRule() {
    if (!activeRule.value || !draft.reason.trim() || (!draft.expiresAt && !draft.permanent)) { message.error(t('securityV2.quality.reasonPlaceholder')); return; }
    saving.value = true;
    const res = await apiBasePost(`/api/security/v2/rules/${encodeURIComponent(activeRule.value.ruleCode)}/override`, buildRulePayload()).catch(() => null).finally(() => { saving.value = false; });
    if (res?.status === 200) { message.success(res.msg || t('securityV2.quality.saved')); drawerOpen.value = false; loadRules(); }
  }
  onMounted(loadRules);
</script>

<style lang="less" scoped>
  @import './securityCenter.less';
</style>
