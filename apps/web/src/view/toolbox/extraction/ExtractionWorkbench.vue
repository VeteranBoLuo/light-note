<template>
  <main v-auto-scrollbar class="extraction-workbench" data-mobile-resource-scroll>
    <BButton type="text" class="back" @click="back"
      ><SvgIcon :src="icon.toolbox.back" size="14" />{{ t('extraction.back') }}</BButton
    >
    <header class="workbench-head">
      <div
        ><h1>{{ table?.title || t('extraction.title') }}</h1
        ><span class="status" :class="{ 'has-issue': table?.errorCode }">{{
          table ? t(`extraction.statuses.${table.status}`) : t('extraction.draft')
        }}</span></div
      >
      <div class="head-actions"
        ><BSelect
          :value="table?.id || ''"
          :options="historyOptions"
          :placeholder="t('extraction.history')"
          :disabled="busy || saving"
          @update:value="navigate(String($event))"
        /><BButton :disabled="busy || saving" @click="navigate()">{{ t('extraction.new') }}</BButton
        ><BButton v-if="table && table.counts.total" @click="exportOpen = true">{{
          t('extraction.export')
        }}</BButton></div
      >
    </header>
    <ol class="flow-steps" :aria-label="t('extraction.flow.label')">
      <li
        v-for="(step, index) in flowSteps"
        :key="step"
        :class="{ current: flowStep === index + 1, done: flowStep > index + 1 }"
        :aria-current="flowStep === index + 1 ? 'step' : undefined"
      >
        <span class="step-number" aria-hidden="true"
          ><SvgIcon v-if="flowStep > index + 1" :src="icon.organize.check" size="14" /><template v-else>{{
            index + 1
          }}</template></span
        >
        <span>{{ t(step) }}</span>
      </li>
    </ol>
    <p v-if="!table" class="muted">{{ t('extraction.subtitle') }}</p>
    <div v-if="!table && availabilityError" class="notice" role="status">
      <p>{{ availabilityError }}</p>
      <p v-if="localDevelopment">{{ t('extraction.localPreviewHint') }}</p>
      <BButton size="small" :loading="availabilityLoading" @click="reloadAvailability">{{ t('common.retry') }}</BButton>
    </div>
    <p v-if="!editable" class="notice">{{ t('extraction.readOnly') }}</p>
    <p v-if="table && !table.enabled" class="notice">{{ t('extraction.disabled') }}</p>
    <BLoading v-if="loading" inline loading :title="t('common.loading')" />
    <p v-if="error" class="notice issue" role="alert">{{ error }}</p>
    <template v-if="!loading">
      <section v-if="table" class="summary">
        <div
          ><strong>{{ t('extraction.count', { count: table.counts.total }) }}</strong
          ><span>{{ t('extraction.pendingCount', { count: table.counts.pending }) }}</span
          ><span>{{ t('extraction.progress', { done: doneRanges, total: totalRanges }) }}</span
          ><span v-if="table.usage?.calls"
            >{{ t('extraction.actualUsage', { count: table.usage.chargedTokens })
            }}<small v-if="table.usage.unsettled">{{ t('extraction.settling') }}</small></span
          ><small v-if="active">{{ t('extraction.runningHint') }}</small></div
        >
        <div class="actions"
          ><BButton v-if="active && editable" :disabled="busy" @click="perform('pause')">{{
            t('extraction.pause')
          }}</BButton
          ><BButton
            v-if="locked && ['paused', 'partial', 'failed'].includes(table.status) && editable"
            :disabled="busy || table.inFlight || !table.enabled"
            @click="resume"
            >{{ t('extraction.resume') }}</BButton
          ><BButton @click="settingsOpen = !settingsOpen">{{
            t(settingsOpen ? 'extraction.collapse' : 'extraction.settings')
          }}</BButton></div
        >
      </section>
      <p v-if="table?.status === 'paused' && (!table.errorCode || table.inFlight)" class="muted">{{
        t('extraction.pauseHint')
      }}</p>
      <p v-if="table?.errorCode" class="notice issue" role="alert">{{ issueText(table.errorCode) }}</p>
      <div v-if="table && !locked" class="flow-status" role="status" aria-live="polite">
        <strong>{{ t(flowMessage) }}</strong>
        <p class="muted">{{
          t(
            active
              ? 'extraction.flow.automaticHint'
              : table.status === 'preview'
                ? 'extraction.flow.confirmHint'
                : 'extraction.flow.retainedHint',
          )
        }}</p>
      </div>
      <section v-if="settingsOpen" class="settings">
        <div v-if="!table" class="name-field"
          ><label for="extraction-name">{{ t('extraction.name') }}</label
          ><BInput
            id="extraction-name"
            v-model:value="title"
            :maxlength="120"
            :disabled="busy || !editable"
            :placeholder="t('extraction.untitled')"
        /></div>
        <div class="section-heading"
          ><h2>{{
            table ? t('extraction.flow.sourceCount', { count: table.sources.length }) : t('extraction.sources')
          }}</h2
          ><BButton
            v-if="table && !sourceNeedsAttention"
            type="text"
            :aria-expanded="sourcesExpanded"
            @click="sourcesExpanded = !sourcesExpanded"
            >{{ t(sourcesExpanded ? 'extraction.flow.hideSources' : 'extraction.flow.showSources') }}</BButton
          ><div v-if="!table" class="actions"
            ><BButton :disabled="busy || !editable" @click="pickerOpen = true">{{ t('extraction.choose') }}</BButton
            ><BButton :disabled="busy || !editable || !creationReady" @click="openUpload">{{
              t('extraction.upload')
            }}</BButton></div
          ></div
        >
        <div v-if="!table" class="source-list source-list--selected"
          ><article v-for="resource in resources" :key="`${resource.type}:${resource.id}`"
            ><span
              class="source-type"
              :style="{ color: `var(${RESOURCE_COLOR_CSS_VAR[resource.type]})` }"
              aria-hidden="true"
              ><SvgIcon :src="icon.resource[resource.type]" size="16" /></span
            ><span>{{ resource.title }}</span
            ><BButton
              class="source-remove"
              type="text"
              size="small"
              :aria-label="t('extraction.remove')"
              @click="resources = resources.filter((r) => r !== resource)"
              ><SvgIcon :src="icon.common.close" size="14" /></BButton></article
        ></div>
        <div v-else-if="sourcesExpanded || sourceNeedsAttention" class="source-list"
          ><article v-for="source in table.sources" :key="source.id" :class="{ issue: source.errorCode }"
            ><span
              class="source-type"
              :style="{ color: `var(${RESOURCE_COLOR_CSS_VAR[source.type]})` }"
              aria-hidden="true"
              ><SvgIcon :src="icon.resource[source.type]" size="16" /></span
            ><div
              ><strong>{{ source.title || source.resourceId }}</strong
              ><small
                >{{ source.errorCode ? issueText(source.errorCode) : t(`extraction.statuses.${source.status}`)
                }}<span v-if="source.coverage.total?.pages">
                  · {{ source.coverage.processed?.pages || 0 }} / {{ source.coverage.total.pages }}</span
                ></small
              ><small v-if="source.coverage.processed?.chars !== undefined">{{
                t('extraction.readChars', {
                  done: source.coverage.processed.chars,
                  total: source.coverage.total?.chars || source.coverage.processed.chars,
                })
              }}</small>
              <small v-if="source.coverage.complete === false">{{ t('extraction.partial') }}</small>
              <small v-for="reason in source.coverage.reasons || []" :key="reason.code">{{
                issueText(reason.code)
              }}</small></div
            ><BButton
              v-if="source.status === 'failed' && table.phase === 'prepare' && !table.inFlight"
              type="text"
              :disabled="busy"
              @click="perform('remove_source', { sourceId: source.id })"
              >{{ t('extraction.remove') }}</BButton
            ></article
          ></div
        >
        <BButton
          v-if="table?.phase === 'prepare' && table.sources.some((s) => s.status === 'failed')"
          :disabled="busy || table.inFlight"
          @click="perform('retry_prepare')"
          >{{ t('extraction.retry') }}</BButton
        >
        <template v-if="!table || sourcesExpanded || sourceNeedsAttention">
          <label for="extraction-goal">{{ t('extraction.goal') }}</label
          ><BInput
            id="extraction-goal"
            v-model:value="goal"
            type="textarea"
            :rows="2"
            :maxlength="1000"
            :disabled="!!table || busy || !editable"
            :placeholder="t('extraction.goalHint')"
          />
        </template>
        <BCheckbox v-if="partialSources && !locked" v-model:checked="acceptPartial" :disabled="busy || active">{{
          t('extraction.acceptPartial')
        }}</BCheckbox>
        <template v-if="plan">
          <div class="section-heading"
            ><h2>{{ t('extraction.fields') }}</h2
            ><BButton type="text" :aria-expanded="advanced" @click="advanced = !advanced">{{
              t('extraction.advanced')
            }}</BButton></div
          >
          <p v-if="table?.plan && !locked" class="muted">{{ t('extraction.flow.typesSuggested') }}</p>
          <div v-if="advanced" class="definition-field">
            <label for="extraction-definition">{{ t('extraction.definition') }}</label>
            <BInput
              id="extraction-definition"
              v-model:value="plan.recordDefinition"
              type="textarea"
              :rows="2"
              :maxlength="500"
              :disabled="locked || busy || active || !editable"
            />
          </div>
          <div class="fields">
            <article
              v-for="(field, index) in plan.fields"
              :key="field.key"
              class="field"
              :class="{ advanced }"
              :aria-label="t('extraction.fieldNumber', { number: index + 1 })"
            >
              <div v-if="advanced" class="field-heading">
                <h3>{{ t('extraction.fieldNumber', { number: index + 1 }) }}</h3>
                <div v-if="!locked" class="actions">
                  <BButton
                    type="text"
                    :disabled="index === 0 || busy || active || !editable"
                    @click="moveField(index, -1)"
                  >
                    {{ t('extraction.moveUp') }}
                  </BButton>
                  <BButton
                    type="text"
                    :disabled="index === plan.fields.length - 1 || busy || active || !editable"
                    @click="moveField(index, 1)"
                  >
                    {{ t('extraction.moveDown') }}
                  </BButton>
                  <BButton type="text" :disabled="busy || active || !editable" @click="plan.fields.splice(index, 1)">
                    {{ t('extraction.remove') }}
                  </BButton>
                </div>
              </div>
              <div class="field-name">
                <label v-if="advanced" :for="`extraction-name-${field.key}`">{{ t('extraction.fieldName') }}</label>
                <BInput
                  :id="`extraction-name-${field.key}`"
                  v-model:value="field.label"
                  :maxlength="80"
                  :aria-label="t('extraction.fieldName')"
                  :disabled="locked || busy || active || !editable"
                />
              </div>
              <div v-if="advanced" class="field-type">
                <span :id="`extraction-type-${field.key}`">{{ t('extraction.type') }}</span>
                <BSelect
                  v-model:value="field.type"
                  :aria-labelledby="`extraction-type-${field.key}`"
                  :options="typeOptions"
                  :disabled="locked || busy || active || !editable"
                />
              </div>
              <BButton
                v-if="!advanced && !locked"
                type="text"
                :disabled="busy || active || !editable"
                :aria-label="t('extraction.remove')"
                @click="plan.fields.splice(index, 1)"
                ><SvgIcon :src="icon.common.close" size="14"
              /></BButton>
              <div v-if="advanced" class="field-rule">
                <label :for="`extraction-rule-${field.key}`">{{ t('extraction.rule') }}</label>
                <BInput
                  :id="`extraction-rule-${field.key}`"
                  v-model:value="field.rule"
                  type="textarea"
                  :rows="3"
                  :maxlength="500"
                  :disabled="locked || busy || active || !editable"
                />
              </div>
            </article>
          </div>
          <BButton
            v-if="!locked"
            type="text"
            :disabled="plan.fields.length >= 12 || busy || active || !editable"
            @click="addField"
            >{{ t('extraction.addField') }}</BButton
          >
          <p v-if="duplicateFields" class="notice issue">{{ t('extraction.duplicate') }}</p
          ><p v-if="plan.issues?.length" class="notice">{{ t('extraction.warnings') }}</p
          ><p v-if="dirtyPlan && table?.plan" class="muted">{{ t('extraction.stale') }}</p
          ><p v-if="locked" class="muted">{{ t('extraction.locked') }}</p>
        </template>
      </section>
      <section v-if="plan && table" class="data-area">
        <div class="section-heading"
          ><h2>{{ t(locked ? 'extraction.all' : 'extraction.sample') }}</h2
          ><span class="muted">{{ t('extraction.count', { count: total }) }}</span></div
        >
        <p v-if="!locked" class="muted">{{ t('extraction.sampleScope') }}</p>
        <div v-if="locked" class="filter-bar"
          ><BInput v-model:value="filter.search" :placeholder="t('extraction.search')" :maxlength="200" /><BSelect
            v-model:value="filter.sourceId"
            :placeholder="t('extraction.allSources')"
            :options="sourceOptions"
          /><BSelect
            :placeholder="t('extraction.all')"
            :value="filter.review || ''"
            :options="reviewOptions"
            @update:value="filter.review = $event === 'pending' ? 'pending' : undefined"
          /><BSelect
            v-model:value="filter.sortField"
            :options="sortOptions"
            :placeholder="t('extraction.sort')"
          /><BSelect v-if="filter.sortField" v-model:value="filter.sortOrder" :options="sortOrderOptions" /><BCheckbox
            v-model:checked="filter.anomalies"
            >{{ t('extraction.anomalies') }}</BCheckbox
          ><BCheckbox v-model:checked="filter.excluded">{{ t('extraction.excluded') }}</BCheckbox></div
        >
        <div v-if="!records.length" class="empty"
          ><p>{{ t(hasFilter ? 'extraction.noMatches' : 'extraction.empty') }}</p
          ><BButton v-if="hasFilter" type="text" @click="filter = {}">{{ t('extraction.clearFilters') }}</BButton></div
        >
        <MobileListSurface v-else-if="mobile" :aria-label="t('extraction.all')">
          <MobileListRow
            v-for="record in records"
            :key="record.id"
            interactive
            complex
            :class="{ excluded: record.excluded }"
            @click="inspect(record, record.cells[0].fieldId)"
          >
            <template #title>{{ current(record, record.cells[0].fieldId) || '—' }}</template>
            <template #subtitle>{{
              displayFields
                .slice(1, 4)
                .map((field) => current(record, field.id) || '—')
                .join(' · ')
            }}</template>
            <template #meta
              >{{ sourceName(record.sourceId) }} ·
              {{
                record.excluded
                  ? t('extraction.exclude')
                  : record.cells.every((c) => record.reviews[c.fieldId]?.checked)
                    ? t('extraction.checked')
                    : t('extraction.pending')
              }}</template
            >
          </MobileListRow>
        </MobileListSurface>
        <div v-else class="data-table"
          ><BTable :data="records" :columns="columns" row-key="id" :pagination="false"
            ><template #bodyCell="{ record, column }"
              ><span v-if="column.key === 'source'" class="source-label">{{ sourceName(record.sourceId) }}</span
              ><span v-else-if="column.key === 'review'" class="status">{{
                record.excluded
                  ? t('extraction.exclude')
                  : record.cells.every((c: ExtractionCell) => record.reviews[c.fieldId]?.checked)
                    ? t('extraction.checked')
                    : t('extraction.pending')
              }}</span
              ><BButton
                v-else
                type="text"
                class="cell"
                :class="{
                  'cell-issue': record.cells.find((c: ExtractionCell) => c.fieldId === column.key)?.status !== 'found',
                  'cell-reviewed': record.reviews[column.key]?.checked,
                }"
                @click="inspect(record, column.key)"
                ><span class="cell-value">{{ current(record, column.key) || '—' }}</span
                ><small v-if="record.reviews[column.key]?.checked">{{ t('extraction.checked') }}</small
                ><small
                  v-else-if="record.cells.find((c: ExtractionCell) => c.fieldId === column.key)?.status !== 'found'"
                  >{{
                    t(`extraction.cell.${record.cells.find((c: ExtractionCell) => c.fieldId === column.key)?.status}`)
                  }}</small
                ></BButton
              ></template
            ></BTable
          ></div
        >
        <BPagination v-if="total > 50" :current="page" :page-size="50" :total="total" @page-change="page = $event" />
      </section>
      <section v-if="!locked" class="flow-footer">
        <p class="muted">{{
          table ? t('extraction.aiBudget', { count: remainingCalls }) : t('extraction.flow.startHint')
        }}</p>
        <component :is="mobile ? MobileStickyActionBar : 'div'" :above-navigation="false" class="main-action">
          <BButton
            v-if="!table"
            type="primary"
            :loading="busy"
            :disabled="!resources.length || !editable || !creationReady"
            @click="prepare"
            >{{ t('extraction.flow.begin') }}</BButton
          >
          <BButton
            v-else-if="canResume"
            type="primary"
            :loading="busy"
            :disabled="!editable || !table.enabled || table.inFlight || (dirtyPlan && invalidPlan)"
            @click="resume"
            >{{
              t(table.phase === 'sample' && table.errorCode ? 'extraction.flow.retrySample' : 'extraction.resume')
            }}</BButton
          >
          <BButton v-else-if="active" type="primary" loading disabled>{{
            t(table.phase === 'prepare' ? 'extraction.flow.checking' : 'extraction.flow.analyzing')
          }}</BButton>
          <template v-else-if="!plan">
            <BButton
              type="primary"
              :loading="busy"
              :disabled="!canAnalyze"
              @click="perform('analyze', { acceptPartial })"
              >{{ t('extraction.flow.continueAnalysis') }}</BButton
            >
            <BButton
              type="text"
              :disabled="busy || !canAnalyze"
              @click="
                manualPlan();
                advanced = true;
              "
              >{{ t('extraction.manual') }}</BButton
            >
          </template>
          <template v-else>
            <BButton
              type="primary"
              :loading="busy"
              :disabled="
                invalidPlan ||
                !editable ||
                !table.enabled ||
                !['ready', 'preview'].includes(table.status) ||
                (partialSources && !acceptPartial)
              "
              @click="start"
              >{{ t('extraction.start') }}</BButton
            >
            <BButton
              :disabled="
                invalidPlan ||
                !editable ||
                !table.enabled ||
                busy ||
                !['ready', 'preview'].includes(table.status) ||
                (partialSources && !acceptPartial)
              "
              @click="perform('sample', { plan, acceptPartial })"
              >{{ t('extraction.refreshSample') }}</BButton
            >
          </template>
        </component>
      </section>
      <footer v-if="table && !active && !table.inFlight && editable" class="table-management"
        ><BButton
          v-if="!['completed', 'ended'].includes(table.status)"
          type="text"
          :disabled="busy"
          @click="perform('end')"
          >{{ t('extraction.end') }}</BButton
        ><BButton type="text" :disabled="busy || table.status === 'paused'" @click="removeTable">{{
          t('extraction.delete')
        }}</BButton></footer
      >
    </template>
    <BDrawer
      :open="pickerOpen"
      :title="t('extraction.choose')"
      mobile-full-screen
      width="min(var(--ui-layout-640, 640px), 100vw)"
      @close="pickerOpen = false"
      ><ToolboxResourceSelector
        v-model="resources"
        :allowed-types="['note', 'bookmark', 'file']"
        :expand-note-branches="false"
        :max="20"
        :file-extensions="extensions"
      /><BButton type="primary" class="drawer-done" @click="pickerOpen = false">{{
        t('extraction.confirm')
      }}</BButton></BDrawer
    >
    <BDrawer
      :open="uploadOpen"
      :title="t('extraction.upload')"
      mobile-full-screen
      :close-disabled="uploading"
      @close="uploadOpen = false"
      ><div class="upload-panel"
        ><p>{{ t('extraction.cloudNotice') }}</p
        ><p class="muted">{{ t('extraction.fileLimit') }}</p
        ><label>{{ t('extraction.folder') }}</label
        ><BSelect v-model:value="folderId" :options="folderOptions" :disabled="uploading" /><BUpload
          raw-file
          multiple
          :accept="extensions.map((e) => '.' + e).join(',')"
          :max-total-size="null"
          :disabled="uploading"
          @change="uploadFiles"
          ><BButton :loading="uploading">{{ t('extraction.upload') }}</BButton></BUpload
        ><p v-if="uploadError" class="issue" role="alert">{{ uploadError }}</p></div
      ></BDrawer
    >
    <BDrawer
      :open="!!selected"
      :title="selectedTitle"
      :modal="mobile"
      mobile-full-screen
      :close-disabled="saving"
      :close-on-click-outside="false"
      width="min(var(--ui-layout-480, 480px), 100vw)"
      @close="closeReview"
    >
      <div v-if="selected && selectedCell" class="review-panel">
        <BSelect
          :value="fieldId"
          :options="displayFields.map((f) => ({ value: f.id, label: f.label }))"
          :disabled="saving"
          @update:value="switchField(String($event))"
        />
        <span class="status" :class="{ 'has-issue': selectedCell.status !== 'found' }">{{
          selected.reviews[fieldId]?.checked ? t('extraction.checked') : t(`extraction.cell.${selectedCell.status}`)
        }}</span>
        <label for="extraction-current">{{ t('extraction.current') }}</label
        ><BInput
          id="extraction-current"
          v-model:value="draft"
          type="textarea"
          :rows="3"
          :maxlength="1000"
          :disabled="!editable || !locked || saving"
        />
        <div class="section-heading"
          ><h3>{{ t('extraction.original') }}</h3
          ><BButton v-if="locked && editable" type="text" :disabled="saving" @click="saveReview('restore')">{{
            t('extraction.restore')
          }}</BButton></div
        ><p class="original">{{ selectedCell.originalValue || '—' }}</p> <h3>{{ t('extraction.evidence') }}</h3
        ><p v-if="!selectedCell.evidence.length" class="muted">{{ t('extraction.noEvidence') }}</p>
        <article v-for="(evidence, index) in selectedCell.evidence" :key="index" class="evidence"
          ><span class="status">{{ t(evidence.kind === 'ocr' ? 'extraction.ocr' : 'extraction.originalText') }}</span
          ><blockquote>{{ evidence.quote }}</blockquote
          ><dl v-if="evidence.table"
            ><dt>{{ t('extraction.productColumn') }}</dt
            ><dd>{{ evidence.table.columnHeader?.text || '—' }}</dd
            ><dt>{{ t('extraction.parameterRow') }}</dt
            ><dd>{{ evidence.table.rowHeader?.text || '—' }}</dd
            ><dt>{{ t('extraction.boundValue') }}</dt
            ><dd>{{ evidence.table.cell.quote }}</dd></dl
          ><small class="muted"
            >{{ sourceName(selected.sourceId) }} ·
            {{ typeof evidence.locator === 'object' ? evidence.locator.value : evidence.locator }}</small
          ></article
        >
        <article
          v-for="(alternative, index) in selectedCell.alternatives || []"
          :key="`alternative-${index}`"
          class="evidence"
        >
          <h3>{{ t('extraction.alternativeValue') }}</h3
          ><p>{{ alternative.value || '—' }}</p>
          <blockquote v-for="(evidence, refIndex) in alternative.evidence" :key="refIndex">
            {{ evidence.quote
            }}<small class="muted">
              · {{ typeof evidence.locator === 'object' ? evidence.locator.value : evidence.locator }} ·
              {{ t(evidence.kind === 'ocr' ? 'extraction.ocr' : 'extraction.originalText') }}</small
            >
          </blockquote>
        </article>
        <BButton type="text" :disabled="saving || draft !== current(selected, fieldId)" @click="openOriginal">{{
          t('extraction.openSource')
        }}</BButton
        ><p class="muted">{{ t('extraction.evidenceHint') }}</p
        ><p v-if="selectedSource?.coverage.complete === false" class="notice">{{ t('extraction.partial') }}</p
        ><p v-if="reviewError" role="alert" class="notice issue">{{ reviewError }}</p>
        <BButton
          v-if="locked && editable"
          type="text"
          :disabled="saving"
          @click="saveReview('exclude', !selected.excluded)"
          >{{ t(selected.excluded ? 'extraction.unexclude' : 'extraction.exclude') }}</BButton
        >
        <component :is="mobile ? MobileStickyActionBar : 'div'" :above-navigation="false" class="review-footer"
          ><div class="actions"
            ><BButton :disabled="saving" @click="nextPending(-1)">{{ t('extraction.previous') }}</BButton
            ><BButton :disabled="saving" @click="nextPending()">{{ t('extraction.next') }}</BButton></div
          ><BButton v-if="locked && editable" type="primary" :loading="saving" @click="saveReview('review')">{{
            t('extraction.reviewSave')
          }}</BButton></component
        >
      </div>
    </BDrawer>
    <BModal
      :visible="exportOpen"
      :show-footer="false"
      :title="t('extraction.export')"
      :close-disabled="exporting"
      @close="exportOpen = false"
      ><div class="export-panel"
        ><label>{{ t('extraction.exportScope') }}</label
        ><BSelect v-model:value="exportScope" :options="exportOptions" /><p class="muted">{{
          t('extraction.exportHint')
        }}</p
        ><div class="actions"
          ><BButton :loading="exporting" @click="download('csv')">CSV</BButton
          ><BButton :loading="exporting" @click="download('xlsx')">Excel</BButton></div
        ><p class="muted">{{ t('extraction.noteHint') }}</p
        ><BButton :disabled="exporting || !editable" @click="saveNote">{{ t('extraction.saveNote') }}</BButton></div
      ></BModal
    >
  </main>
</template>
<script setup lang="ts">
  import { computed, ref, onBeforeUnmount, watch } from 'vue';
  import { useRouter } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import type { ExtractionCell } from '@lightnote/shared/extraction';
  import { bookmarkStore } from '@/store';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { returnFromToolboxPage } from '@/utils/toolboxNavigation';
  import { downloadToolboxBlob, safeDownloadBaseName } from '@/utils/toolboxLocal';
  import { fetchCloudFolders, uploadManagedCloudFile, type ManagedCloudUploadReceipt } from '@/api/cloudFileUploadApi';
  import { deleteExtraction, exportExtraction, inspectExtractionSource, extractionNoteSummary } from '@/api/extraction';
  import { openSaveAsNote } from '@/composables/useSaveAsNote';
  import { createNoteFromContent } from '@/utils/aiNoteDraft';
  import { resolveResourceRoute } from '@/utils/resourceNavigation';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { useExtractionWorkbench } from './useExtractionWorkbench';
  import ToolboxResourceSelector from '../components/ToolboxResourceSelector.vue';
  import MobileListSurface from '@/components/mobile/MobileListSurface.vue';
  import MobileListRow from '@/components/mobile/MobileListRow.vue';
  import MobileStickyActionBar from '@/components/mobile/MobileStickyActionBar.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BPagination from '@/components/base/BasicComponents/BPagination.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { RESOURCE_COLOR_CSS_VAR } from '@/config/resourceColor';
  const { t, te, locale } = useI18n(),
    router = useRouter(),
    bookmark = bookmarkStore();
  const state = useExtractionWorkbench();
  const localDevelopment = import.meta.env.DEV;
  const {
    owner,
    table,
    history,
    records,
    total,
    page,
    busy,
    loading,
    error,
    creationReady,
    availabilityLoading,
    availabilityError,
    reloadAvailability,
    title,
    goal,
    resources,
    plan,
    settingsOpen,
    acceptPartial,
    filter,
    selected,
    fieldId,
    draft,
    reviewError,
    saving,
    editable,
    active,
    locked,
    dirtyPlan,
    invalidPlan,
    duplicateFields,
    selectedCell,
    current,
    explain,
    navigate,
    perform,
    prepare,
    start,
    inspect,
    closeReview,
    switchField,
    saveReview,
    nextPending,
    resume,
  } = state;
  const mobile = computed(() => bookmark.isMobile || bookmark.isTablet),
    pickerOpen = ref(false),
    advanced = ref(false),
    uploadOpen = ref(false),
    uploading = ref(false),
    uploadError = ref(''),
    folderId = ref(''),
    folders = ref<{ id: string; name: string }[]>([]);
  const exportOpen = ref(false),
    exporting = ref(false),
    exportScope = ref<'all' | 'filtered'>('all');
  const extensions = ['txt', 'md', 'markdown', 'csv', 'pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp'];
  const historyOptions = computed(() => history.value.map((item) => ({ value: item.id, label: item.title })));
  const sourceOptions = computed(() => [
    { value: '', label: t('extraction.allSources') },
    ...(table.value?.sources.map((s) => ({ value: s.id, label: s.title })) || []),
  ]);
  const reviewOptions = computed(() => [
    { value: '', label: t('extraction.all') },
    { value: 'pending', label: t('extraction.pending') },
  ]);
  const typeOptions = computed(() =>
    ['text', 'number', 'date'].map((type) => ({ value: type, label: t(`extraction.${type}`) })),
  );
  const folderOptions = computed(() => [
    { value: '', label: t('extraction.root') },
    ...folders.value.map((f) => ({ value: f.id, label: f.name })),
  ]);
  const exportOptions = computed(() => [
    { value: 'all', label: t('extraction.exportAll') },
    { value: 'filtered', label: t('extraction.exportFiltered') },
  ]);
  const displayFields = computed(() => table.value?.plan?.fields || plan.value?.fields || []);
  const columns = computed(() => [
    ...(displayFields.value.map((f) => ({
      key: f.id,
      title: f.label,
      width: 'var(--ui-layout-180, 180px)',
      ellipsis: false,
    })) || []),
    { key: 'source', title: t('extraction.source'), width: 'var(--ui-layout-200, 200px)' },
    { key: 'review', title: t('extraction.pending'), width: 'var(--ui-layout-120, 120px)' },
  ]);
  const totalRanges = computed(() => table.value?.sources.reduce((n, s) => n + s.windows, 0) || 0),
    doneRanges = computed(() => table.value?.sources.reduce((n, s) => n + s.processed, 0) || 0);
  const remainingCalls = computed(() => {
    const identity = (value: typeof plan.value) =>
      value &&
      JSON.stringify({
        recordDefinition: value.recordDefinition,
        fields: value.fields.map(({ key, type, rule }) => ({ key, type, rule })),
      });
    return identity(plan.value) !== identity(table.value?.plan || null)
      ? totalRanges.value
      : table.value?.budget.remainingExtractionCalls || 0;
  });
  const sourcesExpanded = ref(false);
  watch(
    () => table.value?.id,
    () => {
      sourcesExpanded.value = false;
      advanced.value = false;
    },
  );
  const flowSteps = ['extraction.flow.choose', 'extraction.flow.analysis', 'extraction.flow.confirm'];
  const flowStep = computed(() => (!table.value ? 1 : locked.value || table.value.status === 'preview' ? 3 : 2));
  const canResume = computed(() => table.value && ['paused', 'failed', 'partial'].includes(table.value.status));
  const sourceNeedsAttention = computed(
    () =>
      table.value?.phase === 'prepare' ||
      table.value?.sources.some((s) => s.status === 'failed' || s.coverage.complete === false),
  );
  const flowMessage = computed(() => {
    const value = table.value;
    if (value?.status === 'preview') return 'extraction.flow.generated';
    if (value?.errorCode && value.phase === 'sample') return 'extraction.flow.sampleFailed';
    if (canResume.value) return 'extraction.flow.paused';
    if (value?.phase === 'prepare')
      return active.value
        ? 'extraction.flow.checking'
        : canAnalyze.value
          ? 'extraction.flow.ready'
          : 'extraction.flow.needsReview';
    return 'extraction.flow.analyzing';
  });
  const partialSources = computed(() => table.value?.sources.some((s) => s.coverage.complete === false));
  const canAnalyze = computed(
    () =>
      editable.value &&
      table.value?.enabled &&
      table.value.status === 'ready' &&
      table.value.sources.length > 0 &&
      table.value.sources.every((s) => s.status === 'ready') &&
      (!partialSources.value || acceptPartial.value),
  );
  const selectedTitle = computed(
    () =>
      `${displayFields.value.find((f) => f.id === fieldId.value)?.label || ''} · ${selected.value ? current(selected.value, selected.value.cells[0]?.fieldId) : ''}`,
  );
  const selectedSource = computed(() => table.value?.sources.find((s) => s.id === selected.value?.sourceId));
  const issueText = (code: string) =>
    te(`extraction.errors.${code}`) ? t(`extraction.errors.${code}`) : t('extraction.error');
  const sourceName = (id: string) => table.value?.sources.find((s) => s.id === id)?.title || '—';
  function back() {
    returnFromToolboxPage(router, 'workbench');
  }
  useMobileTopBar(['toolboxExtraction'], {
    title: () => t('extraction.title'),
    onBack: back,
    searchMode: 'icon',
    showNotification: false,
  });
  const hasFilter = computed(
    () => !!(filter.value.search || filter.value.sourceId || filter.value.review || filter.value.anomalies),
  );
  const sortOptions = computed(() => [
    { value: '', label: t('extraction.sortDefault') },
    ...displayFields.value.map((f) => ({ value: f.id, label: f.label })),
  ]);
  const sortOrderOptions = computed(() => [
    { value: 'asc', label: t('extraction.ascending') },
    { value: 'desc', label: t('extraction.descending') },
  ]);
  function moveField(index: number, direction: number) {
    if (!plan.value) return;
    const fields = plan.value.fields;
    [fields[index], fields[index + direction]] = [fields[index + direction], fields[index]];
  }
  function addField() {
    if (!plan.value) return;
    const key = `field_${Date.now().toString(36)}`;
    plan.value.fields.push({ id: key, key, label: '', type: 'text', rule: '' });
  }
  function manualPlan() {
    plan.value = { recordDefinition: '', fields: [], issues: [] };
    addField();
  }
  async function openUpload() {
    if (!creationReady.value || !editable.value) return;
    const uploadOwner = owner.value;
    uploadOpen.value = true;
    uploadError.value = '';
    try {
      const result = await fetchCloudFolders();
      if (!disposed && owner.value === uploadOwner) folders.value = result;
    } catch (cause) {
      if (!disposed && owner.value === uploadOwner) uploadError.value = explain(cause);
    }
  }
  const uploadReceipts = new WeakMap<File, ManagedCloudUploadReceipt>();
  let uploadController: AbortController | null = null,
    disposed = false;
  async function uploadFiles(files: File[]) {
    if (uploading.value) return;
    const uploadOwner = owner.value;
    const list = Array.isArray(files) ? files : [files];
    if (
      resources.value.length + list.length > 20 ||
      list.some(
        (file) => file.size > 20 * 1024 * 1024 || !extensions.includes(file.name.split('.').pop()?.toLowerCase() || ''),
      )
    ) {
      uploadError.value = t('extraction.fileLimit');
      return;
    }
    uploading.value = true;
    uploadError.value = '';
    uploadController = new AbortController();
    try {
      for (const file of list) {
        const receipt = uploadReceipts.get(file) || {};
        uploadReceipts.set(file, receipt);
        const result = await uploadManagedCloudFile(file, {
          folderId: folderId.value || null,
          receipt,
          signal: uploadController.signal,
        });
        if (disposed || owner.value !== uploadOwner) return;
        if (!resources.value.some((r) => r.type === 'file' && r.id === result.fileId))
          resources.value.push({ type: 'file', id: result.fileId, title: result.filename });
      }
      uploadOpen.value = false;
    } catch {
      if (!disposed && owner.value === uploadOwner) uploadError.value = t('extraction.uploadFailed');
    } finally {
      if (!disposed) uploading.value = false;
    }
  }
  async function download(format: 'csv' | 'xlsx') {
    if (!table.value || exporting.value) return;
    const target = table.value,
      exportOwner = owner.value;
    exporting.value = true;
    try {
      const blob = await exportExtraction(table.value.id, format, exportScope.value, filter.value);
      if (!disposed && owner.value === exportOwner && table.value?.id === target.id)
        downloadToolboxBlob(blob, `${safeDownloadBaseName(target.title)}.${format}`);
    } catch (cause) {
      if (!disposed) error.value = explain(cause);
    } finally {
      if (!disposed) exporting.value = false;
    }
  }
  async function openOriginal() {
    if (!table.value || !selected.value || saving.value) return;
    const id = table.value.id,
      sourceId = selected.value.sourceId;
    try {
      const source = await inspectExtractionSource(id, sourceId);
      if (disposed || table.value?.id !== id || selected.value?.sourceId !== sourceId) return;
      if (!source.available || source.changed) {
        reviewError.value = t('extraction.changedSource');
        return;
      }
      const target = resolveResourceRoute(source);
      if (target)
        await closeCurrentMobileOverlayThen(
          () => {
            selected.value = null;
          },
          () => router.push(target),
        );
    } catch (cause) {
      reviewError.value = explain(cause);
    }
  }
  async function saveNote() {
    if (!table.value) return;
    const id = table.value.id;
    exporting.value = true;
    try {
      const summary = await extractionNoteSummary(id, exportScope.value, filter.value, locale.value);
      if (disposed || table.value?.id !== id) return;
      const sourceKey = `extraction-note:${id}:${summary.snapshotId}`;
      await closeCurrentMobileOverlayThen(
        () => {
          exportOpen.value = false;
        },
        () =>
          openSaveAsNote({
            sourceKey,
            title: summary.title,
            type: 'markdown',
            isCurrent: () => !disposed && table.value?.id === id,
            save: (options) =>
              createNoteFromContent(
                { title: summary.title, content: summary.content, type: 'markdown' },
                sourceKey,
                options,
                () => !disposed && table.value?.id === id,
              ),
          }),
      );
    } catch (cause) {
      if (!disposed) error.value = explain(cause);
    } finally {
      if (!disposed) exporting.value = false;
    }
  }
  function removeTable() {
    if (!table.value) return;
    const target = table.value;
    Alert.alert({
      content: '',
      title: t('extraction.deleteConfirm'),
      okText: t('extraction.confirm'),
      cancelText: t('extraction.cancel'),
      onOk: async () => {
        try {
          await deleteExtraction(target.id, target.version);
          navigate();
        } catch (cause) {
          error.value = explain(cause);
        }
      },
    });
  }
  watch(owner, () => {
    uploadController?.abort();
    uploadOpen.value = false;
    uploadError.value = '';
    folders.value = [];
    exportOpen.value = false;
  });
  onBeforeUnmount(() => {
    disposed = true;
    uploadController?.abort();
  });
</script>
<style scoped lang="less">
  .extraction-workbench {
    width: 100%;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    box-sizing: border-box;
    padding: var(--ui-space-24, 24px);
    color: var(--text-color);
  }
  .flow-steps {
    display: flex;
    align-items: center;
    gap: var(--ui-space-24, 24px);
    list-style: none;
    padding: 0;
    margin: 0 0 var(--ui-space-20, 20px);
    color: var(--desc-color);
    font-size: var(--ui-font-14, 14px);
  }
  .flow-steps li {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
  }
  .flow-steps .current,
  .flow-steps .done {
    color: var(--workspace-purple-text, var(--primary-color));
  }
  .flow-steps .current {
    font-weight: 600;
  }
  .step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 var(--ui-control-24, 24px);
    height: var(--ui-control-24, 24px);
    border: 1px solid currentColor;
    border-radius: 50%;
  }
  .current .step-number {
    background: var(--navigation-pill-active-bg);
    color: var(--navigation-pill-active-fg);
    border-color: var(--navigation-pill-active-border);
  }
  .flow-status {
    display: grid;
    gap: var(--ui-space-6, 6px);
    margin: var(--ui-space-16, 16px) 0;
  }
  .flow-footer {
    position: sticky;
    bottom: calc(-1 * var(--ui-space-24, 24px));
    z-index: 2;
    background: var(--background-color);
    border-top: 1px solid var(--border-color);
    display: grid;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-20, 20px) 0;
  }
  .back {
    margin-bottom: var(--ui-space-16, 16px);
  }
  h1,
  h2,
  h3,
  p {
    margin: 0;
  }
  h1 {
    font-size: var(--ui-font-22, 22px);
  }
  h2 {
    font-size: var(--ui-font-16, 16px);
  }
  h3 {
    font-size: var(--ui-font-14, 14px);
  }
  .workbench-head,
  .section-heading,
  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
  }
  .workbench-head {
    margin-bottom: var(--ui-space-20, 20px);
  }
  .workbench-head > div:first-child {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    flex-wrap: wrap;
  }
  .head-actions,
  .actions {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    flex-wrap: wrap;
  }
  .head-actions :deep(.b-select) {
    width: var(--ui-layout-180, 180px);
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-6, 6px);
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
    white-space: nowrap;
  }
  .status::before {
    content: '';
    width: var(--ui-space-6, 6px);
    height: var(--ui-space-6, 6px);
    border-radius: 50%;
    background: currentColor;
  }
  .muted {
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.7;
  }
  .issue,
  .has-issue {
    color: var(--warning-color, #a76014);
  }
  .notice {
    padding: var(--ui-space-12, 12px);
    border: 1px solid currentColor;
    border-radius: var(--ui-space-8, 8px);
    line-height: 1.6;
    margin-bottom: var(--ui-space-12, 12px);
  }
  .settings,
  .data-area {
    border: 1px solid var(--surface-border-color);
    border-radius: var(--ui-space-12, 12px);
    background: var(--background-color);
    padding: var(--ui-space-20, 20px);
    margin-top: var(--ui-space-16, 16px);
  }
  .settings {
    display: grid;
    gap: var(--ui-space-14, 14px);
  }
  .settings label,
  .review-panel label {
    font-size: var(--ui-font-13, 13px);
    font-weight: 500;
  }
  .name-field {
    display: grid;
    gap: var(--ui-space-8, 8px);
    max-width: var(--ui-layout-480, 480px);
  }
  .source-list {
    display: flex;
    gap: var(--ui-space-8, 8px);
    flex-wrap: wrap;
  }
  .source-list article {
    display: flex;
    align-items: center;
    gap: var(--ui-space-10, 10px);
    border: 1px solid var(--surface-border-color);
    border-radius: var(--ui-space-8, 8px);
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    max-width: 100%;
  }
  .source-list strong,
  .source-list span {
    overflow-wrap: anywhere;
  }
  .source-list small {
    display: block;
    font-size: var(--ui-font-12, 12px);
    color: var(--desc-color);
  }
  .source-type {
    position: relative;
    display: grid;
    place-items: center;
    flex: 0 0 var(--ui-control-24, 24px);
    height: var(--ui-control-24, 24px);
    border-radius: var(--ui-space-6, 6px);
  }
  .source-type::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: currentColor;
    opacity: 0.1;
    pointer-events: none;
  }
  .source-list--selected article {
    gap: var(--ui-space-8, 8px);
    padding: var(--ui-space-4, 4px) var(--ui-space-8, 8px);
  }
  .source-list--selected .source-remove {
    flex: 0 0 var(--ui-control-24, 24px);
    padding: 0;
    color: var(--desc-color);
  }
  .source-list--selected .source-remove:hover {
    color: var(--primary-color);
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-12, 12px);
  }
  .field {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--ui-space-8, 8px);
  }
  .field.advanced {
    grid-template-columns: minmax(0, 1fr) var(--ui-layout-120, 120px);
    align-content: start;
    padding: var(--ui-space-12, 12px);
    border: 1px solid var(--surface-border-color);
    border-radius: var(--ui-space-8, 8px);
  }
  .field-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-8, 8px);
    flex-wrap: wrap;
  }
  .definition-field,
  .field-name,
  .field-type,
  .field-rule {
    display: grid;
    gap: var(--ui-space-6, 6px);
    min-width: 0;
  }
  .field-type > span {
    font-size: var(--ui-font-13, 13px);
    font-weight: 500;
  }
  .field-heading,
  .field-rule {
    grid-column: 1 / -1;
  }
  .main-action {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    padding-top: var(--ui-space-8, 8px);
  }
  .summary {
    padding: var(--ui-space-12, 12px) 0;
    border-bottom: 1px solid var(--surface-border-color);
  }
  .summary > div:first-child {
    display: flex;
    gap: var(--ui-space-16, 16px);
    flex-wrap: wrap;
    font-size: var(--ui-font-13, 13px);
  }
  .summary small {
    width: 100%;
    color: var(--desc-color);
  }
  .filter-bar {
    display: flex;
    gap: var(--ui-space-12, 12px);
    align-items: center;
    flex-wrap: wrap;
    margin: var(--ui-space-16, 16px) 0;
  }
  .filter-bar :deep(.input-container),
  .filter-bar :deep(.b-select) {
    max-width: var(--ui-layout-200, 200px);
  }
  .data-table {
    min-width: 0;
    margin-top: var(--ui-space-12, 12px);
  }
  .cell {
    color: var(--text-color);
    text-align: left;
    width: 100%;
    min-height: var(--ui-control-32, 32px);
    height: auto;
    padding: var(--ui-space-4, 4px) var(--ui-space-8, 8px);
    line-height: 1.4;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .cell-value {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cell-issue {
    color: var(--warning-color, #a76014);
  }
  .cell-reviewed {
    color: var(--success-color, #348357);
  }
  .cell small {
    display: block;
    font-size: var(--ui-font-10, 10px);
  }
  .source-label {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
  }
  .empty {
    padding: var(--ui-space-40, 40px);
    text-align: center;
    color: var(--desc-color);
  }
  .excluded {
    opacity: 0.6;
  }
  dl {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--ui-space-8, 8px) var(--ui-space-16, 16px);
    font-size: var(--ui-font-13, 13px);
  }
  dt {
    color: var(--desc-color);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .review-panel,
  .upload-panel,
  .export-panel {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-16, 16px);
  }
  .original {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    padding: var(--ui-space-12, 12px);
    border: 1px solid var(--surface-border-color);
    border-radius: var(--ui-space-8, 8px);
  }
  .evidence {
    border: 1px solid var(--surface-border-color);
    border-radius: var(--ui-space-8, 8px);
    padding: var(--ui-space-12, 12px);
  }
  blockquote {
    margin: var(--ui-space-12, 12px) 0;
    padding-left: var(--ui-space-12, 12px);
    border-left: 2px solid var(--primary-color);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: var(--ui-font-13, 13px);
    line-height: 1.7;
  }
  .review-footer:not(.mobile-sticky-action-bar) {
    display: grid;
    gap: var(--ui-space-12, 12px);
    position: sticky;
    bottom: 0;
    padding: var(--ui-space-16, 16px) 0 max(var(--ui-space-12, 12px), env(safe-area-inset-bottom));
    background: var(--background-color);
    border-top: 1px solid var(--surface-border-color);
  }
  .review-footer .actions {
    justify-content: space-between;
  }
  .table-management {
    display: flex;
    justify-content: flex-end;
    gap: var(--ui-space-12, 12px);
    margin-top: var(--ui-space-16, 16px);
  }
  .drawer-done {
    margin-top: var(--ui-space-16, 16px);
  }
  @media (max-width: 1024px) {
    .review-panel {
      padding-bottom: var(--ui-space-96, 96px);
    }
    .review-footer.mobile-sticky-action-bar {
      flex-wrap: wrap;
    }
    .review-footer .actions {
      display: contents;
    }
    .workbench-head {
      align-items: flex-start;
      flex-direction: column;
    }
    .head-actions {
      width: 100%;
    }
    .head-actions :deep(.b-select) {
      flex: 1;
    }
    .extraction-workbench {
      padding: var(--ui-space-16, 16px);
      padding-bottom: var(--ui-space-96, 96px);
    }
    .main-action.mobile-sticky-action-bar :deep(.b_btn) {
      white-space: normal;
      height: auto;
    }
    .summary {
      align-items: flex-start;
      flex-direction: column;
    }
    .settings,
    .data-area {
      padding: var(--ui-space-16, 16px);
    }
    .flow-footer {
      position: static;
      border-top: 0;
    }
    .flow-steps {
      gap: var(--ui-space-12, 12px);
      font-size: var(--ui-font-12, 12px);
      align-items: flex-start;
    }
    .flow-steps li {
      flex: 1;
      align-items: flex-start;
    }
    .fields {
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ui-space-10, 10px);
    }
    .main-action:not(.mobile-sticky-action-bar) {
      position: sticky;
      bottom: 0;
      z-index: 2;
      background: var(--background-color);
      padding: var(--ui-space-12, 12px) 0 max(var(--ui-space-12, 12px), env(safe-area-inset-bottom));
    }
    .main-action > :deep(.b_btn:first-child) {
      flex: 1;
    }
    .filter-bar {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .filter-bar > :first-child {
      grid-column: 1/-1;
    }
    .filter-bar :deep(.input-container),
    .filter-bar :deep(.b-select) {
      max-width: none;
    }
    .source-list {
      flex-direction: column;
    }
    .source-list--selected .source-remove {
      flex-basis: var(--ui-control-32, 32px);
      height: var(--ui-control-32, 32px);
      line-height: var(--ui-control-32, 32px);
    }
    .section-heading {
      flex-wrap: wrap;
    }
  }
</style>
