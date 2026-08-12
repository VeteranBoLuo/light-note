<template>
  <component :is="pickerShell" v-bind="pickerShellProps" @close="closePicker" @update:visible="handleShellVisible">
    <div class="avatar-picker" :class="{ 'avatar-picker--desktop': !isMobileLayout }">
      <div class="avatar-picker__scroll">
        <section class="avatar-picker__hero">
          <div class="avatar-picker__preview-shell">
            <AvatarFramePreview
              v-if="frameId && !showSpritePreview"
              :frame-id="frameId"
              :src="previewSource"
              :size="isMobileLayout ? 82 : 92"
              :decorative="false"
            />
            <span
              v-else-if="showSpritePreview && selectedAvatar"
              class="avatar-picker__preview-art"
              :style="builtinAvatarPreviewStyle(selectedAvatar)"
              aria-hidden="true"
            />
            <span v-else class="avatar-picker__preview-image">
              <SvgIcon :src="previewSource" :size="isMobileLayout ? 82 : 92" />
            </span>
          </div>
          <div class="avatar-picker__hero-copy">
            <strong>{{ selectedAvatar ? t(selectedAvatar.nameKey) : previewTitle }}</strong>
            <span>{{ selectedAvatar ? t(selectedAvatar.descriptionKey) : previewDescription }}</span>
            <small v-if="frameId">{{ t('myInfo.avatarFrameKept') }}</small>
          </div>
        </section>

        <section class="avatar-picker__section">
          <div class="avatar-picker__section-heading">
            <div>
              <strong>{{ t('myInfo.builtinAvatars') }}</strong>
              <span>{{ t('myInfo.builtinAvatarsHint') }}</span>
            </div>
            <small>{{ t('myInfo.avatarCount', { count: BUILTIN_AVATARS.length }) }}</small>
          </div>

          <div class="avatar-picker__grid" role="list">
            <BButton
              v-for="avatar in BUILTIN_AVATARS"
              :key="avatar.id"
              class="avatar-picker-card"
              :class="{ 'is-selected': selectedId === avatar.id }"
              role="listitem"
              :aria-label="t(avatar.nameKey)"
              :aria-pressed="selectedId === avatar.id"
              @click="selectBuiltinAvatar(avatar)"
            >
              <span class="avatar-picker-card__art" :style="builtinAvatarPreviewStyle(avatar)" aria-hidden="true" />
              <span class="avatar-picker-card__copy">
                <strong>{{ t(avatar.nameKey) }}</strong>
                <small>{{ t(avatar.descriptionKey) }}</small>
              </span>
              <span v-if="selectedId === avatar.id" class="avatar-picker-card__check" aria-hidden="true">
                <SvgIcon :src="icon.filterPanel.check" :size="13" />
              </span>
            </BButton>
          </div>
        </section>

        <section class="avatar-picker__section avatar-picker__section--custom">
          <div class="avatar-picker__section-heading">
            <div>
              <strong>{{ t('myInfo.customAvatar') }}</strong>
              <span>{{ t('myInfo.customAvatarHint') }}</span>
            </div>
          </div>
          <div class="avatar-picker__custom-actions">
            <BUpload
              accept="image/*"
              :multiple="false"
              :max-total-size="MAX_AVATAR_FILE_SIZE"
              raw-file
              @change="handleCustomAvatar"
            >
              <BButton class="avatar-picker__upload" :loading="uploading">
                <SvgIcon :src="icon.file_upload" :size="17" aria-hidden="true" />
                {{ t('myInfo.uploadCustomAvatar') }}
              </BButton>
            </BUpload>
            <BButton class="avatar-picker__restore" @click="selectDefaultAvatar">
              <SvgIcon :src="icon.navigation.user" :size="17" aria-hidden="true" />
              {{ t('myInfo.restoreDefaultAvatar') }}
            </BButton>
          </div>
        </section>
      </div>

      <footer class="avatar-picker__footer">
        <BButton class="avatar-picker__cancel" @click="closePicker">{{ t('common.cancel') }}</BButton>
        <BButton class="avatar-picker__confirm" type="primary" :loading="confirming" @click="confirmSelection">
          {{ confirming ? t('myInfo.avatarPreparing') : t('myInfo.useAvatar') }}
        </BButton>
      </footer>
    </div>
  </component>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import icon from '@/config/icon';
  import {
    BUILTIN_AVATARS,
    builtinAvatarPreviewStyle,
    renderBuiltinAvatar,
    type BuiltinAvatar,
    type BuiltinAvatarId,
  } from '@/config/builtinAvatars';
  import { compressAvatarFile } from '@/utils/compressAvatar';

  type AvatarSourceKind = 'current' | 'builtin' | 'custom' | 'default';

  const props = defineProps<{
    open: boolean;
    currentSrc?: string;
    frameId?: string | null;
    zIndex?: number;
  }>();
  const emit = defineEmits<{
    'update:open': [value: boolean];
    select: [source: string];
  }>();

  const { t } = useI18n();
  const isMobileLayout = useMobileLayout();
  const selectedId = ref<BuiltinAvatarId | null>(null);
  const sourceKind = ref<AvatarSourceKind>('current');
  const draftSource = ref('');
  const uploading = ref(false);
  const confirming = ref(false);
  const MAX_AVATAR_FILE_SIZE = 5000 * 1024;

  const pickerShell = computed(() => (isMobileLayout.value ? BDrawer : BModal));
  const pickerShellProps = computed(() =>
    isMobileLayout.value
      ? {
          open: props.open,
          title: t('myInfo.chooseAvatar'),
          placement: 'bottom' as const,
          height: 'min(86vh, 760px)',
          bodyPadding: '0',
          mobileCenteredHeader: true,
          zIndex: props.zIndex,
        }
      : {
          visible: props.open,
          title: t('myInfo.chooseAvatar'),
          width: '760px',
          height: 'min(84vh, 740px)',
          showFooter: false,
          maskClosable: true,
          modalClass: 'avatar-picker-modal',
          contentClass: 'avatar-picker-modal__content',
          maskClass: 'avatar-picker-modal-mask',
        },
  );
  const selectedAvatar = computed(() => BUILTIN_AVATARS.find((avatar) => avatar.id === selectedId.value) || null);
  const previewSource = computed(() => draftSource.value || icon.navigation.user);
  const showSpritePreview = computed(
    () => sourceKind.value === 'builtin' && Boolean(selectedAvatar.value) && !draftSource.value,
  );
  const previewTitle = computed(() => {
    if (sourceKind.value === 'custom') return t('myInfo.customAvatarSelected');
    if (sourceKind.value === 'default') return t('myInfo.defaultAvatar');
    return t('myInfo.currentAvatar');
  });
  const previewDescription = computed(() => {
    if (sourceKind.value === 'custom') return t('myInfo.customAvatarSelectedHint');
    if (sourceKind.value === 'default') return t('myInfo.defaultAvatarHint');
    return t('myInfo.chooseAvatarSubtitle');
  });

  watch(
    () => props.open,
    (open) => {
      if (!open) return;
      selectedId.value = null;
      sourceKind.value = 'current';
      draftSource.value = props.currentSrc || '';
      uploading.value = false;
      confirming.value = false;
    },
    { immediate: true },
  );

  function closePicker() {
    if (confirming.value || uploading.value) return;
    emit('update:open', false);
  }

  function handleShellVisible(value: boolean) {
    if (!value) closePicker();
  }

  async function selectBuiltinAvatar(avatar: BuiltinAvatar) {
    selectedId.value = avatar.id;
    sourceKind.value = 'builtin';
    draftSource.value = '';
    try {
      const source = await renderBuiltinAvatar(avatar.id);
      if (selectedId.value === avatar.id && sourceKind.value === 'builtin') draftSource.value = source;
    } catch (error) {
      console.error('内置头像生成失败:', error);
      message.error(t('myInfo.imageProcessingFailed'));
    }
  }

  async function handleCustomAvatar(files: File[]) {
    const file = files?.[0];
    if (!file || uploading.value) return;
    uploading.value = true;
    try {
      draftSource.value = await compressAvatarFile(file);
      selectedId.value = null;
      sourceKind.value = 'custom';
    } catch (error) {
      console.error('头像压缩失败:', error);
      message.error(t('myInfo.imageProcessingFailed'));
    } finally {
      uploading.value = false;
    }
  }

  function selectDefaultAvatar() {
    selectedId.value = null;
    sourceKind.value = 'default';
    draftSource.value = '';
  }

  async function confirmSelection() {
    if (confirming.value || uploading.value) return;
    confirming.value = true;
    try {
      let source = draftSource.value;
      if (sourceKind.value === 'builtin' && selectedId.value) {
        source = source || (await renderBuiltinAvatar(selectedId.value));
      }
      emit('select', source);
      emit('update:open', false);
    } catch (error) {
      console.error('头像生成失败:', error);
      message.error(t('myInfo.imageProcessingFailed'));
    } finally {
      confirming.value = false;
    }
  }
</script>

<style lang="less" scoped>
  .avatar-picker {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    color: var(--text-color);
    background: var(--background-color);
  }

  .avatar-picker__scroll {
    min-height: 0;
    overflow-y: auto;
    padding: 16px 18px 20px;
    overscroll-behavior: contain;
  }

  .avatar-picker__hero {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 16px 18px;
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--surface-panel-bg);
  }

  .avatar-picker__preview-shell {
    width: 96px;
    height: 96px;
    flex: 0 0 96px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .avatar-picker__preview-art,
  .avatar-picker__preview-image {
    width: 92px;
    height: 92px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 3px solid var(--surface-card-bg);
    border-radius: 50%;
    background-color: var(--surface-card-bg);
    box-shadow: var(--surface-card-shadow);
    box-sizing: border-box;
  }

  .avatar-picker__preview-image :deep(img),
  .avatar-picker__preview-image :deep(.icon-base64),
  .avatar-picker__preview-image :deep(.icon-fixed-base64) {
    width: 100% !important;
    height: 100% !important;
    display: block;
    object-fit: cover;
  }

  .avatar-picker__hero-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .avatar-picker__hero-copy strong {
    font-size: 18px;
    line-height: 1.3;
  }

  .avatar-picker__hero-copy span {
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.5;
  }

  .avatar-picker__hero-copy small {
    width: max-content;
    padding: 3px 8px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    font-size: 11px;
    line-height: 1.2;
    background: var(--surface-card-bg);
  }

  .avatar-picker__section {
    margin-top: 20px;
  }

  .avatar-picker__section-heading {
    min-height: 38px;
    margin-bottom: 10px;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }

  .avatar-picker__section-heading > div {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .avatar-picker__section-heading strong {
    font-size: 15px;
  }

  .avatar-picker__section-heading span,
  .avatar-picker__section-heading small {
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.4;
  }

  .avatar-picker__section-heading > small {
    flex: 0 0 auto;
  }

  .avatar-picker__grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .avatar-picker-card.b_btn {
    width: 100%;
    height: auto;
    min-width: 0;
    min-height: 92px;
    justify-content: flex-start;
    gap: 10px;
    position: relative;
    padding: 10px;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    color: var(--text-color);
    background: var(--surface-card-bg);
    line-height: normal;
    text-align: left;
  }

  .avatar-picker-card.b_btn:hover {
    border-color: var(--primary-color);
    background: var(--surface-panel-bg);
  }

  .avatar-picker-card.b_btn.is-selected {
    border: 2px solid var(--primary-color);
    padding: 9px;
    background: var(--surface-panel-bg);
  }

  .avatar-picker-card__art {
    width: 66px;
    height: 66px;
    flex: 0 0 66px;
    border: 2px solid var(--surface-border-color);
    border-radius: 50%;
    background-color: var(--surface-panel-bg);
    box-sizing: border-box;
  }

  .is-selected .avatar-picker-card__art {
    border-color: var(--primary-color);
  }

  .avatar-picker-card__copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .avatar-picker-card__copy strong,
  .avatar-picker-card__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .avatar-picker-card__copy strong {
    font-size: 13px;
    line-height: 1.25;
    white-space: nowrap;
  }

  .avatar-picker-card__copy small {
    display: -webkit-box;
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.35;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .avatar-picker-card__check {
    width: 22px;
    height: 22px;
    position: absolute;
    top: 6px;
    right: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--surface-card-bg);
    border-radius: 50%;
    color: #fff;
    background: var(--primary-color);
  }

  .avatar-picker__section--custom {
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--surface-panel-bg);
  }

  .avatar-picker__section--custom .avatar-picker__section-heading {
    min-height: 0;
    margin-bottom: 12px;
  }

  .avatar-picker__custom-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .avatar-picker__upload.b_btn,
  .avatar-picker__restore.b_btn {
    min-height: 40px;
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    background: var(--surface-card-bg);
  }

  .avatar-picker__upload.b_btn {
    color: var(--primary-color);
    border-color: var(--primary-color);
  }

  .avatar-picker__footer {
    flex: 0 0 auto;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 18px max(12px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--surface-border-color);
    background: var(--background-color);
  }

  .avatar-picker__cancel.b_btn,
  .avatar-picker__confirm.b_btn {
    min-width: 112px;
    height: 42px;
  }

  :global(.avatar-picker-modal__content) {
    padding: 0 !important;
    overflow: hidden !important;
  }

  @media (max-width: 767px) {
    .avatar-picker__scroll {
      padding: 12px 12px 18px;
    }

    .avatar-picker__hero {
      gap: 13px;
      padding: 12px;
      border-radius: 15px;
    }

    .avatar-picker__preview-shell {
      width: 86px;
      height: 86px;
      flex-basis: 86px;
    }

    .avatar-picker__preview-art,
    .avatar-picker__preview-image {
      width: 82px;
      height: 82px;
    }

    .avatar-picker__hero-copy strong {
      font-size: 16px;
    }

    .avatar-picker__hero-copy span {
      display: -webkit-box;
      overflow: hidden;
      font-size: 12px;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }

    .avatar-picker__section {
      margin-top: 16px;
    }

    .avatar-picker__grid {
      gap: 8px;
    }

    .avatar-picker-card.b_btn {
      min-height: 0;
      flex-direction: column;
      gap: 7px;
      padding: 8px 6px 9px;
      border-radius: 13px;
      text-align: center;
    }

    .avatar-picker-card.b_btn.is-selected {
      padding: 7px 5px 8px;
    }

    .avatar-picker-card__art {
      width: 62px;
      height: 62px;
      flex-basis: 62px;
    }

    .avatar-picker-card__copy {
      width: 100%;
      gap: 2px;
    }

    .avatar-picker-card__copy small {
      display: block;
      overflow: hidden;
      white-space: nowrap;
    }

    .avatar-picker-card__check {
      top: 5px;
      right: 5px;
    }

    .avatar-picker__custom-actions,
    .avatar-picker__custom-actions :deep(.b-upload-trigger) {
      width: 100%;
    }

    .avatar-picker__upload.b_btn,
    .avatar-picker__restore.b_btn {
      width: 100%;
    }

    .avatar-picker__footer {
      padding-right: 12px;
      padding-left: 12px;
    }

    .avatar-picker__cancel.b_btn,
    .avatar-picker__confirm.b_btn {
      min-width: 0;
      flex: 1 1 0;
    }
  }

  :global(html.light-note-mobile-rendering) .avatar-picker-card.b_btn,
  :global(html.light-note-mobile-rendering) .avatar-picker__hero,
  :global(html.light-note-mobile-rendering) .avatar-picker__section--custom {
    border-color: var(--surface-border-color);
    background: var(--surface-card-bg);
  }

  :global(html.light-note-mobile-rendering) .avatar-picker-card.b_btn.is-selected {
    border-color: var(--primary-color);
    background: var(--surface-panel-bg);
  }
</style>
