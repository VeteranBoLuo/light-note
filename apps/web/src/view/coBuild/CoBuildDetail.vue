<template>
  <div class="detail-page">
    <main class="detail-shell">
      <BButton class="back-button" @click="router.push('/co-build')">
        <SvgIcon :src="icon.arrow_left" size="15" />
        {{ t('coBuild.detailBack') }}
      </BButton>

      <div v-if="loading" class="detail-loading">
        <span />
        <span />
      </div>

      <template v-else-if="detail">
        <div class="detail-grid">
          <div class="detail-main">
            <BCard variant="raised" class="request-detail-card" padding="clamp(20px, 3vw, 38px)">
              <div class="detail-meta">
                <span class="source-pill" :class="`is-${detail.sourceType}`">
                  <SvgIcon
                    :src="detail.sourceType === 'official' ? icon.coBuild.official : icon.coBuild.board"
                    size="14"
                  />
                  {{ t(detail.sourceType === 'official' ? 'coBuild.sourceOfficial' : 'coBuild.sourceUser') }}
                </span>
                <span class="meta-pill">{{ t(`coBuild.category.${detail.category}`) }}</span>
                <span class="progress-pill" :class="`is-${detail.progressStatus}`">
                  {{ t(`coBuild.progress.${detail.progressStatus}`) }}
                </span>
                <span v-if="detail.moderationStatus !== 'published'" class="meta-pill">
                  {{ t(`coBuild.moderation.${detail.moderationStatus}`) }}
                </span>
              </div>

              <h1>{{ detail.title }}</h1>
              <div class="author-row">
                <span>{{ authorName }}</span>
                <span>·</span>
                <span>{{ formatDate(detail.createTime) }}</span>
              </div>
              <p class="detail-content">{{ detail.content }}</p>

              <div v-if="detail.mergedTo" class="merged-banner">
                <span>{{ t('coBuild.mergedInto', { title: detail.mergedTo.title }) }}</span>
                <BButton size="small" @click="router.push(`/co-build/${detail.mergedTo.id}`)">
                  {{ t('coBuild.openMerged') }}
                </BButton>
              </div>

              <div v-if="detail.developerReply" class="developer-reply">
                <div class="reply-heading">
                  <span class="reply-icon"><SvgIcon :src="icon.coBuild.official" size="16" /></span>
                  <strong>{{ t('coBuild.developerReply') }}</strong>
                </div>
                <p>{{ detail.developerReply }}</p>
              </div>

              <div class="detail-actions">
                <BButton
                  v-if="detail.moderationStatus === 'published'"
                  :class="{ 'is-voted': Boolean(detail.viewerVoted) }"
                  @click="toggleVote"
                >
                  <SvgIcon :src="icon.coBuild.vote" size="16" />
                  {{ t(Boolean(detail.viewerVoted) ? 'coBuild.voted' : 'coBuild.vote') }}
                  · {{ detail.voteCount || 0 }}
                </BButton>
                <BButton v-if="detail.releaseUrl" type="primary" @click="openReleaseUrl">
                  {{ t('coBuild.releaseLink') }}
                </BButton>
              </div>
            </BCard>

            <BCard
              v-if="
                detail.viewerIsOwner && !isRoot && ['pending_review', 'published'].includes(detail.moderationStatus)
              "
              class="addition-card"
              :title="t('coBuild.addUpdate')"
            >
              <BInput
                v-model:value="addition"
                type="textarea"
                :rows="4"
                :maxlength="2000"
                :placeholder="t('coBuild.addUpdatePlaceholder')"
              />
              <div class="panel-actions">
                <BButton type="primary" :loading="saving" :disabled="addition.trim().length < 2" @click="saveAddition">
                  {{ t('coBuild.addUpdate') }}
                </BButton>
              </div>
            </BCard>

            <BCard v-if="isRoot" class="admin-panel" :title="t('coBuild.adminPanel')">
              <BTabs v-model:active-tab="adminTab" variant="segment" :options="adminTabOptions" />

              <div v-if="adminTab === 'review'" class="admin-form">
                <p>{{ t('coBuild.reviewHint') }}</p>
                <BInput
                  v-model:value="adminReply"
                  type="textarea"
                  :rows="4"
                  :maxlength="4000"
                  :placeholder="t('coBuild.replyPlaceholder')"
                />
                <div class="panel-actions panel-actions--wrap">
                  <BButton type="primary" :loading="saving" @click="review('published')">{{
                    t('coBuild.publish')
                  }}</BButton>
                  <BButton :loading="saving" @click="review('rejected')">{{ t('coBuild.reject') }}</BButton>
                  <BButton type="danger" :loading="saving" @click="review('hidden')">{{ t('coBuild.hide') }}</BButton>
                </div>
              </div>

              <div v-else-if="adminTab === 'reply'" class="admin-form">
                <BInput
                  v-model:value="adminReply"
                  type="textarea"
                  :rows="5"
                  :maxlength="4000"
                  :placeholder="t('coBuild.replyPlaceholder')"
                />
                <div class="panel-actions">
                  <BButton type="primary" :loading="saving" :disabled="!adminReply.trim()" @click="saveReply">
                    {{ t('coBuild.saveReply') }}
                  </BButton>
                </div>
              </div>

              <div v-else-if="adminTab === 'progress'" class="admin-form">
                <BSelect v-model:value="progressDraft" :options="progressOptions" />
                <BInput v-model:value="releaseUrl" :maxlength="500" :placeholder="t('coBuild.releaseUrl')" />
                <div class="panel-actions">
                  <BButton
                    type="primary"
                    :loading="saving"
                    :disabled="detail.moderationStatus !== 'published'"
                    @click="saveProgress"
                  >
                    {{ t('coBuild.saveProgress') }}
                  </BButton>
                </div>
              </div>

              <div v-else-if="adminTab === 'edit'" class="admin-form">
                <BInput v-model:value="editDraft.title" :maxlength="160" :placeholder="t('coBuild.titlePlaceholder')" />
                <BInput
                  v-model:value="editDraft.content"
                  type="textarea"
                  :rows="6"
                  :maxlength="6000"
                  :placeholder="t('coBuild.contentPlaceholder')"
                />
                <BSelect v-model:value="editDraft.category" :options="categoryOptions" />
                <div class="panel-actions">
                  <BButton type="primary" :loading="saving" :disabled="!editValid" @click="saveEdit">
                    {{ t('coBuild.saveEdit') }}
                  </BButton>
                </div>
              </div>

              <div v-else class="admin-form">
                <BInput v-model:value="mergeTargetId" :placeholder="t('coBuild.mergeTarget')" />
                <BInput
                  v-model:value="mergeContent"
                  type="textarea"
                  :rows="3"
                  :maxlength="2000"
                  :placeholder="t('coBuild.mergeHint')"
                />
                <div class="panel-actions">
                  <BButton
                    type="danger"
                    :loading="saving"
                    :disabled="detail.moderationStatus !== 'published' || !mergeTargetId.trim()"
                    @click="saveMerge"
                  >
                    {{ t('coBuild.confirmMerge') }}
                  </BButton>
                </div>
              </div>
            </BCard>
          </div>

          <aside class="timeline-column">
            <BCard class="timeline-card" :title="t('coBuild.timeline')">
              <div v-if="detail.updates?.length" class="timeline-list">
                <div v-for="update in detail.updates" :key="update.id" class="timeline-item">
                  <span class="timeline-dot" :class="{ 'is-developer': update.actorType === 'developer' }" />
                  <div class="timeline-body">
                    <div class="timeline-head">
                      <strong>{{ timelineTitle(update) }}</strong>
                      <div class="timeline-meta">
                        <time>{{ formatDate(update.createTime) }}</time>
                        <BButton
                          v-if="isRoot && canDeleteTimelineUpdate(update)"
                          class="timeline-delete"
                          size="small"
                          :loading="deletingUpdateId === update.id"
                          :title="t('coBuild.deleteTimeline')"
                          @click="confirmDeleteTimelineUpdate(update)"
                        >
                          <SvgIcon :src="icon.table_delete" size="13" />
                        </BButton>
                      </div>
                    </div>
                    <p v-if="update.content">{{ update.content }}</p>
                    <span v-if="update.toStatus" class="timeline-status">
                      {{ statusLabel(update.toStatus) }}
                    </span>
                  </div>
                </div>
              </div>
              <div v-else class="timeline-empty">{{ t('coBuild.timelineEmpty') }}</div>
            </BCard>
          </aside>
        </div>
      </template>

      <div v-else class="not-found">
        <span><SvgIcon :src="icon.coBuild.board" size="32" /></span>
        <strong>{{ t('coBuild.notFound') }}</strong>
        <BButton @click="router.push('/co-build')">{{ t('coBuild.detailBack') }}</BButton>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import icon from '@/config/icon';
  import { bookmarkStore, useUserStore } from '@/store';
  import {
    addFeatureRequestUpdate,
    deleteFeatureRequestUpdate,
    editFeatureRequest,
    getFeatureRequestDetail,
    mergeFeatureRequest,
    replyFeatureRequest,
    reviewFeatureRequest,
    toggleFeatureRequestVote,
    updateFeatureRequestProgress,
    type FeatureRequestCategory,
    type FeatureRequestDetail,
    type FeatureRequestModerationStatus,
    type FeatureRequestProgressStatus,
    type FeatureRequestUpdate,
  } from '@/api/featureRequestApi';
  import { recordOperation } from '@/api/commonApi';

  type AdminTab = 'review' | 'reply' | 'progress' | 'edit' | 'merge';

  const { t, locale } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const loading = ref(true);
  const saving = ref(false);
  const deletingUpdateId = ref('');
  const detail = ref<FeatureRequestDetail | null>(null);
  const addition = ref('');
  const adminTab = ref<AdminTab>('review');
  const adminReply = ref('');
  const progressDraft = ref<FeatureRequestProgressStatus>('evaluating');
  const releaseUrl = ref('');
  const mergeTargetId = ref('');
  const mergeContent = ref('');
  const editDraft = reactive({
    title: '',
    content: '',
    category: 'experience' as FeatureRequestCategory,
    showIdentity: true,
  });

  const isRoot = computed(() => user.role === 'root');
  const authorName = computed(() => {
    if (!detail.value) return '';
    if (detail.value.sourceType === 'official') return t('coBuild.teamName');
    return detail.value.submitterAlias || t('coBuild.anonymous');
  });
  const adminTabOptions = computed(() => [
    { key: 'review', label: t('coBuild.review') },
    { key: 'reply', label: t('coBuild.reply') },
    { key: 'progress', label: t('coBuild.updateProgress') },
    { key: 'edit', label: t('common.edit') },
    { key: 'merge', label: t('coBuild.merge') },
  ]);
  const categoryKeys: FeatureRequestCategory[] = ['bookmark', 'note', 'cloud', 'tag', 'ai', 'experience', 'other'];
  const categoryOptions = computed(() =>
    categoryKeys.map((value) => ({ value, label: t(`coBuild.category.${value}`) })),
  );
  const progressKeys: FeatureRequestProgressStatus[] = ['evaluating', 'planned', 'in_progress', 'released', 'declined'];
  const progressOptions = computed(() =>
    progressKeys.map((value) => ({ value, label: t(`coBuild.progress.${value}`) })),
  );
  const editValid = computed(() => editDraft.title.trim().length >= 4 && editDraft.content.trim().length >= 10);

  async function loadDetail() {
    loading.value = true;
    try {
      const res = await getFeatureRequestDetail(String(route.params.id || ''));
      if (res?.status !== 200) {
        detail.value = null;
        return;
      }
      detail.value = res.data as FeatureRequestDetail;
      progressDraft.value = detail.value.progressStatus;
      releaseUrl.value = detail.value.releaseUrl || '';
      editDraft.title = detail.value.title;
      editDraft.content = detail.value.content;
      editDraft.category = detail.value.category;
      editDraft.showIdentity = Boolean(detail.value.showIdentity);
      adminReply.value = detail.value.developerReply || '';
    } catch {
      detail.value = null;
    } finally {
      loading.value = false;
    }
  }

  function requireLogin() {
    if (user.role !== 'visitor') return false;
    bookmark.openAuthModal('注册', 'co_build_vote');
    return true;
  }
  async function toggleVote() {
    if (!detail.value || requireLogin()) return;
    try {
      const res = await toggleFeatureRequestVote(detail.value.id);
      if (res?.status !== 200) return;
      detail.value.viewerVoted = Boolean(res.data?.voted);
      detail.value.voteCount = Number(res.data?.voteCount || 0);
      recordOperation({
        module: '共建轻笺',
        operation: `${detail.value.viewerVoted ? '支持需求' : '取消支持需求'}【${detail.value.title.slice(0, 40)}】`,
      });
    } catch (error) {
      console.error('更新建议投票失败:', error);
    }
  }
  async function runAdminAction(action: () => Promise<any>, operation: string) {
    if (saving.value) return;
    saving.value = true;
    try {
      const res = await action();
      if (res?.status !== 200) return;
      message.success(t('coBuild.adminSaved'));
      recordOperation({
        module: '共建轻笺',
        operation: `${operation}【${String(detail.value?.title || detail.value?.id || '').slice(0, 40)}】`,
      });
      await loadDetail();
    } catch (error) {
      console.error('处理共建建议失败:', error);
    } finally {
      saving.value = false;
    }
  }
  async function review(status: FeatureRequestModerationStatus) {
    if (!detail.value) return;
    await runAdminAction(
      () => reviewFeatureRequest(detail.value!.id, status, adminReply.value.trim()),
      `审核建议为${status}`,
    );
  }
  async function saveReply() {
    if (!detail.value || !adminReply.value.trim()) return;
    await runAdminAction(() => replyFeatureRequest(detail.value!.id, adminReply.value.trim()), '回复产品建议');
  }
  async function saveProgress() {
    if (!detail.value) return;
    await runAdminAction(
      () => updateFeatureRequestProgress(detail.value!.id, progressDraft.value, releaseUrl.value.trim()),
      `更新建议进度为${progressDraft.value}`,
    );
  }
  async function saveEdit() {
    if (!detail.value || !editValid.value) return;
    await runAdminAction(() => editFeatureRequest(detail.value!.id, { ...editDraft }), '编辑建议公开内容');
  }
  async function saveMerge() {
    if (!detail.value || !mergeTargetId.value.trim()) return;
    Alert.alert({
      title: t('coBuild.mergeConfirmTitle'),
      content: t('coBuild.mergeConfirmContent'),
      okText: t('coBuild.confirmMerge'),
      onOk: () =>
        runAdminAction(
          () => mergeFeatureRequest(detail.value!.id, mergeTargetId.value.trim(), mergeContent.value.trim()),
          '合并产品建议',
        ),
    });
  }
  async function saveAddition() {
    if (!detail.value || addition.value.trim().length < 2 || saving.value) return;
    saving.value = true;
    try {
      const res = await addFeatureRequestUpdate(detail.value.id, addition.value.trim());
      if (res?.status !== 200) return;
      addition.value = '';
      message.success(t('coBuild.updateAdded'));
      recordOperation({ module: '共建轻笺', operation: `补充产品建议【${detail.value.title.slice(0, 40)}】` });
      await loadDetail();
    } catch (error) {
      console.error('补充建议说明失败:', error);
    } finally {
      saving.value = false;
    }
  }
  function canDeleteTimelineUpdate(update: FeatureRequestUpdate) {
    return !['submitted', 'official_created'].includes(update.type);
  }
  function confirmDeleteTimelineUpdate(update: FeatureRequestUpdate) {
    if (!detail.value || !isRoot.value || !canDeleteTimelineUpdate(update) || deletingUpdateId.value) return;
    Alert.alert({
      title: t('coBuild.deleteTimelineTitle'),
      content: t('coBuild.deleteTimelineConfirm'),
      okText: t('common.delete'),
      onOk: () => removeTimelineUpdate(update),
    });
  }
  async function removeTimelineUpdate(update: FeatureRequestUpdate) {
    if (!detail.value || deletingUpdateId.value) return;
    deletingUpdateId.value = update.id;
    try {
      const res = await deleteFeatureRequestUpdate(detail.value.id, update.id);
      if (res?.status !== 200) return;
      message.success(t('coBuild.timelineDeleted'));
      recordOperation({ module: '共建轻笺', operation: `删除进度记录【${timelineTitle(update)}】` });
      await loadDetail();
    } catch (error) {
      console.error('删除共建进度记录失败:', error);
    } finally {
      deletingUpdateId.value = '';
    }
  }
  function openReleaseUrl() {
    if (!detail.value?.releaseUrl) return;
    if (detail.value.releaseUrl.startsWith('/')) {
      router.push(detail.value.releaseUrl);
    } else {
      window.open(detail.value.releaseUrl, '_blank', 'noopener,noreferrer');
    }
  }
  function formatDate(value: string) {
    if (!value) return '--';
    const date = new Date(value.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }
  function timelineTitle(update: FeatureRequestUpdate) {
    const key = `coBuild.timelineType.${update.type}`;
    const translated = t(key);
    return translated === key ? t('coBuild.timelineType.status_change') : translated;
  }
  function statusLabel(status: string) {
    if (['evaluating', 'planned', 'in_progress', 'released', 'declined'].includes(status)) {
      return t(`coBuild.progress.${status}`);
    }
    return t(`coBuild.moderation.${status}`);
  }

  watch(() => route.params.id, loadDetail);
  onMounted(() => {
    loadDetail();
    recordOperation({ module: '共建轻笺', operation: '查看建议详情' });
  });
</script>

<style scoped lang="less">
  .detail-page {
    height: 100%;
    overflow: auto;
    color: var(--text-color);
    background: var(--surface-page-bg);
  }
  .detail-shell {
    min-height: 100%;
    box-sizing: border-box;
    padding: 24px clamp(24px, 3.2vw, 76px) 48px;
  }
  .back-button {
    gap: 6px;
    margin-bottom: 18px;
  }
  .detail-grid {
    display: grid;
    grid-template-columns: minmax(0, 2.25fr) minmax(300px, 0.85fr);
    gap: 18px;
    align-items: start;
  }
  .detail-main {
    display: grid;
    gap: 18px;
  }
  .request-detail-card h1 {
    max-width: 1000px;
    margin: 22px 0 9px;
    font-size: clamp(28px, 3vw, 44px);
    line-height: 1.22;
    letter-spacing: -0.035em;
  }
  .detail-meta,
  .detail-actions,
  .panel-actions {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-wrap: wrap;
  }
  .source-pill,
  .meta-pill,
  .progress-pill,
  .timeline-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--surface-panel-bg);
    font-size: 11px;
  }
  .source-pill.is-official {
    color: #8a5a00;
    background: color-mix(in srgb, #f5a623 15%, var(--card-background));
  }
  .source-pill.is-user,
  .progress-pill {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background));
  }
  .progress-pill.is-released {
    color: #07845d;
    background: color-mix(in srgb, #10b981 12%, var(--card-background));
  }
  .author-row {
    display: flex;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .detail-content {
    max-width: 1050px;
    margin: 30px 0 0;
    color: var(--text-color);
    font-size: 15px;
    line-height: 1.9;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .developer-reply,
  .merged-banner {
    margin-top: 28px;
    padding: 16px 18px;
    border: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--surface-border-color));
    border-radius: 14px;
    background: color-mix(in srgb, var(--primary-color) 6%, var(--surface-panel-bg));
  }
  .merged-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .reply-heading {
    display: flex;
    align-items: center;
    gap: 9px;
    color: var(--primary-color);
  }
  .reply-icon {
    display: inline-flex;
  }
  .developer-reply p {
    margin: 10px 0 0;
    line-height: 1.75;
    white-space: pre-wrap;
  }
  .detail-actions {
    margin-top: 28px;
  }
  .detail-actions :deep(.b_btn) {
    gap: 7px;
  }
  .detail-actions .is-voted {
    color: var(--primary-color);
    background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background));
  }
  .addition-card,
  .admin-panel,
  .timeline-card {
    --b-card-background: var(--card-background);
  }
  .addition-card :deep(.card-container-header),
  .admin-panel :deep(.card-container-header),
  .timeline-card :deep(.card-container-header) {
    margin-bottom: 16px;
  }
  .panel-actions {
    justify-content: flex-end;
    margin-top: 12px;
  }
  .admin-form {
    display: grid;
    gap: 12px;
    margin-top: 18px;
  }
  .admin-form > p {
    margin: 0;
    color: var(--desc-color);
    font-size: 12px;
  }
  .admin-form :deep(.b-input),
  .admin-form :deep(.select-trigger),
  .addition-card :deep(.b-textarea) {
    border: 1px solid var(--surface-border-color) !important;
    background: var(--surface-panel-bg) !important;
  }
  :deep(.b-textarea) {
    resize: vertical;
    font-family: inherit;
    line-height: 1.65;
  }
  .timeline-column {
    position: sticky;
    top: 18px;
  }
  .timeline-list {
    display: grid;
  }
  .timeline-item {
    position: relative;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 10px;
    padding-bottom: 24px;
  }
  .timeline-item:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 13px;
    bottom: 0;
    width: 1px;
    background: var(--surface-border-color);
  }
  .timeline-dot {
    position: relative;
    z-index: 1;
    width: 11px;
    height: 11px;
    margin-top: 3px;
    border: 3px solid var(--card-background);
    border-radius: 50%;
    background: var(--desc-color);
    box-shadow: 0 0 0 1px var(--surface-border-color);
  }
  .timeline-dot.is-developer {
    background: var(--primary-color);
  }
  .timeline-body {
    min-width: 0;
  }
  .timeline-head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .timeline-head strong {
    font-size: 13px;
  }
  .timeline-head time {
    color: var(--desc-color);
    font-size: 10px;
    white-space: nowrap;
  }
  .timeline-meta {
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .timeline-delete {
    width: 24px;
    min-width: 24px;
    height: 24px;
    padding: 0;
    border-radius: 7px;
    color: var(--desc-color);
    background: transparent;
  }
  .timeline-delete:hover {
    color: #fe2c55;
    background: rgba(254, 44, 85, 0.1);
  }
  .timeline-body p {
    margin: 7px 0 8px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.65;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .timeline-status {
    padding: 3px 7px;
  }
  .timeline-empty {
    padding: 40px 0;
    text-align: center;
    color: var(--desc-color);
  }
  .detail-loading {
    display: grid;
    grid-template-columns: 2.25fr 0.85fr;
    gap: 18px;
  }
  .detail-loading span {
    height: 500px;
    border-radius: 16px;
    background: linear-gradient(
      100deg,
      var(--card-background) 20%,
      var(--surface-panel-bg) 40%,
      var(--card-background) 60%
    );
    background-size: 200% 100%;
    animation: shimmer 1.3s infinite linear;
  }
  .not-found {
    min-height: 60vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }
  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }
  @media (max-width: 980px) {
    .detail-grid,
    .detail-loading {
      grid-template-columns: 1fr;
    }
    .timeline-column {
      position: static;
    }
  }
  @media (max-width: 767px) {
    .detail-shell {
      padding: 14px 12px 34px;
    }
    .request-detail-card h1 {
      font-size: 28px;
    }
    .detail-content {
      margin-top: 22px;
    }
    .merged-banner {
      align-items: flex-start;
      flex-direction: column;
    }
    .admin-panel :deep(.tab-container) {
      overflow-x: auto;
    }
  }
</style>
