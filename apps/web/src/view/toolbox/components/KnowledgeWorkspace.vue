<template>
  <div
    ref="rootRef"
    class="knowledge-workspace"
    :class="[`is-${kind}`, { 'has-project-rail': workspace && !loading && !loadError }]"
  >
    <div v-if="loading" class="knowledge-workspace__state">
      <BLoading inline loading :title="t('toolbox.workspace.loading')" />
    </div>

    <div v-else-if="loadError" class="knowledge-workspace__state is-error" role="alert">
      <strong>{{ t('toolbox.workspace.loadFailed') }}</strong>
      <span>{{ t('toolbox.workspace.loadFailedHint') }}</span>
      <div class="knowledge-workspace__state-actions">
        <BButton v-if="workspaceQuery" size="small" @click="leaveWorkspace">{{
          t('toolbox.workspace.backToList')
        }}</BButton>
        <BButton size="small" @click="reloadCurrent">{{ t('common.retry') }}</BButton>
      </div>
    </div>

    <template v-else-if="!workspace">
      <section class="workspace-list-intro">
        <div class="workspace-list-intro__copy">
          <span class="workspace-kicker">{{ t('toolbox.workspace.longTermKicker') }}</span>
          <h2>{{ t('toolbox.workspace.myProjects') }}</h2>
          <p>{{ t('toolbox.project.introHint') }}</p>
        </div>
        <BButton type="primary" size="large" @click="openCreateModal">
          <SvgIcon :src="icon.common.plus" size="17" />{{ t('toolbox.project.newProject') }}
        </BButton>
      </section>

      <div class="workspace-filters">
        <BInput v-model:value="projectSearch" :placeholder="t('toolbox.project.search')" />
        <BSelect v-model:value="projectStatus" :options="statusOptions" />
        <BSelect
          v-model:value="projectKind"
          :placeholder="t('toolbox.project.allTypes')"
          :options="[{ value: '', label: t('toolbox.project.allTypes') }, ...projectTemplateOptions]"
        />
      </div>
      <p v-if="workspaces.length && !filteredWorkspaces.length">{{ t('toolbox.project.noMatching') }}</p>
      <section class="workspace-list-section" :aria-label="t('toolbox.project.myProjects')">
        <header>
          <BChip tone="neutral" size="medium">{{
            t('toolbox.workspace.workspaceCount', { count: filteredWorkspaces.length })
          }}</BChip>
        </header>

        <div v-if="!workspaces.length" class="workspace-empty">
          <span><SvgIcon :src="templateIcon" size="28" /></span>
          <h3>{{ t('toolbox.project.intro') }}</h3>
          <p>{{ t('toolbox.project.introHint') }}</p>
          <BButton type="primary" @click="openCreateModal">{{ t('toolbox.project.newProject') }}</BButton>
        </div>

        <div v-else class="workspace-card-grid">
          <BButton
            v-for="item in filteredWorkspaces"
            :key="item.id"
            class="workspace-card"
            :aria-label="t('toolbox.workspace.openWorkspace', { title: item.title })"
            @click="openWorkspace(item.id)"
          >
            <span class="workspace-card__top">
              <span class="workspace-card__icon"><SvgIcon :src="templateIcons[item.kind]" size="21" /></span>
              <span class="workspace-card__copy">
                <strong :title="item.title">{{ item.title }}</strong>
                <small>{{ item.goal || item.description || t(`toolbox.tool.${item.kind}_workspace.name`) }}</small>
              </span>
              <BChip :tone="statusTone(item.status)">{{ statusLabel(item.status) }}</BChip>
            </span>
            <span class="workspace-card__next">
              <small>{{ t('toolbox.workspace.nextStep') }}</small>
              <strong>{{ item.nextStep || t('toolbox.workspace.noNextStep') }}</strong>
            </span>
            <span class="workspace-card__meta">
              <span>{{ t('toolbox.workspace.materialCount', { count: item.resourceCount }) }}</span>
              <span>{{ t('toolbox.workspace.openItemCount', { count: item.openItemCount }) }}</span>
              <span>{{ formatRelative(item.updatedAt) }}</span>
              <SvgIcon :src="icon.toolbox.arrow" size="15" />
            </span>
          </BButton>
        </div>
      </section>
    </template>

    <template v-else>
      <section ref="projectHead" class="workspace-detail-head" :class="{ 'is-pinned': headerPinned }">
        <nav class="project-breadcrumb" :aria-label="t('toolbox.project.myProjects')">
          <BButton class="project-breadcrumb__workshop" @click="emit('return-to-workshop')">{{
            t('toolbox.title')
          }}</BButton>
          <span class="project-breadcrumb__separator" aria-hidden="true">/</span>
          <BButton @click="leaveWorkspace"
            ><SvgIcon class="project-breadcrumb__mobile-back" :src="icon.toolbox.back" size="16" />{{
              t('toolbox.project.myProjects')
            }}</BButton
          >
          <span class="project-breadcrumb__separator" aria-hidden="true">/</span>
          <span class="project-breadcrumb__current" aria-current="page">{{ workspace.title }}</span>
        </nav>
        <BButton class="project-settings-trigger" :disabled="mutating" @click="openEditModal">{{
          t('toolbox.project.manage')
        }}</BButton>
      </section>

      <nav ref="sectionNav" class="project-section-navigation" :aria-label="t('toolbox.workspace.sectionNavigation')">
        <BButton
          v-for="(section, index) in projectTabs"
          :key="section.key"
          :aria-current="activeSection === section.key ? 'location' : undefined"
          :class="{ 'is-current': activeSection === section.key }"
          @click="selectProjectTab(section.key)"
        >
          <span class="project-section-navigation__number">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="project-section-navigation__label">{{ section.label }}</span>
        </BButton>
        <BButton class="project-settings-trigger project-settings-trigger--mobile" :disabled="mutating" :aria-label="t('toolbox.project.manage')" :title="t('toolbox.project.manage')" @click="openEditModal"><SvgIcon :src="icon.userCenter.menu.settings" size="18" /></BButton>
      </nav>
      <section class="workspace-summary">
        <div class="workspace-summary__main">
          <span class="workspace-summary__icon"><SvgIcon :src="templateIcon" size="27" /></span>
          <div>
            <span class="workspace-summary__meta">
              <BChip tone="neutral">{{ t(`toolbox.tool.${kind}_workspace.name`) }}</BChip>
              <BChip :tone="statusTone(workspace.status)">{{ statusLabel(workspace.status) }}</BChip>
              <small v-if="workspace.targetDate">
                <SvgIcon :src="icon.common.calendar" size="14" />{{ formatDate(workspace.targetDate) }}
              </small>
            </span>
            <h2>{{ workspace.title }}</h2>
            <p
              :class="{ 'is-collapsed': !goalExpanded && (workspace.goal || workspace.description || '').length > 140 }"
              >{{ workspace.goal || workspace.description || templateText('cardFallback') }}</p
            >
            <BButton
              v-if="(workspace.goal || workspace.description || '').length > 140"
              size="small"
              @click="goalExpanded = !goalExpanded"
              >{{ t(goalExpanded ? 'toolbox.project.goalLess' : 'toolbox.project.goalMore') }}</BButton
            >
          </div>
        </div>
        <div class="project-overview-metrics">
          <div
            ><strong>{{ workspace.resources.length }}</strong
            ><small>{{ t('toolbox.workspace.metrics.materials') }}</small></div
          >
          <div
            ><strong>{{ workspace.openItemCount }}</strong
            ><small>{{ t('toolbox.workspace.metrics.openItems') }}</small></div
          >
          <div
            ><strong>{{ workspace.completedItemCount }}</strong
            ><small>{{ t('toolbox.workspace.metrics.completed') }}</small></div
          >
        </div>
      </section>

      <section class="workspace-resume">
        <div class="workspace-resume__lead">
          <span><SvgIcon :src="icon.noteTemplate.daily" size="20" /></span>
          <div>
            <small>{{ t('toolbox.workspace.nextStep') }}</small>
            <strong>{{ workspace.nextStep || t('toolbox.workspace.noNextStep') }}</strong>
          </div>
        </div>
        <BButton @click="focusProgressForm">{{ templateText('recordAction') }}</BButton>
      </section>


      <section ref="progressSection" class="workspace-section workspace-progress-section">
        <header class="workspace-section__head"
          ><div>
            <span class="workspace-section__kicker">01 · {{ stepText('progress', 'label') }}</span>
            <h3>{{ stepText('progress', 'title') }}</h3>
            <p>{{ stepText('progress', 'description') }}</p>
          </div></header
        >
        <p v-if="visitorPreview">{{ t('toolbox.project.previewHint') }}</p>
        <div v-else class="workspace-progress-form">
          <label class="workspace-progress-form__summary">
            <span>{{ stepText('progress', 'summaryLabel') }}</span>
            <BInput
              ref="progressInput"
              v-model:value="progressSummary"
              @update:value="progressDraftEdited = true"
              type="textarea"
              :rows="3"
              :maxlength="1000"
              :placeholder="templateText('progressPlaceholder')"
            />
          </label>
          <p class="workspace-progress-form__hint" :class="{ 'is-ready': canSaveProgress }" aria-live="polite">
            {{ stepText('progress', canSaveProgress ? 'readyHint' : 'requiredHint') }}
          </p>
          <label class="workspace-progress-form__next">
            <span>{{ stepText('progress', 'nextLabel') }}</span>
            <BInput
              v-model:value="progressNextStep"
              @update:value="progressDraftEdited = true"
              :maxlength="500"
              height="42px"
              :placeholder="templateText('nextStepPlaceholder')"
            />
          </label>
          <label class="workspace-progress-form__duration">
            <span>{{ t('toolbox.workspace.durationLabel') }}</span>
            <BSelect v-model:value="progressDuration" :options="durationOptions" />
          </label>
          <BButton
            class="workspace-progress-form__submit"
            type="primary"
            size="large"
            :loading="savingProgress"
            :disabled="!canSaveProgress"
            @click="saveProgress"
            >{{ stepText('progress', 'submit') }}</BButton
          >
        </div>
      </section>

      <section ref="resourcesSection" class="workspace-section workspace-resources-section">
        <header class="workspace-section__head">
          <div>
            <span class="workspace-section__kicker">02 · {{ stepText('resources', 'label') }}</span>
            <h3>{{ stepText('resources', 'title') }}</h3>
            <p>{{ stepText('resources', 'description') }}</p>
          </div>
          <BButton @click="openResourceModal">
            <SvgIcon :src="icon.common.plus" size="15" />{{ stepText('resources', 'addAction') }}
          </BButton>
        </header>
        <div v-if="!workspace.resources.length" class="workspace-section-empty">
          <SvgIcon :src="icon.toolbox.locate" size="22" />
          <span>{{ stepText('resources', 'empty') }}</span>
        </div>
        <div class="workspace-filters">
          <BInput v-model:value="resourceSearch" :placeholder="t('toolbox.project.searchResources')" />
          <BButton type="primary" :disabled="!outcomeResources.length" @click="outcomeOpen = true"
            >{{ t('toolbox.project.generate') }} · {{ outcomeResources.length }}</BButton
          >
        </div>
        <p v-if="workspace.resources.length && !filteredResources.length">{{ t('toolbox.project.noResources') }}</p>
        <p v-if="workspace.resources.length && !outcomeResources.length">{{ t('toolbox.project.selectHint') }}</p>
        <div v-if="workspace.resources.length" class="workspace-resource-grid">
          <article
            v-for="resource in filteredResources"
            :key="`${resource.type}:${resource.resourceId}`"
            :class="{ 'is-selected': selectedResourceKeys.includes(`${resource.type}:${resource.resourceId}`), 'is-unavailable': resource.available === false }"
            @click="selectResourceRow(resource, $event)"
          >
            <BCheckbox
              :model-value="selectedResourceKeys.includes(`${resource.type}:${resource.resourceId}`)"
              :disabled="resource.available === false"
              :aria-label="resource.title"
              @click.stop
              @update:model-value="toggleResource(resource, $event)"
            />
            <span class="workspace-resource-grid__icon" :class="`is-${resource.type}`">
              <SvgIcon :src="resourceIcon(resource.type)" size="17" />
            </span>
            <div>
              <BButton
                class="workspace-resource-link"
                :disabled="resource.available === false"
                @click.stop="openLinkedResource(resource)"
                >{{ resource.title || resource.resourceId }}</BButton
              >
              <small>{{
                resource.available === false
                  ? t('toolbox.workspace.resourceUnavailable')
                  : t(`ai.sourceTypes.${resource.type}`)
              }}</small>
            </div>
            <BButton
              :aria-label="t('toolbox.workspace.removeResource', { title: resource.title || resource.resourceId })"
              :disabled="mutating"
              @click.stop="confirmRemoveResource(resource)"
              ><SvgIcon :src="icon.toolbox.delete" size="15"
            /></BButton>
          </article>
        </div>
      </section>

      <section ref="boardSection" class="workspace-section workspace-board-section">
        <header class="workspace-section__head">
          <div>
            <span class="workspace-section__kicker">03 · {{ stepText('board', 'label') }}</span>
            <h3>{{ stepText('board', 'title') }}</h3>
            <p>{{ templateText('boardDescription') }}</p>
          </div>
        </header>
        <WorkspaceBoard :key="workspace.id" v-model:lane="mobileLane" :workspace="workspace" :readonly="visitorPreview" :mobile="isMobileLayout" @updated="handleBoardUpdated" />
      </section>

      <section ref="timelineSection" class="workspace-section workspace-timeline-section">
        <header class="workspace-section__head">
          <div>
            <span class="workspace-section__kicker">04 · {{ stepText('timeline', 'label') }}</span>
            <h3>{{ stepText('timeline', 'title') }}</h3>
            <p>{{ stepText('timeline', 'description') }}</p>
          </div>
          <BButton @click="focusProgressForm">{{ t('toolbox.project.record') }}</BButton>
        </header>
        <div v-if="!workspace.sessions.length" class="workspace-section-empty">
          <SvgIcon :src="icon.common.time" size="21" />
          <span>{{ stepText('timeline', 'empty') }}</span>
        </div>
        <div v-else class="workspace-timeline">
          <article v-for="session in workspace.sessions" :key="session.id">
            <span class="workspace-timeline__dot"></span>
            <div>
              <header>
                <strong>{{ formatDateTime(session.createdAt) }}</strong>
                <BChip v-if="session.durationMinutes" tone="neutral">{{
                  t('toolbox.workspace.durationMinutes', { count: session.durationMinutes })
                }}</BChip>
              </header>
              <p v-if="session.summary">{{ session.summary }}</p>
              <small v-if="session.nextStep"
                ><b>{{ t('toolbox.workspace.nextStep') }}：</b>{{ session.nextStep }}</small
              >
            </div>
          </article>
        </div>
      </section>
    </template>

    <ResourceOutcomeDrawer
      v-if="workspace"
      :open="outcomeOpen"
      :resources="outcomeResources"
      surface="workspace"
      :source-workspace-id="workspace.id"
      :initial-tool-id="defaultOutcomeTool"
      @update:open="outcomeOpen = $event"
    />
    <BModal
      v-model:visible="createModalVisible"
      :title="workspaceFormMode === 'edit' ? t('toolbox.project.manage') : templateText('createModalTitle')"
      width="620px"
      :show-footer="false"
      fullscreen-mobile
      initial-focus=".workspace-create-title"
    >
      <div class="workspace-modal-form" :class="{ 'workspace-settings-form': workspaceFormMode === 'edit' }">
        <label v-if="workspaceFormMode !== 'edit'">
          <span>{{ t('toolbox.workspace.projectTemplate') }}</span>
          <BSelect v-model:value="createKind" :options="projectTemplateOptions" />
        </label>
        <div v-if="workspaceFormMode !== 'edit'" class="workspace-modal-callout">
          <span><SvgIcon :src="templateIcons[createKind]" size="21" /></span>
          <div
            ><strong>{{ templateText('createCalloutTitle') }}</strong
            ><p>{{ templateText('createCalloutDescription') }}</p></div
          >
        </div>
        <label v-if="workspaceFormMode === 'edit'" class="project-settings-status">
          <span>{{ t('toolbox.project.projectStatus') }}</span>
          <BSelect v-model:value="editStatus" :options="statusOptions" />
        </label>
        <label>
          <span>{{ t('toolbox.workspace.titleLabel') }}</span>
          <BInput
            v-model:value="createForm.title"
            class="workspace-create-title"
            :maxlength="120"
            height="42px"
            :placeholder="templateText('titlePlaceholder')"
          />
        </label>
        <label>
          <span>{{ t('toolbox.workspace.goalLabel') }}</span>
          <BInput
            v-model:value="createForm.goal"
            type="textarea"
            :rows="3"
            :maxlength="1000"
            :placeholder="templateText('goalPlaceholder')"
          />
        </label>
        <div class="workspace-modal-form__row">
          <label>
            <span>{{ t('toolbox.workspace.targetDateLabel') }}</span>
            <BDateTimePicker v-model:value="createForm.targetDate" :show-time="false" />
          </label>
          <label>
            <span>{{ t('toolbox.workspace.firstStepLabel') }}</span>
            <BInput
              v-model:value="createForm.nextStep"
              :maxlength="500"
              height="42px"
              :placeholder="templateText('nextStepPlaceholder')"
            />
          </label>
        </div>
        <BButton
          v-if="workspaceFormMode === 'edit' && isMobileLayout"
          @click="
            createModalVisible = false;
            emit('return-to-workshop');
          "
          >{{ t('toolbox.back') }}</BButton
        >
        <div class="workspace-modal-actions">
          <BButton @click="createModalVisible = false">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" :loading="creating" :disabled="!createForm.title.trim()" @click="saveWorkspaceForm">
            {{ workspaceFormMode === 'edit' ? t('toolbox.workspace.updateAction') : templateText('createAction') }}
          </BButton>
        </div>
      </div>
    </BModal>

    <BModal
      v-model:visible="resourceModalVisible"
      :title="stepText('resources', 'addAction')"
      width="880px"
      :show-footer="true"
      fullscreen-mobile
    >
      <div class="workspace-resource-modal">
        <ToolboxResourceSelector
          :expand-note-branches="false"
          v-model="pendingResources"
          :max="100"
          :external-count="workspace?.resources.length || 0"
          :existing-resource-keys="existingResourceKeys"
          :disabled="mutating"
          :page-scroll="!isMobileLayout"
        />
      </div>
      <template #footer>
        <div class="workspace-resource-modal__footer">
          <BButton @click="resourceModalVisible = false">{{ t('common.cancel') }}</BButton>
          <BButton type="primary" :loading="mutating" :disabled="!pendingResources.length" @click="saveResources">
            {{ t('toolbox.workspace.addSelectedResources', { count: pendingResources.length }) }}
          </BButton>
        </div>
      </template>
    </BModal>


  </div>
</template>

<script setup lang="ts">
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import WorkspaceBoard from './WorkspaceBoard.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import { resolveResourceRoute } from '@/utils/resourceNavigation';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import ResourceOutcomeDrawer from '@/components/resourceActions/ResourceOutcomeDrawer.vue';
  import { useUserStore } from '@/store';
  import { toolboxRecentUseIdentityKey } from '@/utils/toolboxRecentUse';
  import { findScrollContainer } from '@/utils/scrollContainer';
  import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
  import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BDateTimePicker from '@/components/base/BasicComponents/BDateTimePicker.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import {
    addToolboxWorkspaceResources as requestaddToolboxWorkspaceResources,
    createToolboxWorkspace as requestcreateToolboxWorkspace,
    createToolboxWorkspaceSession as requestcreateToolboxWorkspaceSession,
    fetchToolboxWorkspace,
    fetchToolboxWorkspaces as requestfetchToolboxWorkspaces,
    markToolboxWorkspaceOpened,
    removeToolboxWorkspaceResource as requestremoveToolboxWorkspaceResource,
    updateToolboxWorkspace as requestupdateToolboxWorkspace,
    type ProjectEntrySource,
    type ToolboxWorkspace,
    type ToolboxWorkspaceKind,
    type ToolboxWorkspaceLane,
    type ToolboxWorkspaceResource,
    type ToolboxWorkspaceStatus,
    type ToolboxWorkspaceSummary,
  } from '@/api/toolbox';
  import icon from '@/config/icon';
  import { toolboxWorkspaceKind } from '@/config/toolbox';
  import type { ToolboxSelectedResource } from '@/utils/toolboxResourceSelection';
  import ToolboxResourceSelector from './ToolboxResourceSelector.vue';

  const emit = defineEmits<{ 'return-to-workshop': [] }>();
  const props = defineProps<{ toolId: ToolboxToolId | string }>();
  const { t, locale } = useI18n();
  const isMobileLayout = useMobileLayout();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const visitorPreview = computed(() => user.role === 'visitor' && !user.adminContext);
  const entrySource = computed<ProjectEntrySource>(() =>
    ['workbench', 'workshop', 'resource_menu', 'resource_batch', 'result'].includes(String(route.query.entry))
      ? (route.query.entry as ProjectEntrySource)
      : 'project',
  );
  const ownerKey = computed(() => toolboxRecentUseIdentityKey(user));
  const templateIcons: Record<ToolboxWorkspaceKind, string> = {
    research: icon.toolbox.research,
    learning: icon.toolbox.study,
    writing: icon.toolbox.materialNote,
  };
  const lanes: ToolboxWorkspaceLane[] = ['inbox', 'knowledge', 'action'];
  const projectTemplateOptions = computed(() =>
    ['research', 'learning', 'writing'].map((value) => ({ value, label: t(`toolbox.tool.${value}_workspace.name`) })),
  );
  const createKind = ref(toolboxWorkspaceKind(props.toolId));
  const kind = computed(() => workspace.value?.kind || createKind.value);
  const templateIcon = computed(() => templateIcons[kind.value]);
  const workspaces = ref<ToolboxWorkspaceSummary[]>([]);
  const workspace = ref<ToolboxWorkspace | null>(null);
  const loading = ref(true);
  const loadError = ref(false);
  const creating = ref(false);
  const mutating = ref(false);
  const savingProgress = ref(false);
  const editStatus = ref<ToolboxWorkspaceStatus>('active');
  const createModalVisible = ref(false);
  const workspaceFormMode = ref<'create' | 'edit'>('create');
  const resourceModalVisible = ref(false);
  const pendingResources = ref<ToolboxSelectedResource[]>([]);
  const progressSummary = ref('');
  const progressNextStep = ref('');
  const progressDuration = ref(0);
  type WorkspaceSectionKey = 'progress' | 'resources' | 'board' | 'timeline';
  type WorkspaceStepTextKey =
    | 'label'
    | 'title'
    | 'description'
    | 'summaryLabel'
    | 'nextLabel'
    | 'requiredHint'
    | 'readyHint'
    | 'submit'
    | 'addAction'
    | 'empty';
  const progressDraftEdited = ref(false);
  const resourcesSection = ref<HTMLElement | null>(null);
  const boardSection = ref<HTMLElement | null>(null);
  const timelineSection = ref<HTMLElement | null>(null);
  const progressInput = ref<InstanceType<typeof BInput> | null>(null);
  const activeSection = ref('progress');
  const projectHead = ref<HTMLElement | null>(null);
  const headerPinned = ref(false);
  const sectionNav = ref<HTMLElement | null>(null);
  const progressSection = ref<HTMLElement | null>(null);
  let initializationVersion = 0;
  const createForm = reactive({ title: '', goal: '', targetDate: '', nextStep: '' });

  const workspaceQuery = computed(() => String(route.query.workspace || '').trim());
  const durationOptions = computed(() =>
    [0, 15, 25, 45, 60, 90].map((value) => ({
      value,
      label: value
        ? t('toolbox.workspace.durationMinutes', { count: value })
        : t('toolbox.workspace.durationUnspecified'),
    })),
  );
  const loopItems = computed(() => [
    { key: 'context', icon: icon.noteTemplate.knowledge },
    { key: 'next', icon: icon.noteTemplate.project },
    { key: 'rhythm', icon: icon.noteTemplate.review },
  ]);

  const existingResourceKeys = computed(
    () => workspace.value?.resources.map((item) => `${item.type}:${item.resourceId}`) || [],
  );
  const canSaveProgress = computed(() =>
    Boolean(String(progressSummary.value || '').trim() || String(progressNextStep.value || '').trim()),
  );

  const rootRef = ref<HTMLElement | null>(null);
  const goalExpanded = ref(false);
  const mobileLane = ref<ToolboxWorkspaceLane>('inbox');
  const projectTabs = computed(() =>
    ['progress', 'resources', 'board', 'timeline'].map((key) => ({
      key,
      label: stepText(key as WorkspaceSectionKey, 'label'),
    })),
  );
  const projectSearch = computed({
    get: () => String(route.query.q || ''),
    set: (q) => {
      void router.replace({ query: { ...route.query, q: q || undefined } });
    },
  });
  const projectStatus = computed({
    get: () => String(route.query.status || 'active'),
    set: (status) => {
      void router.replace({ query: { ...route.query, status } });
    },
  });
  const projectKind = computed({
    get: () => String(route.query.kind || ''),
    set: (kind) => {
      void router.replace({ query: { ...route.query, kind: kind || undefined } });
    },
  });
  const statusOptions = computed(() =>
    ['active', 'paused', 'completed'].map((value) => ({ value, label: statusLabel(value as ToolboxWorkspaceStatus) })),
  );
  const filteredWorkspaces = computed(() =>
    workspaces.value.filter(
      (item) =>
        item.status === projectStatus.value &&
        (!projectKind.value || item.kind === projectKind.value) &&
        item.title.toLocaleLowerCase().includes(projectSearch.value.toLocaleLowerCase()),
    ),
  );
  const resourceSearch = ref('');
  const selectedResourceKeys = ref<string[]>([]);
  const outcomeOpen = ref(false);
  const filteredResources = computed(() =>
    (workspace.value?.resources || []).filter((item) =>
      item.title.toLocaleLowerCase().includes(resourceSearch.value.toLocaleLowerCase()),
    ),
  );
  const outcomeResources = computed(() =>
    (workspace.value?.resources || [])
      .filter(
        (item) => item.available !== false && selectedResourceKeys.value.includes(`${item.type}:${item.resourceId}`),
      )
      .map((item) => ({ type: item.type, id: item.resourceId, title: item.title })),
  );
  const defaultOutcomeTool = computed(
    () => ({ research: 'research_brief', learning: 'study_kit', writing: 'material_to_note' })[kind.value],
  );
  function toggleResource(item: ToolboxWorkspaceResource, checked: boolean) {
    const key = `${item.type}:${item.resourceId}`;
    selectedResourceKeys.value = checked
      ? [...new Set([...selectedResourceKeys.value, key])]
      : selectedResourceKeys.value.filter((value) => value !== key);
  }
  let chromeObserver: ResizeObserver | null = null;
  function stickyInset() {
    const head = projectHead.value?.offsetHeight ?? 48;
    const rail = sectionNav.value && getComputedStyle(sectionNav.value).getPropertyValue('--project-nav-layout').trim() === 'rail';
    const scrollPadding = scrollOwner ? parseFloat(getComputedStyle(scrollOwner).paddingTop) || 0 : 0;
    return scrollPadding + head + (rail ? 0 : sectionNav.value?.offsetHeight || 0) + 20;
  }
  function measureProjectChrome() {
    rootRef.value?.style.setProperty('--project-scroll-padding', `${scrollOwner ? parseFloat(getComputedStyle(scrollOwner).paddingTop) || 0 : 0}px`);
    rootRef.value?.style.setProperty('--project-head-height', `${projectHead.value?.offsetHeight ?? 48}px`);
    rootRef.value?.style.setProperty('--project-sticky-inset', `${stickyInset()}px`);
  }
  let scrollOwner: HTMLElement | null = null;
  let scrollFrame = 0;
  let locationTimer = 0;
  function sectionElements() {
    return [progressSection.value, resourcesSection.value, boardSection.value, timelineSection.value];
  }
  function syncSection() {
    scrollFrame = 0;
    if (!workspace.value || !sectionNav.value || !scrollOwner) return;
    measureProjectChrome();
    headerPinned.value = !!projectHead.value && projectHead.value.getBoundingClientRect().top <= scrollOwner.getBoundingClientRect().top + (parseFloat(getComputedStyle(scrollOwner).paddingTop) || 0) + 1;
    const scale = scrollOwner.getBoundingClientRect().height / scrollOwner.offsetHeight || 1;
    const threshold = scrollOwner.getBoundingClientRect().top + (stickyInset() + 4) * scale;
    const elements = sectionElements();
    let index = 0;
    elements.forEach((element, i) => {
      if (element && element.getBoundingClientRect().top <= threshold) index = i;
    });
    if (scrollOwner.scrollTop > 0 && scrollOwner.scrollTop + scrollOwner.clientHeight >= scrollOwner.scrollHeight - 4)
      index = 3;
    const key = ['progress', 'resources', 'board', 'timeline'][index];
    activeSection.value = key;
    window.clearTimeout(locationTimer);
    locationTimer = window.setTimeout(() => {
      if (workspace.value && route.query.tab !== key) void router.replace({ query: { ...route.query, tab: key } });
    }, 180);
  }
  function onProjectScroll() {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(syncSection);
  }
  function detachProjectScroll() {
    chromeObserver?.disconnect();
    chromeObserver = null;
    scrollOwner?.removeEventListener('scroll', onProjectScroll);
    window.removeEventListener('resize', onProjectScroll);
    window.cancelAnimationFrame(scrollFrame);
    window.clearTimeout(locationTimer);
    scrollFrame = 0;
    scrollOwner = null;
  }
  function attachProjectScroll() {
    detachProjectScroll();
    if (!rootRef.value || !workspace.value) return;
    scrollOwner = findScrollContainer(rootRef.value);
    measureProjectChrome();
    if (typeof ResizeObserver !== 'undefined') {
      chromeObserver = new ResizeObserver(measureProjectChrome);
      if (projectHead.value) chromeObserver.observe(projectHead.value);
      if (sectionNav.value) chromeObserver.observe(sectionNav.value);
    }
    scrollOwner.addEventListener('scroll', onProjectScroll, { passive: true });
    window.addEventListener('resize', onProjectScroll, { passive: true });
    onProjectScroll();
  }
  async function selectProjectTab(tab: string, smooth = true) {
    const index = ['progress', 'resources', 'board', 'timeline'].indexOf(tab);
    const section = sectionElements()[index];
    if (!section || !rootRef.value || !sectionNav.value) return;
    const container = findScrollContainer(rootRef.value);
    const scale = container.getBoundingClientRect().height / container.offsetHeight || 1;
    const inset = stickyInset();
    const top =
      container.scrollTop +
      (section.getBoundingClientRect().top - container.getBoundingClientRect().top) / scale -
      inset;
    container.scrollTo({
      top: Math.max(0, top),
      behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto',
    });
    onProjectScroll();
  }
  function templateText(key: string) {
    return t(`toolbox.workspace.template.${kind.value}.${key}`);
  }
  function stepText(section: WorkspaceSectionKey, key: WorkspaceStepTextKey) {
    return templateText(`steps.${section}.${key}`);
  }
  function statusLabel(status: ToolboxWorkspaceStatus) {
    return t(`toolbox.workspace.status.${status}`);
  }
  function statusTone(status: ToolboxWorkspaceStatus): 'success' | 'pending' | 'neutral' {
    if (status === 'active') return 'success';
    if (status === 'paused') return 'pending';
    return 'neutral';
  }
  function resourceIcon(type: ToolboxWorkspaceResource['type']) {
    if (type === 'bookmark') return icon.resource.bookmark;
    if (type === 'file') return icon.resource.file;
    return icon.resource.note;
  }
  function formatDate(value: string) {
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }).format(date);
  }
  function formatDateTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale.value, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(date);
  }
  function formatRelative(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const days = Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000));
    if (days <= 0) return t('toolbox.workspace.updatedToday');
    if (days === 1) return t('toolbox.workspace.updatedYesterday');
    if (days < 30) return t('toolbox.workspace.updatedDaysAgo', { count: days });
    return formatDate(value);
  }
  const staleRequest = Symbol('stale-workspace');
  function scopedRequest<T extends (...args: any[]) => Promise<any>>(request: T): T {
    return (async (...args: Parameters<T>) => {
      const owner = ownerKey.value,
        version = initializationVersion;
      try {
        const result = await request(...args);
        if (owner !== ownerKey.value || version !== initializationVersion) throw staleRequest;
        return result;
      } catch (error) {
        if (owner !== ownerKey.value || version !== initializationVersion) throw staleRequest;
        throw error;
      }
    }) as T;
  }
  const addToolboxWorkspaceResources = scopedRequest(requestaddToolboxWorkspaceResources);
  const createToolboxWorkspace = scopedRequest(requestcreateToolboxWorkspace);
  const createToolboxWorkspaceSession = scopedRequest(requestcreateToolboxWorkspaceSession);
  const fetchToolboxWorkspaces = scopedRequest(requestfetchToolboxWorkspaces);
  const removeToolboxWorkspaceResource = scopedRequest(requestremoveToolboxWorkspaceResource);
  const updateToolboxWorkspace = scopedRequest(requestupdateToolboxWorkspace);
  function applyWorkspace(value: ToolboxWorkspace) {
    workspace.value = value;
    if (!progressDraftEdited.value) progressNextStep.value = value.nextStep || '';
  }
  function showMutationError(error: unknown) {
    if (error === staleRequest) return;
    message.error(error instanceof Error && error.message ? error.message : t('toolbox.workspace.operationFailed'));
  }
  async function loadWorkspaceList() {
    try {
      workspaces.value = await fetchToolboxWorkspaces();
    } catch (error) {
      if (error === staleRequest) throw error;
      // A secondary list refresh must not turn a committed write into a retryable failure.
    }
  }
  function rememberProjectView() {
    const container = rootRef.value ? findScrollContainer(rootRef.value) : null;

    window.history.replaceState(
      {
        ...window.history.state,
        workshopView: {
          owner: ownerKey.value,
          project: workspaceQuery.value,
          resourceSearch: resourceSearch.value,
          selected: [...selectedResourceKeys.value],
          pageScroll: container?.scrollTop || 0,
          mobileLane: mobileLane.value,
          summary: progressSummary.value,
          nextStep: progressNextStep.value,
          duration: progressDuration.value,
        },
      },
      '',
    );
  }
  async function restoreProjectView() {
    const state = window.history.state?.workshopView;
    if (!state || state.owner !== ownerKey.value || state.project !== workspaceQuery.value) {
      await nextTick();
      if (route.query.tab) await selectProjectTab(String(route.query.tab), false);
      return;
    }
    resourceSearch.value = String(state.resourceSearch || '');
    selectedResourceKeys.value = Array.isArray(state.selected) ? state.selected : [];
    if (lanes.includes(state.mobileLane)) mobileLane.value = state.mobileLane;
    progressSummary.value = String(state.summary || '');
    progressNextStep.value = String(state.nextStep ?? workspace.value?.nextStep ?? '');
    progressDraftEdited.value = Boolean(state.summary) || progressNextStep.value !== (workspace.value?.nextStep || '');
    progressDuration.value = Number(state.duration) || 0;
    await nextTick();
    const container = rootRef.value ? findScrollContainer(rootRef.value) : null;
    if (container) container.scrollTop = Number(state.pageScroll) || 0;
  }
  onBeforeRouteLeave(() => {
    rememberProjectView();
  });
  async function initialize() {
    const version = ++initializationVersion;
    const requestedWorkspaceId = workspaceQuery.value;
    loading.value = true;
    loadError.value = false;
    try {
      const workspaceList = await fetchToolboxWorkspaces();
      const workspaceDetail = requestedWorkspaceId ? await fetchToolboxWorkspace(requestedWorkspaceId) : null;
      if (version !== initializationVersion) return;
      workspaces.value = workspaceList;
      if (workspaceDetail) {
        applyWorkspace(workspaceDetail);
        if (!visitorPreview.value) void markToolboxWorkspaceOpened(requestedWorkspaceId, entrySource.value).catch(() => undefined);
      } else {
        workspace.value = null;
        if (!requestedWorkspaceId && String(route.query.create || '') === '1') {
          openCreateModal();
          const query = { ...route.query };
          delete query.create;
          await router.replace({ query });
        }
      }
    } catch {
      if (version === initializationVersion) loadError.value = true;
    } finally {
      if (version === initializationVersion) {
        loading.value = false;
        await restoreProjectView();
        attachProjectScroll();
      }
    }
  }
  async function reloadCurrent() {
    await initialize();
  }
  function resetCreateForm() {
    createForm.title = '';
    createForm.goal = '';
    createForm.targetDate = '';
    createForm.nextStep = '';
  }
  function openCreateModal() {
    if (blockGuestWrite('toolbox-project')) return;
    workspaceFormMode.value = 'create';
    resetCreateForm();
    createModalVisible.value = true;
  }
  function openEditModal() {
    if (blockGuestWrite('toolbox-project')) return;
    if (!workspace.value) return;
    workspaceFormMode.value = 'edit';
    editStatus.value = workspace.value.status;
    createForm.title = workspace.value.title;
    createForm.goal = workspace.value.goal || workspace.value.description || '';
    createForm.targetDate = workspace.value.targetDate || '';
    createForm.nextStep = workspace.value.nextStep || '';
    createModalVisible.value = true;
  }
  async function saveWorkspaceForm() {
    if (blockGuestWrite('toolbox-project')) return;
    if (!createForm.title.trim() || creating.value) return;
    const mutationVersion = initializationVersion;
    creating.value = true;
    try {
      if (workspaceFormMode.value === 'edit' && workspace.value) {
        applyWorkspace(
          await updateToolboxWorkspace(workspace.value.id, {
            status: editStatus.value,
            title: createForm.title,
            goal: createForm.goal,
            targetDate: createForm.targetDate || null,
            nextStep: createForm.nextStep,
          }),
        );
        createModalVisible.value = false;
        await loadWorkspaceList();
        message.success(t('toolbox.workspace.updated'));
        return;
      }
      const created = await createToolboxWorkspace(
        {
          kind: createKind.value,
          title: createForm.title,
          goal: createForm.goal,
          targetDate: createForm.targetDate || null,
          nextStep: createForm.nextStep,
        },
        entrySource.value,
      );
      createModalVisible.value = false;
      await loadWorkspaceList();
      await router.push({ query: { ...route.query, workspace: created.id } });
      applyWorkspace(created);
      message.success(t('toolbox.workspace.created'));
    } catch (error) {
      showMutationError(error);
    } finally {
      if (mutationVersion === initializationVersion) creating.value = false;
    }
  }
  async function openWorkspace(id: string) {
    if (workspaceQuery.value === id) {
      await initialize();
      return;
    }
    await router.push({ query: { ...route.query, workspace: id } });
  }
  async function leaveWorkspace() {
    const query = { ...route.query };
    delete query.workspace;
    delete query.tab;
    await router.push({ query });
  }
  async function focusProgressForm() {
    if (blockGuestWrite('toolbox-project')) return;
    progressDraftEdited.value = true;
    await selectProjectTab('progress');
    progressInput.value?.$el?.querySelector('textarea')?.focus({ preventScroll: true });
  }
  async function saveProgress() {
    if (blockGuestWrite('toolbox-project')) return;
    if (!workspace.value || !canSaveProgress.value || savingProgress.value) return;
    const mutationVersion = initializationVersion;
    savingProgress.value = true;
    try {
      applyWorkspace(
        await createToolboxWorkspaceSession(workspace.value.id, {
          summary: progressSummary.value,
          nextStep: progressNextStep.value,
          durationMinutes: progressDuration.value,
        }),
      );
      progressSummary.value = '';
      await loadWorkspaceList();
      message.success(t('toolbox.workspace.progressSaved'));
      progressDraftEdited.value = false;
      await selectProjectTab('timeline');
    } catch (error) {
      showMutationError(error);
    } finally {
      if (mutationVersion === initializationVersion) savingProgress.value = false;
    }
  }
  function openResourceModal() {
    if (blockGuestWrite('toolbox-project')) return;
    pendingResources.value = [];
    resourceModalVisible.value = true;
  }
  async function saveResources() {
    if (blockGuestWrite('toolbox-project')) return;
    if (!workspace.value || !pendingResources.value.length || mutating.value) return;
    const mutationVersion = initializationVersion;
    mutating.value = true;
    try {
      applyWorkspace(
        await addToolboxWorkspaceResources(
          workspace.value.id,
          pendingResources.value.flatMap((item) =>
            item.type === 'note' || item.type === 'bookmark' || item.type === 'file'
              ? [{ type: item.type, id: String(item.id), title: item.title }]
              : [],
          ),
        ),
      );
      resourceModalVisible.value = false;
      pendingResources.value = [];
      await loadWorkspaceList();
    } catch (error) {
      showMutationError(error);
    } finally {
      if (mutationVersion === initializationVersion) mutating.value = false;
    }
  }
  function openLinkedResource(resource: ToolboxWorkspaceResource) {
    rememberProjectView();
    const target = resolveResourceRoute(
      { type: resource.type, id: resource.resourceId, title: resource.title },
      { noteReturnPath: route.fullPath },
    );
    if (target) void router.push(target);
  }
  function confirmRemoveResource(resource: ToolboxWorkspaceResource) {
    if (blockGuestWrite('toolbox-project')) return;
    const version = initializationVersion;
    Alert.alert({
      title: t('toolbox.workspace.removeResource', { title: resource.title || resource.resourceId }),
      content: t('toolbox.workspace.removeResourceConfirm'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: () => { if (version === initializationVersion) return removeResource(resource); },
    });
  }
  async function removeResource(resource: ToolboxWorkspaceResource) {
    if (blockGuestWrite('toolbox-project')) return;
    if (!workspace.value || mutating.value) return;
    const mutationVersion = initializationVersion;
    mutating.value = true;
    try {
      applyWorkspace(
        await removeToolboxWorkspaceResource(workspace.value.id, { type: resource.type, id: resource.resourceId }),
      );
      await loadWorkspaceList();
    } catch (error) {
      showMutationError(error);
    } finally {
      if (mutationVersion === initializationVersion) mutating.value = false;
    }
  }
  function selectResourceRow(resource: ToolboxWorkspaceResource, event: MouseEvent) {
    if (resource.available === false || (event.target as HTMLElement).closest('button, input, label, [role="checkbox"]')) return;
    toggleResource(resource, !selectedResourceKeys.value.includes(`${resource.type}:${resource.resourceId}`));
  }
  function handleBoardUpdated(value: ToolboxWorkspace) {
    applyWorkspace(value);
    void loadWorkspaceList();
  }

  watch([() => props.toolId, workspaceQuery, ownerKey], () => {
    createKind.value = toolboxWorkspaceKind(props.toolId);
    detachProjectScroll();
    workspaces.value = [];
    progressSummary.value = '';
    progressNextStep.value = '';
    progressDuration.value = 0;
    createModalVisible.value = resourceModalVisible.value = outcomeOpen.value = false;
    creating.value = mutating.value = savingProgress.value = false;
    workspace.value = null;
    selectedResourceKeys.value = [];
    resourceSearch.value = '';
    progressDraftEdited.value = false;
    goalExpanded.value = false;
    void initialize();
  });
  onMounted(initialize);
  onBeforeUnmount(() => {
    initializationVersion++;
    detachProjectScroll();
  });
</script>

<style lang="less" scoped>
  @import (reference) "@/assets/css/workspace-surfaces.less";
  .knowledge-workspace {
    --workspace-accent: #615ced;
    --workspace-accent-soft: rgba(97, 92, 237, 0.09);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 20px;
    min-width: 0;
    color: var(--text-color);
  }
  .knowledge-workspace.is-research {
    --workspace-accent: #3f7de8;
    --workspace-accent-soft: rgba(63, 125, 232, 0.09);
  }
  .knowledge-workspace.is-learning {
    --workspace-accent: #129b77;
    --workspace-accent-soft: rgba(18, 155, 119, 0.09);
  }
  .knowledge-workspace__state {
    min-height: 280px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--desc-color);
  }
  .knowledge-workspace__state.is-error strong {
    color: var(--text-color);
  }
  .knowledge-workspace__state-actions {
    display: flex;
    gap: 8px;
  }
  .workspace-list-intro,
  .workspace-detail-head,
  .workspace-section__head,
  .workspace-list-section > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }
  .workspace-list-intro {
    padding: 4px 4px 0;
  }
  .workspace-list-intro__copy {
    max-width: 760px;
  }
  .workspace-kicker,
  .workspace-section__kicker {
    color: var(--workspace-accent);
    font-size: 12px;
    font-weight: 750;
    letter-spacing: 0.04em;
  }
  .workspace-list-intro h2,
  .workspace-summary h2,
  .workspace-section h3,
  .workspace-list-section h3 {
    margin: 6px 0 0;
    color: var(--text-color);
  }
  .workspace-list-intro h2 {
    font-size: clamp(24px, 3vw, 34px);
    line-height: 1.18;
  }
  .workspace-list-intro p,
  .workspace-section__head p,
  .workspace-list-section > header p {
    margin: 7px 0 0;
    color: var(--desc-color);
    line-height: 1.65;
  }
  .workspace-loop {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .workspace-loop article {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color);
  }
  .workspace-loop article > span,
  .workspace-summary__icon,
  .workspace-card__icon,
  .workspace-modal-callout > span {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    color: var(--workspace-accent);
    background: var(--workspace-accent-soft);
  }
  .workspace-loop article > span {
    width: 38px;
    height: 38px;
    border-radius: 11px;
  }
  .workspace-loop div {
    display: grid;
    min-width: 0;
    gap: 3px;
  }
  .workspace-loop small {
    color: var(--desc-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .workspace-section,
  .workspace-summary,
  .workspace-resume {
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    box-shadow: var(--surface-card-shadow);
  }
  :deep(.board-card) { scroll-margin-top: var(--project-sticky-inset, 150px); }
  .workspace-section {
    padding: 22px;
  }
  .workspace-list-section {
    padding: 0;
  }
  .workspace-section {
    scroll-margin-top: var(--project-sticky-inset, 150px);
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }
  .workspace-section.is-section-focused {
    border: 2px solid var(--workspace-accent);
    box-shadow: 0 0 0 3px var(--workspace-accent-soft);
  }
  .workspace-card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 12px;
    margin-top: 12px;
  }
  .workspace-card-grid :deep(.workspace-card) {
    width: 100%;
    height: auto;
    padding: 14px 16px;
    line-height: 1.4;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: 12px;
    text-align: left;
    white-space: normal;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
  }
  .workspace-card__top,
  .workspace-card__meta,
  .workspace-summary__meta,
  .workspace-timeline header {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .workspace-card__top {
    align-items: center;
    min-width: 0;
  }
  .workspace-card__top :deep(.b-chip) {
    flex-shrink: 0;
  }
  .workspace-card__copy {
    flex: 1;
    min-width: 0;
  }
  .workspace-card__icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
  }
  .workspace-card__copy,
  .workspace-card__next {
    display: grid;
    gap: 6px;
  }
  .workspace-card__copy > strong {
    font-size: 15px;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .workspace-card__copy small,
  .workspace-card__next small,
  .workspace-card__meta {
    color: var(--desc-color);
  }
  .workspace-card__copy small {
    font-size: 11px;
    line-height: 1.4;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .workspace-card__next {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 9px 10px;
    border-radius: 8px;
    background: var(--workspace-canvas);
  }
  .workspace-card__next small {
    flex-shrink: 0;
    font-size: 11px;
  }
  .workspace-card__next strong {
    font-size: 12px;
    font-weight: 500;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    overflow-wrap: anywhere;
  }
  .workspace-card__meta {
    margin-top: auto;
    flex-wrap: wrap;
    gap: 4px 8px;
    font-size: 11px;
  }
  .workspace-card__meta > :last-child {
    margin-left: auto;
    color: var(--workspace-accent);
  }
  .workspace-empty {
    min-height: 260px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 8px;
  }
  .workspace-empty > span {
    width: 58px;
    height: 58px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--workspace-accent);
    border-radius: 17px;
    background: var(--workspace-accent-soft);
  }
  .workspace-empty h3,
  .workspace-empty p {
    margin: 0;
  }
  .workspace-empty p {
    max-width: 480px;
    color: var(--desc-color);
    line-height: 1.6;
  }
  .workspace-detail-head {
    position: sticky;
    top: 0;
    z-index: 14;
    align-self: start;
    min-height: 48px;
    min-width: 0;
    padding: 6px 0;
    background: var(--workspace-open-canvas, var(--card-background));
    border-bottom: 1px solid var(--surface-border-color);
  }
  .workspace-detail-head::before { content: ''; position: absolute; bottom: 100%; left: 0; right: 0; height: var(--project-scroll-padding, 0px); background: inherit; pointer-events: none; }
  .workspace-detail-head.is-pinned { box-shadow: 0 5px 12px -10px rgba(20, 24, 40, .35); }
  .workspace-detail-head__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  :deep(.workspace-detail-head__back) {
    padding-left: 0;
    background: transparent;
  }
  .workspace-summary {
    padding: 24px;
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(420px, 1fr);
    gap: 24px;
  }
  .workspace-summary__main {
    display: flex;
    gap: 16px;
    min-width: 0;
  }
  .workspace-summary__icon {
    width: 58px;
    height: 58px;
    border-radius: 17px;
  }
  .workspace-summary__main > div {
    min-width: 0;
  }
  .workspace-summary__meta small {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--desc-color);
  }
  .workspace-summary h2 {
    font-size: clamp(24px, 3vw, 32px);
    overflow-wrap: anywhere;
  }
  .workspace-summary__main p {
    margin: 8px 0 0;
    color: var(--desc-color);
    line-height: 1.6;
  }
  .workspace-summary__metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
    align-self: center;
  }
  .workspace-summary__metrics article {
    display: grid;
    gap: 3px;
    padding: 12px 10px;
    text-align: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .workspace-summary__metrics strong {
    font-size: 21px;
  }
  .workspace-summary__metrics span {
    color: var(--desc-color);
    font-size: 11px;
  }
  .workspace-summary__metrics .is-streak strong {
    color: var(--workspace-accent);
  }
  .workspace-resume {
    display: grid;
    grid-template-columns: minmax(260px, 1fr) minmax(280px, 1.4fr) auto;
    align-items: center;
    gap: 20px;
    padding: 18px 20px;
    border-left: 4px solid var(--workspace-accent);
  }
  .workspace-resume__lead {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
  }
  .workspace-resume__lead > span {
    width: 38px;
    height: 38px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    color: var(--workspace-accent);
    border-radius: 11px;
    background: var(--workspace-accent-soft);
  }
  .workspace-resume__lead div,
  .workspace-resume__copy {
    display: grid;
    min-width: 0;
    gap: 3px;
  }
  .workspace-resume__lead small,
  .workspace-resume__copy p {
    color: var(--desc-color);
  }
  .workspace-resume__lead strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .workspace-resume__copy h3,
  .workspace-resume__copy p {
    margin: 0;
  }
  .workspace-section-nav {
    padding: 7px;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color);
  }
  .workspace-section-nav :deep(.workspace-section-nav__item) {
    width: 100%;
    height: 46px;
    padding: 0 12px;
    justify-content: flex-start;
    gap: 9px;
    color: var(--desc-color);
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
  }
  .workspace-section-nav__item > span {
    width: 27px;
    height: 27px;
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    color: var(--workspace-accent);
    border: 1px solid var(--workspace-accent);
    border-radius: 8px;
    font-size: 11px;
    font-weight: 750;
    line-height: 1;
  }
  .workspace-section-nav__item > strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .workspace-section-nav :deep(.workspace-section-nav__item.is-active) {
    color: var(--text-color);
    border-color: var(--workspace-accent);
    background: var(--card-background);
  }
  .workspace-section-nav__item.is-active > span {
    color: #fff;
    background: var(--workspace-accent);
  }
  .workspace-progress-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 150px auto;
    align-items: end;
    gap: 12px;
    margin-top: 18px;
  }
  .workspace-progress-form__summary,
  .workspace-progress-form__hint {
    grid-column: 1 / -1;
  }
  .workspace-progress-form__hint {
    margin: -3px 0 2px;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.5;
  }
  .workspace-progress-form__hint.is-ready {
    color: var(--workspace-accent);
  }
  .workspace-progress-form label,
  .workspace-modal-form label {
    display: grid;
    gap: 7px;
    min-width: 0;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 650;
  }
  .workspace-progress-form :deep(.b-textarea),
  .workspace-modal-form :deep(.b-textarea) {
    color: var(--text-color);
    border-color: var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }
  .workspace-progress-form :deep(.b-textarea) {
    height: 118px;
    min-height: 118px;
    max-height: 118px;
    padding: 11px 12px !important;
    resize: none;
    line-height: 1.6;
  }
  .workspace-progress-form :deep(.b-input) {
    color: var(--text-color);
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 8px;
    background: var(--workspace-panel-bg-color) !important;
  }
  .workspace-progress-form :deep(.b-input:focus-visible) {
    border-color: var(--workspace-accent) !important;
    outline: 2px solid var(--workspace-accent-soft);
    outline-offset: 1px;
  }
  .workspace-progress-form :deep(.select-trigger) {
    min-height: 42px;
  }
  .workspace-modal-form :deep(.b-datetime-trigger) {
    min-height: 42px;
  }
  .workspace-resource-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-top: 18px;
  }
  .workspace-resource-grid article {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 11px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }
  .workspace-resource-grid__icon {
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border-radius: 10px;
    color: var(--resource-note-color);
    background: var(--workspace-accent-soft);
  }
  .workspace-resource-grid__icon.is-bookmark {
    color: var(--primary-color);
  }
  .workspace-resource-grid__icon.is-file {
    color: var(--resource-file-color);
  }
  .workspace-resource-grid article > div {
    min-width: 0;
    flex: 1;
    display: grid;
    gap: 2px;
  }
  .workspace-resource-grid strong,
  .workspace-resource-grid small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .workspace-resource-grid small {
    color: var(--desc-color);
  }
  .workspace-resource-grid article > :deep(.b_btn) {
    margin-left: auto;
    width: 32px;
    padding: 0;
  }
  .workspace-resource-grid article:not(.is-unavailable) { cursor: pointer; }
  .workspace-resource-grid article.is-selected { border-color: var(--workspace-accent); }
  .workspace-resource-grid article:focus-within { outline: 2px solid var(--workspace-accent); outline-offset: 2px; }
  .workspace-resource-link.b_btn,
  .workspace-resource-link.b_btn:hover { background: transparent; }
  .workspace-resource-link {
    display: block;
    width: 100%;
    height: auto;
    min-height: 32px;
    padding: 0;
    text-align: left;
    line-height: 1.5;
    white-space: normal;
    overflow-wrap: anywhere;
    color: var(--primary-color);
    background: transparent;
  }
  .workspace-section-empty {
    min-height: 110px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 16px;
    color: var(--desc-color);
    border: 1px dashed var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .workspace-timeline {
    display: grid;
    margin-top: 18px;
  }
  .workspace-timeline article {
    position: relative;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 10px;
    min-width: 0;
    padding-bottom: 18px;
  }
  .workspace-timeline article:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 13px;
    bottom: -1px;
    width: 1px;
    background: var(--surface-divider-color);
  }
  .workspace-timeline__dot {
    z-index: 1;
    width: 11px;
    height: 11px;
    margin-top: 4px;
    border: 3px solid var(--card-background);
    border-radius: 50%;
    background: var(--workspace-accent);
    box-shadow: 0 0 0 1px var(--workspace-accent);
  }
  .workspace-timeline article > div {
    padding: 12px 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }
  .workspace-timeline header {
    justify-content: space-between;
  }
  .workspace-timeline p,
  .workspace-timeline small {
    margin: 7px 0 0;
    color: var(--desc-color);
    line-height: 1.6;
  }
  .workspace-timeline small {
    display: block;
  }
  .workspace-modal-form,
  .workspace-resource-modal {
    display: grid;
    gap: 18px;
  }
  .workspace-modal-callout {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px;
    border-radius: 12px;
    background: var(--workspace-accent-soft);
  }
  .workspace-modal-callout > span {
    width: 40px;
    height: 40px;
    border-radius: 11px;
  }
  .workspace-modal-callout p {
    margin: 3px 0 0;
    color: var(--desc-color);
    line-height: 1.5;
  }
  .workspace-modal-form__row {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 12px;
  }
  .workspace-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
    padding-top: 4px;
  }
  .workspace-resource-modal {
    min-height: 0;
  }
  .workspace-resource-modal__footer {
    flex: 0 0 auto;
    padding: 12px 20px 16px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 9px;
    border-top: 1px solid var(--surface-border-color);
    background: var(--card-background);
    box-shadow: 0 -10px 24px rgba(31, 34, 66, 0.04);
  }
  .workspace-resource-modal__footer :deep(.b_btn) {
    min-width: 92px;
  }
  @media (hover: hover) and (pointer: fine) {
    .workspace-card-grid :deep(.workspace-card:hover) {
      border-color: var(--workspace-accent);
      box-shadow: var(--surface-hover-shadow);
      transform: translateY(-2px);
    }
  }
  @media (max-width: 1180px) {
    .workspace-resource-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .workspace-summary {
      grid-template-columns: 1fr;
    }
    .workspace-summary__metrics {
      max-width: 580px;
    }
    .workspace-progress-form {
      grid-template-columns: minmax(0, 1fr) 150px auto;
    }
    .workspace-resume {
      grid-template-columns: 1fr auto;
    }
    .workspace-resume__copy {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
  @media (max-width: 860px) {
    .workspace-loop {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 767px) {
    .workspace-resource-modal {
      height: 100%;
      padding: 12px 16px;
      box-sizing: border-box;
      grid-template-rows: minmax(0, 1fr);
      gap: 0;
    }
    .workspace-resource-modal__footer {
      padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
    }
    .workspace-resource-modal__footer :deep(.b_btn) {
      flex: 1;
      width: auto;
      min-height: 44px;
    }
    .knowledge-workspace {
      gap: 14px;
    }
    .workspace-list-intro,
    .workspace-section__head,
    .workspace-list-section > header {
      align-items: stretch;
      flex-direction: column;
    }
    .workspace-list-intro :deep(.b_btn),
    .workspace-section__head :deep(.b_btn) {
      width: 100%;
      min-height: 44px;
    }
    .workspace-loop {
      gap: 8px;
    }
    .workspace-loop article {
      padding: 12px;
    }
    .workspace-section,
    .workspace-summary {
      padding: 16px;
      border-radius: 15px;
    }
    .workspace-card-grid,
    .workspace-resource-grid,
    .workspace-progress-form,
    .workspace-modal-form__row {
      grid-template-columns: 1fr;
    }
    .workspace-section-nav {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .workspace-section {
      scroll-margin-top: var(--project-sticky-inset, 148px);
    }
    .workspace-section-nav :deep(.workspace-section-nav__item) {
      min-width: 0;
      padding: 0 9px;
    }
    .workspace-progress-form__summary,
    .workspace-progress-form__hint {
      grid-column: auto;
    }
    .workspace-detail-head {
      align-items: flex-start;
    }
    .workspace-detail-head__actions {
      flex-wrap: nowrap;
      max-width: 62vw;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .workspace-detail-head__actions::-webkit-scrollbar {
      display: none;
    }
    .workspace-detail-head__actions :deep(.b_btn) {
      min-height: 36px;
    }
    .workspace-summary__main {
      align-items: flex-start;
    }
    .workspace-summary__icon {
      width: 48px;
      height: 48px;
    }
    .workspace-summary__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .workspace-resume {
      grid-template-columns: 1fr;
      padding: 15px;
    }
    .workspace-resume__copy {
      grid-column: auto;
      grid-row: auto;
    }
    .workspace-resume :deep(.b_btn),
    .workspace-progress-form > :deep(.b_btn) {
      width: 100%;
      min-height: 44px;
    }
    .workspace-resource-grid article {
      min-height: 52px;
    }
    .workspace-modal-actions {
      position: sticky;
      bottom: 0;
      padding: 10px 0 0;
      background: var(--card-background);
    }
    .workspace-modal-actions :deep(.b_btn) {
      flex: 1;
      width: auto;
      min-height: 44px;
    }
  }
  :global(html.light-note-mobile-rendering .workspace-section.is-section-focused) {
    border: 2px solid var(--workspace-accent);
    box-shadow: none;
  }
  :global(html.light-note-mobile-rendering .workspace-timeline__dot) {
    border-color: var(--card-background);
    box-shadow: none;
  }

  .workspace-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .workspace-filters > :first-child {
    flex: 1;
    min-width: 180px;
  }
  .workspace-summary {
    grid-template-columns: minmax(0, 1fr);
    padding: 20px;
  }
  .workspace-summary__main p.is-collapsed {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .workspace-resume {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .workspace-resume__lead strong {
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .workspace-resource-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 767px) {
    .workspace-card-grid,
    .workspace-resource-grid {
      grid-template-columns: 1fr;
    }
    .workspace-filters {
      flex-direction: column;
      align-items: stretch;
    }
  }
  @media (max-width: 767px) {
    .workspace-resume {
      grid-template-columns: minmax(0, 1fr);
      gap: 14px;
    }
    .workspace-resume > :deep(.b_btn) {
      width: 100%;
    }
    .workspace-resume__lead {
      width: 100%;
    }
    .workspace-summary__main {
      align-items: flex-start;
      gap: 12px;
    }
    .workspace-summary__icon {
      width: 38px;
      height: 38px;
      flex-basis: 38px;
    }
    .workspace-summary {
      padding: 16px;
    }
    .workspace-summary__meta {
      flex-wrap: wrap;
    }
  }
  .workspace-section {
    animation: project-view-enter 140ms ease-out;
  }
  @keyframes project-view-enter {
    from {
      opacity: 0.7;
      transform: translateY(3px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .workspace-section {
      animation: none;
    }
  }

  .project-section-navigation {
    position: sticky;
    top: var(--project-head-height, 48px);
    z-index: 12;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    padding: 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    box-shadow: 0 6px 22px rgba(20, 24, 40, 0.06);
  }
  .project-section-navigation > .b_btn {
    width: 100%;
    height: auto;
    min-height: 48px;
    justify-content: flex-start;
    gap: 9px;
    white-space: normal;
    background: transparent;
    color: var(--desc-color);
    border: 1px solid transparent;
    border-radius: 9px;
    transition:
      background 160ms ease,
      border-color 160ms ease,
      color 160ms ease;
  }
  .project-section-navigation > .is-current {
    border-color: var(--workspace-accent);
    background: var(--workspace-accent-soft);
    color: var(--text-color);
    font-weight: 600;
  }
  .project-section-navigation__number {
    flex: 0 0 27px;
    width: 27px;
    height: 27px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 7px;
    font-size: 11px;
    color: var(--workspace-accent);
  }
  .is-current .project-section-navigation__number {
    background: var(--workspace-accent);
    border-color: var(--workspace-accent);
    color: #fff;
  }
  .workspace-summary {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 24px;
    padding: 28px;
  }
  .project-overview-metrics {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .project-overview-metrics > div {
    display: grid;
    gap: 6px;
    min-width: 70px;
    padding: 14px;
    text-align: center;
    border-left: 1px solid var(--surface-border-color);
  }
  .project-overview-metrics strong {
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }
  .project-overview-metrics small {
    color: var(--desc-color);
    font-size: 12px;
  }
  .workspace-section {
    animation: none;
    padding: 26px;
    border-radius: 18px;
    box-shadow: none;
  }
  .workspace-section__head {
    margin-bottom: 22px;
  }
  .workspace-resume {
    border-left: 3px solid var(--workspace-accent);
    box-shadow: none;
  }
  .workspace-resource-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  @media (max-width: 1000px) {
    .workspace-summary {
      grid-template-columns: minmax(0, 1fr);
    }
    .project-overview-metrics > div {
      flex: 1;
      border-left: 0;
      background: var(--workspace-panel-bg-color);
      border-radius: 10px;
    }
    .workspace-resource-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 1199px) {
    .project-section-navigation { margin-top: -20px; border-top: 0; border-radius: 0 0 14px 14px; }
  }
  @media (max-width: 767px) {
    .project-section-navigation {
      top: var(--project-head-height, 48px);
      gap: 3px;
      padding: 4px;
    }
    .project-section-navigation > .b_btn {
      flex-direction: column;
      padding: 7px 3px;
      gap: 5px;
      font-size: 11px;
    }
    .workspace-section,
    .workspace-summary {
      padding: 18px;
    }
    .workspace-resource-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .project-section-navigation > .b_btn {
      transition: none;
    }
  }
  @media (min-width: 1200px) {
    .knowledge-workspace.has-project-rail {
      grid-template-columns: 150px minmax(0, 1fr);
      column-gap: 24px;
      align-items: start;
    }
    .has-project-rail > section {
      grid-column: 2;
    }
    .has-project-rail > .project-section-navigation {
      --project-nav-layout: rail;
      grid-column: 1;
      grid-row: 1 / span 7;
      align-self: start;
      top: 24px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 0;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      background: transparent;
    }
    .has-project-rail .project-section-navigation > .b_btn {
      min-height: 44px;
      padding: 9px 8px;
      font-size: 12px;
      gap: 8px;
      border-left: 3px solid transparent;
    }
    .has-project-rail .project-section-navigation > .is-current {
      border-color: transparent;
      border-left-color: var(--workspace-accent);
      background: var(--workspace-accent-soft);
    }
  }
  .project-breadcrumb {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: var(--desc-color);
    font-size: 12px;
  }
  .project-breadcrumb > .b_btn {
    background: transparent;
    padding: 4px 2px;
    flex-shrink: 0;
    font-size: inherit;
  }
  .project-breadcrumb__current {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-breadcrumb__mobile-back {
    display: none;
  }
  .project-section-navigation > .project-settings-trigger--mobile { display: none; }
  @media (max-width: 767px) {
    .project-breadcrumb { display: none; }
    .workspace-detail-head { display: none; }
    .project-section-navigation {
      top: 0;
      margin-top: 0;
      grid-template-columns: repeat(4, minmax(0, 1fr)) 40px;
      border: 1px solid var(--surface-border-color);
      border-radius: 12px;
    }
    .project-section-navigation::before { content: ''; position: absolute; bottom: 100%; left: 0; right: 0; height: var(--project-scroll-padding, 0px); background: inherit; pointer-events: none; }
    .project-section-navigation__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .project-section-navigation > .project-settings-trigger--mobile { display: inline-flex; width: 40px; padding: 0; border: 0; border-left: 1px solid var(--surface-border-color); border-radius: 0; }

    .project-settings-trigger.b_btn { padding: 0 10px; font-size: 11px; min-height: 36px; }
    .project-section-navigation > .b_btn {
      flex-direction: row;
      justify-content: center;
      align-items: center;
      text-align: center;
      gap: 0;
      min-height: 40px;
      padding: 4px 2px;
      line-height: 1.3;
    }
    .project-section-navigation__number { display: none; }
  }
  .project-settings-status {
    padding: 16px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .project-settings-trigger.b_btn {
    flex-shrink: 0;
    background: transparent;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
  }
  @media (max-width: 767px) {
    .workspace-settings-form {
      padding: 16px;
    }
  }

  // 共享工作区表面：仅改变颜色，布局与滚动由原组件负责。
  .knowledge-workspace, .project-section-navigation {
    .workspace-open-surface();
  }
  .workspace-list-section, .workspace-section, .workspace-summary, .workspace-resume, .workspace-card-grid :deep(.workspace-card), .workspace-resource-grid > article {
    .workspace-content-surface();
  }

  .knowledge-workspace { .workspace-navigation-colors(); }
  .knowledge-workspace.is-learning { .workspace-navigation-colors(note); }
  .project-section-navigation > .b_btn:hover { .workspace-navigation-hover(); }
  .project-section-navigation > .b_btn.is-current { .workspace-navigation-selected(); }
  .workspace-kicker, .workspace-section__kicker { color: var(--workspace-nav-text); }
</style>
