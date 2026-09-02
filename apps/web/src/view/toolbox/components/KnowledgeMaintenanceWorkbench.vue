<template>
  <section class="knowledge-maintenance" :aria-label="t(`toolbox.tool.${toolId}.name`)">
    <section v-if="user.role === 'visitor'" class="maintenance-guest">
      <span><SvgIcon :src="icon.toolbox.audit" size="34" /></span>
      <h2>{{ t('toolbox.maintenance.guestTitle') }}</h2>
      <p>{{ t('toolbox.maintenance.guestDescription') }}</p>
      <BButton type="primary" @click="router.push({ name: 'login' })">{{ t('toolbox.maintenance.login') }}</BButton>
    </section>

    <template v-else>
      <section class="maintenance-toolbar">
        <div class="maintenance-toolbar__info">
          <span><SvgIcon :src="icon.toolbox.local" size="18" /></span>
          <div>
            <strong>{{ t('toolbox.maintenance.readOnlyTitle') }}</strong>
            <small>{{ t('toolbox.maintenance.readOnlyDescription') }}</small>
          </div>
        </div>
        <div class="maintenance-toolbar__actions">
          <BButton size="small" :loading="loading" @click="loadOverview">
            <SvgIcon v-if="!loading" :src="icon.toolbox.rotate" size="14" />{{ t('toolbox.maintenance.refresh') }}
          </BButton>
        </div>
      </section>

      <section v-if="loading" class="maintenance-state">
        <BLoading inline :loading="true" :title="t('toolbox.maintenance.loading')" />
        <p>{{ t('toolbox.maintenance.loadingHint') }}</p>
      </section>
      <section v-else-if="loadError" class="maintenance-state is-error" role="alert">
        <span><SvgIcon :src="icon.toolbox.locate" size="24" /></span>
        <strong>{{ t('toolbox.maintenance.errorTitle') }}</strong>
        <p>{{ t('toolbox.maintenance.errorDescription') }}</p>
        <BButton size="small" @click="loadOverview">{{ t('common.retry') }}</BButton>
      </section>
      <section v-else-if="overview && overview.summary.total === 0" class="maintenance-state">
        <span><SvgIcon :src="icon.toolbox.audit" size="29" /></span>
        <strong>{{ t('toolbox.maintenance.emptyTitle') }}</strong>
        <p>{{ t('toolbox.maintenance.emptyDescription') }}</p>
        <BButton type="primary" @click="router.push('/noteLibrary')">{{
          t('toolbox.maintenance.createFirst')
        }}</BButton>
      </section>

      <template v-else-if="overview">
        <section class="audit-overview">
          <div class="audit-score" :style="scoreStyle">
            <div
              ><strong>{{ overview.summary.healthScore }}</strong
              ><span>/ 100</span></div
            >
            <small>{{ healthLabel }}</small>
          </div>
          <div class="audit-overview__copy">
            <BChip :tone="healthTone">{{ t('toolbox.maintenance.audit.completed') }}</BChip>
            <h2>{{ t('toolbox.maintenance.audit.title') }}</h2>
            <p>{{ t('toolbox.maintenance.audit.description', { count: overview.summary.total }) }}</p>
            <small>{{ t('toolbox.maintenance.scannedAt', { time: formatDateTime(overview.scannedAt) }) }}</small>
          </div>
          <div class="audit-overview__signal">
            <span>{{ t('toolbox.maintenance.audit.priorityIssues') }}</span>
            <strong>{{ highPriorityCount }}</strong>
            <small>{{ t('toolbox.maintenance.audit.priorityHint') }}</small>
          </div>
        </section>

        <section class="audit-facts">
          <article v-for="fact in auditFacts" :key="fact.key">
            <span><SvgIcon :src="fact.icon" size="17" /></span>
            <div
              ><small>{{ fact.label }}</small
              ><strong>{{ fact.value }}</strong></div
            >
            <p>{{ fact.description }}</p>
          </article>
        </section>

        <section v-if="actionableRecommendations.length" class="audit-recommendations">
          <header>
            <span class="maintenance-index">01</span>
            <div
              ><strong>{{ t('toolbox.maintenance.audit.actionsTitle') }}</strong
              ><small>{{ t('toolbox.maintenance.audit.actionsDescription') }}</small></div
            >
          </header>
          <div>
            <article v-for="(item, index) in actionableRecommendations" :key="item.code" :class="`is-${item.priority}`">
              <span>{{ index + 1 }}</span>
              <div
                ><strong>{{ t(`toolbox.maintenance.recommendation.${item.code}.title`) }}</strong
                ><p>{{
                  t(`toolbox.maintenance.recommendation.${item.code}.description`, { count: item.count })
                }}</p></div
              >
              <BChip :tone="item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'pending' : 'neutral'">{{
                item.count
              }}</BChip>
            </article>
          </div>
        </section>

        <section class="audit-issues">
          <header>
            <div>
              <span class="maintenance-index">02</span>
              <div
                ><strong>{{ t('toolbox.maintenance.audit.issuesTitle') }}</strong
                ><small>{{ t('toolbox.maintenance.audit.issuesDescription') }}</small></div
              >
            </div>
            <BChip tone="neutral">{{ filteredIssues.length }}</BChip>
          </header>
          <div class="audit-filter">
            <BChip
              v-for="option in issueFilters"
              :key="option.value"
              tone="neutral"
              interactive
              :selected="activeIssueKind === option.value"
              @click="selectIssueKind(option.value)"
            >
              {{ option.label }} · {{ option.count }}
            </BChip>
          </div>
          <div v-if="visibleIssues.length" class="audit-issue-list">
            <article v-for="item in visibleIssues" :key="`${item.kind}:${item.noteId}`" :class="`is-${item.severity}`">
              <span class="audit-issue-list__signal"><i></i></span>
              <div>
                <div
                  ><BChip :tone="issueTone(item.severity)">{{
                    t(`toolbox.maintenance.issue.${item.kind}.label`)
                  }}</BChip
                  ><strong>{{ item.title }}</strong></div
                >
                <p>{{ t(`toolbox.maintenance.issue.${item.kind}.description`) }}</p>
                <small>{{ item.path }}</small>
              </div>
              <BButton size="small" @click="openNote(item.noteId)">{{ t('toolbox.maintenance.openNote') }}</BButton>
            </article>
          </div>
          <div v-else class="audit-issues__empty">
            <SvgIcon :src="icon.toolbox.locate" size="24" />
            <span>{{ t('toolbox.maintenance.audit.noIssues') }}</span>
          </div>
          <BButton
            v-if="visibleIssues.length < filteredIssues.length"
            class="audit-load-more"
            @click="issueLimit += 30"
          >
            {{ t('toolbox.maintenance.audit.loadMore', { count: filteredIssues.length - visibleIssues.length }) }}
          </BButton>
        </section>
      </template>
    </template>
  </section>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import {
    fetchToolboxKnowledgeOverview,
    type ToolboxKnowledgeIssue,
    type ToolboxKnowledgeOverview,
  } from '@/api/toolbox';
  import icon from '@/config/icon';
  import { useUserStore } from '@/store';

  const props = defineProps<{ toolId: ToolboxToolId }>();
  const { t, locale } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const loading = ref(false);
  const loadError = ref(false);
  const overview = ref<ToolboxKnowledgeOverview | null>(null);
  const activeIssueKind = ref('all');
  const issueLimit = ref(30);

  const scoreStyle = computed(() => ({ '--audit-score': `${overview.value?.summary.healthScore || 0}%` }));
  const healthTone = computed(
    () =>
      ((overview.value?.summary.healthScore || 0) >= 80
        ? 'success'
        : (overview.value?.summary.healthScore || 0) >= 60
          ? 'pending'
          : 'danger') as 'success' | 'pending' | 'danger',
  );
  const healthLabel = computed(() => {
    const score = overview.value?.summary.healthScore || 0;
    return t(`toolbox.maintenance.audit.health.${score >= 80 ? 'good' : score >= 60 ? 'attention' : 'risk'}`);
  });
  const actionableIssues = computed(() => (overview.value?.issues || []).filter((item) => item.kind !== 'unlinked'));
  const actionableRecommendations = computed(() =>
    (overview.value?.recommendations || []).filter((item) => item.code !== 'build_links'),
  );
  const highPriorityCount = computed(() => actionableIssues.value.filter((item) => item.severity === 'high').length);
  const auditFacts = computed(() => {
    if (!overview.value) return [];
    const summary = overview.value.summary;
    return [
      {
        key: 'scale',
        icon: icon.toolbox.markdown,
        label: t('toolbox.maintenance.audit.fact.notes'),
        value: summary.total.toLocaleString(),
        description: t('toolbox.maintenance.audit.fact.roots', { count: summary.roots }),
      },
      {
        key: 'depth',
        icon: icon.toolbox.conceptMap,
        label: t('toolbox.maintenance.audit.fact.depth'),
        value: summary.maxDepth,
        description: t('toolbox.maintenance.audit.fact.depthHint'),
      },
      {
        key: 'tags',
        icon: icon.toolbox.locate,
        label: t('toolbox.maintenance.audit.fact.tagged'),
        value: `${summary.tagged}/${summary.total}`,
        description: t('toolbox.maintenance.audit.fact.taggedHint'),
      },
    ];
  });
  const issueKindOrder = ['empty', 'invalid_parent', 'duplicate_title', 'untitled', 'deep', 'untagged', 'stale'];
  const issueFilters = computed(() => {
    if (!overview.value) return [];
    return [
      { value: 'all', label: t('toolbox.maintenance.issue.all'), count: actionableIssues.value.length },
      ...issueKindOrder
        .filter((kind) => Number(overview.value?.issueCounts[kind] || 0) > 0)
        .map((kind) => ({
          value: kind,
          label: t(`toolbox.maintenance.issue.${kind}.label`),
          count: Number(overview.value?.issueCounts[kind] || 0),
        })),
    ];
  });
  const filteredIssues = computed(() =>
    actionableIssues.value.filter((item) => activeIssueKind.value === 'all' || item.kind === activeIssueKind.value),
  );
  const visibleIssues = computed(() => filteredIssues.value.slice(0, issueLimit.value));
  function selectIssueKind(kind: string) {
    activeIssueKind.value = kind;
    issueLimit.value = 30;
  }

  function issueTone(severity: ToolboxKnowledgeIssue['severity']) {
    return severity === 'high' ? 'danger' : severity === 'medium' ? 'pending' : 'neutral';
  }

  function formatDateTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function openNote(noteId: string) {
    const href = router.resolve({
      path: `/noteLibrary/${encodeURIComponent(noteId)}`,
      query: { from: route.fullPath },
    }).href;
    window.open(href, '_blank', 'noopener,noreferrer');
  }

  async function loadOverview() {
    if (user.role === 'visitor' || loading.value) return;
    loading.value = true;
    loadError.value = false;
    try {
      overview.value = await fetchToolboxKnowledgeOverview();
      activeIssueKind.value = 'all';
      issueLimit.value = 30;
    } catch {
      loadError.value = true;
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => void loadOverview());
</script>

<style scoped lang="less">
  .knowledge-maintenance {
    display: grid;
    gap: 16px;
  }

  .maintenance-guest,
  .maintenance-state {
    min-height: 420px;
    padding: 32px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 17px;
    background: radial-gradient(circle at 50% 18%, rgba(97, 92, 237, 0.1), transparent 35%), var(--card-background);
    text-align: center;
  }

  .maintenance-guest > span,
  .maintenance-state > span {
    width: 62px;
    height: 62px;
    display: grid;
    place-items: center;
    border-radius: 18px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .maintenance-guest h2,
  .maintenance-guest p,
  .maintenance-state p {
    margin: 0;
  }
  .maintenance-guest p,
  .maintenance-state p {
    max-width: 560px;
    color: var(--desc-color);
    line-height: 1.7;
  }
  .maintenance-state.is-error > span {
    color: var(--danger-color);
  }

  .maintenance-toolbar {
    padding: 11px 13px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
  }

  .maintenance-toolbar__info,
  .maintenance-toolbar__actions {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .maintenance-toolbar__info > span {
    width: 34px;
    height: 34px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 10px;
    color: var(--success-color);
    background: var(--card-background);
  }

  .maintenance-toolbar__info > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .maintenance-toolbar__actions {
    flex: 0 0 auto;
  }
  .maintenance-toolbar small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .audit-overview {
    min-height: 190px;
    padding: clamp(22px, 3vw, 36px);
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: clamp(20px, 4vw, 46px);
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 19px;
    background:
      radial-gradient(circle at 85% 20%, rgba(38, 174, 132, 0.13), transparent 28%),
      radial-gradient(circle at 12% 85%, rgba(97, 92, 237, 0.1), transparent 32%), var(--card-background);
  }

  .audit-score {
    position: relative;
    width: 126px;
    height: 126px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: conic-gradient(var(--success-color) var(--audit-score), var(--workspace-panel-bg-color) 0);
  }

  .audit-score::before {
    position: absolute;
    inset: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: inherit;
    background: var(--card-background);
    content: '';
  }

  .audit-score > div,
  .audit-score > small {
    position: relative;
    z-index: 1;
  }
  .audit-score > div {
    margin-top: 12px;
    display: flex;
    align-items: baseline;
    gap: 3px;
  }
  .audit-score strong {
    font-size: 35px;
    letter-spacing: -0.05em;
  }
  .audit-score span,
  .audit-score small {
    color: var(--desc-color);
    font-size: 10px;
  }
  .audit-score > small {
    margin-top: -24px;
  }

  .audit-overview__copy {
    display: grid;
    justify-items: start;
    gap: 8px;
  }
  .audit-overview__copy h2,
  .audit-overview__copy p {
    margin: 0;
  }
  .audit-overview__copy h2 {
    font-size: clamp(23px, 3vw, 33px);
    letter-spacing: -0.04em;
  }
  .audit-overview__copy p {
    max-width: 650px;
    color: var(--desc-color);
    line-height: 1.7;
  }
  .audit-overview__copy > small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .audit-overview__signal {
    min-width: 130px;
    padding: 14px;
    display: grid;
    gap: 5px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--card-background);
  }

  .audit-overview__signal span,
  .audit-overview__signal small {
    color: var(--desc-color);
    font-size: 10px;
  }
  .audit-overview__signal strong {
    color: var(--danger-color);
    font-size: 28px;
  }

  .audit-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 9px;
  }

  .audit-facts article {
    min-width: 0;
    padding: 13px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 8px 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--card-background);
  }

  .audit-facts article > span {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
  }

  .audit-facts article > div {
    display: grid;
    gap: 1px;
  }
  .audit-facts small,
  .audit-facts p {
    color: var(--desc-color);
    font-size: 10px;
  }
  .audit-facts strong {
    font-size: 19px;
  }
  .audit-facts p {
    grid-column: 1 / -1;
    margin: 0;
  }

  .audit-recommendations,
  .audit-issues {
    min-width: 0;
    padding: 15px;
    display: grid;
    gap: 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
  }

  .audit-recommendations > header,
  .audit-issues > header,
  .audit-issues > header > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .audit-recommendations > header,
  .audit-issues > header > div {
    justify-content: flex-start;
  }

  .audit-recommendations header > div,
  .audit-issues header > div > div {
    display: grid;
    gap: 2px;
  }
  .audit-recommendations header small,
  .audit-issues header small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .maintenance-index {
    width: 28px;
    height: 28px;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 8px;
    color: #fff;
    background: var(--primary-color);
    font-size: 10px;
    font-weight: 750;
  }

  .audit-recommendations > div {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .audit-recommendations article {
    min-width: 0;
    padding: 11px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: start;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }
  .audit-recommendations article > span {
    width: 25px;
    height: 25px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    color: var(--primary-color);
    background: var(--card-background);
    font-size: 10px;
    font-weight: 750;
  }
  .audit-recommendations article.is-high {
    border-left: 3px solid var(--danger-color);
  }
  .audit-recommendations article.is-medium {
    border-left: 3px solid var(--warning-color);
  }
  .audit-recommendations article > div {
    min-width: 0;
  }
  .audit-recommendations p {
    margin: 3px 0 0;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.55;
  }

  .audit-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .audit-issue-list {
    display: grid;
    gap: 7px;
  }
  .audit-issue-list article {
    min-width: 0;
    padding: 11px 12px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }
  .audit-issue-list article.is-high {
    border-left: 3px solid var(--danger-color);
  }
  .audit-issue-list article.is-medium {
    border-left: 3px solid var(--warning-color);
  }
  .audit-issue-list__signal {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    background: var(--card-background);
  }
  .audit-issue-list__signal i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--desc-color);
  }
  .is-high .audit-issue-list__signal i {
    background: var(--danger-color);
  }
  .is-medium .audit-issue-list__signal i {
    background: var(--warning-color);
  }
  .audit-issue-list article > div {
    min-width: 0;
    display: grid;
    gap: 5px;
  }
  .audit-issue-list article > div > div {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
  }
  .audit-issue-list p,
  .audit-issue-list small {
    margin: 0;
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.5;
  }
  .audit-issue-list small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .audit-load-more {
    margin: 0 auto;
  }
  .audit-issues__empty {
    min-height: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--desc-color);
  }

  @media (max-width: 900px) {
    .audit-overview {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .audit-overview__signal {
      grid-column: 1 / -1;
      grid-template-columns: 1fr auto;
      align-items: center;
    }
    .audit-overview__signal small {
      grid-column: 1 / -1;
    }
    .audit-facts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 767px) {
    .maintenance-toolbar,
    .audit-overview,
    .audit-issues > header {
      align-items: stretch;
      flex-direction: column;
    }
    .maintenance-toolbar__actions {
      width: 100%;
      align-items: center;
      justify-content: space-between;
    }
    .audit-overview {
      display: flex;
      text-align: left;
    }
    .audit-score {
      align-self: center;
    }
    .audit-facts,
    .audit-recommendations > div {
      grid-template-columns: 1fr;
    }
    .audit-issue-list article {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
    }
    .audit-issue-list article > .b_btn {
      grid-column: 2;
    }
  }

  html.light-note-mobile-rendering .audit-overview,
  html.light-note-mobile-rendering .audit-facts article,
  html.light-note-mobile-rendering .audit-recommendations,
  html.light-note-mobile-rendering .audit-issues {
    box-shadow: none;
  }
</style>
