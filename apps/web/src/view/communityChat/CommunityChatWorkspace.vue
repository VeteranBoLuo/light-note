<template>
  <section
    class="community-workspace"
    :class="{ 'has-room-list': showRoomList }"
    :aria-label="t('communityChat.workspaceLabel')"
  >
    <aside v-if="showRoomList" v-auto-scrollbar class="community-workspace__rooms">
      <div class="community-workspace__rooms-heading">
        <span class="community-workspace__rooms-mark" aria-hidden="true">
          <SvgIcon :src="icon.ai.conversations" size="20" />
        </span>
        <div>
          <strong>{{ t('communityChat.roomsTitle') }}</strong>
          <span>{{ t('communityChat.roomsSubtitle') }}</span>
        </div>
      </div>
      <div class="community-workspace__room-list" role="list">
        <BButton
          v-for="room in rooms"
          :key="room.slug"
          class="community-room-button"
          :class="{ 'is-current': room.slug === selectedRoomSlug }"
          :aria-current="room.slug === selectedRoomSlug ? 'page' : undefined"
          @click="selectRoom(room.slug)"
        >
          <span class="community-room-button__symbol" aria-hidden="true">{{
            room.type === 'announcement' ? '!' : '#'
          }}</span>
          <span class="community-room-button__copy">
            <strong>{{ room.name }}</strong>
            <small>{{ room.description }}</small>
          </span>
          <span v-if="room.unreadCount > 0" class="community-room-button__badge" :aria-label="unreadLabel(room)">
            {{ room.unreadCount > 99 ? '99+' : room.unreadCount }}
          </span>
        </BButton>
      </div>
    </aside>

    <div class="community-workspace__conversation">
      <header v-if="currentRoom" class="community-conversation-header">
        <div class="community-conversation-header__title">
          <span aria-hidden="true">
            <SvgIcon :src="icon.ai.conversations" size="17" />
          </span>
          <div>
            <strong>{{ currentRoom.name }}</strong>
            <small>{{ currentRoom.description }}</small>
          </div>
        </div>
        <div class="community-conversation-header__actions">
          <BButton
            v-if="access.authenticated"
            class="community-conversation-header__settings"
            :aria-label="t('communityChat.settings.open')"
            @click="settingsVisible = true"
          >
            <SvgIcon :src="icon.userCenter.settingsGear" size="16" aria-hidden="true" />
            <span>{{ t('communityChat.settings.open') }}</span>
          </BButton>
          <span class="community-conversation-header__delivery" :class="`is-${realtimeStatus}`" role="status">
            <i aria-hidden="true"></i>{{ realtimeStatusLabel }}
          </span>
        </div>
      </header>

      <div class="community-message-stream">
        <div
          ref="messageListEl"
          v-auto-scrollbar
          class="community-message-list"
          aria-live="polite"
          @scroll="handleMessageListScroll"
        >
          <div v-if="access.emergencyReadOnly" class="community-runtime-readonly" role="status">
            <span class="community-runtime-readonly__icon" aria-hidden="true">
              <SvgIcon :src="icon.message.info" size="17" />
            </span>
            <div>
              <strong>{{ t('communityChat.emergencyReadOnlyTitle') }}</strong>
              <span>{{ t('communityChat.emergencyReadOnlyDescription') }}</span>
            </div>
          </div>
          <div v-if="hasMore && !initialLoading" class="community-message-list__older">
            <BButton size="small" :loading="olderLoading" @click="loadOlder">
              {{ t('communityChat.loadOlder') }}
            </BButton>
          </div>

          <div
            v-if="initialLoading"
            class="community-message-skeleton"
            :aria-label="t('communityChat.messagesLoading')"
          >
            <span v-for="index in 4" :key="index" :class="{ 'is-own': index % 3 === 0 }"></span>
          </div>

          <div v-else-if="loadError && !chatMessages.length" class="community-message-state" role="status">
            <strong>{{ t('communityChat.messagesLoadFailed') }}</strong>
            <p>{{ t('communityChat.messagesLoadFailedDescription') }}</p>
            <BButton size="small" @click="loadInitial">{{ t('communityChat.retryMessages') }}</BButton>
          </div>

          <div v-else-if="!chatMessages.length" class="community-message-state">
            <span class="community-message-state__icon" aria-hidden="true">
              <SvgIcon :src="icon.ai.conversations" size="24" />
            </span>
            <strong>{{ t('communityChat.emptyMessages') }}</strong>
            <p>{{ t('communityChat.emptyMessagesDescription') }}</p>
          </div>

          <template v-else>
            <article
              v-for="chatMessage in chatMessages"
              :key="chatMessage.publicId"
              class="community-message"
              :class="{
                'is-own': chatMessage.isOwn,
                'is-focused': chatMessage.publicId === focusedMessagePublicId,
              }"
              :data-message-public-id="chatMessage.publicId"
            >
              <BButton
                class="community-message__avatar"
                :aria-label="t('communityChat.profile.view', { name: authorName(chatMessage) })"
                @click="openAuthorProfile(chatMessage)"
              >
                <AvatarFramePreview
                  v-if="authorFrameId(chatMessage)"
                  :frame-id="authorFrameId(chatMessage)"
                  :src="authorAvatarSource(chatMessage)"
                  :size="32"
                />
                <SvgIcon
                  v-else
                  class="community-message__avatar-image"
                  :src="authorAvatarSource(chatMessage)"
                  size="36"
                />
              </BButton>
              <div class="community-message__body">
                <div class="community-message__meta">
                  <strong>{{ authorName(chatMessage) }}</strong>
                  <span class="community-message__level">
                    Lv.{{ chatMessage.author.level }} {{ chatMessage.author.levelName }}
                  </span>
                  <span v-if="chatMessage.author.role !== 'member'" class="community-message__role">
                    {{ authorRoleLabel(chatMessage.author.role) }}
                  </span>
                  <time :datetime="chatMessage.createdAt">{{ formatMessageTime(chatMessage.createdAt) }}</time>
                </div>
                <div v-if="chatMessage.reply" class="community-message__reply">
                  <strong>{{ chatMessage.reply.authorName || t('communityChat.memberFallback') }}</strong>
                  <span>
                    {{
                      chatMessage.reply.status === 'active'
                        ? chatMessage.reply.content ||
                          (chatMessage.reply.hasImages ? t('communityChat.image.messageFallback') : '')
                        : t('communityChat.replyUnavailable')
                    }}
                  </span>
                </div>
                <p v-if="chatMessage.content" class="community-message__content">{{ chatMessage.content }}</p>
                <div
                  v-if="chatMessage.images?.length"
                  class="community-message__images"
                  :class="`has-${Math.min(chatMessage.images.length, 4)}`"
                >
                  <BButton
                    v-for="imageItem in chatMessage.images"
                    :key="imageItem.publicId"
                    class="community-message__image"
                    :aria-label="t('communityChat.image.preview')"
                    @click="openImagePreview(imageItem)"
                  >
                    <img
                      :src="imageItem.url"
                      :alt="t('communityChat.image.messageAlt', { name: authorName(chatMessage) })"
                      loading="lazy"
                    />
                  </BButton>
                </div>
                <div v-if="messageHasActions(chatMessage)" class="community-message__actions">
                  <BButton v-if="access.canPost && !chatMessage.isOwn" size="small" @click="startReply(chatMessage)">
                    {{ t('communityChat.replyAction') }}
                  </BButton>
                  <BActionMenu
                    v-if="messageMenuItems(chatMessage).length"
                    :items="messageMenuItems(chatMessage)"
                    placement="bottom-left"
                    :disabled="messageActionBusyId === chatMessage.publicId"
                    :aria-label="t('communityChat.messageActions')"
                    @select="(action) => handleMessageAction(action, chatMessage)"
                  >
                    <BButton
                      size="small"
                      class="community-message__more"
                      :loading="messageActionBusyId === chatMessage.publicId"
                      :aria-label="t('communityChat.messageActions')"
                    >
                      <SvgIcon :src="icon.common.more" size="16" aria-hidden="true" />
                    </BButton>
                  </BActionMenu>
                </div>
              </div>
            </article>
          </template>
        </div>
        <BButton
          v-if="focusedMessagePublicId && hasNewerThanFocus"
          class="community-message-list__new"
          :aria-label="t('communityChat.backToLatest')"
          @click="returnToLatest"
        >
          <SvgIcon :src="icon.noteTree.chevron" size="15" aria-hidden="true" />
          <span>{{ t('communityChat.backToLatest') }}</span>
        </BButton>
        <BButton
          v-else-if="pendingNewMessageCount > 0"
          class="community-message-list__new"
          :aria-label="t('communityChat.newMessages', { count: pendingNewMessageCount })"
          @click="jumpToLatest"
        >
          <SvgIcon :src="icon.noteTree.chevron" size="15" aria-hidden="true" />
          <span>{{ t('communityChat.newMessages', { count: pendingNewMessageCount }) }}</span>
        </BButton>
      </div>

      <footer class="community-composer">
        <div
          v-if="canPostCurrentRoom"
          class="community-composer__surface"
          :class="{ 'is-drag-active': isComposerDragActive }"
          :aria-busy="imageUploadsInFlight > 0"
          @paste="handleComposerPaste"
          @dragenter.prevent="handleComposerDragEnter"
          @dragover.prevent="handleComposerDragOver"
          @dragleave="handleComposerDragLeave"
          @drop.prevent="handleComposerDrop"
        >
          <div v-if="isComposerDragActive" class="community-composer__drop-overlay" role="status">
            <span aria-hidden="true">
              <SvgIcon :src="icon.noteDetail.toolbar.image" size="22" />
            </span>
            <strong>{{ t('communityChat.image.dropHint') }}</strong>
          </div>

          <div v-if="pendingImages.length || imageUploadsInFlight" class="community-composer__images">
            <div v-for="imageItem in pendingImages" :key="imageItem.publicId" class="community-composer__image">
              <BButton :aria-label="t('communityChat.image.preview')" @click="openImagePreview(imageItem)">
                <img :src="imageItem.url" :alt="t('communityChat.image.pendingAlt')" />
              </BButton>
              <BButton
                class="community-composer__image-remove"
                :loading="removingImageIds.has(imageItem.publicId)"
                :aria-label="t('communityChat.image.remove')"
                @click="removePendingImage(imageItem)"
              >
                <SvgIcon :src="icon.common.close" size="12" aria-hidden="true" />
              </BButton>
            </div>
            <span v-if="imageUploadsInFlight" class="community-composer__image-uploading" role="status">
              {{ t('communityChat.image.uploading', { count: imageUploadsInFlight }) }}
            </span>
          </div>

          <div v-if="mentionTargets.length" class="community-composer__mentions">
            <strong>{{ t('communityChat.mentioning') }}</strong>
            <div>
              <BButton
                v-for="target in mentionTargets"
                :key="target.publicId"
                size="small"
                :aria-label="t('communityChat.cancelMention', { name: target.name })"
                @click="cancelMention(target.publicId)"
              >
                @{{ target.name }}
                <SvgIcon :src="icon.common.close" size="12" aria-hidden="true" />
              </BButton>
            </div>
          </div>

          <div v-if="replyTarget" class="community-composer__reply">
            <div>
              <strong>{{ t('communityChat.replyingTo', { name: authorName(replyTarget) }) }}</strong>
              <span>{{ replyTarget.content || t('communityChat.image.messageFallback') }}</span>
            </div>
            <BButton size="small" :aria-label="t('communityChat.cancelReply')" @click="cancelReply">
              <SvgIcon :src="icon.common.close" size="14" aria-hidden="true" />
            </BButton>
          </div>

          <BInput
            ref="composerInput"
            v-model:value="draft"
            class="community-composer__input"
            type="textarea"
            :rows="1"
            :maxlength="2000"
            :submit-on-enter="true"
            :placeholder="t('communityChat.messagePlaceholder')"
            :disabled="sending"
            @enter="sendMessage"
          />

          <div class="community-composer__toolbar">
            <div class="community-composer__tools">
              <BUpload
                raw-file
                multiple
                accept="image/jpeg,image/png,image/webp"
                :max-total-size="20 * 1024 * 1024"
                :disabled="imageUploadDisabled"
                @change="handleImageFiles"
              >
                <BButton
                  class="community-composer__attach"
                  :disabled="imageUploadDisabled"
                  :aria-label="t('communityChat.image.add')"
                  :title="t('communityChat.image.add')"
                >
                  <SvgIcon :src="icon.noteDetail.toolbar.image" size="19" aria-hidden="true" />
                </BButton>
              </BUpload>
              <span class="community-composer__upload-hint">{{ t('communityChat.image.inputHint') }}</span>
            </div>
            <div class="community-composer__actions">
              <span :class="{ 'is-near-limit': draftLength > 1800 }">{{ draftLength }}/2000</span>
              <BButton
                type="primary"
                class="community-composer__send"
                :loading="sending"
                :disabled="!canSend"
                :aria-label="t('communityChat.sendAction')"
                :title="t('communityChat.sendAction')"
                @click="sendMessage"
              >
                <SvgIcon :src="icon.arrow_right" size="16" aria-hidden="true" />
              </BButton>
            </div>
          </div>
        </div>
        <div v-else-if="!access.authenticated" class="community-composer__guest" role="status">
          <div>
            <strong>{{ t('communityChat.guestReadOnlyTitle') }}</strong>
            <span>{{ t('communityChat.guestReadOnlyDescription') }}</span>
          </div>
          <BButton type="primary" @click="openAuthentication">{{ t('communityChat.guestLoginAction') }}</BButton>
        </div>
        <div v-else class="community-composer__locked" role="status">
          <SvgIcon :src="icon.message.info" size="17" aria-hidden="true" />
          <span>
            {{
              access.emergencyReadOnly
                ? t('communityChat.emergencyReadOnlyComposer')
                : t('communityChat.announcementReadOnly')
            }}
          </span>
        </div>
      </footer>
    </div>
  </section>

  <ChatReportModal
    v-model:visible="reportVisible"
    :author-name="reportTarget ? authorName(reportTarget) : ''"
    :submitting="reporting"
    @submit="submitReport"
  />
  <ChatBlockListModal
    v-model:visible="blocksVisible"
    :items="blockedUsers"
    :loading="blocksLoading"
    :unblocking-id="unblockingId"
    @refresh="loadBlocks"
    @unblock="unblockUser"
  />
  <ChatSettingsModal v-model:visible="settingsVisible" @manage-blocks="openBlocksFromSettings" />
  <ChatUserProfileModal
    v-model:visible="profileVisible"
    :profile="authorProfile"
    :loading="profileLoading"
    :error="profileError"
    @retry="loadAuthorProfile"
  />
  <BModal
    v-model:visible="imagePreviewVisible"
    :title="t('communityChat.image.previewTitle')"
    :show-footer="false"
    width="min(900px, calc(100vw - 32px))"
    modal-class="community-image-preview-modal"
  >
    <div v-if="previewImage" class="community-image-preview">
      <img :src="previewImage.url" :alt="t('communityChat.image.previewAlt')" />
      <span>{{ previewImage.width }} × {{ previewImage.height }}</span>
    </div>
  </BModal>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import {
    blockCommunityChatMessageAuthor,
    createCommunityChatClientRequestId,
    discardCommunityChatImage,
    getCommunityChatBlocks,
    getCommunityChatMessageAuthorProfile,
    getCommunityChatMessages,
    markCommunityChatRoomRead,
    reportCommunityChatMessage,
    sendCommunityChatMessage,
    unblockCommunityChatUser,
    uploadCommunityChatImage,
    type CommunityChatAccess,
    type CommunityChatAuthorProfile,
    type CommunityChatBlockItem,
    type CommunityChatImage,
    type CommunityChatMessage,
    type CommunityChatMessagePage,
    type CommunityChatReportReason,
    type CommunityChatRoom,
  } from '@/api/communityChatApi';
  import { recordOperation } from '@/api/commonApi';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import type { BActionMenuItem } from '@/components/base/BasicComponents/actionMenu';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import ChatBlockListModal from '@/components/communityChat/ChatBlockListModal.vue';
  import ChatSettingsModal from '@/components/communityChat/ChatSettingsModal.vue';
  import ChatReportModal from '@/components/communityChat/ChatReportModal.vue';
  import ChatUserProfileModal from '@/components/communityChat/ChatUserProfileModal.vue';
  import { useCommunityChatSocket, type CommunityChatRealtimeEvent } from '@/composables/useCommunityChatSocket';
  import { useCommunityChatUnread } from '@/composables/useCommunityChatUnread';
  import icon from '@/config/icon';
  import { frameVariant } from '@/config/growthFrames';
  import { bookmarkStore, useUserStore } from '@/store';
  import { scrollIntoContainer } from '@/utils/zoom';

  const props = defineProps<{
    access: CommunityChatAccess;
    rooms: CommunityChatRoom[];
  }>();
  const emit = defineEmits<{
    roomRead: [roomSlug: string];
    accessInvalidated: [];
  }>();

  const { t, locale } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const unread = useCommunityChatUnread();
  const bookmark = bookmarkStore();
  const currentUser = useUserStore();
  const selectedRoomSlug = ref('');
  const chatMessages = ref<CommunityChatMessage[]>([]);
  const initialLoading = ref(false);
  const olderLoading = ref(false);
  const loadError = ref(false);
  const hasMore = ref(false);
  const nextBefore = ref<string | null>(null);
  const messageListEl = ref<HTMLElement | null>(null);
  const composerInput = ref<InstanceType<typeof BInput> | null>(null);
  const draft = ref('');
  const sending = ref(false);
  const replyTarget = ref<CommunityChatMessage | null>(null);
  const mentionTargets = ref<Array<{ publicId: string; name: string }>>([]);
  const pendingClientRequestId = ref<string | null>(null);
  const reportVisible = ref(false);
  const reportTarget = ref<CommunityChatMessage | null>(null);
  const reporting = ref(false);
  const reportedMessageIds = ref(new Set<string>());
  const pendingImages = ref<CommunityChatImage[]>([]);
  const imageUploadsInFlight = ref(0);
  const isComposerDragActive = ref(false);
  const removingImageIds = ref(new Set<string>());
  const imagePreviewVisible = ref(false);
  const previewImage = ref<CommunityChatImage | null>(null);
  const blocksVisible = ref(false);
  const settingsVisible = ref(false);
  const blocksLoading = ref(false);
  const blockedUsers = ref<CommunityChatBlockItem[]>([]);
  const unblockingId = ref('');
  const messageActionBusyId = ref('');
  const profileVisible = ref(false);
  const profileLoading = ref(false);
  const profileError = ref(false);
  const profileTargetMessageId = ref('');
  const authorProfile = ref<CommunityChatAuthorProfile | null>(null);
  const profileCache = new Map<string, CommunityChatAuthorProfile>();
  const pendingNewMessageCount = ref(0);
  const focusedMessagePublicId = ref('');
  const hasNewerThanFocus = ref(false);
  let profileLoadGeneration = 0;
  let loadGeneration = 0;
  let pollTimer: number | undefined;
  let markReadTimer: number | undefined;
  let lastMarkedReadMessageId = '';
  let clearingFocusRouteValue = '';
  let latestRefreshInFlight = false;
  let latestRefreshQueued = false;
  let latestRefreshQueuedForce = false;
  let lastAuthorityRefreshAt = 0;
  let realtimeAuthorityRefreshPending = false;
  let isUnmounted = false;
  let composerDragDepth = 0;
  const COMPOSER_INPUT_MIN_HEIGHT = 42;
  const COMPOSER_INPUT_MAX_HEIGHT = 112;

  const currentRoom = computed(() => props.rooms.find((room) => room.slug === selectedRoomSlug.value) || null);
  const showRoomList = computed(() => props.rooms.length > 1);
  const draftLength = computed(() => Array.from(String(draft.value || '')).length);
  const focusMessageFromRoute = computed(() => {
    const value = route.query.message;
    return typeof value === 'string' ? value.trim() : '';
  });
  const canSend = computed(() => {
    const hasPayload = Boolean(String(draft.value || '').trim()) || pendingImages.value.length > 0;
    return hasPayload && draftLength.value <= 2000 && !sending.value && imageUploadsInFlight.value === 0;
  });
  const canPostCurrentRoom = computed(
    () =>
      props.access.canPost &&
      (currentRoom.value?.type !== 'announcement' ||
        props.access.memberRole === 'admin' ||
        props.access.memberRole === 'moderator'),
  );
  const imageUploadBusy = computed(() => !canPostCurrentRoom.value || sending.value || imageUploadsInFlight.value > 0);
  const imageUploadDisabled = computed(() => imageUploadBusy.value || pendingImages.value.length >= 4);
  const realtimeEnabled = computed(() => Boolean(props.access.realtimeEnabled && props.access.canRead));
  const realtimeIdentityKey = computed(() => `${currentUser.id || 'guest'}:${currentUser.role || 'visitor'}`);
  const { status: realtimeStatus } = useCommunityChatSocket({
    enabled: realtimeEnabled,
    roomSlug: selectedRoomSlug,
    identityKey: realtimeIdentityKey,
    onEvent: handleRealtimeEvent,
    onSynchronized: handleRealtimeSynchronized,
  });
  const realtimeStatusLabel = computed(() => {
    if (realtimeStatus.value === 'connected') return t('communityChat.realtimeConnected');
    if (realtimeStatus.value === 'connecting' || realtimeStatus.value === 'reconnecting') {
      return t('communityChat.realtimeReconnecting');
    }
    return t('communityChat.autoRefresh');
  });

  function unreadLabel(room: CommunityChatRoom) {
    return t('communityChat.roomUnread', { room: room.name, count: room.unreadCount });
  }

  function authorName(chatMessage: CommunityChatMessage) {
    return chatMessage.author.name || t('communityChat.memberFallback');
  }

  function authorAvatarSource(chatMessage: CommunityChatMessage) {
    return chatMessage.author.avatar || icon.navigation.user;
  }

  function authorFrameId(chatMessage: CommunityChatMessage) {
    return frameVariant(chatMessage.author.frameId) ? chatMessage.author.frameId : null;
  }

  function authorRoleLabel(role: CommunityChatMessage['author']['role']) {
    return t(`communityChat.authorRole.${role}`);
  }

  function openAuthorProfile(chatMessage: CommunityChatMessage) {
    profileTargetMessageId.value = chatMessage.publicId;
    profileVisible.value = true;
    const cached = profileCache.get(chatMessage.publicId);
    if (cached) {
      authorProfile.value = cached;
      profileLoading.value = false;
      profileError.value = false;
      return;
    }
    authorProfile.value = null;
    void loadAuthorProfile();
  }

  async function loadAuthorProfile() {
    const messagePublicId = profileTargetMessageId.value;
    if (!messagePublicId) return;
    const generation = ++profileLoadGeneration;
    profileLoading.value = true;
    profileError.value = false;
    try {
      const response = await getCommunityChatMessageAuthorProfile(messagePublicId);
      if (generation !== profileLoadGeneration || messagePublicId !== profileTargetMessageId.value) return;
      const profile = response.data as CommunityChatAuthorProfile;
      if (!profile || !Array.isArray(profile.achievements)) throw new Error('COMMUNITY_PROFILE_INVALID');
      profileCache.set(messagePublicId, profile);
      authorProfile.value = profile;
    } catch {
      if (generation === profileLoadGeneration) {
        authorProfile.value = null;
        profileError.value = true;
      }
    } finally {
      if (generation === profileLoadGeneration) profileLoading.value = false;
    }
  }

  function messageMenuItems(chatMessage: CommunityChatMessage): BActionMenuItem[] {
    if (chatMessage.isOwn) return [];
    const alreadyReported = reportedMessageIds.value.has(chatMessage.publicId);
    const items: BActionMenuItem[] = [];
    if (props.access.canPost) {
      items.push({
        key: 'mention',
        label: t('communityChat.mentionAction'),
        icon: icon.noteDetail.toolbar.mention,
        disabled: mentionTargets.value.some((target) => target.publicId === chatMessage.publicId),
      });
    }
    if (items.length) items.push({ key: 'message-report-divider', divider: true });
    items.push({
      key: 'report',
      label: alreadyReported ? t('communityChat.report.submitted') : t('communityChat.report.action'),
      icon: icon.message.warning,
      danger: true,
      disabled: alreadyReported,
    });
    if (chatMessage.author.role !== 'official') {
      items.push({
        key: 'block',
        label: t('communityChat.blocks.action'),
        icon: icon.growth.lock,
        danger: true,
      });
    }
    return items;
  }

  function messageHasActions(chatMessage: CommunityChatMessage) {
    return props.access.authenticated && !chatMessage.isOwn;
  }

  function formatMessageTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale.value, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function isNearBottom() {
    const element = messageListEl.value;
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight < 96;
  }

  async function scrollToBottom() {
    await nextTick();
    if (messageListEl.value) messageListEl.value.scrollTop = messageListEl.value.scrollHeight;
  }

  async function scrollToFocusedMessage(publicId: string) {
    await nextTick();
    if (!messageListEl.value) {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
    const container = messageListEl.value;
    if (!container || !publicId) return;
    const findTarget = () =>
      Array.from(container.querySelectorAll<HTMLElement>('[data-message-public-id]')).find(
        (element) => element.getAttribute('data-message-public-id') === publicId,
      );
    let target = findTarget();
    if (!target) {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      target = findTarget();
    }
    if (!target) {
      await scrollToBottom();
      return;
    }
    const centerOffset = Math.max(12, container.clientHeight / 2 - target.offsetHeight / 2);
    scrollIntoContainer(container, target, centerOffset);
  }

  async function clearFocusMessageRoute() {
    const routeValue = focusMessageFromRoute.value;
    if (!routeValue) return;
    const query = { ...route.query };
    delete query.message;
    clearingFocusRouteValue = routeValue;
    try {
      await router.replace({ query });
    } catch {
      clearingFocusRouteValue = '';
    }
  }

  function scheduleMarkLatestRead() {
    if (!props.access.authenticated) return;
    if (markReadTimer !== undefined) window.clearTimeout(markReadTimer);
    markReadTimer = window.setTimeout(() => {
      markReadTimer = undefined;
      if (isNearBottom()) void markLatestRead();
    }, 160);
  }

  function handleMessageListScroll() {
    if (!isNearBottom()) return;
    pendingNewMessageCount.value = 0;
    scheduleMarkLatestRead();
  }

  async function jumpToLatest() {
    pendingNewMessageCount.value = 0;
    await scrollToBottom();
    await markLatestRead();
  }

  function mergeLatest(items: CommunityChatMessage[]) {
    const incoming = new Map(items.map((item) => [item.publicId, item]));
    const merged = chatMessages.value.map((item) => incoming.get(item.publicId) || item);
    const existingIds = new Set(merged.map((item) => item.publicId));
    for (const item of items) {
      if (!existingIds.has(item.publicId)) merged.push(item);
    }
    chatMessages.value = merged;
  }

  /**
   * 实时失效事件与安全刷新最终都读取服务端权威的“最新一页”。如果 Root 隐藏了消息或用户刚屏蔽作者，
   * 不能只做增量合并，否则已不可见的旧消息会一直留在当前页面。
   */
  function replaceLatestWindow(page: CommunityChatMessagePage) {
    const items = page.items || [];
    if (!page.hasMore) {
      chatMessages.value = items;
      return;
    }
    if (!items.length) return;
    const earliestIncomingTime = new Date(items[0].createdAt).getTime();
    const incomingIds = new Set(items.map((item) => item.publicId));
    const preservedOlder = chatMessages.value.filter((item) => {
      if (incomingIds.has(item.publicId)) return false;
      const createdTime = new Date(item.createdAt).getTime();
      return Number.isNaN(createdTime) || createdTime < earliestIncomingTime;
    });
    chatMessages.value = [...preservedOlder, ...items];
  }

  async function markLatestRead() {
    if (!props.access.authenticated) return;
    const roomSlug = selectedRoomSlug.value;
    const latestMessage = chatMessages.value[chatMessages.value.length - 1];
    if (!roomSlug || !latestMessage) return;
    if (latestMessage.publicId === lastMarkedReadMessageId) return;
    try {
      await markCommunityChatRoomRead(roomSlug, latestMessage.publicId);
      lastMarkedReadMessageId = latestMessage.publicId;
      unread.markRoomRead(roomSlug);
      emit('roomRead', roomSlug);
    } catch {
      // 已读写入不阻断消息阅读，下一次前台刷新会继续尝试。
    }
  }

  async function loadInitial({ ignoreFocus = false } = {}) {
    const roomSlug = selectedRoomSlug.value;
    if (!roomSlug) return;
    const generation = ++loadGeneration;
    const requestedFocus = ignoreFocus ? '' : focusMessageFromRoute.value;
    initialLoading.value = true;
    loadError.value = false;
    pendingNewMessageCount.value = 0;
    try {
      let response;
      try {
        response = await getCommunityChatMessages(
          roomSlug,
          requestedFocus ? { focus: requestedFocus, limit: 50 } : { limit: 50 },
        );
      } catch (error) {
        if (!requestedFocus || generation !== loadGeneration || roomSlug !== selectedRoomSlug.value) throw error;
        focusedMessagePublicId.value = '';
        hasNewerThanFocus.value = false;
        await clearFocusMessageRoute();
        message.warning(t('communityChat.sourceMessageUnavailable'));
        response = await getCommunityChatMessages(roomSlug, { limit: 50 });
      }
      if (generation !== loadGeneration || roomSlug !== selectedRoomSlug.value) return;
      const page = response.data as CommunityChatMessagePage;
      chatMessages.value = page.items || [];
      lastAuthorityRefreshAt = Date.now();
      hasMore.value = Boolean(page.hasMore);
      nextBefore.value = page.nextBefore || null;
      focusedMessagePublicId.value = page.focusPublicId || '';
      hasNewerThanFocus.value = Boolean(page.focusPublicId && page.hasNewer);
      // 先结束同构骨架，再定位真实消息；否则极快的本地/缓存响应会在消息 DOM 尚未挂载时滚动失败。
      initialLoading.value = false;
      if (focusedMessagePublicId.value) await scrollToFocusedMessage(focusedMessagePublicId.value);
      else await scrollToBottom();
      await markLatestRead();
    } catch {
      if (generation === loadGeneration) loadError.value = true;
    } finally {
      if (generation === loadGeneration) {
        initialLoading.value = false;
        if (realtimeAuthorityRefreshPending) {
          realtimeAuthorityRefreshPending = false;
          void refreshLatest({ force: true });
        }
      }
    }
  }

  async function loadOlder() {
    const roomSlug = selectedRoomSlug.value;
    const before = nextBefore.value;
    const element = messageListEl.value;
    if (!roomSlug || !before || olderLoading.value) return;
    olderLoading.value = true;
    const previousScrollHeight = element?.scrollHeight || 0;
    try {
      const response = await getCommunityChatMessages(roomSlug, { before, limit: 50 });
      if (roomSlug !== selectedRoomSlug.value) return;
      const page = response.data as CommunityChatMessagePage;
      const knownIds = new Set(chatMessages.value.map((item) => item.publicId));
      chatMessages.value = [
        ...(page.items || []).filter((item) => !knownIds.has(item.publicId)),
        ...chatMessages.value,
      ];
      hasMore.value = Boolean(page.hasMore);
      nextBefore.value = page.nextBefore || null;
      await nextTick();
      if (element) element.scrollTop += element.scrollHeight - previousScrollHeight;
    } catch (error: any) {
      message.error(error?.message || t('communityChat.messagesLoadFailed'));
    } finally {
      olderLoading.value = false;
    }
  }

  async function refreshLatest({ force = false } = {}) {
    const roomSlug = selectedRoomSlug.value;
    // Redis 跨实例广播不可用时，WebSocket 仍可能保持“已连接”。保留 30 秒级权威安全刷新，
    // 避免客户端在连接不断开的情况下永久漏掉其他实例写入。
    if (!force && realtimeStatus.value === 'connected' && Date.now() - lastAuthorityRefreshAt < 30_000) return;
    if (!roomSlug || document.visibilityState !== 'visible') return;
    if (initialLoading.value) {
      if (force) realtimeAuthorityRefreshPending = true;
      return;
    }
    if (focusedMessagePublicId.value && hasNewerThanFocus.value) return;
    if (latestRefreshInFlight) {
      latestRefreshQueued = true;
      latestRefreshQueuedForce ||= force;
      return;
    }
    latestRefreshInFlight = true;
    const stayAtBottom = isNearBottom();
    const existingIds = new Set(chatMessages.value.map((item) => item.publicId));
    try {
      const response = await getCommunityChatMessages(roomSlug, { limit: 50 });
      if (roomSlug !== selectedRoomSlug.value) return;
      const page = response.data as CommunityChatMessagePage;
      const newMessageCount = (page.items || []).filter((item) => !existingIds.has(item.publicId)).length;
      replaceLatestWindow(page);
      lastAuthorityRefreshAt = Date.now();
      loadError.value = false;
      if (focusedMessagePublicId.value && newMessageCount > 0) {
        hasNewerThanFocus.value = true;
      }
      if (stayAtBottom) {
        pendingNewMessageCount.value = 0;
        await scrollToBottom();
        await markLatestRead();
        if (focusedMessagePublicId.value && newMessageCount > 0) {
          focusedMessagePublicId.value = '';
          hasNewerThanFocus.value = false;
          void clearFocusMessageRoute();
        }
      } else if (newMessageCount > 0) {
        pendingNewMessageCount.value += newMessageCount;
      }
    } catch {
      // 后台轮询失败时保留旧消息，不闪空态也不打扰用户。
    } finally {
      latestRefreshInFlight = false;
      if (latestRefreshQueued) {
        const queuedForce = latestRefreshQueuedForce;
        latestRefreshQueued = false;
        latestRefreshQueuedForce = false;
        void refreshLatest({ force: queuedForce });
      }
    }
  }

  async function handleRealtimeEvent(event: CommunityChatRealtimeEvent) {
    if (event.type === 'runtime.changed' || event.type === 'access.changed') {
      emit('accessInvalidated');
      return;
    }
    const messagePublicId = String(event.payload.messagePublicId || '');
    if (!messagePublicId) return;
    if (event.type === 'message.created') {
      if (chatMessages.value.some((item) => item.publicId === messagePublicId)) return;
      if (focusedMessagePublicId.value) {
        hasNewerThanFocus.value = true;
        return;
      }
      await refreshLatest({ force: true });
      return;
    }
    const removedFocusedMessage = focusedMessagePublicId.value === messagePublicId;
    chatMessages.value = chatMessages.value.filter((item) => item.publicId !== messagePublicId);
    if (removedFocusedMessage) {
      focusedMessagePublicId.value = '';
      hasNewerThanFocus.value = false;
      await clearFocusMessageRoute();
      await loadInitial({ ignoreFocus: true });
      return;
    }
    await refreshLatest({ force: true });
  }

  async function handleRealtimeSynchronized() {
    emit('accessInvalidated');
    await refreshLatest({ force: true });
  }

  function selectRoom(roomSlug: string) {
    if (roomSlug === selectedRoomSlug.value) {
      void scrollToBottom();
      return;
    }
    selectedRoomSlug.value = roomSlug;
  }

  async function returnToLatest() {
    focusedMessagePublicId.value = '';
    hasNewerThanFocus.value = false;
    pendingNewMessageCount.value = 0;
    await clearFocusMessageRoute();
    await loadInitial({ ignoreFocus: true });
  }

  function startReply(chatMessage: CommunityChatMessage) {
    if (!props.access.canPost) return;
    replyTarget.value = chatMessage;
    pendingClientRequestId.value = null;
    void nextTick(() => composerInput.value?.focus());
  }

  function cancelReply() {
    replyTarget.value = null;
    pendingClientRequestId.value = null;
  }

  function startMention(chatMessage: CommunityChatMessage) {
    if (!props.access.canPost || chatMessage.isOwn) return;
    if (mentionTargets.value.some((target) => target.publicId === chatMessage.publicId)) {
      void nextTick(() => composerInput.value?.focus());
      return;
    }
    if (mentionTargets.value.length >= 5) {
      message.warning(t('communityChat.mentionLimit'));
      return;
    }
    const name = authorName(chatMessage);
    mentionTargets.value = [...mentionTargets.value, { publicId: chatMessage.publicId, name }];
    const token = `@${name}`;
    if (!String(draft.value || '').includes(token)) {
      draft.value = `${String(draft.value || '').trimEnd()}${draft.value ? ' ' : ''}${token} `;
    }
    pendingClientRequestId.value = null;
    void nextTick(() => composerInput.value?.focus());
  }

  function cancelMention(publicId: string) {
    const target = mentionTargets.value.find((item) => item.publicId === publicId);
    mentionTargets.value = mentionTargets.value.filter((item) => item.publicId !== publicId);
    if (target) {
      const token = `@${target.name}`;
      draft.value = String(draft.value || '')
        .replace(`${token} `, '')
        .replace(token, '')
        .trimStart();
    }
    pendingClientRequestId.value = null;
  }

  function openImagePreview(imageItem: CommunityChatImage) {
    previewImage.value = imageItem;
    imagePreviewVisible.value = true;
  }

  function syncComposerInputHeight() {
    const textarea = composerInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const contentHeight = textarea.scrollHeight;
    const nextHeight = Math.min(Math.max(contentHeight, COMPOSER_INPUT_MIN_HEIGHT), COMPOSER_INPUT_MAX_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = contentHeight > COMPOSER_INPUT_MAX_HEIGHT ? 'auto' : 'hidden';
  }

  function transferHasFiles(dataTransfer: DataTransfer | null | undefined) {
    if (!dataTransfer) return false;
    return Array.from(dataTransfer.types || []).includes('Files') || dataTransfer.files.length > 0;
  }

  function resetComposerDragState() {
    composerDragDepth = 0;
    isComposerDragActive.value = false;
  }

  function handleComposerDragEnter(event: DragEvent) {
    if (imageUploadDisabled.value || !transferHasFiles(event.dataTransfer)) return;
    composerDragDepth += 1;
    isComposerDragActive.value = true;
  }

  function handleComposerDragOver(event: DragEvent) {
    if (!isComposerDragActive.value || !event.dataTransfer) return;
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleComposerDragLeave(event: DragEvent) {
    if (!isComposerDragActive.value) return;
    event.preventDefault();
    composerDragDepth = Math.max(0, composerDragDepth - 1);
    if (composerDragDepth === 0) isComposerDragActive.value = false;
  }

  function handleComposerDrop(event: DragEvent) {
    const files = Array.from(event.dataTransfer?.files || []);
    resetComposerDragState();
    if (imageUploadBusy.value || !files.length) return;
    void handleImageFiles(files);
  }

  function handleComposerPaste(event: ClipboardEvent) {
    if (imageUploadBusy.value || !event.clipboardData) return;
    const itemFiles = Array.from(event.clipboardData.items || [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file instanceof File);
    const files = itemFiles.length
      ? itemFiles
      : Array.from(event.clipboardData.files || []).filter((file) => file.type.startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    void handleImageFiles(files);
  }

  async function handleImageFiles(selected: unknown) {
    const files = Array.isArray(selected) ? selected.filter((item): item is File => item instanceof File) : [];
    if (!files.length || imageUploadBusy.value) return;
    const available = Math.max(0, 4 - pendingImages.value.length);
    if (!available) {
      message.warning(t('communityChat.image.limit'));
      return;
    }
    if (files.length > available) message.warning(t('communityChat.image.limit'));
    const accepted = files.slice(0, available);
    const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const validFiles = accepted.filter((file) => {
      if (!supportedTypes.has(file.type)) {
        message.warning(t('communityChat.image.formatInvalid'));
        return false;
      }
      if (!file.size || file.size > 5 * 1024 * 1024) {
        message.warning(t('communityChat.image.sizeInvalid'));
        return false;
      }
      return true;
    });
    if (!validFiles.length) return;

    const roomSlug = selectedRoomSlug.value;
    imageUploadsInFlight.value = validFiles.length;
    try {
      const results = await Promise.allSettled(validFiles.map((file) => uploadCommunityChatImage(roomSlug, file)));
      if (isUnmounted || roomSlug !== selectedRoomSlug.value) {
        const uploaded = results
          .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
          .map((result) => result.value?.data as CommunityChatImage)
          .filter((imageItem) => imageItem?.publicId);
        void Promise.allSettled(uploaded.map((imageItem) => discardCommunityChatImage(imageItem.publicId)));
        return;
      }
      const uploaded = results
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map((result) => result.value?.data as CommunityChatImage)
        .filter((imageItem) => imageItem?.publicId && imageItem?.url);
      pendingImages.value = [...pendingImages.value, ...uploaded].slice(0, 4);
      const failed = results.length - uploaded.length;
      if (failed > 0) message.error(t('communityChat.image.uploadFailed', { count: failed }));
      if (uploaded.length) pendingClientRequestId.value = null;
    } finally {
      imageUploadsInFlight.value = 0;
    }
  }

  async function removePendingImage(imageItem: CommunityChatImage) {
    if (removingImageIds.value.has(imageItem.publicId) || sending.value) return;
    removingImageIds.value = new Set([...removingImageIds.value, imageItem.publicId]);
    try {
      const response = await discardCommunityChatImage(imageItem.publicId);
      if (response?.status !== 200) throw new Error('COMMUNITY_CHAT_IMAGE_DISCARD_FAILED');
      pendingImages.value = pendingImages.value.filter((item) => item.publicId !== imageItem.publicId);
      pendingClientRequestId.value = null;
      if (previewImage.value?.publicId === imageItem.publicId) imagePreviewVisible.value = false;
    } catch (error: any) {
      message.error(error?.message || t('communityChat.image.removeFailed'));
    } finally {
      const next = new Set(removingImageIds.value);
      next.delete(imageItem.publicId);
      removingImageIds.value = next;
    }
  }

  function releasePendingImages() {
    const images = pendingImages.value;
    pendingImages.value = [];
    removingImageIds.value = new Set();
    if (images.length) {
      void Promise.allSettled(images.map((imageItem) => discardCommunityChatImage(imageItem.publicId)));
    }
  }

  function openBlocksFromSettings() {
    settingsVisible.value = false;
    void nextTick(() => {
      blocksVisible.value = true;
    });
  }

  function handleMessageAction(action: string, chatMessage: CommunityChatMessage) {
    if (!props.access.authenticated) return;
    if (action === 'mention') {
      startMention(chatMessage);
      return;
    }
    if (action === 'report') {
      reportTarget.value = chatMessage;
      reportVisible.value = true;
      return;
    }
    if (action === 'block') confirmBlock(chatMessage);
  }

  async function submitReport(payload: { reasonCode: CommunityChatReportReason; detail: string }) {
    const target = reportTarget.value;
    if (!target || reporting.value) return;
    reporting.value = true;
    try {
      const response = await reportCommunityChatMessage(target.publicId, payload);
      if (response?.status !== 200) throw new Error('COMMUNITY_REPORT_FAILED');
      reportedMessageIds.value = new Set([...reportedMessageIds.value, target.publicId]);
      reportVisible.value = false;
      reportTarget.value = null;
      void recordOperation({ module: '公共聊天室', operation: '提交消息举报' });
      message.success(t('communityChat.report.success'));
    } catch (error: any) {
      message.error(error?.message || t('communityChat.report.failed'));
    } finally {
      reporting.value = false;
    }
  }

  function confirmBlock(chatMessage: CommunityChatMessage) {
    Alert.alert({
      title: t('communityChat.blocks.confirmTitle'),
      content: t('communityChat.blocks.confirmDescription', { name: authorName(chatMessage) }),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('communityChat.blocks.confirmAction'),
          type: 'danger',
          function: () => {
            Alert.destroy();
            void blockAuthor(chatMessage);
          },
        },
      ],
    });
  }

  async function blockAuthor(chatMessage: CommunityChatMessage) {
    if (messageActionBusyId.value) return;
    messageActionBusyId.value = chatMessage.publicId;
    try {
      const response = await blockCommunityChatMessageAuthor(chatMessage.publicId);
      if (response?.status !== 200) throw new Error('COMMUNITY_BLOCK_FAILED');
      void recordOperation({ module: '公共聊天室', operation: '屏蔽消息作者' });
      message.success(t('communityChat.blocks.success', { name: authorName(chatMessage) }));
      await loadInitial();
      if (blocksVisible.value) await loadBlocks();
    } catch (error: any) {
      message.error(error?.message || t('communityChat.blocks.failed'));
    } finally {
      messageActionBusyId.value = '';
    }
  }

  async function loadBlocks() {
    if (blocksLoading.value) return;
    blocksLoading.value = true;
    try {
      const response = await getCommunityChatBlocks();
      if (response?.status !== 200 || !Array.isArray(response.data?.items)) {
        throw new Error('COMMUNITY_BLOCK_LIST_FAILED');
      }
      blockedUsers.value = response.data.items as CommunityChatBlockItem[];
    } catch (error: any) {
      message.error(error?.message || t('communityChat.blocks.loadFailed'));
    } finally {
      blocksLoading.value = false;
    }
  }

  async function unblockUser(item: CommunityChatBlockItem) {
    if (unblockingId.value) return;
    unblockingId.value = item.id;
    try {
      const response = await unblockCommunityChatUser(item.id);
      if (response?.status !== 200) throw new Error('COMMUNITY_UNBLOCK_FAILED');
      blockedUsers.value = blockedUsers.value.filter((blocked) => blocked.id !== item.id);
      void recordOperation({ module: '公共聊天室', operation: '取消屏蔽成员' });
      message.success(
        t('communityChat.blocks.unblocked', { name: item.displayName || t('communityChat.memberFallback') }),
      );
      await loadInitial();
    } catch (error: any) {
      message.error(error?.message || t('communityChat.blocks.unblockFailed'));
    } finally {
      unblockingId.value = '';
    }
  }

  async function sendMessage() {
    const roomSlug = selectedRoomSlug.value;
    const content = String(draft.value || '').trim();
    if (!roomSlug || !canSend.value || !canPostCurrentRoom.value) return;
    const clientRequestId = pendingClientRequestId.value || createCommunityChatClientRequestId();
    pendingClientRequestId.value = clientRequestId;
    const imagePublicIds = pendingImages.value.map((imageItem) => imageItem.publicId);
    const mentionMessagePublicIds = mentionTargets.value
      .filter((target) => content.includes(`@${target.name}`))
      .map((target) => target.publicId);
    sending.value = true;
    try {
      const payload = {
        clientRequestId,
        content,
        ...(replyTarget.value ? { replyToPublicId: replyTarget.value.publicId } : {}),
        ...(mentionMessagePublicIds.length ? { mentionMessagePublicIds } : {}),
        ...(imagePublicIds.length ? { imagePublicIds } : {}),
      };
      const response = await sendCommunityChatMessage(roomSlug, payload);
      const sentMessage = response.data?.message as CommunityChatMessage | undefined;
      if (sentMessage && roomSlug === selectedRoomSlug.value) mergeLatest([sentMessage]);
      draft.value = '';
      replyTarget.value = null;
      mentionTargets.value = [];
      pendingImages.value = [];
      pendingClientRequestId.value = null;
      await scrollToBottom();
      await markLatestRead();
    } catch (error: any) {
      emit('accessInvalidated');
      message.error(error?.message || t('communityChat.sendFailed'));
    } finally {
      sending.value = false;
    }
  }

  function openAuthentication() {
    bookmark.authModalTab = '登录';
    bookmark.authModalSource = 'community_chat';
    bookmark.isShowLogin = true;
  }

  watch(
    () => props.rooms.map((room) => room.slug).join('|'),
    () => {
      if (!props.rooms.some((room) => room.slug === selectedRoomSlug.value)) {
        selectedRoomSlug.value = props.rooms[0]?.slug || '';
      }
    },
    { immediate: true },
  );

  watch(
    selectedRoomSlug,
    () => {
      resetComposerDragState();
      releasePendingImages();
      chatMessages.value = [];
      hasMore.value = false;
      nextBefore.value = null;
      loadError.value = false;
      replyTarget.value = null;
      mentionTargets.value = [];
      draft.value = '';
      pendingClientRequestId.value = null;
      reportVisible.value = false;
      reportTarget.value = null;
      messageActionBusyId.value = '';
      profileLoadGeneration += 1;
      profileVisible.value = false;
      profileLoading.value = false;
      profileError.value = false;
      profileTargetMessageId.value = '';
      authorProfile.value = null;
      pendingNewMessageCount.value = 0;
      focusedMessagePublicId.value = '';
      hasNewerThanFocus.value = false;
      lastMarkedReadMessageId = '';
      lastAuthorityRefreshAt = 0;
      realtimeAuthorityRefreshPending = false;
      void loadInitial();
    },
    { immediate: true },
  );

  watch(
    [
      draft,
      () => replyTarget.value?.publicId,
      () => mentionTargets.value.map((target) => target.publicId).join('|'),
      () => pendingImages.value.map((imageItem) => imageItem.publicId).join('|'),
    ],
    () => {
      if (!sending.value) pendingClientRequestId.value = null;
    },
  );

  watch(draft, () => {
    void nextTick(syncComposerInputHeight);
  });

  watch(imagePreviewVisible, (visible) => {
    if (!visible) previewImage.value = null;
  });

  watch(focusMessageFromRoute, (nextValue, previousValue) => {
    if (!nextValue && previousValue && previousValue === clearingFocusRouteValue) {
      clearingFocusRouteValue = '';
      return;
    }
    if (nextValue !== previousValue && selectedRoomSlug.value) void loadInitial();
  });

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') void refreshLatest();
  }

  onMounted(() => {
    pollTimer = window.setInterval(refreshLatest, 8000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', syncComposerInputHeight);
    void nextTick(syncComposerInputHeight);
  });

  onBeforeUnmount(() => {
    isUnmounted = true;
    resetComposerDragState();
    loadGeneration += 1;
    profileLoadGeneration += 1;
    if (pollTimer !== undefined) window.clearInterval(pollTimer);
    if (markReadTimer !== undefined) window.clearTimeout(markReadTimer);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('resize', syncComposerInputHeight);
    releasePendingImages();
  });
</script>

<style scoped lang="less">
  .community-workspace {
    width: 100%;
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 20px;
    background: var(--card-background);
  }

  .community-workspace.has-room-list {
    grid-template-columns: 270px minmax(0, 1fr);
  }

  .community-workspace__rooms {
    min-width: 0;
    overflow: auto;
    padding: 14px 10px;
    border-right: 1px solid var(--surface-divider-color);
    background: var(--workspace-panel-bg-color);
  }

  .community-workspace__rooms-heading {
    min-width: 0;
    padding: 4px 6px 14px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .community-workspace__rooms-mark {
    width: 36px;
    height: 36px;
    flex: 0 0 36px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 12px;
    color: #fff;
    background: var(--primary-color);
  }

  .community-workspace__rooms-heading > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .community-workspace__rooms-heading strong {
    color: var(--text-color);
    font-size: 14px;
  }

  .community-workspace__rooms-heading span {
    color: var(--desc-color);
    font-size: 11px;
  }

  .community-workspace__room-list {
    display: grid;
    gap: 5px;
  }

  .community-room-button {
    width: 100%;
    height: auto;
    min-height: 62px;
    padding: 8px 9px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    border: 1px solid transparent !important;
    border-radius: 13px;
    color: var(--text-color);
    background: transparent !important;
    text-align: left;
    line-height: normal;
  }

  .community-room-button.is-current {
    border-color: var(--primary-color) !important;
    color: var(--primary-color);
    background: var(--card-background) !important;
  }

  .community-room-button__symbol {
    width: 31px;
    height: 31px;
    display: grid;
    place-items: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--card-background);
    font-weight: 800;
  }

  .community-room-button.is-current .community-room-button__symbol {
    border-color: var(--primary-color);
    color: #fff;
    background: var(--primary-color);
  }

  .community-room-button__copy {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .community-room-button__copy strong,
  .community-room-button__copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .community-room-button__copy strong {
    font-size: 13px;
  }

  .community-room-button__copy small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .community-room-button__badge {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--card-background);
    border-radius: 999px;
    color: var(--danger-fill-fg, #fff);
    background: var(--danger-fill-bg, #d93b3b);
    font-size: 9px;
  }

  .community-workspace__conversation {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto;
    background: var(--surface-page-bg, var(--background-color));
  }

  .community-message-stream {
    min-width: 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  .community-conversation-header {
    min-width: 0;
    min-height: 58px;
    padding: 7px 14px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--card-background);
  }

  .community-conversation-header__title {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .community-conversation-header__title > span {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    color: var(--primary-color);
    font-weight: 800;
  }

  .community-conversation-header__title > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .community-conversation-header__title strong,
  .community-conversation-header__title small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .community-conversation-header__title strong {
    color: var(--text-color);
    font-size: 15px;
  }

  .community-conversation-header__title small {
    color: var(--desc-color);
    font-size: 10px;
  }

  .community-conversation-header__actions,
  .community-conversation-header__delivery {
    display: inline-flex;
    align-items: center;
  }

  .community-conversation-header__actions {
    flex: 0 0 auto;
    gap: 10px;
  }

  .community-conversation-header__settings {
    min-height: 34px;
    gap: 5px;
    color: var(--desc-color);
    background: transparent;
  }

  .community-conversation-header__delivery {
    gap: 6px;
    color: var(--desc-color);
    font-size: 11px;
    white-space: nowrap;
  }

  .community-conversation-header__delivery i {
    width: 7px;
    height: 7px;
    border: 1px solid var(--success-color);
    border-radius: 50%;
    background: var(--success-color);
  }

  .community-conversation-header__delivery.is-connecting i,
  .community-conversation-header__delivery.is-reconnecting i {
    border-color: #ad6800;
    background: #ad6800;
  }

  .community-conversation-header__delivery.is-disabled i,
  .community-conversation-header__delivery.is-fallback i {
    border-color: var(--desc-color);
    background: var(--desc-color);
  }

  .community-message-list {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 18px clamp(14px, 3vw, 32px) 22px;
    box-sizing: border-box;
  }

  .community-message-list__new {
    position: absolute;
    left: 50%;
    bottom: 12px;
    z-index: 1;
    min-height: 36px;
    gap: 6px;
    padding: 6px 12px;
    transform: translateX(-50%);
    border: 1px solid var(--primary-color) !important;
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--card-background) !important;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }

  .community-message-list__older {
    display: flex;
    justify-content: center;
    margin-bottom: 16px;
  }

  .community-runtime-readonly {
    width: min(700px, 100%);
    margin: 0 auto 16px;
    padding: 10px 12px;
    box-sizing: border-box;
    display: flex;
    align-items: flex-start;
    gap: 9px;
    border: 1px solid var(--warning-color);
    border-radius: 12px;
    color: var(--text-color);
    background: var(--chip-pending-bg, var(--card-background));
  }

  .community-runtime-readonly__icon {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    display: grid;
    place-items: center;
    border: 1px solid var(--warning-color);
    border-radius: 50%;
    color: var(--warning-color);
    background: var(--card-background);
  }

  .community-runtime-readonly > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .community-runtime-readonly strong {
    font-size: 12px;
  }

  .community-runtime-readonly span:not(.community-runtime-readonly__icon) {
    color: var(--desc-color);
    font-size: 11px;
    line-height: 1.6;
  }

  .community-message-skeleton {
    display: grid;
    gap: 18px;
  }

  .community-message-skeleton span {
    width: min(420px, 72%);
    height: 72px;
    border: 1px solid var(--surface-border-color);
    border-radius: 16px;
    background: var(--workspace-panel-bg-color);
    animation: community-skeleton 1.4s ease-in-out infinite alternate;
  }

  .community-message-skeleton span.is-own {
    justify-self: end;
  }

  @keyframes community-skeleton {
    from {
      opacity: 0.55;
    }
    to {
      opacity: 0.9;
    }
  }

  .community-message-state {
    min-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 8px;
    text-align: center;
  }

  .community-message-state__icon {
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 15px;
    color: var(--primary-color);
    background: var(--card-background);
  }

  .community-message-state strong {
    color: var(--text-color);
    font-size: 14px;
  }

  .community-message-state p {
    max-width: 390px;
    margin: 0 0 4px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
  }

  .community-message {
    width: min(720px, 86%);
    margin-bottom: 18px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .community-message.is-own {
    margin-left: auto;
    flex-direction: row-reverse;
  }

  .community-message__avatar {
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    padding: 0 !important;
    display: grid;
    place-items: center;
    border: 0 !important;
    border-radius: 50%;
    color: inherit;
    background: transparent !important;
    cursor: pointer;
  }

  .community-message__avatar:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }

  .community-message__avatar-image {
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 50%;
    background: var(--card-background);
  }

  .community-message__avatar-image :deep(img),
  .community-message__avatar-image :deep(.icon-base64),
  .community-message__avatar-image :deep(.icon-fixed-base64) {
    width: 100% !important;
    height: 100% !important;
    border-radius: inherit;
    object-fit: cover;
  }

  .community-message__body {
    min-width: 0;
    display: grid;
    gap: 5px;
  }

  .community-message.is-own .community-message__body {
    justify-items: end;
  }

  .community-message__meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
    color: var(--desc-color);
    font-size: 10px;
  }

  .community-message__meta strong {
    color: var(--text-color);
    font-size: 11px;
  }

  .community-message__role {
    padding: 1px 6px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    font-size: 9px;
  }

  .community-message__level {
    padding: 1px 6px;
    border: 1px solid var(--surface-border-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--card-background);
    font-size: 9px;
    font-weight: 700;
    white-space: nowrap;
  }

  .community-message__reply {
    width: 100%;
    padding: 7px 9px;
    box-sizing: border-box;
    display: grid;
    gap: 2px;
    border-left: 3px solid var(--primary-color);
    border-radius: 8px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 10px;
  }

  .community-message.is-own .community-message__reply {
    text-align: left;
  }

  .community-message__reply strong,
  .community-message__reply span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .community-message__reply strong {
    color: var(--primary-color);
  }

  .community-message__content {
    max-width: 100%;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 5px 15px 15px;
    color: var(--text-color);
    background: var(--card-background);
    font-size: 13px;
    line-height: 1.65;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .community-message.is-own .community-message__content {
    border-color: var(--primary-color);
    border-radius: 15px 5px 15px 15px;
    color: #fff;
    background: var(--primary-color);
  }

  .community-message.is-focused .community-message__content {
    outline: 2px solid var(--primary-color);
    outline-offset: 3px;
  }

  .community-message__images {
    width: min(360px, 100%);
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 5px;
  }

  .community-message__images.has-1 {
    width: min(320px, 100%);
    grid-template-columns: minmax(0, 1fr);
  }

  .community-message.is-focused .community-message__images {
    outline: 2px solid var(--primary-color);
    outline-offset: 3px;
    border-radius: 13px;
  }

  .community-message__image {
    width: 100%;
    min-width: 0;
    height: auto;
    min-height: 92px;
    max-height: 280px;
    padding: 0 !important;
    overflow: hidden;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 12px !important;
    background: var(--workspace-panel-bg-color) !important;
  }

  .community-message__image img {
    width: 100%;
    height: 100%;
    min-height: 92px;
    max-height: 280px;
    display: block;
    object-fit: cover;
  }

  .community-message__images.has-1 .community-message__image img {
    object-fit: contain;
  }

  .community-message__actions {
    min-height: 24px;
    display: flex;
    align-items: center;
    gap: 3px;
    opacity: 0;
    transition: opacity 0.16s ease;
  }

  .community-message:hover .community-message__actions,
  .community-message:focus-within .community-message__actions {
    opacity: 1;
  }

  .community-message__actions :deep(.b_btn) {
    color: var(--desc-color);
    background: transparent;
  }

  .community-message__more {
    min-width: 30px;
    padding-inline: 6px;
  }

  .community-composer {
    padding: 7px 14px 6px;
    border-top: 1px solid var(--surface-divider-color);
    background: var(--card-background);
  }

  .community-composer__surface {
    width: 100%;
    min-width: 0;
    position: relative;
    overflow: hidden;
    box-sizing: border-box;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--surface-page-bg, var(--background-color));
    transition:
      border-color 0.16s ease,
      box-shadow 0.16s ease;
  }

  .community-composer__surface:focus-within {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 2px var(--primary-shadow-color, rgba(97, 92, 237, 0.12));
  }

  .community-composer__surface.is-drag-active {
    border: 2px dashed var(--primary-color);
  }

  .community-composer__drop-overlay {
    position: absolute;
    inset: 5px;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    border: 1px solid var(--primary-color);
    border-radius: 11px;
    color: var(--primary-color);
    background: var(--card-background);
    pointer-events: none;
  }

  .community-composer__drop-overlay > span {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
  }

  .community-composer__drop-overlay strong {
    font-size: 12px;
  }

  .community-composer__images {
    min-height: 56px;
    padding: 10px 12px 2px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
  }

  .community-composer__image {
    width: 56px;
    height: 56px;
    position: relative;
  }

  .community-composer__image > .b_btn:first-child {
    width: 56px;
    height: 56px;
    padding: 0 !important;
    overflow: hidden;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 10px;
    background: var(--workspace-panel-bg-color) !important;
  }

  .community-composer__image img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }

  .community-composer__image-remove {
    width: 24px;
    min-width: 24px;
    height: 24px;
    min-height: 24px;
    padding: 0 !important;
    position: absolute;
    top: -7px;
    right: -7px;
    border: 1px solid var(--danger-color) !important;
    border-radius: 50% !important;
    color: var(--danger-color) !important;
    background: var(--card-background) !important;
  }

  .community-composer__image-uploading {
    min-height: 36px;
    padding: 0 10px;
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--card-background);
    font-size: 10px;
    font-weight: 700;
  }

  .community-composer__mentions {
    padding: 8px 12px 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
  }

  .community-composer__mentions > strong {
    color: var(--desc-color);
    font-size: 10px;
  }

  .community-composer__mentions > div {
    min-width: 0;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
  }

  .community-composer__mentions .b_btn {
    min-height: 28px;
    gap: 4px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--card-background);
    font-size: 10px;
  }

  .community-composer__reply {
    margin: 8px 10px 0;
    padding: 7px 8px 7px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid var(--primary-color);
    border-radius: 10px;
    background: var(--workspace-panel-bg-color);
  }

  .community-composer__reply > div {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .community-composer__reply strong,
  .community-composer__reply span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .community-composer__reply strong {
    color: var(--primary-color);
    font-size: 11px;
  }

  .community-composer__reply span {
    color: var(--desc-color);
    font-size: 10px;
  }

  .community-composer__input {
    min-width: 0;
    display: block;
  }

  .community-composer__input :deep(.b-textarea) {
    min-height: 42px;
    max-height: 112px;
    padding: 8px 12px 2px !important;
    resize: none;
    border: 0 !important;
    border-radius: 0;
    outline: 0;
    box-shadow: none !important;
    background: transparent !important;
    line-height: 1.45;
  }

  .community-composer__toolbar,
  .community-composer__tools,
  .community-composer__actions {
    min-width: 0;
    display: flex;
    align-items: center;
  }

  .community-composer__toolbar {
    min-height: 38px;
    padding: 1px 6px 5px 7px;
    justify-content: space-between;
    gap: 12px;
  }

  .community-composer__tools {
    flex: 1 1 auto;
    gap: 8px;
  }

  .community-composer__attach {
    width: 32px;
    min-width: 32px;
    height: 32px;
    min-height: 32px;
    padding: 0;
    display: grid;
    place-items: center;
    border: 1px solid transparent !important;
    border-radius: 10px;
    color: var(--desc-color);
    background: transparent !important;
  }

  .community-composer__attach:hover,
  .community-composer__attach:focus-visible {
    border-color: var(--surface-border-color) !important;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color) !important;
  }

  .community-composer__upload-hint,
  .community-composer__actions > span {
    color: var(--desc-color);
    font-size: 9px;
    line-height: 1.5;
  }

  .community-composer__actions {
    flex: 0 0 auto;
    gap: 9px;
  }

  .community-composer__actions > span {
    min-width: 42px;
    text-align: right;
  }

  .community-composer__actions > span.is-near-limit {
    color: var(--danger-color);
    font-weight: 700;
  }

  .community-composer__send {
    width: 34px;
    min-width: 34px;
    height: 34px;
    min-height: 34px;
    padding: 0;
    display: grid;
    place-items: center;
    border-radius: 12px;
  }

  .community-composer__locked {
    width: 100%;
    min-height: 44px;
    box-sizing: border-box;
    padding: 0 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 12px;
  }

  .community-composer__guest {
    width: 100%;
    min-height: 54px;
    box-sizing: border-box;
    padding: 8px 10px 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    border: 1px solid var(--primary-color);
    border-radius: 13px;
    background: var(--workspace-panel-bg-color);
  }

  .community-composer__guest > div {
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .community-composer__guest strong {
    color: var(--text-color);
    font-size: 12px;
  }

  .community-composer__guest span {
    color: var(--desc-color);
    font-size: 10px;
  }

  .community-composer__guest .b_btn {
    min-height: 40px;
    flex: 0 0 auto;
  }

  .community-image-preview {
    min-height: 160px;
    display: grid;
    place-items: center;
    gap: 8px;
  }

  .community-image-preview img {
    max-width: 100%;
    max-height: min(72vh, 760px);
    display: block;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    object-fit: contain;
    background: var(--workspace-panel-bg-color);
  }

  .community-image-preview span {
    color: var(--desc-color);
    font-size: 10px;
  }

  @media (max-width: 767px) {
    .community-workspace {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      border: 0;
      border-radius: 0;
    }

    .community-workspace.has-room-list {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr);
    }

    .community-workspace__rooms {
      padding: 7px 8px 8px;
      overflow-x: auto;
      overflow-y: hidden;
      border-right: 0;
      border-bottom: 1px solid var(--surface-divider-color);
      background: var(--card-background);
    }

    .community-workspace__rooms-heading {
      display: none;
    }

    .community-workspace__room-list {
      width: max-content;
      display: flex;
      gap: 7px;
    }

    .community-room-button {
      width: auto;
      min-width: 128px;
      min-height: 43px;
      padding: 5px 8px;
      grid-template-columns: auto minmax(0, 1fr) auto;
      border-color: var(--surface-border-color) !important;
      border-radius: 12px;
    }

    .community-room-button__symbol {
      width: 27px;
      height: 27px;
      border-radius: 9px;
    }

    .community-room-button__copy small {
      display: none;
    }

    .community-room-button__copy strong {
      max-width: 86px;
      font-size: 12px;
    }

    .community-conversation-header {
      min-height: 52px;
      padding: 6px 10px;
    }

    .community-conversation-header__title > span {
      width: 28px;
      height: 28px;
      flex-basis: 28px;
    }

    .community-conversation-header__title small,
    .community-conversation-header__delivery {
      display: none;
    }

    .community-conversation-header__settings {
      width: 38px;
      min-width: 38px;
      min-height: 38px;
      padding: 0;
    }

    .community-conversation-header__settings span {
      display: none;
    }

    .community-message-list {
      padding: 14px 10px 18px;
    }

    .community-message {
      width: 94%;
      margin-bottom: 14px;
      gap: 7px;
    }

    .community-message__avatar {
      width: 38px;
      height: 38px;
      flex-basis: 38px;
    }

    .community-message__content {
      padding: 9px 10px;
      font-size: 13px;
    }

    .community-message__images {
      width: min(300px, 100%);
    }

    .community-message__actions {
      opacity: 1;
    }

    .community-message__actions :deep(.b_btn) {
      min-height: 36px;
    }

    .community-composer {
      padding: 5px 8px calc(5px + env(safe-area-inset-bottom));
    }

    .community-composer__surface {
      border-radius: 13px;
    }

    .community-composer__images {
      padding: 9px 10px 2px;
    }

    .community-composer__image,
    .community-composer__image > .b_btn:first-child {
      width: 52px;
      height: 52px;
    }

    .community-composer__input :deep(.b-textarea) {
      min-height: 42px;
      max-height: 96px;
      padding: 7px 9px 1px !important;
    }

    .community-composer__toolbar {
      min-height: 36px;
      padding: 1px 5px 4px 6px;
      gap: 7px;
    }

    .community-composer__tools {
      gap: 5px;
    }

    .community-composer__attach,
    .community-composer__send {
      width: 34px;
      min-width: 34px;
      height: 34px;
      min-height: 34px;
    }

    .community-composer__upload-hint {
      font-size: 8px;
    }

    .community-composer__actions {
      gap: 5px;
    }

    .community-composer__actions > span {
      min-width: 38px;
      font-size: 8px;
    }

    .community-composer__guest {
      min-height: 64px;
      padding: 7px 8px 7px 10px;
      gap: 8px;
    }

    .community-composer__guest span {
      display: none;
    }

    .community-composer__guest .b_btn {
      min-height: 42px;
    }
  }

  @media (max-width: 359px) {
    .community-room-button {
      min-width: 116px;
    }

    .community-message {
      width: 97%;
    }

    .community-composer__upload-hint {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .community-message-skeleton span {
      animation: none;
    }
  }
</style>
