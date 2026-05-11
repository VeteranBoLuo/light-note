<template>
  <div class="opinion-panel" :class="{ 'opinion-panel--page': pageMode, 'opinion-panel--desktop': !bookmark.isMobile }">
    <div class="opinion-shell">
      <BTabs :options="tabOptions" v-model:activeTab="activeTab" />

      <div v-if="isFormTab" class="opinion-compose opinion-body">
        <section class="opinion-card">
          <div class="opinion-card__header">
            <div>
              <div class="opinion-card__title">{{ t('personCenter.opinions.composeTitle') }}</div>
              <div class="opinion-card__desc">{{ t('personCenter.opinions.composeDesc') }}</div>
            </div>
            <div class="opinion-limit">{{ t('personCenter.opinions.imageLimit', { count: maxImageCount }) }}</div>
          </div>

          <div class="opinion-example">
            <div class="opinion-example__title">{{ t('personCenter.opinions.exampleTitle') }}</div>
            <div class="opinion-example__desc">{{ t('personCenter.opinions.exampleDesc') }}</div>
          </div>

          <div class="opinion-field">
            <label class="opinion-field__label">{{ t('personCenter.opinions.feedbackType') }}</label>
            <b-radio v-model:value="opinionData.type" :options="radioOptions" />
          </div>

          <div class="opinion-field">
            <label class="opinion-field__label">{{ t('personCenter.opinions.feedbackContent') }}</label>
            <b-input
              type="textarea"
              v-model:value="opinionData.content"
              :placeholder="t('personCenter.opinions.contentPlaceholder')"
            />
          </div>

          <div class="opinion-field">
            <label class="opinion-field__label">{{ t('personCenter.opinions.feedbackImages') }}</label>
            <div
              ref="pasteZoneRef"
              class="opinion-upload-dropzone"
              :class="{ 'opinion-upload-dropzone--dragover': isDragOver }"
              tabindex="0"
              contenteditable="true"
              @dragenter.prevent="handleDragEnter"
              @dragover.prevent="handleDragOver"
              @dragleave.prevent="handleDragLeave"
              @drop.prevent="handleDrop"
              @paste.prevent="handlePaste"
              @input.prevent="clearPasteZoneText"
              @keydown="handlePasteZoneKeydown"
            >
              <div class="opinion-upload-dropzone__main">{{ t('personCenter.opinions.dropzoneTitle') }}</div>
              <div class="opinion-upload-dropzone__sub">{{ t('personCenter.opinions.dropzoneDesc') }}</div>
              <div class="opinion-upload-dropzone__actions">
                <b-upload multiple accept="image/*" @change="uploadImg" />
              </div>
            </div>
            <div class="opinion-upload__hint">{{ t('personCenter.opinions.imageTip') }}</div>
            <div v-if="parsedDraftImages.length > 0" class="opinion-images">
              <div v-for="(item, index) in parsedDraftImages" :key="`${item}-${index}`" class="opinion-image">
                <img :src="item" alt="" />
                <button class="opinion-image__remove" @click="removeDraftImage(index)">×</button>
              </div>
            </div>
          </div>

          <div class="opinion-field">
            <label class="opinion-field__label">{{ t('personCenter.opinions.contactInfo') }}</label>
            <b-input v-model:value="opinionData.phone" :placeholder="t('personCenter.opinions.contactPlaceholder')" />
          </div>
        </section>

        <b-button type="primary" class="opinion-submit" @click="submit">
          {{ t('personCenter.opinions.submit') }}
        </b-button>
      </div>

      <div v-else class="opinion-history opinion-body">
        <b-loading :loading="loading" />
        <div v-show="!loading" class="opinion-history__content">
          <div class="opinion-summary" v-if="summary">
            <div class="opinion-summary__item">
              <strong>{{ summary.pendingTotal || 0 }}</strong>
              <span>{{ t('personCenter.opinions.pendingReply') }}</span>
            </div>
            <div class="opinion-summary__item">
              <strong>{{ summary.repliedTotal || 0 }}</strong>
              <span>{{ t('personCenter.opinions.repliedStatus') }}</span>
            </div>
            <div class="opinion-summary__item">
              <strong>{{ summary.viewedTotal || 0 }}</strong>
              <span>{{ t('personCenter.opinions.viewedStatus') }}</span>
            </div>
          </div>

          <div v-if="opinionHistory.length > 0" class="opinion-list">
            <article v-for="item in opinionHistory" :key="item.id" class="opinion-history-card">
              <div class="opinion-history-card__head">
                <div class="opinion-history-card__title">
                  <span>{{ item.type }}</span>
                  <span class="opinion-status-badge" :class="`opinion-status-badge--${item.status || 'pending'}`">
                    {{ statusMeta(item).label }}
                  </span>
                  <span
                    v-if="item.status === 'replied' && !item.replyViewed"
                    class="opinion-status-badge opinion-status-badge--new"
                  >
                    {{ t('personCenter.opinions.newReply') }}
                  </span>
                </div>
                <span class="opinion-history-card__time">{{ item.createTime }}</span>
              </div>

              <div class="opinion-history-card__section">
                <label>{{ t('personCenter.opinions.feedbackContent') }}</label>
                <p>{{ item.content }}</p>
              </div>

              <div class="opinion-history-card__section">
                <label>{{ t('personCenter.opinions.feedbackImages') }}</label>
                <div v-if="parseImgArray(item.imgArray).length > 0" class="opinion-card-images">
                  <img
                    v-for="(src, index) in parseImgArray(item.imgArray)"
                    :key="`${src}-${index}`"
                    :src="src"
                    alt=""
                    @click="bookmark.refreshViewer(src)"
                  />
                </div>
                <span v-else class="opinion-history-card__placeholder">-</span>
              </div>

              <div class="opinion-reply" v-if="item.replyContent">
                <div class="opinion-reply__label">{{ t('personCenter.opinions.developerReply') }}</div>
                <div class="opinion-reply__content">{{ item.replyContent }}</div>
                <div class="opinion-reply__time" v-if="item.replyTime">
                  {{ t('personCenter.opinions.replyTime') }}{{ item.replyTime }}
                </div>
              </div>
            </article>
          </div>

          <a-empty v-else :description="t('personCenter.opinions.noFeedbackHistory')" class="both-center" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import BRadio from '@/components/base/BasicComponents/BRadio.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import opinionApi from '@/api/opinionApi.ts';
  import { bookmarkStore, useUserStore } from '@/store';
  import { computed, onMounted, reactive, ref, watch } from 'vue';
  import { message } from 'ant-design-vue';
  import { cloneDeep } from 'lodash-es';
  import { useI18n } from 'vue-i18n';
  import { recordOperation } from '@/api/commonApi.ts';

  const props = withDefaults(
    defineProps<{
      pageMode?: boolean;
      initialTab?: 'form' | 'history';
    }>(),
    {
      pageMode: false,
      initialTab: 'form',
    },
  );

  const emit = defineEmits<{
    submitted: [];
    replyViewed: [];
  }>();

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();

  const activeTab = ref(
    props.initialTab === 'history'
      ? t('personCenter.opinions.feedbackHistory')
      : t('personCenter.opinions.feedbackType'),
  );

  const opinionData = reactive({
    type: '',
    content: '',
    imgArray: [],
    phone: '',
  });

  const summary = ref<any>(null);
  const opinionHistory = ref<any[]>([]);
  const loading = ref(false);
  const hasMarkedViewed = ref(false);
  const isDragOver = ref(false);
  const pasteZoneRef = ref<HTMLElement | null>(null);

  const tabOptions = computed(() => [
    t('personCenter.opinions.feedbackType'),
    t('personCenter.opinions.feedbackHistory'),
  ]);

  const radioOptions = computed(() => [
    { label: t('personCenter.opinions.productSuggestion'), value: t('personCenter.opinions.productSuggestion') },
    { label: t('personCenter.opinions.functionFault'), value: t('personCenter.opinions.functionFault') },
    { label: t('personCenter.opinions.otherIssues'), value: t('personCenter.opinions.otherIssues') },
  ]);

  const isFormTab = computed(() => activeTab.value === t('personCenter.opinions.feedbackType'));
  const maxImageCount = computed(() => (bookmark.isMobile ? 2 : 3));
  const parsedDraftImages = computed(() => opinionData.imgArray.map((item) => item));

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
    if (!fileUrl) {
      return;
    }
    if (opinionData.imgArray.length >= maxImageCount.value) {
      opinionData.imgArray.shift();
    }
    opinionData.imgArray.push(fileUrl);
  }

  function uploadImg(event) {
    event.forEach((img) => {
      appendImageUrl(img?.file || img);
    });
  }

  function clearPasteZoneText() {
    if (pasteZoneRef.value) {
      pasteZoneRef.value.textContent = '';
    }
  }

  function handlePasteZoneKeydown(event: KeyboardEvent) {
    const allowedKeys = ['Tab'];
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
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length > 0) {
      await appendFiles(files);
    }
  }

  function removeDraftImage(index: number) {
    opinionData.imgArray.splice(index, 1);
  }

  async function submit() {
    if (!opinionData.type) {
      message.warning('请选择反馈类型');
      return;
    }
    if (!opinionData.content || !opinionData.content.trim()) {
      message.warning(t('personCenter.opinions.contentPlaceholder'));
      return;
    }

    const params: any = cloneDeep(opinionData);
    params.imgArray = JSON.stringify(params.imgArray);
    const res = await opinionApi.createOpinion(params);
    if (res.status === 200) {
      recordOperation({
        module: t('personCenter.opinions.feedbackModule'),
        operation: `${t('personCenter.opinions.submitFeedback')}成功`,
      });
      message.success(t('personCenter.opinions.thankYouFeedback'));
      resetDraft();
      emit('submitted');
    }
  }

  async function fetchOpinionHistory() {
    loading.value = true;
    try {
      const res = await opinionApi.getOpinionList({
        currentPage: 1,
        pageSize: 50,
        userId: user.id,
      });
      if (res.status === 200) {
        opinionHistory.value = res.data.items || [];
        summary.value = res.data.summary || null;

        const unreadReplyIds = opinionHistory.value
          .filter((item) => item.status === 'replied' && !item.replyViewed)
          .map((item) => item.id);

        if (unreadReplyIds.length > 0 && !hasMarkedViewed.value) {
          hasMarkedViewed.value = true;
          await opinionApi.markOpinionReplyViewed({ ids: unreadReplyIds });
          emit('replyViewed');
          return fetchOpinionHistory();
        }
      }
    } finally {
      loading.value = false;
    }
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
      activeTab.value =
        value === 'history' ? t('personCenter.opinions.feedbackHistory') : t('personCenter.opinions.feedbackType');
      if (value === 'history') {
        hasMarkedViewed.value = false;
        fetchOpinionHistory();
      }
    },
  );

  watch(
    () => activeTab.value,
    (value) => {
      if (value === t('personCenter.opinions.feedbackHistory')) {
        hasMarkedViewed.value = false;
        fetchOpinionHistory();
      }
    },
  );

  onMounted(() => {
    if (activeTab.value === t('personCenter.opinions.feedbackHistory')) {
      fetchOpinionHistory();
    }
  });
</script>

<style scoped lang="less">
  .opinion-panel {
    width: min(100%, 760px);
    height: auto;
  }

  .opinion-panel--page {
    width: 100%;
    height: auto;
  }

  .opinion-panel--desktop {
    width: 100%;
    height: 100%;
  }

  .opinion-shell {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    color: var(--text-color);
    height: auto;
    min-height: auto;
  }

  .opinion-compose,
  .opinion-history {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: none;
    min-height: auto;
  }

  .opinion-panel--desktop .opinion-shell {
    height: 100%;
    min-height: 0;
  }

  .opinion-panel--desktop .opinion-compose,
  .opinion-panel--desktop .opinion-history {
    height: 100%;
    min-height: 0;
  }

  .opinion-card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
    border: 1px solid color-mix(in srgb, var(--border-color) 92%, transparent);
    border-radius: 14px;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--card-bg-color, var(--background-color)) 96%, transparent),
        transparent
      ),
      var(--background-color);
  }

  .opinion-status-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 58px;
    padding: 2px 10px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: 12px;
    line-height: 20px;
    font-weight: 600;
  }

  .opinion-status-badge--pending {
    color: #b36b00;
    background: rgba(255, 184, 77, 0.14);
    border-color: rgba(255, 184, 77, 0.3);
  }

  .opinion-status-badge--replied {
    color: #2f6fed;
    background: rgba(47, 111, 237, 0.14);
    border-color: rgba(47, 111, 237, 0.3);
  }

  .opinion-status-badge--viewed {
    color: #1f8f55;
    background: rgba(31, 143, 85, 0.14);
    border-color: rgba(31, 143, 85, 0.3);
  }

  .opinion-status-badge--new {
    color: #92400e;
    background: rgba(245, 158, 11, 0.14);
    border-color: rgba(245, 158, 11, 0.3);
  }

  .opinion-card__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .opinion-card__title {
    font-size: 17px;
    font-weight: 700;
  }

  .opinion-card__desc,
  .opinion-limit,
  .opinion-upload__hint,
  .opinion-history-card__time,
  .opinion-reply__time,
  .opinion-history-card__placeholder {
    color: var(--sub-text-color);
    font-size: 12px;
  }

  .opinion-example {
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--resource-note-color) 8%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--resource-note-color) 24%, var(--border-color));
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .opinion-example__title {
    font-size: 12px;
    font-weight: 700;
  }

  .opinion-example__desc {
    font-size: 12px;
    color: var(--sub-text-color);
    line-height: 1.6;
  }

  .opinion-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .opinion-field__label {
    font-size: 13px;
    font-weight: 600;
  }

  .opinion-upload {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .opinion-upload-dropzone {
    min-height: 106px;
    padding: 14px;
    border-radius: 14px;
    border: 1px dashed color-mix(in srgb, var(--resource-bookmark-color) 36%, var(--border-color));
    background:
      radial-gradient(
        circle at top right,
        color-mix(in srgb, var(--resource-bookmark-color) 10%, transparent),
        transparent 36%
      ),
      var(--background-color);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
    outline: none;
    transition:
      border-color 0.2s ease,
      transform 0.2s ease,
      background-color 0.2s ease;
  }

  .opinion-upload-dropzone:focus-visible {
    border-color: var(--resource-bookmark-color);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--resource-bookmark-color) 18%, transparent);
  }

  .opinion-upload-dropzone--dragover {
    border-color: var(--resource-bookmark-color);
    transform: translateY(-1px);
    background:
      radial-gradient(
        circle at top right,
        color-mix(in srgb, var(--resource-bookmark-color) 16%, transparent),
        transparent 42%
      ),
      color-mix(in srgb, var(--resource-bookmark-color) 6%, var(--background-color));
  }

  .opinion-upload-dropzone__icon {
    width: 34px;
    height: 34px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--resource-bookmark-color) 10%, var(--background-color));
    color: var(--resource-bookmark-color);
    display: grid;
    place-items: center;
    font-size: 20px;
    font-weight: 500;
  }

  .opinion-upload-dropzone__main {
    font-size: 14px;
    font-weight: 700;
  }

  .opinion-upload-dropzone__sub {
    font-size: 11px;
    color: var(--sub-text-color);
    line-height: 1.45;
    max-width: 440px;
  }

  .opinion-upload-dropzone__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .opinion-upload__hint {
    line-height: 1.4;
  }

  .opinion-images,
  .opinion-card-images {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  .opinion-image {
    position: relative;
    width: 72px;
    height: 72px;
    overflow: hidden;
    border-radius: 10px;
    border: 1px solid var(--border-color);
  }

  .opinion-image img,
  .opinion-card-images img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .opinion-card-images img {
    width: 72px;
    height: 72px;
    border-radius: 10px;
    border: 1px solid var(--border-color);
    cursor: pointer;
  }

  .opinion-image__remove {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    cursor: pointer;
  }

  .opinion-submit {
    width: 100%;
    margin-top: auto;
  }

  .opinion-history__content {
    min-height: auto;
  }

  .opinion-compose.opinion-body,
  .opinion-history.opinion-body {
    overflow: visible;
    padding-right: 0;
  }

  .opinion-panel--desktop .opinion-compose.opinion-body,
  .opinion-panel--desktop .opinion-history.opinion-body {
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 4px;
  }

  .opinion-summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 10px;
  }

  .opinion-summary__item {
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 12px;
    background: var(--background-color);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .opinion-summary__item strong {
    font-size: 18px;
  }

  .opinion-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .opinion-history-card {
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--border-color) 92%, transparent);
    border-radius: 14px;
    background: var(--background-color);
    display: flex;
    flex-direction: column;
    gap: 10px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.04);
    position: relative;
  }

  .opinion-history-card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 14px;
    bottom: 14px;
    width: 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--resource-bookmark-color) 60%, transparent);
  }

  .opinion-history-card__head,
  .opinion-history-card__title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .opinion-history-card__title {
    justify-content: flex-start;
    font-size: 14px;
    font-weight: 700;
    padding-left: 8px;
    flex-wrap: wrap;
  }

  .opinion-history-card__section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 8px;
  }

  .opinion-history-card__section label,
  .opinion-reply__label {
    font-size: 12px;
    color: var(--sub-text-color);
  }

  .opinion-history-card__section p,
  .opinion-reply__content {
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.6;
  }

  .opinion-reply {
    padding: 10px 12px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--resource-bookmark-color) 8%, var(--background-color));
    border: 1px solid color-mix(in srgb, var(--resource-bookmark-color) 28%, var(--border-color));
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-left: 8px;
  }

  @media (max-width: 768px) {
    .opinion-shell {
      gap: 10px;
    }

    .opinion-summary {
      grid-template-columns: 1fr;
    }

    .opinion-card {
      padding: 12px;
      border-radius: 14px;
    }

    .opinion-history-card {
      padding: 12px;
      border-radius: 14px;
    }
  }
</style>
