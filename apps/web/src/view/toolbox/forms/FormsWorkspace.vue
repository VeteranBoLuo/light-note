<template>
  <main class="collection-workspace" :class="{ 'has-form': !!formId }">
    <header v-if="isMobile" class="collection-mobile-header">
      <BButton
        class="collection-mobile-header__back"
        :aria-label="t('common.back')"
        @click="formId ? navigate('') : router.push('/toolbox')"
        ><SvgIcon :src="icon.arrow_left" size="20" aria-hidden="true"
      /></BButton>
      <h1 :title="formId && form?.id === formId ? form.title : t('collectionForms.title')">{{
        formId && form?.id === formId ? form.title : t('collectionForms.title')
      }}</h1>
      <BButton v-if="!formId" type="text" :disabled="busy" @click="createOpen = true">{{
        t('collectionForms.new')
      }}</BButton>
      <BActionMenu
        v-else-if="form && form.id === formId && !loading"
        :items="headerActions"
        :width="240"
        placement="bottom-right"
        @select="headerAction"
      >
        <BButton class="collection-mobile-header__more" :aria-label="t('collectionForms.formActions')"
          ><SvgIcon :src="icon.common.more" size="20"
        /></BButton>
      </BActionMenu>
    </header>
    <aside ref="directoryRef" class="collection-directory collection-stack" data-mobile-resource-scroll>
      <BButton v-if="!isMobile" type="text" class="collection-directory-back" @click="router.push('/toolbox')">
        <SvgIcon :src="icon.toolbox.back" size="16" /><span>{{ t('toolbox.title') }}</span>
      </BButton>
      <div v-if="!isMobile" class="collection-row"
        ><h2>{{ t('collectionForms.title') }}</h2
        ><BButton :disabled="busy" @click="createOpen = true">{{ t('collectionForms.new') }}</BButton></div
      >
      <p class="collection-muted">{{ t('collectionForms.subtitle') }}</p>
      <BInput
        v-model:value="search"
        :placeholder="t('collectionForms.searchForms')"
        :aria-label="t('collectionForms.searchForms')"
      />
      <BSelect
        v-model:value="status"
        :options="[
          { value: 'all', label: t('collectionForms.allStatuses') },
          ...Object.entries(statusLabel).map(([value, label]) => ({ value, label: t(label) })),
        ]"
        :aria-label="t('collectionForms.formStatus')"
      />
      <BButton v-if="route.query.tagId" @click="router.push('/toolbox/forms')">{{
        t('collectionForms.clearTag')
      }}</BButton>
      <p v-if="listError" class="collection-error" role="alert"
        >{{ listError }}<BButton @click="loadList">{{ t('collectionForms.retry') }}</BButton></p
      >
      <p v-else-if="listLoading && !forms.length" role="status">{{ t('collectionForms.loading') }}</p>
      <p v-else-if="!forms.length" class="collection-muted">{{ t('collectionForms.emptyForms') }}</p>
      <BButton
        v-for="item in forms"
        :key="item.id"
        class="collection-entry"
        :class="{ 'is-active': item.id === formId }"
        @click="navigate(item.id)"
        ><span class="collection-entry-heading"
          ><strong class="collection-entry-title">{{ item.title }}</strong
          ><span class="collection-status" :class="'is-' + item.status">{{ t(statusLabel[item.status]) }}</span></span
        ><span class="collection-entry-meta"
          ><small>{{ t('collectionForms.submissionCount', { count: item.total }) }}</small
          ><strong v-if="item.unread">{{ t('collectionForms.unreadCount', { count: item.unread }) }}</strong></span
        ></BButton
      >
    </aside>
    <section ref="detailRef" class="collection-detail collection-stack" data-mobile-resource-scroll>
      <p v-if="error" class="collection-error" role="alert"
        >{{ error }}<BButton @click="reloadCurrent">{{ t('collectionForms.reload') }}</BButton></p
      >
      <p v-if="loading && !form" role="status">{{ t('collectionForms.loadingForm') }}</p>
      <div
        v-else-if="form && definition"
        class="collection-detail-content collection-stack"
        :inert="loading || form.id !== formId ? true : undefined"
        :aria-busy="loading"
      >
        <header v-if="!isMobile" class="collection-editor-header collection-row"
          ><div
            ><h1>{{ form.title }}</h1
            ><span class="collection-status" :class="'is-' + form.status">{{ t(statusLabel[form.status]) }}</span></div
          ><div class="collection-toolbar"
            ><BButton class="collection-header-settings" @click="metadataOpen = true">{{
              t('collectionForms.settings')
            }}</BButton
            ><BButton v-if="form.published" type="primary" @click="copyLink"
              ><SvgIcon :src="icon.toolbox.copy" size="16" />{{ t('collectionForms.shareForm') }}</BButton
            >
            <BButton
              v-if="['collecting', 'paused'].includes(form.status)"
              :disabled="busy || dirty"
              @click="act(form.status === 'collecting' ? 'pause' : 'resume')"
              >{{ t(form.status === 'collecting' ? 'collectionForms.pause' : 'collectionForms.resume') }}</BButton
            >
            <BActionMenu :items="headerActions" :width="240" placement="bottom-right" @select="headerAction">
              <BButton type="text" :aria-label="t('collectionForms.formActions')"
                ><SvgIcon :src="icon.common.more" size="20"
              /></BButton>
            </BActionMenu>
            <BButton
              v-if="tab === 'settings'"
              class="collection-desktop-save"
              type="primary"
              :disabled="busy || !dirty"
              @click="save"
              >{{ busy ? t('collectionForms.saving') : t('collectionForms.save') }}</BButton
            >
            <BButton
              v-if="form.status === 'draft'"
              class="collection-desktop-save"
              :disabled="busy || dirty"
              type="primary"
              @click="confirmAction('publish')"
              >{{ t('collectionForms.publish') }}</BButton
            >
            <span v-if="tab === 'settings'" class="collection-muted collection-desktop-save">{{
              t(dirty ? 'collectionForms.unsaved' : 'collectionForms.savedLabel')
            }}</span></div
          ></header
        >
        <span v-if="isMobile" class="collection-mobile-status collection-status" :class="'is-' + form.status">{{
          t(statusLabel[form.status])
        }}</span>
        <p v-if="notice" class="collection-notice" role="status">{{ notice }}</p>
        <BTabs
          v-model:active-tab="tab"
          :options="[
            { key: 'settings', label: t('collectionForms.editForm') },
            { key: 'responses', label: t('collectionForms.responses') },
            { key: 'statistics', label: t('collectionForms.statistics') },
          ]"
        />
        <div v-if="tab === 'statistics'" class="collection-row collection-stat-controls"
          ><h3>{{ t('collectionForms.dataOverview') }}</h3
          ><div class="collection-toolbar"
            ><BSelect
              :value="dateRange"
              :options="dateOptions"
              :aria-label="t('collectionForms.dateFilter')"
              @update:value="setDateRange"
            /><BButton type="text" @click="statisticsInfo = true">{{
              t('collectionForms.statisticsScope')
            }}</BButton></div
          ></div
        >
        <template v-if="tab === 'settings'">
          <div v-if="isMobile" class="collection-preview-switch collection-row">
            <BButton
              type="text"
              :class="{ 'is-active': !mobilePreview }"
              :aria-pressed="!mobilePreview"
              @click="mobilePreview = false"
              >{{ t('collectionForms.editShort') }}</BButton
            >
            <BButton
              type="text"
              :class="{ 'is-active': mobilePreview }"
              :aria-pressed="mobilePreview"
              @click="mobilePreview = true"
              >{{ t('collectionForms.preview') }}</BButton
            >
          </div>
          <div class="collection-editor-layout">
            <div v-show="!isMobile || !mobilePreview" class="collection-paper collection-stack">
              <section class="collection-card collection-intro collection-row">
                <div
                  ><h2>{{ definition.title }}</h2
                  ><p class="collection-muted collection-description">{{
                    definition.description || t('collectionForms.description')
                  }}</p></div
                >
                <BButton v-if="!isMobile" type="text" @click="metadataOpen = true">{{
                  t('collectionForms.editForm')
                }}</BButton>
              </section>
              <FormEditor :key="form.id" v-model="definition" :locked="!!form.published" />
            </div>
            <aside v-show="!isMobile || mobilePreview" class="collection-live-preview collection-card collection-stack">
              <div class="collection-row"
                ><h3>{{ t('collectionForms.livePreview') }}</h3
                ><BButton type="text" @click="preview = true">{{ t('collectionForms.fullPreview') }}</BButton></div
              >
              <FormRenderer v-if="!preview" :key="form.id" :definition="definition" preview />
            </aside>
          </div>
          <footer class="collection-mobile-save">
            <BButton type="primary" :disabled="busy || !dirty" @click="save">{{
              busy ? t('collectionForms.saving') : t(dirty ? 'collectionForms.save' : 'collectionForms.savedLabel')
            }}</BButton>
            <BButton v-if="form.status === 'draft'" :disabled="busy || dirty" @click="confirmAction('publish')">{{
              t('collectionForms.publish')
            }}</BButton>
          </footer>
        </template>
        <FormStatistics v-else-if="tab === 'statistics'" :key="form.id" :form-id="form.id" :from="from" :to="to" />
        <section v-else class="collection-records" :aria-busy="responsesLoading">
          <div class="collection-records-toolbar">
            <div class="collection-records-heading"
              ><h3>{{ t('collectionForms.responses') }}</h3
              ><span class="collection-muted">{{ t('collectionForms.submissionCount', { count: total }) }}</span></div
            >
            <div class="collection-records-filters">
              <BSelect
                :value="dateRange"
                :options="dateOptions"
                :aria-label="t('collectionForms.dateFilter')"
                @update:value="setDateRange"
              />
              <BSelect
                v-model:value="responseState"
                :options="responseOptions"
                :aria-label="t('collectionForms.responseFilter')"
              />
              <BButton
                type="text"
                :loading="responsesLoading"
                :disabled="busy"
                :aria-label="t('collectionForms.refresh')"
                @click="loadResponses"
                ><SvgIcon :src="icon.toolbox.rotate" size="18"
              /></BButton>
              <BActionMenu :items="responseActions" placement="bottom-right" @select="responseAction"
                ><BButton type="text" :aria-label="t('collectionForms.responseActions')"
                  ><SvgIcon :src="icon.common.more" size="18" /></BButton
              ></BActionMenu>
            </div>
          </div>
          <div v-if="batchMode || selected.length" class="collection-records-batch collection-toolbar">
            <span>{{ t('collectionForms.selectedCount', { count: selected.length }) }}</span>
            <BButton
              v-for="action in ['processed', 'pending', 'spam', 'restore']"
              :key="action"
              type="text"
              :disabled="busy || responsesLoading || !!responseError || !selected.length"
              @click="mark(action, selected)"
              >{{
                t(
                  'collectionForms.' +
                    { processed: 'markProcessed', pending: 'markPending', spam: 'markSpam', restore: 'restore' }[
                      action
                    ],
                )
              }}</BButton
            >
            <BButton
              type="text"
              @click="
                batchMode = false;
                selected = [];
              "
              >{{ t('collectionForms.done') }}</BButton
            >
          </div>
          <div v-if="responseError" class="collection-records-error" role="alert"
            ><h3>{{ responseError }}</h3
            ><BButton @click="loadResponses">{{ t('collectionForms.retry') }}</BButton></div
          >
          <div v-if="!responses.length && !responseError" class="collection-records-empty" role="status">
            <span class="collection-empty-icon"><SvgIcon :src="icon.contextMenu.inbox" size="30" /></span>
            <h3>{{
              t(
                responsesLoading
                  ? 'collectionForms.loadingResponses'
                  : filteredResponses
                    ? 'collectionForms.emptyResponses'
                    : 'collectionForms.noResponsesYet',
              )
            }}</h3>
            <p v-if="!responsesLoading" class="collection-muted">{{
              t(filteredResponses ? 'collectionForms.filterHint' : 'collectionForms.shareHint')
            }}</p>
            <BButton v-if="!responsesLoading && filteredResponses" @click="clearResponseFilters">{{
              t('collectionForms.clearFilters')
            }}</BButton>
            <BButton v-else-if="!responsesLoading && form.published" type="primary" @click="copyLink"
              ><SvgIcon :src="icon.toolbox.copy" size="16" />{{ t('collectionForms.copyLink') }}</BButton
            >
          </div>
          <template v-else-if="responses.length">
            <BTable
              v-if="!isMobile"
              :data="responses"
              :columns="responseColumns"
              selectable
              preserve-selection
              :selected-rows="selected"
              :selection-disabled="busy || responsesLoading || !!responseError"
              @selection-change="selected = $event"
            >
              <template #bodyCell="{ record: r, column }">
                <span v-if="column.key === 'created_at'">{{ date(r.created_at) }}</span>
                <span
                  v-else-if="column.key === 'is_read'"
                  class="collection-read-state"
                  :class="{ 'is-unread': !r.is_read }"
                  >{{ t(r.is_read ? 'collectionForms.read' : 'collectionForms.unread') }}</span
                >
                <span
                  v-else-if="column.key === 'processed'"
                  class="collection-processing-state"
                  :class="{ 'is-done': r.processed && !r.spam, 'is-spam': r.spam }"
                  >{{
                    t(
                      r.spam
                        ? 'collectionForms.spam'
                        : r.processed
                          ? 'collectionForms.processed'
                          : 'collectionForms.pending',
                    )
                  }}</span
                >
                <BButton v-else type="text" :disabled="responsesLoading || !!responseError" @click="openResponse(r)"
                  >{{ t('collectionForms.viewResponse') }}<SvgIcon :src="icon.ai.sourceArrow" size="14"
                /></BButton>
              </template>
            </BTable>
            <div v-else class="collection-record-cards">
              <article v-for="r in responses" :key="r.id" class="collection-record-card">
                <BCheckbox
                  v-if="batchMode"
                  :model-value="selected.includes(r.id)"
                  :disabled="busy || responsesLoading || !!responseError"
                  :aria-label="t('collectionForms.selectResponse') + date(r.created_at)"
                  @update:model-value="select(r.id, $event)"
                />
                <BButton
                  type="text"
                  class="collection-record-open"
                  :disabled="responsesLoading || !!responseError"
                  @click="openResponse(r)"
                >
                  <span class="collection-row"
                    ><span>{{ date(r.created_at) }}</span
                    ><span class="collection-read-state" :class="{ 'is-unread': !r.is_read }">{{
                      t(r.is_read ? 'collectionForms.read' : 'collectionForms.unread')
                    }}</span></span
                  >
                  <span class="collection-row"
                    ><span
                      class="collection-processing-state"
                      :class="{ 'is-done': r.processed && !r.spam, 'is-spam': r.spam }"
                      >{{
                        t(
                          r.spam
                            ? 'collectionForms.spam'
                            : r.processed
                              ? 'collectionForms.processed'
                              : 'collectionForms.pending',
                        )
                      }}</span
                    ><SvgIcon :src="icon.ai.sourceArrow" size="16"
                  /></span>
                </BButton>
              </article>
            </div>
          </template>
          <div v-if="total > 0 && !responseError" class="collection-records-pagination">
            <span class="collection-muted">{{ t('collectionForms.totalResponses', { count: total }) }}</span>
            <div class="collection-toolbar"
              ><BButton
                type="text"
                :disabled="page <= 1 || responsesLoading"
                :aria-label="t('collectionForms.previous')"
                @click="page--"
                ><SvgIcon :src="icon.toolbox.back" size="16" /></BButton
              ><span class="collection-page-number">{{ page }}</span
              ><BButton
                type="text"
                :disabled="page * 30 >= total || responsesLoading"
                :aria-label="t('collectionForms.next')"
                @click="page++"
                ><SvgIcon :src="icon.ai.sourceArrow" size="16" /></BButton
            ></div>
          </div>
        </section>
      </div>
      <p v-else-if="!loading && !formId" class="collection-muted">{{ t('collectionForms.selectHint') }}</p>
    </section>
    <BModal v-model:visible="statisticsInfo" :title="t('collectionForms.statisticsScope')" :show-footer="false"
      ><p>{{ t('collectionForms.statisticsHint') }}</p
      ><p>{{ t('collectionForms.statisticsFootnote') }}</p></BModal
    >
    <BModal
      v-model:visible="dateOpen"
      :show-footer="false"
      :title="t('collectionForms.customDates')"
      width="var(--ui-layout-480, 480px)"
    >
      <div class="collection-stack"
        ><label>{{ t('collectionForms.startDate') }}<BInput v-model:value="draftFrom" type="date" /></label
        ><label>{{ t('collectionForms.endDate') }}<BInput v-model:value="draftTo" type="date" /></label
        ><BButton type="primary" :disabled="!draftFrom || !draftTo || draftFrom > draftTo" @click="applyDates">{{
          t('collectionForms.applyFilters')
        }}</BButton></div
      >
    </BModal>
    <BModal
      v-model:visible="createOpen"
      :title="t('collectionForms.newForm')"
      width="var(--ui-layout-640, 640px)"
      fullscreen-mobile
      modal-class="collection-create-modal"
      :close-disabled="busy"
    >
      <div class="collection-stack collection-create-body">
        <p v-if="error" class="collection-error" role="alert">{{ error }}</p>
        <p class="collection-muted">{{ t('collectionForms.templateHint') }}</p>
        <strong>{{ t('collectionForms.chooseTemplate') }}</strong>
        <div class="collection-template-grid" role="group" :aria-label="t('collectionForms.chooseTemplate')">
          <BButton
            v-for="item in templateOptions"
            :key="item.id"
            class="collection-template"
            :class="{ 'is-selected': template === item.id }"
            :aria-pressed="template === item.id"
            @click="template = item.id"
          >
            <SvgIcon :src="item.icon" size="24" />
            <strong>{{ t('collectionForms.' + item.idLabel) }}</strong
            ><small>{{ t('collectionForms.' + item.id + 'Hint') }}</small>
            <span v-if="template === item.id" class="collection-template-check">✓</span>
          </BButton>
        </div>
        <label
          >{{ t('collectionForms.formName')
          }}<BInput v-model:value="newTitle" :placeholder="t('collectionForms.formName')" :maxlength="200"
        /></label>
        <p class="collection-muted">{{ t('collectionForms.nameHint') }}</p>
      </div>
      <template #footer
        ><div class="collection-dialog-footer"
          ><p class="collection-muted">{{ t('collectionForms.createHint') }}</p
          ><div class="collection-toolbar"
            ><BButton :disabled="busy" @click="createOpen = false">{{ t('common.cancel') }}</BButton
            ><BButton type="primary" :disabled="busy || !newTitle.trim()" @click="create">{{
              t('collectionForms.createEdit')
            }}</BButton></div
          ></div
        ></template
      >
    </BModal>
    <BModal
      v-model:visible="metadataOpen"
      :title="t('collectionForms.settings')"
      width="var(--ui-layout-640, 640px)"
      fullscreen-mobile
      modal-class="collection-metadata-modal"
    >
      <div v-if="form && definition" class="collection-stack"
        ><p v-if="error" role="alert" class="collection-error">{{ error }}</p
        ><FormMetadata v-if="definition" v-model="definition" v-model:tag-ids="tagIds" :tags="tags" />
        <section class="collection-card collection-stack">
          <h3>{{ t('collectionForms.submissionPolicy') }}</h3>
          <BSelect
            v-model:value="definition.submissionPolicy"
            :disabled="!!form.published"
            :aria-label="t('collectionForms.submissionPolicy')"
            :options="[
              { value: 'multiple', label: t('collectionForms.allowMultiple') },
              { value: 'replace', label: t('collectionForms.replaceLatest') },
            ]"
          />
          <p class="collection-muted">{{ t('collectionForms.policyLockedHint') }}</p>
        </section>
        <section
          class="collection-card collection-stack collection-publish-card"
          :class="{ 'is-draft': form.status === 'draft' }"
        >
          <h3>{{ t('collectionForms.management') }}</h3>
          <p class="collection-muted">{{ t('collectionForms.publishingHint') }}</p>
          <BButton
            v-if="form.status === 'draft'"
            :disabled="busy || dirty"
            type="primary"
            @click="confirmAction('publish')"
            >{{ t('collectionForms.publish') }}</BButton
          >
          <BButton v-if="form.status === 'collecting'" :disabled="busy || dirty" @click="act('pause')">{{
            t('collectionForms.pause')
          }}</BButton>
          <BButton v-if="form.status === 'paused'" :disabled="busy || dirty" @click="act('resume')">{{
            t('collectionForms.resume')
          }}</BButton>
        </section>
        <section class="collection-card collection-more">
          <h3>{{ t('collectionForms.formActions') }}</h3>
          <div class="collection-management-actions">
            <BButton
              v-if="['paused', 'collecting'].includes(form.status)"
              type="text"
              :disabled="busy || dirty"
              @click="confirmAction('end')"
            >
              <SvgIcon :src="icon.toolbox.task" size="18" /><span>{{ t('collectionForms.end') }}</span>
            </BButton>
            <BButton type="text" :disabled="busy || dirty" @click="act('copy')">
              <SvgIcon :src="icon.toolbox.copy" size="18" /><span>{{ t('collectionForms.duplicate') }}</span>
            </BButton>
            <BButton
              class="collection-management-delete"
              type="text"
              :disabled="busy || dirty || form.status === 'collecting'"
              @click="confirmAction('delete')"
            >
              <SvgIcon :src="icon.toolbox.delete" size="18" /><span>{{
                t(form.status === 'collecting' ? 'collectionForms.deleteAfterPause' : 'collectionForms.deleteForm')
              }}</span>
            </BButton>
          </div>
        </section>
      </div>
      <template #footer
        ><div class="collection-dialog-footer"
          ><p class="collection-muted">{{ t('collectionForms.unifiedSave') }}</p
          ><BButton type="primary" @click="metadataOpen = false">{{ t('collectionForms.done') }}</BButton></div
        ></template
      >
    </BModal>
    <BDrawer :open="preview" @close="preview = false" :title="t('collectionForms.previewTitle')" mobile-full-screen
      ><FormRenderer v-if="definition" :definition="definition" preview
    /></BDrawer>
    <BDrawer
      :open="responseOpen"
      @close="responseOpen = false"
      :title="t('collectionForms.responseDetail')"
      mobile-full-screen
      ><div v-if="activeResponse && form" class="collection-stack"
        ><p v-if="error" class="collection-error" role="alert">{{ error }}</p
        ><span>{{ t('collectionForms.firstSubmittedAt') }}：{{ date(activeResponse.created_at) }}</span
        ><span
          >{{ t('collectionForms.lastUpdatedAt') }}：{{
            date(activeResponse.updated_at || activeResponse.created_at)
          }}</span
        ><section v-for="q in form.definition.questions" :key="q.id"
          ><strong>{{ q.title }}</strong
          ><p class="collection-description">{{ answerLabel(q, activeResponse.answers[q.id]) }}</p></section
        ><label
          >{{ t('collectionForms.privateNote')
          }}<BInput v-model:value="privateNote" type="textarea" :maxlength="5000" /></label
        ><BButton :disabled="busy" @click="mark('note', [activeResponse.id], privateNote)">{{
          t('collectionForms.saveNote')
        }}</BButton
        ><div class="collection-toolbar"
          ><BButton
            :disabled="busy"
            @click="mark(activeResponse.processed ? 'pending' : 'processed', [activeResponse.id])"
            >{{
              activeResponse.processed ? t('collectionForms.markPending') : t('collectionForms.markProcessed')
            }}</BButton
          ><BButton :disabled="busy" @click="mark(activeResponse.spam ? 'restore' : 'spam', [activeResponse.id])">{{
            activeResponse.spam ? t('collectionForms.restoreValid') : t('collectionForms.markSpam')
          }}</BButton></div
        ></div
      ></BDrawer
    >
  </main>
</template>
<script setup lang="ts">
  import './forms.css';
  import { useI18n } from 'vue-i18n';
  const { t, locale } = useI18n();
  import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
  import { useRoute, useRouter, onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router';
  import type { FormDefinition, FormQuestion } from '@lightnote/shared/collection-forms';
  import { validateDefinition } from '@lightnote/shared/collection-forms';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import BTable from '@/components/base/BasicComponents/BTable/BTable.vue';
  import BMessage from '@/components/base/BasicComponents/BMessage/BMessage';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BCheckbox from '@/components/base/BasicComponents/BCheckbox.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import FormEditor from './FormEditor.vue';
  import FormMetadata from './FormMetadata.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import FormRenderer from './FormRenderer.vue';
  import FormStatistics from './FormStatistics.vue';
  import { useDensityScrollAnchor } from '@/composables/useDensityScrollAnchor';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useUserStore } from '@/store';
  import { formsApi, statusLabel, type CollectionForm, type Submission } from './api';
  const isMobile = useMobileLayout();
  const mobilePreview = ref(false);
  const metadataOpen = ref(false);
  const templateOptions = [
    { id: 'blank', idLabel: 'blank', icon: icon.toolbox.materialNote },
    { id: 'feedback', idLabel: 'feedback', icon: icon.toolbox.audit },
    { id: 'questions', idLabel: 'questions', icon: icon.toolbox.research },
    { id: 'poll', idLabel: 'poll', icon: icon.toolbox.table },
  ];
  const user = useUserStore();
  const route = useRoute(),
    router = useRouter(),
    formId = computed(() => String(route.params.formId || ''));
  const forms = ref<CollectionForm[]>([]),
    form = ref<CollectionForm>(),
    definition = ref<FormDefinition>(),
    tagIds = ref<string[]>([]),
    tags = ref<{ id: string; name: string }[]>([]),
    saved = ref('');
  const search = ref(''),
    status = ref('all'),
    error = ref(''),
    listError = ref(''),
    notice = ref(''),
    busy = ref(false),
    loading = ref(false),
    listLoading = ref(false),
    tab = ref('responses');
  const responses = ref<Submission[]>([]),
    total = ref(0),
    page = ref(1),
    responseState = ref('valid'),
    from = ref(''),
    to = ref(''),
    responsesLoading = ref(false),
    selected = ref<string[]>([]);
  const statisticsInfo = ref(false);
  const responseError = ref(''),
    batchMode = ref(false),
    dateRange = ref('all');
  const dateOpen = ref(false),
    draftFrom = ref(''),
    draftTo = ref('');
  const filteredResponses = computed(
    () => !!from.value || !!to.value || !['valid', 'all'].includes(responseState.value) || !!form.value?.total,
  );
  const dateOptions = computed(() =>
    ['all', '7', '30', 'custom'].map((value, i) => ({
      value,
      label: t('collectionForms.' + ['allDates', 'last7', 'last30', 'customDates'][i]),
    })),
  );
  const responseOptions = computed(() =>
    ['valid', 'all', 'unread', 'pending', 'processed', 'spam'].map((value, i) => ({
      value,
      label: t('collectionForms.' + ['validResponses', 'allResponses', 'unread', 'pending', 'processed', 'spam'][i]),
    })),
  );
  const responseColumns = computed(() =>
    ['created_at', 'is_read', 'processed', 'action'].map((key, i) => ({
      key,
      title: t('collectionForms.' + ['submittedAt', 'readStatus', 'processStatus', 'actions'][i]),
    })),
  );
  const headerActions = computed(() => [
    ...(form.value?.published ? [{ key: 'copy', label: t('collectionForms.copyLink'), icon: icon.toolbox.copy }] : []),
    { key: 'preview', label: t('collectionForms.fullPreview'), icon: icon.ai.maximize },
    { key: 'settings', label: t('collectionForms.settings'), icon: icon.userCenter.menu.settings },
    { key: 'manage-divider', divider: true },
    ...(dirty.value ? [{ key: 'save-first', label: t('collectionForms.saveBeforeManage'), disabled: true }] : []),
    ...(form.value?.status === 'draft'
      ? [
          {
            key: 'publish',
            label: t('collectionForms.publish'),
            icon: icon.ai.play,
            disabled: busy.value || dirty.value,
          },
        ]
      : []),
    ...(form.value?.status === 'collecting'
      ? [{ key: 'pause', label: t('collectionForms.pause'), icon: icon.ai.pause, disabled: busy.value || dirty.value }]
      : []),
    ...(form.value?.status === 'paused'
      ? [{ key: 'resume', label: t('collectionForms.resume'), icon: icon.ai.play, disabled: busy.value || dirty.value }]
      : []),
    ...(form.value && ['collecting', 'paused'].includes(form.value.status)
      ? [{ key: 'end', label: t('collectionForms.end'), icon: icon.toolbox.task, disabled: busy.value || dirty.value }]
      : []),
    {
      key: 'duplicate',
      label: t('collectionForms.duplicate'),
      icon: icon.toolbox.copy,
      disabled: busy.value || dirty.value,
    },
    { key: 'delete-divider', divider: true },
    {
      key: 'delete',
      label: t(form.value?.status === 'collecting' ? 'collectionForms.deleteAfterPause' : 'collectionForms.deleteForm'),
      icon: icon.toolbox.delete,
      danger: true,
      disabled: busy.value || dirty.value || form.value?.status === 'collecting',
    },
  ]);
  const responseActions = computed(() => [
    {
      key: 'batch',
      label: t('common.batchActions'),
      icon: icon.common.batchSelect,
      disabled: busy.value || responsesLoading.value || !!responseError.value || !responses.value.length,
    },
    {
      key: 'read',
      label: t('collectionForms.readAll'),
      icon: icon.toolbox.audit,
      disabled: busy.value || responsesLoading.value || !!responseError.value || !watermark.value || !total.value,
    },
    {
      key: 'export',
      label: t('collectionForms.export'),
      icon: icon.toolbox.download,
      disabled: busy.value || responsesLoading.value || !!responseError.value || !total.value,
    },
  ]);
  function headerAction(key: string) {
    if (key === 'copy') void copyLink();
    else if (key === 'preview') preview.value = true;
    else if (key === 'settings') metadataOpen.value = true;
    else if (!busy.value && !dirty.value) {
      if (key === 'pause' || key === 'resume') void act(key);
      else if (key === 'duplicate') void act('copy');
      else if (['publish', 'end', 'delete'].includes(key)) confirmAction(key);
    }
  }
  function responseAction(key: string) {
    if (key === 'batch') batchMode.value = true;
    else if (key === 'read') void markAll();
    else exportCsv();
  }
  function setDateRange(value: string | number) {
    if (value === 'custom') {
      draftFrom.value = from.value;
      draftTo.value = to.value;
      dateOpen.value = true;
      return;
    }
    dateRange.value = String(value);
    if (value === 'all') {
      from.value = '';
      to.value = '';
    } else range(Number(value));
  }
  function applyDates() {
    if (!draftFrom.value || !draftTo.value || draftFrom.value > draftTo.value) return;
    from.value = draftFrom.value;
    to.value = draftTo.value;
    dateRange.value = 'custom';
    dateOpen.value = false;
  }
  function clearResponseFilters() {
    responseState.value = 'all';
    setDateRange('all');
  }
  const createOpen = ref(false),
    preview = ref(false),
    responseOpen = ref(false),
    activeResponse = ref<Submission>(),
    privateNote = ref(''),
    template = ref('blank'),
    newTitle = ref('');
  const directoryRef = ref<HTMLElement | null>(null),
    detailRef = ref<HTMLElement | null>(null);
  useDensityScrollAnchor(directoryRef);
  useDensityScrollAnchor(detailRef);
  useMobileTopBar(['collectionForms'], {
    ownTopBar: true,
    title: () => t('collectionForms.title'),
    onBack: () => (formId.value ? navigate('') : void router.push('/toolbox')),
  });
  let detailGeneration = 0,
    listGeneration = 0,
    responseGeneration = 0,
    poll: ReturnType<typeof setInterval>,
    debounce: ReturnType<typeof setTimeout>;
  let listController: AbortController | undefined,
    detailController: AbortController | undefined,
    responseController: AbortController | undefined;
  const watermark = ref('');
  const snapshot = () => JSON.stringify({ definition: definition.value, tagIds: tagIds.value });
  const dirty = computed(() => !!form.value && form.value.id === formId.value && saved.value !== snapshot());
  const date = (v: string) =>
    new Date(v).toLocaleString(locale.value, {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  async function loadList() {
    const g = ++listGeneration;
    listController?.abort();
    listController = new AbortController();
    listLoading.value = true;
    listError.value = '';
    try {
      const data = await formsApi<CollectionForm[]>(
        '',
        'GET',
        {
          search: search.value,
          status: status.value,
          tagId: route.query.tagId,
        },
        listController.signal,
      );
      if (g === listGeneration) forms.value = data;
    } catch (e) {
      if (g === listGeneration) listError.value = (e as Error).message;
    } finally {
      if (g === listGeneration) listLoading.value = false;
    }
  }
  async function loadDetail(clear = false) {
    const g = ++detailGeneration;
    detailController?.abort();
    responseController?.abort();
    detailController = new AbortController();
    responseGeneration++;
    if (clear || !formId.value) {
      form.value = undefined;
      definition.value = undefined;
    }
    responseError.value = '';
    batchMode.value = false;
    dateOpen.value = false;
    responseOpen.value = false;
    metadataOpen.value = false;
    mobilePreview.value = false;
    activeResponse.value = undefined;
    privateNote.value = '';
    createOpen.value = false;
    newTitle.value = '';
    total.value = 0;
    watermark.value = '';
    preview.value = false;
    selected.value = [];
    responses.value = [];
    notice.value = '';
    error.value = '';
    busy.value = false;
    if (!formId.value) {
      loading.value = false;
      return;
    }
    loading.value = true;
    try {
      const data = await formsApi<CollectionForm>(`/${formId.value}`, 'GET', undefined, detailController.signal);
      if (g !== detailGeneration) return;
      form.value = data;
      definition.value = JSON.parse(
        JSON.stringify({ ...data.definition, submissionPolicy: data.definition.submissionPolicy ?? 'multiple' }),
      );
      tagIds.value = [...data.tagIds];
      saved.value = snapshot();
      tab.value = data.status === 'draft' ? 'settings' : 'responses';
      page.value = 1;
      watermark.value = '';
      void loadResponses();
    } catch (e) {
      if (g === detailGeneration) error.value = (e as Error).message;
    } finally {
      if (g === detailGeneration) loading.value = false;
    }
  }
  async function loadResponses() {
    if (!form.value) return;
    responseController?.abort();
    responseController = new AbortController();
    const g = ++responseGeneration,
      id = formId.value;
    responseError.value = '';
    responsesLoading.value = true;
    selected.value = [];
    try {
      const data = await formsApi(
        `/${id}/responses`,
        'GET',
        {
          page: page.value,
          state: responseState.value,
          from: from.value,
          to: to.value,
        },
        responseController.signal,
      );
      if (g !== responseGeneration || id !== formId.value) return;
      responses.value = data.items;
      total.value = data.total;
      watermark.value = data.watermark || '';
    } catch (e) {
      if (g === responseGeneration) responseError.value = (e as Error).message;
    } finally {
      if (g === responseGeneration) responsesLoading.value = false;
    }
  }
  async function run(work: () => Promise<void>) {
    if (busy.value) return;
    const g = detailGeneration;
    busy.value = true;
    error.value = '';
    try {
      await work();
    } catch (e) {
      if (g === detailGeneration) error.value = (e as Error).message;
    } finally {
      if (g === detailGeneration) busy.value = false;
    }
  }
  async function save() {
    const id = formId.value,
      generation = detailGeneration;
    await run(async () => {
      const checked = validateDefinition(definition.value),
        sentTags = [...tagIds.value];
      const sentSnapshot = JSON.stringify({ definition: definition.value, tagIds: sentTags });
      const result = await formsApi<{ version: number }>(`/${id}`, 'PATCH', {
        version: form.value!.version,
        definition: checked,
        tagIds: sentTags,
      });
      if (id !== formId.value || generation !== detailGeneration) return;
      form.value!.version = result.version;
      form.value!.title = checked.title;
      form.value!.definition = checked;
      form.value!.tagIds = sentTags;
      saved.value = sentSnapshot;
      await loadList();
    });
  }
  async function act(action: string) {
    const id = formId.value,
      generation = detailGeneration;
    await run(async () => {
      const data = await formsApi(`/${id}/actions`, 'POST', { action, version: form.value!.version });
      if (id !== formId.value || generation !== detailGeneration) return;
      if (action === 'delete') {
        saved.value = snapshot();
        await router.push('/toolbox/forms');
      } else if (action === 'copy') {
        await router.push(`/toolbox/forms/${data.id}`);
      } else {
        // Lifecycle changes do not remount the editor or reset the current tab/scroll position.
        form.value = { ...form.value!, status: data.status, version: form.value!.version + 1, published: 1 };
        BMessage.success(t('collectionForms.statusUpdated'));
      }
      await loadList();
    });
  }
  function confirmAction(action: string) {
    const generation = detailGeneration;
    Alert.alert({
      mobilePlacement: action === 'publish' ? 'bottom' : 'center',
      cancelText: action === 'publish' ? t('collectionForms.returnEdit') : t('common.cancel'),
      title:
        action === 'publish'
          ? t('collectionForms.publishTitle')
          : action === 'delete'
            ? t('collectionForms.deleteTitle')
            : t('collectionForms.endTitle'),
      content:
        action === 'publish'
          ? t('collectionForms.publishWarning')
          : action === 'delete'
            ? t('collectionForms.deleteWarning')
            : t('collectionForms.endWarning'),
      okText:
        action === 'publish'
          ? t('collectionForms.confirmPublish')
          : action === 'delete'
            ? t('collectionForms.deleteForever')
            : t('collectionForms.end'),
      onOk: () => {
        if (generation === detailGeneration) void act(action);
      },
    });
  }
  function question(type: FormQuestion['type'], title: string): FormQuestion {
    return { id: crypto.randomUUID(), type, title, required: true, options: [] };
  }
  async function create() {
    const generation = detailGeneration;
    await run(async () => {
      const questions: FormQuestion[] = [];
      if (template.value === 'feedback') {
        questions.push(
          question('rating', t('collectionForms.templateRating')),
          question('long', t('collectionForms.templateFeedback')),
        );
      }
      if (template.value === 'questions') questions.push(question('long', t('collectionForms.templateQuestion')));
      if (template.value === 'poll') {
        const q = question('single', t('collectionForms.templatePoll'));
        q.options = [
          { id: crypto.randomUUID(), label: t('collectionForms.option1') },
          { id: crypto.randomUUID(), label: t('collectionForms.option2') },
        ];
        questions.push(q);
      }
      const data = await formsApi('', 'POST', {
        definition: {
          submissionPolicy: template.value === 'poll' ? 'replace' : 'multiple',
          title: newTitle.value,
          description: '',
          successMessage: t('collectionForms.thanks'),
          questions,
        },
        tagIds: [],
      });
      if (generation !== detailGeneration) return;
      const targetId = String(data.id);
      newTitle.value = '';
      await closeCurrentMobileOverlayThen(
        () => {
          createOpen.value = false;
        },
        () => router.push(`/toolbox/forms/${targetId}`),
      );
      await loadList();
    });
  }
  function navigate(id: string) {
    void router.push({ path: id ? `/toolbox/forms/${id}` : '/toolbox/forms', query: route.query });
  }
  function select(id: string, checked: boolean) {
    selected.value = checked ? [...selected.value, id] : selected.value.filter((v) => v !== id);
  }
  async function openResponse(r: Submission) {
    if (busy.value) return;
    activeResponse.value = { ...r };
    privateNote.value = r.private_note || '';
    responseOpen.value = true;
    if (!r.is_read) await mark('read', [r.id]);
  }
  async function mark(action: string, ids: string[], note?: string) {
    const id = formId.value,
      generation = detailGeneration;
    await run(async () => {
      await formsApi(`/${id}/responses/actions`, 'POST', { action, ids, note });
      if (id !== formId.value || generation !== detailGeneration) return;
      const field = (
        {
          read: 'is_read',
          unread: 'is_read',
          processed: 'processed',
          pending: 'processed',
          spam: 'spam',
          restore: 'spam',
          note: 'private_note',
        } as const
      )[action as 'read'];
      if (activeResponse.value && ids.includes(activeResponse.value.id) && field)
        Object.assign(activeResponse.value, {
          [field]: action === 'note' ? note : ['pending', 'restore', 'unread'].includes(action) ? 0 : 1,
        });
      await Promise.all([loadResponses(), loadList()]);
    });
  }
  async function markAll() {
    if (!watermark.value || responsesLoading.value) return;
    const id = formId.value,
      generation = detailGeneration;
    await run(async () => {
      await formsApi(`/${id}/responses/actions`, 'POST', { action: 'readAll', before: watermark.value });
      if (id === formId.value && generation === detailGeneration) await Promise.all([loadResponses(), loadList()]);
    });
  }
  function answerLabel(q: FormQuestion, value: unknown) {
    if (value == null) return t('collectionForms.unanswered');
    if (q.type === 'single') return q.options.find((o) => o.id === value)?.label || '—';
    if (Array.isArray(value)) return value.map((v) => q.options.find((o) => o.id === v)?.label || v).join('、');
    return String(value);
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/f/${form.value!.public_id}`);
      BMessage.success(t('collectionForms.linkCopied'));
    } catch {
      notice.value = t('collectionForms.formLink', { url: `${location.origin}/f/${form.value!.public_id}` });
    }
  }
  function range(days: number) {
    const end = new Date(),
      start = new Date(Date.now() - (days - 1) * 86400000);
    const local = (d: Date) => new Date(+d + 8 * 3600000).toISOString().slice(0, 10);
    from.value = local(start);
    to.value = local(end);
  }
  function exportCsv() {
    const query = new URLSearchParams({ state: responseState.value, from: from.value, to: to.value });
    const a = document.createElement('a');
    a.href = `/api/toolbox/forms/${formId.value}/export?${query}`;
    a.download = 'collection.csv';
    a.click();
  }
  async function reloadCurrent() {
    if (await leave()) {
      void loadDetail();
      void loadTags();
      void loadList();
    }
  }
  function leave() {
    if (!dirty.value) return true;
    return new Promise<boolean>((resolve) =>
      Alert.alert({
        title: t('collectionForms.leaveTitle'),
        content: t('collectionForms.leaveWarning'),
        okText: t('collectionForms.discard'),
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      }),
    );
  }
  const beforeUnload = (e: BeforeUnloadEvent) => {
    if (dirty.value) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  async function loadTags() {
    const g = detailGeneration;
    try {
      const result = await formsApi<{ id: string; name: string }[]>('/tags');
      if (g === detailGeneration) tags.value = result;
    } catch (e) {
      if (g === detailGeneration) error.value = (e as Error).message;
    }
  }
  onBeforeRouteLeave(leave);
  onBeforeRouteUpdate((to, fromRoute) => (to.params.formId !== fromRoute.params.formId ? leave() : true));
  watch(
    [() => user.id, () => user.adminContext],
    () => {
      forms.value = [];
      tags.value = [];
      listGeneration++;
      void loadDetail(true);
      void loadList();
      void loadTags();
    },
    { immediate: true },
  );
  watch(formId, () => {
    void loadDetail();
  });
  watch([search, status, () => route.query.tagId], () => {
    clearTimeout(debounce);
    debounce = setTimeout(loadList, 250);
  });
  watch([responseState, from, to], () => {
    page.value = 1;
    void loadResponses();
  });
  watch(page, loadResponses);
  onMounted(() => {
    poll = setInterval(() => {
      if (document.visibilityState === 'visible' && !listLoading.value) void loadList();
    }, 30000);
    window.addEventListener('beforeunload', beforeUnload);
  });
  onBeforeUnmount(() => {
    detailGeneration++;
    listController?.abort();
    detailController?.abort();
    responseController?.abort();
    listGeneration++;
    responseGeneration++;
    clearInterval(poll);
    clearTimeout(debounce);
    window.removeEventListener('beforeunload', beforeUnload);
  });
</script>

<style scoped>
  .collection-workspace {
    display: grid;
    grid-template-columns: var(--ui-layout-280, 280px) minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    color: var(--workspace-text);
  }
  .collection-directory {
    overflow: auto;
    padding: var(--ui-space-16, 16px);
    border-right: 1px solid var(--workspace-border);
  }
  .collection-detail {
    overflow: auto;
    padding: var(--ui-space-24, 24px);
    min-width: 0;
  }
  .collection-directory .collection-entry {
    width: 100%;
    height: auto;
    text-align: left;
    padding: var(--ui-space-12, 12px);
    justify-content: space-between;
    white-space: normal;
    overflow-wrap: anywhere;
  }
  .collection-entry.is-active {
    border-color: var(--workspace-purple-text);
    color: var(--workspace-purple-text);
  }
  .collection-entry-title {
    flex: 1;
    min-width: 0;
  }
  .collection-table {
    width: 100%;
    border-collapse: collapse;
  }
  .collection-table th,
  .collection-table td {
    text-align: left;
    padding: var(--ui-space-8, 8px);
    border-bottom: 1px solid var(--workspace-border);
    overflow-wrap: anywhere;
  }
  .collection-bar {
    background: var(--workspace-purple-text);
    height: var(--ui-space-8, 8px);
    border-radius: var(--ui-space-4, 4px);
  }
  @media (max-width: 767px) {
    .collection-workspace {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: var(--ui-layout-56, 56px) minmax(0, 1fr);
    }
    .collection-workspace.has-form .collection-directory {
      display: none;
    }
    .collection-workspace:not(.has-form) .collection-detail {
      display: none;
    }
    .collection-directory,
    .collection-detail {
      height: 100%;
      padding: var(--ui-space-16, 16px);
    }
  }

  .collection-workspace,
  .collection-directory,
  .collection-detail {
    box-sizing: border-box;
  }
  .collection-workspace {
    width: 100%;
    background: var(--workspace-content);
  }
  .collection-response {
    padding: var(--ui-space-12, 12px);
  }
  .collection-response .collection-entry-title {
    justify-content: flex-start;
    height: auto;
    white-space: normal;
    text-align: left;
  }
  .collection-detail :deep(h1) {
    font-size: var(--ui-font-24, 24px);
    line-height: 1.4;
    margin: 0 0 var(--ui-space-8, 8px);
    overflow-wrap: anywhere;
  }
  .collection-directory h2 {
    font-size: var(--ui-font-18, 18px);
    margin: 0;
  }
  @media (max-width: 768px) {
    .collection-detail > div.collection-row {
      align-items: flex-start;
      flex-direction: column;
    }
  }
  .collection-response .collection-entry-title {
    color: var(--workspace-text);
  }
  .collection-detail {
    background: var(--workspace-canvas);
  }
  .collection-directory {
    background: var(--workspace-open-canvas);
    gap: var(--ui-space-20, 20px);
  }
  .collection-directory-back.b_btn {
    justify-content: flex-start;
    color: var(--workspace-muted);
    background: transparent;
  }
  .collection-entry.is-active {
    background: var(--workspace-hover);
    box-shadow: inset 3px 0 var(--workspace-purple-text);
  }
  .collection-entry small {
    color: var(--workspace-muted);
    display: inline-block;
    margin-top: var(--ui-space-8, 8px);
  }
  .collection-editor-header {
    position: sticky;
    top: calc(-1 * var(--ui-space-24, 24px));
    z-index: 2;
    background: var(--workspace-canvas);
    padding: var(--ui-space-16, 16px) 0;
  }
  .collection-editor-header > div:first-child {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    min-width: 0;
  }
  .collection-editor-header h1 {
    font-size: var(--ui-font-20, 20px);
    margin: 0;
  }
  .collection-status {
    flex: none;
    color: var(--workspace-muted);
    background: var(--workspace-hover);
    border-radius: var(--ui-space-4, 4px);
    padding: var(--ui-space-4, 4px) var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
  }
  .collection-editor-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--ui-layout-280, 280px);
    gap: var(--ui-space-24, 24px);
    align-items: start;
    width: 100%;
    max-width: var(--ui-layout-1200, 1200px);
    margin: 0 auto;
  }
  .collection-paper {
    min-width: 0;
  }
  .collection-intro h2 {
    margin: 0;
    font-size: var(--ui-font-20, 20px);
    overflow-wrap: anywhere;
  }
  .collection-intro p {
    margin: var(--ui-space-8, 8px) 0 0;
  }
  .collection-intro > div {
    min-width: 0;
  }
  .collection-intro > .b_btn {
    flex: none;
  }
  .collection-create-body label {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-14, 14px);
  }
  .collection-publish-card h3 {
    margin: 0;
    font-size: var(--ui-font-16, 16px);
  }
  .collection-publish-card p {
    margin: 0;
    line-height: 1.7;
  }
  .collection-more > .b_btn {
    justify-content: space-between;
  }
  .collection-template-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-12, 12px);
  }
  .collection-template.b_btn {
    position: relative;
    height: auto;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-20, 20px);
    white-space: normal;
    text-align: left;
    background: var(--workspace-content);
    border: 1px solid var(--workspace-border);
    border-radius: var(--ui-space-12, 12px);
    color: var(--workspace-text);
  }
  .collection-template .svg-icon {
    color: var(--workspace-purple-text);
  }
  .collection-template small {
    font-size: var(--ui-font-12, 12px);
    color: var(--workspace-muted);
    line-height: 1.6;
  }
  .collection-template.is-selected {
    border-color: var(--workspace-purple-text);
    background: var(--workspace-hover);
  }
  .collection-template-check {
    position: absolute;
    right: var(--ui-space-12, 12px);
    top: var(--ui-space-12, 12px);
    color: var(--workspace-purple-text);
  }
  .collection-create-body p {
    margin: 0;
  }
  .collection-dialog-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
    border-top: 1px solid var(--workspace-divider);
    padding: var(--ui-space-20, 20px) var(--ui-space-24, 24px);
  }
  .collection-dialog-footer p {
    margin: 0;
  }
  /* BModal teleports its internal shell; keep overrides bounded by this form's modal class. */
  :global(.collection-create-modal .modal-content) {
    padding: var(--ui-space-24, 24px);
  }
  .collection-mobile-settings.b_btn,
  .collection-mobile-save {
    display: none;
  }
  @media (max-width: 1100px) and (min-width: 769px) {
    .collection-editor-layout {
      grid-template-columns: minmax(0, 1fr);
    }
    .collection-settings-rail {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .collection-editor-header {
      flex-wrap: wrap;
    }
  }
  @media (max-width: 768px) {
    .collection-editor-layout {
      display: flex;
      flex-direction: column;
      gap: var(--ui-space-16, 16px);
    }
    .collection-paper,
    .collection-settings-rail {
      width: 100%;
    }
    .collection-mobile-settings.b_btn {
      display: flex;
      justify-content: space-between;
      background: var(--workspace-content);
      border: 1px solid var(--workspace-border);
    }
    .collection-mobile-save {
      position: sticky;
      bottom: calc(-1 * var(--ui-space-16, 16px));
      z-index: 3;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ui-space-8, 8px);
      padding: var(--ui-space-12, 12px) 0 calc(var(--ui-space-12, 12px) + env(safe-area-inset-bottom, 0px));
      background: var(--workspace-content);
      border-top: 1px solid var(--workspace-border);
      margin-top: auto;
    }
    .collection-mobile-save > span {
      flex: 1;
    }
    .collection-dialog-footer {
      flex-direction: column;
      padding: var(--ui-space-16, 16px) var(--ui-space-16, 16px)
        calc(var(--ui-space-16, 16px) + env(safe-area-inset-bottom, 0px));
    }
    .collection-dialog-footer > .b_btn,
    .collection-dialog-footer .collection-toolbar {
      width: 100%;
    }
    .collection-dialog-footer .collection-toolbar .b_btn {
      flex: 1;
    }
    .collection-template.b_btn {
      padding: var(--ui-space-16, 16px);
    }
    :global(.collection-create-modal .modal-content) {
      padding: var(--ui-space-16, 16px);
    }
    :global(.collection-metadata-modal .modal-content) {
      padding: var(--ui-space-16, 16px);
      background: var(--workspace-canvas);
    }
    .collection-intro h2 {
      font-size: var(--ui-font-16, 16px);
    }
  }
  .collection-mobile-settings.b_btn {
    width: 100%;
  }
  @media (max-width: 768px) {
    .collection-publish-card.is-draft {
      display: none;
    }
  }
  .collection-template.b_btn {
    width: 100%;
  }
  .collection-template > :first-child {
    color: var(--workspace-purple-text);
  }
  @media (max-width: 768px) {
    .collection-create-body,
    :global(.collection-metadata-modal .collection-metadata) {
      padding: var(--ui-space-16, 16px);
      box-sizing: border-box;
    }
  }
  .collection-directory {
    gap: var(--ui-space-16, 16px);
  }
  .collection-directory > p {
    margin: 0;
  }
  .collection-directory-back.b_btn {
    padding-inline: 0;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-12, 12px);
    text-decoration: none;
  }
  .collection-workspace .collection-directory-back.b_btn:hover,
  .collection-workspace .collection-directory-back.b_btn:focus-visible {
    background: transparent;
    color: var(--workspace-purple-text);
    text-decoration: none;
  }
  .collection-directory .collection-entry {
    padding: var(--ui-space-12, 12px);
  }
  .collection-editor-header {
    padding-block: var(--ui-space-8, 8px);
  }
  .collection-paper .collection-intro {
    padding: var(--ui-space-16, 16px);
  }
  @media (max-width: 768px) {
    .collection-more {
      padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    }
  }
  .collection-directory .collection-entry {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--ui-space-8, 8px);
    line-height: 1.45;
    background: transparent;
    color: var(--workspace-text);
  }
  .collection-directory .collection-entry.is-active {
    background: var(--workspace-hover);
  }
  .collection-entry-heading,
  .collection-entry-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-8, 8px);
  }
  .collection-entry-heading .collection-entry-title {
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .collection-entry-meta small {
    margin: 0;
    font-size: var(--ui-font-12, 12px);
  }
  .collection-entry-meta strong {
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-12, 12px);
    font-weight: 500;
  }
  .collection-status {
    line-height: 1.4;
  }
  .collection-entry .collection-status.is-collecting {
    color: var(--workspace-purple-text);
  }
  .collection-paper {
    padding: var(--ui-space-16, 16px);
    border: 1px solid var(--workspace-border);
    border-radius: var(--ui-space-8, 8px);
    background: var(--workspace-content);
  }
  .collection-editor-layout {
    grid-template-columns: minmax(0, 1fr) var(--ui-layout-320, 320px);
    gap: var(--ui-space-20, 20px);
  }
  .collection-paper :deep(.collection-card),
  .collection-settings-rail :deep(.collection-card) {
    border-radius: var(--ui-space-8, 8px);
  }
  .collection-publish-card > .b_btn {
    width: 100%;
  }
  @media (min-width: 769px) and (max-width: 1100px) {
    .collection-editor-layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 768px) {
    .collection-paper {
      padding: 0;
      border: 0;
      background: transparent;
    }
  }
  .collection-entry-heading .collection-status {
    background: var(--workspace-border);
  }

  .collection-card.collection-more {
    padding: var(--ui-space-16, 16px);
  }
  .collection-management-actions {
    border-top: 1px solid var(--workspace-divider);
    padding-top: var(--ui-space-4, 4px);
    margin-top: var(--ui-space-4, 4px);
  }
  .collection-management-actions .b_btn {
    width: 100%;
    height: auto;
    min-height: var(--ui-control-40, 40px);
    justify-content: flex-start;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
    line-height: 1.5;
    white-space: normal;
    text-align: left;
    color: var(--workspace-text);
  }
  .collection-management-actions .collection-management-delete {
    color: var(--danger-color);
  }
  .collection-management-actions .b_btn:not(:disabled):hover {
    background: var(--workspace-hover);
  }

  .collection-editor-layout {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  }
  .collection-live-preview {
    position: sticky;
    top: var(--ui-space-64, 64px);
    min-width: 0;
    max-height: calc(100vh - var(--ui-layout-200, 200px));
    overflow: auto;
  }
  .collection-live-preview :deep(h3) {
    margin: 0;
    font-size: var(--ui-font-16, 16px);
  }
  .collection-live-preview > p {
    margin: 0;
  }
  .collection-live-preview :deep(.collection-renderer h1) {
    font-size: var(--ui-font-20, 20px);
  }
  .collection-live-preview :deep(.collection-question) {
    padding: var(--ui-space-12, 12px);
  }
  .collection-preview-switch {
    justify-content: flex-start;
  }
  .collection-preview-switch > .b_btn {
    flex: 1;
  }
  :global(.collection-metadata-modal .collection-publish-card.is-draft) {
    display: flex;
  }
  @media (max-width: 768px) {
    .collection-live-preview {
      position: static;
      max-height: none;
      width: 100%;
    }
    .collection-directory {
      background: var(--workspace-canvas);
      gap: var(--ui-space-12, 12px);
    }
    .collection-directory .collection-entry {
      background: var(--workspace-content);
      border: 1px solid var(--workspace-border);
      border-radius: var(--ui-space-8, 8px);
    }
    .collection-directory > .collection-row {
      padding-block: var(--ui-space-4, 4px);
    }
    .collection-detail-content {
      min-height: 100%;
      gap: var(--ui-space-12, 12px);
    }
    .collection-preview-switch {
      background: var(--workspace-hover);
      padding: var(--ui-space-4, 4px);
      border-radius: var(--ui-space-8, 8px);
      gap: var(--ui-space-4, 4px);
    }
    .collection-preview-switch .b_btn {
      color: var(--workspace-muted);
      text-decoration: none;
    }
    .collection-preview-switch .b_btn.is-active {
      color: var(--workspace-purple-text);
      background: var(--workspace-content);
      box-shadow: inset 0 0 0 1px var(--workspace-border);
    }
    .collection-paper .collection-intro {
      padding: var(--ui-space-12, 12px);
    }
    .collection-mobile-save {
      margin-inline: calc(-1 * var(--ui-space-16, 16px));
      padding-inline: var(--ui-space-16, 16px);
      gap: var(--ui-space-12, 12px);
    }
    .collection-mobile-save > .b_btn {
      flex: 1;
      min-width: 0;
      height: var(--ui-control-40, 40px);
    }
  }
  .collection-records {
    background: var(--workspace-content);
    border: 1px solid var(--workspace-border);
    border-radius: var(--ui-space-12, 12px);
    overflow: hidden;
  }
  .collection-records-toolbar,
  .collection-records-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
    padding: var(--ui-space-16, 16px) var(--ui-space-20, 20px);
  }
  .collection-records-heading,
  .collection-records-filters {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    min-width: 0;
  }
  .collection-records-heading h3 {
    margin: 0;
    font-size: var(--ui-font-14, 14px);
    white-space: nowrap;
  }
  .collection-records-filters {
    gap: var(--ui-space-8, 8px);
  }
  .collection-records-filters .b-select {
    min-width: var(--ui-layout-112, 112px);
  }
  .collection-records-batch {
    padding: var(--ui-space-12, 12px) var(--ui-space-20, 20px);
    border-top: 1px solid var(--workspace-border);
  }
  .collection-records-empty {
    min-height: var(--ui-layout-320, 320px);
    padding: var(--ui-space-32, 32px) var(--ui-space-20, 20px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-12, 12px);
    text-align: center;
    border-top: 1px solid var(--workspace-border);
  }
  .collection-records-empty h3,
  .collection-records-empty p {
    margin: 0;
  }
  .collection-records-empty h3 {
    font-size: var(--ui-font-16, 16px);
  }
  .collection-empty-icon {
    display: grid;
    place-items: center;
    width: var(--ui-control-64, 64px);
    height: var(--ui-control-64, 64px);
    border-radius: var(--ui-space-16, 16px);
    background: var(--workspace-hover);
    color: var(--workspace-purple-text);
    margin-bottom: var(--ui-space-8, 8px);
  }
  .collection-records :deep(.table-container) {
    padding: 0;
    gap: 0;
    box-shadow: none;
    background: var(--workspace-content);
    border: 0;
    border-radius: 0;
  }
  .collection-records :deep(.table-header) {
    background: var(--workspace-canvas);
    border-top: 1px solid var(--workspace-border);
  }
  .collection-records :deep(.table-cell) {
    min-height: var(--ui-control-52, 52px);
    font-size: var(--ui-font-13, 13px);
  }
  .collection-records-pagination {
    border-top: 1px solid var(--workspace-border);
  }
  .collection-records :deep(.collection-read-state) {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
    white-space: nowrap;
  }
  .collection-records :deep(.collection-read-state::before) {
    content: '';
    width: var(--ui-space-6, 6px);
    height: var(--ui-space-6, 6px);
    border-radius: 50%;
    background: currentColor;
  }
  .collection-records :deep(.collection-read-state.is-unread) {
    color: var(--workspace-purple-text);
  }
  .collection-records :deep(.collection-processing-state) {
    display: inline-flex;
    padding: var(--ui-space-4, 4px) var(--ui-space-8, 8px);
    border-radius: var(--ui-space-6, 6px);
    font-size: var(--ui-font-12, 12px);
    background: var(--workspace-hover);
    color: var(--workspace-muted);
  }
  .collection-records :deep(.collection-processing-state.is-done) {
    color: var(--success-color);
  }
  .collection-records :deep(.collection-processing-state.is-spam) {
    color: var(--danger-color);
  }
  .collection-page-number {
    padding: var(--ui-space-4, 4px) var(--ui-space-10, 10px);
    border-radius: var(--ui-space-6, 6px);
    background: var(--workspace-purple-text);
    color: var(--workspace-content);
  }
  .collection-notice {
    overflow-wrap: anywhere;
    font-size: var(--ui-font-12, 12px);
  }
  .collection-editor-header .collection-status.is-collecting {
    color: var(--success-color);
  }
  .collection-editor-header .collection-status.is-collecting::before {
    content: '•';
    margin-right: var(--ui-space-4, 4px);
  }
  @media (max-width: 767px) {
    .collection-records {
      overflow: visible;
      background: transparent;
      border: 0;
      display: flex;
      flex-direction: column;
    }
    .collection-records-toolbar {
      display: contents;
    }
    .collection-records-filters {
      order: -1;
      margin-bottom: var(--ui-space-16, 16px);
      width: 100%;
    }
    .collection-records-filters .b-select {
      min-width: 0;
      flex: 1;
    }
    .collection-records-heading {
      padding: var(--ui-space-16, 16px);
      background: var(--workspace-content);
      border: 1px solid var(--workspace-border);
      border-radius: var(--ui-space-8, 8px) var(--ui-space-8, 8px) 0 0;
    }
    .collection-records-empty {
      border: 1px solid var(--workspace-border);
      border-top: 0;
      border-radius: 0 0 var(--ui-space-8, 8px) var(--ui-space-8, 8px);
      background: var(--workspace-content);
      min-height: var(--ui-layout-360, 360px);
    }
    .collection-record-cards {
      display: flex;
      flex-direction: column;
      gap: var(--ui-space-10, 10px);
    }
    .collection-record-card {
      display: flex;
      align-items: center;
      gap: var(--ui-space-8, 8px);
      padding: var(--ui-space-16, 16px);
      border: 1px solid var(--workspace-border);
      border-radius: var(--ui-space-8, 8px);
      background: var(--workspace-content);
    }
    .collection-record-card:first-child {
      border-top: 0;
      border-top-left-radius: 0;
      border-top-right-radius: 0;
    }
    .collection-record-open.b_btn {
      width: 100%;
      min-width: 0;
      height: auto;
      padding: 0;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: var(--ui-space-12, 12px);
      color: var(--workspace-text);
      text-align: left;
      font-size: var(--ui-font-13, 13px);
    }
    .collection-record-open .collection-row {
      width: 100%;
    }
    .collection-records-pagination {
      padding: var(--ui-space-12, 12px) 0;
      border: 0;
    }
  }

  .collection-records :deep(.table-row-window) {
    gap: 0;
  }
  .collection-records :deep(.table-row) {
    border-radius: 0;
    border-bottom: 1px solid var(--workspace-border);
  }
  .collection-records :deep(.table-row:last-child) {
    border-bottom: 0;
  }
  .collection-records :deep(.table-header) {
    border-radius: 0;
  }
  .collection-record-open.b_btn {
    line-height: 1.5;
  }
  .collection-records :deep(.collection-processing-state) {
    line-height: 1.5;
  }

  .collection-records-error {
    padding: var(--ui-space-16, 16px) var(--ui-space-20, 20px);
    color: var(--danger-color);
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
  }
  .collection-records-error h3 {
    margin: 0;
    font-size: var(--ui-font-13, 13px);
    font-weight: normal;
  }

  .collection-mobile-header {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    width: 100%;
    height: var(--ui-layout-56, 56px);
    padding: 0 var(--ui-space-8, 8px) 0 var(--ui-space-12, 12px);
    box-sizing: border-box;
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--surface-page-bg, var(--background-color));
    color: var(--text-color);
  }
  .collection-mobile-header h1 {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--ui-font-18, 18px);
    font-weight: 720;
    line-height: 1.2;
  }
  .collection-mobile-header .collection-mobile-header__back,
  .collection-mobile-header .collection-mobile-header__more {
    flex: none;
    width: var(--ui-layout-44, 44px);
    min-width: var(--ui-layout-44, 44px);
    height: var(--ui-layout-44, 44px);
    padding: 0;
    border-radius: 11px;
    background: transparent;
    color: var(--text-color);
  }
  .collection-mobile-status {
    align-self: flex-start;
  }
  .collection-mobile-status.is-collecting {
    color: var(--success-color);
  }
  .collection-mobile-status::before {
    content: '•';
    margin-right: var(--ui-space-4, 4px);
  }
  .collection-stat-controls h3 {
    margin: 0;
    font-size: var(--ui-font-14, 14px);
  }
  .collection-stat-controls {
    flex-wrap: wrap;
  }
  @media (max-width: 767px) {
    .collection-stat-controls {
      gap: var(--ui-space-8, 8px);
    }
    .collection-stat-controls .collection-toolbar {
      gap: var(--ui-space-4, 4px);
    }
    .collection-stat-controls .b_btn {
      padding-inline: var(--ui-space-6, 6px);
      font-size: var(--ui-font-12, 12px);
    }
  }
</style>
