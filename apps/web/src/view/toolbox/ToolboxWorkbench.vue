<template>
  <main
    ref="pageRef"
    class="toolbox-workbench"
    :class="{ 'is-resource-workspace': resourceWorkspaceActive }"
    data-mobile-resource-scroll
  >
    <div class="toolbox-workbench__inner">
      <BButton class="toolbox-workbench__back" @click="returnToToolboxParent">
        <SvgIcon :src="icon.toolbox.back" size="16" />{{ t('toolbox.back') }}
      </BButton>

      <div v-if="loading" class="toolbox-workbench__state"
        ><BLoading inline loading :title="t('common.loading')"
      /></div>
      <div v-else-if="!tool" class="toolbox-workbench__state is-error" role="alert">
        <span>{{ t('toolbox.unavailable') }}</span>
        <BButton size="small" @click="returnToToolboxParent">{{ t('toolbox.back') }}</BButton>
      </div>

      <template v-else>
        <header class="toolbox-workbench__hero" :class="`is-${presentation.accent}`">
          <span class="toolbox-workbench__icon"><SvgIcon :src="presentation.icon" size="30" /></span>
          <div class="toolbox-workbench__hero-copy">
            <span class="toolbox-workbench__category">{{ t(`toolbox.category.${presentation.category}`) }}</span>
            <h1>{{ t(`toolbox.tool.${tool.id}.name`) }}</h1>
            <p>{{ t(`toolbox.tool.${tool.id}.description`) }}</p>
            <span class="toolbox-workbench__execution">
              <SvgIcon :src="executionIcon" size="16" />
              <span>
                <strong>{{ executionTitle }}</strong>
                <small>{{ executionDescription }}</small>
              </span>
            </span>
          </div>
          <span class="toolbox-workbench__price" :class="{ 'is-free': tool.price.kind === 'free' }">
            <small>{{ t('toolbox.workbench.runCost') }}</small>
            <strong>{{ workbenchCostLabel }}</strong>
          </span>
        </header>

        <section v-if="tool.executionMode === 'browser' && localToolComponent" class="toolbox-workbench__surface">
          <component :is="localToolComponent" :tool-id="routeToolId" />
        </section>
        <section v-else-if="tool.executionMode === 'browser'" class="toolbox-workbench__state is-error" role="alert">
          <span>{{ t('toolbox.unavailable') }}</span>
          <BButton size="small" @click="returnToToolboxParent">{{ t('toolbox.back') }}</BButton>
        </section>

        <section
          v-else-if="tool.executionMode === 'service' && serviceToolComponent"
          class="toolbox-workbench__surface"
        >
          <component :is="serviceToolComponent" :tool-id="tool.id" />
        </section>
        <section v-else-if="tool.executionMode === 'service'" class="toolbox-workbench__state is-error" role="alert">
          <span>{{ t('toolbox.unavailable') }}</span>
          <BButton size="small" @click="returnToToolboxParent">{{ t('toolbox.back') }}</BButton>
        </section>

        <section v-else ref="paidPanelRef" class="toolbox-workbench__paid">
          <div class="toolbox-paid-panel">
            <template v-if="!quote">
              <nav
                v-if="!isPromptTool"
                ref="workflowSwitchRef"
                class="toolbox-workflow-switch"
                :aria-label="t('toolbox.workbench.stepInput')"
              >
                <BButton
                  :class="{ 'is-selected': compactWorkflowStep === 'sources' }"
                  :aria-pressed="compactWorkflowStep === 'sources'"
                  @click="selectCompactWorkflowStep('sources')"
                >
                  {{ t('toolbox.workbench.sourceStep') }}
                </BButton>
                <BButton
                  :class="{ 'is-selected': compactWorkflowStep === 'design' }"
                  :aria-pressed="compactWorkflowStep === 'design'"
                  @click="selectCompactWorkflowStep('design')"
                >
                  {{ t('toolbox.workbench.designStep') }}
                </BButton>
              </nav>
              <div
                class="toolbox-workflow-grid"
                :class="{
                  'is-ocr': tool.id === 'ocr_to_text',
                  'is-prompt': isPromptTool,
                  'is-compact-sources': !isPromptTool && compactWorkflowStep === 'sources',
                  'is-compact-design': !isPromptTool && compactWorkflowStep === 'design',
                }"
              >
                <section v-if="!isPromptTool" class="toolbox-workflow-card is-sources">
                  <div class="toolbox-workflow-card__head">
                    <span>{{ t('toolbox.workbench.sourceStep') }}</span>
                    <h2>{{
                      tool.id === 'ocr_to_text'
                        ? t('toolbox.workbench.ocrSectionTitle')
                        : t('toolbox.workbench.sourceSectionTitle')
                    }}</h2>
                    <p>{{
                      tool.id === 'ocr_to_text'
                        ? t('toolbox.workbench.ocrSectionDescription')
                        : t('toolbox.workbench.sourceSectionDescription')
                    }}</p>
                  </div>

                  <ToolboxResourceSelector
                    v-model="selectedResources"
                    :allowed-types="allowedTypes"
                    :max="tool.input.maxItems"
                    :external-count="uploadFiles.length"
                    :disabled="quoting || uploading"
                    :page-scroll="false"
                  />

                  <div v-if="tool.id === 'ocr_to_text'" class="toolbox-upload-panel">
                    <div class="toolbox-upload-panel__head">
                      <div
                        ><strong>{{ t('toolbox.workbench.uploadDocuments') }}</strong
                        ><span>{{ t('toolbox.workbench.uploadHint', { max: tool.input.maxItems }) }}</span></div
                      >
                      <BUpload
                        raw-file
                        multiple
                        :accept="(tool.input.accept || []).join(',')"
                        :max-total-size="null"
                        :disabled="quoting || uploading"
                        @change="addUploadFiles"
                      >
                        <BButton size="small" :disabled="quoting || uploading"
                          ><SvgIcon :src="icon.toolbox.upload" size="14" />{{
                            t('toolbox.workbench.uploadDocuments')
                          }}</BButton
                        >
                      </BUpload>
                    </div>
                    <div v-if="uploadFiles.length" class="toolbox-upload-list">
                      <article v-for="entry in uploadFiles" :key="entry.id">
                        <span class="toolbox-upload-list__icon"><SvgIcon :src="icon.toolbox.ocr" size="16" /></span>
                        <span class="toolbox-upload-list__copy"
                          ><strong>{{ entry.file.name }}</strong
                          ><small>{{ formatToolboxBytes(entry.file.size) }}</small></span
                        >
                        <span class="toolbox-upload-list__status" :class="`is-${entry.status}`">
                          {{ uploadStatusLabel(entry) }}
                        </span>
                        <BButton
                          :disabled="quoting || uploading || entry.status === 'uploading'"
                          :aria-label="t('toolbox.workbench.removeFile')"
                          @click="removeUploadFile(entry.id)"
                          ><SvgIcon :src="icon.toolbox.delete" size="15"
                        /></BButton>
                      </article>
                    </div>
                  </div>
                </section>

                <aside v-auto-scrollbar class="toolbox-workflow-rail">
                  <section v-if="workflow" class="toolbox-workflow-card is-design">
                    <div class="toolbox-workflow-card__head">
                      <span>{{
                        isPromptTool ? t('toolbox.workbench.promptStep') : t('toolbox.workbench.designStep')
                      }}</span>
                      <h2>{{ workflowText('designTitle') }}</h2>
                      <p>{{ workflowText('designDescription') }}</p>
                    </div>

                    <div class="toolbox-intents">
                      <div class="toolbox-intents__head">
                        <strong>{{ t('toolbox.workbench.intentTitle') }}</strong>
                        <span>{{
                          t(
                            isPromptTool
                              ? 'toolbox.workbench.promptIntentDescription'
                              : 'toolbox.workbench.intentDescription',
                          )
                        }}</span>
                      </div>
                      <div class="toolbox-intents__grid">
                        <BButton
                          v-for="intent in workflow.intents"
                          :key="intent"
                          class="toolbox-intent"
                          :class="{ 'is-selected': selectedIntent === intent }"
                          :aria-pressed="selectedIntent === intent"
                          :disabled="quoting || uploading"
                          @click="selectedIntent = intent"
                        >
                          <strong>{{ workflowText(`intents.${intent}.label`) }}</strong>
                          <span>{{ workflowText(`intents.${intent}.description`) }}</span>
                        </BButton>
                      </div>
                    </div>

                    <div class="toolbox-options">
                      <div class="toolbox-field is-wide">
                        <label for="toolbox-question">
                          {{ workflowText('questionLabel') }}
                          <small>{{
                            t(isPromptTool ? 'toolbox.workbench.required' : 'toolbox.workbench.optional')
                          }}</small>
                        </label>
                        <BInput
                          id="toolbox-question"
                          v-model:value="question"
                          type="textarea"
                          :maxlength="TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS"
                          :rows="isPromptTool ? 7 : 3"
                          :disabled="quoting || uploading"
                          :placeholder="requestPlaceholder"
                        />
                        <small class="toolbox-field__hint">{{ t('toolbox.workbench.requestHint') }}</small>
                      </div>
                      <div class="toolbox-field">
                        <label id="toolbox-detail-label">{{ t('toolbox.workbench.detailLabel') }}</label>
                        <div class="toolbox-detail-options" role="group" aria-labelledby="toolbox-detail-label">
                          <BButton
                            v-for="option in detailOptions"
                            :key="option.value"
                            size="small"
                            :class="{ 'is-selected': detailLevel === option.value }"
                            :aria-pressed="detailLevel === option.value"
                            :disabled="quoting || uploading"
                            @click="detailLevel = option.value"
                          >
                            {{ option.label }}
                          </BButton>
                        </div>
                        <small class="toolbox-field__hint">{{
                          t(
                            isPromptTool
                              ? 'toolbox.workbench.promptDetailDescription'
                              : 'toolbox.workbench.detailDescription',
                          )
                        }}</small>
                      </div>
                    </div>

                    <div class="toolbox-outcomes">
                      <div>
                        <strong>{{ t('toolbox.workbench.outputPreviewTitle') }}</strong>
                        <span>{{ t('toolbox.workbench.outputPreviewDescription') }}</span>
                      </div>
                      <ol>
                        <li v-for="(outcome, index) in workflow.outcomes" :key="outcome">
                          <span>{{ index + 1 }}</span
                          >{{ workflowText(`outcomes.${outcome}`) }}
                        </li>
                      </ol>
                    </div>
                  </section>

                  <section v-else class="toolbox-workflow-card is-ocr-output">
                    <div class="toolbox-workflow-card__head">
                      <span>{{ t('toolbox.workbench.designStep') }}</span>
                      <h2>{{ t('toolbox.workbench.ocrOutputTitle') }}</h2>
                      <p>{{ t('toolbox.tool.ocr_to_text.description') }}</p>
                    </div>
                    <ol class="toolbox-ocr-outcomes">
                      <li v-for="(key, index) in ocrOutcomeKeys" :key="key">
                        <span>{{ index + 1 }}</span>
                        <strong>{{ t(`toolbox.workbench.ocrOutputs.${key}`) }}</strong>
                      </li>
                    </ol>
                  </section>

                  <section class="toolbox-paid-panel__footer" :class="{ 'has-billing-choice': supportsAiQuota }">
                    <strong class="toolbox-run-summary__title">{{ t('toolbox.workbench.runSummaryTitle') }}</strong>
                    <dl class="toolbox-run-summary">
                      <div>
                        <dt>{{
                          t(isPromptTool ? 'toolbox.workbench.runSummaryIdea' : 'toolbox.workbench.runSummaryInput')
                        }}</dt>
                        <dd>{{
                          isPromptTool
                            ? t(
                                question.trim()
                                  ? 'toolbox.workbench.runSummaryPromptReady'
                                  : 'toolbox.workbench.runSummaryPromptMissing',
                              )
                            : t('toolbox.workbench.runSummarySelected', {
                                count: selectedCount,
                                max: tool.input.maxItems,
                              })
                        }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('toolbox.workbench.runSummaryOutput') }}</dt>
                        <dd>{{ t(`toolbox.tool.${tool.id}.output`) }}</dd>
                      </div>
                      <div>
                        <dt>{{ t('toolbox.workbench.runSummaryBilling') }}</dt>
                        <dd>{{ selectedBillingSummary }}</dd>
                      </div>
                    </dl>
                    <div
                      v-if="supportsAiQuota"
                      class="toolbox-billing-choice"
                      role="radiogroup"
                      :aria-label="t('toolbox.workbench.billingChoiceTitle')"
                    >
                      <BButton
                        v-for="medium in billingChoices"
                        :key="medium.value"
                        class="toolbox-billing-choice__item"
                        :class="{ 'is-selected': selectedBillingMedium === medium.value }"
                        :aria-checked="selectedBillingMedium === medium.value"
                        role="radio"
                        :disabled="quoting || uploading"
                        @click="selectedBillingMedium = medium.value"
                      >
                        <SvgIcon :src="medium.icon" size="17" />
                        <span
                          ><strong>{{ medium.label }}</strong
                          ><small>{{ medium.hint }}</small></span
                        >
                      </BButton>
                    </div>
                    <div class="toolbox-billing-note"
                      ><SvgIcon :src="selectedBillingIcon" size="16" /><span>{{ selectedBillingRule }}</span></div
                    >
                    <BButton type="primary" :loading="quoting || uploading" :disabled="!canQuote" @click="requestQuote">
                      {{ quoting ? t('toolbox.workbench.quoting') : t('toolbox.workbench.getQuote') }}
                      <SvgIcon :src="icon.toolbox.arrow" size="15" />
                    </BButton>
                  </section>
                </aside>
              </div>
            </template>

            <template v-else>
              <section class="toolbox-confirmation">
                <div class="toolbox-workflow-card__head">
                  <span>{{ t('toolbox.workbench.confirmStep') }}</span>
                  <h2>{{ t('toolbox.workbench.quoteTitle') }}</h2>
                </div>

                <div class="toolbox-quote">
                  <span class="toolbox-quote__icon" :class="`is-${quote.billingMedium}`"
                    ><SvgIcon :src="quoteBillingIcon" size="27"
                  /></span>
                  <div class="toolbox-quote__copy">
                    <span>{{ t('toolbox.workbench.runCost') }}</span>
                    <strong>{{ quoteCostLabel }}</strong>
                    <small>{{
                      t('toolbox.workbench.quoteExpires', { time: formatQuoteExpiry(quote.expiresAt) })
                    }}</small>
                  </div>
                  <div class="toolbox-quote__balance">
                    <span>{{
                      t(quote.billingMedium === 'points' ? 'growth.points' : 'toolbox.workbench.aiQuotaAvailable')
                    }}</span>
                    <strong>{{ quoteBalanceLabel }}</strong>
                  </div>
                </div>
                <div class="toolbox-quote__rules">
                  <p
                    ><SvgIcon :src="icon.message.info" size="16" />{{
                      quote.billingMedium === 'points'
                        ? t('toolbox.workbench.balanceAfter', { points: quote.quotedPoints })
                        : t('toolbox.workbench.aiQuotaAfter')
                    }}</p
                  >
                  <p><SvgIcon :src="icon.toolbox.local" size="16" />{{ quoteBillingRule }}</p>
                </div>
                <div v-if="insufficientBilling" class="toolbox-quote__insufficient" role="alert">{{
                  t(
                    quote.billingMedium === 'points'
                      ? 'toolbox.workbench.insufficientPoints'
                      : 'toolbox.workbench.insufficientAiQuota',
                  )
                }}</div>
                <div class="toolbox-quote__actions">
                  <BButton @click="quote = null">{{ t('toolbox.workbench.changeInput') }}</BButton>
                  <BButton type="primary" :loading="starting" :disabled="insufficientBilling" @click="startJob">
                    {{ starting ? t('toolbox.workbench.starting') : t('toolbox.workbench.start') }}
                    <SvgIcon :src="icon.toolbox.arrow" size="15" />
                  </BButton>
                </div>
              </section>
            </template>
          </div>
        </section>
      </template>
    </div>
  </main>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { TOOLBOX_PROCESSING_REQUIREMENT_MAX_CHARS, type ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { recordOperation } from '@/api/commonApi';
  import {
    createToolboxClientRequestId,
    createToolboxJob,
    createToolboxQuote,
    fetchToolboxCatalog,
    inferToolboxDocumentMime,
    uploadToolboxDocument,
    type ToolboxCatalogItem,
    type ToolboxQuote,
  } from '@/api/toolbox';
  import type { ResourcePickerType } from '@/composables/useResourcePickerSearch';
  import { formatAiQuotaTokens, useAiQuotaStatus } from '@/composables/useAiQuotaStatus';
  import { blockGuestWrite } from '@/composables/useGuestGuard';
  import { useGrowth } from '@/composables/useGrowth';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import icon from '@/config/icon';
  import {
    canonicalToolboxToolId,
    isToolboxWorkflowTool,
    TOOLBOX_PRESENTATION,
    TOOLBOX_WORKFLOW_PRESENTATION,
  } from '@/config/toolbox';
  import { useUserStore } from '@/store';
  import {
    createLocalId,
    formatToolboxBytes,
    TOOLBOX_LOCAL_DELIVERY_EVENT,
  } from '@/utils/toolboxLocal';
  import {
    restoreToolboxScrollSnapshot,
    returnFromToolboxPage,
    saveToolboxScrollSnapshot,
  } from '@/utils/toolboxNavigation';
  import { toolboxErrorMessageKey } from '@/utils/toolboxErrorPresentation';
  import { recordToolboxRecentUse, toolboxRecentUseIdentityKey } from '@/utils/toolboxRecentUse';
  import type { ToolboxSelectedResource } from '@/utils/toolboxResourceSelection';
  import ToolboxResourceSelector from './components/ToolboxResourceSelector.vue';
  import { getToolboxLocalComponent } from './localToolRegistry';
  import { getToolboxServiceComponent } from './serviceToolRegistry';

  type UploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';
  interface UploadEntry {
    id: string;
    file: File;
    status: UploadStatus;
    sourceId?: string;
  }
  type PaidBillingMedium = 'points' | 'ai_quota';

  const { t, locale } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const { growth, load: loadGrowth } = useGrowth();
  const { status: aiQuotaStatus, load: loadAiQuota } = useAiQuotaStatus({ autoLoad: false });
  const tool = ref<ToolboxCatalogItem | null>(null);
  const pageRef = ref<HTMLElement | null>(null);
  const paidPanelRef = ref<HTMLElement | null>(null);
  const workflowSwitchRef = ref<HTMLElement | null>(null);
  const loading = ref(true);
  const selectedResources = ref<ToolboxSelectedResource[]>([]);
  const uploadFiles = ref<UploadEntry[]>([]);
  const question = ref('');
  const detailLevel = ref<'concise' | 'balanced' | 'detailed'>('balanced');
  const selectedBillingMedium = ref<PaidBillingMedium>('points');
  const quote = ref<ToolboxQuote | null>(null);
  const quoting = ref(false);
  const uploading = ref(false);
  const uploadProgress = ref(0);
  const starting = ref(false);
  const compactWorkflowStep = ref<'sources' | 'design'>('sources');
  let stateVersion = 0;
  const routeToolId = computed(() => String(route.params.toolId || '') as ToolboxToolId);
  const toolId = computed(() => canonicalToolboxToolId(routeToolId.value));
  const workflow = computed(() =>
    isToolboxWorkflowTool(toolId.value) ? TOOLBOX_WORKFLOW_PRESENTATION[toolId.value] : null,
  );
  const selectedIntent = ref(workflow.value?.defaultIntent || '');
  const ocrOutcomeKeys = ['searchable', 'separated', 'reusable'] as const;
  const presentation = computed(() => TOOLBOX_PRESENTATION[toolId.value] || TOOLBOX_PRESENTATION.material_to_note);
  const localToolComponent = computed(() => getToolboxLocalComponent(routeToolId.value));
  const serviceToolComponent = computed(() => getToolboxServiceComponent(toolId.value));
  const allowedTypes = computed<ResourcePickerType[]>(
    () => [...(tool.value?.input.resourceTypes || [])] as ResourcePickerType[],
  );
  const selectedCount = computed(() => selectedResources.value.length + uploadFiles.value.length);
  const isPromptTool = computed(() => tool.value?.input.kind === 'prompt');
  const resourceWorkspaceActive = computed(
    () =>
      Boolean(tool.value) &&
      !quote.value &&
      !isPromptTool.value &&
      tool.value?.executionMode !== 'browser' &&
      tool.value?.executionMode !== 'service',
  );
  const supportsAiQuota = computed(() => Boolean(tool.value?.billingMedia.includes('ai_quota')));
  const canQuote = computed(() =>
    Boolean(
      tool.value &&
      selectedCount.value >= tool.value.input.minItems &&
      selectedCount.value <= tool.value.input.maxItems &&
      (!isPromptTool.value || question.value.trim()) &&
      !uploading.value,
    ),
  );
  const insufficientBilling = computed(() => {
    if (!quote.value) return false;
    if (quote.value.billingMedium === 'points') {
      return growth.value?.points != null && Number(growth.value.points) < quote.value.quotedPoints;
    }
    const available = aiQuotaStatus.value?.availableRemaining ?? aiQuotaStatus.value?.remaining;
    return aiQuotaStatus.value?.exempt !== true && Number(available) <= 0;
  });
  const aiQuotaBalanceLabel = computed(() =>
    aiQuotaStatus.value?.exempt
      ? t('settings.ai.quotaUnlimited')
      : formatAiQuotaTokens(aiQuotaStatus.value?.availableRemaining ?? aiQuotaStatus.value?.remaining, locale.value),
  );
  const workbenchCostLabel = computed(() => {
    if (!tool.value || tool.value.price.kind === 'free') return t('toolbox.free');
    if (supportsAiQuota.value) return t('toolbox.billingChoiceLabel');
    return t('toolbox.points', { min: tool.value.price.min, max: tool.value.price.max });
  });
  const selectedBillingIcon = computed(() =>
    selectedBillingMedium.value === 'ai_quota' ? icon.settings.ai : icon.toolbox.coin,
  );
  const selectedBillingSummary = computed(() =>
    t(
      selectedBillingMedium.value === 'ai_quota'
        ? 'toolbox.workbench.runSummaryAiQuotaBillingValue'
        : 'toolbox.workbench.runSummaryPointsBillingValue',
    ),
  );
  const selectedBillingRule = computed(() =>
    t(
      selectedBillingMedium.value === 'ai_quota'
        ? 'toolbox.aiQuotaRule'
        : isPromptTool.value
          ? 'toolbox.promptPointsRule'
          : 'toolbox.pointsRule',
    ),
  );
  const billingChoices = computed(() => [
    {
      value: 'ai_quota' as const,
      icon: icon.settings.ai,
      label: t('toolbox.workbench.aiQuotaBilling'),
      hint: t('toolbox.workbench.aiQuotaBillingHint', { balance: aiQuotaBalanceLabel.value }),
    },
    {
      value: 'points' as const,
      icon: icon.toolbox.coin,
      label: t('toolbox.workbench.pointsBilling'),
      hint: tool.value
        ? t('toolbox.workbench.pointsBillingHint', { min: tool.value.price.min, max: tool.value.price.max })
        : '',
    },
  ]);
  const quoteBillingIcon = computed(() =>
    quote.value?.billingMedium === 'ai_quota' ? icon.settings.ai : icon.toolbox.coin,
  );
  const quoteCostLabel = computed(() =>
    quote.value?.billingMedium === 'ai_quota'
      ? t('toolbox.workbench.aiQuotaActualUsage')
      : t('toolbox.pointsExact', { points: quote.value?.quotedPoints || 0 }),
  );
  const quoteBalanceLabel = computed(() =>
    quote.value?.billingMedium === 'ai_quota'
      ? aiQuotaBalanceLabel.value
      : growth.value?.points == null
        ? '—'
        : Number(growth.value.points).toLocaleString(),
  );
  const quoteBillingRule = computed(() =>
    quote.value?.billingMedium === 'ai_quota'
      ? t('toolbox.aiQuotaRule')
      : t(isPromptTool.value ? 'toolbox.promptPointsRule' : 'toolbox.pointsRule'),
  );
  const executionTitle = computed(() => {
    if (tool.value?.executionMode === 'browser') return t('toolbox.workbench.localExecutionTitle');
    if (tool.value?.executionMode === 'service') return t('toolbox.workbench.serviceExecutionTitle');
    if (tool.value?.executionMode === 'worker') return t('toolbox.workbench.workerExecutionTitle');
    if (supportsAiQuota.value) return t('toolbox.workbench.flexibleBillingExecutionTitle');
    return t('toolbox.workbench.pointsExecutionTitle');
  });
  const executionDescription = computed(() => {
    if (tool.value?.executionMode === 'browser') return t('toolbox.workbench.localExecutionDescription');
    if (tool.value?.executionMode === 'service') return t('toolbox.workbench.serviceExecutionDescription');
    if (tool.value?.executionMode === 'worker') return t('toolbox.workbench.workerExecutionDescription');
    if (supportsAiQuota.value) return t('toolbox.workbench.flexibleBillingExecutionDescription');
    if (isPromptTool.value) return t('toolbox.workbench.promptPointsExecutionDescription');
    return t('toolbox.workbench.pointsExecutionDescription');
  });
  const executionIcon = computed(() => {
    if (tool.value?.executionMode === 'browser') return icon.toolbox.local;
    if (tool.value?.executionMode === 'service') return icon.toolbox.audit;
    return supportsAiQuota.value ? icon.settings.ai : icon.toolbox.coin;
  });
  const detailOptions = computed<Array<{ value: 'concise' | 'balanced' | 'detailed'; label: string }>>(() => [
    { value: 'concise', label: t('toolbox.workbench.detailConcise') },
    { value: 'balanced', label: t('toolbox.workbench.detailBalanced') },
    { value: 'detailed', label: t('toolbox.workbench.detailDetailed') },
  ]);
  const requestPlaceholder = computed(() =>
    t('toolbox.workbench.requestPlaceholder', {
      primary: workflowText('questionPlaceholder'),
      secondary: workflowText('instructionPlaceholder'),
    }),
  );

  function returnToToolboxParent() {
    returnFromToolboxPage(router, 'workbench');
  }

  async function selectCompactWorkflowStep(step: 'sources' | 'design') {
    compactWorkflowStep.value = step;
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    await nextTick();
    // 移动端的资料步骤可能很长。切换后把持久可见的步骤导航恢复到
    // 内容起点，避免沿用旧列表的深滚动位置而直接落在设计面板中段。
    const page = pageRef.value;
    const paidPanel = paidPanelRef.value;
    if (!page || !paidPanel || !workflowSwitchRef.value) return;
    page.scrollTo({ top: Math.max(0, paidPanel.offsetTop - 10), left: 0, behavior: 'auto' });
  }

  function rememberWorkbenchScroll() {
    saveToolboxScrollSnapshot({
      routeFullPath: route.fullPath,
      identityKey: toolboxRecentUseIdentityKey(user),
      element: pageRef.value,
    });
  }

  useMobileTopBar(['toolboxWorkbench'], {
    title: () => (tool.value ? t(`toolbox.tool.${tool.value.id}.name`) : t('toolbox.title')),
    onBack: returnToToolboxParent,
    searchMode: 'icon',
    showNotification: false,
  });

  function resetInput() {
    stateVersion += 1;
    selectedResources.value = [];
    uploadFiles.value = [];
    question.value = '';
    detailLevel.value = 'balanced';
    selectedBillingMedium.value = 'points';
    selectedIntent.value = workflow.value?.defaultIntent || '';
    quote.value = null;
    quoting.value = false;
    uploading.value = false;
    starting.value = false;
    compactWorkflowStep.value = 'sources';
  }
  function workflowText(path: string) {
    return t(`toolbox.workbench.workflow.${toolId.value}.${path}`);
  }
  function uploadStatusLabel(entry: UploadEntry) {
    if (entry.status === 'uploaded') return t('toolbox.workbench.uploaded');
    if (entry.status === 'uploading')
      return t('toolbox.workbench.uploading', { current: uploadProgress.value, total: uploadFiles.value.length });
    if (entry.status === 'failed') return t('toolbox.workbench.uploadFailed');
    return t('toolbox.task.queued');
  }
  async function loadTool() {
    const version = stateVersion;
    const requestedToolId = toolId.value;
    loading.value = true;
    try {
      const loaded =
        (await fetchToolboxCatalog()).tools.find((item) => item.id === requestedToolId && item.availability.enabled) ||
        null;
      if (version === stateVersion) {
        tool.value = loaded;
        if (loaded) {
          selectedBillingMedium.value = loaded.billingMedia.includes('ai_quota') ? 'ai_quota' : 'points';
          if (loaded.billingMedia.includes('ai_quota')) void loadAiQuota();
          recordToolboxRecentUse(user, loaded.id);
        }
      }
    } catch {
      if (version === stateVersion) tool.value = null;
    } finally {
      if (version === stateVersion) loading.value = false;
    }
  }
  function addUploadFiles(value: File[]) {
    if (!tool.value || quoting.value || uploading.value) return;
    const files = Array.isArray(value) ? value : [];
    const total = selectedResources.value.length + uploadFiles.value.length + files.length;
    if (total > tool.value.input.maxItems) {
      message.warning(t('toolbox.workbench.validationMax', { max: tool.value.input.maxItems }));
      return;
    }
    const accept = new Set(tool.value.input.accept || []);
    if (files.some((file) => !accept.has(inferToolboxDocumentMime(file)))) {
      message.warning(t('toolbox.local.invalidType'));
      return;
    }
    if (files.some((file) => file.size > Number(tool.value?.input.maxBytes || 0))) {
      message.warning(t('toolbox.workbench.fileTooLarge'));
      return;
    }
    uploadFiles.value.push(
      ...files.map((file) => ({ id: createLocalId('toolbox-upload'), file, status: 'pending' as const })),
    );
    quote.value = null;
  }
  function removeUploadFile(id: string) {
    if (quoting.value || uploading.value) return;
    uploadFiles.value = uploadFiles.value.filter((entry) => entry.id !== id);
    quote.value = null;
  }
  async function ensureUploadedSources(activeTool: ToolboxCatalogItem, version: number) {
    if (activeTool.id !== 'ocr_to_text') return [];
    const entries = [...uploadFiles.value];
    uploading.value = true;
    uploadProgress.value = entries.filter((entry) => entry.status === 'uploaded').length;
    try {
      for (const entry of entries) {
        if (version !== stateVersion) return [];
        if (entry.sourceId) continue;
        entry.status = 'uploading';
        try {
          entry.sourceId = await uploadToolboxDocument(entry.file, activeTool.id);
          entry.status = 'uploaded';
          uploadProgress.value += 1;
        } catch (error) {
          entry.status = 'failed';
          throw error;
        }
      }
      return entries.map((entry) => entry.sourceId).filter(Boolean) as string[];
    } finally {
      if (version === stateVersion) uploading.value = false;
    }
  }
  async function requestQuote() {
    if (!tool.value || !canQuote.value || quoting.value) return;
    if (blockGuestWrite('toolbox-paid', t('inbox.guestPrompt'))) return;
    const version = stateVersion;
    const activeTool = tool.value;
    quoting.value = true;
    try {
      const sourceIds = await ensureUploadedSources(activeTool, version);
      if (version !== stateVersion) return;
      const result = await createToolboxQuote({
        toolId: activeTool.id,
        billingMedium: selectedBillingMedium.value,
        clientRequestId: createToolboxClientRequestId('quote'),
        input: {
          resourceRefs: selectedResources.value.map((item) => ({ type: item.type, id: item.id })),
          sourceIds,
          options: {
            question: String(question.value || '').trim(),
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
      if (version === stateVersion) {
        message.error(
          uploadFiles.value.some((entry) => entry.status === 'failed')
            ? t('toolbox.workbench.uploadFailed')
            : t(toolboxErrorMessageKey(error, 'toolbox.workbench.quoteFailed')),
        );
      }
    } finally {
      if (version === stateVersion) quoting.value = false;
    }
  }
  async function startJob() {
    if (!quote.value || starting.value) return;
    if (new Date(quote.value.expiresAt).getTime() <= Date.now()) {
      quote.value = null;
      message.warning(t('toolbox.workbench.quoteExpired'));
      return;
    }
    const version = stateVersion;
    const activeQuote = quote.value;
    starting.value = true;
    try {
      const job = await createToolboxJob({
        quoteId: activeQuote.id,
        clientRequestId: createToolboxClientRequestId('job'),
      });
      if (version !== stateVersion) return;
      await loadGrowth(true);
      if (activeQuote.billingMedium === 'ai_quota') await loadAiQuota({ force: true });
      rememberWorkbenchScroll();
      await router.push(`/toolbox/task/${job.id}`);
    } catch (error: any) {
      if (version === stateVersion) {
        message.error(t(toolboxErrorMessageKey(error, 'toolbox.workbench.startFailed')));
      }
    } finally {
      if (version === stateVersion) starting.value = false;
    }
  }
  function formatQuoteExpiry(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(date);
  }
  async function resetPageScroll() {
    await nextTick();
    window.requestAnimationFrame(() => pageRef.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }
  watch(toolId, () => {
    resetInput();
    void resetPageScroll();
    void loadTool();
  });
  watch(
    [selectedResources, question, detailLevel, selectedIntent, selectedBillingMedium],
    () => {
      quote.value = null;
    },
    { deep: true },
  );
  async function initializeWorkbench() {
    await Promise.all([loadTool(), user.role === 'visitor' ? Promise.resolve() : loadGrowth()]);
    await nextTick();
    window.requestAnimationFrame(() => {
      const restored = restoreToolboxScrollSnapshot({
        routeFullPath: route.fullPath,
        identityKey: toolboxRecentUseIdentityKey(user),
        element: pageRef.value,
      });
      if (!restored) pageRef.value?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }
  function recordLocalDelivery() {
    const currentTool = tool.value;
    if (user.role === 'visitor' || !currentTool || !['browser', 'service'].includes(currentTool.executionMode)) return;
    void recordOperation({
      module: '知识工坊',
      operation: `导出工具结果【${currentTool.id}】`,
    });
  }
  onMounted(() => {
    window.addEventListener(TOOLBOX_LOCAL_DELIVERY_EVENT, recordLocalDelivery);
    void initializeWorkbench();
  });
  onBeforeUnmount(() => {
    window.removeEventListener(TOOLBOX_LOCAL_DELIVERY_EVENT, recordLocalDelivery);
    stateVersion += 1;
  });
</script>

<style scoped lang="less">
  @import './toolboxPageScroll.less';

  .toolbox-workbench {
    .toolbox-page-scroll();
    padding: 24px clamp(20px, 4vw, 52px) 50px;
    color: var(--text-color);
  }
  .toolbox-workbench__inner {
    width: min(1120px, 100%);
    margin: 0 auto;
  }
  .toolbox-workbench__back {
    position: sticky;
    z-index: 8;
    top: 8px;
    height: 32px;
    margin-bottom: 14px;
    padding: 0 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    background: var(--card-background);
    box-shadow: 0 6px 18px rgba(20, 24, 40, 0.08);
    gap: 6px;
    color: var(--desc-color);
  }
  @media (hover: hover) and (pointer: fine) {
    .toolbox-workbench__back:hover {
      border-color: var(--primary-color);
      color: var(--primary-color);
      background: var(--hover-background);
    }
  }
  .toolbox-workbench__state {
    min-height: 360px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  .toolbox-workbench__hero {
    --tool-accent: var(--primary-color);
    position: relative;
    min-height: 132px;
    padding: 24px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 18px;
    overflow: hidden;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 21px;
    background: linear-gradient(
      125deg,
      color-mix(in srgb, var(--tool-accent) 8%, var(--card-background)),
      var(--card-background) 66%
    );
  }
  .toolbox-workbench__hero.is-blue {
    --tool-accent: #3975d5;
  }
  .toolbox-workbench__hero.is-violet {
    --tool-accent: #6557da;
  }
  .toolbox-workbench__hero.is-amber {
    --tool-accent: #ad6b0d;
  }
  .toolbox-workbench__hero.is-teal {
    --tool-accent: #07835f;
  }
  .toolbox-workbench__hero.is-rose {
    --tool-accent: #c24b68;
  }
  .toolbox-workbench__hero::before {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 4px;
    background: var(--tool-accent);
    content: '';
  }
  .toolbox-workbench__icon {
    width: 62px;
    height: 62px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--tool-accent) 24%, var(--surface-border-color));
    border-radius: 18px;
    color: var(--tool-accent);
    background: var(--card-background);
  }
  .toolbox-workbench__badges {
    display: flex;
    gap: 5px;
  }
  .toolbox-workbench__hero h1 {
    margin: 7px 0 5px;
    font-size: 25px;
    letter-spacing: -0.025em;
  }
  .toolbox-workbench__hero p {
    max-width: 700px;
    margin: 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
  }
  .toolbox-workbench__price {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--tool-accent);
    font-size: 13px;
    font-weight: 700;
  }
  .toolbox-workbench__surface,
  .toolbox-workbench__paid {
    margin-top: 18px;
    padding: 20px;
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--card-background);
  }
  .toolbox-steps {
    margin-bottom: 18px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
  }
  .toolbox-steps > div {
    min-height: 46px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--desc-color);
    background: var(--surface-subtle-bg, var(--hover-background));
    font-size: 12px;
  }
  .toolbox-steps > div + div {
    border-left: 1px solid var(--surface-border-color);
  }
  .toolbox-steps span {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    background: var(--card-background);
    font-size: 11px;
  }
  .toolbox-steps .is-active {
    color: var(--primary-color);
    background: var(--card-background);
  }
  .toolbox-steps .is-active span {
    border-color: var(--primary-color);
    color: #fff;
    background: var(--primary-color);
  }
  .toolbox-steps .is-done {
    color: #07835f;
  }
  .toolbox-steps .is-done span {
    border-color: #07835f;
    color: #07835f;
  }
  .toolbox-paid-panel {
    display: grid;
    gap: 18px;
  }
  .toolbox-upload-panel {
    padding: 13px;
    display: grid;
    gap: 11px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--surface-subtle-bg, var(--hover-background));
  }
  .toolbox-upload-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .toolbox-upload-panel__head > div {
    display: grid;
    gap: 3px;
  }
  .toolbox-upload-panel__head span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .toolbox-upload-panel__head :deep(.b_btn) {
    gap: 6px;
  }
  .toolbox-upload-list {
    display: grid;
    gap: 6px;
  }
  .toolbox-upload-list article {
    min-width: 0;
    padding: 8px 9px;
    display: flex;
    align-items: center;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--card-background);
  }
  .toolbox-upload-list__icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 8%, transparent);
  }
  .toolbox-upload-list article > span:nth-child(2) {
    min-width: 0;
    margin-right: auto;
    display: grid;
    gap: 2px;
  }
  .toolbox-upload-list strong {
    overflow: hidden;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-upload-list small {
    color: var(--desc-color);
  }
  .toolbox-upload-list article > :deep(.b_btn) {
    width: 30px;
    height: 30px;
    padding: 0;
    color: var(--desc-color);
    background: transparent;
  }
  .toolbox-options {
    display: grid;
    grid-template-columns: minmax(180px, 0.4fr) minmax(0, 1fr);
    gap: 14px;
  }
  .toolbox-field {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 7px;
  }
  .toolbox-field.is-wide {
    grid-column: 1 / -1;
  }
  .toolbox-field label {
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 650;
  }
  .toolbox-field :deep(.b-input) {
    border: 1px solid var(--surface-border-color) !important;
    background: var(--surface-subtle-bg, var(--hover-background));
  }
  .toolbox-field :deep(.b-textarea) {
    border-color: var(--surface-border-color);
    background: var(--surface-subtle-bg, var(--hover-background)) !important;
  }
  .toolbox-paid-panel__footer {
    padding-top: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    border-top: 1px solid var(--surface-divider-color);
  }
  .toolbox-paid-panel__footer > :deep(.b_btn),
  .toolbox-quote__actions :deep(.b_btn) {
    gap: 7px;
  }
  .toolbox-billing-note {
    max-width: 680px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }
  .toolbox-billing-choice {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }
  .toolbox-billing-choice__item.b_btn {
    width: 100%;
    height: auto;
    min-height: 54px;
    padding: 9px 10px;
    justify-content: flex-start;
    gap: 9px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    color: var(--text-color);
    background: var(--surface-subtle-bg, var(--hover-background));
    text-align: left;
    white-space: normal;
  }
  .toolbox-billing-choice__item > :deep(svg) {
    flex: 0 0 auto;
    color: var(--desc-color);
  }
  .toolbox-billing-choice__item > span {
    min-width: 0;
    display: grid;
    gap: 2px;
  }
  .toolbox-billing-choice__item strong,
  .toolbox-billing-choice__item small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toolbox-billing-choice__item strong {
    font-size: 11px;
  }
  .toolbox-billing-choice__item small {
    color: var(--desc-color);
    font-size: 9.5px;
  }
  .toolbox-billing-choice__item.is-selected {
    border-color: var(--primary-color);
    color: var(--primary-color);
    background: var(--card-background);
    box-shadow: inset 0 0 0 1px var(--primary-color);
  }
  .toolbox-billing-choice__item.is-selected > :deep(svg) {
    color: var(--primary-color);
  }
  .toolbox-billing-choice__item:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  @media (hover: hover) and (pointer: fine) {
    .toolbox-billing-choice__item:not(.is-selected):hover {
      border-color: var(--primary-color);
      background: var(--hover-background);
    }
  }
  .toolbox-billing-note :deep(svg) {
    flex: 0 0 auto;
    color: #ad6b0d;
  }
  .toolbox-quote {
    padding: 22px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 16px;
    border: 1px solid color-mix(in srgb, #ad6b0d 30%, var(--surface-border-color));
    border-radius: 17px;
    background: color-mix(in srgb, #ad6b0d 5%, var(--card-background));
  }
  .toolbox-quote__icon {
    width: 52px;
    height: 52px;
    display: grid;
    place-items: center;
    border-radius: 15px;
    color: #ad6b0d;
    background: var(--card-background);
  }
  .toolbox-quote__icon.is-ai_quota {
    color: var(--primary-color);
  }
  .toolbox-quote__copy,
  .toolbox-quote__balance {
    display: grid;
    gap: 4px;
  }
  .toolbox-quote__copy > span,
  .toolbox-quote__balance span {
    color: var(--desc-color);
    font-size: 12px;
  }
  .toolbox-quote__copy > strong {
    font-size: 24px;
  }
  .toolbox-quote__copy small {
    color: var(--desc-color);
  }
  .toolbox-quote__balance {
    min-width: 110px;
    padding-left: 20px;
    border-left: 1px solid var(--surface-divider-color);
  }
  .toolbox-quote__balance strong {
    font-size: 19px;
  }
  .toolbox-quote__rules {
    display: grid;
    gap: 8px;
  }
  .toolbox-quote__rules p {
    margin: 0;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }
  .toolbox-quote__insufficient {
    padding: 10px 12px;
    border: 1px solid var(--danger-fill-bg, #d93b3b);
    border-radius: 10px;
    color: var(--danger-fill-bg, #d93b3b);
    font-size: 12px;
  }
  .toolbox-quote__actions {
    display: flex;
    justify-content: flex-end;
    gap: 9px;
  }
  @media (max-width: 767px) {
    .toolbox-workbench {
      padding: 10px 12px calc(24px + env(safe-area-inset-bottom));
    }
    .toolbox-workbench__back {
      display: none;
    }
    .toolbox-workbench__hero {
      min-height: 0;
      padding: 17px 15px;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      border-radius: 17px;
    }
    .toolbox-workbench__icon {
      width: 48px;
      height: 48px;
      border-radius: 14px;
    }
    .toolbox-workbench__hero h1 {
      font-size: 20px;
    }
    .toolbox-workbench__hero p {
      font-size: 12px;
    }
    .toolbox-workbench__price {
      grid-column: 1 / -1;
      padding-top: 10px;
      border-top: 1px solid var(--surface-divider-color);
    }
    .toolbox-workbench__surface,
    .toolbox-workbench__paid {
      margin-top: 11px;
      padding: 12px;
      border-radius: 16px;
    }
    .toolbox-steps > div {
      padding: 7px 4px;
      gap: 4px;
    }
    .toolbox-steps strong {
      overflow: hidden;
      font-size: 10px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .toolbox-upload-panel__head,
    .toolbox-paid-panel__footer {
      align-items: stretch;
      flex-direction: column;
    }
    .toolbox-upload-panel__head :deep(.b-upload-trigger),
    .toolbox-upload-panel__head :deep(.b_btn),
    .toolbox-paid-panel__footer > :deep(.b_btn) {
      width: 100%;
    }
    .toolbox-options {
      grid-template-columns: 1fr;
    }
    .toolbox-field.is-wide {
      grid-column: auto;
    }
    .toolbox-quote {
      padding: 16px;
      grid-template-columns: auto minmax(0, 1fr);
    }
    .toolbox-quote__balance {
      grid-column: 1 / -1;
      padding: 10px 0 0;
      grid-template-columns: 1fr auto;
      border-top: 1px solid var(--surface-divider-color);
      border-left: 0;
    }
    .toolbox-quote__actions > :deep(.b_btn) {
      flex: 1;
      width: auto;
    }
  }
  html.light-note-mobile-rendering .toolbox-workbench__hero,
  html.light-note-mobile-rendering .toolbox-upload-list__icon,
  html.light-note-mobile-rendering .toolbox-quote {
    background: var(--card-background);
  }

  /* 共享详情壳：知识工具、OCR 与本地工具保持同一层级，以下规则覆盖上方的旧工作台基线。 */
  .toolbox-workbench__inner {
    width: min(1240px, 100%);
  }
  .toolbox-workbench__hero {
    min-height: 166px;
    padding: 27px 30px;
    grid-template-columns: auto minmax(0, 1fr) 156px;
    gap: 22px;
    border-radius: 24px;
    background: linear-gradient(
      122deg,
      color-mix(in srgb, var(--tool-accent) 9%, var(--surface-raised-background)) 0%,
      var(--surface-raised-background) 52%,
      color-mix(in srgb, var(--tool-accent) 3%, var(--surface-raised-background)) 100%
    );
    box-shadow: var(--surface-raised-shadow);
  }
  .toolbox-workbench__hero::before {
    width: 5px;
  }
  .toolbox-workbench__icon {
    width: 68px;
    height: 68px;
    border-radius: 20px;
    box-shadow: 0 15px 34px -26px var(--tool-accent);
  }
  .toolbox-workbench__hero-copy {
    min-width: 0;
  }
  .toolbox-workbench__category {
    color: var(--tool-accent);
    font-size: 11px;
    font-weight: 720;
    letter-spacing: 0.08em;
  }
  .toolbox-workbench__hero h1 {
    margin: 5px 0 6px;
    font-size: clamp(25px, 2.3vw, 31px);
    font-weight: 760;
  }
  .toolbox-workbench__hero p {
    max-width: 760px;
  }
  .toolbox-workbench__execution {
    width: fit-content;
    max-width: 760px;
    margin-top: 14px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--tool-accent);
  }
  .toolbox-workbench__execution > :deep(svg) {
    margin-top: 2px;
    flex: 0 0 auto;
  }
  .toolbox-workbench__execution > span {
    display: grid;
    gap: 1px;
  }
  .toolbox-workbench__execution strong {
    font-size: 12px;
  }
  .toolbox-workbench__execution small {
    color: var(--desc-color);
    font-size: 10.5px;
    line-height: 1.45;
  }
  .toolbox-workbench__price {
    min-width: 132px;
    padding: 15px 16px;
    display: grid;
    align-items: initial;
    gap: 4px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--tool-accent) 22%, var(--surface-border-color));
    border-radius: 16px;
    background: var(--card-background);
  }
  .toolbox-workbench__price small {
    color: var(--desc-color);
    font-size: 10px;
  }
  .toolbox-workbench__price strong {
    color: var(--tool-accent);
    font-size: 15px;
    font-variant-numeric: tabular-nums;
  }
  .toolbox-workbench__price.is-free strong {
    color: var(--success-color, #07835f);
  }
  .toolbox-workbench__surface {
    padding: 22px;
    border-radius: 22px;
    box-shadow: var(--surface-card-shadow);
  }
  .toolbox-workbench__paid {
    margin-top: 18px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }
  .toolbox-paid-panel {
    gap: 14px;
  }
  .toolbox-workflow-switch {
    display: none;
  }
  .toolbox-workflow-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.12fr) minmax(390px, 0.88fr);
    align-items: start;
    gap: 14px;
  }
  .toolbox-workflow-grid.is-prompt {
    display: block;
    width: min(980px, 100%);
    margin: 0 auto;
  }
  .toolbox-workflow-rail {
    position: static;
    min-width: 0;
    min-height: 0;
    align-self: start;
    display: grid;
    align-content: start;
    gap: 12px;
    overscroll-behavior: contain;
  }
  .toolbox-workflow-grid.is-prompt .toolbox-workflow-rail {
    position: static;
    grid-template-columns: minmax(0, 1.55fr) minmax(290px, 0.45fr);
    align-items: start;
  }
  .toolbox-workflow-card,
  .toolbox-confirmation {
    min-width: 0;
    padding: 20px;
    display: grid;
    align-content: start;
    gap: 18px;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }
  .toolbox-workflow-card.is-sources {
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
  }
  .toolbox-workflow-card__head {
    display: grid;
    gap: 4px;
  }
  .toolbox-workflow-card__head > span {
    color: var(--primary-color);
    font-size: 10px;
    font-weight: 720;
    letter-spacing: 0.07em;
  }
  .toolbox-workflow-card__head h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 730;
    letter-spacing: -0.02em;
  }
  .toolbox-workflow-card__head p {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;
  }
  .toolbox-upload-panel {
    padding: 13px 14px;
  }
  .toolbox-upload-list__copy {
    min-width: 0;
    margin-right: auto;
    display: grid;
    gap: 2px;
  }
  .toolbox-upload-list__status {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--desc-color);
    font-size: 10px;
  }
  .toolbox-upload-list__status::before {
    width: 6px;
    height: 6px;
    flex: 0 0 6px;
    border-radius: 50%;
    background: currentColor;
    content: '';
  }
  .toolbox-upload-list__status.is-uploaded {
    color: var(--success-color, #07835f);
  }
  .toolbox-upload-list__status.is-failed {
    color: var(--danger-color, #d93b3b);
  }
  .toolbox-upload-list__status.is-uploading::before {
    animation: toolbox-pulse 1s ease-in-out infinite;
  }
  .toolbox-intents {
    display: grid;
    gap: 10px;
  }
  .toolbox-intents__head {
    display: grid;
    gap: 2px;
  }
  .toolbox-intents__head strong,
  .toolbox-outcomes > div strong {
    font-size: 12.5px;
  }
  .toolbox-intents__head span,
  .toolbox-outcomes > div span {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.45;
  }
  .toolbox-intents__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }
  .toolbox-intent.b_btn {
    position: relative;
    width: 100%;
    height: auto;
    min-height: 70px;
    padding: 11px 27px 10px 10px;
    display: grid;
    align-content: center;
    justify-items: start;
    gap: 3px;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--text-color);
    background: var(--surface-subtle-bg, var(--hover-background));
    line-height: 1.3;
    text-align: left;
    white-space: normal;
  }
  .toolbox-intent strong {
    min-width: 0;
    font-size: 11.5px;
  }
  .toolbox-intent span {
    min-width: 0;
    color: var(--desc-color);
    font-size: 10px;
    overflow-wrap: anywhere;
  }
  .toolbox-intent.is-selected {
    border-color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 6%, var(--card-background));
    box-shadow: inset 0 0 0 1px var(--primary-color);
  }
  .toolbox-intent.is-selected::after {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 16px;
    height: 16px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
    background: var(--primary-color);
    content: '✓';
    font-size: 10px;
    font-weight: 800;
  }
  .toolbox-options {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .toolbox-field label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
  }
  .toolbox-field label small {
    color: var(--primary-color);
    font-size: 9px;
    font-weight: 600;
  }
  .toolbox-field__hint {
    color: var(--desc-color);
    font-size: 10px;
    line-height: 1.45;
  }
  .toolbox-detail-options {
    padding: 3px;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 3px;
    border: 1px solid var(--surface-border-color);
    border-radius: 11px;
    background: var(--surface-subtle-bg, var(--hover-background));
  }
  .toolbox-detail-options :deep(.b_btn) {
    width: 100%;
    min-height: 31px;
    padding: 0 8px;
    border-color: transparent;
    color: var(--desc-color);
    background: transparent;
  }
  .toolbox-detail-options :deep(.b_btn.is-selected) {
    border-color: var(--surface-border-color);
    color: var(--primary-color);
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }
  .toolbox-outcomes {
    padding: 13px;
    display: grid;
    gap: 10px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 17%, var(--surface-border-color));
    border-radius: 14px;
    background: color-mix(in srgb, var(--primary-color) 3.5%, var(--card-background));
  }
  .toolbox-outcomes > div {
    display: grid;
    gap: 2px;
  }
  .toolbox-outcomes ol,
  .toolbox-ocr-outcomes {
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    list-style: none;
  }
  .toolbox-outcomes li,
  .toolbox-ocr-outcomes li {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 6px;
    color: var(--text-color);
    font-size: 10.5px;
    line-height: 1.4;
  }
  .toolbox-outcomes li > span,
  .toolbox-ocr-outcomes li > span {
    width: 17px;
    height: 17px;
    flex: 0 0 17px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--primary-color) 40%, var(--surface-border-color));
    border-radius: 6px;
    color: var(--primary-color);
    background: var(--card-background);
    font-size: 8px;
    font-weight: 750;
  }
  .toolbox-workflow-card.is-ocr-output {
    min-height: 0;
  }
  .toolbox-ocr-outcomes {
    grid-template-columns: 1fr;
    gap: 10px;
  }
  .toolbox-ocr-outcomes li {
    padding: 13px;
    align-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--surface-subtle-bg, var(--hover-background));
    font-size: 11px;
  }
  .toolbox-paid-panel__footer {
    padding: 16px;
    display: grid;
    align-items: stretch;
    gap: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }
  .toolbox-run-summary__title {
    font-size: 12px;
  }
  .toolbox-run-summary {
    margin: 0;
    display: grid;
    gap: 8px;
  }
  .toolbox-run-summary > div {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    align-items: baseline;
    gap: 10px;
  }
  .toolbox-run-summary dt,
  .toolbox-run-summary dd {
    margin: 0;
    font-size: 10.5px;
    line-height: 1.45;
  }
  .toolbox-run-summary dt {
    color: var(--desc-color);
  }
  .toolbox-run-summary dd {
    overflow-wrap: anywhere;
    color: var(--text-color);
    font-weight: 650;
    text-align: right;
  }
  .toolbox-paid-panel__footer > :deep(.b_btn) {
    width: 100%;
    min-height: 39px;
  }
  .toolbox-confirmation {
    width: min(720px, 100%);
    margin: 0 auto;
    padding: 23px;
  }
  @media (min-width: 768px) {
    .toolbox-workbench.is-resource-workspace {
      padding: 12px clamp(14px, 2vw, 28px) 14px;
      overflow-y: hidden;
      overscroll-behavior: none;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__inner {
      position: relative;
      width: min(1500px, 100%);
      height: 100%;
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__back {
      position: absolute;
      z-index: 9;
      top: 20px;
      left: 12px;
      width: 32px;
      height: 32px;
      margin: 0;
      padding: 0;
      justify-content: center;
      gap: 0;
      overflow: hidden;
      border-color: transparent;
      color: var(--desc-color);
      background: transparent;
      box-shadow: none;
      font-size: 0;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__hero {
      min-height: 72px;
      padding: 10px 14px 10px 56px;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      gap: 12px;
      border-radius: 17px;
      box-shadow: var(--surface-card-shadow);
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__hero::before {
      width: 3px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__icon {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      box-shadow: none;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__category {
      font-size: 9px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__hero h1 {
      margin: 2px 0 0;
      font-size: 20px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__hero-copy > p,
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__execution {
      display: none;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__price {
      min-width: 0;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      border-radius: 12px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__price small {
      display: none;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__price strong {
      font-size: 13px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__paid,
    .toolbox-workbench.is-resource-workspace .toolbox-paid-panel,
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-grid {
      height: 100%;
      min-height: 0;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__paid {
      margin-top: 10px;
      overflow: hidden;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-paid-panel {
      grid-template-rows: auto minmax(0, 1fr);
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-grid {
      align-items: stretch;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-card.is-sources,
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-rail {
      height: 100%;
      min-height: 0;
      align-self: stretch;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-card.is-sources {
      padding: 12px;
      gap: 8px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-card.is-sources > .toolbox-workflow-card__head {
      display: flex;
      align-items: baseline;
      gap: 7px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-card.is-sources > .toolbox-workflow-card__head h2 {
      font-size: 16px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-card.is-sources > .toolbox-workflow-card__head p {
      display: none;
    }
    .toolbox-workbench.is-resource-workspace
      .toolbox-workflow-card.is-sources
      :deep(.toolbox-resource-selector__picker) {
      min-height: 0;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-rail {
      overflow-x: hidden;
      overflow-y: auto;
      gap: 9px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-card.is-design {
      padding: 13px;
      gap: 10px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-card.is-design > .toolbox-workflow-card__head {
      display: flex;
      align-items: baseline;
      gap: 7px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-card.is-design > .toolbox-workflow-card__head h2 {
      font-size: 16px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-card.is-design > .toolbox-workflow-card__head p,
    .toolbox-workbench.is-resource-workspace .toolbox-intents__head > span,
    .toolbox-workbench.is-resource-workspace .toolbox-field__hint,
    .toolbox-workbench.is-resource-workspace .toolbox-outcomes,
    .toolbox-workbench.is-resource-workspace .toolbox-run-summary__title,
    .toolbox-workbench.is-resource-workspace .toolbox-run-summary,
    .toolbox-workbench.is-resource-workspace .toolbox-billing-note {
      display: none;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-intents {
      gap: 6px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-intents__grid {
      gap: 6px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-intent.b_btn {
      min-height: 56px;
      padding-top: 8px;
      padding-bottom: 8px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-options {
      gap: 8px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-field {
      gap: 5px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-detail-options :deep(.b_btn) {
      min-height: 29px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-paid-panel__footer {
      padding: 10px;
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
      border-radius: 14px;
      box-shadow: none;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-paid-panel__footer.has-billing-choice {
      grid-template-columns: minmax(0, 1fr) minmax(128px, 0.3fr);
      align-items: stretch;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-billing-choice__item.b_btn {
      min-height: 46px;
      padding: 7px 9px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-paid-panel__footer > :deep(.b_btn) {
      min-height: 36px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-paid-panel__footer.has-billing-choice > :deep(.b_btn) {
      height: 100%;
    }
  }
  @media (min-width: 1200px) {
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-grid {
      grid-template-columns: minmax(0, 1.08fr) minmax(440px, 0.92fr);
    }
    .toolbox-workbench.is-resource-workspace .toolbox-paid-panel {
      grid-template-rows: minmax(0, 1fr);
    }
  }
  @media (min-width: 768px) and (max-height: 820px) {
    .toolbox-workbench.is-resource-workspace {
      padding-top: 8px;
      padding-bottom: 10px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__hero {
      min-height: 64px;
      padding-top: 8px;
      padding-bottom: 8px;
      grid-template-columns: 38px minmax(0, 1fr) auto;
      gap: 10px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__back {
      top: 16px;
      left: 10px;
      width: 30px;
      height: 30px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__icon {
      width: 38px;
      height: 38px;
      border-radius: 11px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__hero h1 {
      font-size: 18px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workbench__price {
      padding: 7px 9px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-card.is-sources {
      padding: 10px;
      gap: 7px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-card.is-sources :deep(.toolbox-resource-selector) {
      gap: 7px;
    }
    .toolbox-workbench.is-resource-workspace
      .toolbox-workflow-card.is-sources
      :deep(.toolbox-resource-selector__picker) {
      padding: 7px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-workflow-card.is-design {
      padding: 10px;
      gap: 8px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-intent.b_btn {
      min-height: 50px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-paid-panel__footer {
      padding: 8px;
      gap: 7px;
    }
    .toolbox-workbench.is-resource-workspace .toolbox-billing-choice__item.b_btn {
      min-height: 42px;
    }
  }
  @keyframes toolbox-pulse {
    50% {
      opacity: 0.35;
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .toolbox-intent.b_btn:not(.is-selected):not(.disabled):hover {
      border-color: color-mix(in srgb, var(--primary-color) 34%, var(--surface-border-color));
      background: color-mix(in srgb, var(--primary-color) 3%, var(--card-background));
    }
  }
  @media (max-width: 1199px) {
    .toolbox-workflow-switch {
      position: sticky;
      z-index: 7;
      top: 0;
      padding: 3px;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 3px;
      border: 1px solid var(--surface-border-color);
      border-radius: 12px;
      background: var(--surface-subtle-bg, var(--hover-background));
    }
    .toolbox-workflow-switch :deep(.b_btn) {
      width: 100%;
      min-height: 38px;
      border-color: transparent;
      color: var(--desc-color);
      background: transparent;
    }
    .toolbox-workflow-switch :deep(.b_btn.is-selected) {
      border-color: var(--primary-color);
      color: var(--primary-color);
      background: var(--card-background);
      box-shadow: none;
    }
    .toolbox-workflow-grid:not(.is-prompt) {
      grid-template-columns: 1fr;
    }
    .toolbox-workflow-grid.is-compact-sources:not(.is-prompt) .toolbox-workflow-rail,
    .toolbox-workflow-grid.is-compact-design:not(.is-prompt) .toolbox-workflow-card.is-sources {
      display: none;
    }
    .toolbox-workflow-grid.is-compact-sources:not(.is-prompt) .toolbox-workflow-card.is-sources,
    .toolbox-workflow-grid.is-compact-design:not(.is-prompt) .toolbox-workflow-rail {
      display: grid;
    }
    .toolbox-workflow-grid.is-prompt .toolbox-workflow-rail {
      grid-template-columns: 1fr;
    }
  }
  @media (max-width: 767px) {
    .toolbox-workbench__hero {
      padding: 17px 15px 15px;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
    }
    .toolbox-workbench__execution {
      margin-top: 9px;
    }
    .toolbox-workbench__execution small {
      font-size: 9.5px;
    }
    .toolbox-workbench__price {
      min-width: 0;
      padding: 10px 12px;
      grid-template-columns: 1fr auto;
      align-items: center;
      border-radius: 12px;
    }
    .toolbox-workbench__surface {
      padding: 12px;
    }
    .toolbox-workbench__paid {
      margin-top: 11px;
      padding: 0;
    }
    .toolbox-workflow-card,
    .toolbox-confirmation {
      padding: 14px;
      gap: 14px;
      border-radius: 16px;
    }
    .toolbox-workflow-card__head h2 {
      font-size: 16px;
    }
    .toolbox-intents__grid,
    .toolbox-outcomes ol {
      grid-template-columns: 1fr;
    }
    .toolbox-intent.b_btn {
      min-height: 58px;
    }
    .toolbox-options {
      grid-template-columns: 1fr;
    }
    .toolbox-field.is-wide {
      grid-column: auto;
    }
    .toolbox-paid-panel__footer {
      padding: 13px;
    }
    .toolbox-billing-choice {
      grid-template-columns: 1fr;
    }
    .toolbox-run-summary > div {
      grid-template-columns: 82px minmax(0, 1fr);
    }
  }
  html.light-note-mobile-rendering .toolbox-outcomes,
  html.light-note-mobile-rendering .toolbox-intent.is-selected,
  html.light-note-mobile-rendering .toolbox-detail-options :deep(.b_btn.is-selected) {
    background: var(--card-background);
  }
  html.light-note-mobile-rendering .toolbox-intent.is-selected {
    box-shadow: none;
  }
  html.light-note-mobile-rendering .toolbox-billing-choice__item.is-selected {
    border-width: 2px;
    box-shadow: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .toolbox-upload-list__status.is-uploading::before {
      animation: none;
    }
  }
</style>
