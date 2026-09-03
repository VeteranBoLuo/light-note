<template>
  <BDrawer
    :open="open"
    :title="t('resourceOutcome.title')"
    width="620px"
    :mobile-full-screen="true"
    body-padding="0"
    @close="closeDrawer"
    @after-close="handleAfterClose"
  >
    <div class="resource-outcome-drawer">
      <div ref="drawerScrollRef" v-auto-scrollbar class="resource-outcome-drawer__scroll">
        <header class="resource-outcome-drawer__intro">
          <span class="resource-outcome-drawer__intro-icon" aria-hidden="true">
            <SvgIcon :src="icon.ai.organize" size="22" />
          </span>
          <div>
            <strong>{{ t('resourceOutcome.subtitle') }}</strong>
            <p>{{ t('resourceOutcome.description') }}</p>
          </div>
        </header>

        <section
          class="resource-outcome-section resource-outcome-materials"
          :aria-label="t('resourceOutcome.materials')"
        >
          <div class="resource-outcome-section__heading">
            <div>
              <h3>{{ t('resourceOutcome.materials') }}</h3>
              <p>{{ materialSummary }}</p>
            </div>
            <BButton
              v-if="resources.length > materialPreviewLimit"
              size="small"
              class="resource-outcome-link"
              @click="materialsExpanded = !materialsExpanded"
            >
              {{
                t(materialsExpanded ? 'resourceOutcome.collapseMaterials' : 'resourceOutcome.expandMaterials', {
                  count: resources.length,
                })
              }}
            </BButton>
          </div>
          <div class="resource-outcome-materials__list">
            <article
              v-for="resource in visibleResources"
              :key="`${resource.type}:${resource.id}`"
              class="resource-chip"
            >
              <span class="resource-chip__icon" :class="`is-${resource.type}`" aria-hidden="true">
                <SvgIcon :src="resourceIcon(resource.type)" size="16" />
              </span>
              <span class="resource-chip__copy">
                <strong>{{ resource.title || t('inbox.untitled') }}</strong>
                <small>{{ resourceTypeLabel(resource.type) }}</small>
              </span>
            </article>
          </div>
        </section>

        <template v-if="selectedQuickAction">
          <BButton class="resource-outcome-back" @click="backToCatalog">
            {{ t('resourceOutcome.backToOutcomes') }}
          </BButton>
          <AiSkillPanel
            class="resource-outcome-quick-panel"
            :title="selectedQuickAction.label"
            :description="selectedQuickAction.description"
            :skill-id="selectedQuickAction.skillId"
            :surface="surface"
            :resource-refs="aiResourceRefs"
            :scope-label="t('resourceOutcome.selectedScope', { count: resources.length })"
            :actions="quickPanelActions"
            :show-prompt="false"
            :show-grounding="false"
            :auto-run-action-id="selectedQuickAction.id"
            :icon-src="selectedQuickAction.icon || icon.ai.organize"
          >
            <template #result-actions="{ response, result }">
              <BButton
                v-if="result?.kind === 'grounded_markdown' && response.sources.length"
                type="primary"
                :loading="creatingQuickNote"
                :disabled="creatingQuickNote"
                @click="saveQuickResult(response)"
              >
                {{ t('aiSkills.saveAsNote') }}
              </BButton>
            </template>
          </AiSkillPanel>
        </template>

        <template v-else-if="selectedTool">
          <BButton class="resource-outcome-back" :disabled="quoting || starting" @click="backToCatalog">
            {{ t('resourceOutcome.backToOutcomes') }}
          </BButton>

          <section class="resource-outcome-selected-tool">
            <span class="outcome-tool-card__icon" aria-hidden="true">
              <SvgIcon :src="toolIcon(selectedTool)" size="20" />
            </span>
            <span class="outcome-tool-card__copy">
              <strong>{{ toolName(selectedTool) }}</strong>
              <small>{{ toolDescription(selectedTool) }}</small>
            </span>
            <span class="outcome-tool-card__price">{{ toolPriceLabel(selectedTool) }}</span>
            <SvgIcon
              class="resource-outcome-selected-tool__check"
              :src="icon.message.success"
              size="17"
              aria-hidden="true"
            />
          </section>

          <section v-if="selectedWorkflow" class="resource-outcome-section">
            <div class="resource-outcome-section__heading">
              <div>
                <h3>{{ workflowText('designTitle') }}</h3>
                <p>{{ workflowText('designDescription') }}</p>
              </div>
            </div>
            <div class="resource-outcome-intents" role="radiogroup" :aria-label="workflowText('designTitle')">
              <BButton
                v-for="intent in selectedWorkflow.intents"
                :key="intent"
                class="resource-outcome-intent"
                :class="{ 'is-selected': selectedIntent === intent }"
                :aria-checked="selectedIntent === intent"
                role="radio"
                :disabled="quoting || starting"
                @click="selectedIntent = intent"
              >
                <strong>{{ workflowText(`intents.${intent}.label`) }}</strong>
                <small>{{ workflowText(`intents.${intent}.description`) }}</small>
                <SvgIcon v-if="selectedIntent === intent" :src="icon.message.success" size="16" aria-hidden="true" />
              </BButton>
            </div>
          </section>

          <section class="resource-outcome-section resource-outcome-options">
            <div class="resource-outcome-field">
              <label for="resource-outcome-question">{{ t('toolbox.workbench.requestLabel') }}</label>
              <BInput
                id="resource-outcome-question"
                v-model:value="question"
                type="textarea"
                :rows="3"
                :maxlength="TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS"
                :disabled="quoting || starting"
                :placeholder="requestPlaceholder"
              />
              <small>{{ t('toolbox.workbench.requestHint') }}</small>
            </div>
            <div class="resource-outcome-field">
              <span id="resource-outcome-detail-label" class="resource-outcome-field__label">
                {{ t('toolbox.workbench.detailLabel') }}
              </span>
              <div class="resource-outcome-detail-options" role="group" aria-labelledby="resource-outcome-detail-label">
                <BButton
                  v-for="option in detailOptions"
                  :key="option.value"
                  size="small"
                  :class="{ 'is-selected': detailLevel === option.value }"
                  :aria-pressed="detailLevel === option.value"
                  :disabled="quoting || starting"
                  @click="detailLevel = option.value"
                >
                  {{ option.label }}
                </BButton>
              </div>
            </div>
          </section>

          <section class="resource-outcome-section">
            <div class="resource-outcome-section__heading">
              <div>
                <h3>{{ t('toolbox.workbench.billingChoiceTitle') }}</h3>
                <p>{{ t('resourceOutcome.singleBillingHint') }}</p>
              </div>
            </div>
            <div
              class="resource-outcome-billing"
              role="radiogroup"
              :aria-label="t('toolbox.workbench.billingChoiceTitle')"
            >
              <BButton
                v-for="medium in billingChoices"
                :key="medium.value"
                class="resource-outcome-billing__item"
                :class="{ 'is-selected': billingMedium === medium.value }"
                :aria-checked="billingMedium === medium.value"
                role="radio"
                :disabled="quoting || starting"
                @click="billingMedium = medium.value"
              >
                <SvgIcon :src="medium.icon" size="18" aria-hidden="true" />
                <span>
                  <strong>{{ medium.label }}</strong>
                  <small>{{ medium.hint }}</small>
                </span>
                <SvgIcon
                  v-if="billingMedium === medium.value"
                  :src="icon.message.success"
                  size="16"
                  aria-hidden="true"
                />
              </BButton>
            </div>
          </section>

          <div v-if="flowError" class="resource-outcome-state is-error" role="alert">
            <SvgIcon :src="icon.message.error" size="18" aria-hidden="true" />
            <span>{{ flowError }}</span>
          </div>

          <section v-if="quote" class="resource-outcome-quote" aria-live="polite">
            <span class="resource-outcome-quote__icon" aria-hidden="true">
              <SvgIcon :src="quote.billingMedium === 'ai_quota' ? icon.settings.ai : icon.toolbox.coin" size="20" />
            </span>
            <div>
              <strong>{{ t('toolbox.workbench.quoteTitle') }}</strong>
              <span>{{ quoteCostLabel }}</span>
              <small>{{ t('toolbox.workbench.quoteExpires', { time: formatQuoteExpiry(quote.expiresAt) }) }}</small>
              <small v-if="insufficientBilling" class="is-danger">{{ insufficientBillingReason }}</small>
            </div>
          </section>
        </template>

        <template v-else>
          <section class="resource-outcome-section" :aria-label="t('resourceOutcome.chooseOutcome')">
            <div class="resource-outcome-section__heading">
              <div>
                <h3>{{ t('resourceOutcome.chooseOutcome') }}</h3>
                <p>{{ t('resourceOutcome.chooseOutcomeHint') }}</p>
              </div>
            </div>

            <BLoading v-if="catalogLoading" inline loading :title="t('resourceOutcome.loadingCatalog')" />
            <div v-else-if="catalogError" class="resource-outcome-state is-error" role="alert">
              <SvgIcon :src="icon.message.error" size="18" aria-hidden="true" />
              <span>{{ t('resourceOutcome.catalogFailed') }}</span>
              <BButton size="small" @click="loadCatalog">{{ t('common.retry') }}</BButton>
            </div>
            <div v-else-if="!toolOptions.length" class="resource-outcome-state" role="status">
              <SvgIcon :src="icon.message.info" size="18" aria-hidden="true" />
              <span>{{ t('resourceOutcome.noAvailableTools') }}</span>
            </div>
            <div v-else class="resource-outcome-grid">
              <BTooltip
                v-for="option in visibleToolOptions"
                :key="option.tool.id"
                :title="option.reason"
                :disabled="!option.reason"
              >
                <span class="outcome-tool-card__tooltip-anchor">
                  <BButton
                    class="outcome-tool-card"
                    :class="{ 'is-disabled': !option.eligible }"
                    :disabled="!option.eligible"
                    @click="selectTool(option.tool)"
                  >
                    <span class="outcome-tool-card__icon" aria-hidden="true">
                      <SvgIcon :src="toolIcon(option.tool)" size="20" />
                    </span>
                    <span class="outcome-tool-card__copy">
                      <strong>{{ toolName(option.tool) }}</strong>
                      <small>{{ toolDescription(option.tool) }}</small>
                      <em>{{ toolPriceLabel(option.tool) }}</em>
                    </span>
                    <span v-if="!option.eligible" class="outcome-tool-card__reason">{{ option.reason }}</span>
                  </BButton>
                </span>
              </BTooltip>
            </div>
            <BButton
              v-if="toolOptions.length > toolPreviewLimit"
              class="resource-outcome-more"
              @click="toolsExpanded = !toolsExpanded"
            >
              {{ t(toolsExpanded ? 'resourceOutcome.showRecommended' : 'resourceOutcome.showAllOutcomes') }}
            </BButton>
          </section>

          <section v-if="quickActions.length" class="resource-outcome-section resource-outcome-quick-section">
            <div class="resource-outcome-section__heading">
              <div>
                <h3>{{ t('resourceOutcome.quickTitle') }}</h3>
                <p>{{ t('resourceOutcome.quickHint') }}</p>
              </div>
            </div>
            <div class="resource-outcome-quick-actions">
              <BTooltip
                v-for="action in quickActions"
                :key="action.id"
                :title="quickActionReason(action)"
                :disabled="!quickActionReason(action)"
              >
                <span class="resource-outcome-quick-action__anchor">
                  <BButton
                    class="resource-outcome-quick-action"
                    :disabled="Boolean(quickActionReason(action))"
                    @click="selectQuickAction(action)"
                  >
                    <SvgIcon :src="action.icon || icon.ai.materials" size="17" aria-hidden="true" />
                    <span>
                      <strong>{{ action.label }}</strong>
                      <small>{{ quickActionReason(action) || action.description }}</small>
                    </span>
                  </BButton>
                </span>
              </BTooltip>
            </div>
          </section>
        </template>
      </div>

      <footer v-if="selectedTool" class="resource-outcome-drawer__footer">
        <div class="resource-outcome-drawer__footer-copy">
          <strong>{{ quote ? quoteCostLabel : toolPriceLabel(selectedTool) }}</strong>
          <small>{{ quote ? t('resourceOutcome.readyToStart') : t('resourceOutcome.quoteBeforeStart') }}</small>
        </div>
        <BButton v-if="quote" :disabled="starting" @click="clearQuote">
          {{ t('toolbox.workbench.changeInput') }}
        </BButton>
        <BButton
          type="primary"
          :loading="quote ? starting : quoting"
          :disabled="quote ? insufficientBilling || starting : !canQuote || quoting"
          @click="quote ? startJob() : requestQuote()"
        >
          {{ quote ? t('resourceOutcome.confirmGenerate') : t('resourceOutcome.prepareQuote') }}
        </BButton>
      </footer>
    </div>
  </BDrawer>
</template>

<script lang="ts">
  import type { ToolboxResourceRef } from '@/api/toolbox';
  import type { AiSkillPanelAction } from '@/components/aiSkills/types';

  export interface ResourceOutcomeResource extends ToolboxResourceRef {
    title: string;
    quickReadable?: boolean;
  }

  export interface ResourceOutcomeQuickAction extends AiSkillPanelAction {
    description: string;
    minItems?: number;
    maxItems?: number;
    supportedTypes?: readonly ResourceOutcomeResource['type'][];
    requireReadable?: boolean;
    icon?: string;
    generatedNoteTitle?: string;
  }
</script>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS, type ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import type { AiSkillResourceRef, AiSkillResponse } from '@lightnote/shared/ai-skill-protocol';
  import {
    createToolboxClientRequestId,
    createToolboxJob,
    createToolboxQuote,
    fetchToolboxCatalog,
    type ToolboxCatalogItem,
    type ToolboxQuote,
  } from '@/api/toolbox';
  import { aiResourceCountBucket, recordAiProductEvent } from '@/api/aiTelemetry';
  import AiSkillPanel from '@/components/aiSkills/AiSkillPanel.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { formatAiQuotaTokens, useAiQuotaStatus } from '@/composables/useAiQuotaStatus';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useGrowth } from '@/composables/useGrowth';
  import icon from '@/config/icon';
  import {
    isToolboxWorkflowTool,
    TOOLBOX_PRESENTATION,
    TOOLBOX_WORKFLOW_PRESENTATION,
    type ToolboxWorkflowPresentation,
  } from '@/config/toolbox';
  import { useUserStore } from '@/store';
  import { persistAiMarkdownResultAsNote } from '@/utils/aiNoteDraft';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { toolboxErrorMessageKey } from '@/utils/toolboxErrorPresentation';

  type BillingMedium = 'points' | 'ai_quota';
  type DetailLevel = 'concise' | 'balanced' | 'detailed';
  type ToolOption = { tool: ToolboxCatalogItem; eligible: boolean; reason: string };

  const OUTCOME_TOOL_ORDER: readonly ToolboxToolId[] = [
    'material_to_note',
    'research_brief',
    'source_comparison',
    'study_kit',
    'concept_map',
    'knowledge_audit',
  ];

  const props = withDefaults(
    defineProps<{
      open: boolean;
      resources: readonly ResourceOutcomeResource[];
      surface: 'cloud_space' | 'search' | 'bookmark_manage' | 'note_library';
      quickActions?: readonly ResourceOutcomeQuickAction[];
    }>(),
    { quickActions: () => [] },
  );
  const emit = defineEmits<{
    'update:open': [open: boolean];
    'job-created': [jobId: string];
  }>();

  const { t, locale } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const { growth, load: loadGrowth } = useGrowth();
  const { status: aiQuotaStatus, load: loadAiQuota } = useAiQuotaStatus({ autoLoad: false });
  const materialPreviewLimit = 3;
  const toolPreviewLimit = 4;
  const materialsExpanded = ref(false);
  const toolsExpanded = ref(false);
  const catalog = ref<ToolboxCatalogItem[]>([]);
  const catalogLoading = ref(false);
  const catalogError = ref(false);
  const selectedToolId = ref<ToolboxToolId | ''>('');
  const selectedQuickActionId = ref('');
  const selectedIntent = ref('');
  const question = ref('');
  const detailLevel = ref<DetailLevel>('balanced');
  const billingMedium = ref<BillingMedium>('points');
  const quote = ref<ToolboxQuote | null>(null);
  const quoting = ref(false);
  const starting = ref(false);
  const creatingQuickNote = ref(false);
  const flowError = ref('');
  const drawerScrollRef = ref<HTMLElement | null>(null);
  let stateVersion = 0;
  let afterCloseResolver: (() => void) | null = null;

  const visibleResources = computed(() =>
    materialsExpanded.value ? props.resources : props.resources.slice(0, materialPreviewLimit),
  );
  const aiResourceRefs = computed<AiSkillResourceRef[]>(() =>
    props.resources.map((resource) => ({ type: resource.type, id: resource.id, version: resource.version })),
  );
  const resourceTypes = computed(() => [...new Set(props.resources.map((resource) => resource.type))]);
  const telemetryResourceType = computed(() =>
    resourceTypes.value.length > 1 ? 'mixed' : resourceTypes.value[0] || 'none',
  );
  const materialSummary = computed(() => {
    const counts = props.resources.reduce<Record<string, number>>((result, resource) => {
      result[resource.type] = (result[resource.type] || 0) + 1;
      return result;
    }, {});
    const detail = (['bookmark', 'note', 'file'] as const)
      .filter((type) => counts[type])
      .map((type) => t('resourceOutcome.typeCount', { type: resourceTypeLabel(type), count: counts[type] }))
      .join(' · ');
    return t('resourceOutcome.materialSummary', { count: props.resources.length, detail });
  });
  const selectedTool = computed(() => catalog.value.find((tool) => tool.id === selectedToolId.value) || null);
  const selectedWorkflow = computed<ToolboxWorkflowPresentation | null>(() => {
    const toolId = selectedToolId.value;
    return toolId && isToolboxWorkflowTool(toolId) ? TOOLBOX_WORKFLOW_PRESENTATION[toolId] : null;
  });
  const selectedQuickAction = computed(
    () => props.quickActions.find((action) => action.id === selectedQuickActionId.value) || null,
  );
  const quickPanelActions = computed(() => (selectedQuickAction.value ? [selectedQuickAction.value] : []));
  const toolOptions = computed<ToolOption[]>(() => {
    const order = new Map(OUTCOME_TOOL_ORDER.map((id, index) => [id, index]));
    return catalog.value
      .filter(
        (tool) =>
          tool.availability.enabled &&
          tool.executionMode === 'ai_skill' &&
          tool.input.kind === 'resources' &&
          isToolboxWorkflowTool(tool.id),
      )
      .map((tool) => {
        const reason = toolEligibilityReason(tool);
        return { tool, eligible: !reason, reason };
      })
      .sort((left, right) => {
        if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
        return (order.get(left.tool.id) ?? 99) - (order.get(right.tool.id) ?? 99);
      });
  });
  const visibleToolOptions = computed(() =>
    toolsExpanded.value ? toolOptions.value : toolOptions.value.slice(0, toolPreviewLimit),
  );
  const aiQuotaBalanceLabel = computed(() =>
    aiQuotaStatus.value?.exempt
      ? t('settings.ai.quotaUnlimited')
      : formatAiQuotaTokens(aiQuotaStatus.value?.availableRemaining ?? aiQuotaStatus.value?.remaining, locale.value),
  );
  const billingChoices = computed(() => {
    const tool = selectedTool.value;
    if (!tool) return [];
    return [
      ...(tool.billingMedia.includes('ai_quota')
        ? [
            {
              value: 'ai_quota' as const,
              icon: icon.settings.ai,
              label: t('toolbox.workbench.aiQuotaBilling'),
              hint: t('toolbox.workbench.aiQuotaBillingHint', { balance: aiQuotaBalanceLabel.value }),
            },
          ]
        : []),
      ...(tool.billingMedia.includes('points')
        ? [
            {
              value: 'points' as const,
              icon: icon.toolbox.coin,
              label: t('toolbox.workbench.pointsBilling'),
              hint: t('toolbox.workbench.pointsBillingHint', { min: tool.price.min, max: tool.price.max }),
            },
          ]
        : []),
    ];
  });
  const detailOptions = computed<Array<{ value: DetailLevel; label: string }>>(() => [
    { value: 'concise', label: t('toolbox.workbench.detailConcise') },
    { value: 'balanced', label: t('toolbox.workbench.detailBalanced') },
    { value: 'detailed', label: t('toolbox.workbench.detailDetailed') },
  ]);
  const requestPlaceholder = computed(() => {
    if (!selectedWorkflow.value) return t('toolbox.workbench.questionPlaceholder');
    return t('toolbox.workbench.requestPlaceholder', {
      primary: workflowText('questionPlaceholder'),
      secondary: workflowText('instructionPlaceholder'),
    });
  });
  const canQuote = computed(() => Boolean(selectedTool.value && !toolEligibilityReason(selectedTool.value)));
  const insufficientBilling = computed(() => {
    if (!quote.value) return false;
    if (quote.value.billingMedium === 'points') {
      return growth.value?.points != null && Number(growth.value.points) < quote.value.quotedPoints;
    }
    const available = aiQuotaStatus.value?.availableRemaining ?? aiQuotaStatus.value?.remaining;
    return aiQuotaStatus.value?.exempt !== true && aiQuotaStatus.value != null && Number(available) <= 0;
  });
  const insufficientBillingReason = computed(() =>
    t(
      quote.value?.billingMedium === 'ai_quota'
        ? 'toolbox.workbench.insufficientAiQuota'
        : 'toolbox.workbench.insufficientPoints',
    ),
  );
  const quoteCostLabel = computed(() =>
    quote.value?.billingMedium === 'ai_quota'
      ? t('toolbox.workbench.aiQuotaActualUsage')
      : t('toolbox.pointsExact', { points: quote.value?.quotedPoints || 0 }),
  );
  const resourcesKey = computed(() =>
    props.resources.map((resource) => `${resource.type}:${resource.id}:${resource.version || ''}`).join('|'),
  );

  function resourceTypeLabel(type: ResourceOutcomeResource['type']) {
    return t(`resourceOutcome.type.${type}`);
  }

  function resourceIcon(type: ResourceOutcomeResource['type']) {
    if (type === 'note') return icon.resource.note;
    if (type === 'file') return icon.resource.file;
    return icon.resource.bookmark;
  }

  function toolName(tool: ToolboxCatalogItem) {
    return t(`toolbox.tool.${tool.id}.name`);
  }

  function toolDescription(tool: ToolboxCatalogItem) {
    return t(`toolbox.tool.${tool.id}.description`);
  }

  function toolIcon(tool: ToolboxCatalogItem) {
    return TOOLBOX_PRESENTATION[tool.id]?.icon || icon.toolbox.materialNote;
  }

  function toolPriceLabel(tool: ToolboxCatalogItem) {
    if (tool.price.kind === 'free') return t('toolbox.free');
    if (tool.billingMedia.includes('ai_quota')) {
      return t('toolbox.billingChoiceRange', { min: tool.price.min, max: tool.price.max });
    }
    return t('toolbox.points', { min: tool.price.min, max: tool.price.max });
  }

  function toolEligibilityReason(tool: ToolboxCatalogItem) {
    const count = props.resources.length;
    if (count < tool.input.minItems) return t('toolbox.workbench.validationMin', { min: tool.input.minItems });
    if (count > tool.input.maxItems) return t('toolbox.workbench.validationMax', { max: tool.input.maxItems });
    const allowed = new Set(tool.input.resourceTypes || []);
    if (props.resources.some((resource) => !allowed.has(resource.type))) {
      return t('resourceOutcome.unsupportedResourceType');
    }
    return '';
  }

  function quickActionReason(action: ResourceOutcomeQuickAction) {
    const count = props.resources.length;
    if (count < (action.minItems || 1)) {
      return t('toolbox.workbench.validationMin', { min: action.minItems || 1 });
    }
    if (action.maxItems && count > action.maxItems) {
      return t('toolbox.workbench.validationMax', { max: action.maxItems });
    }
    if (action.supportedTypes?.length) {
      const allowed = new Set(action.supportedTypes);
      if (props.resources.some((resource) => !allowed.has(resource.type))) {
        return t('resourceOutcome.unsupportedResourceType');
      }
    }
    if (action.requireReadable && props.resources.some((resource) => resource.quickReadable === false)) {
      return t('resourceOutcome.quickUnreadable');
    }
    return action.reason || '';
  }

  function workflowText(path: string) {
    return t(`toolbox.workbench.workflow.${selectedToolId.value}.${path}`);
  }

  function resetDrawerScroll() {
    void nextTick(() => {
      if (drawerScrollRef.value) drawerScrollRef.value.scrollTop = 0;
    });
  }

  function selectTool(tool: ToolboxCatalogItem) {
    if (toolEligibilityReason(tool)) return;
    selectedQuickActionId.value = '';
    selectedToolId.value = tool.id;
    selectedIntent.value = isToolboxWorkflowTool(tool.id) ? TOOLBOX_WORKFLOW_PRESENTATION[tool.id].defaultIntent : '';
    billingMedium.value = tool.billingMedia.includes('ai_quota') ? 'ai_quota' : 'points';
    question.value = '';
    detailLevel.value = 'balanced';
    quote.value = null;
    flowError.value = '';
    resetDrawerScroll();
    if (billingMedium.value === 'ai_quota') void loadAiQuota();
  }

  function selectQuickAction(action: ResourceOutcomeQuickAction) {
    if (quickActionReason(action)) return;
    selectedToolId.value = '';
    selectedQuickActionId.value = action.id;
    flowError.value = '';
    resetDrawerScroll();
  }

  function backToCatalog() {
    if (quoting.value || starting.value) return;
    selectedToolId.value = '';
    selectedQuickActionId.value = '';
    quote.value = null;
    flowError.value = '';
    resetDrawerScroll();
  }

  function clearQuote() {
    quote.value = null;
    flowError.value = '';
  }

  async function loadCatalog() {
    const version = stateVersion;
    catalogLoading.value = true;
    catalogError.value = false;
    try {
      const result = await fetchToolboxCatalog();
      if (version !== stateVersion) return;
      catalog.value = result.tools;
    } catch {
      if (version === stateVersion) catalogError.value = true;
    } finally {
      if (version === stateVersion) catalogLoading.value = false;
    }
  }

  async function requestQuote() {
    const tool = selectedTool.value;
    if (!tool || !canQuote.value || quoting.value) return;
    if (blockGuestWrite('toolbox-paid', t('inbox.guestPrompt'))) return;
    const version = stateVersion;
    quoting.value = true;
    flowError.value = '';
    quote.value = null;
    try {
      const result = await createToolboxQuote({
        toolId: tool.id,
        billingMedium: billingMedium.value,
        clientRequestId: createToolboxClientRequestId('quote'),
        input: {
          resourceRefs: props.resources.map((resource) => ({
            type: resource.type,
            id: resource.id,
            version: resource.version,
          })),
          options: {
            question: question.value.trim(),
            intent: selectedIntent.value || undefined,
            detailLevel: detailLevel.value,
          },
        },
      });
      if (version !== stateVersion) return;
      quote.value = result;
      await Promise.all([
        loadGrowth(true),
        result.billingMedium === 'ai_quota' ? loadAiQuota({ force: true }) : Promise.resolve(),
      ]);
    } catch (error: any) {
      if (version !== stateVersion) return;
      flowError.value = t(toolboxErrorMessageKey(error, 'toolbox.workbench.quoteFailed'));
      message.error(flowError.value);
    } finally {
      if (version === stateVersion) quoting.value = false;
    }
  }

  async function startJob() {
    if (!quote.value || starting.value || insufficientBilling.value) return;
    if (new Date(quote.value.expiresAt).getTime() <= Date.now()) {
      quote.value = null;
      flowError.value = t('toolbox.workbench.quoteExpired');
      message.warning(flowError.value);
      return;
    }
    const version = stateVersion;
    const activeQuote = quote.value;
    starting.value = true;
    flowError.value = '';
    void recordAiProductEvent('ai_prompt_submitted', {
      surface: props.surface,
      intent: 'organize',
      resourceType: telemetryResourceType.value,
      resourceCountBucket: aiResourceCountBucket(props.resources.length),
      selectedCount: props.resources.length,
    });
    try {
      const job = await createToolboxJob({
        quoteId: activeQuote.id,
        clientRequestId: createToolboxClientRequestId('job'),
      });
      if (version !== stateVersion) return;
      await Promise.all([
        loadGrowth(true),
        activeQuote.billingMedium === 'ai_quota' ? loadAiQuota({ force: true }) : Promise.resolve(),
      ]);
      emit('job-created', job.id);
      await closeAndNavigate(`/toolbox/task/${job.id}`);
    } catch (error: any) {
      if (version !== stateVersion) return;
      flowError.value = t(toolboxErrorMessageKey(error, 'toolbox.workbench.startFailed'));
      message.error(flowError.value);
    } finally {
      if (version === stateVersion) starting.value = false;
    }
  }

  async function saveQuickResult(response: AiSkillResponse) {
    const action = selectedQuickAction.value;
    if (!action || creatingQuickNote.value) return;
    creatingQuickNote.value = true;
    try {
      const handoff = await persistAiMarkdownResultAsNote(
        response,
        action.generatedNoteTitle || t('resourceOutcome.quickGeneratedNoteTitle'),
      );
      if (!handoff) return;
      message.success(t('aiSkills.noteCreated'));
      await closeAndNavigate(handoff.route.path);
    } catch (error: any) {
      message.error(String(error?.message || t('aiSkills.noteCreateFailed')));
    } finally {
      creatingQuickNote.value = false;
    }
  }

  function formatQuoteExpiry(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(date);
  }

  function closeDrawer() {
    emit('update:open', false);
  }

  function waitForVisualClose() {
    return new Promise<void>((resolve) => {
      afterCloseResolver = resolve;
    });
  }

  async function closeAndNavigate(path: string) {
    const visuallyClosed = waitForVisualClose();
    await closeCurrentMobileOverlayThen(closeDrawer, async () => {
      await Promise.race([visuallyClosed, new Promise<void>((resolve) => window.setTimeout(resolve, 260))]);
      await router.push(path);
    });
  }

  function resetState() {
    stateVersion += 1;
    materialsExpanded.value = false;
    toolsExpanded.value = false;
    selectedToolId.value = '';
    selectedQuickActionId.value = '';
    selectedIntent.value = '';
    question.value = '';
    detailLevel.value = 'balanced';
    billingMedium.value = 'points';
    quote.value = null;
    quoting.value = false;
    starting.value = false;
    creatingQuickNote.value = false;
    flowError.value = '';
  }

  function handleAfterClose() {
    afterCloseResolver?.();
    afterCloseResolver = null;
    if (!props.open) resetState();
  }

  watch(
    [() => props.open, resourcesKey],
    ([open]) => {
      if (!open) return;
      resetState();
      resetDrawerScroll();
      void loadCatalog();
      if (user.id && user.role !== 'visitor') {
        void loadGrowth();
        void loadAiQuota();
      }
      void recordAiProductEvent('ai_entry_opened', {
        surface: props.surface,
        scopeMode: 'selected',
        resourceType: telemetryResourceType.value,
        resourceCountBucket: aiResourceCountBucket(props.resources.length),
        selectedCount: props.resources.length,
      });
    },
    { immediate: true },
  );

  watch([question, detailLevel, selectedIntent, billingMedium], () => {
    quote.value = null;
    flowError.value = '';
  });

  onBeforeUnmount(() => {
    stateVersion += 1;
    afterCloseResolver?.();
    afterCloseResolver = null;
  });
</script>

<style scoped lang="less">
  .resource-outcome-drawer {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--text-color);
  }

  .resource-outcome-drawer__scroll {
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden auto;
    padding: 18px 20px 24px;
    box-sizing: border-box;
  }

  .resource-outcome-drawer__intro {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 16px;
  }

  .resource-outcome-drawer__intro-icon,
  .resource-outcome-quote__icon {
    width: 42px;
    height: 42px;
    flex: 0 0 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--primary-color);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
    color: var(--primary-color);
  }

  .resource-outcome-drawer__intro strong {
    display: block;
    margin-bottom: 3px;
    font-size: 16px;
  }

  .resource-outcome-drawer__intro p,
  .resource-outcome-section__heading p {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }

  .resource-outcome-section {
    margin-top: 14px;
    padding: 15px;
    border: 1px solid var(--surface-border-color);
    border-radius: 15px;
    background: var(--card-background);
  }

  .resource-outcome-materials {
    background: var(--workspace-panel-bg-color);
  }

  .resource-outcome-section__heading {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .resource-outcome-section__heading h3 {
    margin: 0 0 3px;
    font-size: 14px;
  }

  .resource-outcome-link,
  .resource-outcome-back,
  .resource-outcome-more {
    color: var(--primary-color);
    background: transparent;
  }

  .resource-outcome-back {
    margin-top: 16px;
  }

  .resource-outcome-materials__list {
    display: grid;
    gap: 7px;
  }

  .resource-chip {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
  }

  .resource-chip__icon {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    color: var(--resource-bookmark-color, var(--primary-color));
    background: var(--workspace-panel-bg-color);
  }

  .resource-chip__icon.is-note {
    color: var(--resource-note-color, var(--primary-color));
  }

  .resource-chip__icon.is-file {
    color: var(--resource-file-color, var(--primary-color));
  }

  .resource-chip__copy,
  .outcome-tool-card__copy {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
  }

  .resource-chip__copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .resource-chip__copy small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .resource-outcome-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }

  .outcome-tool-card__tooltip-anchor,
  .resource-outcome-quick-action__anchor {
    width: 100%;
    height: 100%;
    display: flex;
  }

  .outcome-tool-card.b_btn {
    position: relative;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 132px;
    align-items: flex-start;
    gap: 10px;
    padding: 13px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    background: var(--card-background);
    line-height: 1.4;
    text-align: left;
    white-space: normal;
  }

  .outcome-tool-card.b_btn:not(:disabled):hover,
  .outcome-tool-card.b_btn:focus-visible {
    border-color: var(--primary-color);
  }

  .outcome-tool-card.b_btn.is-disabled {
    opacity: 0.72;
  }

  .outcome-tool-card__icon {
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
    color: var(--primary-color);
  }

  .outcome-tool-card__copy {
    gap: 3px;
  }

  .outcome-tool-card__copy strong {
    font-size: 14px;
    line-height: 1.35;
  }

  .outcome-tool-card__copy small {
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
  }

  .outcome-tool-card__copy em {
    margin-top: auto;
    color: var(--primary-color);
    font-size: 11px;
    font-style: normal;
    font-weight: 650;
  }

  .outcome-tool-card__reason {
    position: absolute;
    right: 9px;
    bottom: 8px;
    max-width: calc(100% - 18px);
    overflow: hidden;
    color: var(--desc-color);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resource-outcome-more {
    width: 100%;
    margin-top: 10px;
  }

  .resource-outcome-quick-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .resource-outcome-quick-action.b_btn {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 62px;
    justify-content: flex-start;
    gap: 9px;
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
    line-height: 1.4;
    text-align: left;
    white-space: normal;
  }

  .resource-outcome-quick-action > span {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .resource-outcome-quick-action strong {
    font-size: 13px;
  }

  .resource-outcome-quick-action small {
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.4;
  }

  .resource-outcome-quick-panel {
    margin-top: 12px;
  }

  .resource-outcome-selected-tool {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 11px;
    margin-top: 10px;
    padding: 13px;
    border: 2px solid var(--primary-color);
    border-radius: 14px;
    background: var(--card-background);
  }

  .resource-outcome-selected-tool .outcome-tool-card__copy small {
    -webkit-line-clamp: 2;
  }

  .outcome-tool-card__price {
    flex: 0 0 auto;
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 650;
  }

  .resource-outcome-selected-tool__check {
    flex: 0 0 auto;
    color: var(--primary-color);
  }

  .resource-outcome-intents {
    display: grid;
    gap: 7px;
  }

  .resource-outcome-intent.b_btn {
    position: relative;
    width: 100%;
    height: auto;
    min-height: 62px;
    justify-content: flex-start;
    align-items: flex-start;
    flex-direction: column;
    gap: 2px;
    padding: 10px 38px 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
    line-height: 1.4;
    text-align: left;
    white-space: normal;
  }

  .resource-outcome-intent.b_btn.is-selected,
  .resource-outcome-detail-options :deep(.b_btn.is-selected),
  .resource-outcome-billing__item.b_btn.is-selected {
    border: 2px solid var(--primary-color);
    color: var(--primary-color);
    background: var(--card-background);
    font-weight: 650;
  }

  .resource-outcome-intent small,
  .resource-outcome-billing__item small {
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.45;
  }

  .resource-outcome-intent > :deep(svg) {
    position: absolute;
    top: 12px;
    right: 12px;
  }

  .resource-outcome-options,
  .resource-outcome-field {
    display: grid;
    gap: 8px;
  }

  .resource-outcome-field + .resource-outcome-field {
    margin-top: 14px;
  }

  .resource-outcome-field label,
  .resource-outcome-field__label {
    font-size: 13px;
    font-weight: 650;
  }

  .resource-outcome-field > small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .resource-outcome-detail-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }

  .resource-outcome-detail-options :deep(.b_btn) {
    width: 100%;
    height: auto;
    min-height: 38px;
    border-radius: 10px;
  }

  .resource-outcome-billing {
    display: grid;
    gap: 8px;
  }

  .resource-outcome-billing__item.b_btn {
    position: relative;
    width: 100%;
    height: auto;
    min-height: 64px;
    justify-content: flex-start;
    gap: 10px;
    padding: 9px 38px 9px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--workspace-panel-bg-color);
    line-height: 1.4;
    text-align: left;
    white-space: normal;
  }

  .resource-outcome-billing__item > span {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: flex-start;
  }

  .resource-outcome-billing__item > :deep(svg:last-child) {
    position: absolute;
    top: 12px;
    right: 12px;
  }

  .resource-outcome-state {
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 12px;
  }

  .resource-outcome-state.is-error {
    border-color: var(--danger-color);
    color: var(--danger-color);
  }

  .resource-outcome-state > span {
    min-width: 0;
    flex: 1 1 auto;
  }

  .resource-outcome-quote {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    margin-top: 14px;
    padding: 14px;
    border: 2px solid var(--primary-color);
    border-radius: 14px;
    background: var(--card-background);
  }

  .resource-outcome-quote > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .resource-outcome-quote span {
    color: var(--primary-color);
    font-weight: 650;
  }

  .resource-outcome-quote small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .resource-outcome-quote small.is-danger {
    color: var(--danger-color);
  }

  .resource-outcome-drawer__footer {
    min-height: 76px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 9px;
    padding: 10px 16px max(10px, env(safe-area-inset-bottom));
    box-sizing: border-box;
    border-top: 1px solid var(--surface-divider-color);
    background: var(--card-background);
  }

  .resource-outcome-drawer__footer-copy {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
  }

  .resource-outcome-drawer__footer-copy strong {
    font-size: 14px;
  }

  .resource-outcome-drawer__footer-copy small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .resource-outcome-drawer__footer :deep(.b_btn) {
    min-height: 42px;
    border-radius: 11px;
  }

  @media (max-width: 767px) {
    .resource-outcome-drawer__scroll {
      padding: 14px 14px 22px;
    }

    .resource-outcome-drawer__intro {
      margin-bottom: 12px;
    }

    .resource-outcome-grid,
    .resource-outcome-quick-actions {
      grid-template-columns: minmax(0, 1fr);
    }

    .outcome-tool-card.b_btn {
      min-height: 104px;
    }

    .resource-outcome-selected-tool {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .resource-outcome-selected-tool .outcome-tool-card__copy {
      flex-basis: calc(100% - 50px);
    }

    .outcome-tool-card__price {
      margin-left: 47px;
    }

    .resource-outcome-drawer__footer {
      min-height: 70px;
      padding-right: max(12px, env(safe-area-inset-right));
      padding-left: max(12px, env(safe-area-inset-left));
    }

    .resource-outcome-drawer__footer-copy {
      display: none;
    }

    .resource-outcome-drawer__footer :deep(.b_btn) {
      flex: 1 1 0;
    }
  }

  :global(html.light-note-mobile-rendering .resource-outcome-section),
  :global(html.light-note-mobile-rendering .resource-outcome-selected-tool),
  :global(html.light-note-mobile-rendering .resource-outcome-quote),
  :global(html.light-note-mobile-rendering .resource-outcome-drawer__footer) {
    background: var(--card-background);
    box-shadow: none;
  }

  :global(html.light-note-mobile-rendering .resource-outcome-intent.b_btn.is-selected),
  :global(html.light-note-mobile-rendering .resource-outcome-detail-options .b_btn.is-selected),
  :global(html.light-note-mobile-rendering .resource-outcome-billing__item.b_btn.is-selected) {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--card-background);
  }
</style>
