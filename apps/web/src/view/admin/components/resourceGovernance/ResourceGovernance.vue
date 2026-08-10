<template>
  <AdminDataPage
    layout="scroll"
    eyebrow="Admin / Governance"
    :title="t('resourceGovernance.title')"
    :subtitle="t('resourceGovernance.subtitle')"
  >
    <template #actions>
      <BButton
        type="primary"
        :loading="scanStarting"
        :disabled="!capabilities.scanEnabled || scanActive"
        @click="startScan"
      >
        {{ scanActive ? t('resourceGovernance.scanning') : t('resourceGovernance.startScan') }}
      </BButton>
    </template>

    <template #metrics>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('resourceGovernance.metrics.total') }}</span>
        <strong>{{ summary.total }}</strong>
        <small>{{ latestScanText }}</small>
      </li>
      <li class="admin-stat-card is-safe">
        <span class="admin-stat-label">{{ t('resourceGovernance.metrics.safe') }}</span>
        <strong>{{ summary.safe }}</strong>
        <small>{{ t('resourceGovernance.safeGuardHint') }}</small>
      </li>
      <li class="admin-stat-card is-review">
        <span class="admin-stat-label">{{ t('resourceGovernance.metrics.review') }}</span>
        <strong>{{ summary.review }}</strong>
        <small>{{ t('resourceGovernance.reviewGuardHint') }}</small>
      </li>
      <li class="admin-stat-card">
        <span class="admin-stat-label">{{ t('resourceGovernance.metrics.space') }}</span>
        <strong>{{ formatBytes(summary.estimatedBytes) }}</strong>
        <small>{{ t('resourceGovernance.spaceEstimateHint') }}</small>
      </li>
    </template>

    <section v-if="latestScan" class="governance-scan" :class="`is-${latestScan.status}`">
      <div>
        <strong>{{ scanStatusLabel(latestScan.status) }}</strong>
        <p>{{ scanDescription }}</p>
      </div>
      <BChip
        :tone="latestScan.status === 'failed' ? 'danger' : latestScan.status === 'completed' ? 'success' : 'pending'"
      >
        {{ latestScan.status === 'running' ? t('resourceGovernance.workerRunning') : latestScan.status }}
      </BChip>
    </section>

    <section v-if="!capabilities.cleanupEnabled" class="governance-readonly-note">
      <strong>{{ t('resourceGovernance.readonlyTitle') }}</strong>
      <span>{{ t('resourceGovernance.readonlyDescription') }}</span>
    </section>

    <BTabs v-model:active-tab="activeTab" variant="segment" :options="tabOptions" @change="onTabChange" />

    <template v-if="activeTab === 'findings'">
      <div class="governance-toolbar">
        <BInput
          v-model:value="filters.keyword"
          :placeholder="t('resourceGovernance.searchPlaceholder')"
          @input="scheduleSearch"
        />
        <BSelect v-model:value="filters.riskLevel" :options="riskOptions" @change="reloadFindings" />
        <BSelect v-model:value="filters.resourceType" :options="resourceOptions" @change="reloadFindings" />
        <BButton :disabled="selectedIds.length === 0 || !capabilities.cleanupEnabled" @click="reviewCleanup">
          {{ t('resourceGovernance.cleanupSelected', { count: selectedIds.length }) }}
        </BButton>
      </div>

      <BTable
        v-if="!bookmark.isMobile"
        :data="findings"
        :columns="findingColumns"
        :loading="loading"
        row-key="id"
        :pagination="true"
        :total="findingTotal"
        :current-page="page"
        :page-size="pageSize"
        @page-change="changeFindingPage"
        @size-change="changeFindingPageSize"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'select'">
            <BCheckbox
              :checked="selectedIds.includes(record.id)"
              :disabled="!isFindingSelectable(record)"
              :aria-label="t('resourceGovernance.selectFinding')"
              @change="(checked) => toggleFinding(record, checked)"
            />
          </template>
          <template v-else-if="column.key === 'riskLevel'">
            <BChip :tone="riskTone(record.riskLevel)">{{ riskLabel(record.riskLevel) }}</BChip>
          </template>
          <template v-else-if="column.key === 'issueCode'">
            <BButton class="governance-link-button" @click="openInspector(record)">{{
              issueLabel(record.issueCode)
            }}</BButton>
          </template>
          <template v-else-if="column.key === 'estimatedBytes'">{{ formatBytes(record.estimatedBytes) }}</template>
          <template v-else-if="column.key === 'lastVerifiedAt'">{{ formatTime(record.lastVerifiedAt) }}</template>
        </template>
      </BTable>

      <div v-else class="governance-mobile-list">
        <article
          v-for="finding in findings"
          :key="finding.id"
          class="governance-mobile-card"
          @click="openInspector(finding)"
        >
          <div class="governance-mobile-card__head">
            <BChip :tone="riskTone(finding.riskLevel)">{{ riskLabel(finding.riskLevel) }}</BChip>
            <BCheckbox
              :checked="selectedIds.includes(finding.id)"
              :disabled="!isFindingSelectable(finding)"
              :aria-label="t('resourceGovernance.selectFinding')"
              @click.stop
              @change="(checked) => toggleFinding(finding, checked)"
            />
          </div>
          <strong>{{ issueLabel(finding.issueCode) }}</strong>
          <span>{{ resourceLabel(finding.resourceType) }} · {{ maskId(finding.targetId) }}</span>
          <small>{{ formatTime(finding.lastVerifiedAt) }} · {{ formatBytes(finding.estimatedBytes) }}</small>
        </article>
        <div class="governance-mobile-pagination">
          <BButton :disabled="page <= 1" @click="changeFindingPage(page - 1)">{{
            t('resourceGovernance.previousPage')
          }}</BButton>
          <span>{{ page }} / {{ Math.max(1, Math.ceil(findingTotal / pageSize)) }}</span>
          <BButton :disabled="page * pageSize >= findingTotal" @click="changeFindingPage(page + 1)">{{
            t('resourceGovernance.nextPage')
          }}</BButton>
        </div>
      </div>
    </template>

    <BTable
      v-else-if="activeTab === 'jobs' && !bookmark.isMobile"
      :data="jobs"
      :columns="jobColumns"
      :loading="loading"
      row-key="id"
      :pagination="true"
      :total="jobTotal"
      :current-page="page"
      :page-size="pageSize"
      @page-change="changeJobPage"
      @size-change="changeJobPageSize"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <BChip :tone="record.failed ? 'danger' : record.status === 'completed' ? 'success' : 'pending'">{{
            record.status
          }}</BChip>
        </template>
        <template v-else-if="column.key === 'result'"
          >{{ record.succeeded }} / {{ record.skipped }} / {{ record.failed }}</template
        >
        <template v-else-if="column.key === 'releasedBytes'">{{ formatBytes(record.releasedBytes) }}</template>
        <template v-else-if="column.key === 'createTime'">{{ formatTime(record.createTime) }}</template>
        <template v-else-if="column.key === 'actions'">
          <div class="governance-job-actions">
            <BButton v-if="record.status === 'pending'" @click="confirmCancelJob(record)">
              {{ t('resourceGovernance.cancelJob') }}
            </BButton>
            <BButton
              v-if="record.status === 'completed_with_errors' && record.failed > 0"
              :disabled="!capabilities.cleanupEnabled"
              @click="confirmRetryJob(record)"
            >
              {{ t('resourceGovernance.retryFailed') }}
            </BButton>
          </div>
        </template>
      </template>
    </BTable>

    <div v-else-if="activeTab === 'jobs'" class="governance-mobile-list">
      <article v-for="job in jobs" :key="job.id" class="governance-mobile-card">
        <div class="governance-mobile-card__head">
          <BChip :tone="job.failed ? 'danger' : job.status === 'completed' ? 'success' : 'pending'">{{
            job.status
          }}</BChip>
          <small>{{ formatTime(job.createTime) }}</small>
        </div>
        <strong>{{ maskId(job.id) }}</strong>
        <span
          >{{ t('resourceGovernance.columns.result') }}：{{ job.succeeded }} / {{ job.skipped }} /
          {{ job.failed }}</span
        >
        <span>{{ t('resourceGovernance.columns.released') }}：{{ formatBytes(job.releasedBytes) }}</span>
        <div class="governance-job-actions">
          <BButton v-if="job.status === 'pending'" @click="confirmCancelJob(job)">{{
            t('resourceGovernance.cancelJob')
          }}</BButton>
          <BButton
            v-if="job.status === 'completed_with_errors' && job.failed > 0"
            :disabled="!capabilities.cleanupEnabled"
            @click="confirmRetryJob(job)"
          >
            {{ t('resourceGovernance.retryFailed') }}
          </BButton>
        </div>
      </article>
      <div class="governance-mobile-pagination">
        <BButton :disabled="page <= 1" @click="changeJobPage(page - 1)">{{
          t('resourceGovernance.previousPage')
        }}</BButton>
        <span>{{ page }} / {{ Math.max(1, Math.ceil(jobTotal / pageSize)) }}</span>
        <BButton :disabled="page * pageSize >= jobTotal" @click="changeJobPage(page + 1)">{{
          t('resourceGovernance.nextPage')
        }}</BButton>
      </div>
    </div>

    <BTable
      v-else-if="!bookmark.isMobile"
      :data="audits"
      :columns="auditColumns"
      :loading="loading"
      row-key="id"
      :pagination="true"
      :total="auditTotal"
      :current-page="page"
      :page-size="pageSize"
      @page-change="changeAuditPage"
      @size-change="changeAuditPageSize"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'outcome'">
          <BChip
            :tone="
              record.outcome.includes('fail') ? 'danger' : record.outcome.includes('complete') ? 'success' : 'neutral'
            "
          >
            {{ record.outcome }}
          </BChip>
        </template>
        <template v-else-if="column.key === 'createTime'">{{ formatTime(record.createTime) }}</template>
      </template>
    </BTable>

    <div v-else class="governance-mobile-list">
      <article v-for="audit in audits" :key="audit.id" class="governance-mobile-card">
        <div class="governance-mobile-card__head">
          <BChip
            :tone="
              audit.outcome.includes('fail') ? 'danger' : audit.outcome.includes('complete') ? 'success' : 'neutral'
            "
          >
            {{ audit.outcome }}
          </BChip>
          <small>{{ formatTime(audit.createTime) }}</small>
        </div>
        <strong>{{ audit.action }}</strong>
        <span>{{ audit.targetType }} · {{ maskId(audit.targetId) }}</span>
      </article>
      <div class="governance-mobile-pagination">
        <BButton :disabled="page <= 1" @click="changeAuditPage(page - 1)">{{
          t('resourceGovernance.previousPage')
        }}</BButton>
        <span>{{ page }} / {{ Math.max(1, Math.ceil(auditTotal / pageSize)) }}</span>
        <BButton :disabled="page * pageSize >= auditTotal" @click="changeAuditPage(page + 1)">{{
          t('resourceGovernance.nextPage')
        }}</BButton>
      </div>
    </div>

    <BDrawer
      :open="inspectorOpen"
      :title="t('resourceGovernance.inspectorTitle')"
      :width="bookmark.isMobile ? '100%' : '520px'"
      :mobile-full-screen="bookmark.isMobile"
      @close="closeInspector"
    >
      <div v-if="activeFinding" class="governance-inspector">
        <div class="governance-inspector__headline">
          <BChip :tone="riskTone(activeFinding.riskLevel)">{{ riskLabel(activeFinding.riskLevel) }}</BChip>
          <strong>{{ issueLabel(activeFinding.issueCode) }}</strong>
        </div>
        <dl>
          <div
            ><dt>{{ t('resourceGovernance.resourceType') }}</dt
            ><dd>{{ resourceLabel(activeFinding.resourceType) }}</dd></div
          >
          <div
            ><dt>{{ t('resourceGovernance.targetId') }}</dt
            ><dd>{{ maskId(activeFinding.targetId) }}</dd></div
          >
          <div
            ><dt>{{ t('resourceGovernance.ownerState') }}</dt
            ><dd>{{ ownerState(activeFinding) }}</dd></div
          >
          <div
            ><dt>{{ t('resourceGovernance.lastVerified') }}</dt
            ><dd>{{ formatTime(activeFinding.lastVerifiedAt) }}</dd></div
          >
        </dl>
        <section class="governance-evidence">
          <h3>{{ t('resourceGovernance.evidenceTitle') }}</h3>
          <div v-for="entry in evidenceEntries(activeFinding)" :key="entry[0]">
            <span>{{ entry[0] }}</span
            ><strong>{{ entry[1] }}</strong>
          </div>
        </section>
        <p class="governance-inspector__guard">{{ guardDescription(activeFinding) }}</p>
        <BButton
          v-if="activeFinding.state === 'open' && activeFinding.riskLevel !== 'safe'"
          @click="ignoreActiveFinding"
        >
          {{ t('resourceGovernance.ignoreFinding') }}
        </BButton>
      </div>
    </BDrawer>

    <BModal
      v-model:visible="cleanupConfirmOpen"
      :title="t('resourceGovernance.cleanupConfirmTitle')"
      :width="bookmark.isMobile ? '92%' : '520px'"
      :show-footer="false"
      :mask-closable="false"
      initial-focus=".governance-confirm-input input"
      @close="closeCleanupConfirm"
    >
      <div v-if="cleanupPreview" class="governance-confirm">
        <p>
          {{
            t('resourceGovernance.cleanupConfirmContent', {
              count: cleanupPreview.count,
              size: formatBytes(cleanupPreview.estimatedBytes),
            })
          }}
        </p>
        <div class="governance-confirm__phrase">
          <span>{{ t('resourceGovernance.cleanupPhraseLabel') }}</span>
          <strong>{{ cleanupPreview.confirmationPhrase }}</strong>
        </div>
        <BInput
          v-model:value="cleanupPhrase"
          class="governance-confirm-input"
          :placeholder="t('resourceGovernance.cleanupPhrasePlaceholder')"
          @keyup.enter="submitCleanup"
        />
        <div class="governance-confirm__actions">
          <BButton :disabled="cleanupSubmitting" @click="closeCleanupConfirm">{{ t('common.cancel') }}</BButton>
          <BButton
            type="danger"
            :loading="cleanupSubmitting"
            :disabled="cleanupPhrase.trim() !== cleanupPreview.confirmationPhrase"
            @click="submitCleanup"
          >
            {{ t('resourceGovernance.confirmCleanup') }}
          </BButton>
        </div>
      </div>
    </BModal>
  </AdminDataPage>
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import AdminDataPage from '@/components/admin/AdminDataPage.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { bookmarkStore } from '@/store';
  import {
    cancelGovernanceJob,
    createGovernanceCleanupJob,
    createGovernanceScan,
    getGovernanceScan,
    ignoreGovernanceFinding,
    previewGovernanceCleanup,
    queryGovernanceAudits,
    queryGovernanceFindings,
    queryGovernanceJobs,
    retryGovernanceJob,
  } from '@/api/resourceGovernance.ts';
  import type {
    GovernanceAudit,
    GovernanceCapabilities,
    GovernanceFinding,
    GovernanceJob,
    GovernanceRisk,
    GovernanceScan,
    GovernanceSummary,
  } from '@/types/resourceGovernance.ts';

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const activeTab = ref('findings');
  const loading = ref(false);
  const scanStarting = ref(false);
  const findings = ref<GovernanceFinding[]>([]);
  const jobs = ref<GovernanceJob[]>([]);
  const audits = ref<GovernanceAudit[]>([]);
  const findingTotal = ref(0);
  const jobTotal = ref(0);
  const auditTotal = ref(0);
  const page = ref(1);
  const pageSize = ref(20);
  const selectedIds = ref<string[]>([]);
  const latestScan = ref<GovernanceScan | null>(null);
  const capabilities = reactive<GovernanceCapabilities>({
    scanEnabled: true,
    cleanupEnabled: false,
    reviewCleanupEnabled: false,
  });
  const summary = reactive<GovernanceSummary>({ total: 0, safe: 0, review: 0, blocked: 0, estimatedBytes: 0 });
  const filters = reactive({ keyword: '', riskLevel: '', resourceType: '' });
  const inspectorOpen = ref(false);
  const activeFinding = ref<GovernanceFinding | null>(null);
  const cleanupConfirmOpen = ref(false);
  const cleanupSubmitting = ref(false);
  const cleanupPhrase = ref('');
  const cleanupPreview = ref<{
    previewToken: string;
    confirmationPhrase: string;
    count: number;
    estimatedBytes: number;
  } | null>(null);
  let searchTimer: number | null = null;
  let scanTimer: number | null = null;

  const scanActive = computed(() => latestScan.value?.status === 'pending' || latestScan.value?.status === 'running');
  const latestScanText = computed(() =>
    latestScan.value?.finishedAt ? formatTime(latestScan.value.finishedAt) : t('resourceGovernance.notScanned'),
  );
  const scanDescription = computed(() => {
    if (!latestScan.value) return '';
    if (latestScan.value.status === 'failed')
      return `${t('resourceGovernance.scanFailed')} · ${latestScan.value.lastErrorCode || 'UNKNOWN'}`;
    if (scanActive.value) return t('resourceGovernance.scanProgressHint');
    return t('resourceGovernance.scanCompletedAt', { time: formatTime(latestScan.value.finishedAt) });
  });

  const tabOptions = computed(() => [
    { key: 'findings', label: t('resourceGovernance.tabs.findings'), badge: summary.total },
    { key: 'jobs', label: t('resourceGovernance.tabs.jobs'), badge: jobTotal.value },
    { key: 'audits', label: t('resourceGovernance.tabs.audits'), badge: auditTotal.value },
  ]);
  const riskOptions = computed(() => [
    { label: t('resourceGovernance.filters.allRisk'), value: '' },
    { label: riskLabel('safe'), value: 'safe' },
    { label: riskLabel('review'), value: 'review' },
    { label: riskLabel('blocked'), value: 'blocked' },
  ]);
  const resourceOptions = computed(() => [
    { label: t('resourceGovernance.filters.allResources'), value: '' },
    ...['image', 'bookmark', 'note', 'file', 'folder', 'todo', 'account_job'].map((value) => ({
      label: resourceLabel(value),
      value,
    })),
  ]);
  const findingColumns = computed(() => [
    { title: '', key: 'select', width: '44px', ellipsis: false },
    { title: t('resourceGovernance.columns.issue'), key: 'issueCode', width: '1.4fr' },
    { title: t('resourceGovernance.columns.resource'), key: 'resourceType', width: '110px' },
    { title: t('resourceGovernance.columns.risk'), key: 'riskLevel', width: '110px' },
    { title: t('resourceGovernance.columns.target'), key: 'targetId', width: '1fr' },
    { title: t('resourceGovernance.columns.space'), key: 'estimatedBytes', width: '100px' },
    { title: t('resourceGovernance.columns.verified'), key: 'lastVerifiedAt', width: '150px' },
  ]);
  const jobColumns = computed(() => [
    { title: t('resourceGovernance.columns.job'), key: 'id', width: '1fr' },
    { title: t('resourceGovernance.columns.status'), key: 'status', width: '150px' },
    { title: t('resourceGovernance.columns.result'), key: 'result', width: '130px' },
    { title: t('resourceGovernance.columns.released'), key: 'releasedBytes', width: '110px' },
    { title: t('resourceGovernance.columns.created'), key: 'createTime', width: '160px' },
    { title: t('resourceGovernance.columns.actions'), key: 'actions', width: '130px', ellipsis: false },
  ]);
  const auditColumns = computed(() => [
    { title: t('resourceGovernance.columns.action'), key: 'action', width: '1fr' },
    { title: t('resourceGovernance.columns.target'), key: 'targetId', width: '1fr' },
    { title: t('resourceGovernance.columns.outcome'), key: 'outcome', width: '150px' },
    { title: t('resourceGovernance.columns.created'), key: 'createTime', width: '160px' },
  ]);

  function riskLabel(risk: GovernanceRisk) {
    return t(`resourceGovernance.risk.${risk}`);
  }
  function riskTone(risk: GovernanceRisk): 'success' | 'pending' | 'danger' {
    return risk === 'safe' ? 'success' : risk === 'review' ? 'pending' : 'danger';
  }
  function resourceLabel(type: string) {
    return t(`resourceGovernance.resource.${type}`);
  }
  function issueLabel(code: string) {
    return t(`resourceGovernance.issue.${code}`);
  }
  function scanStatusLabel(status: string) {
    return t(`resourceGovernance.scanStatus.${status}`);
  }
  function formatBytes(value?: number) {
    const bytes = Number(value || 0);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  }
  function formatTime(value?: string | null) {
    return value ? new Date(value).toLocaleString() : '—';
  }
  function maskId(value?: string | null) {
    const id = String(value || '—');
    return id.length > 20 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
  }
  function isFindingSelectable(finding: GovernanceFinding) {
    return (
      capabilities.cleanupEnabled &&
      finding.state === 'open' &&
      finding.riskLevel === 'safe' &&
      finding.issueCode === 'LOCAL_IMAGE_UNREFERENCED'
    );
  }
  function toggleFinding(finding: GovernanceFinding, checked: boolean) {
    if (!isFindingSelectable(finding)) return;
    selectedIds.value = checked
      ? [...new Set([...selectedIds.value, finding.id])]
      : selectedIds.value.filter((id) => id !== finding.id);
  }

  async function reloadFindings() {
    loading.value = true;
    try {
      const response = await queryGovernanceFindings({ page: page.value, pageSize: pageSize.value, ...filters });
      if (response.status !== 200) return;
      findings.value = response.data.items || [];
      findingTotal.value = response.data.total || 0;
      Object.assign(summary, response.data.summary || {});
      Object.assign(capabilities, response.data.capabilities || {});
      latestScan.value = response.data.latestScan || null;
      selectedIds.value = selectedIds.value.filter((id) =>
        findings.value.some((finding) => finding.id === id && isFindingSelectable(finding)),
      );
      syncScanPolling();
    } finally {
      loading.value = false;
    }
  }
  async function reloadJobs() {
    loading.value = true;
    try {
      const response = await queryGovernanceJobs(page.value, pageSize.value);
      if (response.status === 200) {
        jobs.value = response.data.items || [];
        jobTotal.value = response.data.total || 0;
      }
    } finally {
      loading.value = false;
    }
  }
  async function reloadAudits() {
    loading.value = true;
    try {
      const response = await queryGovernanceAudits(page.value, pageSize.value);
      if (response.status === 200) {
        audits.value = response.data.items || [];
        auditTotal.value = response.data.total || 0;
      }
    } finally {
      loading.value = false;
    }
  }
  function scheduleSearch() {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      page.value = 1;
      reloadFindings();
    }, 400);
  }
  function onTabChange() {
    page.value = 1;
    activeTab.value === 'findings' ? reloadFindings() : activeTab.value === 'jobs' ? reloadJobs() : reloadAudits();
  }
  function changeFindingPage(value: number) {
    page.value = value;
    reloadFindings();
  }
  function changeFindingPageSize(_current: number, size: number) {
    page.value = 1;
    pageSize.value = size;
    reloadFindings();
  }
  function changeJobPage(value: number) {
    page.value = value;
    reloadJobs();
  }
  function changeJobPageSize(_current: number, size: number) {
    page.value = 1;
    pageSize.value = size;
    reloadJobs();
  }
  function changeAuditPage(value: number) {
    page.value = value;
    reloadAudits();
  }
  function changeAuditPageSize(_current: number, size: number) {
    page.value = 1;
    pageSize.value = size;
    reloadAudits();
  }

  async function startScan() {
    scanStarting.value = true;
    try {
      const response = await createGovernanceScan();
      if (response.status === 200) {
        latestScan.value = {
          id: response.data.id,
          status: response.data.status,
          createTime: new Date().toISOString(),
        } as GovernanceScan;
        message.success(
          response.data.reused ? t('resourceGovernance.scanAlreadyQueued') : t('resourceGovernance.scanQueued'),
        );
        syncScanPolling();
      }
    } finally {
      scanStarting.value = false;
    }
  }
  function syncScanPolling() {
    if (scanTimer) {
      window.clearTimeout(scanTimer);
      scanTimer = null;
    }
    if (!scanActive.value || !latestScan.value?.id) return;
    scanTimer = window.setTimeout(async () => {
      const response = await getGovernanceScan(latestScan.value!.id);
      if (response.status === 200) latestScan.value = response.data;
      if (scanActive.value) syncScanPolling();
      else await reloadFindings();
    }, 1800);
  }

  async function reviewCleanup() {
    if (!selectedIds.value.length) return;
    const preview = await previewGovernanceCleanup(selectedIds.value);
    if (preview.status !== 200) return;
    cleanupPreview.value = preview.data;
    cleanupPhrase.value = '';
    cleanupConfirmOpen.value = true;
  }
  function closeCleanupConfirm() {
    if (cleanupSubmitting.value) return;
    cleanupConfirmOpen.value = false;
    cleanupPreview.value = null;
    cleanupPhrase.value = '';
  }
  async function submitCleanup() {
    const preview = cleanupPreview.value;
    if (!preview || cleanupSubmitting.value || cleanupPhrase.value.trim() !== preview.confirmationPhrase) return;
    cleanupSubmitting.value = true;
    try {
      const result = await createGovernanceCleanupJob(preview.previewToken, cleanupPhrase.value.trim());
      if (result.status === 200) {
        selectedIds.value = [];
        cleanupConfirmOpen.value = false;
        cleanupPreview.value = null;
        cleanupPhrase.value = '';
        message.success(t('resourceGovernance.cleanupQueued'));
        await reloadFindings();
      }
    } finally {
      cleanupSubmitting.value = false;
    }
  }
  function confirmCancelJob(job: GovernanceJob) {
    Alert.alert({
      title: t('resourceGovernance.cancelJobTitle'),
      content: t('resourceGovernance.cancelJobContent'),
      async onOk() {
        const response = await cancelGovernanceJob(job.id);
        if (response.status === 200) {
          message.success(t('resourceGovernance.jobCancelled'));
          await Promise.all([reloadJobs(), reloadFindings(), reloadAudits()]);
        }
      },
    });
  }
  function confirmRetryJob(job: GovernanceJob) {
    Alert.alert({
      title: t('resourceGovernance.retryJobTitle'),
      content: t('resourceGovernance.retryJobContent', { count: job.failed }),
      async onOk() {
        const response = await retryGovernanceJob(job.id);
        if (response.status === 200) {
          message.success(t('resourceGovernance.jobRetried'));
          await Promise.all([reloadJobs(), reloadFindings(), reloadAudits()]);
        }
      },
    });
  }
  function openInspector(finding: GovernanceFinding) {
    activeFinding.value = finding;
    inspectorOpen.value = true;
  }
  function closeInspector() {
    inspectorOpen.value = false;
    activeFinding.value = null;
  }
  function evidenceEntries(finding: GovernanceFinding) {
    return Object.entries(finding.evidenceJson || {})
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => [key, String(value)]);
  }
  function ownerState(finding: GovernanceFinding) {
    if (finding.evidenceJson?.ownerRowExists === false) return t('resourceGovernance.ownerMissing');
    if (finding.evidenceJson?.ownerSoftDeleted === true) return t('resourceGovernance.ownerSoftDeleted');
    return t('resourceGovernance.ownerNotApplicable');
  }
  function guardDescription(finding: GovernanceFinding) {
    if (finding.riskLevel === 'safe') return t('resourceGovernance.guardSafe');
    if (finding.riskLevel === 'review') return t('resourceGovernance.guardReview');
    return t('resourceGovernance.guardBlocked');
  }
  async function ignoreActiveFinding() {
    if (!activeFinding.value) return;
    const response = await ignoreGovernanceFinding(activeFinding.value.id, 'accepted_risk');
    if (response.status === 200) {
      message.success(t('resourceGovernance.ignored'));
      closeInspector();
      await reloadFindings();
    }
  }

  onMounted(async () => {
    await Promise.all([reloadFindings(), reloadJobs(), reloadAudits()]);
  });
  onBeforeUnmount(() => {
    if (searchTimer) window.clearTimeout(searchTimer);
    if (scanTimer) window.clearTimeout(scanTimer);
  });
</script>

<style scoped lang="less">
  .admin-stat-card {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .admin-stat-card strong {
    font-size: 26px;
    color: var(--text-color);
  }
  .admin-stat-card small {
    color: var(--desc-color);
    font-size: 11px;
  }
  .admin-stat-card.is-safe {
    border-color: var(--chip-success-border);
  }
  .admin-stat-card.is-review {
    border-color: var(--chip-pending-border);
  }
  .governance-scan,
  .governance-readonly-note {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 12px 14px;
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    background: var(--card-background, var(--background-color));
  }
  .governance-scan p {
    margin: 3px 0 0;
    color: var(--desc-color);
    font-size: 12px;
  }
  .governance-scan.is-running,
  .governance-scan.is-pending {
    border-color: var(--chip-pending-border);
  }
  .governance-scan.is-failed {
    border-color: var(--chip-danger-border);
  }
  .governance-readonly-note {
    justify-content: flex-start;
    color: var(--desc-color);
    background: var(--chip-neutral-bg);
  }
  .governance-readonly-note strong {
    color: var(--text-color);
  }
  .governance-toolbar {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 150px 160px auto;
    gap: 10px;
    margin-bottom: 12px;
  }
  .governance-link-button {
    padding: 0;
    justify-content: flex-start;
    color: var(--primary-color);
  }
  .governance-mobile-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .governance-mobile-card {
    padding: 13px;
    border: 1px solid var(--card-border-color);
    border-radius: 14px;
    background: var(--card-background, var(--background-color));
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .governance-mobile-card__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .governance-mobile-card span,
  .governance-mobile-card small {
    color: var(--desc-color);
  }
  .governance-mobile-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .governance-job-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .governance-inspector {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .governance-inspector__headline {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .governance-inspector dl {
    margin: 0;
    display: grid;
    gap: 10px;
  }
  .governance-inspector dl div,
  .governance-evidence div {
    display: grid;
    grid-template-columns: minmax(110px, 0.45fr) 1fr;
    gap: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--card-border-color);
  }
  .governance-inspector dt,
  .governance-evidence span {
    color: var(--desc-color);
  }
  .governance-inspector dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .governance-evidence h3 {
    margin: 0 0 12px;
  }
  .governance-evidence {
    display: grid;
    gap: 8px;
  }
  .governance-evidence strong {
    text-align: right;
    overflow-wrap: anywhere;
  }
  .governance-inspector__guard {
    margin: 0;
    padding: 12px;
    border-radius: 12px;
    background: var(--chip-neutral-bg);
    color: var(--desc-color);
    line-height: 1.65;
  }
  .governance-confirm {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .governance-confirm > p {
    margin: 0;
    color: var(--desc-color);
    line-height: 1.65;
  }
  .governance-confirm__phrase {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--chip-danger-border);
    border-radius: 12px;
    background: var(--chip-neutral-bg);
  }
  .governance-confirm__phrase span {
    color: var(--desc-color);
  }
  .governance-confirm__phrase strong {
    color: var(--text-color);
  }
  .governance-confirm__actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  @media (max-width: 900px) {
    .governance-toolbar {
      grid-template-columns: 1fr 1fr;
    }
    .governance-toolbar > :first-child {
      grid-column: 1 / -1;
    }
    .governance-readonly-note {
      align-items: flex-start;
      flex-direction: column;
    }
  }
</style>
