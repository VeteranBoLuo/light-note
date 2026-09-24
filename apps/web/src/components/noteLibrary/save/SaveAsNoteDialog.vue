<template>
  <BModal
    v-model:visible="visible"
    :title="t('saveAsNote.title')"
    width="var(--ui-layout-560, 560px)"
    fullscreen-mobile
    :mask-closable="!busy"
    :close-disabled="busy"
    @update:visible="!$event && close()"
  >
    <div class="save-note-form">
      <p v-if="request.description" class="save-note-context save-note-source"
        ><SvgIcon :src="icon.toolbox.markdown" size="20" />{{ request.description }}</p
      >
      <p v-if="request.notice" class="save-note-context">{{ request.notice }}</p>
      <BLoading v-if="initializing" inline loading />
      <template v-else-if="!unavailable">
        <label
          >{{ t('saveAsNote.noteTitle')
          }}<BInput v-model:value="state.options.title" :maxlength="255" :disabled="locked"
        /></label>
        <div class="save-note-field"
          ><span>{{ t('saveAsNote.location') }}</span
          ><NoteSaveLocation v-model:value="parentId" :disabled="locked"
        /></div>
        <label v-if="request.personalThoughts"
          >{{ t('saveAsNote.thoughts')
          }}<BInput
            v-model:value="state.options.thoughts"
            type="textarea"
            :rows="3"
            :maxlength="2000"
            :disabled="locked"
        /></label>
        <section class="save-note-settings">
          <BButton class="save-note-more" :aria-expanded="more" @click="more = !more">
            <span
              >{{ t('saveAsNote.more') }}<small>{{ t('saveAsNote.moreHint') }}</small></span
            >
            <SvgIcon class="save-note-chevron" :src="icon.noteTree.chevron" size="16" :class="{ expanded: more }" />
          </BButton>
          <div v-if="more" class="save-note-extra">
            <BLoading v-if="settingsLoading" inline loading />
            <div v-else-if="settingsError" role="alert"
              >{{ t('saveAsNote.loadingFailed') }} <BButton @click="loadSettings">{{ t('common.retry') }}</BButton></div
            >
            <template v-else>
              <div class="save-note-field"
                ><span>{{ t('saveAsNote.tags') }}</span>
                <BSelect
                  v-model:value="state.options.tags"
                  :options="tagOptions"
                  mode="multiple"
                  chip-tone="tag"
                  :show-search="true"
                  :max-tag-count="3"
                  :disabled="locked"
                >
                  <template #dropdown-footer
                    ><InlineTagCreate
                      v-if="!locked && state.options.tags.length < 4"
                      :existing-tags="existingTags"
                      @created="selectTag"
                      @reused="selectTag"
                      @stale="loadSettings"
                  /></template>
                </BSelect>
              </div>
              <div class="save-note-field"
                ><span>{{ t('saveAsNote.project') }}</span
                ><BSelect v-model:value="state.options.projectId" :options="projectOptions" :disabled="locked"
              /></div>
            </template>
          </div>
        </section>
        <p v-if="state.noteId && !pendingLinks" class="save-note-context save-note-success" role="status">
          <SvgIcon :src="icon.message.success" size="18" />{{ t('saveAsNote.saved') }}
        </p>
        <p v-else class="save-note-context">{{ t('saveAsNote.free') }}</p>
      </template>
      <p v-if="unavailable" role="alert">{{ t('saveAsNote.unavailable') }}</p>
      <p v-if="error" class="save-note-error" role="alert">{{ error }}</p>
      <p v-if="state.noteId && pendingLinks" class="save-note-context" role="status">{{ t('saveAsNote.partial') }}</p>
      <p v-else-if="state.uncertain" role="status">{{ t('saveAsNote.uncertain') }}</p>
    </div>
    <template #footer>
      <div class="save-note-actions">
        <BButton :disabled="busy" @click="close()">{{ t('common.cancel') }}</BButton>
        <div>
          <BButton v-if="pendingLinks" :loading="busy" @click="save(false)">{{ t('saveAsNote.retryLinks') }}</BButton>
          <BButton v-if="state.noteId" type="primary" :disabled="busy || unavailable" @click="close(true)">{{
            t('saveAsNote.open')
          }}</BButton>
          <template v-else-if="!unavailable">
            <BButton class="save-note-secondary" :disabled="!canSave" :loading="busy" @click="save(false)">{{
              t('saveAsNote.save')
            }}</BButton>
            <BButton type="primary" :disabled="!canSave" :loading="busy" @click="save(true)">{{
              t('saveAsNote.saveAndOpen')
            }}</BButton>
          </template>
        </div>
      </div>
    </template>
  </BModal>
</template>
<script setup lang="ts">
  import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore, useNoteWorkspaceStore } from '@/store';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { apiBasePost, apiQueryPost } from '@/http/request';
  import { fetchToolboxWorkspaces, addToolboxWorkspaceResources } from '@/api/toolbox';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import type { SaveAsNoteSession, SaveAsNoteResult } from '@/composables/useSaveAsNote';
  import { getNoteSaveState, freezeNoteSaveOptions } from './saveAsNoteState';
  import NoteSaveLocation from './NoteSaveLocation.vue';
  import InlineTagCreate from '@/components/tag/InlineTagCreate.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  const props = defineProps<{ session: SaveAsNoteSession }>();
  const emit = defineEmits<{ close: [result: SaveAsNoteResult | null] }>();
  const { t } = useI18n();
  const user = useUserStore();
  const workspace = useNoteWorkspaceStore();
  const request = props.session.request;
  const state = getNoteSaveState(props.session.owner, request);
  const visible = ref(true),
    busy = ref(false),
    more = ref(false),
    error = ref(''),
    initializing = ref(true),
    unavailable = ref(false);
  const settingsLoading = ref(false),
    settingsError = ref(false),
    settingsLoaded = ref(false);
  const tags = ref<Array<{ id: string; name: string }>>([]);
  const projects = ref<Array<{ id: string; title: string }>>([]);
  let disposed = false;
  onBeforeUnmount(() => {
    disposed = true;
  });
  const current = () =>
    !disposed &&
    props.session.owner === buildNoteDetailRequestScope(user) &&
    !user.adminContext &&
    (request.isCurrent?.() ?? true);
  const locked = computed(() => busy.value || !!state.noteId || state.uncertain);
  const parentId = computed({
    get: () => state.options.parentId || '',
    set: (id: string) => {
      state.options.parentId = id || null;
    },
  });
  const pendingLinks = computed(() => !!state.noteId && (!state.tagsDone || !state.projectDone));
  const canSave = computed(
    () =>
      !initializing.value &&
      !busy.value &&
      !!state.options.title.trim() &&
      state.options.tags.length <= 4 &&
      !settingsLoading.value &&
      !settingsError.value,
  );
  const existingTags = computed(() => tags.value);
  const tagOptions = computed(() =>
    tags.value.map((tag) => ({
      value: tag.id,
      label: tag.name,
      disabled: state.options.tags.length >= 4 && !state.options.tags.includes(tag.id),
    })),
  );
  const projectOptions = computed(() => [
    { value: '', label: t('saveAsNote.noProject') },
    ...projects.value.map((p) => ({ value: p.id, label: p.title })),
  ]);
  function selectTag(tag: { id: string; name: string }) {
    if (locked.value) return;
    if (!tags.value.some((item) => item.id === tag.id)) tags.value.push(tag);
    if (state.options.tags.length < 4 && !state.options.tags.includes(tag.id)) state.options.tags.push(tag.id);
  }
  async function loadSettings() {
    settingsLoading.value = true;
    settingsError.value = false;
    const results = await Promise.allSettled([
      apiQueryPost('/api/bookmark/queryTagList', { filters: { userId: user.id } }),
      fetchToolboxWorkspaces(),
    ]);
    if (!current()) return;
    const [tagResult, projectResult] = results;
    if (tagResult.status === 'fulfilled' && tagResult.value.status === 200)
      tags.value = (tagResult.value.data || []).map((tag: any) => ({ id: String(tag.id), name: tag.name }));
    else settingsError.value = true;
    if (projectResult.status === 'fulfilled') {
      projects.value = projectResult.value.filter((p) => ['active', 'paused'].includes(p.status));
      if (state.options.projectId && !projects.value.some((p) => p.id === state.options.projectId) && !state.frozen)
        state.options.projectId = '';
    } else settingsError.value = true;
    settingsLoaded.value = !settingsError.value;
    settingsLoading.value = false;
  }
  watch(
    () => request.isCurrent?.() ?? true,
    (valid) => {
      if (!valid) {
        initializing.value = false;
        unavailable.value = true;
        error.value = t('saveAsNote.sourceChanged');
      }
    },
  );
  watch(more, (value) => {
    if (value && !settingsLoaded.value) void loadSettings();
  });
  onMounted(async () => {
    try {
      const existing = await request.lookup?.();
      if (!current()) return;
      if (existing) {
        state.noteId = existing.noteId;
        unavailable.value = !!existing.unavailable;
        if (!state.frozen) {
          state.tagsDone = true;
          state.projectDone = true;
        }
      }
    } catch {
      if (current()) {
        error.value = t('saveAsNote.failed');
        unavailable.value = true;
      }
    } finally {
      if (current()) initializing.value = false;
    }
    if (request.projectId && current()) void loadSettings();
  });
  let closing = false;
  async function close(open = false) {
    if (busy.value || closing) return;
    closing = true;
    const result = state.noteId ? { noteId: state.noteId, openAfterSave: open } : null;
    await closeCurrentMobileOverlayThen(
      () => {
        visible.value = false;
      },
      () => emit('close', result),
    );
  }
  async function save(open: boolean) {
    if (busy.value || !current()) {
      error.value = t('saveAsNote.sourceChanged');
      return;
    }
    busy.value = true;
    error.value = '';
    const options = freezeNoteSaveOptions(state);
    try {
      if (!state.noteId) {
        state.uncertain = true;
        const result = await request.save(options);
        if (!current()) return;
        state.noteId = result.noteId;
        state.uncertain = false;
        workspace.ensureOwner(props.session.owner);
        void workspace.refreshTree();
      }
      if (!current()) return;
      const results = await Promise.allSettled([
        state.tagsDone || !options.tags.length
          ? Promise.resolve()
          : apiBasePost(
              '/api/note/updateNoteTags',
              { noteId: state.noteId, tags: options.tags },
              { silent: true },
            ).then((r) => {
              if (r.status !== 200) throw new Error('tags');
            }),
        state.projectDone || !options.projectId
          ? Promise.resolve()
          : addToolboxWorkspaceResources(options.projectId, [{ type: 'note', id: state.noteId }], 'result'),
      ]);
      if (!current()) return;
      state.tagsDone = results[0].status === 'fulfilled';
      state.projectDone = results[1].status === 'fulfilled';
      busy.value = false;
      if (!pendingLinks.value) await close(open);
    } catch (cause: any) {
      if (!current()) return;
      const status = Number(cause?.status || cause?.response?.status || 0);
      if (status >= 400 && status < 500 && status !== 408 && status !== 409) {
        state.uncertain = false;
        state.frozen = null;
      }
      if (cause?.code === 'SAVE_NOTE_CANCELLED') {
        state.uncertain = false;
        state.frozen = null;
      } else error.value = t('saveAsNote.failed');
    } finally {
      busy.value = false;
    }
  }
</script>
<style scoped lang="less">
  .save-note-secondary {
    border: 1px solid var(--primary-color);
    color: var(--primary-color);
    background: transparent;
  }
  .save-note-source {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  .save-note-source > :first-child {
    color: var(--primary-color);
    flex-shrink: 0;
  }
  .save-note-form :deep(.b-input),
  .save-note-form :deep(.note-location-trigger) {
    background: var(--bl-input-bg-color);
    border-color: var(--bl-input-border-color);
    min-height: var(--ui-control-40, 40px);
    border-radius: 8px;
  }
  .save-note-actions {
    border-top: 1px solid var(--surface-border-color);
    box-sizing: border-box;
  }

  .save-note-form,
  .save-note-extra {
    display: grid;
    gap: var(--ui-space-20, 20px);
  }
  .save-note-form label,
  .save-note-field {
    display: grid;
    gap: var(--ui-space-8, 8px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }
  .save-note-context {
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    margin: 0;
    line-height: 1.6;
  }
  .save-note-success {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    color: var(--success-color);
  }
  .save-note-success > :first-child {
    flex-shrink: 0;
  }
  .save-note-settings {
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    overflow: hidden;
  }
  .save-note-extra {
    padding: 0 var(--ui-space-16, 16px) var(--ui-space-16, 16px);
  }
  .save-note-more {
    display: flex;
    justify-content: space-between;
    width: 100%;
    text-align: start;
    height: auto;
    line-height: 1.5;
    text-decoration: none;
    padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px);
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--text-color);
    box-shadow: none;
  }
  .save-note-more:active {
    text-decoration: none;
    background: var(--navigation-pill-hover-bg);
  }
  @media (hover: hover) and (pointer: fine) {
    .save-note-more:hover {
      text-decoration: none;
      background: var(--navigation-pill-hover-bg);
    }
  }
  .save-note-more:focus-visible {
    outline-offset: -2px;
  }
  .save-note-chevron {
    flex-shrink: 0;
    transition: transform 160ms ease;
  }
  @media (prefers-reduced-motion: reduce) {
    .save-note-chevron {
      transition: none;
    }
  }
  .save-note-more small {
    display: block;
    color: var(--desc-color);
    margin-top: var(--ui-space-4, 4px);
  }
  .expanded {
    transform: rotate(180deg);
  }
  .save-note-error {
    color: var(--danger-color);
  }
  .save-note-actions,
  .save-note-actions > div {
    display: flex;
    gap: var(--ui-space-12, 12px);
    align-items: center;
  }
  .save-note-actions {
    justify-content: space-between;
    width: 100%;
    flex-wrap: wrap;
    padding: var(--ui-space-16, 16px) var(--ui-space-20, 20px);
  }
  @media (max-width: 767px) {
    .save-note-form {
      padding: var(--ui-space-16, 16px);
    }
    .save-note-actions > div {
      flex: 1;
    }
    .save-note-actions > div > * {
      flex: 1;
    }
  }
</style>
