<template>
  <div class="run-wizard" :aria-busy="busy || undefined">
    <Teleport :to="headerTarget || 'body'" :disabled="!headerTarget">
      <nav class="wizard-nav" :aria-label="t('organizeWizard.navigation')">
        <ol>
          <li v-for="(name, index) in steps" :key="name" :class="{ current: step === index, complete: step > index }">
            <BButton
              :disabled="busy || index > step"
              :aria-current="step === index ? 'step' : undefined"
              @click="goBack(index)"
            >
              <span class="step-number" aria-hidden="true"
                >{{ step > index ? '✓' : index + 1 }}<span class="step-total">/4</span></span
              >
              <span>{{ t(`organizeWizard.steps.${name}`) }}</span>
            </BButton>
          </li>
        </ol>
      </nav>
    </Teleport>

    <div ref="content" class="wizard-content">
      <p v-if="step === 3 && busy && !preview" role="status">{{ t('organizeWizard.preparingConfirmation') }}</p>
      <header class="wizard-heading">
        <h3 ref="heading" tabindex="-1">{{ t(`organizeWizard.headings.${steps[step]}`) }}</h3>
        <p>{{ t(`organizeWizard.descriptions.${steps[step]}`) }}</p>
      </header>

      <div v-if="step === 0" class="wizard-options">
        <BButton
          v-for="type in types"
          :key="type"
          class="wizard-option resource-option"
          :class="{ chosen: modelValue.resourceTypes.includes(type) }"
          :aria-pressed="modelValue.resourceTypes.includes(type)"
          :aria-label="t(`organizeWorkspace.resources.${type}`)"
          :disabled="busy"
          @click="toggleResource(type)"
        >
          <span class="resource-symbol"><SvgIcon :src="resourceIcons[type]" size="22" /></span>
          <span class="option-copy"
            ><strong>{{ t(`organizeWorkspace.resources.${type}`) }}</strong>
            <small>{{ t(`organizeWizard.resourceHints.${type}`) }}</small></span
          >
          <span class="option-check" aria-hidden="true">{{ modelValue.resourceTypes.includes(type) ? '✓' : '' }}</span>
        </BButton>
      </div>

      <template v-else-if="step === 1">
        <div class="wizard-context">{{
          t('organizeWizard.forResources', { names: resourceNames(modelValue.resourceTypes) })
        }}</div>
        <div class="wizard-options check-options">
          <BButton
            v-for="check in availableChecks"
            :key="check"
            class="wizard-option check-option"
            :class="{ chosen: modelValue.checks.includes(check) }"
            :aria-pressed="modelValue.checks.includes(check)"
            :aria-label="t(`organizeWizard.checks.${check}`)"
            :disabled="busy"
            @click="toggleCheck(check)"
          >
            <span class="option-top"
              ><strong>{{ t(`organizeWizard.checks.${check}`) }}</strong>
              <span class="option-check" aria-hidden="true">{{
                modelValue.checks.includes(check) ? '✓' : ''
              }}</span></span
            >
            <small>{{
              t(
                check === 'tags' && modelValue.tagMode === 'append'
                  ? 'organizeWizard.appendTagsHint'
                  : `organizeWizard.checkHints.${check}`,
              )
            }}</small>
            <span class="option-bottom"
              ><span class="check-method">{{
                t(check === 'tags' || check === 'title' ? 'organizeWizard.ai' : 'organizeWizard.rule')
              }}</span>
              <span>{{
                resourceNames(modelValue.resourceTypes.filter((type) => supportsOrganizeCheck(type, check)))
              }}</span></span
            >
          </BButton>
        </div>
        <p class="wizard-hint">{{ t('organizeWizard.applicabilityHint') }}</p>
      </template>

      <template v-else-if="step === 2">
        <div class="wizard-context"
          ><strong>{{ resourceNames(effectiveTypes) }}</strong
          ><span>{{ checkNames }}</span></div
        >
        <div v-if="modelValue.scope === 'selected' && !scopeChoices" class="picker-scope-summary"
          ><strong>{{ t('organizeWorkspace.scopes.selected') }}</strong
          ><BButton :disabled="busy" @click="scopeChoices = true">{{ t('organizePicker.changeScope') }}</BButton></div
        >
        <div v-else class="wizard-options">
          <BButton
            v-for="scope in scopes"
            :key="scope"
            class="wizard-option scope-option"
            :class="{ chosen: modelValue.scope === scope }"
            :aria-pressed="modelValue.scope === scope"
            :aria-label="t(`organizeWorkspace.scopes.${scope}`)"
            :disabled="busy"
            @click="chooseScope(scope)"
          >
            <span class="option-copy"
              ><strong
                >{{ t(`organizeWorkspace.scopes.${scope}`) }}
                <span v-if="scope === 'recent'" class="scope-recommend">{{
                  t('organizeWizard.recommended')
                }}</span></strong
              >
              <small>{{ t(`organizeWorkspace.scopeHints.${scope}`) }}</small></span
            >
            <span class="option-check radio" aria-hidden="true"></span>
          </BButton>
        </div>
        <section v-if="modelValue.scope === 'selected'" class="wizard-picker">
          <div class="picker-toolbar">
            <BTabs v-model:active-tab="browseType" :options="browseTabs" variant="pill" />
            <BButton :disabled="busy" :aria-pressed="reviewSelection" @click="reviewSelection = !reviewSelection">{{
              t(reviewSelection ? 'organizePicker.backToBrowse' : 'organizePicker.review', {
                count: effectiveItems.length,
              })
            }}</BButton>
          </div>
          <p class="picker-hint">{{ t('organizePicker.browseHint') }}</p>
          <p v-if="selectionError" class="wizard-error" role="alert">{{ selectionError }}</p>
          <section v-show="reviewSelection" class="picker-review">
            <div class="picker-review-heading"
              ><strong>{{ t('organizeWorkspace.selectedCount', { count: effectiveItems.length }) }}</strong
              ><BButton :disabled="busy || !effectiveItems.length" @click="update({ items: [] })">{{
                t('organizePicker.clear')
              }}</BButton></div
            >
            <p v-if="!effectiveItems.length">{{ t('organizePicker.empty') }}</p>
            <div v-for="item in effectiveItems" :key="keyOf(item)" class="picker-selected-row">
              <span>{{ t(`organizeWorkspace.resources.${item.type}`) }}</span
              ><strong>{{ selectedNames[keyOf(item)] || item.id }}</strong>
              <BButton
                :disabled="busy"
                :aria-label="t('organizePicker.removeNamed', { name: selectedNames[keyOf(item)] || item.id })"
                @click="removeSelection(item)"
                >{{ t('organizePicker.remove') }}</BButton
              >
            </div>
          </section>
          <ResourcePickerPanel
            v-show="!reviewSelection"
            :allowed-types="[activeBrowseType]"
            :batch-label="t('organizePicker.addLoaded')"
            select-all-matching
            :max-selection="1000"
            exhaustive-single-type
            :single-type-page-size="40"
            page-scroll
            :auto-focus="false"
            multi-select
            :disabled="busy"
            :placeholder="t('organizePicker.search', { type: t(`organizeWorkspace.resources.${activeBrowseType}`) })"
            :selected-resource-keys="effectiveItems.map(keyOf)"
            :resources-disabled="effectiveItems.length >= 1000"
            @select="addSelection"
            @deselect="removeSelection"
            @select-many="addSelections"
            @batch-loading="selectionLoading = $event"
          />
        </section>
      </template>

      <template v-else-if="preview">
        <div class="wizard-context"
          ><strong>{{ resourceNames(preview.options.resourceTypes) }}</strong
          ><span>{{ checkNames }} · {{ t(`organizeWorkspace.scopes.${preview.options.scope}`) }}</span></div
        >
        <section class="wizard-summary">
          <div class="scan-total"
            ><span>{{ t('organizeWorkspace.scanned', { count: preview.summary.total }) }}</span>
            <strong>{{ preview.summary.total.toLocaleString() }}</strong></div
          >
          <div class="scan-types"
            ><span v-for="type in preview.options.resourceTypes" :key="type">
              <SvgIcon :src="resourceIcons[type]" size="16" />{{ t(`organizeWorkspace.resources.${type}`)
              }}<b>{{ preview.summary.types[type] || 0 }}</b></span
            ></div
          >
          <div class="scan-costs"
            ><div
              ><span>{{ t('organizeWorkspace.ruleCount') }}</span
              ><strong>{{ preview.summary.ruleTotal ?? t('organizeLifecycle.undetermined') }}</strong
              ><small>{{ t('organizeWizard.rule') }}</small></div
            >
            <div
              ><span>{{ t('organizeWorkspace.aiCount') }}</span
              ><strong>{{ preview.summary.aiTotal ?? t('organizeLifecycle.undetermined') }}</strong
              ><small>{{ t('organizeWizard.aiWhenNeeded') }}</small></div
            ></div
          >
        </section>
        <p
          v-if="preview.options.resourceTypes.includes('file') && preview.summary.files.parsed !== null"
          class="wizard-hint"
          >{{ t('organizeWorkspace.fileCoverage', preview.summary.files) }}</p
        >
        <ul v-if="preview.summary.observations?.length" class="wizard-observations"
          ><li v-for="entry in preview.summary.observations" :key="entry.reason"
            >{{ entry.reason }} · {{ entry.count }}</li
          ></ul
        >
        <p v-if="preview.summary.skipped" class="wizard-hint">{{
          t('organizeWorkspace.skipped', { count: preview.summary.skipped })
        }}</p>
        <p
          v-if="!preview.summary.aiEnabled && preview.options.checks.some((check) => ['tags', 'title'].includes(check))"
          class="wizard-hint"
          >{{ t('organizeWorkspace.aiDisabled') }}</p
        >
        <p v-if="!preview.summary.total" class="wizard-hint">{{ t('organizeWizard.noResources') }}</p>
        <p class="wizard-hint">{{ t('organizeWorkspace.confirmHint') }}</p>
        <p class="wizard-hint">{{ t('organizeLifecycle.billing') }}</p>
      </template>
      <p v-if="excludedTypes.length && step > 0 && step < 3" class="wizard-hint" role="status">{{
        t('organizeWizard.excluded', { names: resourceNames(excludedTypes) })
      }}</p>
    </div>

    <footer class="wizard-footer">
      <p v-if="error" class="wizard-error" role="alert">{{ error }}</p>
      <p aria-live="polite">{{
        step === 2 && modelValue.scope === 'selected'
          ? t('organizePicker.footer', { count: effectiveItems.length })
          : footerHint
      }}</p>
      <BButton v-if="step === 3 && !preview && error" :disabled="busy" @click="emit('preview', modelValue)">{{
        t('organizeWizard.retryPreview')
      }}</BButton>
      <div
        ><BButton v-if="step > 0" :disabled="busy" @click="goBack(step - 1)">{{
          t('organizeWizard.previous')
        }}</BButton>
        <BButton
          type="primary"
          :loading="busy || selectionLoading"
          :disabled="!canContinue || selectionLoading"
          @click="advance"
          >{{ nextLabel }}</BButton
        ></div
      >
    </footer>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { applicableOrganizeResources, supportsOrganizeCheck } from '@lightnote/shared/organize-capabilities';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import ResourcePickerPanel from '@/components/resourcePicker/ResourcePickerPanel.vue';
  import icon from '@/config/icon';
  import type { RunOptions, SuggestionRun, ResourceType, CheckKind } from '@/api/organizeSuggestionApi';

  const props = defineProps<{
    modelValue: RunOptions;
    preview: SuggestionRun | null;
    busy: boolean;
    error: string;
    headerTarget?: HTMLElement | null;
    initialStep?: number;
  }>();
  const emit = defineEmits<{
    'update:modelValue': [value: RunOptions];
    'update:preview': [value: null];
    'clear-error': [];
    preview: [options: RunOptions];
    start: [];
  }>();
  const { t } = useI18n();
  const step = ref(props.initialStep || 0),
    heading = ref<HTMLElement | null>(null),
    content = ref<HTMLElement | null>(null);
  const steps = ['resources', 'checks', 'scope', 'confirm'] as const;
  const types: ResourceType[] = ['bookmark', 'note', 'file'];
  const checks: CheckKind[] = ['tags', 'title', 'empty', 'duplicate'];
  const scopes: RunOptions['scope'][] = ['recent', 'all', 'selected', 'untagged'];
  const resourceIcons = { bookmark: icon.resource.bookmark, note: icon.resource.note, file: icon.resource.file };
  const availableChecks = computed(() =>
    checks.filter((check) => props.modelValue.resourceTypes.some((type) => supportsOrganizeCheck(type, check))),
  );
  const effectiveTypes = computed(() =>
    applicableOrganizeResources(props.modelValue.resourceTypes, props.modelValue.checks),
  );
  const effectiveItems = computed(() =>
    props.modelValue.items.filter((item) => effectiveTypes.value.includes(item.type)),
  );
  const scopeChoices = ref(false),
    reviewSelection = ref(false),
    browseType = ref('bookmark'),
    selectionError = ref('');
  const selectedNames = ref<Record<string, string>>({});
  const selectionLoading = ref(false);
  watch(
    effectiveTypes,
    (available) => {
      if (!available.includes(browseType.value as ResourceType)) browseType.value = available[0] || '';
    },
    { immediate: true },
  );
  const activeBrowseType = computed(() =>
    effectiveTypes.value.includes(browseType.value as ResourceType)
      ? (browseType.value as ResourceType)
      : effectiveTypes.value[0],
  );
  const browseTabs = computed(() =>
    effectiveTypes.value.map((type) => ({
      key: type,
      label: t(`organizeWorkspace.resources.${type}`),
      badge: effectiveItems.value.filter((item) => item.type === type).length,
    })),
  );
  function chooseScope(scope: RunOptions['scope']) {
    update({ scope });
    scopeChoices.value = false;
    reviewSelection.value = false;
  }
  const excludedTypes = computed(() =>
    props.modelValue.resourceTypes.filter((type) => !effectiveTypes.value.includes(type)),
  );
  const resourceNames = (values: ResourceType[]) =>
    values.map((type) => t(`organizeWorkspace.resources.${type}`)).join(' · ');
  const checkNames = computed(() =>
    props.modelValue.checks
      .filter((check) => availableChecks.value.includes(check))
      .map((check) => t(`organizeWizard.checks.${check}`))
      .join(' · '),
  );
  const canContinue = computed(() =>
    step.value === 0
      ? props.modelValue.resourceTypes.length > 0
      : step.value === 1
        ? effectiveTypes.value.length > 0
        : step.value === 2
          ? effectiveTypes.value.length > 0 &&
            (props.modelValue.scope !== 'selected' || effectiveItems.value.length > 0)
          : !!props.preview?.summary.total,
  );
  const footerHint = computed(() =>
    props.busy && step.value === 3 && !props.preview
      ? t('organizeWizard.preparingConfirmation')
      : !canContinue.value
        ? t(`organizeWizard.required.${steps[step.value]}`)
        : step.value === 0
          ? t('organizeWizard.resourceCount', { count: props.modelValue.resourceTypes.length })
          : step.value === 1
            ? t('organizeWizard.checkCount', {
                count: props.modelValue.checks.filter((check) => availableChecks.value.includes(check)).length,
              })
            : t(step.value === 2 ? 'organizeWizard.previewFree' : 'organizeWizard.reviewFirst'),
  );
  const nextLabel = computed(() =>
    step.value < 2
      ? t(`organizeWizard.next.${steps[step.value]}`)
      : step.value === 2
        ? t('organizeWorkspace.preview')
        : t('organizeWorkspace.startCount', { count: props.preview?.summary.total || 0 }),
  );
  function update(patch: Partial<RunOptions>) {
    if (props.busy) return;
    selectionError.value = '';
    emit('update:preview', null);
    emit('clear-error');
    const next = { ...props.modelValue, ...patch };
    if (next.scope !== 'selected') next.tagMode = 'untagged';
    emit('update:modelValue', next);
  }
  function toggleResource(type: ResourceType) {
    const resourceTypes = props.modelValue.resourceTypes.includes(type)
      ? props.modelValue.resourceTypes.filter((value) => value !== type)
      : [...props.modelValue.resourceTypes, type];
    update({
      resourceTypes,
      items: props.modelValue.items.filter((item) => resourceTypes.includes(item.type)),
      checks: props.modelValue.checks.filter((check) =>
        resourceTypes.some((type) => supportsOrganizeCheck(type, check)),
      ),
    });
  }
  function toggleCheck(check: CheckKind) {
    const selected = props.modelValue.checks.includes(check)
      ? props.modelValue.checks.filter((value) => value !== check)
      : [...props.modelValue.checks, check];
    update({ checks: selected });
  }
  const keyOf = (item: { type: string; id: string | number }) => `${item.type}:${item.id}`;
  function addSelections(values: Array<{ type: string; id: string | number; title?: string }>) {
    const items = new Map(effectiveItems.value.map((item) => [keyOf(item), item]));
    for (const item of values) {
      if (effectiveTypes.value.includes(item.type as ResourceType)) {
        items.set(keyOf(item), { type: item.type as ResourceType, id: String(item.id) });
        if (item.title) selectedNames.value[keyOf(item)] = item.title;
      }
    }
    if (items.size > 1000) {
      selectionError.value = t('organizePicker.limit');
      return;
    }
    selectionError.value = '';
    update({ items: [...items.values()] });
  }
  function addSelection(item: { type: string; id: string | number; title?: string }) {
    addSelections([item]);
  }
  function removeSelection(item: { type: string; id: string | number }) {
    selectionError.value = '';
    update({ items: effectiveItems.value.filter((value) => keyOf(value) !== keyOf(item)) });
  }
  function goBack(index: number) {
    if (props.busy || index >= step.value) return;
    emit('update:preview', null);
    emit('clear-error');
    step.value = index;
  }
  function advance() {
    if (props.busy || selectionLoading.value || !canContinue.value) return;
    if (step.value < 2) step.value++;
    else if (step.value === 2)
      emit('preview', {
        ...props.modelValue,
        resourceTypes: effectiveTypes.value,
        checks: props.modelValue.checks.filter((check) => availableChecks.value.includes(check)),
        items: props.modelValue.scope === 'selected' ? effectiveItems.value : [],
      });
    else emit('start');
  }
  watch(
    () => props.preview,
    (value) => {
      if (value) step.value = 3;
    },
    { immediate: true },
  );
  watch(step, async () => {
    await nextTick();
    content.value?.closest('.b-drawer-body')?.scrollTo?.({ top: 0 });
    heading.value?.focus({ preventScroll: true });
  });
</script>

<style scoped lang="less">
  .run-wizard {
    color: var(--text-color);
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }
  .wizard-nav {
    padding: 0;
    width: 380px;
  }
  .wizard-nav ol {
    display: flex;
    align-items: center;
    justify-content: center;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .wizard-nav li {
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }
  .wizard-nav li:last-child {
    flex: 0 0 auto;
  }
  .wizard-nav li:not(:last-child)::after {
    content: '';
    flex: 1;
    min-width: 18px;
    margin: 0 8px;
    height: 2px;
    border-radius: 1px;
    background: var(--desc-color);
    opacity: 0.45;
  }
  .wizard-nav li.complete::after {
    background: var(--primary-color);
    opacity: 0.7;
  }
  .wizard-nav .b_btn {
    background: transparent;
    width: auto;
    flex-shrink: 0;
    justify-content: center;
    height: auto;
    padding: 0;
    display: flex;
    flex-direction: row;
    gap: 5px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--desc-color);
    opacity: 1;
  }
  .step-total {
    display: none;
  }
  .step-number {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    font-size: 13px;
  }
  .current .b_btn,
  .complete .b_btn {
    color: var(--text-color);
  }
  .current .step-number {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: #fff;
  }
  .complete .step-number {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }
  .wizard-content {
    flex: 1;
    padding: 28px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .wizard-heading {
    display: grid;
    gap: 9px;
  }
  .wizard-eyebrow {
    color: var(--desc-color);
    font-size: 12px;
    letter-spacing: 0.08em;
  }
  .wizard-heading h3 {
    margin: 0;
    font-size: 23px;
    line-height: 1.45;
    font-weight: 600;
    outline: none;
  }
  .wizard-heading p,
  .wizard-hint {
    margin: 0;
    font-size: 13px;
    line-height: 1.75;
    color: var(--desc-color);
  }
  .wizard-options {
    display: grid;
    gap: 12px;
  }
  .wizard-option.b_btn {
    width: 100%;
    height: auto;
    padding: 18px;
    gap: 16px;
    background: var(--surface-panel-bg);
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--text-color);
    text-align: left;
    line-height: 1.5;
    white-space: normal;
    transition:
      border-color 0.15s,
      background 0.15s;
  }
  .wizard-option.b_btn:hover {
    border-color: var(--primary-color);
  }
  .wizard-option.b_btn:focus-visible,
  .wizard-nav .b_btn:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 3px;
  }
  .wizard-option.b_btn.chosen {
    border-color: var(--primary-color);
  }
  .resource-symbol {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--background-color);
    color: var(--desc-color);
    flex-shrink: 0;
  }
  .chosen .resource-symbol {
    color: var(--primary-color);
  }
  .option-copy {
    flex: 1;
    display: grid;
    gap: 6px;
  }
  .wizard-option strong {
    font-size: 15px;
    font-weight: 600;
  }
  .wizard-option small {
    font-size: 12px;
    color: var(--desc-color);
    font-weight: 400;
    line-height: 1.65;
  }
  .option-check {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 21px;
    height: 21px;
    border: 1px solid var(--surface-border-color);
    border-radius: 6px;
    font-size: 13px;
  }
  .chosen .option-check {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: #fff;
  }
  .option-check.radio {
    border-radius: 50%;
    line-height: 1;
  }
  .chosen .option-check.radio::after {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #fff;
  }
  .check-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .check-option.b_btn {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }
  .option-top,
  .option-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .option-bottom {
    margin-top: auto;
    font-size: 11px;
    color: var(--desc-color);
    flex-wrap: wrap;
  }
  .check-method {
    padding: 3px 7px;
    border-radius: 5px;
    background: var(--background-color);
    color: var(--text-color);
  }
  .wizard-context {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    align-items: center;
    background: var(--background-color);
    padding: 12px 14px;
    border-radius: 9px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--desc-color);
  }
  .wizard-context strong {
    font-weight: 500;
    color: var(--text-color);
  }
  .scope-recommend {
    margin-left: 8px;
    color: var(--primary-color);
    font-size: 11px;
    font-weight: 400;
  }
  .wizard-picker {
    min-width: 0;
  }
  .wizard-picker h4 {
    margin: 0 0 12px;
    font-size: 14px;
  }
  .wizard-summary {
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    overflow: hidden;
  }
  .scan-total {
    display: grid;
    gap: 10px;
    padding: 24px 24px 12px;
    font-size: 13px;
    color: var(--desc-color);
  }
  .scan-total strong {
    font-size: 38px;
    line-height: 1.2;
    font-weight: 600;
    color: var(--text-color);
    font-variant-numeric: tabular-nums;
  }
  .scan-types {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    padding: 0 24px 24px;
    font-size: 12px;
  }
  .scan-types > span {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
  }
  .scan-types b {
    color: var(--text-color);
  }
  .scan-costs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    padding: 20px 24px;
    border-top: 1px solid var(--surface-border-color);
  }
  .scan-costs > div {
    display: grid;
    gap: 6px;
  }
  .scan-costs span,
  .scan-costs small {
    font-size: 12px;
    color: var(--desc-color);
  }
  .scan-costs strong {
    font-size: 24px;
    font-weight: 600;
  }
  .scan-tokens {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 12px;
    background: var(--background-color);
    padding: 16px 24px;
    font-size: 13px;
  }
  .wizard-observations {
    margin: 0;
    padding-left: 20px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.8;
  }
  .wizard-footer .wizard-error {
    flex-basis: 100%;
    border-left: 3px solid var(--danger-color);
    padding: 10px 14px;
    margin: 0;
    color: var(--danger-color);
    line-height: 1.6;
    font-size: 13px;
  }
  .wizard-footer {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border-top: 1px solid var(--surface-border-color);
    background: var(--surface-panel-bg);
    padding: 18px 28px;
  }
  .wizard-footer p {
    margin: 0;
    font-size: 12px;
    color: var(--desc-color);
  }
  .wizard-footer > div {
    display: flex;
    gap: 10px;
    margin-left: auto;
  }
  .wizard-footer .b_btn {
    height: 40px;
    border-radius: 8px;
  }
  // 桌面浏览器工具栏会压缩可用高度；缩短间距，让四个范围选项完整容纳。
  @media (min-width: 601px) and (max-height: 850px) {
    .wizard-content {
      padding: 20px 28px;
      gap: 14px;
    }
    .wizard-heading {
      gap: 6px;
    }
    .wizard-context {
      padding: 8px 14px;
    }
    .scope-option.b_btn {
      padding: 14px 18px;
    }
    .wizard-footer {
      padding: 14px 28px;
    }
  }
  @media (max-width: 520px) {
    .wizard-nav {
      padding: 20px 16px;
    }
    .wizard-content {
      padding: 24px 18px;
    }
    .wizard-heading h3 {
      font-size: 21px;
    }
    .check-options {
      grid-template-columns: 1fr;
    }
    .wizard-option.b_btn {
      padding: 16px;
    }
    .wizard-footer {
      padding: 14px 18px;
    }
    .wizard-footer > div {
      width: 100%;
    }
    .wizard-footer .primary_btn {
      flex: 1;
    }
  }
  .picker-scope-summary,
  .picker-toolbar,
  .picker-review-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }
  .picker-scope-summary {
    padding: 12px 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
    font-size: 13px;
  }
  .picker-hint {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
    margin: 10px 0;
  }
  .picker-review {
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
  }
  .picker-selected-row {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px 0;
    border-top: 1px solid var(--surface-border-color);
    font-size: 13px;
  }
  .picker-selected-row > span {
    color: var(--desc-color);
    font-size: 11px;
    flex-shrink: 0;
  }
  .picker-selected-row strong {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .picker-toolbar :deep(.tab) {
    padding: 7px 10px;
  }
</style>

<style scoped>
  @media (max-width: 600px) {
    .wizard-nav {
      width: auto;
      padding: 0;
      border: 0;
    }
    .wizard-nav ol {
      display: block;
    }
    .wizard-nav li:not(.current) {
      display: none;
    }
    .wizard-nav li::after {
      display: none;
    }
    .wizard-nav .b_btn {
      padding: 0 8px;
    }
    .wizard-nav .current .step-number {
      width: auto;
      min-width: 38px;
      display: flex;
      justify-content: center;
      gap: 2px;
      border-radius: 12px;
    }
    .wizard-nav .step-total {
      display: inline;
    }
  }
</style>
