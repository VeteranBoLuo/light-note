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
          <article v-for="item in filteredWorkspaces" :key="item.id" class="workspace-card-container">
            <BButton
              class="workspace-card"
              :disabled="!!deletingId"
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
            <BButton
              icon-only
              v-if="!visitorPreview"
              class="project-delete-trigger"
              :disabled="!!deletingId"
              :loading="deletingId === item.id"
              :aria-label="t('toolbox.project.deleteNamed', { title: item.title })"
              :title="t('toolbox.project.delete')"
              @click="confirmDeleteProject(item)"
              ><SvgIcon :src="icon.toolbox.delete" size="16"
            /></BButton>
          </article>
        </div>
      </section>
    </template>

    <template v-else>
      <aside class="project-directory">
        <nav ref="sectionNav" class="project-section-navigation" :aria-label="t('toolbox.workspace.sectionNavigation')">
          <div class="project-directory-back"
            ><BButton type="text" @click="leaveWorkspace"
              ><SvgIcon :src="icon.toolbox.back" size="16" />{{ t('toolbox.project.myProjects') }}</BButton
            ></div
          >
          <BButton
            v-for="section in projectTabs"
            :key="section.key"
            :aria-current="activeSection === section.key ? 'location' : undefined"
            :class="{ 'is-current': activeSection === section.key }"
            @click="selectProjectTab(section.key)"
          >
            <SvgIcon class="project-section-navigation__icon" :src="section.icon" size="18" />
            <span class="project-section-navigation__label">{{ section.label }}</span>
          </BButton>
        </nav>
      </aside>
      <div class="project-content">
        <section ref="projectHead" class="workspace-detail-head" :class="{ 'is-pinned': headerPinned }">
          <nav class="project-breadcrumb" :aria-label="t('toolbox.project.myProjects')">
            <BButton class="project-breadcrumb__workshop" @click="emit('return-to-workshop')">{{
              t('toolbox.title')
            }}</BButton>
            <span class="project-breadcrumb__separator" aria-hidden="true">/</span>
            <BButton :aria-label="t('toolbox.project.myProjects')" @click="leaveWorkspace"
              ><SvgIcon class="project-breadcrumb__mobile-back" :src="icon.arrow_left" size="20" aria-hidden="true" />
              <span class="project-breadcrumb__desktop-label">{{ t('toolbox.project.myProjects') }}</span></BButton
            >
            <h1 class="project-breadcrumb__mobile-title">{{ t('toolbox.project.myProjects') }}</h1>
          </nav>
          <div class="project-mobile-controls">
            <BActionMenu
              :items="projectTabs"
              :aria-label="t('toolbox.project.directory')"
              @select="(key) => selectProjectTab(key)"
            >
              <BButton
                type="text"
                icon-only
                class="project-directory-trigger"
                :aria-label="t('toolbox.project.directory')"
                ><SvgIcon :src="icon.filterPanel.list" size="22"
              /></BButton>
            </BActionMenu>
            <BButton
              icon-only
              class="project-settings-trigger"
              :aria-label="t('toolbox.project.manage')"
              :disabled="mutating"
              @click="openEditModal"
              ><SvgIcon :src="icon.userCenter.menu.settings" size="22"
            /></BButton>
          </div>
        </section>

        <div class="project-overview-panel">
          <section ref="progressSection" class="workspace-summary">
            <div class="workspace-summary__main">
              <div>
                <div class="project-title-row"
                  ><h2>{{ workspace.title }}</h2>
                  <span class="workspace-summary__meta">
                    <BChip class="project-kind" tone="neutral">{{ t(`toolbox.tool.${kind}_workspace.name`) }}</BChip>
                    <span class="project-status" :data-status="workspace.status"
                      ><i aria-hidden="true"></i>{{ statusLabel(workspace.status) }}</span
                    >
                    <small v-if="workspace.targetDate">
                      <SvgIcon :src="icon.common.calendar" size="14" />{{ formatDate(workspace.targetDate) }}
                    </small>
                  </span></div
                >
                <p
                  :class="{
                    'is-collapsed': !goalExpanded && (workspace.goal || workspace.description || '').length > 140,
                  }"
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
            <div class="project-summary-actions">
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
                > </div
              ><BButton class="project-settings-desktop" :disabled="mutating" @click="openEditModal"
                ><SvgIcon :src="icon.userCenter.menu.settings" size="16" />{{ t('toolbox.project.manage') }}</BButton
              >
              <BButton
                ref="progressTrigger"
                type="primary"
                :aria-expanded="progressOpen"
                aria-controls="project-progress-editor"
                @click="focusProgressForm"
                ><SvgIcon :src="icon.common.plus" size="16" />{{ t('toolbox.project.record') }}</BButton
              >
            </div>
          </section>

          <section class="workspace-resume">
            <div class="workspace-resume__lead">
              <span><SvgIcon :src="icon.toolbox.arrow" size="20" /></span>
              <div>
                <small>{{ t('toolbox.workspace.nextStep') }}</small>
                <strong>{{ workspace.nextStep || t('toolbox.workspace.noNextStep') }}</strong>
              </div>
            </div>
          </section>
        </div>
        <section v-if="progressOpen" id="project-progress-editor" class="workspace-section workspace-progress-section">
          <header class="workspace-section__head"
            ><div>
              <span class="workspace-section__kicker">01 · {{ stepText('progress', 'label') }}</span>
              <h3>{{ stepText('progress', 'title') }}</h3>
              <p>{{ stepText('progress', 'description') }}</p> </div
            ><BButton type="text" :disabled="savingProgress" @click="collapseProgress">{{
              t('common.collapse')
            }}</BButton></header
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
                height="var(--ui-layout-42, 42px)"
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
              <h3
                >{{ stepText('resources', 'label') }} <BChip tone="neutral">{{ workspace.resources.length }}</BChip></h3
              >
            </div>
            <div class="workspace-resource-toolbar">
              <BInput
                class="project-resource-search"
                v-model:value="resourceSearch"
                :placeholder="t('toolbox.project.searchResources')"
                ><template #prefix><SvgIcon :src="icon.navigation.phone_search" size="16" /></template
              ></BInput>
              <BButton class="project-resource-add" @click="openResourceModal">
                <SvgIcon :src="icon.common.plus" size="15" /><span class="project-add-label">{{
                  stepText('resources', 'addAction')
                }}</span
                ><span class="project-add-short">{{ t('toolbox.project.addShort') }}</span>
              </BButton>
              <BButton
                class="project-resource-generate"
                :type="outcomeResources.length ? 'primary' : undefined"
                :disabled="!outcomeResources.length"
                @click="outcomeOpen = true"
                >{{ t('toolbox.project.generate') }} · {{ outcomeResources.length }}</BButton
              >
            </div>
          </header>
          <div v-if="!workspace.resources.length" class="workspace-section-empty">
            <SvgIcon :src="icon.toolbox.locate" size="22" />
            <span>{{ stepText('resources', 'empty') }}</span>
          </div>

          <p v-if="workspace.resources.length && !filteredResources.length">{{ t('toolbox.project.noResources') }}</p>
          <div v-if="workspace.resources.length" class="workspace-resource-grid">
            <div class="project-resource-columns">
              <BCheckbox
                :model-value="allVisibleSelected"
                :indeterminate="someVisibleSelected && !allVisibleSelected"
                :disabled="!selectableResources.length"
                :aria-label="t('common.selectAll')"
                @update:model-value="selectVisibleResources"
              />
              <span>{{ t('toolbox.project.resourceTitle') }}</span
              ><span>{{ t('toolbox.project.resourceType') }}</span
              ><span>{{ t('toolbox.project.resourceActions') }}</span>
            </div>
            <article
              v-for="resource in filteredResources"
              :key="`${resource.type}:${resource.resourceId}`"
              :class="{
                'is-selected': selectedResourceKeys.includes(`${resource.type}:${resource.resourceId}`),
                'is-unavailable': resource.available === false,
              }"
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
              <BActionMenu
                :items="[
                  {
                    key: 'remove',
                    label: t('toolbox.workspace.removeResource', { title: resource.title || resource.resourceId }),
                    icon: icon.toolbox.delete,
                    danger: true,
                  },
                ]"
                :disabled="mutating"
                @select="confirmRemoveResource(resource)"
                @click.stop
              >
                <BButton icon-only type="text" :aria-label="t('toolbox.board.actions')"
                  ><SvgIcon :src="icon.common.more" size="18"
                /></BButton>
              </BActionMenu>
            </article>
          </div>
        </section>

        <section ref="boardSection" class="workspace-section workspace-board-section">
          <header class="workspace-section__head">
            <div>
              <h3
                >{{ stepText('board', 'label') }}
                <BChip tone="neutral">{{
                  workspace.items.filter((item) => item.status !== 'archived').length
                }}</BChip></h3
              >
            </div>
          </header>
          <WorkspaceBoard
            :key="workspace.id"
            v-model:lane="mobileLane"
            :workspace="workspace"
            :readonly="visitorPreview"
            :mobile="isMobileLayout"
            @updated="handleBoardUpdated"
          />
        </section>

        <section ref="timelineSection" class="workspace-section workspace-timeline-section">
          <header class="workspace-section__head">
            <div>
              <h3
                >{{ stepText('timeline', 'label') }} <BChip tone="neutral">{{ workspace.sessions.length }}</BChip></h3
              >
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
      </div>
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
      width="var(--ui-layout-620, 620px)"
      :show-footer="false"
      fullscreen-mobile
      initial-focus=".workspace-create-title"
    >
      <div
        class="workspace-modal-form"
        :class="{
          'workspace-settings-form': workspaceFormMode === 'edit',
          'workspace-modal-form--mobile': isMobileLayout,
        }"
      >
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
            height="var(--ui-layout-42, 42px)"
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
              height="var(--ui-layout-42, 42px)"
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
          <BButton
            v-if="workspaceFormMode === 'edit' && workspace"
            class="project-settings-delete"
            type="danger"
            :loading="!!deletingId"
            :disabled="creating || mutating || savingProgress || !!deletingId"
            @click="confirmDeleteProject(workspace)"
            >{{ t('toolbox.project.delete') }}</BButton
          >
          <BButton :disabled="!!deletingId" @click="createModalVisible = false">{{ t('common.cancel') }}</BButton>
          <BButton
            type="primary"
            :loading="creating"
            :disabled="!createForm.title.trim() || !!deletingId"
            @click="saveWorkspaceForm"
          >
            {{ workspaceFormMode === 'edit' ? t('toolbox.workspace.updateAction') : templateText('createAction') }}
          </BButton>
        </div>
      </div>
    </BModal>

    <BModal
      v-model:visible="resourceModalVisible"
      :title="stepText('resources', 'addAction')"
      width="var(--ui-layout-880, 880px)"
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
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import { scrollIntoContainer } from '@/utils/scrolling';
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
    deleteToolboxWorkspace as requestDeleteToolboxWorkspace,
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
  import { useUiDensity } from '@/composables/useUiDensity';
  import { toolboxWorkspaceKind } from '@/config/toolbox';
  import type { ToolboxSelectedResource } from '@/utils/toolboxResourceSelection';
  import ToolboxResourceSelector from './ToolboxResourceSelector.vue';

  const emit = defineEmits<{ 'return-to-workshop': [] }>();
  const props = defineProps<{ toolId: ToolboxToolId | string }>();
  const { t, locale } = useI18n();
  const isMobileLayout = useMobileLayout();
  const { dimension } = useUiDensity();
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
  const progressOpen = ref(false);
  const progressTrigger = ref<InstanceType<typeof BButton> | null>(null);
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
      label: key === 'progress' ? t('toolbox.project.projectOverview') : stepText(key as WorkspaceSectionKey, 'label'),
      icon: {
        progress: icon.toolbox.materialNote,
        resources: icon.organize.file,
        board: icon.toolbox.conceptMap,
        timeline: icon.common.time,
      }[key],
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
    const scrollPadding = scrollOwner ? parseFloat(getComputedStyle(scrollOwner).paddingTop) || 0 : 0;
    return scrollPadding + head + dimension(12);
  }
  function measureProjectChrome() {
    rootRef.value?.style.setProperty(
      '--project-scroll-padding',
      `${scrollOwner ? parseFloat(getComputedStyle(scrollOwner).paddingTop) || 0 : 0}px`,
    );
    rootRef.value?.style.setProperty('--project-scroll-height', `${scrollOwner?.clientHeight ?? window.innerHeight}px`);
    rootRef.value?.style.setProperty('--project-head-height', `${projectHead.value?.offsetHeight ?? 48}px`);
    rootRef.value?.style.setProperty('--project-sticky-inset', `${stickyInset()}px`);
  }
  let scrollOwner: HTMLElement | null = null;
  let scrollFrame = 0;
  let locationTimer = 0;
  let navigationTarget: string | null = null;
  let navigationTop = 0;
  function sectionElements() {
    return [progressSection.value, resourcesSection.value, boardSection.value, timelineSection.value];
  }
  function syncSection() {
    scrollFrame = 0;
    if (!workspace.value || !sectionNav.value || !scrollOwner) return;
    measureProjectChrome();
    headerPinned.value =
      !!projectHead.value &&
      projectHead.value.getBoundingClientRect().top <=
        scrollOwner.getBoundingClientRect().top + (parseFloat(getComputedStyle(scrollOwner).paddingTop) || 0) + 1;
    const threshold = scrollOwner.getBoundingClientRect().top + stickyInset() + dimension(4);
    const elements = sectionElements();
    let index = 0;
    elements.forEach((element, i) => {
      if (element && element.getBoundingClientRect().top <= threshold) index = i;
    });
    if (navigationTarget && Math.abs(scrollOwner.scrollTop - navigationTop) <= 2) {
      index = ['progress', 'resources', 'board', 'timeline'].indexOf(navigationTarget);
    } else if (
      scrollOwner.scrollTop > 0 &&
      scrollOwner.scrollTop + scrollOwner.clientHeight >= scrollOwner.scrollHeight - 4
    ) {
      index = 3;
    }
    const key = ['progress', 'resources', 'board', 'timeline'][index];
    activeSection.value = key;
    window.clearTimeout(locationTimer);
    locationTimer = window.setTimeout(() => {
      if (workspace.value && route.query.tab !== key) void router.replace({ query: { ...route.query, tab: key } });
    }, 180);
  }
  function onManualProjectScroll() {
    navigationTarget = null;
  }
  function onProjectScroll() {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(syncSection);
  }
  function detachProjectScroll() {
    chromeObserver?.disconnect();
    chromeObserver = null;
    scrollOwner?.removeEventListener('scroll', onProjectScroll);
    scrollOwner?.removeEventListener('wheel', onManualProjectScroll);
    scrollOwner?.removeEventListener('touchstart', onManualProjectScroll);
    scrollOwner?.removeEventListener('keydown', onManualProjectScroll);
    window.removeEventListener('resize', onProjectScroll);
    window.cancelAnimationFrame(scrollFrame);
    window.clearTimeout(locationTimer);
    scrollFrame = 0;
    scrollOwner = null;
    navigationTarget = null;
    navigationTop = 0;
  }
  function attachProjectScroll() {
    detachProjectScroll();
    if (!rootRef.value || !workspace.value) return;
    scrollOwner = findScrollContainer(rootRef.value);
    measureProjectChrome();
    if (typeof ResizeObserver !== 'undefined') {
      chromeObserver = new ResizeObserver(measureProjectChrome);
      chromeObserver.observe(scrollOwner);
      if (projectHead.value) chromeObserver.observe(projectHead.value);
      if (sectionNav.value) chromeObserver.observe(sectionNav.value);
    }
    scrollOwner.addEventListener('scroll', onProjectScroll, { passive: true });
    scrollOwner.addEventListener('wheel', onManualProjectScroll, { passive: true });
    scrollOwner.addEventListener('touchstart', onManualProjectScroll, { passive: true });
    scrollOwner.addEventListener('keydown', onManualProjectScroll);
    window.addEventListener('resize', onProjectScroll, { passive: true });
    onProjectScroll();
  }
  async function selectProjectTab(tab: string, smooth = true) {
    const index = ['progress', 'resources', 'board', 'timeline'].indexOf(tab);
    const section = sectionElements()[index];
    if (!section || !rootRef.value || !sectionNav.value) return;
    const container = findScrollContainer(rootRef.value);
    const inset = stickyInset();
    const top =
      container.scrollTop + section.getBoundingClientRect().top - container.getBoundingClientRect().top - inset;
    navigationTarget = tab;
    navigationTop = Math.max(0, Math.min(top, container.scrollHeight - container.clientHeight));
    scrollIntoContainer(
      container,
      section,
      inset,
      smooth !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto',
    );
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
  const deletingId = ref('');
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
  const deleteToolboxWorkspace = scopedRequest(requestDeleteToolboxWorkspace);
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
          progressOpen: progressOpen.value,
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
    progressOpen.value = Boolean(state.progressOpen);
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
        if (!visitorPreview.value)
          void markToolboxWorkspaceOpened(requestedWorkspaceId, entrySource.value).catch(() => undefined);
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
  function confirmDeleteProject(project: ToolboxWorkspaceSummary) {
    if (blockGuestWrite('toolbox-project') || deletingId.value) return;
    const version = initializationVersion;
    const owner = ownerKey.value;
    Alert.alert({
      title: t('toolbox.project.deleteNamed', { title: project.title }),
      content: t('toolbox.project.deleteConfirm'),
      okText: t('toolbox.project.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        if (version !== initializationVersion || owner !== ownerKey.value || deletingId.value) return;
        deletingId.value = project.id;
        try {
          await deleteToolboxWorkspace(project.id);
          workspaces.value = workspaces.value.filter((item) => item.id !== project.id);
          if (workspaceQuery.value === project.id) {
            createModalVisible.value = false;
            workspace.value = null;
            await leaveWorkspace();
          }
          message.success(t('toolbox.project.deleted'));
        } catch (error) {
          showMutationError(error);
        } finally {
          if (version === initializationVersion) deletingId.value = '';
        }
      },
    });
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
    progressOpen.value = true;
    await nextTick();
    const editor = rootRef.value?.querySelector<HTMLElement>('#project-progress-editor');
    if (editor && rootRef.value) scrollIntoContainer(findScrollContainer(rootRef.value), editor, stickyInset(), 'auto');
    progressInput.value?.$el?.querySelector('textarea')?.focus({ preventScroll: true });
  }
  async function collapseProgress() {
    progressOpen.value = false;
    await nextTick();
    progressTrigger.value?.$el?.focus({ preventScroll: true });
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
      progressOpen.value = false;
      await nextTick();
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
      onOk: () => {
        if (version === initializationVersion) return removeResource(resource);
      },
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
  const selectableResources = computed(() =>
    filteredResources.value.filter((resource) => resource.available !== false),
  );
  const allVisibleSelected = computed(
    () =>
      selectableResources.value.length > 0 &&
      selectableResources.value.every((resource) =>
        selectedResourceKeys.value.includes(`${resource.type}:${resource.resourceId}`),
      ),
  );
  const someVisibleSelected = computed(() =>
    selectableResources.value.some((resource) =>
      selectedResourceKeys.value.includes(`${resource.type}:${resource.resourceId}`),
    ),
  );
  function selectVisibleResources(selected: boolean) {
    selectableResources.value.forEach((resource) => toggleResource(resource, selected));
  }
  function selectResourceRow(resource: ToolboxWorkspaceResource, event: MouseEvent) {
    if (
      resource.available === false ||
      (event.target as HTMLElement).closest('button, input, label, [role="checkbox"], .b-action-menu-anchor')
    )
      return;
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
    deletingId.value = '';
    creating.value = mutating.value = savingProgress.value = false;
    workspace.value = null;
    selectedResourceKeys.value = [];
    resourceSearch.value = '';
    progressDraftEdited.value = false;
    goalExpanded.value = false;
    progressOpen.value = false;
    void initialize();
  });
  onMounted(initialize);
  onBeforeUnmount(() => {
    initializationVersion++;
    detachProjectScroll();
  });
</script>

<style lang="less" scoped>
  @import (reference) '@/assets/css/workspace-surfaces.less';
  .knowledge-workspace {
    --workspace-accent: #615ced;
    --workspace-accent-soft: rgba(97, 92, 237, 0.09);
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-20, 20px);
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
    min-height: var(--ui-layout-280, 280px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-10, 10px);
    color: var(--desc-color);
  }
  .knowledge-workspace__state.is-error strong {
    color: var(--text-color);
  }
  .knowledge-workspace__state-actions {
    display: flex;
    gap: var(--ui-space-8, 8px);
  }
  .workspace-list-intro,
  .workspace-detail-head,
  .workspace-section__head,
  .workspace-list-section > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-18, 18px);
  }
  .workspace-list-intro {
    padding: var(--ui-space-4, 4px) var(--ui-space-4, 4px) 0;
  }
  .workspace-list-intro__copy {
    max-width: var(--ui-layout-760, 760px);
  }
  .workspace-kicker,
  .workspace-section__kicker {
    color: var(--workspace-accent);
    font-size: var(--ui-font-12, 12px);
    font-weight: 750;
    letter-spacing: 0.04em;
  }
  .workspace-list-intro h2,
  .workspace-summary h2,
  .workspace-section h3,
  .workspace-list-section h3 {
    margin: var(--ui-space-6, 6px) 0 0;
    color: var(--text-color);
  }
  .workspace-list-intro h2 {
    font-size: clamp(var(--ui-font-24, 24px), 3vw, var(--ui-font-34, 34px));
    line-height: 1.18;
  }
  .workspace-list-intro p,
  .workspace-section__head p,
  .workspace-list-section > header p {
    margin: var(--ui-space-7, 7px) 0 0;
    color: var(--desc-color);
    line-height: 1.65;
  }
  .workspace-loop {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ui-space-12, 12px);
  }
  .workspace-loop article {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    min-width: 0;
    padding: var(--ui-space-16, 16px);
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
    width: var(--ui-layout-38, 38px);
    height: var(--ui-layout-38, 38px);
    border-radius: 11px;
  }
  .workspace-loop div {
    display: grid;
    min-width: 0;
    gap: var(--ui-space-3, 3px);
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
  :deep(.board-card) {
    scroll-margin-top: var(--project-sticky-inset, 150px);
  }
  .workspace-section {
    padding: var(--ui-space-22, 22px);
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
    grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--ui-layout-300, 300px)), 1fr));
    gap: var(--ui-space-12, 12px);
    margin-top: var(--ui-space-12, 12px);
  }
  .workspace-card-container {
    position: relative;
    min-width: 0;
    display: flex;
  }
  .workspace-card-container :deep(.project-delete-trigger) {
    position: absolute;
    right: 10px;
    bottom: 14px;
    width: var(--ui-layout-32, 32px);
    height: var(--ui-layout-32, 32px);
    padding: 0;
    color: var(--desc-color);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    transition:
      color 0.15s ease,
      background-color 0.15s ease;
  }
  .workspace-card-container :deep(.project-delete-trigger:focus-visible) {
    color: var(--danger-color);
    outline: 2px solid var(--danger-color);
    outline-offset: 2px;
  }
  @media (hover: hover) and (pointer: fine) {
    .workspace-card-container :deep(.project-delete-trigger:hover:not(:disabled)) {
      color: var(--danger-color);
      background: var(--primary-btn-h-bg-color);
    }
  }
  .workspace-card-container .workspace-card__meta {
    min-height: var(--ui-layout-32, 32px);
    padding-right: var(--ui-space-34, 34px);
  }
  @media (pointer: coarse), (max-width: 767px) {
    .workspace-card-container :deep(.project-delete-trigger) {
      width: var(--ui-layout-44, 44px);
      height: var(--ui-layout-44, 44px);
      right: 6px;
    }
    .workspace-card-container .workspace-card__meta {
      min-height: var(--ui-layout-44, 44px);
      padding-right: var(--ui-space-42, 42px);
    }
  }
  .workspace-card-grid :deep(.workspace-card) {
    width: 100%;
    height: auto;
    padding: var(--ui-space-14, 14px) var(--ui-space-16, 16px);
    line-height: 1.4;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: var(--ui-space-12, 12px);
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
    gap: var(--ui-space-9, 9px);
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
    width: var(--ui-layout-34, 34px);
    height: var(--ui-layout-34, 34px);
    border-radius: 10px;
  }
  .workspace-card__copy,
  .workspace-card__next {
    display: grid;
    gap: var(--ui-space-6, 6px);
  }
  .workspace-card__copy > strong {
    font-size: var(--ui-font-15, 15px);
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
    font-size: var(--ui-font-11, 11px);
    line-height: 1.4;
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
  .workspace-card__next {
    display: flex;
    align-items: baseline;
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-9, 9px) var(--ui-space-10, 10px);
    border-radius: 8px;
    background: var(--workspace-canvas);
  }
  .workspace-card__next small {
    flex-shrink: 0;
    font-size: var(--ui-font-11, 11px);
  }
  .workspace-card__next strong {
    font-size: var(--ui-font-12, 12px);
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
    gap: var(--ui-space-4, 4px) var(--ui-space-8, 8px);
    font-size: var(--ui-font-11, 11px);
  }
  .workspace-card__meta > :last-child {
    margin-left: auto;
    color: var(--workspace-accent);
  }
  .workspace-empty {
    min-height: var(--ui-layout-260, 260px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: var(--ui-space-8, 8px);
  }
  .workspace-empty > span {
    width: var(--ui-layout-58, 58px);
    height: var(--ui-layout-58, 58px);
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
    max-width: var(--ui-layout-480, 480px);
    color: var(--desc-color);
    line-height: 1.6;
  }
  .workspace-detail-head {
    position: sticky;
    top: 0;
    z-index: 14;
    align-self: start;
    min-height: var(--ui-layout-48, 48px);
    min-width: 0;
    padding: var(--ui-space-6, 6px) 0;
    background: var(--workspace-open-canvas, var(--card-background));
    border-bottom: 1px solid var(--surface-border-color);
  }
  .workspace-detail-head::before {
    content: '';
    position: absolute;
    bottom: 100%;
    left: 0;
    right: 0;
    height: var(--project-scroll-padding, 0px);
    background: inherit;
    pointer-events: none;
  }
  .workspace-detail-head.is-pinned {
    box-shadow: 0 5px 12px -10px rgba(20, 24, 40, 0.35);
  }
  .workspace-detail-head__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--ui-space-8, 8px);
  }
  :deep(.workspace-detail-head__back) {
    padding-left: 0;
    background: transparent;
  }
  .workspace-summary {
    padding: var(--ui-space-24, 24px);
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(var(--ui-layout-420, 420px), 1fr);
    gap: var(--ui-space-24, 24px);
  }
  .workspace-summary__main {
    display: flex;
    gap: var(--ui-space-16, 16px);
    min-width: 0;
  }
  .workspace-summary__icon {
    width: var(--ui-layout-58, 58px);
    height: var(--ui-layout-58, 58px);
    border-radius: 17px;
  }
  .workspace-summary__main > div {
    min-width: 0;
  }
  .workspace-summary__meta small {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-5, 5px);
    color: var(--desc-color);
  }
  .workspace-summary h2 {
    font-size: clamp(var(--ui-font-24, 24px), 3vw, var(--ui-font-32, 32px));
    overflow-wrap: anywhere;
  }
  .workspace-summary__main p {
    margin: var(--ui-space-8, 8px) 0 0;
    color: var(--desc-color);
    line-height: 1.6;
  }
  .workspace-summary__metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--ui-space-8, 8px);
    align-self: center;
  }
  .workspace-summary__metrics article {
    display: grid;
    gap: var(--ui-space-3, 3px);
    padding: var(--ui-space-12, 12px) var(--ui-space-10, 10px);
    text-align: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .workspace-summary__metrics strong {
    font-size: var(--ui-font-21, 21px);
  }
  .workspace-summary__metrics span {
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
  }
  .workspace-summary__metrics .is-streak strong {
    color: var(--workspace-accent);
  }
  .workspace-resume {
    display: grid;
    grid-template-columns: minmax(var(--ui-layout-260, 260px), 1fr) minmax(var(--ui-layout-280, 280px), 1.4fr) auto;
    align-items: center;
    gap: var(--ui-space-20, 20px);
    padding: var(--ui-space-18, 18px) var(--ui-space-20, 20px);
    border-left: 4px solid var(--workspace-accent);
  }
  .workspace-resume__lead {
    display: flex;
    align-items: center;
    gap: var(--ui-space-11, 11px);
    min-width: 0;
  }
  .workspace-resume__lead > span {
    width: var(--ui-layout-38, 38px);
    height: var(--ui-layout-38, 38px);
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
    gap: var(--ui-space-3, 3px);
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
    padding: var(--ui-space-7, 7px);
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--ui-space-7, 7px);
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--workspace-panel-bg-color);
  }
  .workspace-section-nav :deep(.workspace-section-nav__item) {
    width: 100%;
    height: var(--ui-layout-46, 46px);
    padding: 0 var(--ui-space-12, 12px);
    justify-content: flex-start;
    gap: var(--ui-space-9, 9px);
    color: var(--desc-color);
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
  }
  .workspace-section-nav__item > span {
    width: var(--ui-layout-27, 27px);
    height: var(--ui-layout-27, 27px);
    display: inline-grid;
    place-items: center;
    flex: 0 0 auto;
    color: var(--workspace-accent);
    border: 1px solid var(--workspace-accent);
    border-radius: 8px;
    font-size: var(--ui-font-11, 11px);
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
    grid-template-columns: minmax(0, 1fr) var(--ui-layout-150, 150px) auto;
    align-items: end;
    gap: var(--ui-space-12, 12px);
    margin-top: var(--ui-space-18, 18px);
  }
  .workspace-progress-form__summary,
  .workspace-progress-form__hint {
    grid-column: 1 / -1;
  }
  .workspace-progress-form__hint {
    margin: calc(-1 * var(--ui-space-3, 3px)) 0 var(--ui-space-2, 2px);
    color: var(--desc-color);
    font-size: var(--ui-font-11, 11px);
    line-height: 1.5;
  }
  .workspace-progress-form__hint.is-ready {
    color: var(--workspace-accent);
  }
  .workspace-progress-form label,
  .workspace-modal-form label {
    display: grid;
    gap: var(--ui-space-7, 7px);
    min-width: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    font-weight: 650;
  }
  .workspace-progress-form :deep(.b-textarea),
  .workspace-modal-form :deep(.b-textarea) {
    color: var(--text-color);
    border-color: var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }
  .workspace-progress-form :deep(.b-textarea) {
    height: var(--ui-layout-118, 118px);
    min-height: var(--ui-layout-118, 118px);
    max-height: var(--ui-layout-118, 118px);
    padding: var(--ui-space-11, 11px) var(--ui-space-12, 12px) !important;
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
    min-height: var(--ui-layout-42, 42px);
  }
  .workspace-modal-form :deep(.b-datetime-trigger) {
    min-height: var(--ui-layout-42, 42px);
  }
  .workspace-resource-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--ui-space-10, 10px);
    margin-top: var(--ui-space-18, 18px);
  }
  .workspace-resource-grid article {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    min-width: 0;
    padding: var(--ui-space-11, 11px) var(--ui-space-12, 12px);
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }
  .workspace-resource-grid__icon {
    width: var(--ui-layout-34, 34px);
    height: var(--ui-layout-34, 34px);
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
    gap: var(--ui-space-2, 2px);
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
    width: var(--ui-layout-32, 32px);
    padding: 0;
  }
  .workspace-resource-grid article:not(.is-unavailable) {
    cursor: pointer;
  }
  .workspace-resource-grid article.is-selected {
    border-color: var(--workspace-accent);
  }
  .workspace-resource-grid article:focus-within {
    outline: 2px solid var(--workspace-accent);
    outline-offset: 2px;
  }
  .workspace-resource-link.b_btn,
  .workspace-resource-link.b_btn:hover {
    background: transparent;
  }
  .workspace-resource-link {
    display: block;
    width: 100%;
    height: auto;
    min-height: var(--ui-layout-32, 32px);
    padding: 0;
    text-align: left;
    line-height: 1.5;
    white-space: normal;
    overflow-wrap: anywhere;
    color: var(--primary-color);
    background: transparent;
  }
  .workspace-section-empty {
    min-height: var(--ui-layout-110, 110px);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-8, 8px);
    margin-top: var(--ui-space-16, 16px);
    color: var(--desc-color);
    border: 1px dashed var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }
  .workspace-timeline {
    display: grid;
    margin-top: var(--ui-space-18, 18px);
  }
  .workspace-timeline article {
    position: relative;
    display: grid;
    grid-template-columns: var(--ui-layout-18, 18px) minmax(0, 1fr);
    gap: var(--ui-space-10, 10px);
    min-width: 0;
    padding-bottom: var(--ui-space-18, 18px);
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
    margin-top: var(--ui-space-4, 4px);
    border: 3px solid var(--card-background);
    border-radius: 50%;
    background: var(--workspace-accent);
    box-shadow: 0 0 0 1px var(--workspace-accent);
  }
  .workspace-timeline article > div {
    padding: var(--ui-space-12, 12px) var(--ui-space-14, 14px);
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
  }
  .workspace-timeline header {
    justify-content: space-between;
  }
  .workspace-timeline p,
  .workspace-timeline small {
    margin: var(--ui-space-7, 7px) 0 0;
    color: var(--desc-color);
    line-height: 1.6;
  }
  .workspace-timeline small {
    display: block;
  }
  .workspace-modal-actions :deep(.project-settings-delete) {
    margin-right: auto;
  }
  .workspace-modal-form,
  .workspace-resource-modal {
    display: grid;
    gap: var(--ui-space-18, 18px);
  }
  .workspace-modal-form--mobile {
    height: 100%;
    box-sizing: border-box;
    overflow-y: auto;
    align-content: start;
    padding: var(--ui-space-16, 16px) var(--mobile-page-gutter, var(--ui-space-16, 16px))
      calc(var(--ui-space-20, 20px) + env(safe-area-inset-bottom));
  }
  .workspace-modal-callout {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-14, 14px);
    border-radius: 12px;
    background: var(--workspace-accent-soft);
  }
  .workspace-modal-callout > span {
    width: var(--ui-layout-40, 40px);
    height: var(--ui-layout-40, 40px);
    border-radius: 11px;
  }
  .workspace-modal-callout p {
    margin: var(--ui-space-3, 3px) 0 0;
    color: var(--desc-color);
    line-height: 1.5;
  }
  .workspace-modal-form__row {
    display: grid;
    grid-template-columns: var(--ui-layout-180, 180px) minmax(0, 1fr);
    gap: var(--ui-space-12, 12px);
  }
  .workspace-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--ui-space-9, 9px);
    padding-top: var(--ui-space-4, 4px);
  }
  .workspace-resource-modal {
    min-height: 0;
  }
  .workspace-resource-modal__footer {
    flex: 0 0 auto;
    padding: var(--ui-space-12, 12px) var(--ui-space-20, 20px) var(--ui-space-16, 16px);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--ui-space-9, 9px);
    border-top: 1px solid var(--surface-border-color);
    background: var(--card-background);
    box-shadow: 0 -10px 24px rgba(31, 34, 66, 0.04);
  }
  .workspace-resource-modal__footer :deep(.b_btn) {
    min-width: var(--ui-layout-92, 92px);
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
      max-width: var(--ui-layout-580, 580px);
    }
    .workspace-progress-form {
      grid-template-columns: minmax(0, 1fr) var(--ui-layout-150, 150px) auto;
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
      padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px);
      box-sizing: border-box;
      grid-template-rows: minmax(0, 1fr);
      gap: 0;
    }
    .workspace-resource-modal__footer {
      padding: var(--ui-space-10, 10px) var(--ui-space-16, 16px)
        calc(var(--ui-space-10, 10px) + env(safe-area-inset-bottom));
    }
    .workspace-resource-modal__footer :deep(.b_btn) {
      flex: 1;
      width: auto;
      min-height: var(--ui-layout-44, 44px);
    }
    .knowledge-workspace {
      gap: var(--ui-space-14, 14px);
    }
    .workspace-list-intro,
    .workspace-list-section > header {
      align-items: stretch;
      flex-direction: column;
    }
    .workspace-list-intro :deep(.b_btn) {
      width: 100%;
      min-height: var(--ui-layout-44, 44px);
    }
    .workspace-loop {
      gap: var(--ui-space-8, 8px);
    }
    .workspace-loop article {
      padding: var(--ui-space-12, 12px);
    }
    .workspace-section,
    .workspace-summary {
      padding: var(--ui-space-16, 16px);
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
      padding: 0 var(--ui-space-9, 9px);
    }
    .workspace-progress-form__summary,
    .workspace-progress-form__hint {
      grid-column: auto;
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
      min-height: var(--ui-layout-36, 36px);
    }
    .workspace-summary__main {
      align-items: flex-start;
    }
    .workspace-summary__icon {
      width: var(--ui-layout-48, 48px);
      height: var(--ui-layout-48, 48px);
    }
    .workspace-summary__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .workspace-resume {
      grid-template-columns: 1fr;
      padding: var(--ui-space-15, 15px);
    }
    .workspace-resume__copy {
      grid-column: auto;
      grid-row: auto;
    }
    .workspace-resume :deep(.b_btn),
    .workspace-progress-form > :deep(.b_btn) {
      width: 100%;
      min-height: var(--ui-layout-44, 44px);
    }
    .workspace-resource-grid article {
      min-height: var(--ui-layout-52, 52px);
    }
    .workspace-modal-actions {
      position: sticky;
      bottom: 0;
      padding: var(--ui-space-10, 10px) 0 0;
      background: var(--card-background);
    }
    .workspace-modal-actions :deep(.b_btn) {
      flex: 1;
      width: auto;
      min-width: 0;
      padding: 0 var(--ui-space-10, 10px);
      white-space: normal;
      line-height: 1.3;
      min-height: var(--ui-layout-44, 44px);
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
    gap: var(--ui-space-12, 12px);
    align-items: center;
  }
  .workspace-filters > :first-child {
    flex: 1;
    min-width: var(--ui-layout-180, 180px);
  }
  .workspace-summary {
    grid-template-columns: minmax(0, 1fr);
    padding: var(--ui-space-20, 20px);
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
      gap: var(--ui-space-14, 14px);
    }
    .workspace-resume > :deep(.b_btn) {
      width: 100%;
    }
    .workspace-resume__lead {
      width: 100%;
    }
    .workspace-summary__main {
      align-items: flex-start;
      gap: var(--ui-space-12, 12px);
    }
    .workspace-summary__icon {
      width: var(--ui-layout-38, 38px);
      height: var(--ui-layout-38, 38px);
      flex-basis: var(--ui-layout-38, 38px);
    }
    .workspace-summary {
      padding: var(--ui-space-16, 16px);
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
    gap: var(--ui-space-6, 6px);
    padding: var(--ui-space-7, 7px);
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    box-shadow: 0 6px 22px rgba(20, 24, 40, 0.06);
  }
  .project-section-navigation > .b_btn {
    width: 100%;
    height: auto;
    min-height: var(--ui-layout-48, 48px);
    justify-content: flex-start;
    gap: var(--ui-space-9, 9px);
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
    flex: 0 0 var(--ui-layout-27, 27px);
    width: var(--ui-layout-27, 27px);
    height: var(--ui-layout-27, 27px);
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 7px;
    font-size: var(--ui-font-11, 11px);
    color: var(--workspace-accent);
  }
  .is-current .project-section-navigation__number {
    background: var(--workspace-accent);
    border-color: var(--workspace-accent);
    color: #fff;
  }
  .workspace-summary {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--ui-space-24, 24px);
    padding: var(--ui-space-28, 28px);
  }
  .project-overview-metrics {
    display: flex;
    gap: var(--ui-space-8, 8px);
    align-items: center;
  }
  .project-overview-metrics > div {
    display: grid;
    gap: var(--ui-space-6, 6px);
    min-width: var(--ui-layout-70, 70px);
    padding: var(--ui-space-14, 14px);
    text-align: center;
    border-left: 1px solid var(--surface-border-color);
  }
  .project-overview-metrics strong {
    font-size: var(--ui-font-22, 22px);
    font-variant-numeric: tabular-nums;
  }
  .project-overview-metrics small {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .workspace-section {
    animation: none;
    padding: var(--ui-space-26, 26px);
    border-radius: 18px;
    box-shadow: none;
  }
  .workspace-section__head {
    margin-bottom: var(--ui-space-22, 22px);
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
    .project-section-navigation {
      margin-top: calc(-1 * var(--ui-space-20, 20px));
      border-top: 0;
      border-radius: 0 0 14px 14px;
    }
  }
  @media (max-width: 767px) {
    .project-section-navigation {
      top: var(--project-head-height, 48px);
      gap: var(--ui-space-3, 3px);
      padding: var(--ui-space-4, 4px);
    }
    .project-section-navigation > .b_btn {
      flex-direction: column;
      padding: var(--ui-space-7, 7px) var(--ui-space-3, 3px);
      gap: var(--ui-space-5, 5px);
      font-size: var(--ui-font-11, 11px);
    }
    .workspace-section,
    .workspace-summary {
      padding: var(--ui-space-18, 18px);
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
      grid-template-columns: var(--ui-layout-150, 150px) minmax(0, 1fr);
      column-gap: var(--ui-space-24, 24px);
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
      top: var(--ui-space-24, 24px);
      display: flex;
      flex-direction: column;
      gap: var(--ui-space-6, 6px);
      padding: 0;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      background: transparent;
    }
    .has-project-rail .project-section-navigation > .b_btn {
      min-height: var(--ui-layout-44, 44px);
      padding: var(--ui-space-9, 9px) var(--ui-space-8, 8px);
      font-size: var(--ui-font-12, 12px);
      gap: var(--ui-space-8, 8px);
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
    gap: var(--ui-space-8, 8px);
    min-width: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .project-breadcrumb > .b_btn {
    background: transparent;
    padding: var(--ui-space-4, 4px) var(--ui-space-2, 2px);
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
  .project-section-navigation > .project-settings-trigger--mobile {
    display: none;
  }
  @media (max-width: 767px) {
    .project-breadcrumb {
      display: none;
    }
    .workspace-detail-head {
      display: none;
    }
    .project-section-navigation {
      top: 0;
      margin-top: 0;
      grid-template-columns: repeat(4, minmax(0, 1fr)) var(--ui-layout-40, 40px);
      border: 1px solid var(--surface-border-color);
      border-radius: 12px;
    }
    .project-section-navigation::before {
      content: '';
      position: absolute;
      bottom: 100%;
      left: 0;
      right: 0;
      height: var(--project-scroll-padding, 0px);
      background: inherit;
      pointer-events: none;
    }
    .project-section-navigation__label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .project-section-navigation > .project-settings-trigger--mobile {
      display: inline-flex;
      width: var(--ui-layout-40, 40px);
      padding: 0;
      border: 0;
      border-left: 1px solid var(--surface-border-color);
      border-radius: 0;
    }

    .project-settings-trigger.b_btn {
      padding: 0 var(--ui-space-10, 10px);
      font-size: var(--ui-font-11, 11px);
      min-height: var(--ui-layout-36, 36px);
    }
    .project-section-navigation > .b_btn {
      flex-direction: row;
      justify-content: center;
      align-items: center;
      text-align: center;
      gap: 0;
      min-height: var(--ui-layout-40, 40px);
      padding: var(--ui-space-4, 4px) var(--ui-space-2, 2px);
      line-height: 1.3;
    }
    .project-section-navigation__number {
      display: none;
    }
  }
  .project-settings-status {
    padding: var(--ui-space-16, 16px);
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
      padding: var(--ui-space-16, 16px);
    }
  }

  // 共享工作区表面：仅改变颜色，布局与滚动由原组件负责。
  .knowledge-workspace,
  .project-section-navigation {
    .workspace-open-surface();
  }
  .workspace-list-section,
  .workspace-section,
  .workspace-summary,
  .workspace-resume,
  .workspace-card-grid :deep(.workspace-card),
  .workspace-resource-grid > article {
    .workspace-content-surface();
  }

  .knowledge-workspace {
    .workspace-navigation-colors();
  }
  .knowledge-workspace.is-learning {
    .workspace-navigation-colors(note);
  }
  .project-section-navigation > .b_btn:hover {
    .workspace-navigation-hover();
  }
  .project-section-navigation > .b_btn.is-current {
    .workspace-navigation-selected();
  }
  .workspace-kicker,
  .workspace-section__kicker {
    color: var(--workspace-nav-text);
  }
</style>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';

  // Continuous project detail: a desktop outline, a compact touch menu, one page scroll.
  .knowledge-workspace.has-project-rail {
    .workspace-canvas-surface();
    --workspace-accent: var(--workspace-purple-text);
    --workspace-accent-soft: var(--workspace-purple-selected);
    display: grid;
    grid-template-columns: var(--ui-layout-150, 150px) minmax(0, 1fr);
    gap: var(--ui-space-24, 24px);
    align-items: start;
    .project-content {
      display: grid;
      gap: var(--ui-space-20, 20px);
      min-width: 0;
    }
    .project-directory {
      .workspace-open-surface();
      align-self: stretch;
      min-width: 0;
      min-height: var(--project-scroll-height, 100vh);
      border-right: 1px solid var(--workspace-border);
    }
    .project-section-navigation {
      .workspace-open-surface();
      max-height: var(--project-scroll-height, 100vh);
      overflow-y: auto;
      box-sizing: border-box;
      grid-column: auto;
      grid-row: auto;
      position: sticky;
      top: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ui-space-6, 6px);
      padding: var(--ui-space-8, 8px);
      border: 1px solid var(--workspace-border);
      border-radius: 10px;
      box-shadow: none;
      margin: 0;
      min-width: 0;
    }
    .project-directory-back {
      padding-bottom: var(--ui-space-10, 10px);
      margin-bottom: var(--ui-space-6, 6px);
      border-bottom: 1px solid var(--workspace-divider);
    }
    .project-directory-back .b_btn {
      gap: var(--ui-space-4, 4px);
    }
    .project-section-navigation > .b_btn {
      width: 100%;
      min-height: var(--ui-layout-40, 40px);
      padding: var(--ui-space-8, 8px);
      font-size: var(--ui-font-14, 14px);
      text-align: left;
      justify-content: flex-start;
      gap: var(--ui-space-8, 8px);
      border: 1px solid transparent;
      border-left-width: 3px;
      border-radius: 7px;
      background: transparent;
      color: var(--workspace-muted);
    }
    .project-section-navigation > .b_btn:hover {
      .workspace-navigation-hover();
    }
    .project-section-navigation > .b_btn.is-current {
      background: var(--workspace-purple-selected);
      border-left-color: var(--workspace-purple-text);
      color: var(--workspace-purple-text);
    }
    .project-section-navigation__icon {
      display: block;
    }
    .project-mobile-controls {
      display: none;
    }
    .project-breadcrumb__mobile-title {
      display: none;
    }
    .workspace-detail-head {
      .workspace-canvas-surface();
      display: flex;
      position: sticky;
      top: 0;
      min-height: var(--ui-layout-32, 32px);
      padding: 0;
      border: 0;
      box-shadow: none;
    }
    .workspace-detail-head.is-pinned {
      border-bottom: 1px solid var(--workspace-border);
    }
    .workspace-summary,
    .workspace-section {
      border: 0;
      border-radius: 0;
      box-shadow: none;
      padding: 0;
      min-width: 0;
      background: transparent;
    }
    .workspace-summary {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--ui-space-12, 12px) var(--ui-space-24, 24px);
    }
    .workspace-summary__main {
      flex: 1 1 var(--ui-layout-360, 360px);
      min-width: 0;
    }
    .workspace-summary__main > div {
      width: 100%;
    }
    .project-title-row {
      display: flex;
      align-items: center;
      gap: var(--ui-space-12, 12px);
      flex-wrap: wrap;
    }
    .workspace-summary h2 {
      margin: 0;
      font-size: var(--ui-font-28, 28px);
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .workspace-summary__meta {
      flex-wrap: wrap;
    }
    .workspace-summary__main p {
      margin: var(--ui-space-8, 8px) 0 0;
      font-size: var(--ui-font-14, 14px);
      color: var(--workspace-muted);
      line-height: 1.6;
      overflow-wrap: anywhere;
    }
    .project-summary-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ui-space-10, 10px);
      min-width: 0;
    }
    .project-summary-actions .b_btn {
      gap: var(--ui-space-6, 6px);
    }
    .project-overview-metrics {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ui-space-12, 12px);
      margin-right: var(--ui-space-6, 6px);
    }
    .project-overview-metrics > div {
      display: flex;
      align-items: baseline;
      gap: var(--ui-space-4, 4px);
      min-width: 0;
      padding: 0;
      border: 0;
      background: transparent;
      flex: none;
    }
    .project-overview-metrics strong,
    .project-overview-metrics small {
      font-size: var(--ui-font-13, 13px);
      font-weight: 400;
    }
    .workspace-resume {
      display: block;
      padding: var(--ui-space-10, 10px) var(--ui-space-14, 14px);
      border: 1px solid var(--workspace-border);
      border-radius: 10px;
      box-shadow: none;
      background: var(--workspace-purple-selected);
    }
    .workspace-resume__lead {
      gap: var(--ui-space-10, 10px);
      min-width: 0;
    }
    .workspace-resume__lead > span {
      width: var(--ui-layout-22, 22px);
      height: var(--ui-layout-22, 22px);
      background: transparent;
      color: var(--workspace-purple-text);
      flex-shrink: 0;
    }
    .workspace-resume__lead > div {
      display: flex;
      align-items: baseline;
      gap: var(--ui-space-12, 12px);
      min-width: 0;
    }
    .workspace-resume__lead small {
      flex-shrink: 0;
      color: var(--workspace-purple-text);
    }
    .workspace-resume__lead strong {
      font-size: var(--ui-font-14, 14px);
      font-weight: 500;
      line-height: 1.5;
    }
    .workspace-section__head {
      margin-bottom: var(--ui-space-12, 12px);
      gap: var(--ui-space-12, 12px);
      flex-wrap: wrap;
      align-items: center;
    }
    .workspace-section h3 {
      margin: 0;
      display: flex;
      align-items: center;
      gap: var(--ui-space-10, 10px);
      font-size: var(--ui-font-20, 20px);
      line-height: 1.5;
    }
    .workspace-section__head p {
      font-size: var(--ui-font-13, 13px);
    }
    .workspace-resource-toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--ui-space-8, 8px);
      min-width: 0;
    }
    .workspace-resource-toolbar > .project-resource-search {
      width: var(--ui-layout-260, 260px);
      flex: 0 1 var(--ui-layout-260, 260px);
      max-width: 100%;
    }
    .workspace-resource-grid {
      .workspace-content-surface();
      grid-template-columns: minmax(0, 1fr);
      gap: 0;
      margin-top: 0;
      border: 1px solid var(--workspace-border);
      border-radius: 10px;
    }
    .workspace-resource-grid article {
      padding: var(--ui-space-6, 6px) var(--ui-space-12, 12px);
      border: 1px solid transparent;
      border-bottom-color: var(--workspace-divider);
      border-radius: 0;
      min-width: 0;
    }
    .workspace-resource-grid article:first-child {
      border-radius: 9px 9px 0 0;
    }
    .workspace-resource-grid article:last-child {
      border-bottom-color: transparent;
      border-radius: 0 0 9px 9px;
    }
    .workspace-resource-grid article:only-child {
      border-radius: 9px;
    }
    .workspace-resource-grid article.is-selected {
      border-color: var(--workspace-purple-text);
      background: var(--workspace-purple-selected);
    }
    .workspace-resource-grid__icon {
      background: transparent;
      width: var(--ui-layout-28, 28px);
    }
    .workspace-resource-grid article > div:not(.b-action-menu-anchor) {
      display: flex;
      align-items: center;
      gap: var(--ui-space-12, 12px);
    }
    .workspace-resource-grid article > .b-action-menu-anchor {
      flex: none;
      display: block;
    }
    .workspace-resource-grid small {
      flex: 0 0 auto;
      min-width: var(--ui-layout-64, 64px);
      font-size: var(--ui-font-12, 12px);
    }
    .workspace-resource-link.b_btn {
      flex: 1;
      min-width: 0;
      color: var(--workspace-text);
      font-weight: 500;
      font-size: var(--ui-font-14, 14px);
    }
    .workspace-resource-link.b_btn:hover {
      color: var(--workspace-purple-text);
    }
    .workspace-section-empty {
      .workspace-content-surface();
      min-height: var(--ui-layout-64, 64px);
      padding: var(--ui-space-14, 14px);
      border: 1px solid var(--workspace-border);
      border-radius: 10px;
      flex-direction: row;
      justify-content: flex-start;
      text-align: left;
      font-size: var(--ui-font-13, 13px);
    }
    .workspace-progress-section {
      .workspace-content-surface();
      padding: var(--ui-space-16, 16px);
      border: 1px solid var(--workspace-border);
      border-radius: 10px;
      animation: project-view-enter 160ms ease-out;
    }
    .workspace-progress-form {
      margin-top: 0;
    }
    @media (max-width: 1199px) {
      grid-template-columns: minmax(0, 1fr);
      .project-directory {
        display: none;
      }
      .project-mobile-controls {
        display: flex;
        align-items: center;
        gap: var(--ui-space-6, 6px);
      }
      .project-directory-trigger {
        gap: var(--ui-space-6, 6px);
      }
      .project-settings-desktop {
        display: none;
      }
      .project-summary-actions {
        flex: 1 1 100%;
        justify-content: space-between;
      }
      .workspace-resource-toolbar {
        flex: 1 1 auto;
        justify-content: flex-end;
      }
    }
    @media (max-width: 767px) {
      .project-content {
        gap: var(--ui-space-16, 16px);
      }
      .workspace-detail-head {
        min-height: var(--ui-layout-44, 44px);
      }
      .project-breadcrumb {
        display: flex;
      }
      .project-breadcrumb__mobile-back {
        display: inline-block;
      }
      .project-breadcrumb__workshop,
      .project-breadcrumb__desktop-label,
      .project-breadcrumb__separator,
      .project-breadcrumb__current {
        display: none;
      }
      .project-breadcrumb {
        font-size: var(--ui-font-18, 18px);
        font-weight: 600;
      }
      .project-breadcrumb > .b_btn {
        width: var(--ui-layout-44, 44px);
        min-width: var(--ui-layout-44, 44px);
        height: var(--ui-layout-44, 44px);
        min-height: var(--ui-layout-44, 44px);
        padding: 0;
        border-radius: 11px;
        color: var(--text-color);
      }
      .project-breadcrumb__mobile-title {
        display: block;
        min-width: 0;
        margin: 0;
        flex: 1 1 auto;
        overflow: hidden;
        color: var(--text-color);
        font-size: var(--ui-font-18, 18px);
        font-weight: 720;
        line-height: 1.2;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .project-mobile-controls .project-directory-trigger,
      .project-mobile-controls .project-settings-trigger {
        min-width: var(--ui-layout-44, 44px);
        height: var(--ui-layout-44, 44px);
        border: 0;
      }
      .workspace-summary h2 {
        font-size: var(--ui-font-22, 22px);
      }
      .project-title-row {
        gap: var(--ui-space-8, 8px);
      }
      .workspace-summary {
        gap: var(--ui-space-10, 10px);
      }
      .project-summary-actions {
        gap: var(--ui-space-10, 10px);
      }
      .project-overview-metrics {
        gap: var(--ui-space-8, 8px);
      }
      .workspace-resume__lead > span {
        display: none;
      }
      .workspace-resume__lead > div {
        flex-wrap: wrap;
        gap: var(--ui-space-4, 4px) var(--ui-space-10, 10px);
      }
      .workspace-section h3 {
        font-size: var(--ui-font-18, 18px);
      }
      .workspace-resources-section > .workspace-section__head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
      }
      .workspace-resource-toolbar {
        display: contents;
      }
      .project-resource-add {
        grid-column: 2;
        grid-row: 1;
      }
      .workspace-resource-toolbar > .project-resource-search {
        grid-column: 1;
        grid-row: 2;
        width: 100%;
        min-width: 0;
      }
      .project-resource-generate {
        grid-column: 2;
        grid-row: 2;
      }
      .workspace-resource-grid article {
        padding: var(--ui-space-8, 8px);
        gap: var(--ui-space-8, 8px);
      }
      .workspace-resource-grid article > div:not(.b-action-menu-anchor) {
        display: grid;
        gap: 0;
      }
      .workspace-resource-link.b_btn {
        min-height: var(--ui-layout-26, 26px);
      }
      .workspace-progress-form {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .workspace-progress-section {
        animation: none;
      }
    }
  }

  // Approved neutral prototype: white work panels on a quiet canvas.
  .knowledge-workspace.has-project-rail {
    gap: var(--ui-space-32, 32px);
    grid-template-columns: var(--ui-layout-160, 160px) minmax(0, 1fr);
    .project-content {
      padding: var(--ui-space-16, 16px) var(--ui-space-24, 24px) var(--ui-space-24, 24px) 0;
      gap: var(--ui-space-24, 24px);
    }
    .project-section-navigation {
      border: 0;
      border-radius: 0;
      padding: var(--ui-space-16, 16px) var(--ui-space-8, 8px);
      min-height: 0;
      gap: var(--ui-space-2, 2px);
    }
    .project-directory-back {
      padding-bottom: 0;
      border: 0;
      margin-bottom: var(--ui-space-16, 16px);
    }
    .project-directory-back .b_btn {
      color: var(--workspace-muted);
    }
    .project-section-navigation > .b_btn {
      min-height: var(--ui-layout-36, 36px);
      line-height: 1.4;
    }
    .workspace-detail-head {
      min-height: var(--ui-layout-24, 24px);
      margin-bottom: calc(-1 * var(--ui-space-16, 16px));
    }
    .project-overview-panel {
      display: grid;
      gap: var(--ui-space-12, 12px);
      min-width: 0;
    }
    .project-kind {
      background: var(--workspace-hover);
      color: var(--workspace-muted);
      border-color: transparent;
    }
    .project-status {
      display: inline-flex;
      align-items: center;
      gap: var(--ui-space-8, 8px);
      font-size: var(--ui-font-13, 13px);
      color: var(--workspace-text);
    }
    .project-status i {
      width: var(--ui-layout-8, 8px);
      height: var(--ui-layout-8, 8px);
      border-radius: 50%;
      background: var(--workspace-muted);
    }
    .project-status[data-status='active'] i {
      background: var(--success-color);
    }
    .project-status[data-status='paused'] i {
      background: var(--warning-color);
    }
    .project-overview-metrics > div {
      flex-direction: column;
      align-items: center;
      padding: 0 var(--ui-space-12, 12px);
    }
    .project-overview-metrics > div + div {
      border-left: 1px solid var(--workspace-divider);
    }
    .project-overview-metrics strong {
      font-size: var(--ui-font-16, 16px);
      font-weight: 600;
    }
    .project-settings-desktop {
      background: var(--workspace-content);
      border: 1px solid var(--workspace-border);
    }
    .workspace-resume {
      background: transparent;
      border-color: var(--workspace-border);
      border-radius: 6px;
      padding: var(--ui-space-10, 10px) var(--ui-space-16, 16px);
    }
    .workspace-resume__lead small {
      color: var(--workspace-text);
      padding-right: var(--ui-space-12, 12px);
      border-right: 1px solid var(--workspace-divider);
    }
    .workspace-resume__lead strong {
      color: var(--workspace-muted);
      font-weight: 400;
    }
    .workspace-resume__lead > span {
      display: none;
    }
    .workspace-section {
      background: var(--workspace-content);
      border: 1px solid var(--workspace-border);
      border-radius: 8px;
      padding: var(--ui-space-16, 16px);
    }
    .workspace-section h3 {
      font-size: var(--ui-font-18, 18px);
    }
    .workspace-resources-section {
      padding: 0;
      overflow: hidden;
    }
    .workspace-resources-section > .workspace-section__head {
      padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px);
      margin: 0;
    }
    .workspace-resource-grid {
      border: 0;
      border-radius: 0;
    }
    .workspace-resources-section > .workspace-section-empty {
      margin: 0 var(--ui-space-16, 16px) var(--ui-space-16, 16px);
    }
    .project-resource-add {
      background: var(--workspace-content);
      border: 1px solid var(--workspace-border);
      color: var(--workspace-text);
    }
    .project-add-short {
      display: none;
    }
    .project-resource-generate:disabled {
      background: var(--workspace-hover);
      border: 1px solid var(--workspace-border);
    }
    .workspace-section h3 :deep(.b-chip) {
      background: var(--workspace-hover);
      border: 0;
      border-radius: 5px;
      font-size: var(--ui-font-12, 12px);
      font-weight: 400;
      color: var(--workspace-muted);
    }
    .project-resource-columns {
      display: grid;
      grid-template-columns: var(--ui-layout-44, 44px) minmax(0, 1fr) var(--ui-layout-160, 160px) var(
          --ui-layout-32,
          32px
        );
      align-items: center;
      padding: var(--ui-space-6, 6px) var(--ui-space-12, 12px);
      background: var(--workspace-canvas);
      border-top: 1px solid var(--workspace-divider);
      border-bottom: 1px solid var(--workspace-divider);
      border-radius: 0;
      font-size: var(--ui-font-12, 12px);
      color: var(--workspace-muted);
    }
    .workspace-resource-grid article {
      padding-top: var(--ui-space-3, 3px);
      padding-bottom: var(--ui-space-3, 3px);
    }
    .workspace-resource-grid small {
      min-width: var(--ui-layout-150, 150px);
    }
    .workspace-resource-grid__icon {
      border-radius: 5px;
    }
    .workspace-resource-grid__icon.is-bookmark {
      background: var(--workspace-purple-selected);
    }
    .workspace-resource-grid__icon.is-note {
      background: var(--workspace-note-selected);
    }
    .workspace-resource-grid__icon.is-file {
      background: var(--workspace-file-selected);
    }
    .workspace-board-section {
      position: relative;
    }
    .workspace-board-section :deep(.project-board__toolbar) {
      justify-content: flex-end;
      margin-top: calc(-1 * var(--ui-space-36, 36px));
      min-height: var(--ui-layout-24, 24px);
      margin-bottom: var(--ui-space-12, 12px);
      padding-left: var(--ui-layout-180, 180px);
    }
    .workspace-board-section :deep(.project-board__hint) {
      flex: none;
      text-align: right;
    }
    .workspace-timeline {
      gap: var(--ui-space-10, 10px);
    }
    .workspace-timeline article > div {
      background: transparent;
      border: 0;
      padding: 0;
    }
    .workspace-timeline article::before {
      display: none;
    }
    .workspace-timeline article {
      background: var(--workspace-content);
      border: 1px solid var(--workspace-border);
      border-radius: 8px;
      padding: var(--ui-space-16, 16px);
    }
    @media (max-width: 1199px) {
      grid-template-columns: minmax(0, 1fr);
      .project-content {
        padding: var(--ui-space-16, 16px);
      }
    }
    @media (max-width: 767px) {
      .project-content {
        padding: 0;
        gap: var(--ui-space-10, 10px);
      }
      .project-content > :not(.workspace-detail-head) {
        margin-inline: var(--ui-space-10, 10px);
      }
      .workspace-detail-head {
        margin: 0;
        padding: 0 var(--ui-space-8, 8px) 0 var(--ui-space-12, 12px);
        height: var(--ui-layout-56, 56px);
        min-height: var(--ui-layout-56, 56px);
        box-sizing: border-box;
        background: var(--workspace-content);
        border-bottom: 1px solid var(--workspace-border);
      }
      .project-directory-trigger {
        color: var(--workspace-text);
      }
      .project-overview-panel,
      .workspace-section {
        padding: var(--ui-space-14, 14px);
        background: var(--workspace-content);
        border: 1px solid var(--workspace-border);
        border-radius: 12px;
      }
      .project-overview-panel {
        gap: var(--ui-space-12, 12px);
      }
      .workspace-summary h2 {
        font-size: var(--ui-font-24, 24px);
      }
      .workspace-summary__meta {
        gap: var(--ui-space-12, 12px);
      }
      .workspace-resume {
        padding: var(--ui-space-12, 12px) 0 0;
        border: 0;
        border-top: 1px solid var(--workspace-divider);
        border-radius: 0;
      }
      .workspace-resume__lead small {
        border: 0;
      }
      .project-overview-metrics {
        gap: var(--ui-space-8, 8px);
      }
      .project-overview-metrics > div {
        flex-direction: row;
        padding: 0;
        border: 0;
      }
      .project-overview-metrics strong {
        font-size: var(--ui-font-13, 13px);
        font-weight: 400;
      }
      .workspace-resources-section > .workspace-section__head {
        padding: 0;
        margin-bottom: var(--ui-space-12, 12px);
      }
      .workspace-resume__lead > div {
        display: grid;
        gap: var(--ui-space-4, 4px);
      }
      .workspace-resume__lead small {
        font-weight: 600;
      }
      .project-resource-add {
        justify-self: end;
        border: 0;
        padding-right: 0;
        background: transparent;
      }
      .project-add-label {
        display: none;
      }
      .project-add-short {
        display: inline;
      }
      .project-resource-columns {
        display: none;
      }
      .workspace-resource-grid {
        border: 0;
        border-radius: 0;
      }
      .workspace-resource-grid article {
        padding: var(--ui-space-8, 8px) 0;
        border-top: 1px solid var(--workspace-divider);
        border-bottom: 0;
      }
      .workspace-resource-grid small {
        min-width: 0;
      }
      .workspace-resource-grid__icon {
        width: var(--ui-layout-28, 28px);
        height: var(--ui-layout-30, 30px);
      }
      .workspace-board-section :deep(.project-board__toolbar) {
        margin: 0 0 var(--ui-space-12, 12px);
        padding: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        justify-content: stretch;
        gap: var(--ui-space-6, 6px);
      }
      .workspace-board-section :deep(.project-board__hint) {
        text-align: left;
      }
      .workspace-board-section :deep(.project-board__lane-select) {
        width: 100%;
      }
    }
  }
</style>
