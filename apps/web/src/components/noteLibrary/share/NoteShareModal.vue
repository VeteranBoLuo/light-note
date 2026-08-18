<template>
  <BModal
    v-model:visible="visible"
    :title="t('noteShare.manageTitle')"
    width="560px"
    :show-footer="false"
    fullscreen-mobile
    @close="closeModal"
  >
    <div class="note-share-modal">
      <div class="note-share-modal__target">
        <span class="note-share-modal__target-icon"><SvgIcon :src="icon.share" size="18" /></span>
        <div>
          <strong>{{ note.title || t('note.untitled') }}</strong>
          <p>{{ t('noteShare.readonlyHint') }}</p>
        </div>
      </div>

      <div class="note-share-modal__form">
        <label>{{ t('noteShare.scope') }}</label>
        <BSelect v-model:value="scopeType" :options="scopeOptions" />
        <p class="note-share-modal__scope-hint" :class="{ 'is-warning': scopeType === 'subtree' }">
          {{ t(scopeType === 'subtree' ? 'noteShare.subtreeHint' : 'noteShare.singleHint') }}
        </p>

        <div class="note-share-modal__grid">
          <div>
            <label>{{ t('noteShare.expiry') }}</label>
            <BSelect v-model:value="expiresInDays" :options="expiryOptions" />
          </div>
          <div>
            <label>{{ t('noteShare.accessCode') }}</label>
            <BInput
              v-model:value="accessCode"
              :maxlength="12"
              autocomplete="off"
              :placeholder="t('noteShare.accessCodePlaceholder')"
            />
          </div>
        </div>
        <div class="note-share-modal__grid">
          <div>
            <label>{{ t('noteShare.accessLimit') }}</label>
            <BInput v-model:value="maxAccessCount" type="number" :placeholder="t('noteShare.unlimited')" />
          </div>
          <div>
            <label>{{ t('noteShare.description') }}</label>
            <BInput v-model:value="description" :maxlength="200" :placeholder="t('noteShare.descriptionPlaceholder')" />
          </div>
        </div>
        <div class="note-share-modal__actions">
          <BButton type="primary" :loading="submitting" @click="submitShare">
            {{ t('noteShare.createAndCopy') }}
          </BButton>
        </div>
        <div v-if="lastCreatedUrl" class="note-share-modal__new-link" role="status">
          <strong>{{ t('noteShare.newLinkReady') }}</strong>
          <div>
            <BInput v-model:value="lastCreatedUrl" readonly />
            <BButton @click="copyLastCreatedLink">{{ t('noteShare.copyLink') }}</BButton>
          </div>
        </div>
      </div>

      <section class="note-share-modal__records" :aria-label="t('noteShare.currentLinks')">
        <div class="note-share-modal__records-title">
          <h3>{{ t('noteShare.currentLinks') }}</h3>
          <span v-if="records.length">{{ records.length }}</span>
        </div>
        <BLoading v-if="loading" inline loading :title="t('common.loading')" />
        <p v-else-if="!records.length" class="note-share-modal__empty">{{ t('noteShare.noLinks') }}</p>
        <article v-for="record in records" v-else :key="record.id" class="note-share-modal__record">
          <div class="note-share-modal__record-main">
            <div>
              <strong>{{ t(record.scopeType === 'subtree' ? 'noteShare.subtreeScope' : 'noteShare.singleScope') }}</strong>
              <span class="note-share-modal__state" :class="`is-${record.state}`">{{ stateLabel(record.state) }}</span>
            </div>
            <p>
              {{ t('noteShare.linkMeta', { hint: record.tokenHint, expires: formatDate(record.expiresAt) }) }}
            </p>
            <p>
              {{ t('noteShare.visitMeta', { current: record.accessCount, limit: record.maxAccessCount ?? t('noteShare.unlimited') }) }}
            </p>
          </div>
          <div class="note-share-modal__record-actions">
            <BButton
              size="small"
              :disabled="record.state !== 'active' || submitting"
              @click="confirmRotate(record.id)"
            >
              {{ t('noteShare.rotate') }}
            </BButton>
            <BButton
              size="small"
              type="danger"
              :disabled="record.state !== 'active' || submitting"
              @click="confirmRevoke(record.id)"
            >
              {{ t('noteShare.revoke') }}
            </BButton>
          </div>
        </article>
      </section>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import {
    copyNoteShareUrl,
    buildNoteShareUrl,
    createNoteShare,
    listNoteShares,
    revokeNoteShare,
    rotateNoteShare,
    type NoteShareInput,
    type NoteShareRecord,
    type NoteShareScope,
  } from '@/api/noteShare';

  const props = defineProps<{ note: { id: string; title?: string } }>();
  const emit = defineEmits<{ close: [] }>();
  const visible = defineModel<boolean>('visible', { default: false });
  const { t, locale } = useI18n();
  const loading = ref(false);
  const submitting = ref(false);
  const records = ref<NoteShareRecord[]>([]);
  const scopeType = ref<NoteShareScope>('single');
  const expiresInDays = ref<1 | 7 | 30>(7);
  const accessCode = ref('');
  const maxAccessCount = ref('');
  const description = ref('');
  const lastCreatedToken = ref('');
  const lastCreatedUrl = ref('');

  const scopeOptions = computed(() => [
    { value: 'single', label: t('noteShare.singleScope') },
    { value: 'subtree', label: t('noteShare.subtreeScope') },
  ]);
  const expiryOptions = computed(() => [
    { value: 1, label: t('noteShare.oneDay') },
    { value: 7, label: t('noteShare.sevenDays') },
    { value: 30, label: t('noteShare.thirtyDays') },
  ]);

  function currentInput(): NoteShareInput {
    const rawLimit = String(maxAccessCount.value || '').trim();
    return {
      scopeType: scopeType.value,
      expiresInDays: expiresInDays.value,
      accessCode: accessCode.value.trim(),
      maxAccessCount: rawLimit ? Number(rawLimit) : null,
      description: description.value.trim(),
    };
  }

  function resetForm() {
    scopeType.value = 'single';
    expiresInDays.value = 7;
    accessCode.value = '';
    maxAccessCount.value = '';
    description.value = '';
  }

  function resetState() {
    records.value = [];
    lastCreatedToken.value = '';
    lastCreatedUrl.value = '';
    resetForm();
  }

  function closeModal() {
    visible.value = false;
    resetState();
    emit('close');
  }

  async function loadRecords() {
    if (!props.note.id) return;
    loading.value = true;
    try {
      records.value = await listNoteShares(props.note.id);
    } catch {
      message.error(t('noteShare.loadFailed'));
    } finally {
      loading.value = false;
    }
  }

  async function createAndCopy(create: () => Promise<{ token: string }>) {
    submitting.value = true;
    try {
      const result = await create();
      lastCreatedToken.value = result.token;
      try {
        lastCreatedUrl.value = await copyNoteShareUrl(result.token);
        message.success(t('noteShare.createdAndCopied'));
      } catch {
        lastCreatedUrl.value = buildNoteShareUrl(result.token);
        message.warning(t('noteShare.copyFailed'));
      }
      resetForm();
      await loadRecords();
    } catch (error: any) {
      message.error(error?.message || t('noteShare.manageFailed'));
    } finally {
      submitting.value = false;
    }
  }

  async function copyLastCreatedLink() {
    if (!lastCreatedToken.value) return;
    try {
      await copyNoteShareUrl(lastCreatedToken.value);
      message.success(t('noteShare.copied'));
    } catch {
      message.warning(t('noteShare.copyFailed'));
    }
  }

  function submitShare() {
    if (!props.note.id) return;
    void createAndCopy(() => createNoteShare(props.note.id, currentInput()));
  }

  function confirmRotate(shareId: string) {
    Alert.alert({
      title: t('noteShare.rotateTitle'),
      content: t('noteShare.rotateConfirm'),
      onOk: () => createAndCopy(() => rotateNoteShare(shareId, currentInput())),
    });
  }

  function confirmRevoke(shareId: string) {
    Alert.alert({
      title: t('noteShare.revokeTitle'),
      content: t('noteShare.revokeConfirm'),
      onOk: async () => {
        submitting.value = true;
        try {
          await revokeNoteShare(shareId);
          message.success(t('noteShare.revoked'));
          await loadRecords();
        } catch {
          message.error(t('noteShare.manageFailed'));
        } finally {
          submitting.value = false;
        }
      },
    });
  }

  function stateLabel(state: string) {
    const known = new Set(['active', 'revoked', 'expired', 'note_unavailable', 'access_limit_reached']);
    return t(`noteShare.state.${known.has(state) ? state : 'unavailable'}`);
  }

  function formatDate(value: string) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  watch(
    () => [visible.value, props.note.id] as const,
    ([open]) => {
      if (open) void loadRecords();
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .note-share-modal {
    display: grid;
    gap: 20px;
  }

  .note-share-modal__target {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 14px;
    border: 1px solid var(--card-border-color);
    border-radius: 12px;
    background: var(--menu-item-bg-color);

    strong {
      display: block;
      color: var(--text-color);
      line-height: 1.45;
    }

    p {
      margin: 4px 0 0;
      color: var(--desc-color);
      font-size: 13px;
    }
  }

  .note-share-modal__target-icon {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    border-radius: 10px;
    color: var(--primary-color);
    background: var(--selected-bg-color);
    border: 1px solid var(--primary-color);
  }

  .note-share-modal__form {
    display: grid;
    gap: 10px;

    label {
      color: var(--text-color);
      font-size: 13px;
      font-weight: 600;
    }
  }

  .note-share-modal__scope-hint {
    margin: -2px 0 4px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.55;

    &.is-warning {
      padding: 9px 10px;
      color: var(--warning-text-color, #8a5700);
      border: 1px solid var(--warning-color, #d89b28);
      border-radius: 9px;
      background: var(--warning-bg-color, #fff8e8);
    }
  }

  .note-share-modal__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;

    > div {
      display: grid;
      gap: 7px;
      min-width: 0;
    }
  }

  .note-share-modal__actions {
    display: flex;
    justify-content: flex-end;
    padding-top: 4px;
  }

  .note-share-modal__new-link {
    display: grid;
    gap: 7px;
    padding: 11px;
    color: var(--text-color);
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    background: var(--selected-bg-color);
    font-size: 12px;

    > div {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
  }

  .note-share-modal__records {
    display: grid;
    gap: 10px;
    padding-top: 16px;
    border-top: 1px solid var(--card-border-color);
  }

  .note-share-modal__records-title {
    display: flex;
    align-items: center;
    gap: 8px;

    h3 {
      margin: 0;
      color: var(--text-color);
      font-size: 14px;
    }

    span {
      color: var(--desc-color);
      font-size: 12px;
    }
  }

  .note-share-modal__empty {
    margin: 4px 0;
    color: var(--desc-color);
    font-size: 13px;
  }

  .note-share-modal__record {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--card-border-color);
    border-radius: 10px;
  }

  .note-share-modal__record-main {
    min-width: 0;

    > div {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    p {
      margin: 4px 0 0;
      color: var(--desc-color);
      font-size: 12px;
    }
  }

  .note-share-modal__state {
    padding: 2px 6px;
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--menu-item-bg-color);
    border: 1px solid var(--card-border-color);
    font-size: 11px;

    &.is-active {
      color: var(--primary-color);
      border-color: var(--primary-color);
      background: var(--selected-bg-color);
    }
  }

  .note-share-modal__record-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }

  @media (max-width: 720px) {
    .note-share-modal__grid {
      grid-template-columns: 1fr;
    }

    .note-share-modal__record {
      flex-direction: column;
    }

    .note-share-modal__record-actions {
      justify-content: flex-end;
    }
  }
</style>
