<template>
  <section
    class="chat-sticker-panel"
    :class="{ 'is-embedded': embedded }"
    :aria-label="t('communityChat.sticker.customTitle')"
  >
    <header class="chat-sticker-panel__header">
      <span>
        <strong>{{ t('communityChat.sticker.customTitle') }}</strong>
        <small>{{ t('communityChat.sticker.count', { count: items.length, max: maxCount }) }}</small>
      </span>
      <BUpload
        raw-file
        :multiple="false"
        accept="image/jpeg,image/png,image/webp"
        :max-total-size="null"
        :disabled="uploading || items.length >= maxCount"
        @change="handleUpload"
      >
        <BButton size="small" type="primary" :loading="uploading" :disabled="items.length >= maxCount">
          <SvgIcon v-if="!uploading" :src="icon.file_upload" size="15" aria-hidden="true" />
          {{ t('communityChat.sticker.uploadAction') }}
        </BButton>
      </BUpload>
    </header>

    <div v-if="loading" class="chat-sticker-panel__state">
      <BLoading inline loading :title="t('communityChat.sticker.loading')" />
    </div>
    <div v-else-if="loadFailed" class="chat-sticker-panel__state" role="status">
      <span>{{ t('communityChat.sticker.loadFailed') }}</span>
      <BButton size="small" @click="load">{{ t('communityChat.profile.retry') }}</BButton>
    </div>
    <div v-else-if="items.length" class="chat-sticker-panel__grid">
      <div v-for="sticker in items" :key="sticker.publicId" class="chat-sticker-panel__item">
        <BButton
          class="chat-sticker-panel__image"
          :aria-label="sticker.name || t('communityChat.sticker.sendCustom')"
          @click="emit('select', sticker.publicId)"
        >
          <img :src="sticker.url" :alt="sticker.name || t('communityChat.sticker.customAlt')" loading="lazy" />
        </BButton>
        <BButton
          class="chat-sticker-panel__remove"
          :loading="removingId === sticker.publicId"
          :aria-label="t('communityChat.sticker.removeAction')"
          @click.stop="confirmRemove(sticker)"
        >
          <SvgIcon :src="icon.common.close" size="11" aria-hidden="true" />
        </BButton>
      </div>
    </div>
    <div v-else class="chat-sticker-panel__empty">
      <span class="chat-sticker-panel__empty-icon" aria-hidden="true">
        <SvgIcon :src="icon.noteDetail.toolbar.image" size="28" />
      </span>
      <strong>{{ t('communityChat.sticker.emptyTitle') }}</strong>
      <p>{{ t('communityChat.sticker.emptyDescription') }}</p>
    </div>

    <p class="chat-sticker-panel__hint">{{ t('communityChat.sticker.uploadHint') }}</p>
  </section>
</template>

<script setup lang="ts">
  import { onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import {
    getCommunityChatCustomStickers,
    removeCommunityChatCustomSticker,
    uploadCommunityChatCustomSticker,
    type CommunityChatCustomSticker,
  } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { prepareCommunityChatSticker } from '@/utils/prepareCommunityChatSticker';

  const props = withDefaults(defineProps<{ embedded?: boolean; refreshKey?: number }>(), {
    embedded: false,
    refreshKey: 0,
  });
  const emit = defineEmits<{ select: [publicId: string] }>();
  const { t } = useI18n();
  const items = ref<CommunityChatCustomSticker[]>([]);
  const loading = ref(false);
  const loadFailed = ref(false);
  const uploading = ref(false);
  const removingId = ref('');
  const maxCount = ref(40);
  const maxBytes = ref(2 * 1024 * 1024);
  const maxEdge = ref(4096);
  const maxPixels = ref(8_000_000);

  async function load() {
    loading.value = true;
    loadFailed.value = false;
    try {
      const response = await getCommunityChatCustomStickers();
      items.value = Array.isArray(response.data?.items) ? response.data.items : [];
      maxCount.value = Math.max(1, Number(response.data?.maxCount || 40));
      maxBytes.value = Math.max(1, Number(response.data?.maxBytes || 2 * 1024 * 1024));
      maxEdge.value = Math.max(1, Number(response.data?.maxEdge || 4096));
      maxPixels.value = Math.max(1, Number(response.data?.maxPixels || 8_000_000));
    } catch {
      loadFailed.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function handleUpload(selected: unknown) {
    const file = Array.isArray(selected) && selected[0] instanceof File ? selected[0] : null;
    if (!file || uploading.value) return;
    uploading.value = true;
    try {
      const prepared = await prepareCommunityChatSticker(file, {
        maxBytes: maxBytes.value,
        maxEdge: maxEdge.value,
        maxPixels: maxPixels.value,
      });
      if (prepared.file.size > maxBytes.value) {
        message.warning(t('communityChat.sticker.compressedTooLarge'));
        return;
      }
      const response = await uploadCommunityChatCustomSticker(prepared.file);
      const sticker = response.data?.sticker as CommunityChatCustomSticker | undefined;
      if (!sticker?.publicId) throw new Error('CUSTOM_STICKER_RESPONSE_INVALID');
      const existingIndex = items.value.findIndex((item) => item.publicId === sticker.publicId);
      if (response.data?.duplicate && existingIndex >= 0) {
        items.value = items.value.map((item, index) => (index === existingIndex ? sticker : item));
      } else {
        items.value = [sticker, ...items.value.filter((item) => item.publicId !== sticker.publicId)];
      }
      message.success(
        t(
          response.data?.duplicate
            ? 'communityChat.sticker.duplicate'
            : prepared.compressed
              ? 'communityChat.sticker.compressedAndUploaded'
              : 'communityChat.sticker.uploaded',
        ),
      );
    } catch (error: any) {
      // Axios 的 ERR_BAD_REQUEST 只是传输层分类；服务端业务码才决定用户应该看到的操作提示。
      const errorCode = String(error?.response?.data?.data?.code || error?.code || error?.message || '');
      if (errorCode === 'CUSTOM_STICKER_DIMENSIONS_INVALID') {
        message.error(t('communityChat.sticker.dimensionsTooLarge'));
      } else if (errorCode === 'CUSTOM_STICKER_TOO_LARGE') {
        message.error(t('communityChat.sticker.compressedTooLarge'));
      } else if (errorCode.startsWith('CUSTOM_STICKER_')) {
        message.error(t('communityChat.sticker.compressFailed'));
      } else {
        const responseMessage = String(error?.response?.data?.msg || error?.message || '');
        const safeMessage = /request failed with status code/i.test(responseMessage) ? '' : responseMessage;
        message.error(safeMessage || t('communityChat.sticker.uploadFailed'));
      }
    } finally {
      uploading.value = false;
    }
  }

  function confirmRemove(sticker: CommunityChatCustomSticker) {
    Alert.alert({
      title: t('communityChat.sticker.removeConfirmTitle'),
      content: t('communityChat.sticker.removeConfirmDescription'),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('communityChat.sticker.removeAction'),
          type: 'danger',
          function: () => {
            Alert.destroy();
            void remove(sticker);
          },
        },
      ],
    });
  }

  async function remove(sticker: CommunityChatCustomSticker) {
    if (removingId.value) return;
    removingId.value = sticker.publicId;
    try {
      await removeCommunityChatCustomSticker(sticker.publicId);
      items.value = items.value.filter((item) => item.publicId !== sticker.publicId);
      message.success(t('communityChat.sticker.removed'));
    } catch (error: any) {
      message.error(error?.message || t('communityChat.sticker.removeFailed'));
    } finally {
      removingId.value = '';
    }
  }

  onMounted(load);
  watch(
    () => props.refreshKey,
    (next, previous) => {
      if (next !== previous) void load();
    },
  );
</script>

<style scoped lang="less">
  .chat-sticker-panel {
    width: min(360px, 100%);
    height: min(380px, 42vh);
    min-height: 260px;
    padding: 10px;
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 9px;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
    box-shadow: var(--workspace-panel-shadow);
  }

  .chat-sticker-panel__header,
  .chat-sticker-panel__header > span {
    display: flex;
    align-items: center;
  }

  .chat-sticker-panel__header {
    justify-content: space-between;
    gap: 10px;
  }

  .chat-sticker-panel__header > span {
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }

  .chat-sticker-panel__header strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .chat-sticker-panel__header small,
  .chat-sticker-panel__hint {
    color: var(--desc-color);
    font-size: 10px;
  }

  .chat-sticker-panel__state,
  .chat-sticker-panel__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    color: var(--desc-color);
    text-align: center;
  }

  .chat-sticker-panel__empty > span {
    width: 44px;
    height: 44px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    color: var(--desc-color);
    background: var(--hover-background);
  }

  .chat-sticker-panel__empty strong {
    color: var(--text-color);
    font-size: 13px;
  }

  .chat-sticker-panel__empty p,
  .chat-sticker-panel__hint {
    margin: 0;
    line-height: 1.55;
  }

  .chat-sticker-panel__empty p {
    max-width: 260px;
  }

  .chat-sticker-panel__grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    align-content: start;
    gap: 6px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .chat-sticker-panel__item {
    position: relative;
    min-width: 0;
    aspect-ratio: 1;
  }

  .chat-sticker-panel__image {
    width: 100%;
    height: 100%;
    padding: 5px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    transition: background-color 120ms ease;
  }

  .chat-sticker-panel__image:hover {
    border-color: transparent;
    background: var(--hover-background);
  }

  .chat-sticker-panel__image:focus-visible {
    border-color: var(--primary-color);
    background: var(--hover-background);
    outline: none;
  }

  .chat-sticker-panel__image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .chat-sticker-panel__remove {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    color: var(--desc-color);
    background: var(--card-background);
  }

  html.light-note-mobile-rendering .chat-sticker-panel {
    width: 100%;
    height: min(300px, 38vh);
    min-height: 220px;
    box-shadow: none;
  }

  .chat-sticker-panel.is-embedded,
  html.light-note-mobile-rendering .chat-sticker-panel.is-embedded {
    width: 100%;
    height: 100%;
    min-height: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
</style>
