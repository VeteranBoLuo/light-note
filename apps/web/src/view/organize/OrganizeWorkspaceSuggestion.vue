<template>
  <section
    class="workspace-suggestion"
    :class="{ 'is-manual': manual, 'is-editing': editing }"
    :data-status="suggestion.status"
  >
    <div class="suggestion-copy">
      <div class="suggestion-heading"
        ><SvgIcon
          class="suggestion-kind-icon"
          :src="
            suggestion.kind === 'archive'
              ? icon.resource.bookmark
              : suggestion.kind === 'tags'
                ? icon.resource.tag
                : suggestion.kind === 'title'
                  ? icon.resource.note
                  : icon.organize.priority
          "
          size="15"
        /><strong>{{
          manual
            ? t(`organizeWorkspace.manualHeading.${suggestion.kind}`)
            : t(`organizeWorkspace.checks.${suggestion.kind}`)
        }}</strong
        ><BChip
          v-if="!manual"
          :tone="
            suggestion.status === 'pending'
              ? 'pending'
              : ['failed', 'conflict'].includes(suggestion.status)
                ? 'danger'
                : 'neutral'
          "
          >{{
            suggestion.kind === 'archive' && suggestion.status === 'pending'
              ? t(suggestion.archivePreview ? 'organizeWorkspace.archiveReady' : 'organizeWorkspace.archiveLegacy')
              : suggestion.kind === 'archive' && ['applied', 'no_suggestion'].includes(suggestion.status)
                ? t(
                    suggestion.status === 'no_suggestion' ||
                      ['already_saved', 'saved'].includes(String(suggestion.applied))
                      ? 'organizeWorkspace.archiveAlreadySaved'
                      : 'organizeWorkspace.archiveQueued',
                  )
                : suggestion.kind === 'archive' && suggestion.status === 'failed'
                  ? t('organizeWorkspace.archiveFailed')
                  : t(`organizeWorkspace.status.${suggestion.status}`)
          }}</BChip
        ></div
      >
      <div v-if="suggestion.kind === 'title' && suggestion.after" class="suggestion-change"
        ><span>{{ suggestion.before || t('organizeWorkspace.unnamed') }}</span
        ><span aria-hidden="true">→</span><strong>{{ suggestion.after }}</strong></div
      >
      <div
        v-if="suggestion.kind === 'tags' && Array.isArray(suggestion.after) && suggestion.after.length"
        class="suggestion-change"
        ><template v-if="beforeTags.length"
          ><ResourceTagChip v-for="tag in beforeTags" :key="tag.name" :tag="{ ...tag, id: tag.id || tag.name }"
        /></template>
        <span v-else>{{ t('organizeWorkspace.noTags') }}</span>
        <span>{{ beforeTags.length ? t('organizeWizard.appendTags') : '→' }}</span
        ><span v-for="tag in suggestion.after" :key="tag.name" class="suggested-tag">
          <ResourceTagChip :tag="{ ...tag, id: tag.id || tag.name }">
            <template #suffix>
              <span
                v-if="suggestion.status === 'pending' && suggestedTagSource(tag) === 'new'"
                class="suggested-tag-source"
                :title="t('organizeFile.tagSourceHint.new')"
                ><span class="suggested-tag-dot">·</span> <span>{{ t('organizeFile.tagSource.new') }}</span></span
              >
            </template>
          </ResourceTagChip>
        </span></div
      >
      <p>{{
        suggestion.kind === 'archive' && suggestion.status === 'pending'
          ? t(suggestion.archivePreview ? 'organizeWorkspace.archiveReadyHint' : 'organizeWorkspace.archiveLegacyHint')
          : suggestion.kind === 'archive' && suggestion.status === 'applied'
            ? t(
                ['already_saved', 'saved'].includes(String(suggestion.applied))
                  ? 'organizeWorkspace.archiveSavedHint'
                  : 'organizeWorkspace.archiveAppliedHint',
              )
            : suggestion.reading && !suggestion.reading.complete
              ? t(fileReadingReasonKey(suggestion.reading.reasonCode))
              : suggestion.reading &&
                  suggestion.reasonCode &&
                  ['suggested', 'filtered', 'no_suggestion', 'no_evidence', 'already_associated'].includes(
                    suggestion.reasonCode,
                  )
                ? t(`organizeFile.outcomes.${suggestion.reasonCode}`)
                : suggestion.reason
      }}</p>
      <p
        v-if="suggestion.kind === 'archive' && suggestion.status === 'pending' && suggestion.archivePreview?.excerpt"
        >{{ suggestion.archivePreview.excerpt }}</p
      >
      <div v-if="suggestion.kind === 'tags' && Array.isArray(suggestion.after)" class="tag-evidence">
        <p v-for="tag in suggestion.after.filter((entry) => entry.evidence)" :key="tag.name">
          <strong>{{ tag.name }}</strong> · {{ t(`organizeFile.evidence.${tag.evidenceType || 'text'}`) }}
          <span v-if="tag.locator"> · {{ tag.locator }}</span
          >：{{ tag.evidence }}
        </p>
      </div>
      <div v-if="suggestion.members" class="comparison" :aria-label="t('organizeWorkspace.compare')">
        <article v-for="member in suggestion.members" :key="member.id"
          ><BButton @click="openMember(member)">{{ member.title || t('organizeWorkspace.unnamed') }}</BButton
          ><small>{{ member.folder || t('organizeWorkspace.root') }} · {{ formatDate(member.modifiedAt) }}</small
          ><small v-if="typeof member.size === 'number'"
            >{{ member.size.toLocaleString() }} B · {{ member.fileType }}</small
          ><p v-if="member.url">{{ member.url }}</p
          ><p>{{ member.excerpt || t('organizeWorkspace.metadataOnly') }}</p
          ><small v-if="member.protected">{{ t('organizeWorkspace.protected') }}</small></article
        >
      </div>
    </div>
    <div v-if="editing" class="suggestion-edit">
      <OrganizeSuggestionTagEditor v-if="suggestion.kind === 'tags'" v-model:tags="tags" :disabled="busy" />
      <div v-else class="title-editor">
        <label :for="`organize-title-${suggestion.id}`">{{ t('organizeWorkspace.checks.title') }}</label>
        <BInput
          :id="`organize-title-${suggestion.id}`"
          v-model:value="title"
          theme="al-day"
          height="40px"
          :maxlength="255"
          :disabled="busy"
        />
      </div>
      <div class="suggestion-actions"
        ><BButton :disabled="busy" @click="editing = false">{{ t('common.cancel') }}</BButton
        ><BButton
          type="primary"
          :loading="busy"
          :disabled="suggestion.kind === 'title' ? !title.trim() : !tags.length"
          @click="apply(suggestion.kind === 'tags' ? tags : title)"
          >{{ t('organizeWorkspace.save') }}</BButton
        ></div
      >
    </div>
    <div
      v-else-if="
        suggestion.kind === 'archive' && ['applied', 'no_suggestion'].includes(suggestion.status) && resourceId
      "
      class="suggestion-actions"
    >
      <BButton @click="emit('preview-archive', resourceId)">{{ t('organizeWorkspace.archivePreview') }}</BButton>
    </div>
    <div v-else-if="canReview" class="suggestion-actions">
      <BButton
        v-if="suggestion.kind === 'archive' && suggestion.archivePreview && resourceId"
        @click="emit('preview-archive', resourceId, suggestion.id)"
        >{{ t('organizeWorkspace.archivePreviewDraft') }}</BButton
      >
      <BButton v-if="isMetadata" class="suggestion-edit-action" :disabled="busy || analyzing" @click="edit">{{
        manual ? t(`organizeWorkspace.manualAction.${suggestion.kind}`) : t('common.edit')
      }}</BButton>
      <BButton
        v-if="suggestion.kind === 'archive' && suggestion.archivePreview && resourceId"
        type="primary"
        :disabled="busy || analyzing"
        @click="apply(null)"
        >{{ t('organizeWorkspace.archiveApply') }}</BButton
      >
      <BButton
        v-if="isMetadata && suggestion.status === 'pending'"
        type="primary"
        :disabled="busy || analyzing"
        @click="apply(suggestion.after)"
        >{{ t('organizeWorkspace.apply') }}</BButton
      >
      <BButton
        v-if="suggestion.action === 'trash'"
        class="trash-action"
        :disabled="busy || analyzing"
        @click="confirmTrash"
        >{{ t('organize.moveToTrash') }}</BButton
      >
      <BButton
        v-if="suggestion.action === 'duplicate_bookmarks'"
        @click="router.push({ path: '/organize', query: { issue: 'duplicate_bookmark' } })"
        >{{ t('organizeWorkspace.resolveDuplicates') }}</BButton
      >
    </div>
    <p v-if="error" class="suggestion-error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
  import { fileReadingReasonKey } from '@/utils/organizeFileReading';
  import { computed, ref, watch } from 'vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import ResourceTagChip from '@/components/tag/ResourceTagChip.vue';
  import OrganizeSuggestionTagEditor from './OrganizeSuggestionTagEditor.vue';
  import { actOnRunSuggestion, type WorkspaceSuggestion, type SuggestionMember } from '@/api/organizeSuggestionApi';
  import type { OrganizeAiSuggestionTag } from '@/api/organizeApi';
  import { generateUUID } from '@/utils/common';
  import { resolveAiSourceNavigation } from '@/utils/aiSourceNavigation';
  function suggestedTagSource(tag: { id?: string | null; source?: string }) {
    if (tag.source === 'new' || tag.source === 'existing') return tag.source;
    if (tag.id) return 'existing';
    return tag.id === null ? 'new' : '';
  }

  const props = defineProps<{
    runId: string;
    resourceTitle: string;
    resourceId?: string;
    suggestion: WorkspaceSuggestion;
    analyzing: boolean;
  }>();
  const emit = defineEmits<{ changed: []; 'preview-archive': [resourceId: string, suggestionId?: string] }>();
  const { t, locale } = useI18n(),
    router = useRouter();
  const editing = ref(false),
    busy = ref(false),
    error = ref(''),
    title = ref(''),
    tags = ref<OrganizeAiSuggestionTag[]>([]);
  const beforeTags = computed(() => (Array.isArray(props.suggestion.before) ? props.suggestion.before : []));
  const isMetadata = computed(() => ['tags', 'title'].includes(props.suggestion.kind));
  const manual = computed(
    () => isMetadata.value && ['insufficient', 'no_suggestion'].includes(props.suggestion.status),
  );
  const canReview = computed(
    () =>
      ['pending', 'insufficient', 'info', 'no_suggestion'].includes(props.suggestion.status) &&
      (isMetadata.value ||
        (props.suggestion.kind === 'archive'
          ? Boolean(props.suggestion.archivePreview && props.resourceId)
          : ['trash', 'duplicate_bookmarks'].includes(String(props.suggestion.action)))),
  );
  watch(
    () => props.suggestion.id,
    () => {
      editing.value = false;
      error.value = '';
    },
  );
  function edit() {
    title.value = String(props.suggestion.after || props.suggestion.before || '');
    tags.value = Array.isArray(props.suggestion.after) ? props.suggestion.after.map((x) => ({ ...x })) : [];
    editing.value = true;
  }
  function formatDate(value?: string) {
    return value ? new Date(value).toLocaleDateString(locale.value) : '—';
  }
  function openMember(member: SuggestionMember) {
    const target = resolveAiSourceNavigation({
      ...member,
      target: member.type === 'note' ? 'note-detail' : member.type === 'file' ? 'cloud-file' : 'bookmark-edit',
    });
    if (target.kind === 'internal') void router.push(target.target);
  }
  // 请求重试沿用同一标识；服务端还以建议独立状态保证只写一次。
  let requestId = '',
    requestPayload = '';
  async function submit(action: 'apply', value?: unknown) {
    if (busy.value) return;
    const signature = JSON.stringify([props.suggestion.id, action, value]);
    if (signature !== requestPayload) {
      requestPayload = signature;
      requestId = generateUUID();
    }
    busy.value = true;
    error.value = '';
    try {
      const response = await actOnRunSuggestion(props.runId, props.suggestion.id, action, value, requestId);
      if (response.status !== 200) throw new Error(response.msg);
      editing.value = false;
      emit('changed');
    } catch (e) {
      error.value = e instanceof Error ? e.message : t('organize.actionFailed');
    } finally {
      busy.value = false;
    }
  }
  const apply = (value: unknown) => submit('apply', value);
  function confirmTrash() {
    Alert.alert({
      title: t('organize.moveToTrash'),
      content: t('organizeWorkspace.trashConfirm', { title: props.resourceTitle }),
      okText: t('organize.moveToTrash'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: () => apply({ confirmTrash: true }),
    });
  }
</script>
<style scoped lang="less">
  .workspace-suggestion {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 16px 0;
    border-bottom: 1px solid var(--workspace-divider);
    font-size: 12px;
    min-width: 0;
  }
  .workspace-suggestion:first-child {
    padding-top: 4px;
  }
  .workspace-suggestion:last-of-type {
    border-bottom: 0;
  }
  .suggestion-copy {
    display: grid;
    grid-template-columns: 130px minmax(0, 1fr);
    align-items: start;
    gap: 8px 18px;
    min-width: 0;
  }
  .suggestion-heading {
    grid-column: 1;
    grid-row: 1 / span 4;
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    font-size: 12px;
  }
  .suggestion-kind-icon {
    color: var(--ow-purple, var(--primary-color));
    flex-shrink: 0;
  }
  .suggestion-heading :deep(.b-chip) {
    font-size: 10px;
  }
  .suggestion-heading strong {
    font-size: 12px;
  }
  .suggestion-copy > p {
    grid-column: 2;
    margin: 0;
    color: var(--ow-muted, var(--desc-color));
    line-height: 1.6;
    overflow-wrap: anywhere;
    font-size: 11px;
  }
  .suggestion-change {
    grid-column: 2;
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .suggested-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    min-width: 0;
  }
  .suggested-tag :deep(.resource-tag-chip) {
    flex-shrink: 1;
    min-width: 0;
  }
  .suggested-tag-source {
    display: inline-flex;
    align-items: baseline;
    flex-shrink: 0;
    font-size: 0.85em;
    font-weight: 400;
  }
  .suggested-tag-dot {
    margin-inline: 3px;
    font-weight: 700;
  }
  .suggestion-change > span:first-child {
    color: var(--ow-muted, var(--desc-color));
  }
  .suggestion-change strong {
    font-weight: 500;
  }
  .suggestion-actions {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }
  .suggestion-actions .b_btn {
    font-size: 11px;
    min-height: 32px;
    height: 32px;
    padding: 0 12px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: transparent;
  }
  .suggestion-actions .b_btn:not(.primary_btn):hover:not(:disabled) {
    background: var(--workspace-hover);
  }
  .suggestion-actions .b_btn.primary_btn {
    background: var(--primary-color);
    color: white;
  }
  .suggestion-actions .suggestion-edit-action {
    color: var(--text-color);
    background: var(--workspace-canvas);
    border-color: var(--workspace-border);
  }
  .trash-action {
    color: var(--danger-color);
  }
  .suggestion-edit {
    grid-column: 1/-1;
    max-width: 640px;
    display: grid;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--ow-border, var(--surface-border-color));
    border-radius: 8px;
    background: var(--ow-surface, var(--card-background));
  }
  .title-editor {
    display: grid;
    gap: 8px;
  }
  .suggestion-error {
    grid-column: 1/-1;
    color: var(--danger-color);
  }
  .tag-evidence {
    grid-column: 2;
    min-width: 0;
    color: var(--ow-muted, var(--desc-color));
    font-size: 11px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .tag-evidence p {
    margin: 4px 0 0;
  }
  .comparison {
    grid-column: 2;
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .comparison article {
    padding: 8px 10px;
    border: 1px solid var(--ow-border, var(--surface-border-color));
    border-radius: 6px;
    background: var(--ow-surface, var(--card-background));
    min-width: 0;
  }
  .comparison small,
  .comparison p {
    display: block;
    font-size: 11px;
    color: var(--ow-muted, var(--desc-color));
    margin: 4px 0;
    overflow-wrap: anywhere;
  }
  .comparison .b_btn {
    max-width: 100%;
    height: auto;
    white-space: normal;
    text-align: left;
    font-size: 12px;
  }
  .suggestion-edit .suggestion-actions {
    justify-content: flex-end;
  }
  @media (max-width: 1000px) {
    .suggestion-copy {
      grid-template-columns: 110px minmax(0, 1fr);
    }
    .workspace-suggestion {
      gap: 10px;
    }
    .suggestion-actions {
      gap: 5px;
    }
    .suggestion-actions .b_btn {
      padding: 0 9px;
    }
  }
  @media (max-width: 760px) {
    .workspace-suggestion {
      grid-template-columns: 1fr;
      padding: 14px 0;
      gap: 10px;
    }
    .suggestion-copy {
      grid-template-columns: 1fr;
      gap: 7px;
    }
    .suggestion-heading {
      grid-row: auto;
      grid-column: 1;
    }
    .suggestion-copy > p,
    .suggestion-change,
    .tag-evidence,
    .comparison {
      grid-column: 1;
    }
    .suggestion-actions {
      justify-content: flex-start;
    }
    .suggestion-edit {
      padding: 10px;
    }
  }
</style>
