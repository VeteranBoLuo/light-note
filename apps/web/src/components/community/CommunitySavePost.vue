<template>
  <BModal
    :visible="true"
    :title="t('community.feed.' + (kind === 'note' ? 'saveNote' : 'saveBookmark'))"
    width="var(--ui-layout-560, 560px)"
    fullscreen-mobile
    :mask-closable="!busy"
    :close-disabled="busy"
    :show-footer="false"
    @update:visible="!busy && emit('close')"
  >
    <div class="save-post-form">
      <BLoading :loading="initializing">
        <template v-if="existing">
          <p>{{ t(existing.deleted ? 'community.feed.savedInTrash' : 'community.feed.alreadySaved') }}</p>
          <BButton v-if="!existing.deleted" type="primary" @click="openSaved(existing.id)">{{
            t('community.feed.openSaved')
          }}</BButton>
        </template>
        <template v-else>
          <label
            >{{ t('community.feed.saveTitle')
            }}<BInput v-model:value="title" :maxlength="255" :disabled="busy || Boolean(createdId)"
          /></label>
          <div v-if="kind === 'note'" class="save-location-field">
            <span>{{ t('community.feed.saveLocation') }}</span>
            <CommunityNoteLocation v-model:value="parentId" :disabled="busy || Boolean(createdId)" />
          </div>
          <div class="save-location-field">
            <span>{{ t('community.feed.saveTags') }}</span>
            <BSelect
              v-model:value="tags"
              :options="selectableTags"
              mode="multiple"
              chip-tone="tag"
              :max-tag-count="3"
              :show-search="true"
              :placeholder="t('bookmarkEditor.tagPlaceholder')"
              :disabled="busy"
            >
              <template #dropdown-footer>
                <InlineTagCreate
                  v-if="!busy && tags.length < 4"
                  :existing-tags="existingTags"
                  @created="selectCreatedTag"
                  @reused="selectCreatedTag"
                  @stale="reloadTags"
                />
              </template>
            </BSelect>
          </div>
          <label
            >{{ t(kind === 'note' ? 'community.feed.myThoughts' : 'community.feed.bookmarkDescription')
            }}<BInput
              v-model:value="thoughts"
              type="textarea"
              :rows="3"
              :placeholder="
                t(kind === 'note' ? 'community.feed.noteThoughtsHint' : 'community.feed.bookmarkThoughtsHint')
              "
              :maxlength="2000"
              :disabled="busy || Boolean(createdId)"
          /></label>
          <p class="save-post-hint">{{
            t(kind === 'note' ? 'community.feed.noteSnapshotHint' : 'community.feed.bookmarkHint')
          }}</p>
          <p v-if="post.images?.length && kind === 'note'" class="save-post-hint">{{
            t('community.feed.saveImagesHint', { count: post.images.length })
          }}</p>
          <p v-if="error" role="alert">{{ error }}</p>
          <div class="save-post-actions"
            ><BButton :disabled="busy" @click="emit('close')">{{ t('common.cancel') }}</BButton
            ><BButton v-if="error && !ready" :disabled="initializing" @click="initialize">{{
              t('community.feed.retry')
            }}</BButton
            ><BButton
              v-else
              type="primary"
              :loading="busy"
              :disabled="initializing || !ready || !title.trim() || tags.length > 4"
              @click="save"
              >{{ t(createdId ? 'community.feed.retrySaveTags' : 'common.save') }}</BButton
            ></div
          >
        </template>
      </BLoading>
    </div>
  </BModal>
</template>
<script setup lang="ts">
  import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRouter } from 'vue-router';
  import { useUserStore, useNoteWorkspaceStore } from '@/store';
  import type { FeedPost } from '@/api/communityFeedApi';
  import { feedGet } from '@/api/communityFeedApi';
  import { apiBasePost, apiQueryPost } from '@/http/request';
  import { ensureCloudFolder, uploadManagedCloudFile, type ManagedCloudUploadReceipt } from '@/api/cloudFileUploadApi';
  import { buildNoteDetailRequestScope } from '@/api/noteDetailPrefetch';
  import { resolveResourceRoute } from '@/utils/resourceNavigation';
  import { communityNoteContent, communityPostUrl } from '@/utils/communityPostSave';
  import { confirmNoteShareExposure } from '@/utils/noteShareExposure';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import CommunityNoteLocation from './CommunityNoteLocation.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import InlineTagCreate from '@/components/tag/InlineTagCreate.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  const props = defineProps<{ post: FeedPost; kind: 'note' | 'bookmark' }>();
  const emit = defineEmits<{ close: [] }>();
  const { t } = useI18n();
  const router = useRouter();
  const user = useUserStore();
  const workspace = useNoteWorkspaceStore();
  const owner = user.id;
  let disposed = false;
  const current = () => !disposed && user.id === owner && !user.adminContext;
  onBeforeUnmount(() => {
    disposed = true;
  });
  const title = ref(props.post.title),
    thoughts = ref(''),
    tags = ref<string[]>([]),
    parentId = ref('');
  const tagOptions = ref<Array<{ value: string; label: string }>>([]);
  const existingTags = computed(() => tagOptions.value.map((tag) => ({ id: tag.value, name: tag.label })));
  const selectableTags = computed(() =>
    tagOptions.value.map((tag) => ({ ...tag, disabled: tags.value.length >= 4 && !tags.value.includes(tag.value) })),
  );
  function selectCreatedTag(tag: { id: string; name: string }) {
    if (!current() || busy.value) return;
    if (!tagOptions.value.some((option) => option.value === tag.id))
      tagOptions.value.push({ value: tag.id, label: tag.name });
    if (tags.value.length < 4 && !tags.value.includes(tag.id)) tags.value.push(tag.id);
  }
  async function refreshTags() {
    const response = await apiQueryPost('/api/bookmark/queryTagList', { filters: { userId: owner } });
    if (!current()) return;
    if (response.status !== 200) throw new Error();
    tagOptions.value = (response.data || []).map((item: any) => ({ value: String(item.id), label: item.name }));
  }
  async function reloadTags() {
    try {
      await refreshTags();
    } catch {
      if (current()) message.error(t('community.feed.saveFailed'));
    }
  }
  const busy = ref(false),
    initializing = ref(true),
    ready = ref(false),
    error = ref(''),
    createdId = ref('');
  const existing = ref<{ id: string; deleted: boolean } | null>(null);
  let key = '';
  let folderId: string | undefined;
  const copies = new Map<string, { file?: File; id?: string; receipt: ManagedCloudUploadReceipt }>();
  onMounted(initialize);
  async function initialize() {
    initializing.value = true;
    error.value = '';
    try {
      const saved = await feedGet(`posts/${props.post.publicId}/saved`);
      if (!current()) return;
      key = saved.key;
      existing.value = saved[props.kind];
      if (existing.value) return;
      await refreshTags();
      if (current()) ready.value = true;
    } catch {
      if (current()) error.value = t('community.feed.saveFailed');
    } finally {
      if (current()) initializing.value = false;
    }
  }
  async function copyImages() {
    const ids: string[] = [];
    for (const image of props.post.images || []) {
      if (!current()) throw new Error();
      let entry = copies.get(image.publicId);
      if (!entry) {
        entry = { receipt: {} };
        copies.set(image.publicId, entry);
      }
      if (!entry.id) {
        if (!entry.file) {
          const url = new URL(image.url, location.origin);
          if (url.origin !== location.origin || !url.pathname.startsWith('/api/community/images/')) throw new Error();
          const response = await fetch(url.href, { credentials: 'same-origin' });
          if (!response.ok) throw new Error();
          const blob = await response.blob();
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || blob.size > 5 * 1024 * 1024)
            throw new Error();
          entry.file = new File(
            [blob],
            `community-${image.publicId}.${blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1]}`,
            { type: blob.type },
          );
        }
        if (!current()) throw new Error();
        if (!folderId) folderId = (await ensureCloudFolder(t('community.feed.savedImageFolder'))).id;
        if (!current()) throw new Error();
        entry.id = (await uploadManagedCloudFile(entry.file, { folderId, receipt: entry.receipt })).fileId;
      }
      ids.push(entry.id);
    }
    return ids;
  }
  function openSaved(id: string) {
    const path = resolveResourceRoute({ type: props.kind, id })!;
    void closeCurrentMobileOverlayThen(
      () => emit('close'),
      () => router.push(path),
    );
  }
  async function save() {
    if (busy.value || !ready.value || !current()) return;
    busy.value = true;
    error.value = '';
    try {
      if (!createdId.value) {
        const saved = await feedGet(`posts/${props.post.publicId}/saved`);
        if (!current()) return;
        if (saved[props.kind]) {
          existing.value = saved[props.kind];
          return;
        }
        let response;
        if (props.kind === 'note') {
          const imageIds = await copyImages();
          if (!current()) return;
          const payload = {
            title: title.value.trim(),
            type: 'html',
            content: communityNoteContent(
              props.post,
              imageIds,
              thoughts.value,
              t('community.feed.sourcePost'),
              t('community.feed.thoughtsHeading'),
            ),
            parentId: parentId.value || null,
            idempotencyKey: key,
          };
          response = await apiBasePost('/api/note/addNote', payload, { silent: true });
          if (!current()) return;
          const decision = await confirmNoteShareExposure(response);
          if (decision === false) return;
          if (decision === true && current())
            response = await apiBasePost(
              '/api/note/addNote',
              { ...payload, shareExposureAcknowledged: true },
              { silent: true },
            );
        } else {
          response = await apiBasePost(
            '/api/bookmark/addBookmark',
            {
              name: title.value.trim(),
              url: communityPostUrl(props.post.publicId),
              description: thoughts.value,
              relatedTags: tags.value,
              saveSnapshot: false,
              idempotencyKey: key,
            },
            { silent: true },
          );
        }
        if (!current()) return;
        if (response?.status !== 200 || !response.data?.id) throw new Error();
        createdId.value = String(response.data.id);
      }
      if (props.kind === 'note') {
        const response = await apiBasePost(
          '/api/note/updateNoteTags',
          { noteId: createdId.value, tags: tags.value },
          { silent: true },
        );
        if (!current()) return;
        if (response.status !== 200) throw new Error();
        workspace.ensureOwner(buildNoteDetailRequestScope(user));
        workspace.insertCreatedNote({
          id: createdId.value,
          title: title.value,
          type: 'html',
          parentId: parentId.value || null,
        });
      }
      if (current()) {
        emit('close');
        message.success(t('common.saveSuccess'));
      }
    } catch {
      if (current()) error.value = t(createdId.value ? 'community.feed.savedTagsFailed' : 'community.feed.saveFailed');
    } finally {
      if (current()) busy.value = false;
    }
  }
</script>
<style scoped>
  .save-post-form {
    display: grid;
    gap: var(--ui-space-16, 16px);
  }
  .save-post-form label,
  .save-location-field {
    display: grid;
    gap: var(--ui-space-8, 8px);
    margin-bottom: var(--ui-space-16, 16px);
    color: var(--text-color);
  }
  .save-post-actions {
    display: flex;
    gap: var(--ui-space-8, 8px);
    justify-content: flex-end;
  }
  .save-post-hint {
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
    line-height: 1.6;
  }
  @media (max-width: 768px) {
    .save-post-form {
      padding: 16px;
    }
  }
</style>
