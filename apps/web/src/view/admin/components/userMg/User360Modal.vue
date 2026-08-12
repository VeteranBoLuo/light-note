<template>
  <BModal
    v-if="visible"
    v-model:visible="visible"
    :title="t('adminUserManagement.detail.title')"
    width="920px"
    height="calc(100vh - 80px)"
    :show-footer="false"
    fullscreen-mobile
    content-class="user-360-modal-content"
    @close="close"
  >
    <div class="user-360" v-auto-scrollbar>
      <BLoading v-if="loading" inline loading :title="t('common.loading')" />

      <template v-else-if="detail">
        <header class="user-360__identity">
          <span class="user-360__avatar" :class="{ 'is-framed': equippedFrameId }" aria-hidden="true">
            <AvatarFramePreview
              v-if="equippedFrameId"
              :frame-id="equippedFrameId"
              :src="userInfo?.headPicture || icon.navigation.user"
              :size="38"
              pause-when-offscreen
            />
            <SvgIcon v-else :src="userInfo?.headPicture || icon.navigation.user" size="38" />
          </span>
          <span class="user-360__identity-copy">
            <strong>{{ displayName }}</strong>
            <span>{{ detail.profile?.email || '-' }}</span>
            <small>{{ detail.profile?.id }}</small>
          </span>
          <span class="user-360__chips">
            <BChip :tone="detail.profile?.status === 'banned' ? 'danger' : 'success'" size="medium">
              {{ statusLabel }}
            </BChip>
            <BChip :tone="detail.profile?.role === 'root' ? 'pin' : 'neutral'" size="medium">
              {{ roleLabel }}
            </BChip>
          </span>
        </header>

        <div v-if="detail.unavailableSections?.length" class="user-360__partial-notice">
          <SvgIcon :src="icon.message.warning" size="18" aria-hidden="true" />
          <span>{{ t('adminUserManagement.detail.partialData') }}</span>
        </div>

        <div class="user-360__metrics" role="list" :aria-label="t('adminUserManagement.detail.metrics')">
          <article role="listitem">
            <span>{{ t('adminUserManagement.detail.resourceTotal') }}</span>
            <strong>{{ formatCount(resourceTotal) }}</strong>
            <small>{{
              t('adminUserManagement.detail.sharedStorageUsage', {
                total: formatStorage(detail.resources?.storageUsed),
                trash: formatStorage(detail.resources?.trashStorageUsed),
              })
            }}</small>
          </article>
          <article role="listitem">
            <span>{{ t('adminUserManagement.detail.pendingTodos') }}</span>
            <strong>{{ formatCount(detail.todos?.pendingTotal) }}</strong>
            <small>{{
              t('adminUserManagement.detail.overdueCount', { count: formatCount(detail.todos?.overdueTotal) })
            }}</small>
          </article>
          <article role="listitem">
            <span>{{ t('adminUserManagement.detail.aiRequests') }}</span>
            <strong>{{ formatCount(detail.aiUsage?.requestTotal) }}</strong>
            <small>{{
              t('adminUserManagement.detail.tokenCount', { count: formatCount(detail.aiUsage?.tokenTotal) })
            }}</small>
          </article>
          <article role="listitem">
            <span>{{ t('adminUserManagement.detail.securityEvents') }}</span>
            <strong>{{ formatCount(detail.security?.eventTotal) }}</strong>
            <small>{{
              t('adminUserManagement.detail.unhandledCount', { count: formatCount(detail.security?.unhandledTotal) })
            }}</small>
          </article>
        </div>

        <BTabs v-model:active-tab="activeTab" :options="tabOptions" variant="segment" class="user-360__tabs" />

        <section v-if="activeTab === 'overview'" class="user-360__section-grid">
          <article class="user-360__section-card">
            <h3>{{ t('adminUserManagement.detail.accountProfile') }}</h3>
            <dl class="user-360__definition-grid">
              <div
                ><dt>{{ t('adminUserManagement.detail.remark') }}</dt
                ><dd>{{ detail.profile?.adminRemark || '-' }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.alias') }}</dt
                ><dd>{{ detail.profile?.alias || '-' }}</dd></div
              >
              <div>
                <dt>{{ t('adminUserManagement.detail.loginType') }}</dt>
                <dd
                  ><BChip tone="neutral" size="small">{{ loginTypeLabel }}</BChip></dd
                >
              </div>
              <div class="user-360__definition-item--wide">
                <dt>{{ t('adminUserManagement.detail.location') }}</dt>
                <dd v-if="locationParts.length" class="user-360__location">
                  <template v-for="(part, index) in locationParts" :key="part">
                    <span v-if="index" class="user-360__location-separator" aria-hidden="true">/</span>
                    <BChip tone="neutral" size="small">{{ part }}</BChip>
                  </template>
                </dd>
                <dd v-else>-</dd>
              </div>
              <div
                ><dt>{{ t('adminUserManagement.detail.ip') }}</dt
                ><dd>{{ detail.profile?.ip || '-' }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.createdAt') }}</dt
                ><dd>{{ formatTime(detail.profile?.createTime) }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.lastActiveAt') }}</dt
                ><dd>{{ formatTime(detail.profile?.lastActiveTime) }}</dd></div
              >
            </dl>
          </article>

          <article class="user-360__section-card">
            <h3>{{ t('adminUserManagement.detail.resources') }}</h3>
            <div class="user-360__resource-grid">
              <div
                ><SvgIcon :src="icon.resource.bookmark" size="20" /><span>{{ t('navigation.bookmark') }}</span
                ><strong>{{ formatCount(detail.resources?.bookmarkTotal) }}</strong></div
              >
              <div
                ><SvgIcon :src="icon.resource.note" size="20" /><span>{{ t('navigation.note') }}</span
                ><strong>{{ formatCount(detail.resources?.noteTotal) }}</strong></div
              >
              <div
                ><SvgIcon :src="icon.resource.file" size="20" /><span>{{ t('navigation.cloudSpace') }}</span
                ><strong>{{ formatCount(detail.resources?.fileTotal) }}</strong></div
              >
              <div
                ><SvgIcon :src="icon.resource.tag" size="20" /><span>{{ t('navigation.tag') }}</span
                ><strong>{{ formatCount(detail.resources?.tagTotal) }}</strong></div
              >
            </div>
          </article>

          <article class="user-360__section-card user-360__section-card--wide">
            <h3>{{ t('adminUserManagement.detail.growth') }}</h3>
            <dl class="user-360__definition-grid user-360__definition-grid--growth">
              <div
                ><dt>{{ t('adminUserManagement.detail.level') }}</dt
                ><dd>{{ formatCount(detail.growth?.level) }}</dd></div
              >
              <div
                ><dt>EXP</dt><dd>{{ formatCount(detail.growth?.exp) }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.points') }}</dt
                ><dd>{{ formatCount(detail.growth?.points) }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.streak') }}</dt
                ><dd>{{ formatCount(detail.growth?.streak) }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.storageBonus') }}</dt
                ><dd>{{ formatStorage(detail.growth?.storageBonusMb) }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.aiBonus') }}</dt
                ><dd>{{ formatCount(detail.growth?.aiBonusTokens) }}</dd></div
              >
            </dl>
          </article>
        </section>

        <section v-else-if="activeTab === 'activity'" class="user-360__section-grid">
          <article class="user-360__section-card">
            <h3>{{ t('adminUserManagement.detail.activitySummary') }}</h3>
            <dl class="user-360__definition-grid">
              <div
                ><dt>{{ t('adminUserManagement.detail.todoTotal') }}</dt
                ><dd>{{ formatCount(detail.todos?.total) }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.opinionTotal') }}</dt
                ><dd>{{ formatCount(detail.opinions?.total) }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.aiConversations') }}</dt
                ><dd>{{ formatCount(detail.aiWorkspace?.conversationTotal) }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.aiNegativeFeedback') }}</dt
                ><dd>{{ formatCount(detail.aiWorkspace?.negativeFeedbackTotal) }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.apiRequests7d') }}</dt
                ><dd>{{ formatCount(detail.apiHealth?.requestTotal) }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.serverErrors7d') }}</dt
                ><dd>{{ formatCount(detail.apiHealth?.serverErrorTotal) }}</dd></div
              >
            </dl>
          </article>
          <article class="user-360__section-card">
            <header class="user-360__section-heading">
              <h3>{{ t('adminUserManagement.detail.recentOperations') }}</h3>
              <BButton size="small" @click="openOperationLogs">{{
                t('adminUserManagement.detail.viewAllOperations')
              }}</BButton>
            </header>
            <ul v-if="detail.recentOperations?.length" class="user-360__timeline">
              <li v-for="(item, index) in detail.recentOperations" :key="`${item.createTime}-${index}`">
                <span class="user-360__timeline-dot"></span>
                <span
                  ><strong>{{ item.module || t('common.unknown') }}</strong
                  ><small>{{ item.operation || '-' }}</small></span
                >
                <time :datetime="item.createTime">{{ formatTime(item.createTime) }}</time>
              </li>
            </ul>
            <p v-else class="user-360__empty">{{ t('adminUserManagement.detail.noRecentOperations') }}</p>
          </article>
        </section>

        <section v-else-if="activeTab === 'security'" class="user-360__section-grid">
          <article class="user-360__section-card">
            <h3>{{ t('adminUserManagement.detail.securitySummary') }}</h3>
            <dl class="user-360__definition-grid">
              <div
                ><dt>{{ t('adminUserManagement.detail.highRiskEvents') }}</dt
                ><dd>{{ formatCount(detail.security?.highRiskTotal) }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.lastSecurityEvent') }}</dt
                ><dd>{{ formatTime(detail.security?.lastEventAt) }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.accountDeletion') }}</dt
                ><dd>{{ detail.accountDeletion?.status || '-' }}</dd></div
              >
              <div
                ><dt>{{ t('adminUserManagement.detail.deletionAttempts') }}</dt
                ><dd>{{ formatCount(detail.accountDeletion?.attempts) }}</dd></div
              >
            </dl>
          </article>
          <article class="user-360__section-card">
            <h3>{{ t('adminUserManagement.detail.activeDevices') }}</h3>
            <ul v-if="detail.sessions?.length" class="user-360__devices">
              <li v-for="session in detail.sessions" :key="session.id">
                <span
                  ><strong>{{ deviceLabel(session.userAgent) }}</strong
                  ><small>{{ session.ip || '-' }}</small></span
                >
                <span
                  ><time :datetime="session.lastActiveTime">{{ formatTime(session.lastActiveTime) }}</time
                  ><small>{{
                    t('adminUserManagement.detail.sessionCount', { count: formatCount(session.sessionCount) })
                  }}</small></span
                >
              </li>
            </ul>
            <p v-else class="user-360__empty">{{ t('adminUserManagement.detail.noActiveDevices') }}</p>
          </article>
        </section>

        <section v-else class="user-360__section-grid user-360__section-grid--single">
          <article class="user-360__section-card">
            <h3>{{ t('adminUserManagement.detail.adminContextAudit') }}</h3>
            <ul v-if="detail.adminContexts?.length" class="user-360__timeline">
              <li v-for="(item, index) in detail.adminContexts" :key="`${item.createTime}-${index}`">
                <span class="user-360__timeline-dot"></span>
                <span>
                  <strong>{{ item.capability || item.action || '-' }}</strong>
                  <small>{{ `${item.mode || '-'} · ${item.outcome || '-'}` }}</small>
                </span>
                <time :datetime="item.createTime">{{ formatTime(item.createTime) }}</time>
              </li>
            </ul>
            <p v-else class="user-360__empty">{{ t('adminUserManagement.detail.noAdminContexts') }}</p>
          </article>
        </section>
      </template>

      <div v-else class="user-360__error">
        <SvgIcon :src="icon.message.error" size="26" aria-hidden="true" />
        <p>{{ t('adminUserManagement.detail.loadFailed') }}</p>
        <BButton type="primary" @click="load">{{ t('common.retry') }}</BButton>
      </div>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import router from '@/router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import BTabs, { type TabItem } from '@/components/base/BasicComponents/BTabs.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import icon from '@/config/icon.ts';
  import { frameVariant } from '@/config/growthFrames.ts';
  import userApi from '@/api/userApi.ts';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import { bookmarkStore } from '@/store';
  import { formatAdminLocation, resolveAdminLoginMethod } from './userAdminProfileFormat';

  interface UserAdminDetail {
    profile?: Record<string, any>;
    resources?: Record<string, any>;
    todos?: Record<string, any>;
    opinions?: Record<string, any>;
    growth?: Record<string, any>;
    aiUsage?: Record<string, any>;
    aiWorkspace?: Record<string, any>;
    security?: Record<string, any>;
    apiHealth?: Record<string, any>;
    sessions?: Record<string, any>[];
    recentOperations?: Record<string, any>[];
    adminContexts?: Record<string, any>[];
    accountDeletion?: Record<string, any> | null;
    unavailableSections?: string[];
  }

  const visible = defineModel<boolean>('visible');
  const props = defineProps<{ userInfo?: Record<string, any> | null }>();
  const { t, locale } = useI18n();
  const bookmark = bookmarkStore();
  const loading = ref(false);
  const detail = ref<UserAdminDetail | null>(null);
  const activeTab = ref('overview');
  let requestSequence = 0;

  const displayName = computed(
    () => detail.value?.profile?.adminRemark || detail.value?.profile?.alias || detail.value?.profile?.email || '-',
  );
  const equippedFrameId = computed(() => {
    const frameId = detail.value?.growth?.equippedFrame || props.userInfo?.equippedFrame;
    return frameVariant(frameId) ? frameId : null;
  });
  const resourceTotal = computed(() =>
    ['bookmarkTotal', 'noteTotal', 'fileTotal', 'tagTotal'].reduce(
      (total, field) => total + Number(detail.value?.resources?.[field] || 0),
      0,
    ),
  );
  const statusLabel = computed(() =>
    detail.value?.profile?.status === 'banned'
      ? t('adminUserManagement.detail.statusBanned')
      : t('adminUserManagement.detail.statusActive'),
  );
  const roleLabel = computed(() => {
    const role = String(detail.value?.profile?.role || 'user');
    return t(`adminUserManagement.detail.roles.${role}`);
  });
  const loginTypeLabel = computed(() =>
    t(`adminUserManagement.detail.loginMethods.${resolveAdminLoginMethod(detail.value?.profile?.loginType)}`),
  );
  const locationParts = computed(() => formatAdminLocation(detail.value?.profile?.location));
  const tabOptions = computed<TabItem[]>(() => [
    { key: 'overview', label: t('adminUserManagement.detail.tabs.overview') },
    { key: 'activity', label: t('adminUserManagement.detail.tabs.activity') },
    {
      key: 'security',
      label: t('adminUserManagement.detail.tabs.security'),
      badge: Number(detail.value?.security?.unhandledTotal || 0),
    },
    {
      key: 'audit',
      label: t('adminUserManagement.detail.tabs.audit'),
      badge: detail.value?.adminContexts?.length || 0,
    },
  ]);

  function formatCount(value: unknown) {
    return new Intl.NumberFormat(locale.value === 'en-US' ? 'en-US' : 'zh-CN').format(Number(value || 0));
  }

  function formatStorage(value: unknown) {
    const amount = Number(value || 0);
    return `${amount.toLocaleString(locale.value === 'en-US' ? 'en-US' : 'zh-CN', { maximumFractionDigits: 2 })} MB`;
  }

  function formatTime(value: unknown) {
    if (!value) return '-';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(locale.value === 'en-US' ? 'en-US' : 'zh-CN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  function deviceLabel(userAgent: unknown) {
    const ua = String(userAgent || '');
    const platform = /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad/i.test(ua)
        ? 'iOS'
        : /Macintosh/i.test(ua)
          ? 'macOS'
          : /Windows/i.test(ua)
            ? 'Windows'
            : t('common.unknown');
    const browser = /Edg\//i.test(ua)
      ? 'Edge'
      : /Firefox\//i.test(ua)
        ? 'Firefox'
        : /Chrome\//i.test(ua)
          ? 'Chrome'
          : /Safari\//i.test(ua)
            ? 'Safari'
            : t('common.unknown');
    return `${platform} · ${browser}`;
  }

  async function load() {
    const userId = String(props.userInfo?.id || '');
    if (!visible.value || !userId) return;
    const sequence = ++requestSequence;
    loading.value = true;
    detail.value = null;
    try {
      const response = await userApi.getAdminUserDetail(userId);
      if (sequence !== requestSequence || !visible.value) return;
      if (response.status !== 200 || !response.data?.profile) throw new Error(response.msg || 'load failed');
      detail.value = response.data;
    } catch {
      if (sequence !== requestSequence || !visible.value) return;
      message.error(t('adminUserManagement.detail.loadFailed'));
    } finally {
      if (sequence === requestSequence) loading.value = false;
    }
  }

  function close() {
    requestSequence += 1;
    visible.value = false;
    loading.value = false;
  }

  function openOperationLogs() {
    const userId = String(detail.value?.profile?.id || props.userInfo?.id || '');
    if (!userId) return;
    close();
    router.push({ path: bookmark.isMobile ? '/operationLog' : '/admin/operationLog', query: { userId } });
  }

  watch(
    () => [visible.value, props.userInfo?.id],
    ([isVisible]) => {
      if (!isVisible) {
        requestSequence += 1;
        detail.value = null;
        activeTab.value = 'overview';
        return;
      }
      void load();
    },
    { immediate: true },
  );
</script>

<style scoped lang="less">
  .user-360 {
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    padding: 18px 20px 24px;
    overflow: auto;
    color: var(--text-color);
  }

  .user-360__identity {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--surface-raised-background);
  }

  .user-360__avatar {
    width: 52px;
    height: 52px;
    display: inline-flex;
    flex: 0 0 52px;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    background: var(--card-background);
    color: var(--primary-color);
  }

  .user-360__avatar :deep(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .user-360__avatar.is-framed {
    overflow: visible;
    border-color: transparent;
    background: transparent;
  }

  .user-360__identity-copy {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 3px;
  }

  .user-360__identity-copy strong,
  .user-360__identity-copy span,
  .user-360__identity-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-360__identity-copy strong {
    font-size: 18px;
    font-weight: 700;
  }

  .user-360__identity-copy span,
  .user-360__identity-copy small {
    color: var(--desc-color);
    font-size: 12px;
  }

  .user-360__chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .user-360__partial-notice {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid var(--warning-color);
    border-radius: 10px;
    background: var(--card-background);
    color: var(--warning-color);
    font-size: 13px;
  }

  .user-360__metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin: 14px 0;
  }

  .user-360__metrics article {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border: 1px solid var(--surface-border-color);
    border-left: 3px solid var(--primary-color);
    border-radius: 10px;
    background: var(--card-background);
  }

  .user-360__metrics span,
  .user-360__metrics small {
    color: var(--desc-color);
    font-size: 12px;
  }

  .user-360__metrics strong {
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }

  .user-360__tabs {
    margin-bottom: 14px;
  }

  .user-360__section-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .user-360__section-grid--single {
    grid-template-columns: 1fr;
  }

  .user-360__section-card {
    min-width: 0;
    padding: 14px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }

  .user-360__section-card--wide {
    grid-column: 1 / -1;
  }

  .user-360__section-card h3 {
    margin: 0 0 12px;
    font-size: 15px;
    font-weight: 700;
  }

  .user-360__section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 12px;
  }

  .user-360__section-heading h3 {
    margin: 0;
  }

  .user-360__definition-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px 14px;
    margin: 0;
  }

  .user-360__definition-grid--growth {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .user-360__definition-grid div {
    min-width: 0;
  }

  .user-360__definition-grid .user-360__definition-item--wide {
    grid-column: 1 / -1;
  }

  .user-360__definition-grid dt {
    margin-bottom: 3px;
    color: var(--desc-color);
    font-size: 11px;
  }

  .user-360__definition-grid dd {
    margin: 0;
    overflow-wrap: anywhere;
    font-size: 13px;
  }

  .user-360__location {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .user-360__location-separator {
    color: var(--desc-color);
    font-size: 11px;
  }

  .user-360__resource-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .user-360__resource-grid div {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    min-height: 42px;
    padding: 0 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    background: var(--workspace-panel-bg-color);
  }

  .user-360__resource-grid div:nth-child(1) {
    color: var(--resource-bookmark-color);
  }
  .user-360__resource-grid div:nth-child(2) {
    color: var(--resource-note-color);
  }
  .user-360__resource-grid div:nth-child(3) {
    color: var(--resource-file-color);
  }
  .user-360__resource-grid div:nth-child(4) {
    color: var(--resource-tag-color);
  }

  .user-360__resource-grid span {
    color: var(--text-color);
    font-size: 13px;
  }

  .user-360__timeline,
  .user-360__devices {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .user-360__timeline li,
  .user-360__devices li {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 0;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .user-360__timeline li:last-child,
  .user-360__devices li:last-child {
    border-bottom: 0;
  }

  .user-360__timeline li > span:nth-child(2),
  .user-360__devices li > span {
    min-width: 0;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 2px;
  }

  .user-360__devices li > span:last-child {
    align-items: flex-end;
    text-align: right;
  }

  .user-360__timeline strong,
  .user-360__timeline small,
  .user-360__devices strong,
  .user-360__devices small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-360__timeline small,
  .user-360__timeline time,
  .user-360__devices small,
  .user-360__devices time {
    color: var(--desc-color);
    font-size: 11px;
  }

  .user-360__timeline time {
    flex: 0 0 auto;
  }

  .user-360__timeline-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 8px;
    border: 2px solid var(--primary-color);
    border-radius: 50%;
    background: var(--card-background);
  }

  .user-360__empty {
    margin: 24px 0;
    color: var(--desc-color);
    text-align: center;
  }

  .user-360__error {
    min-height: 260px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 10px;
    color: var(--danger-color);
  }

  @media (max-width: 767px) {
    .user-360 {
      padding: 12px 12px calc(24px + env(safe-area-inset-bottom));
    }

    .user-360__identity {
      align-items: flex-start;
      padding: 12px;
    }

    .user-360__avatar {
      width: 46px;
      height: 46px;
      flex-basis: 46px;
    }

    .user-360__identity-copy strong {
      font-size: 16px;
    }

    .user-360__chips {
      flex-direction: column;
      align-items: flex-end;
    }

    .user-360__metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .user-360__metrics article {
      min-height: 78px;
    }

    .user-360__tabs {
      position: sticky;
      top: 0;
      z-index: 2;
      padding: 4px 0;
      background: var(--background-color);
    }

    .user-360__section-grid,
    .user-360__definition-grid--growth {
      grid-template-columns: 1fr;
    }

    .user-360__section-card--wide {
      grid-column: auto;
    }

    .user-360__timeline li {
      align-items: flex-start;
    }

    .user-360__timeline time {
      max-width: 84px;
      text-align: right;
    }
  }

  @media (max-width: 359px) {
    .user-360__definition-grid,
    .user-360__resource-grid {
      grid-template-columns: 1fr;
    }

    .user-360__identity {
      flex-wrap: wrap;
    }

    .user-360__chips {
      width: 100%;
      flex-direction: row;
      justify-content: flex-start;
    }
  }
</style>
