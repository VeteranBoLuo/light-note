<template>
  <div
    ref="pageRef"
    class="co-build-detail"
    :class="{ 'is-mobile': bookmark.isMobile, 'is-stacked': !bookmark.isDesktop }"
    v-auto-scrollbar
  >
    <header v-if="bookmark.isMobile" class="mobile-heading">
      <BButton icon-only class="mobile-back" :aria-label="t('coBuild.detailBack')" @click="goBack"
        ><SvgIcon :src="icon.arrow_left" size="20"
      /></BButton>
      <span>{{ t('coBuild.detailTitle') }}</span>
    </header>
    <main class="detail-shell">
      <BButton v-if="!bookmark.isMobile" type="text" class="back-button" @click="goBack">
        <SvgIcon :src="icon.arrow_left" size="17" />{{ t('coBuild.detailBack') }}
      </BButton>
      <div v-if="loadError" class="detail-error" role="alert">
        <span>{{ t(detail && !isCurrentDetail ? 'coBuild.detailSwitchFailed' : 'coBuild.detailLoadFailed') }}</span>
        <BButton type="text" :loading="loading" :disabled="saving || voting" @click="loadDetail()">{{
          t('coBuild.retry')
        }}</BButton>
      </div>
      <div v-if="loading && !detail" class="detail-loading" role="status" :aria-label="t('common.loading')"
        ><span /><span
      /></div>
      <template v-else-if="detail">
        <BCard class="reading-surface" padding="0" :aria-busy="loading">
          <div class="reading-grid">
            <article class="request-article">
              <div class="detail-meta">
                <span class="co-build-source" :class="{ 'is-official': detail.sourceType === 'official' }">
                  <SvgIcon
                    :src="detail.sourceType === 'official' ? icon.coBuild.official : icon.coBuild.board"
                    size="14"
                  />
                  {{ t(detail.sourceType === 'official' ? 'coBuild.sourceOfficial' : 'coBuild.sourceUser') }}
                </span>
                <span class="co-build-category" :data-category="detail.category">{{
                  t(`coBuild.category.${detail.category}`)
                }}</span>
                <span class="co-build-status" :class="`is-${detail.progressStatus}`">{{
                  t(`coBuild.progress.${detail.progressStatus}`)
                }}</span>
                <span v-if="detail.moderationStatus !== 'published'" class="co-build-moderation">{{
                  t(`coBuild.moderation.${detail.moderationStatus}`)
                }}</span>
              </div>
              <h1>{{ detail.title }}</h1>
              <div class="author-row"
                ><span>{{ authorName }}</span
                ><span aria-hidden="true">·</span
                ><time :datetime="detail.createTime">{{ formatDate(detail.createTime) }}</time></div
              >
              <p class="detail-content">{{ detail.content }}</p>
              <div v-if="detail.mergedTo" class="merged-banner">
                <span>{{ t('coBuild.mergedInto', { title: detail.mergedTo.title }) }}</span>
                <BButton :disabled="detailBusy" size="small" @click="router.push(`/co-build/${detail.mergedTo.id}`)">{{
                  t('coBuild.openMerged')
                }}</BButton>
              </div>
              <section v-if="detail.developerReply" class="developer-reply" :aria-label="t('coBuild.developerReply')">
                <h2><SvgIcon :src="icon.coBuild.official" size="16" />{{ t('coBuild.developerReply') }}</h2>
                <p>{{ detail.developerReply }}</p>
              </section>
              <div class="detail-actions">
                <BButton
                  v-if="detail.moderationStatus === 'published'"
                  class="support-button"
                  :class="{ 'is-voted': Boolean(detail.viewerVoted) }"
                  :aria-pressed="Boolean(detail.viewerVoted)"
                  :loading="voting"
                  :disabled="detailBusy"
                  @click="toggleVote"
                >
                  <SvgIcon :src="detail.viewerVoted ? icon.coBuild.vote : icon.coBuild.voteOutline" size="18" />
                  {{ t(detail.viewerVoted ? 'coBuild.voted' : 'coBuild.vote') }} · {{ detail.voteCount || 0 }}
                </BButton>
                <BButton v-if="detail.releaseUrl" type="primary" :disabled="detailBusy" @click="openReleaseUrl">{{
                  t('coBuild.releaseLink')
                }}</BButton>
              </div>
            </article>
            <aside class="timeline-column" :aria-label="t('coBuild.timeline')">
              <h2>{{ t('coBuild.timeline') }}</h2>
              <ol v-if="detail.updates?.length" class="timeline-list">
                <li
                  v-for="update in detail.updates"
                  :key="update.id"
                  class="timeline-item"
                  :class="{ 'is-developer': update.actorType === 'developer' }"
                >
                  <div class="timeline-body">
                    <div class="timeline-meta">
                      <time :datetime="update.createTime">{{ formatDate(update.createTime) }}</time>
                      <BActionMenu
                        v-if="isRoot && canDeleteTimelineUpdate(update)"
                        :items="timelineActions"
                        placement="bottom-right"
                        :disabled="detailBusy || saving || Boolean(deletingUpdateId)"
                        :aria-label="t('coBuild.timelineActions')"
                        @select="confirmDeleteTimelineUpdate(update)"
                      >
                        <BButton
                          icon-only
                          class="timeline-more"
                          :disabled="detailBusy || saving"
                          :loading="deletingUpdateId === update.id"
                          :aria-label="t('coBuild.timelineActionsAt', { time: formatDate(update.createTime) })"
                        >
                          <SvgIcon :src="icon.common.more" size="16" />
                        </BButton>
                      </BActionMenu>
                    </div>
                    <h3>{{ timelineTitle(update) }}</h3>
                    <p v-if="update.content">{{ update.content }}</p>
                    <span v-if="update.toStatus" class="timeline-status">{{ statusLabel(update.toStatus) }}</span>
                  </div>
                </li>
              </ol>
              <p v-else class="timeline-empty">{{ t('coBuild.timelineEmpty') }}</p>
            </aside>
          </div>
        </BCard>

        <BCard
          v-if="canAddUpdate && isCurrentDetail"
          class="addition-panel"
          :title="t('coBuild.addUpdate')"
          :padding="bookmark.isMobile ? 'var(--ui-space-16, 16px)' : 'var(--ui-space-24, 24px)'"
        >
          <BInput
            v-model:value="addition"
            type="textarea"
            :rows="4"
            :maxlength="2000"
            :disabled="saving || detailBusy"
            :aria-label="t('coBuild.addUpdate')"
            :placeholder="t('coBuild.addUpdatePlaceholder')"
          />
          <div class="panel-actions"
            ><BButton
              type="primary"
              :loading="saving"
              :disabled="detailBusy || addition.trim().length < 2"
              @click="saveAddition"
              >{{ t('coBuild.addUpdate') }}</BButton
            ></div
          >
        </BCard>

        <BCard
          v-if="isRoot && isCurrentDetail"
          class="admin-panel"
          :padding="bookmark.isMobile ? 'var(--ui-space-16, 16px)' : 'var(--ui-space-24, 24px)'"
        >
          <div class="admin-heading">
            <h2><SvgIcon :src="icon.coBuild.official" size="19" />{{ t('coBuild.adminPanel') }}</h2>
            <div class="admin-heading-actions">
              <span>{{ t('coBuild.developerOnly') }}</span>
              <BButton
                type="text"
                :aria-expanded="adminExpanded"
                aria-controls="co-build-admin-body"
                @click="adminExpanded = !adminExpanded"
              >
                {{ t(adminExpanded ? 'coBuild.collapse' : 'coBuild.expand') }}
                <SvgIcon
                  :src="icon.noteTree.chevron"
                  size="14"
                  class="collapse-icon"
                  :class="{ 'is-open': adminExpanded }"
                />
              </BButton>
            </div>
          </div>
          <div v-show="adminExpanded" id="co-build-admin-body" class="admin-body">
            <BTabs v-model:active-tab="adminTab" variant="line" :options="adminTabOptions" />
            <div v-if="adminTab === 'review'" class="admin-form">
              <p>{{ t('coBuild.reviewHint') }}</p>
              <BInput
                v-model:value="adminReply"
                type="textarea"
                :rows="4"
                :maxlength="4000"
                :disabled="saving || detailBusy"
                :aria-label="t('coBuild.reply')"
                :placeholder="t('coBuild.replyPlaceholder')"
              />
              <div class="panel-actions panel-actions--wrap">
                <BButton type="primary" :loading="saving" :disabled="detailBusy" @click="review('published')">{{
                  t('coBuild.publish')
                }}</BButton>
                <BButton :disabled="saving || detailBusy" @click="review('rejected')">{{
                  t('coBuild.reject')
                }}</BButton>
                <BButton type="danger" :disabled="saving || detailBusy" @click="review('hidden')">{{
                  t('coBuild.hide')
                }}</BButton>
              </div>
            </div>
            <div v-else-if="adminTab === 'reply'" class="admin-form">
              <BInput
                v-model:value="adminReply"
                type="textarea"
                :rows="5"
                :maxlength="4000"
                :disabled="saving || detailBusy"
                :aria-label="t('coBuild.reply')"
                :placeholder="t('coBuild.replyPlaceholder')"
              />
              <div class="panel-actions"
                ><BButton
                  type="primary"
                  :loading="saving"
                  :disabled="detailBusy || !adminReply.trim()"
                  @click="saveReply"
                  >{{ t('coBuild.saveReply') }}</BButton
                ></div
              >
            </div>
            <div v-else-if="adminTab === 'progress'" class="admin-form progress-form">
              <label class="form-field"
                ><span>{{ t('coBuild.progressLabel') }}</span
                ><BSelect
                  v-model:value="progressDraft"
                  :options="progressOptions"
                  :disabled="saving || detailBusy"
                  :aria-label="t('coBuild.progressLabel')"
              /></label>
              <label class="form-field"
                ><span>{{ t('coBuild.releaseUrl') }}</span
                ><BInput
                  v-model:value="releaseUrl"
                  :maxlength="500"
                  :disabled="saving || detailBusy"
                  :aria-label="t('coBuild.releaseUrl')"
                  :placeholder="t('coBuild.releaseUrlPlaceholder')"
              /></label>
              <BButton
                type="primary"
                :loading="saving"
                :disabled="detailBusy || detail.moderationStatus !== 'published'"
                @click="saveProgress"
                >{{ t('coBuild.saveProgress') }}</BButton
              >
            </div>
            <div v-else-if="adminTab === 'edit'" class="admin-form">
              <BInput
                v-model:value="editDraft.title"
                :maxlength="160"
                :disabled="saving || detailBusy"
                :aria-label="t('coBuild.titleLabel')"
                :placeholder="t('coBuild.titlePlaceholder')"
              />
              <BInput
                v-model:value="editDraft.content"
                type="textarea"
                :rows="6"
                :maxlength="6000"
                :disabled="saving || detailBusy"
                :aria-label="t('coBuild.contentLabel')"
                :placeholder="t('coBuild.contentPlaceholder')"
              />
              <BSelect
                v-model:value="editDraft.category"
                :options="categoryOptions"
                :disabled="saving || detailBusy"
                :aria-label="t('coBuild.categoryLabel')"
              />
              <div class="panel-actions"
                ><BButton type="primary" :loading="saving" :disabled="detailBusy || !editValid" @click="saveEdit">{{
                  t('coBuild.saveEdit')
                }}</BButton></div
              >
            </div>
            <div v-else class="admin-form">
              <BInput
                v-model:value="mergeTargetId"
                :disabled="saving || detailBusy"
                :aria-label="t('coBuild.mergeTarget')"
                :placeholder="t('coBuild.mergeTarget')"
              />
              <BInput
                v-model:value="mergeContent"
                type="textarea"
                :rows="3"
                :maxlength="2000"
                :disabled="saving || detailBusy"
                :aria-label="t('coBuild.mergeHint')"
                :placeholder="t('coBuild.mergeHint')"
              />
              <div class="panel-actions"
                ><BButton
                  type="danger"
                  :loading="saving"
                  :disabled="detailBusy || detail.moderationStatus !== 'published' || !mergeTargetId.trim()"
                  @click="saveMerge"
                  >{{ t('coBuild.confirmMerge') }}</BButton
                ></div
              >
            </div>
          </div>
        </BCard>
      </template>
      <div v-else-if="!loadError" class="not-found"
        ><SvgIcon :src="icon.coBuild.board" size="32" /><h1>{{ t('coBuild.notFound') }}</h1
        ><BButton @click="goBack">{{ t('coBuild.detailBack') }}</BButton></div
      >
    </main>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { useMobileTopBar } from '@/composables/useMobileTopBar';
  import { useDensityScrollAnchor } from '@/composables/useDensityScrollAnchor';
  import { returnToPreviousPage } from '@/utils/pageReturn';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
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
  const goBack = () => returnToPreviousPage(router, '/co-build');
  useMobileTopBar(['coBuildDetail'], { ownTopBar: true, onBack: goBack });
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const pageRef = ref<HTMLElement | null>(null);
  useDensityScrollAnchor(pageRef);
  const loading = ref(true);
  const loadError = ref(false);
  const saving = ref(false);
  const voting = ref(false);
  const deletingUpdateId = ref('');
  const detail = ref<FeatureRequestDetail | null>(null);
  const addition = ref('');
  const adminTab = ref<AdminTab>('review');
  const adminExpanded = ref(true);
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
  let loadGeneration = 0;
  let actionGeneration = 0;
  const isRoot = computed(() => user.role === 'root');
  const isCurrentDetail = computed(() => detail.value?.id === String(route.params.id || ''));
  const detailBusy = computed(() => loading.value || saving.value || voting.value || !isCurrentDetail.value);
  const canAddUpdate = computed(
    () =>
      detail.value?.viewerIsOwner &&
      !isRoot.value &&
      ['pending_review', 'published'].includes(detail.value.moderationStatus),
  );
  const authorName = computed(() =>
    !detail.value
      ? ''
      : detail.value.sourceType === 'official'
        ? t('coBuild.teamName')
        : detail.value.submitterAlias || t('coBuild.anonymous'),
  );
  const adminTabOptions = computed(() => [
    { key: 'review', label: t('coBuild.review') },
    { key: 'reply', label: t('coBuild.reply') },
    { key: 'progress', label: t('coBuild.updateProgress') },
    { key: 'edit', label: t('common.edit') },
    { key: 'merge', label: t('coBuild.merge') },
  ]);
  const timelineActions = computed(() => [
    { key: 'delete', label: t('coBuild.deleteTimeline'), icon: icon.table_delete, danger: true },
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

  function syncDrafts(value: FeatureRequestDetail) {
    progressDraft.value = value.progressStatus;
    releaseUrl.value = value.releaseUrl || '';
    Object.assign(editDraft, {
      title: value.title,
      content: value.content,
      category: value.category,
      showIdentity: Boolean(value.showIdentity),
    });
    adminReply.value = value.developerReply || '';
  }
  async function loadDetail(newTarget = false) {
    const generation = ++loadGeneration;
    const id = String(route.params.id || '');
    const account = user.id;
    const role = user.role;
    const isCurrent = () =>
      generation === loadGeneration &&
      id === String(route.params.id || '') &&
      account === user.id &&
      role === user.role;
    loading.value = true;
    loadError.value = false;
    try {
      const res = await getFeatureRequestDetail(id);
      if (!isCurrent()) return;
      if (res?.status !== 200) {
        if ([403, 404].includes(res?.status)) detail.value = null;
        else loadError.value = true;
        return;
      }
      const replacingTarget = detail.value?.id !== id;
      detail.value = res.data as FeatureRequestDetail;
      syncDrafts(detail.value);
      if (newTarget || replacingTarget)
        adminTab.value = detail.value.moderationStatus === 'published' ? 'progress' : 'review';
    } catch (error) {
      if (!isCurrent()) return;
      const status =
        (error as { status?: number; response?: { status?: number } })?.status ||
        (error as { response?: { status?: number } })?.response?.status;
      if (status === 403 || status === 404) detail.value = null;
      else loadError.value = true;
    } finally {
      if (isCurrent()) loading.value = false;
    }
  }
  function requireLogin() {
    if (user.role !== 'visitor') return false;
    bookmark.openAuthModal('注册', 'co_build_vote');
    return true;
  }
  async function toggleVote() {
    if (!detail.value || detailBusy.value || voting.value || requireLogin()) return;
    const target = detail.value;
    const account = user.id;
    const generation = actionGeneration;
    voting.value = true;
    try {
      const res = await toggleFeatureRequestVote(target.id);
      if (
        res?.status !== 200 ||
        target.id !== detail.value?.id ||
        account !== user.id ||
        generation !== actionGeneration
      )
        return;
      detail.value.viewerVoted = Boolean(res.data?.voted);
      detail.value.voteCount = Number(res.data?.voteCount || 0);
      recordOperation({
        module: '共建轻笺',
        operation: `${res.data?.voted ? '支持需求' : '取消支持需求'}【${target.title.slice(0, 40)}】`,
      });
    } catch {
      /* The request layer presents write failures. */
    } finally {
      if (generation === actionGeneration && target.id === detail.value?.id && account === user.id)
        voting.value = false;
    }
  }
  async function runAdminAction(id: string, action: () => Promise<unknown>, operation: string) {
    if (!isRoot.value || saving.value || detailBusy.value || detail.value?.id !== id) return;
    const generation = ++actionGeneration;
    const account = user.id;
    const title = detail.value.title;
    saving.value = true;
    try {
      const res = (await action()) as { status?: number };
      if (res?.status !== 200 || generation !== actionGeneration || account !== user.id || detail.value?.id !== id)
        return;
      message.success(t('coBuild.adminSaved'));
      recordOperation({ module: '共建轻笺', operation: `${operation}【${title.slice(0, 40)}】` });
      await loadDetail();
    } catch {
      /* The request layer presents write failures. */
    } finally {
      if (generation === actionGeneration) saving.value = false;
    }
  }
  function review(status: FeatureRequestModerationStatus) {
    if (!detail.value) return;
    const id = detail.value.id,
      reply = adminReply.value.trim();
    return runAdminAction(id, () => reviewFeatureRequest(id, status, reply), `审核建议为${status}`);
  }
  function saveReply() {
    if (!detail.value || !adminReply.value.trim()) return;
    const id = detail.value.id,
      content = adminReply.value.trim();
    return runAdminAction(id, () => replyFeatureRequest(id, content), '回复产品建议');
  }
  function saveProgress() {
    if (!detail.value || detail.value.moderationStatus !== 'published') return;
    const id = detail.value.id,
      progress = progressDraft.value,
      url = releaseUrl.value.trim();
    return runAdminAction(id, () => updateFeatureRequestProgress(id, progress, url), `更新建议进度为${progress}`);
  }
  function saveEdit() {
    if (!detail.value || !editValid.value) return;
    const id = detail.value.id,
      draft = { ...editDraft };
    return runAdminAction(id, () => editFeatureRequest(id, draft), '编辑建议公开内容');
  }
  function saveMerge() {
    if (
      !detail.value ||
      detailBusy.value ||
      detail.value.moderationStatus !== 'published' ||
      !mergeTargetId.value.trim()
    )
      return;
    const id = detail.value.id,
      target = mergeTargetId.value.trim(),
      content = mergeContent.value.trim();
    const context = actionGeneration;
    Alert.alert({
      title: t('coBuild.mergeConfirmTitle'),
      content: t('coBuild.mergeConfirmContent'),
      okText: t('coBuild.confirmMerge'),
      onOk: () =>
        context === actionGeneration
          ? runAdminAction(id, () => mergeFeatureRequest(id, target, content), '合并产品建议')
          : undefined,
    });
  }
  async function saveAddition() {
    if (!detail.value || !canAddUpdate.value || detailBusy.value || addition.value.trim().length < 2 || saving.value)
      return;
    const id = detail.value.id,
      content = addition.value.trim(),
      account = user.id;
    const generation = ++actionGeneration;
    saving.value = true;
    try {
      const res = await addFeatureRequestUpdate(id, content);
      if (res?.status !== 200 || generation !== actionGeneration || detail.value?.id !== id || account !== user.id)
        return;
      addition.value = '';
      message.success(t('coBuild.updateAdded'));
      recordOperation({ module: '共建轻笺', operation: `补充产品建议【${detail.value.title.slice(0, 40)}】` });
      await loadDetail();
    } catch {
      /* The request layer presents write failures. */
    } finally {
      if (generation === actionGeneration) saving.value = false;
    }
  }
  function canDeleteTimelineUpdate(update: FeatureRequestUpdate) {
    return !['submitted', 'official_created'].includes(update.type);
  }
  function confirmDeleteTimelineUpdate(update: FeatureRequestUpdate) {
    if (
      !detail.value ||
      !isRoot.value ||
      detailBusy.value ||
      !canDeleteTimelineUpdate(update) ||
      deletingUpdateId.value ||
      saving.value
    )
      return;
    const id = detail.value.id;
    const context = actionGeneration;
    Alert.alert({
      title: t('coBuild.deleteTimelineTitle'),
      content: t('coBuild.deleteTimelineConfirm'),
      okText: t('common.delete'),
      onOk: async () => {
        if (context !== actionGeneration || detail.value?.id !== id || detailBusy.value || !isRoot.value) return;
        deletingUpdateId.value = update.id;
        try {
          await runAdminAction(id, () => deleteFeatureRequestUpdate(id, update.id), '删除共建进度记录');
        } finally {
          if (detail.value?.id === id) deletingUpdateId.value = '';
        }
      },
    });
  }
  function openReleaseUrl() {
    if (!detail.value?.releaseUrl || detailBusy.value) return;
    const url = detail.value.releaseUrl;
    if (url.startsWith('/')) void router.push(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }
  function formatDate(value: string) {
    if (!value) return '--';
    const date = new Date(value.replace(' ', 'T'));
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  }
  function timelineTitle(update: FeatureRequestUpdate) {
    const key = `coBuild.timelineType.${update.type}`,
      translated = t(key);
    return translated === key ? t('coBuild.timelineType.status_change') : translated;
  }
  function statusLabel(status: string) {
    return t(
      `${progressKeys.includes(status as FeatureRequestProgressStatus) ? 'coBuild.progress' : 'coBuild.moderation'}.${status}`,
    );
  }
  function resetTarget() {
    ++actionGeneration;
    saving.value = false;
    voting.value = false;
    deletingUpdateId.value = '';
    addition.value = '';
    mergeTargetId.value = '';
    mergeContent.value = '';
    adminReply.value = '';
    adminExpanded.value = true;
    void loadDetail(true);
  }
  watch(() => route.params.id, resetTarget);
  watch(
    () => [user.id, user.role],
    () => {
      detail.value = null;
      resetTarget();
    },
  );
  onMounted(() => {
    void loadDetail(true);
    recordOperation({ module: '共建轻笺', operation: '查看建议详情' });
  });
  onBeforeUnmount(() => {
    ++loadGeneration;
    ++actionGeneration;
  });
</script>

<style scoped lang="less">
  @import (reference) '@/assets/css/workspace-surfaces.less';
  @import (reference) './coBuildShared.less';
  .co-build-detail {
    .workspace-canvas-surface();
    .co-build-semantics();
    height: 100%;
    overflow: auto;
    color: var(--workspace-text);
  }
  .detail-shell {
    width: 100%;
    max-width: calc(var(--ui-layout-1200, 1200px) + 2 * var(--ui-space-24, 24px));
    padding: var(--ui-space-24, 24px) var(--ui-space-24, 24px) var(--ui-space-48, 48px);
    margin: 0 auto;
    box-sizing: border-box;
  }
  .back-button {
    gap: var(--ui-space-8, 8px);
    margin-bottom: var(--ui-space-20, 20px);
    color: var(--workspace-muted);
  }
  .reading-surface,
  .admin-panel,
  .addition-panel {
    .workspace-content-surface();
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    box-shadow: none;
  }
  .reading-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--ui-layout-340, 340px);
  }
  .request-article {
    min-width: 0;
    padding: var(--ui-space-32, 32px);
  }
  .detail-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--ui-space-8, 8px) var(--ui-space-12, 12px);
  }
  .request-article h1 {
    margin: var(--ui-space-18, 18px) 0 var(--ui-space-12, 12px);
    font-size: var(--ui-font-28, 28px);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .author-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-8, 8px);
    font-size: var(--ui-font-13, 13px);
    color: var(--workspace-muted);
  }
  .detail-content {
    margin: var(--ui-space-28, 28px) 0 0;
    font-size: var(--ui-font-15, 15px);
    line-height: 1.9;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .developer-reply,
  .merged-banner {
    margin-top: var(--ui-space-24, 24px);
    padding: var(--ui-space-16, 16px) var(--ui-space-18, 18px);
    border: 1px solid var(--workspace-border);
    border-radius: 10px;
    background: var(--workspace-purple-selected);
  }
  .developer-reply h2 {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    margin: 0;
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-14, 14px);
  }
  .developer-reply h2 > :first-child {
    color: var(--warning-color);
  }
  .developer-reply p {
    margin: var(--ui-space-10, 10px) 0 0;
    font-size: var(--ui-font-14, 14px);
    line-height: 1.8;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .merged-banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
    margin-top: var(--ui-space-20, 20px);
  }
  .detail-actions .b_btn {
    gap: var(--ui-space-6, 6px);
  }
  .support-button {
    border: 1px solid var(--workspace-border);
    background: var(--workspace-content);
  }
  .support-button.is-voted {
    color: var(--workspace-purple-text);
    border-color: var(--workspace-purple-text);
    background: var(--workspace-purple-selected);
  }
  .timeline-column {
    min-width: 0;
    padding: var(--ui-space-28, 28px) var(--ui-space-24, 24px);
    border-inline-start: 1px solid var(--workspace-divider);
  }
  .timeline-column > h2 {
    margin: 0 0 var(--ui-space-24, 24px);
    font-size: var(--ui-font-17, 17px);
  }
  .timeline-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .timeline-item {
    position: relative;
    padding: 0 0 var(--ui-space-24, 24px) var(--ui-space-24, 24px);
  }
  .timeline-item:last-child {
    padding-bottom: 0;
  }
  .timeline-item::before {
    content: '';
    position: absolute;
    top: var(--ui-space-6, 6px);
    bottom: 0;
    inset-inline-start: var(--ui-space-4, 4px);
    border-inline-start: 1px solid var(--workspace-border);
  }
  .timeline-item:last-child::before {
    display: none;
  }
  .timeline-item::after {
    content: '';
    position: absolute;
    top: var(--ui-space-6, 6px);
    inset-inline-start: 0;
    width: var(--ui-layout-9, 9px);
    height: var(--ui-layout-9, 9px);
    border-radius: 50%;
    background: var(--desc-color);
  }
  .timeline-item.is-developer::after {
    background: var(--workspace-purple-text);
  }
  .timeline-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-8, 8px);
    min-height: var(--ui-layout-24, 24px);
    color: var(--workspace-muted);
    font-size: var(--ui-font-12, 12px);
  }
  .timeline-body h3 {
    margin: var(--ui-space-4, 4px) 0 var(--ui-space-6, 6px);
    font-size: var(--ui-font-14, 14px);
    line-height: 1.5;
  }
  .timeline-body p {
    margin: 0 0 var(--ui-space-8, 8px);
    font-size: var(--ui-font-13, 13px);
    color: var(--workspace-muted);
    line-height: 1.7;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .timeline-status {
    display: inline-block;
    padding: var(--ui-space-2, 2px) var(--ui-space-8, 8px);
    border: 1px solid var(--workspace-border);
    border-radius: 5px;
    color: var(--workspace-purple-text);
    font-size: var(--ui-font-12, 12px);
  }
  .timeline-more.b_btn {
    width: var(--ui-control-28, 28px);
    height: var(--ui-control-28, 28px);
    padding: 0;
    background: transparent;
  }
  .timeline-empty {
    color: var(--workspace-muted);
    font-size: var(--ui-font-14, 14px);
  }
  .admin-panel,
  .addition-panel {
    margin-top: var(--ui-space-20, 20px);
  }
  .admin-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--ui-space-12, 12px);
  }
  .admin-heading h2 {
    display: flex;
    align-items: center;
    gap: var(--ui-space-8, 8px);
    margin: 0;
    font-size: var(--ui-font-18, 18px);
  }
  .admin-heading h2 > :first-child {
    color: var(--workspace-purple-text);
  }
  .admin-heading-actions {
    display: flex;
    align-items: center;
    gap: var(--ui-space-12, 12px);
    font-size: var(--ui-font-12, 12px);
    color: var(--workspace-muted);
  }
  .admin-heading-actions .b_btn {
    gap: var(--ui-space-6, 6px);
  }
  .collapse-icon.is-open {
    transform: rotate(180deg);
  }
  .admin-body {
    padding-top: var(--ui-space-16, 16px);
  }
  .admin-body :deep(.tab-container) {
    max-width: 100%;
    overflow-x: auto;
    gap: var(--ui-space-8, 8px);
  }
  .admin-body :deep(.tab) {
    flex: none;
    padding: var(--ui-space-10, 10px) var(--ui-space-12, 12px);
  }
  .admin-form {
    display: grid;
    gap: var(--ui-space-14, 14px);
    margin-top: var(--ui-space-20, 20px);
  }
  .admin-form > p {
    margin: 0;
    font-size: var(--ui-font-13, 13px);
    color: var(--workspace-muted);
    line-height: 1.7;
  }
  .progress-form {
    grid-template-columns: var(--ui-layout-220, 220px) minmax(0, 1fr) auto;
    align-items: end;
  }
  .form-field {
    display: grid;
    gap: var(--ui-space-8, 8px);
    min-width: 0;
    font-size: var(--ui-font-13, 13px);
  }
  .form-field :deep(.b-input),
  .form-field :deep(.select-trigger) {
    min-height: var(--ui-control-36, 36px);
  }
  .progress-form > .b_btn {
    height: var(--ui-control-36, 36px);
  }
  .panel-actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--ui-space-10, 10px);
    margin-top: var(--ui-space-12, 12px);
  }
  .addition-panel :deep(.card-container-header) {
    margin-bottom: var(--ui-space-16, 16px);
  }
  :deep(.b-textarea) {
    resize: vertical;
    font-family: inherit;
    line-height: 1.7;
  }
  .detail-error {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--ui-space-12, 12px);
    padding: var(--ui-space-20, 20px);
    color: var(--danger-color);
    font-size: var(--ui-font-14, 14px);
  }
  .detail-loading {
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--ui-layout-340, 340px);
    gap: var(--ui-space-24, 24px);
    padding: var(--ui-space-32, 32px);
    border: 1px solid var(--workspace-border);
    border-radius: 14px;
    background: var(--workspace-content);
  }
  .detail-loading span {
    min-height: var(--ui-layout-400, 400px);
    border-radius: 8px;
    background: var(--workspace-hover);
  }
  .not-found {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: var(--ui-space-20, 20px);
    min-height: var(--ui-layout-400, 400px);
    text-align: center;
  }
  .not-found h1 {
    font-size: var(--ui-font-18, 18px);
  }
  .is-stacked {
    .reading-grid,
    .detail-loading {
      grid-template-columns: minmax(0, 1fr);
    }
    .timeline-column {
      border-inline-start: 0;
      border-top: 1px solid var(--workspace-divider);
    }
  }
  .is-mobile {
    .detail-shell {
      padding: var(--ui-space-12, 12px) var(--ui-space-12, 12px) var(--ui-space-32, 32px);
    }
    .mobile-heading {
      display: grid;
      grid-template-columns: var(--ui-layout-44, 44px) 1fr var(--ui-layout-44, 44px);
      align-items: center;
      height: var(--ui-layout-56, 56px);
      padding: 0 var(--ui-space-12, 12px);
      background: var(--workspace-content);
      border-bottom: 1px solid var(--workspace-divider);
      font-size: var(--ui-font-18, 18px);
      text-align: center;
    }
    .mobile-back.b_btn {
      width: var(--ui-layout-44, 44px);
      height: var(--ui-layout-44, 44px);
      padding: 0;
      background: transparent;
    }
    .request-article,
    .timeline-column {
      padding: var(--ui-space-20, 20px) var(--ui-space-16, 16px);
    }
    .request-article h1 {
      margin-top: var(--ui-space-16, 16px);
      font-size: var(--ui-font-22, 22px);
    }
    .detail-content {
      margin-top: var(--ui-space-22, 22px);
      font-size: var(--ui-font-14, 14px);
    }
    .developer-reply,
    .merged-banner {
      padding: var(--ui-space-14, 14px);
    }
    .admin-heading h2 {
      font-size: var(--ui-font-16, 16px);
    }
    .admin-heading-actions {
      gap: var(--ui-space-6, 6px);
    }
    .admin-body :deep(.tab) {
      padding-inline: var(--ui-space-8, 8px);
      font-size: var(--ui-font-13, 13px);
    }
    .progress-form {
      grid-template-columns: minmax(0, 1fr);
    }
    .progress-form > .b_btn {
      justify-self: end;
    }
    .timeline-more.b_btn {
      width: var(--ui-layout-44, 44px);
      height: var(--ui-layout-44, 44px);
    }
  }
</style>
