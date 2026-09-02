<template>
  <main ref="pageRef" class="toolbox-home" data-mobile-resource-scroll>
    <section class="toolbox-overview" :class="{ 'is-guest': isGuest }" aria-labelledby="toolbox-title">
      <div class="toolbox-overview__copy">
        <span class="toolbox-overview__eyebrow">
          <SvgIcon :src="icon.toolbox.home" size="15" />{{ t('toolbox.eyebrow') }}
        </span>
        <h1 id="toolbox-title">{{ t('toolbox.title') }}</h1>
        <p>{{ t('toolbox.subtitle') }}</p>
      </div>
      <div v-if="!isGuest" class="toolbox-overview__assets" role="group" :aria-label="t('toolbox.capabilityOverview')">
        <BButton class="toolbox-asset is-points" @click="router.push({ name: 'pointsUsage' })">
          <span class="toolbox-asset__icon" aria-hidden="true">
            <SvgIcon :src="icon.growth.coin" size="22" />
          </span>
          <span class="toolbox-asset__copy">
            <small>{{ t('toolbox.pointsBalance') }}</small>
            <strong>{{ growth?.points == null ? '—' : Number(growth.points).toLocaleString() }}</strong>
          </span>
        </BButton>
        <BButton class="toolbox-asset is-ai" @click="router.push({ name: 'aiUsage' })">
          <span class="toolbox-asset__icon" aria-hidden="true">
            <SvgIcon :src="icon.settings.ai" size="22" />
          </span>
          <span class="toolbox-asset__copy">
            <small>{{ t('toolbox.aiQuotaBalance') }}</small>
            <strong>{{ aiQuotaBalanceLabel }}</strong>
          </span>
        </BButton>
      </div>
    </section>

    <section v-if="isGuest" class="toolbox-guest-guide" aria-labelledby="toolbox-guest-title">
      <span class="toolbox-guest-guide__icon"><SvgIcon :src="icon.noteDetail.history" size="22" /></span>
      <div>
        <h2 id="toolbox-guest-title">{{ t('toolbox.home.guestTitle') }}</h2>
        <p>{{ t('toolbox.home.guestDescription') }}</p>
      </div>
      <BButton type="primary" @click="router.push({ name: 'login' })">{{ t('toolbox.home.guestAction') }}</BButton>
    </section>

    <section v-if="!isGuest" class="toolbox-section toolbox-continue" aria-labelledby="toolbox-continue-title">
      <header class="toolbox-section__head">
        <span>01</span>
        <h2 id="toolbox-continue-title">{{ t('toolbox.home.continueTitle') }}</h2>
        <p>{{ t('toolbox.home.continueDescription') }}</p>
      </header>
      <div v-if="overviewLoading" class="toolbox-home__state">
        <BLoading inline loading :title="t('common.loading')" />
      </div>
      <div v-else-if="overviewFailed" class="toolbox-home__state is-error" role="alert">
        <span class="toolbox-home__state-icon"><SvgIcon :src="icon.toolbox.audit" size="20" /></span>
        <span class="toolbox-home__state-copy">
          <strong>{{ t('toolbox.home.loadFailed') }}</strong>
          <small>{{ t('toolbox.home.loadFailedHint') }}</small>
        </span>
        <BButton size="small" @click="loadOverview">{{ t('common.retry') }}</BButton>
      </div>
      <div v-else-if="!hasContinue" class="toolbox-home__state is-empty">
        <span class="toolbox-home__state-icon"><SvgIcon :src="icon.toolbox.actionPlan" size="20" /></span>
        <span class="toolbox-home__state-copy">
          <strong>{{ t('toolbox.home.continueEmpty') }}</strong>
          <small>{{ t('toolbox.home.continueEmptyHint') }}</small>
        </span>
      </div>
      <div v-else class="toolbox-activity-grid">
        <BButton
          v-for="workspace in continueWorkspaces"
          :key="`workspace-${workspace.id}`"
          class="toolbox-activity-card is-workspace"
          @click="openWorkspace(workspace)"
        >
          <span class="toolbox-activity-card__icon">
            <SvgIcon :src="presentation(toolboxWorkspaceToolId(workspace.kind)).icon" size="21" />
          </span>
          <span class="toolbox-activity-card__copy">
            <span class="toolbox-activity-card__topline">
              <span class="toolbox-activity-card__badges">
                <BChip tone="neutral" class="toolbox-activity-card__type">
                  {{ toolName(toolboxWorkspaceToolId(workspace.kind)) }}
                </BChip>
                <BChip tone="success">{{ t('toolbox.workspace.status.active') }}</BChip>
              </span>
              <small>{{ formatRelativeDate(workspace.lastOpenedAt || workspace.updatedAt) }}</small>
            </span>
            <strong>{{ workspace.title }}</strong>
            <small>{{ t('toolbox.workspace.nextStep') }}</small>
            <span>{{ workspace.nextStep || t('toolbox.workspace.noNextStep') }}</span>
            <small>
              {{
                t('toolbox.home.workspaceMeta', {
                  resources: workspace.resourceCount,
                  open: workspace.openItemCount,
                })
              }}
            </small>
          </span>
          <span class="toolbox-activity-card__action">
            {{ workspace.nextStep ? t('toolbox.home.continueAction') : t('toolbox.home.addNextStepAction') }}
          </span>
        </BButton>
        <BButton
          v-for="job in continueJobs"
          :key="`task-${job.id}`"
          class="toolbox-activity-card is-task"
          :class="{ 'is-ready': isReadyTask(job) }"
          @click="openTask(job)"
        >
          <span class="toolbox-activity-card__icon">
            <SvgIcon :src="presentation(job.toolId).icon" size="21" />
          </span>
          <span class="toolbox-activity-card__copy">
            <span class="toolbox-activity-card__topline">
              <BChip :tone="jobTone(job.status)">{{ taskStateLabel(job) }}</BChip>
              <small>{{ formatRelativeDate(job.updatedAt) }}</small>
            </span>
            <strong>{{ job.artifact?.title || toolName(job.toolId) }}</strong>
            <span>{{ taskContinueDescription(job) }}</span>
            <small>{{ toolName(job.toolId) }}</small>
          </span>
          <span class="toolbox-activity-card__action">
            {{ isReadyTask(job) ? t('toolbox.home.viewResultAction') : t('toolbox.home.viewProgressAction') }}
          </span>
        </BButton>
      </div>
    </section>

    <section class="toolbox-section toolbox-start toolbox-outcomes" aria-labelledby="toolbox-outcomes-title">
      <header class="toolbox-section__head">
        <span>{{ isGuest ? '01' : '02' }}</span>
        <h2 id="toolbox-outcomes-title">{{ t('toolbox.home.outcomesTitle') }}</h2>
        <p>{{ t('toolbox.home.outcomesDescription') }}</p>
      </header>
      <div class="toolbox-start-content">
        <div v-if="catalogLoading" class="toolbox-home__state">
          <BLoading inline loading :title="t('common.loading')" />
        </div>
        <div v-else-if="catalogFailed" class="toolbox-home__state is-error" role="alert">
          <span class="toolbox-home__state-copy">
            <strong>{{ t('toolbox.home.loadFailed') }}</strong>
            <small>{{ t('toolbox.home.loadFailedHint') }}</small>
          </span>
          <BButton size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
        </div>
        <div v-else class="toolbox-start-grid">
          <BButton
            v-for="tool in primaryOutcomeTools"
            :key="'outcome-' + tool.id"
            class="toolbox-start-card"
            :class="'is-' + presentation(tool.id).accent"
            :aria-label="toolAccessibleLabel(tool)"
            @click="openTool(tool)"
          >
            <span class="toolbox-start-card__icon">
              <SvgIcon :src="presentation(tool.id).icon" size="22" />
            </span>
            <span class="toolbox-start-card__copy">
              <span class="toolbox-start-card__meta">
                <BChip tone="neutral">
                  {{ t('toolbox.tool.' + tool.id + '.output') }}
                </BChip>
              </span>
              <strong>{{ toolName(tool.id) }}</strong>
              <small>{{ toolDescription(tool.id) }}</small>
            </span>
            <span class="toolbox-start-card__action">
              {{ t('toolbox.home.startOutcomeAction') }}
            </span>
          </BButton>
        </div>
      </div>
    </section>

    <section class="toolbox-section toolbox-quick" aria-labelledby="toolbox-quick-title">
      <header class="toolbox-section__head">
        <span>{{ isGuest ? '02' : '03' }}</span>
        <h2 id="toolbox-quick-title">{{ t('toolbox.home.quickTitle') }}</h2>
        <p>{{ t('toolbox.home.quickDescription') }}</p>
      </header>
      <div class="toolbox-quick__switch" :aria-label="t('toolbox.home.quickViewLabel')">
        <BChip tone="neutral" interactive :selected="quickView === 'common'" @click="quickView = 'common'">
          {{ t('toolbox.home.quickCommon') }}
        </BChip>
        <BChip tone="neutral" interactive :selected="quickView === 'recent'" @click="quickView = 'recent'">
          {{ t('toolbox.home.quickRecent') }}
        </BChip>
      </div>
      <div v-if="catalogLoading" class="toolbox-home__state">
        <BLoading inline loading :title="t('common.loading')" />
      </div>
      <div v-else-if="catalogFailed" class="toolbox-home__state is-error" role="alert">
        <span class="toolbox-home__state-copy">
          <strong>{{ t('toolbox.home.loadFailed') }}</strong>
          <small>{{ t('toolbox.home.loadFailedHint') }}</small>
        </span>
        <BButton size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
      </div>
      <div v-else-if="quickView === 'common' && quickTools.length" class="toolbox-quick-grid">
        <BButton
          v-for="tool in quickTools"
          :key="`quick-${tool.id}`"
          class="toolbox-quick-card"
          :class="`is-${presentation(tool.id).accent}`"
          @click="openTool(tool)"
        >
          <span class="toolbox-quick-card__icon"><SvgIcon :src="presentation(tool.id).icon" size="21" /></span>
          <span class="toolbox-quick-card__copy">
            <strong>{{ toolName(tool.id) }}</strong>
            <small>{{ billingLabel(tool) }}</small>
          </span>
        </BButton>
      </div>
      <div v-else-if="quickView === 'common'" class="toolbox-home__state is-empty">
        <span class="toolbox-home__state-copy">
          <strong>{{ t('toolbox.home.quickEmpty') }}</strong>
          <small>{{ t('toolbox.home.quickEmptyHint') }}</small>
        </span>
      </div>
      <div v-else-if="overviewLoading && !recentEntries.length" class="toolbox-home__state">
        <BLoading inline loading :title="t('common.loading')" />
      </div>
      <div v-else-if="overviewFailed && !recentEntries.length" class="toolbox-home__state is-error" role="alert">
        <span class="toolbox-home__state-icon"><SvgIcon :src="icon.toolbox.audit" size="20" /></span>
        <span class="toolbox-home__state-copy">
          <strong>{{ t('toolbox.home.loadFailed') }}</strong>
          <small>{{ t('toolbox.home.loadFailedHint') }}</small>
        </span>
      </div>
      <div v-else-if="!recentEntries.length" class="toolbox-home__state is-empty">
        <span class="toolbox-home__state-icon"><SvgIcon :src="icon.common.time" size="20" /></span>
        <span class="toolbox-home__state-copy">
          <strong>{{ t('toolbox.home.recentEmpty') }}</strong>
          <small>{{ t('toolbox.home.recentEmptyHint') }}</small>
        </span>
      </div>
      <div v-else class="toolbox-recent-list">
        <BButton
          v-for="entry in recentEntries"
          :key="entry.key"
          class="toolbox-recent-row"
          @click="openRecentEntry(entry)"
        >
          <span class="toolbox-recent-row__icon"><SvgIcon :src="presentation(entry.toolId).icon" size="19" /></span>
          <span class="toolbox-recent-row__copy">
            <strong>{{ entry.title }}</strong>
            <small>{{ entry.detail }}</small>
          </span>
          <small class="toolbox-recent-row__time">{{ formatRelativeDate(entry.usedAt) }}</small>
        </BButton>
      </div>
    </section>

    <section class="toolbox-section toolbox-catalog" aria-labelledby="toolbox-catalog-title">
      <header class="toolbox-section__head toolbox-catalog__head">
        <span>{{ isGuest ? '03' : '04' }}</span>
        <h2 id="toolbox-catalog-title">{{ t('toolbox.home.allToolsTitle') }}</h2>
        <p>{{ t('toolbox.home.allToolsDescription') }}</p>
      </header>
      <div class="toolbox-group-filter" :aria-label="t('toolbox.home.toolCategoryLabel')">
        <BChip
          v-for="group in groupOptions"
          :key="group.value"
          tone="neutral"
          size="medium"
          interactive
          :selected="activeToolGroup === group.value"
          @click="navigateToToolGroup(group.value)"
        >
          {{ group.label }}
          <small>{{ groupToolCount(group.value) }}</small>
        </BChip>
      </div>
      <div class="toolbox-catalog__controls">
        <div class="toolbox-catalog__search">
          <BInput
            ref="searchInput"
            v-model:value="keyword"
            clearable
            :placeholder="t('toolbox.searchPlaceholder')"
            height="42px"
          >
            <template #prefix><SvgIcon :src="icon.navigation.search" size="18" /></template>
          </BInput>
          <span v-if="!keyword" aria-hidden="true">⌘ K</span>
        </div>
        <div class="toolbox-category-filter" :aria-label="t('toolbox.home.allToolsTitle')">
          <BChip
            v-for="category in categoryOptions"
            :key="category.value"
            tone="neutral"
            size="medium"
            interactive
            :selected="activeCategory === category.value"
            @click="activeCategory = category.value"
          >
            {{ category.label }}
          </BChip>
        </div>
      </div>
      <div v-if="catalogDegraded" class="toolbox-catalog__notice" role="status">
        <SvgIcon :src="icon.toolbox.audit" size="16" />
        <span>{{ t('toolbox.home.catalogFallback') }}</span>
        <BButton size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
      </div>
      <div v-if="catalogLoading" class="toolbox-home__state">
        <BLoading inline loading :title="t('common.loading')" />
      </div>
      <div v-else-if="catalogFailed" class="toolbox-home__state is-error" role="alert">
        <span>{{ t('common.requestFailedDescription') }}</span>
        <BButton size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
      </div>
      <div v-else-if="!visibleGroups.length" class="toolbox-home__state is-empty">
        <span>{{ t('toolbox.emptySearch') }}</span>
        <BButton size="small" @click="clearFilters">{{ t('toolbox.clearSearch') }}</BButton>
      </div>
      <div v-else class="toolbox-home-groups">
        <section
          v-for="group in visibleGroups"
          :key="group.id"
          :id="`toolbox-home-group-${group.id}`"
          class="toolbox-home-group"
          :class="[`is-${group.id}`, `is-${group.accent}`]"
          :aria-labelledby="`toolbox-group-${group.id}`"
        >
          <header class="toolbox-home-group__head">
            <span><SvgIcon :src="group.icon" size="20" /></span>
            <div>
              <h3 :id="`toolbox-group-${group.id}`">{{ t(`toolbox.homeGroup.${group.id}.title`) }}</h3>
              <p>{{ t(`toolbox.homeGroup.${group.id}.description`) }}</p>
            </div>
            <BChip tone="neutral">{{ t('toolbox.home.groupToolCount', { count: group.tools.length }) }}</BChip>
          </header>
          <div class="toolbox-grid">
            <div v-for="tool in group.tools" :key="tool.id" class="toolbox-card-wrap">
              <BButton
                class="toolbox-card"
                :class="`is-${presentation(tool.id).accent}`"
                :aria-label="toolAccessibleLabel(tool)"
                @click="openTool(tool)"
              >
                <span class="toolbox-card__icon"><SvgIcon :src="presentation(tool.id).icon" size="23" /></span>
                <span class="toolbox-card__copy">
                  <strong>{{ toolName(tool.id) }}</strong>
                  <span>{{ toolDescription(tool.id) }}</span>
                  <small>{{ t('toolbox.outputLabel') }} · {{ t('toolbox.tool.' + tool.id + '.output') }}</small>
                </span>
                <span class="toolbox-card__aside">
                  <BChip :tone="tool.billingMedium === 'free' ? 'success' : 'pending'">{{ billingLabel(tool) }}</BChip>
                </span>
              </BButton>
              <BTooltip
                v-if="!isGuest"
                class="toolbox-card__pin-wrap"
                :class="{ 'is-pinned': isPinned(tool.id) }"
                :title="t(isPinned(tool.id) ? 'toolbox.home.unpinTool' : 'toolbox.home.pinTool')"
              >
                <BButton
                  class="toolbox-card__pin"
                  :class="{ 'is-pinned': isPinned(tool.id) }"
                  :aria-label="t(isPinned(tool.id) ? 'toolbox.home.unpinTool' : 'toolbox.home.pinTool')"
                  @click.stop="togglePinnedTool(tool.id)"
                >
                  <SvgIcon :src="isPinned(tool.id) ? icon.contextMenu.unpin : icon.contextMenu.pin" size="15" />
                </BButton>
              </BTooltip>
            </div>
          </div>
        </section>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { TOOLBOX_TOOL_CATALOG, type ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import {
    fetchToolboxCatalog,
    fetchToolboxHome,
    type ToolboxCatalogItem,
    type ToolboxHomeOverview,
    type ToolboxHomeWorkspaceSummary,
    type ToolboxJob,
  } from '@/api/toolbox';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { formatAiQuotaTokens, useAiQuotaStatus } from '@/composables/useAiQuotaStatus';
  import { useGrowth } from '@/composables/useGrowth';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import icon from '@/config/icon';
  import {
    TOOLBOX_HOME_GROUPS,
    TOOLBOX_DEFAULT_QUICK_TOOL_IDS,
    TOOLBOX_PRIMARY_OUTCOME_TOOL_IDS,
    TOOLBOX_PRESENTATION,
    resolveToolboxQuickToolIds,
    toolboxToolPath,
    toolboxWorkspaceToolId,
  } from '@/config/toolbox';
  import { useUserStore } from '@/store';
  import {
    readToolboxRecentUses,
    recordToolboxRecentUse,
    toolboxRecentUseIdentityKey,
    type ToolboxRecentUse,
  } from '@/utils/toolboxRecentUse';
  import { restoreToolboxScrollSnapshot, saveToolboxScrollSnapshot } from '@/utils/toolboxNavigation';
  import {
    readToolboxPinnedTools,
    toggleToolboxPinnedTool,
    TOOLBOX_PINNED_TOOL_LIMIT,
  } from '@/utils/toolboxPinnedTools';

  type CategoryFilter = 'all' | 'free' | 'points';
  type QuickView = 'common' | 'recent';
  type ToolboxHomeGroupId = (typeof TOOLBOX_HOME_GROUPS)[number]['id'];
  type RecentEntry = {
    key: string;
    dedupeKey: string;
    toolId: string;
    title: string;
    detail: string;
    usedAt: string | number;
  };

  const { t, locale } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const { growth, load: loadGrowth } = useGrowth();
  const { status: aiQuotaStatus, load: loadAiQuota } = useAiQuotaStatus({ autoLoad: false });
  const tools = ref<ToolboxCatalogItem[]>([]);
  const overview = ref<ToolboxHomeOverview | null>(null);
  const localRecentUses = ref<ToolboxRecentUse[]>([]);
  const pinnedToolIds = ref<string[]>([]);
  const catalogLoading = ref(true);
  const catalogFailed = ref(false);
  const catalogDegraded = ref(false);
  const overviewLoading = ref(false);
  const overviewFailed = ref(false);
  const keyword = ref('');
  const activeCategory = ref<CategoryFilter>('all');
  const activeToolGroup = ref<ToolboxHomeGroupId>('workspace');
  const quickView = ref<QuickView>('common');
  const searchInput = ref<InstanceType<typeof BInput> | null>(null);
  const pageRef = ref<HTMLElement | null>(null);
  let overviewRequestVersion = 0;

  useMobileTopBar(['toolboxHome'], { searchMode: 'icon' });

  const isGuest = computed(() => !user.id || user.role === 'visitor');
  const identityKey = computed(() => toolboxRecentUseIdentityKey(user));
  const aiQuotaBalanceLabel = computed(() =>
    aiQuotaStatus.value?.exempt
      ? t('settings.ai.quotaUnlimited')
      : formatAiQuotaTokens(aiQuotaStatus.value?.availableRemaining ?? aiQuotaStatus.value?.remaining, locale.value),
  );
  const categoryOptions = computed(() => [
    { value: 'all' as const, label: t('toolbox.allTools') },
    { value: 'free' as const, label: t('toolbox.freeTools') },
    { value: 'points' as const, label: t('toolbox.pointsTools') },
  ]);
  const groupOptions = computed(() =>
    TOOLBOX_HOME_GROUPS.map((group) => ({
      value: group.id,
      label: t(`toolbox.homeGroup.${group.id}.title`),
    })),
  );
  const continueWorkspaces = computed(() => overview.value?.workspaces?.continue || []);
  const continueJobs = computed(() => {
    const seen = new Set<string>();
    return [...(overview.value?.tasks?.active || []), ...(overview.value?.tasks?.ready || [])].filter((job) => {
      if (seen.has(job.id)) return false;
      seen.add(job.id);
      return true;
    });
  });
  const hasContinue = computed(() => continueWorkspaces.value.length > 0 || continueJobs.value.length > 0);
  const enabledToolIds = computed(() => new Set(tools.value.map((tool) => tool.id)));
  const recentEntries = computed<RecentEntry[]>(() => {
    const workspaceEntries = (overview.value?.workspaces?.recent || []).map((workspace) => ({
      key: `workspace-${workspace.id}`,
      dedupeKey: `tool-${toolboxWorkspaceToolId(workspace.kind)}`,
      toolId: toolboxWorkspaceToolId(workspace.kind),
      title: toolName(toolboxWorkspaceToolId(workspace.kind)),
      detail: t('toolbox.home.lastWorkspace', { title: workspace.title }),
      usedAt: workspace.lastOpenedAt || workspace.updatedAt,
    }));
    const localEntries = localRecentUses.value.map((entry) => ({
      key: `local-${entry.toolId}`,
      dedupeKey: `tool-${entry.toolId}`,
      toolId: entry.toolId,
      title: toolName(entry.toolId),
      detail: t('toolbox.home.openToolAgain'),
      usedAt: entry.usedAt,
    }));
    const seen = new Set<string>();
    return [...workspaceEntries, ...localEntries]
      .filter((entry) => Number.isFinite(dateValue(entry.usedAt)))
      .sort((left, right) => dateValue(right.usedAt) - dateValue(left.usedAt))
      .filter((entry) => {
        if (seen.has(entry.dedupeKey)) return false;
        seen.add(entry.dedupeKey);
        return true;
      })
      .slice(0, 6);
  });
  const quickTools = computed(() => {
    const byId = new Map(tools.value.map((tool) => [tool.id, tool]));
    const candidates = resolveToolboxQuickToolIds(pinnedToolIds.value);
    const seen = new Set<string>();
    return candidates
      .map((toolId) => byId.get(toolId as ToolboxToolId))
      .filter((tool): tool is ToolboxCatalogItem => {
        if (!tool || seen.has(tool.id)) return false;
        if (
          isGuest.value &&
          tool.id !== TOOLBOX_DEFAULT_QUICK_TOOL_IDS[0] &&
          (tool.billingMedium !== 'free' || tool.executionMode !== 'browser')
        )
          return false;
        seen.add(tool.id);
        return true;
      })
      .slice(0, TOOLBOX_PINNED_TOOL_LIMIT);
  });
  const primaryOutcomeTools = computed(() => {
    const byId = new Map(tools.value.map((tool) => [tool.id, tool]));
    return TOOLBOX_PRIMARY_OUTCOME_TOOL_IDS.map((toolId) => byId.get(toolId)).filter(
      (tool): tool is ToolboxCatalogItem => Boolean(tool),
    );
  });
  const visibleTools = computed(() => {
    const query = keyword.value.trim().toLocaleLowerCase(locale.value);
    return tools.value.filter((tool) => {
      if (activeCategory.value === 'free' && tool.billingMedium !== 'free') return false;
      if (activeCategory.value === 'points' && tool.billingMedium === 'free') return false;
      if (!query) return true;
      return [toolName(tool.id), toolDescription(tool.id), t('toolbox.tool.' + tool.id + '.output')]
        .join(' ')
        .toLocaleLowerCase(locale.value)
        .includes(query);
    });
  });
  const visibleGroups = computed(() => {
    const byId = new Map(visibleTools.value.map((tool) => [tool.id, tool]));
    return TOOLBOX_HOME_GROUPS.map((group) => ({
      ...group,
      tools: group.toolIds.map((id) => byId.get(id)).filter((tool): tool is ToolboxCatalogItem => Boolean(tool)),
    })).filter((group) => group.tools.length > 0);
  });

  function groupToolCount(groupId: ToolboxHomeGroupId) {
    return visibleGroups.value.find((group) => group.id === groupId)?.tools.length || 0;
  }

  function navigateToToolGroup(groupId: ToolboxHomeGroupId) {
    activeToolGroup.value = groupId;
    document.getElementById(`toolbox-home-group-${groupId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function presentation(toolId: string) {
    return TOOLBOX_PRESENTATION[toolId as ToolboxToolId] || TOOLBOX_PRESENTATION.material_to_note;
  }
  const toolName = (toolId: string) => t('toolbox.tool.' + toolId + '.name');
  const toolDescription = (toolId: string) => t('toolbox.tool.' + toolId + '.description');
  function billingLabel(tool: ToolboxCatalogItem) {
    if (tool.price.kind !== 'free') {
      return tool.billingMedia.includes('ai_quota') ? t('toolbox.billingChoiceLabel') : t('toolbox.pointsLabel');
    }
    return tool.executionMode === 'service' ? t('toolbox.accountFreeLabel') : t('toolbox.localFreeLabel');
  }
  function toolAccessibleLabel(tool: ToolboxCatalogItem) {
    return `${toolName(tool.id)} · ${billingLabel(tool)}`;
  }
  function jobTone(status: ToolboxJob['status']): 'neutral' | 'success' | 'pending' | 'danger' {
    if (status === 'succeeded') return 'success';
    if (['queued', 'processing', 'partial_succeeded'].includes(status)) return 'pending';
    if (['failed', 'expired'].includes(status)) return 'danger';
    return 'neutral';
  }
  function isReadyTask(job: ToolboxJob) {
    return job.artifactState === 'ready' && ['unsaved', 'save_failed'].includes(job.save.status);
  }
  function taskStateLabel(job: ToolboxJob) {
    return isReadyTask(job) ? t('toolbox.home.resultReady') : t(`toolbox.task.${job.status}`);
  }
  function taskContinueDescription(job: ToolboxJob) {
    return isReadyTask(job) ? t('toolbox.home.resultReadyDescription') : t('toolbox.home.processingDescription');
  }
  function dateValue(value: string | number) {
    return typeof value === 'number' ? value : new Date(value).getTime();
  }
  function formatRelativeDate(value: string | number) {
    const timestamp = dateValue(value);
    if (!Number.isFinite(timestamp)) return '';
    const diff = timestamp - Date.now();
    const abs = Math.abs(diff);
    const formatter = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' });
    if (abs < 60_000) return formatter.format(0, 'second');
    if (abs < 3_600_000) return formatter.format(Math.round(diff / 60_000), 'minute');
    if (abs < 86_400_000) return formatter.format(Math.round(diff / 3_600_000), 'hour');
    if (abs < 604_800_000) return formatter.format(Math.round(diff / 86_400_000), 'day');
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(new Date(timestamp));
  }
  function clearFilters() {
    keyword.value = '';
    activeCategory.value = 'all';
    activeToolGroup.value = 'workspace';
  }
  function rememberHomeScroll() {
    saveToolboxScrollSnapshot({
      routeFullPath: '/toolbox',
      identityKey: identityKey.value,
      element: pageRef.value,
    });
  }
  function openTool(tool: ToolboxCatalogItem) {
    if (tool.executionMode === 'service' && isGuest.value && blockGuestWrite('toolbox-account')) return;
    if (tool.billingMedium !== 'free' && isGuest.value && blockGuestWrite('toolbox-paid')) return;
    recordToolboxRecentUse(user, tool.id);
    rememberHomeScroll();
    void router.push(toolboxToolPath(tool.id));
  }
  function openWorkspace(workspace: ToolboxHomeWorkspaceSummary) {
    recordToolboxRecentUse(user, toolboxWorkspaceToolId(workspace.kind));
    rememberHomeScroll();
    void router.push({
      path: toolboxToolPath(toolboxWorkspaceToolId(workspace.kind)),
      query: { workspace: workspace.id },
    });
  }
  function openTask(job: ToolboxJob) {
    recordToolboxRecentUse(user, job.toolId);
    rememberHomeScroll();
    void router.push(`/toolbox/task/${job.id}`);
  }
  function openRecentEntry(entry: RecentEntry) {
    recordToolboxRecentUse(user, entry.toolId);
    rememberHomeScroll();
    void router.push(toolboxToolPath(entry.toolId as ToolboxToolId));
  }
  function refreshPinnedTools() {
    pinnedToolIds.value = readToolboxPinnedTools(user, { allowedToolIds: enabledToolIds.value });
  }
  function isPinned(toolId: string) {
    return pinnedToolIds.value.includes(toolId);
  }
  function togglePinnedTool(toolId: string) {
    const result = toggleToolboxPinnedTool(user, toolId, { allowedToolIds: enabledToolIds.value });
    pinnedToolIds.value = result.toolIds;
    if (result.limitReached) message.warning(t('toolbox.home.pinLimit', { count: TOOLBOX_PINNED_TOOL_LIMIT }));
  }
  function refreshLocalRecentUses() {
    localRecentUses.value = readToolboxRecentUses(user, { allowedToolIds: enabledToolIds.value });
  }
  async function loadCatalog() {
    catalogLoading.value = true;
    catalogFailed.value = false;
    catalogDegraded.value = false;
    try {
      tools.value = (await fetchToolboxCatalog()).tools.filter((tool) => tool.availability.enabled);
      refreshLocalRecentUses();
      refreshPinnedTools();
    } catch {
      tools.value = TOOLBOX_TOOL_CATALOG.filter(
        (tool) => tool.availability.enabled && tool.executionMode === 'browser' && tool.billingMedium === 'free',
      ).map((tool) => ({
        ...tool,
        price: { kind: 'free' as const, currency: null, min: 0, max: 0 },
      }));
      catalogDegraded.value = true;
      catalogFailed.value = tools.value.length === 0;
      refreshLocalRecentUses();
      refreshPinnedTools();
    } finally {
      catalogLoading.value = false;
    }
  }
  async function loadOverview() {
    const version = ++overviewRequestVersion;
    if (isGuest.value) return;
    overviewLoading.value = true;
    overviewFailed.value = false;
    try {
      const result = await fetchToolboxHome();
      if (version === overviewRequestVersion) overview.value = result;
    } catch {
      if (version === overviewRequestVersion) overviewFailed.value = true;
    } finally {
      if (version === overviewRequestVersion) overviewLoading.value = false;
    }
  }
  function handleSearchShortcut(event: KeyboardEvent) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
      event.preventDefault();
      searchInput.value?.focus();
    }
  }

  watch(identityKey, () => {
    refreshLocalRecentUses();
    refreshPinnedTools();
    overview.value = null;
    if (isGuest.value) {
      overviewRequestVersion += 1;
      overviewLoading.value = false;
      overviewFailed.value = false;
    } else {
      void Promise.all([loadOverview(), loadGrowth(), loadAiQuota()]);
    }
  });
  async function initializeHome() {
    window.addEventListener('keydown', handleSearchShortcut);
    await Promise.all([
      loadCatalog(),
      isGuest.value ? Promise.resolve() : loadOverview(),
      isGuest.value ? Promise.resolve() : loadGrowth(),
      isGuest.value ? Promise.resolve() : loadAiQuota(),
    ]);
    await nextTick();
    window.requestAnimationFrame(() => {
      restoreToolboxScrollSnapshot({
        routeFullPath: '/toolbox',
        identityKey: identityKey.value,
        element: pageRef.value,
      });
    });
  }
  onMounted(() => {
    void initializeHome();
  });
  onBeforeUnmount(() => {
    overviewRequestVersion += 1;
    window.removeEventListener('keydown', handleSearchShortcut);
  });
</script>

<style scoped lang="less">
  @import './toolboxPageScroll.less';

  .toolbox-home {
    .toolbox-page-scroll();
    padding: 24px clamp(22px, 3.5vw, 54px) 56px;
    color: var(--text-color);
  }
  .toolbox-home > section {
    width: min(1720px, 100%);
    margin-right: auto;
    margin-left: auto;
  }
  .toolbox-overview {
    position: relative;
    min-height: 132px;
    padding: 20px 24px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(390px, 440px);
    align-items: center;
    gap: clamp(20px, 4vw, 48px);
    overflow: hidden;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--surface-border-color));
    border-radius: 21px;
    background:
      radial-gradient(
        circle at 92% 10%,
        color-mix(in srgb, var(--resource-note-color) 10%, transparent),
        transparent 34%
      ),
      linear-gradient(
        125deg,
        color-mix(in srgb, var(--primary-color) 6%, var(--card-background)),
        var(--card-background)
      );
    box-shadow: 0 22px 58px -48px color-mix(in srgb, var(--primary-color) 70%, transparent);
  }
  .toolbox-overview.is-guest {
    grid-template-columns: minmax(0, 1fr);
  }
  .toolbox-overview__copy {
    position: relative;
    z-index: 1;
    min-width: 0;
    display: grid;
    justify-items: start;
    gap: 6px;
  }
  .toolbox-overview__eyebrow,
  .toolbox-section__head > span:first-child {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
  .toolbox-overview h1 {
    margin: 0;
    font-size: clamp(31px, 2.7vw, 38px);
    font-weight: 780;
    letter-spacing: -0.052em;
    line-height: 1.08;
  }
  .toolbox-overview p {
    max-width: 700px;
    margin: 0;
    color: var(--desc-color);
    font-size: 12.5px;
    line-height: 1.6;
  }
  .toolbox-overview__assets {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }
  .toolbox-asset.b_btn {
    width: 100%;
    min-width: 0;
    min-height: 55px;
    height: auto;
    padding: 8px 10px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    color: var(--text-color);
    background: color-mix(in srgb, var(--card-background) 92%, transparent);
    line-height: 1.2;
    text-align: left;
  }
  .toolbox-asset__icon {
    width: 34px;
    height: 34px;
    padding: 6px;
    box-sizing: border-box;
    border: 1px solid #e8bd72;
    border-radius: 10px;
    color: #a34f00;
    background: #fff3dc;
  }
  .toolbox-asset.is-ai .toolbox-asset__icon {
    border-color: color-mix(in srgb, var(--primary-color) 40%, var(--surface-border-color));
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 9%, var(--card-background));
  }
  .toolbox-asset__copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .toolbox-asset__copy small,
  .toolbox-asset__copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-asset__copy small {
    color: var(--desc-color);
    font-size: 10px;
  }
  .toolbox-asset__copy strong {
    font-size: 13px;
  }
  .toolbox-guest-guide {
    min-height: 88px;
    margin-top: 22px;
    padding: 16px 18px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 14px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }
  .toolbox-guest-guide__icon,
  .toolbox-home__state-icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--surface-border-color));
    border-radius: 12px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
  }
  .toolbox-guest-guide h2 {
    margin: 0;
    font-size: 15px;
  }
  .toolbox-guest-guide p {
    margin: 4px 0 0;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.55;
  }
  .toolbox-section {
    margin-top: 25px;
  }
  .toolbox-section__head {
    margin-bottom: 12px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: end;
    gap: 2px 9px;
  }
  .toolbox-section__head > span:first-child {
    grid-row: 1 / 3;
    align-self: start;
    padding-top: 4px;
  }
  .toolbox-section__head h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 730;
    letter-spacing: -0.025em;
  }
  .toolbox-section__head p {
    margin: 0;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.55;
  }
  .toolbox-start-content {
    display: grid;
    gap: 14px;
  }
  .toolbox-start-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .toolbox-start-card.b_btn {
    --tool-accent: var(--primary-color);
    width: 100%;
    min-width: 0;
    min-height: 112px;
    height: auto;
    padding: 14px;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px 11px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--tool-accent) 24%, var(--surface-border-color));
    border-radius: 16px;
    color: var(--text-color);
    background: linear-gradient(
      145deg,
      color-mix(in srgb, var(--tool-accent) 5%, var(--card-background)),
      var(--card-background)
    );
    box-shadow: var(--surface-card-shadow);
    text-align: left;
    white-space: normal;
  }
  .toolbox-start-card.is-blue {
    --tool-accent: #3975d5;
  }
  .toolbox-start-card.is-amber {
    --tool-accent: #ad6b0d;
  }
  .toolbox-start-card.is-teal {
    --tool-accent: #07835f;
  }
  .toolbox-start-card.is-rose {
    --tool-accent: #c24b68;
  }
  .toolbox-start-card__icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tool-accent) 30%, var(--surface-border-color));
    border-radius: 12px;
    color: var(--tool-accent);
    background: var(--card-background);
  }
  .toolbox-start-card__copy {
    min-width: 0;
    display: grid;
    gap: 5px;
  }
  .toolbox-start-card__meta {
    min-height: 20px;
  }
  .toolbox-start-card__copy strong {
    font-size: 13.5px;
    line-height: 1.25;
  }
  .toolbox-start-card__copy > small {
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .toolbox-start-card__action {
    min-width: 0;
    grid-column: 1 / -1;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    color: var(--tool-accent);
    font-size: 10.5px;
    font-weight: 700;
  }
  .toolbox-quick-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 10px;
  }
  .toolbox-quick__switch,
  .toolbox-group-filter {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .toolbox-quick__switch {
    margin: -3px 0 11px 28px;
  }
  .toolbox-group-filter {
    position: sticky;
    top: 0;
    z-index: 6;
    margin: -3px 0 12px;
    padding: 9px 10px;
    flex-wrap: nowrap;
    overflow-x: auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: color-mix(in srgb, var(--card-background) 96%, transparent);
    box-shadow: 0 8px 22px -18px rgba(17, 19, 32, 0.5);
    backdrop-filter: blur(14px);
    overscroll-behavior-inline: contain;
  }
  .toolbox-group-filter :deep(.b-chip) {
    flex: 0 0 auto;
  }
  .toolbox-group-filter small {
    min-width: 17px;
    margin-left: 3px;
    padding: 1px 5px;
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--surface-muted-bg, var(--active-background-color));
    font-size: 9px;
    text-align: center;
  }
  .toolbox-quick-card.b_btn {
    --tool-accent: var(--primary-color);
    width: 100%;
    min-width: 0;
    min-height: 72px;
    height: auto;
    padding: 10px 12px;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    color: var(--text-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
    text-align: left;
  }
  .toolbox-quick-card.is-amber {
    --tool-accent: var(--warning-color);
  }
  .toolbox-quick-card.is-teal {
    --tool-accent: var(--success-color);
  }
  .toolbox-quick-card.is-rose {
    --tool-accent: var(--danger-color);
  }
  .toolbox-quick-card__icon {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tool-accent) 24%, var(--surface-border-color));
    border-radius: 11px;
    color: var(--tool-accent);
    background: color-mix(in srgb, var(--tool-accent) 8%, var(--card-background));
  }
  .toolbox-quick-card__copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  .toolbox-quick-card__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-quick-card__copy strong {
    display: -webkit-box;
    overflow: hidden;
    overflow-wrap: anywhere;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: 12.5px;
    line-height: 1.25;
  }
  .toolbox-quick-card__copy small {
    color: var(--desc-color);
    font-size: 9.5px;
  }
  .toolbox-home__state {
    min-height: 94px;
    padding: 16px 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 13px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    color: var(--desc-color);
    background: var(--card-background);
  }
  .toolbox-home__state-copy {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 3px;
  }
  .toolbox-home__state-copy strong {
    color: var(--text-color);
    font-size: 13px;
  }
  .toolbox-home__state-copy small {
    font-size: 10.5px;
    line-height: 1.5;
  }
  .toolbox-home__state.is-error {
    border-color: var(--chip-danger-border);
  }
  .toolbox-home__state.is-error .toolbox-home__state-icon,
  .toolbox-home__state.is-error .toolbox-home__state-copy strong {
    color: var(--danger-color);
  }
  .toolbox-activity-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 11px;
  }
  .toolbox-activity-card.b_btn {
    width: 100%;
    min-width: 0;
    min-height: 118px;
    height: auto;
    padding: 14px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    align-items: start;
    gap: 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    color: var(--text-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
    line-height: 1.4;
    text-align: left;
    white-space: normal;
  }
  .toolbox-activity-card__icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--primary-color) 22%, var(--surface-border-color));
    border-radius: 12px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
  }
  .toolbox-activity-card.is-ready .toolbox-activity-card__icon {
    border-color: var(--chip-success-border);
    color: var(--success-color);
  }
  .toolbox-activity-card__copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .toolbox-activity-card__topline {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .toolbox-activity-card__badges {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .toolbox-activity-card__type {
    max-width: 104px;
  }
  .toolbox-activity-card__topline small {
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-activity-card__copy > strong {
    overflow: hidden;
    margin-top: 2px;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-activity-card__copy > small {
    color: var(--desc-color);
    font-size: 9.5px;
  }
  .toolbox-activity-card__copy > span:not(.toolbox-activity-card__topline) {
    display: -webkit-box;
    overflow: hidden;
    min-height: 16px;
    font-size: 11px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
  }
  .toolbox-activity-card__action {
    grid-column: 2;
    min-height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    color: var(--primary-color);
    font-size: 10.5px;
    font-weight: 650;
  }
  .toolbox-recent-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
    gap: 10px;
  }
  .toolbox-recent-row.b_btn {
    width: 100%;
    min-width: 0;
    min-height: 76px;
    height: auto;
    padding: 10px 12px;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    color: var(--text-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
    text-align: left;
  }
  .toolbox-recent-row__icon {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 10px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 7%, var(--card-background));
  }
  .toolbox-recent-row__copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .toolbox-recent-row__copy strong,
  .toolbox-recent-row__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-recent-row__copy strong {
    font-size: 12px;
  }
  .toolbox-recent-row__copy small,
  .toolbox-recent-row__time {
    color: var(--desc-color);
    font-size: 10px;
  }
  .toolbox-catalog__controls {
    margin-bottom: 16px;
    display: grid;
    grid-template-columns: minmax(260px, 500px) minmax(0, 1fr);
    align-items: center;
    gap: 12px 18px;
  }
  .toolbox-catalog__notice {
    min-height: 42px;
    margin: -4px 0 14px;
    padding: 7px 10px;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    background: var(--surface-muted-bg, var(--active-background-color));
    font-size: 10.5px;
    line-height: 1.45;
  }
  .toolbox-catalog__notice > :first-child {
    color: var(--warning-color);
  }
  .toolbox-catalog__search {
    position: relative;
    min-width: 0;
  }
  .toolbox-catalog__search > span {
    position: absolute;
    z-index: 2;
    top: 50%;
    right: 10px;
    min-width: 38px;
    height: 22px;
    display: grid;
    place-items: center;
    transform: translateY(-50%);
    border: 1px solid var(--surface-border-color);
    border-radius: 7px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 9.5px;
    pointer-events: none;
  }
  .toolbox-catalog__search :deep(.input-container) {
    color: var(--desc-color);
  }
  .toolbox-catalog__search :deep(.b-input) {
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 12px;
    color: var(--text-color);
    background: var(--card-background);
    font-family: inherit;
    font-size: 12px;
  }
  .toolbox-catalog__search :deep(.b-input:hover) {
    border-color: var(--primary-color) !important;
  }
  .toolbox-catalog__search :deep(.b-input:focus-visible) {
    border-color: var(--focus-ring-color) !important;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus-ring-color) 13%, transparent) !important;
  }
  .toolbox-category-filter {
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 7px;
  }
  .toolbox-home-groups {
    display: grid;
    gap: 18px;
  }
  .toolbox-home-group {
    --group-accent: var(--primary-color);
    scroll-margin-top: 76px;
    padding: 16px;
    display: grid;
    gap: 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: color-mix(in srgb, var(--group-accent) 2.2%, var(--card-background));
    box-shadow: var(--surface-card-shadow);
  }
  .toolbox-home-group.is-teal {
    --group-accent: var(--success-color);
  }
  .toolbox-home-group__head {
    min-width: 0;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
  }
  .toolbox-home-group__head > span {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--group-accent) 24%, var(--surface-border-color));
    border-radius: 10px;
    color: var(--group-accent);
    background: color-mix(in srgb, var(--group-accent) 7%, var(--card-background));
  }
  .toolbox-home-group__head h3 {
    margin: 0;
    font-size: 15px;
  }
  .toolbox-home-group__head p {
    margin: 2px 0 0;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.45;
  }
  .toolbox-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .toolbox-card-wrap {
    position: relative;
    min-width: 0;
  }
  .toolbox-card.b_btn {
    --tool-accent: var(--primary-color);
    width: 100%;
    min-width: 0;
    min-height: 124px;
    height: auto;
    padding: 12px 13px;
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    color: var(--text-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
    line-height: 1.35;
    text-align: left;
    white-space: normal;
  }
  .toolbox-card.is-violet {
    --tool-accent: var(--focus-ring-color);
  }
  .toolbox-card.is-amber {
    --tool-accent: var(--warning-color);
  }
  .toolbox-card.is-teal {
    --tool-accent: var(--success-color);
  }
  .toolbox-card.is-rose {
    --tool-accent: var(--danger-color);
  }
  .toolbox-card__icon {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tool-accent) 22%, var(--surface-border-color));
    border-radius: 12px;
    color: var(--tool-accent);
    background: color-mix(in srgb, var(--tool-accent) 7%, var(--card-background));
  }
  .toolbox-card__copy {
    min-width: 0;
    display: grid;
    gap: 4px;
  }
  .toolbox-card__copy strong,
  .toolbox-card__copy > span,
  .toolbox-card__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .toolbox-card__copy strong {
    font-size: 13.5px;
    white-space: nowrap;
  }
  .toolbox-card__copy > span {
    display: -webkit-box;
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .toolbox-card__copy small {
    color: var(--desc-color);
    font-size: 9.5px;
    white-space: nowrap;
  }
  .toolbox-card__aside {
    display: grid;
    justify-items: end;
    gap: 9px;
    color: var(--tool-accent);
  }
  .toolbox-card__pin-wrap {
    position: absolute;
    z-index: 3;
    top: 8px;
    right: 8px;
    opacity: 0;
    transition: opacity 0.16s ease;
  }
  .toolbox-card__pin.b_btn {
    width: 28px;
    min-width: 28px;
    height: 28px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    color: var(--desc-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }
  .toolbox-card__pin.b_btn.is-pinned {
    opacity: 1;
    border-color: var(--primary-color);
    color: #fff;
    background: var(--primary-color);
  }
  .toolbox-card__pin.b_btn:focus-visible {
    outline: 2px solid var(--focus-ring-color);
    outline-offset: 2px;
  }
  @media (hover: hover) and (pointer: fine) {
    .toolbox-start-card.b_btn:hover {
      border-color: var(--tool-accent);
      background: color-mix(in srgb, var(--tool-accent) 7%, var(--card-background));
      transform: translateY(-1px);
    }
    .toolbox-asset.b_btn:hover,
    .toolbox-quick-card.b_btn:hover,
    .toolbox-activity-card.b_btn:hover,
    .toolbox-card.b_btn:hover {
      border-color: color-mix(in srgb, var(--primary-color) 48%, var(--surface-border-color));
      background: var(--hover-background);
    }
    .toolbox-recent-row.b_btn:hover {
      border-color: color-mix(in srgb, var(--primary-color) 42%, var(--surface-border-color));
      background: var(--hover-background);
    }
    .toolbox-card-wrap:hover .toolbox-card__pin-wrap,
    .toolbox-card__pin-wrap:focus-within,
    .toolbox-card__pin-wrap.is-pinned {
      opacity: 1;
    }
  }
  .toolbox-asset.b_btn:focus-visible,
  .toolbox-start-card.b_btn:focus-visible,
  .toolbox-quick-card.b_btn:focus-visible,
  .toolbox-activity-card.b_btn:focus-visible,
  .toolbox-recent-row.b_btn:focus-visible,
  .toolbox-card.b_btn:focus-visible {
    position: relative;
    z-index: 2;
    outline: 2px solid var(--focus-ring-color);
    outline-offset: -2px;
  }

  @media (max-width: 900px) {
    .toolbox-overview {
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }
    .toolbox-catalog__controls {
      grid-template-columns: 1fr;
    }
    .toolbox-category-filter {
      justify-content: flex-start;
    }
    .toolbox-start-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .toolbox-quick-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .toolbox-activity-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .toolbox-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 901px) and (max-width: 1380px) {
    .toolbox-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 767px) {
    .toolbox-home {
      padding: 13px 12px calc(28px + env(safe-area-inset-bottom));
    }
    .toolbox-overview {
      min-height: 0;
      padding: 16px 15px 14px;
      grid-template-columns: 1fr;
      gap: 12px;
      border-radius: 18px;
    }
    .toolbox-overview h1 {
      font-size: 28px;
    }
    .toolbox-overview p {
      font-size: 11.5px;
    }
    .toolbox-overview__assets {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .toolbox-asset.b_btn {
      min-height: 45px;
      padding: 6px 8px;
      grid-template-columns: 30px minmax(0, 1fr);
    }
    .toolbox-asset__icon {
      width: 30px;
      height: 30px;
      padding: 4px;
    }
    .toolbox-guest-guide {
      min-height: 0;
      margin-top: 16px;
      padding: 14px;
      grid-template-columns: 38px minmax(0, 1fr);
      border-radius: 14px;
    }
    .toolbox-guest-guide__icon {
      width: 38px;
      height: 38px;
    }
    .toolbox-guest-guide > .b_btn {
      grid-column: 1 / -1;
      width: 100%;
      min-height: 44px;
    }
    .toolbox-section {
      margin-top: 21px;
    }
    .toolbox-start-grid {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .toolbox-start-card.b_btn {
      min-height: 96px;
      padding: 11px;
      grid-template-columns: 38px minmax(0, 1fr);
      gap: 8px;
      border-radius: 14px;
    }
    .toolbox-start-card__icon {
      width: 38px;
      height: 38px;
      border-radius: 10px;
    }
    .toolbox-start-card__copy {
      gap: 4px;
    }
    .toolbox-start-card__copy strong {
      font-size: 12.5px;
    }
    .toolbox-start-card__copy > small {
      font-size: 9.5px;
    }
    .toolbox-quick-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .toolbox-quick__switch,
    .toolbox-group-filter {
      margin-left: 0;
    }
    .toolbox-group-filter {
      margin-right: -12px;
      margin-left: -12px;
      padding-right: 12px;
      padding-left: 12px;
      border-right: 0;
      border-left: 0;
      border-radius: 0;
    }
    .toolbox-quick-card.b_btn {
      min-height: 68px;
      padding: 8px 9px;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 7px;
    }
    .toolbox-quick-card:nth-child(n + 5) {
      display: none;
    }
    .toolbox-quick-card__icon {
      width: 34px;
      height: 34px;
    }
    .toolbox-section__head h2 {
      font-size: 18px;
    }
    .toolbox-home__state {
      min-height: 86px;
      padding: 13px;
      justify-content: flex-start;
      border-radius: 14px;
    }
    .toolbox-home__state > .b_btn {
      min-height: 44px;
    }
    .toolbox-activity-grid {
      display: block;
      overflow: hidden;
      border: 1px solid var(--surface-border-color);
      border-radius: 15px;
      background: var(--card-background);
    }
    .toolbox-activity-card.b_btn {
      min-height: 104px;
      padding: 12px;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .toolbox-activity-card + .toolbox-activity-card {
      border-top: 1px solid var(--surface-divider-color);
    }
    .toolbox-activity-card__action {
      min-height: 26px;
    }
    .toolbox-recent-row.b_btn {
      min-height: 62px;
      padding: 8px 10px;
      grid-template-columns: 34px minmax(0, 1fr);
    }
    .toolbox-recent-list {
      grid-template-columns: 1fr;
      gap: 8px;
    }
    .toolbox-recent-row__time {
      grid-column: 2;
      grid-row: 2;
    }
    .toolbox-catalog__controls {
      gap: 10px;
    }
    .toolbox-catalog__notice {
      min-height: 48px;
      grid-template-columns: 18px minmax(0, 1fr);
    }
    .toolbox-catalog__notice > .b_btn {
      grid-column: 1 / -1;
      width: 100%;
      min-height: 40px;
    }
    .toolbox-catalog__search > span {
      display: none;
    }
    .toolbox-catalog__search :deep(.b-input) {
      min-height: 44px;
    }
    .toolbox-category-filter :deep(.b-chip--interactive) {
      min-height: 44px;
      padding-right: 14px;
      padding-left: 14px;
    }
    .toolbox-home-groups {
      gap: 20px;
    }
    .toolbox-home-group {
      margin-right: -12px;
      margin-left: -12px;
      padding: 13px 12px;
      border-right: 0;
      border-left: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .toolbox-home-group__head {
      grid-template-columns: 36px minmax(0, 1fr) auto;
    }
    .toolbox-home-group__head > span {
      width: 36px;
      height: 36px;
    }
    .toolbox-grid {
      display: block;
      overflow: hidden;
      border: 1px solid var(--surface-border-color);
      border-radius: 15px;
      background: var(--card-background);
    }
    .toolbox-card-wrap + .toolbox-card-wrap {
      border-top: 1px solid var(--surface-divider-color);
    }
    .toolbox-card.b_btn {
      min-height: 90px;
      padding: 10px 11px;
      border: 0;
      border-radius: 0;
      box-shadow: none;
    }
    .toolbox-card__pin-wrap {
      top: 4px;
      right: 4px;
      opacity: 1;
    }
    .toolbox-card__pin.b_btn {
      width: 44px;
      min-width: 44px;
      height: 44px;
    }
    .toolbox-card__aside {
      padding-top: 38px;
    }
    .toolbox-card__copy > span {
      -webkit-line-clamp: 1;
    }
    .toolbox-card__aside :deep(.b-chip) {
      max-width: 96px;
    }
  }

  :global(html.light-note-mobile-rendering .toolbox-overview),
  :global(html.light-note-mobile-rendering .toolbox-asset.b_btn),
  :global(html.light-note-mobile-rendering .toolbox-start-card.b_btn),
  :global(html.light-note-mobile-rendering .toolbox-quick-card.b_btn),
  :global(html.light-note-mobile-rendering .toolbox-guest-guide),
  :global(html.light-note-mobile-rendering .toolbox-home__state),
  :global(html.light-note-mobile-rendering .toolbox-activity-grid),
  :global(html.light-note-mobile-rendering .toolbox-activity-card.b_btn),
  :global(html.light-note-mobile-rendering .toolbox-recent-row.b_btn),
  :global(html.light-note-mobile-rendering .toolbox-grid),
  :global(html.light-note-mobile-rendering .toolbox-card.b_btn) {
    border-color: var(--surface-border-color);
    background: var(--card-background);
    box-shadow: none;
  }
  :global([data-theme='night'] .toolbox-asset__icon) {
    border-color: rgba(243, 180, 79, 0.46);
    color: #f3b44f;
    background: rgba(180, 83, 9, 0.22);
  }
  :global([data-theme='night'] .toolbox-asset.is-ai .toolbox-asset__icon) {
    border-color: color-mix(in srgb, var(--primary-color) 58%, var(--surface-border-color));
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 18%, var(--card-background));
  }
  :global(html.light-note-mobile-rendering .toolbox-activity-card__icon),
  :global(html.light-note-mobile-rendering .toolbox-start-card__icon),
  :global(html.light-note-mobile-rendering .toolbox-quick-card__icon),
  :global(html.light-note-mobile-rendering .toolbox-recent-row__icon),
  :global(html.light-note-mobile-rendering .toolbox-card__icon),
  :global(html.light-note-mobile-rendering .toolbox-home-group__head > span) {
    border-color: var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }
</style>
