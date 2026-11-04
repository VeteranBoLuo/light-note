<template>
  <div class="opinion-panel" :class="{ 'opinion-panel--mobile': bookmark.isMobile }">
    <BTabs class="opinion-tabs" :options="tabOptions" v-model:activeTab="activeTab" />

    <form v-if="isFormTab" class="opinion-compose" @submit.prevent="submit">
      <div class="opinion-field">
        <label class="opinion-field__label">{{ t('personCenter.opinions.feedbackType') }}</label>
        <BRadio
          class="opinion-types"
          v-model:value="opinionData.type"
          :options="radioOptions"
          :aria-label="t('personCenter.opinions.feedbackType')"
          :disabled="submitting"
          vertical
        />
      </div>

      <div class="opinion-field">
        <div class="opinion-field__heading">
          <label class="opinion-field__label" :for="contentId">{{ t('personCenter.opinions.contentLabel') }}</label>
          <span class="opinion-character-count">{{ opinionData.content.length }} / 500</span>
        </div>
        <BInput
          :id="contentId"
          class="opinion-content-input"
          type="textarea"
          v-model:value="opinionData.content"
          :rows="6"
          :maxlength="500"
          :disabled="submitting"
          :placeholder="t('personCenter.opinions.composePlaceholder')"
        />
        <p class="opinion-field__hint">{{
          t(bookmark.isMobile ? 'personCenter.opinions.mobileContentHint' : 'personCenter.opinions.contentHint')
        }}</p>
      </div>

      <div class="opinion-field">
        <div class="opinion-field__heading opinion-field__heading--images">
          <span class="opinion-field__label">{{ t('personCenter.opinions.imagesLabel') }}</span>
          <span class="opinion-field__hint"
            >{{ t('personCenter.opinions.optional') }} ·
            {{ t('personCenter.opinions.imageLimit', { count: maxImageCount }) }}</span
          >
        </div>
        <BUpload ref="uploadRef" multiple accept="image/*" :disabled="submitting" triggerless @change="uploadImg" />
        <div
          v-if="!bookmark.isMobile"
          class="opinion-upload-dropzone"
          :class="{ 'is-dragover': isDragOver }"
          role="group"
          :aria-label="t('personCenter.opinions.feedbackImages')"
          @click="focusPasteZone"
          @dragenter.prevent="handleDragEnter"
          @dragover.prevent="handleDragOver"
          @dragleave.prevent="handleDragLeave"
          @drop.prevent="handleDrop"
        >
          <div class="opinion-paste-area">
            <div
              ref="pasteZoneRef"
              class="opinion-paste-target"
              :tabindex="submitting ? -1 : 0"
              :contenteditable="!submitting"
              :aria-label="t('personCenter.opinions.uploadAction')"
              :aria-describedby="pasteHintId"
              @paste.prevent="handlePaste"
              @beforeinput.prevent
              @input="clearPasteZoneText"
              @keydown="handlePasteZoneKeydown"
            />
            <div class="opinion-paste-description" aria-hidden="true">
              <SvgIcon :src="icon.toolbox.image" size="26" />
              <div>
                <div>{{ t('personCenter.opinions.uploadAction') }}</div>
                <p :id="pasteHintId" class="opinion-field__hint">{{ t('personCenter.opinions.pasteHint') }}</p>
              </div>
            </div>
          </div>
          <BButton class="opinion-upload-trigger" :disabled="submitting" @click.stop="uploadRef?.open()">
            {{ t('personCenter.opinions.chooseImages') }}
          </BButton>
        </div>
        <div v-if="parsedDraftImages.length || bookmark.isMobile" class="opinion-images">
          <div v-for="(item, index) in parsedDraftImages" :key="`${item}-${index}`" class="opinion-image">
            <BButton
              class="opinion-image__preview"
              :aria-label="t('common.preview')"
              @click="bookmark.refreshViewer(item)"
            >
              <img :src="item" alt="" />
            </BButton>
            <BButton
              class="opinion-image__remove"
              icon-only
              :disabled="submitting"
              :aria-label="t('personCenter.opinions.removeImage')"
              @click="removeDraftImage(index)"
            >
              <SvgIcon :src="icon.common.close" size="13" />
            </BButton>
          </div>
          <BButton
            v-if="bookmark.isMobile && parsedDraftImages.length < maxImageCount"
            class="opinion-add-image"
            :disabled="submitting"
            @click="uploadRef?.open()"
          >
            <SvgIcon :src="icon.toolbox.image" size="26" />
            <span>{{ t('personCenter.opinions.addImage') }}</span>
          </BButton>
        </div>
        <p v-if="!bookmark.isMobile && parsedDraftImages.length >= maxImageCount" class="opinion-field__hint">
          {{ t('personCenter.opinions.replaceImageHint') }}
        </p>
      </div>

      <div class="opinion-contact">
        <BButton
          class="opinion-contact-toggle"
          :aria-expanded="showContact"
          :aria-controls="contactId"
          @click="showContact = !showContact"
        >
          <span class="opinion-field__label">{{ t('personCenter.opinions.contactInfo') }}</span>
          <span class="opinion-field__hint">{{ t('personCenter.opinions.optional') }}</span>
          <SvgIcon :src="icon.arrow_right" size="16" :class="{ 'is-expanded': showContact }" />
        </BButton>
        <div v-if="showContact" :id="contactId" class="opinion-contact__input">
          <BInput
            v-model:value="opinionData.phone"
            :disabled="submitting"
            :placeholder="t('personCenter.opinions.contactPlaceholder')"
          />
        </div>
      </div>

      <MobileStickyActionBar v-if="bookmark.isMobile" class="opinion-mobile-actions" :above-navigation="false">
        <BButton type="primary" native-type="submit" :loading="submitting" :disabled="!canSubmit">
          {{
            contentReady || submitting
              ? t('personCenter.opinions.submitFeedback')
              : t('personCenter.opinions.submitNeedMore')
          }}
        </BButton>
      </MobileStickyActionBar>
      <div v-else class="opinion-compose__footer">
        <span class="opinion-field__hint">{{ t('personCenter.opinions.submitHint') }}</span>
        <BButton
          type="primary"
          native-type="submit"
          class="opinion-submit"
          :loading="submitting"
          :disabled="!canSubmit"
        >
          {{ t('personCenter.opinions.submitFeedback') }}
        </BButton>
      </div>
    </form>

    <section v-else class="opinion-history" :aria-label="t('personCenter.opinions.feedbackHistory')">
      <BLoading :loading="loading && !appending" />
      <MobileNoticeStrip
        v-if="historyFailed && !appendingFailed"
        tone="danger"
        :icon="icon.message.error"
        :title="t('personCenter.opinions.historyLoadFailed')"
      >
        <BButton class="opinion-retry" @click="fetchOpinionHistory(appendingFailed)">{{ t('common.retry') }}</BButton>
      </MobileNoticeStrip>
      <div v-if="summary" class="opinion-summary">
        <span
          >{{ t('personCenter.opinions.pendingReply') }} <strong>{{ summary.pendingTotal || 0 }}</strong></span
        >
        <span
          >{{ t('personCenter.opinions.repliedStatus') }} <strong>{{ summary.repliedTotal || 0 }}</strong></span
        >
        <span
          >{{ t('personCenter.opinions.viewedStatus') }} <strong>{{ summary.viewedTotal || 0 }}</strong></span
        >
      </div>
      <div v-if="opinionHistory.length" class="opinion-list">
        <article v-for="item in opinionHistory" :key="item.id" class="opinion-history-entry">
          <header class="opinion-history-entry__head">
            <div class="opinion-history-entry__meta">
              <strong>{{ item.type }}</strong>
              <BChip :tone="item.status === 'viewed' ? 'success' : item.status === 'replied' ? 'neutral' : 'pending'">
                <span class="opinion-status-dot" aria-hidden="true" />{{ statusMeta(item).label }}
              </BChip>
              <BChip v-if="item.status === 'replied' && !item.replyViewed" tone="pending">
                {{ t('personCenter.opinions.newReply') }}
              </BChip>
            </div>
            <time class="opinion-history-entry__time" :title="item.createTime">{{ formatTime(item.createTime) }}</time>
          </header>
          <p class="opinion-history-entry__content">{{ item.content }}</p>
          <div v-if="parseImgArray(item.imgArray).length" class="opinion-card-images">
            <BButton
              v-for="(src, index) in parseImgArray(item.imgArray)"
              :key="`${src}-${index}`"
              class="opinion-history-image"
              :aria-label="`${t('common.preview')} ${index + 1}`"
              @click="bookmark.refreshViewer(src)"
            >
              <img :src="src" alt="" />
            </BButton>
          </div>
          <div v-if="item.replyContent" class="opinion-reply">
            <div class="opinion-reply__label">
              <span>{{ t('personCenter.opinions.replyLabel') }}</span>
              <time v-if="item.replyTime" :title="item.replyTime">· {{ formatTime(item.replyTime) }}</time>
            </div>
            <p>{{ item.replyContent }}</p>
          </div>
        </article>
      </div>
      <div v-else-if="!loading && !historyFailed" class="opinion-empty">
        <SvgIcon :src="icon.contextMenu.inbox" size="32" />
        <strong>{{ t('personCenter.opinions.noFeedbackHistory') }}</strong>
        <p>{{ t('personCenter.opinions.emptyHistoryDesc') }}</p>
        <BButton type="primary" @click="activeTab = 'form'">{{ t('personCenter.opinions.goFeedback') }}</BButton>
      </div>
      <MobileNoticeStrip
        v-if="historyFailed && appendingFailed"
        tone="danger"
        :icon="icon.message.error"
        :title="t('personCenter.opinions.historyLoadFailed')"
      >
        <BButton class="opinion-retry" @click="fetchOpinionHistory(true)">{{ t('common.retry') }}</BButton>
      </MobileNoticeStrip>
      <div v-if="hasMore && !historyFailed" ref="loadMoreRef" class="opinion-history__more">
        <BLoading :loading="appending" inline />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
  import BRadio from '@/components/base/BasicComponents/BRadio.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import dayjs from 'dayjs';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MobileNoticeStrip from '@/components/mobile/MobileNoticeStrip.vue';
  import MobileStickyActionBar from '@/components/mobile/MobileStickyActionBar.vue';
  import opinionApi from '@/api/opinionApi.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed, onBeforeUnmount, reactive, ref, useId, watch } from 'vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { cloneDeep } from 'lodash-es';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';
  import icon from '@/config/icon';

  const props = withDefaults(
    defineProps<{
      initialTab?: 'form' | 'history';
    }>(),
    {
      initialTab: 'form',
    },
  );

  const emit = defineEmits<{
    submitted: [];
    replyViewed: [];
  }>();

  const { t, locale } = useI18n();
  const contentId = useId();
  const contactId = useId();
  const pasteHintId = useId();
  const uploadRef = ref<InstanceType<typeof BUpload> | null>(null);
  const bookmark = bookmarkStore();
  const user = useUserStore();

  const activeTab = ref<'form' | 'history'>(props.initialTab === 'history' ? 'history' : 'form');

  const opinionData = reactive({
    type: '',
    content: '',
    imgArray: [],
    phone: '',
  });

  const summary = ref<any>(null);
  const opinionHistory = ref<any[]>([]);
  const loading = ref(false);
  const submitting = ref(false);
  const historyFailed = ref(false);
  const appending = ref(false);
  const appendingFailed = ref(false);
  const historyTotal = ref(0);
  const historyPage = ref(0);
  const loadMoreRef = ref<HTMLElement | null>(null);
  const hasMore = computed(() => opinionHistory.value.length < historyTotal.value);
  let historyGeneration = 0;
  const isDragOver = ref(false);
  const showContact = ref(false);
  const pasteZoneRef = ref<HTMLElement | null>(null);

  const tabOptions = computed(() => [
    { key: 'form', label: t('personCenter.opinions.submitFeedback') },
    {
      key: 'history',
      label: t('personCenter.opinions.feedbackHistory'),
      badge: user.unreadOpinionReplyTotal || undefined,
    },
  ]);

  const radioOptions = computed(() => [
    { label: t('personCenter.opinions.productSuggestion'), value: t('personCenter.opinions.productSuggestion') },
    { label: t('personCenter.opinions.functionFault'), value: t('personCenter.opinions.functionFault') },
    { label: t('personCenter.opinions.otherIssues'), value: t('personCenter.opinions.otherIssues') },
  ]);

  const isFormTab = computed(() => activeTab.value === 'form');
  const maxImageCount = computed(() => (bookmark.isMobile ? 2 : 3));
  const parsedDraftImages = computed(() => opinionData.imgArray.map((item) => item));
  const contentReady = computed(() => Boolean(opinionData.type) && opinionData.content.trim().length >= 6);
  const canSubmit = computed(() => contentReady.value && !submitting.value);

  resetDraft();

  function resetDraft() {
    opinionData.type = t('personCenter.opinions.productSuggestion');
    opinionData.content = '';
    opinionData.imgArray = [];
    opinionData.phone = '';
  }

  function parseImgArray(value: string | string[]) {
    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }
    if (!value) {
      return [];
    }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  function appendImageUrl(fileUrl: string) {
    if (submitting.value || !fileUrl) {
      return;
    }
    if (opinionData.imgArray.length >= maxImageCount.value) {
      opinionData.imgArray.shift();
    }
    opinionData.imgArray.push(fileUrl);
  }

  function uploadImg(event) {
    event.forEach((img) => {
      const src = img?.file || img;
      if (typeof src === 'string') appendImageUrl(src);
    });
  }

  function clearPasteZoneText() {
    if (pasteZoneRef.value) pasteZoneRef.value.textContent = '';
  }

  function focusPasteZone() {
    if (!submitting.value) pasteZoneRef.value?.focus({ preventScroll: true });
  }

  function handlePasteZoneKeydown(event: KeyboardEvent) {
    const allowedKeys = ['Tab'];
    if (event.target !== pasteZoneRef.value) return;
    if (!allowedKeys.includes(event.key) && !(event.metaKey || event.ctrlKey)) {
      event.preventDefault();
    }
  }

  async function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function appendFiles(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      message.warning(t('personCenter.opinions.pasteImageOnly'));
      return;
    }
    for (const file of imageFiles) {
      const fileUrl = await readFileAsDataUrl(file);
      appendImageUrl(fileUrl);
    }
  }

  async function handlePaste(event: ClipboardEvent) {
    if (submitting.value) return;
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length > 0) {
      await appendFiles(files);
      clearPasteZoneText();
      return;
    }
    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (imageFiles.length > 0) {
      await appendFiles(imageFiles);
      clearPasteZoneText();
    }
  }

  function handleDragEnter() {
    isDragOver.value = true;
  }

  function handleDragOver() {
    isDragOver.value = true;
  }

  function handleDragLeave(event: DragEvent) {
    const currentTarget = event.currentTarget as HTMLElement | null;
    const relatedTarget = event.relatedTarget as Node | null;
    if (currentTarget && relatedTarget && currentTarget.contains(relatedTarget)) {
      return;
    }
    isDragOver.value = false;
  }

  async function handleDrop(event: DragEvent) {
    isDragOver.value = false;
    if (submitting.value) return;
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length > 0) {
      await appendFiles(files);
    }
  }

  function removeDraftImage(index: number) {
    opinionData.imgArray.splice(index, 1);
  }

  async function submit() {
    if (submitting.value) return;
    if (!opinionData.type) {
      message.warning(t('personCenter.opinions.chooseType'));
      return;
    }
    if (opinionData.content.trim().length < 6) {
      message.warning(t('personCenter.opinions.contentPlaceholder'));
      return;
    }

    submitting.value = true;
    try {
      const params: any = cloneDeep(opinionData);
      params.content = params.content.trim();
      params.imgArray = JSON.stringify(params.imgArray);
      const res = await opinionApi.createOpinion(params);
      if (res.status === 200) {
        recordOperation({
          module: t('personCenter.opinions.feedbackModule'),
          operation: `${t('personCenter.opinions.submitFeedback')}成功`,
        });
        message.success(t('personCenter.opinions.thankYouFeedback'));
        resetDraft();
        showContact.value = false;
        activeTab.value = 'history';
        emit('submitted');
      }
    } catch {
      // 请求层已展示错误；失败保留正文、截图和联系方式，允许重试。
    } finally {
      submitting.value = false;
    }
  }

  async function fetchOpinionHistory(append = false) {
    if (append && (loading.value || !hasMore.value)) return;
    const generation = append ? historyGeneration : ++historyGeneration;
    const userId = user.id;
    const page = append ? historyPage.value + 1 : 1;
    const isCurrent = () => generation === historyGeneration && user.id === userId && activeTab.value === 'history';
    loading.value = true;
    appending.value = append;
    appendingFailed.value = false;
    historyFailed.value = false;
    try {
      const params = { currentPage: page, pageSize: 20, filters: { hideInternal: false } };
      let res = await opinionApi.getOpinionList(params);
      if (!isCurrent()) return;
      if (res.status !== 200) throw new Error('OPINION_HISTORY_FAILED');
      // root 的列表可包含其他账号；只标记当前账号自己的回复。
      const unreadReplyIds = (res.data.items || [])
        .filter((item) => item.status === 'replied' && !item.replyViewed && String(item.userId) === String(userId))
        .map((item) => item.id);
      if (unreadReplyIds.length) {
        const viewed = await opinionApi.markOpinionReplyViewed({ ids: unreadReplyIds });
        if (!isCurrent()) return;
        if (viewed.status === 200) {
          user.unreadOpinionReplyTotal = Math.max(
            0,
            user.unreadOpinionReplyTotal - Number(viewed.data?.affectedRows || 0),
          );
          emit('replyViewed');
          res = await opinionApi.getOpinionList(params);
          if (!isCurrent()) return;
          if (res.status !== 200) throw new Error('OPINION_HISTORY_FAILED');
        }
      }
      const items = res.data.items || [];
      const existing = new Set(opinionHistory.value.map((item) => item.id));
      opinionHistory.value = append
        ? [...opinionHistory.value, ...items.filter((item) => !existing.has(item.id))]
        : items;
      summary.value = res.data.summary || null;
      historyTotal.value = Number(res.data.total || 0);
      historyPage.value = page;
    } catch {
      if (!isCurrent()) return;
      historyFailed.value = true;
      appendingFailed.value = append;
    } finally {
      if (isCurrent()) {
        loading.value = false;
        appending.value = false;
      }
    }
  }

  function formatTime(value: string) {
    if (!value) return '';
    const time = dayjs(value);
    if (!time.isValid()) return value;
    const format =
      locale.value === 'zh-CN'
        ? time.year() === dayjs().year()
          ? 'M月D日 HH:mm'
          : 'YYYY年M月D日 HH:mm'
        : 'MMM D, YYYY HH:mm';
    return time.format(format);
  }

  function statusMeta(item) {
    const status = item?.status || 'pending';
    const metaMap = {
      pending: { label: t('personCenter.opinions.pendingReply') },
      replied: { label: t('personCenter.opinions.repliedStatus') },
      viewed: { label: t('personCenter.opinions.viewedStatus') },
    };
    return metaMap[status] || metaMap.pending;
  }

  watch(
    () => props.initialTab,
    (value) => {
      activeTab.value = value === 'history' ? 'history' : 'form';
    },
  );
  watch(
    [activeTab, () => user.id],
    ([, userId], previous) => {
      historyGeneration += 1;
      loading.value = false;
      if (previous && previous[1] !== userId) {
        opinionHistory.value = [];
        summary.value = null;
        historyTotal.value = 0;
        historyPage.value = 0;
        resetDraft();
        showContact.value = false;
      }
      if (activeTab.value === 'history') fetchOpinionHistory();
    },
    { immediate: true },
  );

  let observer: IntersectionObserver | undefined;
  watch(
    loadMoreRef,
    (element) => {
      observer?.disconnect();
      if (!element || typeof IntersectionObserver === 'undefined') return;
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting) && !historyFailed.value) fetchOpinionHistory(true);
        },
        { rootMargin: '160px' },
      );
      observer.observe(element);
    },
    { flush: 'post' },
  );
  onBeforeUnmount(() => {
    historyGeneration += 1;
    observer?.disconnect();
  });
</script>

<style scoped lang="less">
  .opinion-panel {
    color: var(--text-color);
    font-size: var(--ui-font-14, 14px);
    min-width: 0;
  }
  .opinion-tabs.tab-container {
    gap: var(--ui-space-32, 32px);
    margin-bottom: var(--ui-space-24, 24px);
    padding-bottom: var(--ui-space-10, 10px);
    border-color: var(--surface-border-color);
  }
  .opinion-tabs :deep(.tab) {
    font-size: var(--ui-font-16, 16px);
  }
  .opinion-tabs :deep(.tab.is-active) {
    color: var(--workspace-purple-text);
    font-weight: 600;
  }
  .opinion-compose {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-20, 20px);
  }
  .opinion-field {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
  }
  .opinion-field__label {
    font-size: var(--ui-font-14, 14px);
    font-weight: 600;
    line-height: 1.5;
  }
  .opinion-field__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-10, 10px);
  }
  .opinion-field__heading--images {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
  .opinion-field__hint,
  .opinion-character-count {
    margin: 0;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .opinion-character-count {
    font-variant-numeric: tabular-nums;
  }
  .opinion-types {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
  }
  .opinion-types :deep(.b-radio-option.b_btn) {
    width: auto;
    min-height: var(--ui-control-36, 36px);
    padding: var(--ui-space-6, 6px) var(--ui-space-16, 16px);
    align-items: center;
    gap: var(--ui-space-8, 8px);
  }
  .opinion-types :deep(.b-radio-option.b_btn.is-selected) {
    color: var(--workspace-purple-text);
    border-color: var(--primary-color);
    background: var(--workspace-purple-selected);
  }
  .opinion-types :deep(.b-radio-option__indicator) {
    margin: 0;
  }
  .opinion-types :deep(.b-radio-option__body strong) {
    font-weight: 400;
  }
  .opinion-content-input :deep(.b-textarea) {
    min-height: var(--ui-layout-170, 170px);
    resize: vertical;
    padding-top: var(--ui-space-12, 12px);
    padding-bottom: var(--ui-space-12, 12px);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.6;
  }
  .opinion-upload-dropzone {
    display: flex;
    align-items: center;
    gap: var(--ui-space-16, 16px);
    padding: var(--ui-space-14, 14px) var(--ui-space-20, 20px);
    border: 1px dashed var(--bl-input-border-color);
    border-radius: 10px;
    outline: none;
  }
  .opinion-upload-dropzone:focus-within,
  .opinion-upload-dropzone.is-dragover {
    border-color: var(--primary-color);
    outline: 1px solid var(--primary-color);
    outline-offset: -1px;
  }
  .opinion-upload-dropzone.is-dragover {
    background: var(--workspace-purple-selected);
  }
  .opinion-paste-area {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: var(--ui-layout-40, 40px);
    display: flex;
    align-items: center;
  }
  .opinion-paste-target {
    position: absolute;
    inset: 0;
    outline: none;
    caret-color: transparent;
    overflow: hidden;
    cursor: text;
  }
  .opinion-paste-description {
    display: flex;
    align-items: center;
    gap: var(--ui-space-14, 14px);
    pointer-events: none;
    color: var(--desc-color);
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .opinion-paste-description > :first-child {
    flex: none;
  }
  .opinion-paste-description p {
    margin-top: var(--ui-space-2, 2px);
  }
  .opinion-upload-trigger.b_btn {
    flex: none;
    border: 1px solid var(--bl-input-border-color);
    background: var(--surface-card-bg);
    color: var(--text-color);
  }
  .opinion-images,
  .opinion-card-images {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--ui-space-12, 12px);
  }
  .opinion-image {
    position: relative;
    width: var(--ui-layout-82, 82px);
    height: var(--ui-layout-82, 82px);
  }
  .opinion-image__preview.b_btn,
  .opinion-history-image.b_btn {
    width: 100%;
    height: 100%;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--surface-panel-bg);
  }
  .opinion-image img,
  .opinion-history-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .opinion-image__remove.b_btn {
    position: absolute;
    top: calc(0px - var(--ui-space-10, 10px));
    right: calc(0px - var(--ui-space-10, 10px));
    width: var(--ui-layout-44, 44px);
    height: var(--ui-layout-44, 44px);
    padding: 0;
    color: var(--text-color);
    background: transparent;
  }
  .opinion-image__remove::before {
    content: '';
    position: absolute;
    inset: var(--ui-space-10, 10px);
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    background: var(--surface-card-bg);
  }
  .opinion-image__remove :deep(.btn-icon) {
    position: relative;
  }
  .opinion-add-image.b_btn {
    width: var(--ui-layout-82, 82px);
    height: var(--ui-layout-82, 82px);
    padding: var(--ui-space-8, 8px);
    flex-direction: column;
    gap: var(--ui-space-6, 6px);
    border: 1px dashed var(--bl-input-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: transparent;
    font-size: var(--ui-font-12, 12px);
    line-height: 1.3;
    white-space: normal;
  }
  .opinion-contact {
    border-top: 1px solid var(--surface-divider-color);
    border-bottom: 1px solid var(--surface-divider-color);
  }
  .opinion-contact-toggle.b_btn {
    width: 100%;
    height: auto;
    min-height: var(--ui-control-44, 44px);
    padding: var(--ui-space-10, 10px) 0;
    justify-content: flex-start;
    gap: var(--ui-space-12, 12px);
    color: var(--text-color);
    background: transparent;
    line-height: 1.5;
  }
  .opinion-contact-toggle > :last-child {
    margin-left: auto;
    transform: rotate(90deg);
    color: var(--desc-color);
  }
  .opinion-contact-toggle > .is-expanded {
    transform: rotate(-90deg);
  }
  .opinion-contact__input {
    padding-bottom: var(--ui-space-14, 14px);
  }
  .opinion-compose__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-16, 16px);
  }
  .opinion-submit.b_btn {
    min-width: var(--ui-layout-128, 128px);
    height: var(--ui-control-36, 36px);
  }
  .opinion-history {
    position: relative;
    min-height: var(--ui-layout-280, 280px);
  }
  .opinion-summary {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px) var(--ui-space-16, 16px);
    align-items: center;
    padding-bottom: var(--ui-space-20, 20px);
    color: var(--desc-color);
    font-size: var(--ui-font-13, 13px);
  }
  .opinion-summary span {
    white-space: nowrap;
  }
  .opinion-summary span + span::before {
    content: '·';
    margin-right: var(--ui-space-16, 16px);
  }
  .opinion-summary strong {
    font-weight: 400;
    font-variant-numeric: tabular-nums;
  }
  .opinion-history-entry {
    display: flex;
    flex-direction: column;
    gap: var(--ui-space-16, 16px);
    padding: var(--ui-space-28, 28px) 0;
    border-top: 1px solid var(--surface-divider-color);
    min-width: 0;
  }
  .opinion-history-entry:last-child {
    padding-bottom: var(--ui-space-12, 12px);
  }
  .opinion-history-entry__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-8, 8px) var(--ui-space-16, 16px);
    flex-wrap: wrap;
  }
  .opinion-history-entry__meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-10, 10px);
    min-width: 0;
  }
  .opinion-history-entry__meta > strong {
    font-size: var(--ui-font-14, 14px);
  }
  .opinion-history-entry__time,
  .opinion-reply__label {
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    line-height: 1.5;
  }
  .opinion-status-dot {
    width: var(--ui-layout-6, 6px);
    height: var(--ui-layout-6, 6px);
    margin-right: var(--ui-space-5, 5px);
    border-radius: 50%;
    background: currentColor;
    flex: none;
  }
  .opinion-history-entry__content,
  .opinion-reply p {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    line-height: 1.7;
  }
  .opinion-history-image.b_btn {
    width: var(--ui-layout-104, 104px);
    height: var(--ui-layout-68, 68px);
  }
  .opinion-reply {
    padding: var(--ui-space-12, 12px) var(--ui-space-16, 16px);
    border-left: 2px solid var(--surface-border-color);
    border-radius: 0 8px 8px 0;
    background: var(--surface-panel-bg);
  }
  .opinion-reply__label {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-4, 4px);
    margin-bottom: var(--ui-space-8, 8px);
  }
  .opinion-retry.b_btn {
    margin-top: var(--ui-space-8, 8px);
    color: inherit;
    border: 1px solid currentColor;
    background: transparent;
  }
  .opinion-history__more {
    position: relative;
    min-height: var(--ui-layout-40, 40px);
    display: flex;
    justify-content: center;
  }
  .opinion-empty {
    min-height: var(--ui-layout-280, 280px);
    padding: var(--ui-space-24, 24px);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-space-12, 12px);
    text-align: center;
    color: var(--desc-color);
  }
  .opinion-empty strong {
    color: var(--text-color);
  }
  .opinion-empty p {
    margin: 0;
    line-height: 1.6;
  }

  .opinion-panel--mobile {
    .opinion-tabs.tab-container {
      gap: 0;
      justify-content: space-around;
      padding-bottom: var(--ui-space-6, 6px);
      margin-bottom: var(--ui-space-20, 20px);
    }
    .opinion-tabs :deep(.tab) {
      flex: none;
      justify-content: center;
      min-height: var(--ui-control-36, 36px);
      font-size: var(--ui-font-15, 15px);
    }
    .opinion-compose {
      padding-bottom: calc(var(--ui-layout-100, 100px) + env(safe-area-inset-bottom));
    }
    .opinion-types {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--ui-space-8, 8px);
    }
    .opinion-types :deep(.b-radio-option.b_btn) {
      justify-content: center;
      padding: var(--ui-space-6, 6px) var(--ui-space-2, 2px);
      gap: var(--ui-space-4, 4px);
    }
    .opinion-types :deep(.b-radio-option__indicator) {
      width: var(--ui-layout-12, 12px);
      height: var(--ui-layout-12, 12px);
      flex-basis: var(--ui-layout-12, 12px);
    }
    .opinion-types :deep(.b-radio-option__body strong) {
      font-size: var(--ui-font-12, 12px);
      line-height: 1.3;
    }
    .opinion-field__heading--images {
      gap: var(--ui-space-8, 8px);
    }
    .opinion-content-input :deep(.b-textarea) {
      resize: none;
    }
    .opinion-summary {
      gap: var(--ui-space-6, 6px) var(--ui-space-8, 8px);
      font-size: var(--ui-font-12, 12px);
      padding-bottom: var(--ui-space-16, 16px);
    }
    .opinion-summary span + span::before {
      margin-right: var(--ui-space-8, 8px);
    }
    .opinion-history-entry {
      gap: var(--ui-space-14, 14px);
      padding: var(--ui-space-20, 20px) 0;
    }
    .opinion-history-entry__meta {
      gap: var(--ui-space-8, 8px);
    }
    .opinion-history-image.b_btn {
      width: var(--ui-layout-88, 88px);
      height: var(--ui-layout-60, 60px);
    }
    .opinion-reply {
      padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
    }
    .opinion-mobile-actions.mobile-sticky-action-bar {
      left: 0;
      right: 0;
      bottom: 0;
      min-height: 0;
      padding: var(--ui-space-12, 12px) var(--ui-space-20, 20px)
        calc(var(--ui-space-12, 12px) + env(safe-area-inset-bottom));
      border: 0;
      border-top: 1px solid var(--surface-border-color);
      border-radius: 0;
      background: var(--background-color);
      box-shadow: none;
    }
  }
</style>
