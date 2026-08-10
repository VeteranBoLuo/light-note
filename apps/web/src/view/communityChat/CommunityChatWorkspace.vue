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
        <div v-if="pinnedMessage" class="community-pinned-message" role="status">
          <BButton
            class="community-pinned-message__jump"
            :aria-label="t('communityChat.pin.jump', { name: authorName(pinnedMessage) })"
            @click="jumpToMessage(pinnedMessage.publicId)"
          >
            <SvgIcon :src="icon.contextMenu.pin" size="15" aria-hidden="true" />
            <strong>{{ t('communityChat.pin.banner') }}</strong>
            <span>{{ authorName(pinnedMessage) }}：{{ messageSummary(pinnedMessage) }}</span>
          </BButton>
          <BTooltip v-if="canManagePinnedMessage" :title="t('communityChat.pin.unpinAction')" :delay="80">
            <BButton
              class="community-pinned-message__unpin"
              :loading="pinActionBusy"
              :aria-label="t('communityChat.pin.unpinAction')"
              @click.stop="confirmUnpinMessage(pinnedMessage)"
            >
              <SvgIcon :src="icon.contextMenu.unpin" size="15" aria-hidden="true" />
            </BButton>
          </BTooltip>
        </div>
        <div
          ref="messageListEl"
          class="community-message-list"
          aria-live="polite"
          @wheel.passive="handleMessageListUserScrollIntent"
          @touchmove.passive="handleMessageListUserScrollIntent"
          @pointerdown="stopInitialBottomLock"
          @scroll.passive="handleMessageListScroll"
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
                'is-focused':
                  chatMessage.publicId === focusedMessagePublicId ||
                  chatMessage.publicId === transientFocusedMessagePublicId,
                'is-recalled': chatMessage.status === 'recalled',
                'is-sending': chatMessage.deliveryState === 'sending',
              }"
              :data-message-public-id="chatMessage.publicId"
            >
              <BButton
                class="community-message__avatar"
                :aria-label="t('communityChat.profile.view', { name: authorName(chatMessage) })"
                @pointerdown="beginAvatarLongPress($event, chatMessage)"
                @pointermove="handleAvatarLongPressMove"
                @pointerup="finishAvatarLongPress"
                @pointercancel="cancelAvatarLongPress"
                @pointerleave="cancelAvatarLongPress"
                @contextmenu="handleAvatarContextMenu($event, chatMessage)"
                @click="handleAuthorAvatarClick($event, chatMessage)"
              >
                <AvatarFramePreview
                  v-if="authorFrameId(chatMessage)"
                  :frame-id="authorFrameId(chatMessage)"
                  :src="authorAvatarSource(chatMessage)"
                  :size="32"
                  pause-when-offscreen
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
                <div class="community-message__payload" @click="handleMessageTap($event, chatMessage)">
                  <div v-if="chatMessage.status === 'recalled'" class="community-message__recalled" role="status">
                    <span>
                      {{
                        chatMessage.canViewRecalledContent
                          ? t('communityChat.recall.adminVisible')
                          : t('communityChat.recall.placeholder')
                      }}
                    </span>
                  </div>
                  <template v-if="chatMessage.status === 'active' || chatMessage.canViewRecalledContent">
                    <BButton
                      v-if="chatMessage.reply"
                      class="community-message__reply"
                      :disabled="!canJumpToReply(chatMessage)"
                      :aria-label="t('communityChat.replyJump', { name: replyAuthorName(chatMessage) })"
                      @click.stop="jumpToMessage(chatMessage.reply.publicId)"
                    >
                      <strong>{{ t('communityChat.replyReference', { name: replyAuthorName(chatMessage) }) }}</strong>
                      <span>{{ replySummary(chatMessage) }}</span>
                    </BButton>
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
                        :style="{ aspectRatio: messageImageAspectRatio(imageItem) }"
                        :aria-label="t('communityChat.image.preview')"
                        @click.stop="handleMessageImageClick(chatMessage, imageItem)"
                      >
                        <img
                          :src="imageItem.url"
                          :alt="t('communityChat.image.messageAlt', { name: authorName(chatMessage) })"
                          :width="positiveImageDimension(imageItem.width)"
                          :height="positiveImageDimension(imageItem.height)"
                          loading="lazy"
                          decoding="async"
                          @load="handleMessageImageSettled"
                          @error="handleMessageImageSettled"
                        />
                      </BButton>
                    </div>
                  </template>
                  <div v-if="messageHasActions(chatMessage)" class="community-message__actions">
                    <BTooltip v-if="canLikeMessage(chatMessage)" :title="likeActionLabel(chatMessage)" :delay="80">
                      <BButton
                        size="small"
                        class="community-message__action community-message__like"
                        :class="{ 'is-selected': chatMessage.likedByMe }"
                        :loading="messageActionBusyId === chatMessage.publicId"
                        :aria-label="likeActionLabel(chatMessage)"
                        @click.stop="toggleLike(chatMessage)"
                      >
                        <SvgIcon :src="icon.coBuild.vote" size="15" aria-hidden="true" />
                        <span v-if="chatMessage.likeCount">{{ chatMessage.likeCount }}</span>
                      </BButton>
                    </BTooltip>
                    <BTooltip v-if="canReplyToMessage(chatMessage)" :title="t('communityChat.replyAction')" :delay="80">
                      <BButton
                        size="small"
                        class="community-message__action"
                        :aria-label="t('communityChat.replyAction')"
                        @click.stop="startReply(chatMessage)"
                      >
                        <SvgIcon :src="icon.noteDetail.toolbar.quote" size="15" aria-hidden="true" />
                      </BButton>
                    </BTooltip>
                    <BTooltip
                      v-if="canRecallMessage(chatMessage)"
                      :title="t('communityChat.recall.action')"
                      :delay="80"
                    >
                      <BButton
                        size="small"
                        class="community-message__action is-danger"
                        :aria-label="t('communityChat.recall.action')"
                        @click.stop="confirmRecall(chatMessage)"
                      >
                        <SvgIcon :src="icon.noteDetail.toolbar.undo" size="15" aria-hidden="true" />
                      </BButton>
                    </BTooltip>
                    <BTooltip
                      v-if="canDeleteMessage(chatMessage)"
                      :title="t('communityChat.delete.action')"
                      :delay="80"
                    >
                      <BButton
                        size="small"
                        class="community-message__action is-danger"
                        :aria-label="t('communityChat.delete.action')"
                        @click.stop="confirmDelete(chatMessage)"
                      >
                        <SvgIcon :src="icon.noteDetail.deleteLine" size="15" aria-hidden="true" />
                      </BButton>
                    </BTooltip>
                    <BActionMenu
                      v-if="messageMenuItems(chatMessage).length"
                      class="community-message__desktop-more"
                      :items="messageMenuItems(chatMessage)"
                      placement="bottom-left"
                      :disabled="messageActionBusyId === chatMessage.publicId"
                      :aria-label="t('communityChat.messageActions')"
                      @select="(action) => handleMessageAction(action, chatMessage)"
                    >
                      <BTooltip :title="t('communityChat.moreActions')" :delay="80">
                        <BButton
                          size="small"
                          class="community-message__more"
                          :loading="messageActionBusyId === chatMessage.publicId"
                          :aria-label="t('communityChat.moreActions')"
                        >
                          <SvgIcon :src="icon.common.more" size="16" aria-hidden="true" />
                        </BButton>
                      </BTooltip>
                    </BActionMenu>
                  </div>
                </div>
                <div v-if="chatMessage.likeCount > 0" class="community-message__reactions" aria-live="polite">
                  <SvgIcon :src="icon.coBuild.vote" size="14" aria-hidden="true" />
                  <span>{{ likeReactionSummary(chatMessage) }}</span>
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
              <BButton
                :aria-label="t('communityChat.image.preview')"
                @click="openImagePreview(imageItem, pendingImages)"
              >
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
                <SvgIcon v-if="!sending" :src="icon.arrow_right" size="16" aria-hidden="true" />
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
  <ChatSettingsModal
    v-model:visible="settingsVisible"
    @manage-blocks="openBlocksFromSettings"
    @notification-saved="handleNotificationSettingsSaved"
  />
  <MobilePageActionsDrawer
    v-model:open="mobileMessageActionsVisible"
    compact
    :title="t('communityChat.messageActions')"
    :actions="mobileMessageActions"
    @action="handleMobileMessageAction"
  />
  <ChatImageViewerModal
    v-model:visible="imageViewerVisible"
    :images="activeImageViewerImages"
    :initial-public-id="imageViewerInitialPublicId"
  />
  <ChatUserProfileModal
    v-model:visible="profileVisible"
    :profile="authorProfile"
    :loading="profileLoading"
    :error="profileError"
    @retry="loadAuthorProfile"
  />
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { isEqual } from 'lodash-es';
  import {
    blockCommunityChatMessageAuthor,
    createCommunityChatClientRequestId,
    deleteCommunityChatMessage,
    discardCommunityChatImage,
    getCommunityChatBlocks,
    getCommunityChatMessageAuthorProfile,
    getCommunityChatMessages,
    getCommunityChatPinnedMessage,
    markCommunityChatRoomRead,
    pinCommunityChatMessage,
    recallCommunityChatMessage,
    reportCommunityChatMessage,
    sendCommunityChatMessage,
    toggleCommunityChatMessageLike,
    unblockCommunityChatUser,
    unpinCommunityChatMessage,
    uploadCommunityChatImage,
    type CommunityChatAccess,
    type CommunityChatAuthorProfile,
    type CommunityChatBlockItem,
    type CommunityChatImage,
    type CommunityChatMessage,
    type CommunityChatMessagePage,
    type CommunityChatPinnedMessage,
    type CommunityChatReportReason,
    type CommunityChatRoom,
  } from '@/api/communityChatApi';
  import { recordOperation } from '@/api/commonApi';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import type { BActionMenuItem } from '@/components/base/BasicComponents/actionMenu';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BUpload from '@/components/base/BasicComponents/BUpload.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import AvatarFramePreview from '@/components/growth/AvatarFramePreview.vue';
  import MobilePageActionsDrawer, { type MobilePageActionItem } from '@/components/mobile/MobilePageActionsDrawer.vue';
  import ChatBlockListModal from '@/components/communityChat/ChatBlockListModal.vue';
  import ChatSettingsModal from '@/components/communityChat/ChatSettingsModal.vue';
  import ChatReportModal from '@/components/communityChat/ChatReportModal.vue';
  import ChatImageViewerModal from '@/components/communityChat/ChatImageViewerModal.vue';
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
  const imageViewerVisible = ref(false);
  const imageViewerImages = ref<CommunityChatImage[]>([]);
  const imageViewerTracksChatSequence = ref(false);
  const imageViewerInitialPublicId = ref('');
  const imageUploadsInFlight = ref(0);
  const isComposerDragActive = ref(false);
  const removingImageIds = ref(new Set<string>());
  const blocksVisible = ref(false);
  const settingsVisible = ref(false);
  const blocksLoading = ref(false);
  const blockedUsers = ref<CommunityChatBlockItem[]>([]);
  const unblockingId = ref('');
  const messageActionBusyId = ref('');
  const mobileMessageActionsVisible = ref(false);
  const mobileMessageActionTarget = ref<CommunityChatMessage | null>(null);
  const mobileMessageActionImageTarget = ref<CommunityChatImage | null>(null);
  const recallClock = ref(Date.now());
  const profileVisible = ref(false);
  const profileLoading = ref(false);
  const profileError = ref(false);
  const profileTargetMessageId = ref('');
  const authorProfile = ref<CommunityChatAuthorProfile | null>(null);
  const profileCache = new Map<string, CommunityChatAuthorProfile>();
  const pendingNewMessageCount = ref(0);
  const focusedMessagePublicId = ref('');
  const transientFocusedMessagePublicId = ref('');
  const hasNewerThanFocus = ref(false);
  const pinnedMessage = ref<CommunityChatMessage | null>(null);
  const pinActionBusy = ref(false);
  let profileLoadGeneration = 0;
  let loadGeneration = 0;
  let pinnedLoadGeneration = 0;
  let pollTimer: number | undefined;
  let markReadTimer: number | undefined;
  let messageScrollFrame: number | undefined;
  let initialBottomLockTimer: number | undefined;
  let initialBottomLockFrame: number | undefined;
  let initialBottomLockActive = false;
  let avatarMotionResumeTimer: number | undefined;
  let recallClockTimer: number | undefined;
  let lastMarkedReadMessageId = '';
  let clearingFocusRouteValue = '';
  let latestRefreshInFlight = false;
  let latestRefreshQueued = false;
  let latestRefreshQueuedForce = false;
  let lastAuthorityRefreshAt = 0;
  let lastMessageScrollTop = 0;
  let realtimeAuthorityRefreshPending = false;
  let isUnmounted = false;
  let composerDragDepth = 0;
  let avatarLongPressState: {
    pointerId: number;
    startX: number;
    startY: number;
    timer: number;
    message: CommunityChatMessage;
  } | null = null;
  let suppressedAvatarClickPublicId = '';
  let avatarClickSuppressionTimer: number | undefined;
  let transientFocusTimer: number | undefined;
  const INITIAL_MESSAGE_PAGE_SIZE = 30;
  const COMPOSER_INPUT_MIN_HEIGHT = 42;
  const COMPOSER_INPUT_MAX_HEIGHT = 112;
  const AVATAR_LONG_PRESS_MS = 480;
  const AVATAR_LONG_PRESS_MOVE_TOLERANCE = 10;
  const AVATAR_MOTION_SCROLL_IDLE_MS = 140;
  const INITIAL_BOTTOM_LOCK_MS = 3000;

  const currentRoom = computed(() => props.rooms.find((room) => room.slug === selectedRoomSlug.value) || null);
  const chatImageSequence = computed(() => {
    const seen = new Set<string>();
    return chatMessages.value.flatMap((chatMessage) => {
      if (chatMessage.status !== 'active' && !chatMessage.canViewRecalledContent) return [];
      return (chatMessage.images || []).filter((imageItem) => {
        if (!imageItem.publicId || !imageItem.url || seen.has(imageItem.publicId)) return false;
        seen.add(imageItem.publicId);
        return true;
      });
    });
  });
  const activeImageViewerImages = computed(() =>
    imageViewerTracksChatSequence.value ? chatImageSequence.value : imageViewerImages.value,
  );
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
  const canManagePinnedMessage = computed(
    () => props.access.memberRole === 'admin' || props.access.memberRole === 'moderator',
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
  const mobileMessageActions = computed<MobilePageActionItem[]>(() => {
    const target = mobileMessageActionTarget.value;
    if (!target) return [];
    const actions: MobilePageActionItem[] = [];
    if (mobileMessageActionImageTarget.value) {
      actions.push({
        key: 'preview-image',
        label: t('communityChat.image.preview'),
        icon: icon.cloudSpace.preview.zoomIn,
      });
    }
    if (canLikeMessage(target)) {
      actions.push({
        key: 'like',
        label: target.likedByMe ? t('communityChat.like.removeAction') : t('communityChat.like.action'),
        description: t('communityChat.like.count', { count: target.likeCount || 0 }),
        icon: icon.coBuild.vote,
        selected: target.likedByMe,
        loading: messageActionBusyId.value === target.publicId,
      });
    }
    if (canReplyToMessage(target)) {
      actions.push({ key: 'reply', label: t('communityChat.replyAction'), icon: icon.noteDetail.toolbar.quote });
    }
    if (canRecallMessage(target)) {
      actions.push({
        key: 'recall',
        label: t('communityChat.recall.action'),
        description: isRecallExpired(target)
          ? t('communityChat.recall.expiredDescription')
          : target.isOwn
            ? t('communityChat.recall.ownDescription')
            : t('communityChat.recall.adminDescription'),
        icon: icon.noteDetail.toolbar.undo,
        danger: true,
      });
    }
    if (canDeleteMessage(target)) {
      actions.push({
        key: 'delete',
        label: t('communityChat.delete.action'),
        description: t('communityChat.delete.personalDescription'),
        icon: icon.noteDetail.deleteLine,
        danger: true,
      });
    }
    for (const item of messageMenuItems(target)) {
      if (item.divider) continue;
      actions.push({
        key: item.key,
        label: item.label || '',
        icon: item.icon,
        danger: item.danger,
        disabled: item.disabled,
        dividerBefore: item.key === 'report',
      });
    }
    return actions;
  });

  function canLikeMessage(chatMessage: CommunityChatMessage) {
    return (
      props.access.authenticated &&
      props.access.canPost &&
      chatMessage.status === 'active' &&
      chatMessage.deliveryState !== 'sending'
    );
  }

  function canReplyToMessage(chatMessage: CommunityChatMessage) {
    return props.access.canPost && chatMessage.status === 'active' && chatMessage.deliveryState !== 'sending';
  }

  function canRecallMessage(chatMessage: CommunityChatMessage) {
    return (
      props.access.authenticated &&
      chatMessage.status === 'active' &&
      chatMessage.canRecall &&
      chatMessage.deliveryState !== 'sending'
    );
  }

  function isRecallExpired(chatMessage: CommunityChatMessage) {
    if (!chatMessage.isOwn || !chatMessage.recallDeadlineAt) return false;
    if (chatMessage.recallExpired) return true;
    const deadline = new Date(chatMessage.recallDeadlineAt).getTime();
    return Number.isFinite(deadline) && recallClock.value > deadline;
  }

  function canDeleteMessage(chatMessage: CommunityChatMessage) {
    return props.access.authenticated && chatMessage.canDelete && ['active', 'recalled'].includes(chatMessage.status);
  }

  function likeActionLabel(chatMessage: CommunityChatMessage) {
    return t(
      chatMessage.likedByMe ? 'communityChat.like.removeActionWithCount' : 'communityChat.like.actionWithCount',
      {
        count: chatMessage.likeCount || 0,
      },
    );
  }

  function unreadLabel(room: CommunityChatRoom) {
    return t('communityChat.roomUnread', { room: room.name, count: room.unreadCount });
  }

  function authorName(chatMessage: CommunityChatMessage) {
    return chatMessage.author.name || t('communityChat.memberFallback');
  }

  function messageSummary(chatMessage: CommunityChatMessage) {
    const content = String(chatMessage.content || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (content) return content;
    if (chatMessage.images?.length) return t('communityChat.image.messageFallback');
    return t('communityChat.replyUnavailable');
  }

  function replyAuthorName(chatMessage: CommunityChatMessage) {
    return chatMessage.reply?.authorName || t('communityChat.memberFallback');
  }

  function replySummary(chatMessage: CommunityChatMessage) {
    const reply = chatMessage.reply;
    if (!reply) return '';
    if (reply.status === 'active') {
      return (
        String(reply.content || '')
          .replace(/\s+/g, ' ')
          .trim() || (reply.hasImages ? t('communityChat.image.messageFallback') : t('communityChat.replyUnavailable'))
      );
    }
    return reply.status === 'recalled' ? t('communityChat.replyRecalled') : t('communityChat.replyUnavailable');
  }

  function canJumpToReply(chatMessage: CommunityChatMessage) {
    return Boolean(
      chatMessage.reply?.publicId &&
      ['active', 'recalled'].includes(chatMessage.reply.status) &&
      !chatMessage.reply.publicId.startsWith('pending-'),
    );
  }

  function authorAvatarSource(chatMessage: CommunityChatMessage) {
    return chatMessage.author.avatar || icon.communityChat.defaultAvatar;
  }

  function likeReactionSummary(chatMessage: CommunityChatMessage) {
    const names = (chatMessage.likePreview || []).filter(Boolean).slice(0, 3);
    const count = Math.max(0, Number(chatMessage.likeCount || 0));
    if (!names.length) return t('communityChat.like.summaryCount', { count });
    if (count > names.length) {
      return t('communityChat.like.summaryWithMore', { names: names.join('、'), count });
    }
    return names.join('、');
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

  function canMentionMessage(chatMessage: CommunityChatMessage) {
    return (
      props.access.canPost &&
      !chatMessage.isOwn &&
      chatMessage.status === 'active' &&
      chatMessage.deliveryState !== 'sending'
    );
  }

  function clearAvatarClickSuppression() {
    suppressedAvatarClickPublicId = '';
    if (avatarClickSuppressionTimer !== undefined) window.clearTimeout(avatarClickSuppressionTimer);
    avatarClickSuppressionTimer = undefined;
  }

  function suppressNextAvatarClick(messagePublicId: string) {
    clearAvatarClickSuppression();
    suppressedAvatarClickPublicId = messagePublicId;
    avatarClickSuppressionTimer = window.setTimeout(clearAvatarClickSuppression, 1_000);
  }

  function cancelAvatarLongPress(event?: PointerEvent) {
    if (!avatarLongPressState) return;
    if (event && avatarLongPressState.pointerId !== event.pointerId) return;
    window.clearTimeout(avatarLongPressState.timer);
    avatarLongPressState = null;
  }

  function beginAvatarLongPress(event: PointerEvent, chatMessage: CommunityChatMessage) {
    if (!bookmark.isMobile || event.button !== 0 || !canMentionMessage(chatMessage)) return;
    cancelAvatarLongPress();
    const state = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: 0,
      message: chatMessage,
    };
    state.timer = window.setTimeout(() => {
      if (avatarLongPressState !== state) return;
      avatarLongPressState = null;
      suppressNextAvatarClick(chatMessage.publicId);
      startMention(chatMessage);
    }, AVATAR_LONG_PRESS_MS);
    avatarLongPressState = state;
  }

  function handleAvatarLongPressMove(event: PointerEvent) {
    const state = avatarLongPressState;
    if (!state || state.pointerId !== event.pointerId) return;
    if (
      Math.abs(event.clientX - state.startX) > AVATAR_LONG_PRESS_MOVE_TOLERANCE ||
      Math.abs(event.clientY - state.startY) > AVATAR_LONG_PRESS_MOVE_TOLERANCE
    ) {
      cancelAvatarLongPress(event);
    }
  }

  function finishAvatarLongPress(event: PointerEvent) {
    cancelAvatarLongPress(event);
  }

  function handleAvatarContextMenu(event: MouseEvent, chatMessage: CommunityChatMessage) {
    if (!bookmark.isMobile || !canMentionMessage(chatMessage)) return;
    event.preventDefault();
    cancelAvatarLongPress();
    suppressNextAvatarClick(chatMessage.publicId);
    startMention(chatMessage);
  }

  function handleAuthorAvatarClick(event: MouseEvent, chatMessage: CommunityChatMessage) {
    if (suppressedAvatarClickPublicId === chatMessage.publicId) {
      event.preventDefault();
      event.stopPropagation();
      clearAvatarClickSuppression();
      return;
    }
    openAuthorProfile(chatMessage);
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
    const items: BActionMenuItem[] = [];
    if (canManagePinnedMessage.value && chatMessage.status === 'active' && chatMessage.deliveryState !== 'sending') {
      const isPinned = pinnedMessage.value?.publicId === chatMessage.publicId;
      items.push({
        key: isPinned ? 'unpin' : 'pin',
        label: t(isPinned ? 'communityChat.pin.unpinAction' : 'communityChat.pin.action'),
        icon: isPinned ? icon.contextMenu.unpin : icon.contextMenu.pin,
      });
    }
    if (!chatMessage.isOwn && chatMessage.status === 'active') {
      const alreadyReported = reportedMessageIds.value.has(chatMessage.publicId);
      if (props.access.canPost) {
        if (items.length) items.push({ key: 'message-governance-divider', divider: true });
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
    }
    return items;
  }

  function messageHasActions(chatMessage: CommunityChatMessage) {
    if (!props.access.authenticated) return false;
    return (
      canLikeMessage(chatMessage) ||
      canReplyToMessage(chatMessage) ||
      canRecallMessage(chatMessage) ||
      canDeleteMessage(chatMessage) ||
      messageMenuItems(chatMessage).length > 0
    );
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
    if (messageListEl.value) {
      messageListEl.value.scrollTop = messageListEl.value.scrollHeight;
      lastMessageScrollTop = messageListEl.value.scrollTop;
    }
  }

  function positiveImageDimension(value: number) {
    const normalized = Math.floor(Number(value));
    return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
  }

  function messageImageAspectRatio(imageItem: CommunityChatImage) {
    const width = positiveImageDimension(imageItem.width);
    const height = positiveImageDimension(imageItem.height);
    return width && height ? `${width} / ${height}` : '4 / 3';
  }

  function stopInitialBottomLock() {
    initialBottomLockActive = false;
    if (initialBottomLockTimer !== undefined) window.clearTimeout(initialBottomLockTimer);
    if (initialBottomLockFrame !== undefined) window.cancelAnimationFrame(initialBottomLockFrame);
    initialBottomLockTimer = undefined;
    initialBottomLockFrame = undefined;
  }

  function startInitialBottomLock() {
    stopInitialBottomLock();
    initialBottomLockActive = true;
    initialBottomLockTimer = window.setTimeout(stopInitialBottomLock, INITIAL_BOTTOM_LOCK_MS);
  }

  function handleMessageImageSettled() {
    if (!initialBottomLockActive || initialBottomLockFrame !== undefined) return;
    initialBottomLockFrame = window.requestAnimationFrame(() => {
      initialBottomLockFrame = undefined;
      if (initialBottomLockActive) void scrollToBottom();
    });
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
    lastMessageScrollTop = container.scrollTop;
  }

  function showTransientMessageFocus(publicId: string) {
    transientFocusedMessagePublicId.value = publicId;
    if (transientFocusTimer !== undefined) window.clearTimeout(transientFocusTimer);
    transientFocusTimer = window.setTimeout(() => {
      transientFocusTimer = undefined;
      if (transientFocusedMessagePublicId.value === publicId) transientFocusedMessagePublicId.value = '';
    }, 1800);
  }

  async function jumpToMessage(publicId: string) {
    const normalizedPublicId = String(publicId || '').trim();
    if (!normalizedPublicId || normalizedPublicId.startsWith('pending-')) return;
    if (chatMessages.value.some((item) => item.publicId === normalizedPublicId)) {
      showTransientMessageFocus(normalizedPublicId);
      await scrollToFocusedMessage(normalizedPublicId);
      return;
    }
    try {
      await router.replace({ query: { ...route.query, message: normalizedPublicId } });
    } catch {
      message.warning(t('communityChat.sourceMessageUnavailable'));
    }
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

  function processMessageListScroll() {
    messageScrollFrame = undefined;
    const element = messageListEl.value;
    if (!element) return;
    const { scrollTop, scrollHeight, clientHeight } = element;
    const scrollingUp = scrollTop < lastMessageScrollTop;
    lastMessageScrollTop = scrollTop;
    if (scrollingUp && scrollTop <= 160 && hasMore.value && !olderLoading.value) {
      void loadOlder();
    }
    if (scrollHeight - scrollTop - clientHeight >= 96) return;
    pendingNewMessageCount.value = 0;
    scheduleMarkLatestRead();
  }

  function pauseAvatarMotionForScroll() {
    const element = messageListEl.value;
    if (!element) return;
    element.classList.add('is-actively-scrolling');
    if (avatarMotionResumeTimer !== undefined) window.clearTimeout(avatarMotionResumeTimer);
    avatarMotionResumeTimer = window.setTimeout(() => {
      avatarMotionResumeTimer = undefined;
      messageListEl.value?.classList.remove('is-actively-scrolling');
    }, AVATAR_MOTION_SCROLL_IDLE_MS);
  }

  function handleMessageListScroll() {
    pauseAvatarMotionForScroll();
    if (messageScrollFrame !== undefined) return;
    messageScrollFrame = window.requestAnimationFrame(processMessageListScroll);
  }

  function handleMessageListUserScrollIntent() {
    stopInitialBottomLock();
    pauseAvatarMotionForScroll();
  }

  async function jumpToLatest() {
    pendingNewMessageCount.value = 0;
    await scrollToBottom();
    await markLatestRead();
  }

  function retainUnchangedMessageReferences(items: CommunityChatMessage[]) {
    const currentById = new Map(chatMessages.value.map((item) => [item.publicId, item]));
    return items.map((item) => {
      const current = currentById.get(item.publicId);
      return current && isEqual(current, item) ? current : item;
    });
  }

  function assignChatMessagesIfChanged(items: CommunityChatMessage[]) {
    if (
      chatMessages.value.length === items.length &&
      chatMessages.value.every((item, index) => item === items[index])
    ) {
      return false;
    }
    chatMessages.value = items;
    return true;
  }

  function mergeLatest(items: CommunityChatMessage[]) {
    const stableItems = retainUnchangedMessageReferences(items);
    const incoming = new Map(stableItems.map((item) => [item.publicId, item]));
    const merged = chatMessages.value.map((item) => incoming.get(item.publicId) || item);
    const existingIds = new Set(merged.map((item) => item.publicId));
    for (const item of stableItems) {
      if (!existingIds.has(item.publicId)) merged.push(item);
    }
    assignChatMessagesIfChanged(merged);
  }

  /**
   * 实时失效事件与安全刷新最终都读取服务端权威的“最新一页”。如果 Root 隐藏了消息或用户刚屏蔽作者，
   * 不能只做增量合并，否则已不可见的旧消息会一直留在当前页面。
   */
  function replaceLatestWindow(page: CommunityChatMessagePage) {
    const items = retainUnchangedMessageReferences(page.items || []);
    const pending = chatMessages.value.filter((item) => item.deliveryState === 'sending');
    if (!page.hasMore) {
      assignChatMessagesIfChanged([...items, ...pending]);
      return;
    }
    if (!items.length) return;
    const earliestIncomingTime = new Date(items[0].createdAt).getTime();
    const incomingIds = new Set(items.map((item) => item.publicId));
    const preservedOlder = chatMessages.value.filter((item) => {
      if (item.deliveryState === 'sending') return false;
      if (incomingIds.has(item.publicId)) return false;
      const createdTime = new Date(item.createdAt).getTime();
      return Number.isNaN(createdTime) || createdTime < earliestIncomingTime;
    });
    assignChatMessagesIfChanged([...preservedOlder, ...items, ...pending]);
  }

  async function markLatestRead() {
    if (!props.access.authenticated) return;
    const roomSlug = selectedRoomSlug.value;
    const latestMessage = [...chatMessages.value].reverse().find((item) => item.deliveryState !== 'sending');
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

  async function loadPinnedMessage() {
    const roomSlug = selectedRoomSlug.value;
    if (!roomSlug) return;
    const generation = ++pinnedLoadGeneration;
    try {
      const response = await getCommunityChatPinnedMessage(roomSlug);
      if (generation !== pinnedLoadGeneration || roomSlug !== selectedRoomSlug.value) return;
      const data = response.data as CommunityChatPinnedMessage;
      pinnedMessage.value = data?.message || null;
    } catch {
      if (generation === pinnedLoadGeneration) pinnedMessage.value = null;
    }
  }

  async function loadInitial({ ignoreFocus = false } = {}) {
    const roomSlug = selectedRoomSlug.value;
    if (!roomSlug) return;
    const generation = ++loadGeneration;
    const requestedFocus = ignoreFocus ? '' : focusMessageFromRoute.value;
    stopInitialBottomLock();
    initialLoading.value = true;
    loadError.value = false;
    pendingNewMessageCount.value = 0;
    try {
      let response;
      try {
        response = await getCommunityChatMessages(
          roomSlug,
          requestedFocus
            ? { focus: requestedFocus, limit: INITIAL_MESSAGE_PAGE_SIZE }
            : { limit: INITIAL_MESSAGE_PAGE_SIZE },
        );
      } catch (error) {
        if (!requestedFocus || generation !== loadGeneration || roomSlug !== selectedRoomSlug.value) throw error;
        focusedMessagePublicId.value = '';
        hasNewerThanFocus.value = false;
        await clearFocusMessageRoute();
        message.warning(t('communityChat.sourceMessageUnavailable'));
        response = await getCommunityChatMessages(roomSlug, { limit: INITIAL_MESSAGE_PAGE_SIZE });
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
      else {
        startInitialBottomLock();
        await scrollToBottom();
      }
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
      const response = await getCommunityChatMessages(roomSlug, { before, limit: INITIAL_MESSAGE_PAGE_SIZE });
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
      if (element) {
        element.scrollTop += element.scrollHeight - previousScrollHeight;
        lastMessageScrollTop = element.scrollTop;
      }
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
      const response = await getCommunityChatMessages(roomSlug, { limit: INITIAL_MESSAGE_PAGE_SIZE });
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
    if (event.type === 'message.updated') {
      const reason = String(event.payload.reason || '');
      if (reason === 'pin' || reason === 'unpin') {
        await loadPinnedMessage();
        return;
      }
      if (reason === 'recall') await loadPinnedMessage();
      await refreshLatest({ force: true });
      return;
    }
    await loadPinnedMessage();
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
    await Promise.all([refreshLatest({ force: true }), loadPinnedMessage()]);
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

  function openMobileMessageActions(chatMessage: CommunityChatMessage, imageTarget: CommunityChatImage | null = null) {
    if (!bookmark.isMobile || !messageHasActions(chatMessage)) return;
    mobileMessageActionTarget.value = chatMessage;
    mobileMessageActionImageTarget.value = imageTarget;
    mobileMessageActionsVisible.value = true;
  }

  function handleMessageImageClick(chatMessage: CommunityChatMessage, imageItem: CommunityChatImage) {
    if (!bookmark.isMobile || !messageHasActions(chatMessage)) {
      openImagePreview(imageItem);
      return;
    }
    openMobileMessageActions(chatMessage, imageItem);
  }

  function handleMessageTap(event: MouseEvent, chatMessage: CommunityChatMessage) {
    if (!bookmark.isMobile || !messageHasActions(chatMessage)) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('button, a, input, textarea, [role="button"], [role="menuitem"]')) return;
    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed) return;
    openMobileMessageActions(chatMessage);
  }

  function handleMobileMessageAction(action: MobilePageActionItem) {
    const target = mobileMessageActionTarget.value;
    if (!target) return;
    const imageTarget = mobileMessageActionImageTarget.value;
    // 抽屉会先释放移动端 history 占位，再异步派发 action。目标消息必须保留到这里，
    // 不能在 v-model 变为 false 时提前清空；拿到稳定快照后即可释放引用。
    mobileMessageActionTarget.value = null;
    mobileMessageActionImageTarget.value = null;
    if (action.key === 'preview-image' && imageTarget) {
      openImagePreview(imageTarget);
      return;
    }
    if (action.key === 'like') {
      void toggleLike(target);
      return;
    }
    if (action.key === 'reply') {
      startReply(target);
      return;
    }
    if (action.key === 'recall') {
      confirmRecall(target);
      return;
    }
    if (action.key === 'delete') {
      confirmDelete(target);
      return;
    }
    handleMessageAction(action.key, target);
  }

  function updateMessageInteraction(publicId: string, patch: Partial<CommunityChatMessage>) {
    chatMessages.value = chatMessages.value.map((item) => (item.publicId === publicId ? { ...item, ...patch } : item));
    if (mobileMessageActionTarget.value?.publicId === publicId) {
      mobileMessageActionTarget.value = { ...mobileMessageActionTarget.value, ...patch };
    }
  }

  async function toggleLike(chatMessage: CommunityChatMessage) {
    if (!canLikeMessage(chatMessage) || messageActionBusyId.value) return;
    messageActionBusyId.value = chatMessage.publicId;
    try {
      const response = await toggleCommunityChatMessageLike(chatMessage.publicId);
      if (response?.status !== 200) throw new Error('COMMUNITY_CHAT_LIKE_FAILED');
      updateMessageInteraction(chatMessage.publicId, {
        likedByMe: Boolean(response.data?.likedByMe),
        likeCount: Math.max(0, Number(response.data?.likeCount || 0)),
        likePreview: Array.isArray(response.data?.likePreview) ? response.data.likePreview : [],
      });
    } catch (error: any) {
      message.error(error?.message || t('communityChat.like.failed'));
    } finally {
      messageActionBusyId.value = '';
    }
  }

  function confirmRecall(chatMessage: CommunityChatMessage) {
    if (!canRecallMessage(chatMessage)) return;
    if (isRecallExpired(chatMessage)) {
      mobileMessageActionsVisible.value = false;
      message.warning(t('communityChat.recall.expiredHint'));
      return;
    }
    const adminRecall = !chatMessage.isOwn;
    Alert.alert({
      title: t(adminRecall ? 'communityChat.recall.adminConfirmTitle' : 'communityChat.recall.confirmTitle'),
      content: t(
        adminRecall ? 'communityChat.recall.adminConfirmDescription' : 'communityChat.recall.confirmDescription',
      ),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('communityChat.recall.confirmAction'),
          type: 'danger',
          function: () => {
            Alert.destroy();
            void recallMessage(chatMessage);
          },
        },
      ],
    });
  }

  async function recallMessage(chatMessage: CommunityChatMessage) {
    if (messageActionBusyId.value) return;
    messageActionBusyId.value = chatMessage.publicId;
    try {
      const response = await recallCommunityChatMessage(chatMessage.publicId);
      if (response?.status !== 200) throw new Error('COMMUNITY_CHAT_RECALL_FAILED');
      mobileMessageActionsVisible.value = false;
      if (replyTarget.value?.publicId === chatMessage.publicId) cancelReply();
      void recordOperation({
        module: '公共聊天室',
        operation: chatMessage.isOwn ? '撤回自己的消息' : '管理员撤回消息',
      });
      message.success(t('communityChat.recall.success'));
      await Promise.all([refreshLatest({ force: true }), loadPinnedMessage()]);
    } catch (error: any) {
      message.error(error?.message || t('communityChat.recall.failed'));
    } finally {
      messageActionBusyId.value = '';
    }
  }

  function confirmDelete(chatMessage: CommunityChatMessage) {
    if (!canDeleteMessage(chatMessage)) return;
    Alert.alert({
      title: t('communityChat.delete.confirmTitle'),
      content: t('communityChat.delete.confirmDescription'),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('communityChat.delete.confirmAction'),
          type: 'danger',
          function: () => {
            Alert.destroy();
            void deleteMessage(chatMessage);
          },
        },
      ],
    });
  }

  async function deleteMessage(chatMessage: CommunityChatMessage) {
    if (!canDeleteMessage(chatMessage) || messageActionBusyId.value) return;
    messageActionBusyId.value = chatMessage.publicId;
    try {
      const response = await deleteCommunityChatMessage(chatMessage.publicId);
      if (response?.status !== 200) throw new Error('COMMUNITY_CHAT_DELETE_FAILED');
      mobileMessageActionsVisible.value = false;
      if (replyTarget.value?.publicId === chatMessage.publicId) cancelReply();
      chatMessages.value = chatMessages.value.filter((item) => item.publicId !== chatMessage.publicId);
      if (pinnedMessage.value?.publicId === chatMessage.publicId) pinnedMessage.value = null;
      if (focusedMessagePublicId.value === chatMessage.publicId) {
        focusedMessagePublicId.value = '';
        hasNewerThanFocus.value = false;
        void clearFocusMessageRoute();
      }
      void recordOperation({ module: '公共聊天室', operation: '从自己的聊天记录删除消息' });
      message.success(t('communityChat.delete.success'));
    } catch (error: any) {
      message.error(error?.message || t('communityChat.delete.failed'));
    } finally {
      messageActionBusyId.value = '';
    }
  }

  function startReply(chatMessage: CommunityChatMessage) {
    if (!canReplyToMessage(chatMessage)) return;
    replyTarget.value = chatMessage;
    pendingClientRequestId.value = null;
    void nextTick(() => composerInput.value?.focus());
  }

  function cancelReply() {
    replyTarget.value = null;
    pendingClientRequestId.value = null;
  }

  function startMention(chatMessage: CommunityChatMessage) {
    if (!canMentionMessage(chatMessage)) return;
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
    pendingClientRequestId.value = null;
    void nextTick(() => composerInput.value?.focus());
  }

  function cancelMention(publicId: string) {
    mentionTargets.value = mentionTargets.value.filter((item) => item.publicId !== publicId);
    pendingClientRequestId.value = null;
  }

  function openImagePreview(imageItem: CommunityChatImage, sourceImages?: CommunityChatImage[]) {
    const seen = new Set<string>();
    const tracksChatSequence = sourceImages === undefined;
    const sequence = (sourceImages || chatImageSequence.value).filter((item) => {
      if (!item?.publicId || !item.url || seen.has(item.publicId)) return false;
      seen.add(item.publicId);
      return true;
    });
    if (!seen.has(imageItem.publicId)) sequence.push(imageItem);
    imageViewerTracksChatSequence.value = tracksChatSequence;
    imageViewerImages.value = tracksChatSequence ? [] : sequence;
    imageViewerInitialPublicId.value = imageItem.publicId;
    imageViewerVisible.value = true;
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
    blocksVisible.value = true;
  }

  function handleNotificationSettingsSaved() {
    emit('accessInvalidated');
  }

  function confirmPinMessage(chatMessage: CommunityChatMessage) {
    if (!canManagePinnedMessage.value || pinActionBusy.value || chatMessage.status !== 'active') return;
    if (!pinnedMessage.value || pinnedMessage.value.publicId === chatMessage.publicId) {
      void pinMessage(chatMessage);
      return;
    }
    Alert.alert({
      title: t('communityChat.pin.replaceTitle'),
      content: t('communityChat.pin.replaceDescription'),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('communityChat.pin.replaceAction'),
          type: 'primary',
          function: () => {
            Alert.destroy();
            void pinMessage(chatMessage);
          },
        },
      ],
    });
  }

  async function pinMessage(chatMessage: CommunityChatMessage) {
    if (!canManagePinnedMessage.value || pinActionBusy.value) return;
    pinActionBusy.value = true;
    messageActionBusyId.value = chatMessage.publicId;
    try {
      const response = await pinCommunityChatMessage(chatMessage.publicId);
      if (response?.status !== 200 || !response.data?.message) throw new Error('COMMUNITY_CHAT_PIN_FAILED');
      pinnedMessage.value = response.data.message as CommunityChatMessage;
      mobileMessageActionsVisible.value = false;
      void recordOperation({ module: '公共聊天室', operation: '管理员置顶消息' });
      message.success(t('communityChat.pin.success'));
    } catch (error: any) {
      message.error(error?.message || t('communityChat.pin.failed'));
      await loadPinnedMessage();
    } finally {
      pinActionBusy.value = false;
      messageActionBusyId.value = '';
    }
  }

  function confirmUnpinMessage(chatMessage: CommunityChatMessage) {
    if (!canManagePinnedMessage.value || pinActionBusy.value) return;
    Alert.alert({
      title: t('communityChat.pin.unpinTitle'),
      content: t('communityChat.pin.unpinDescription'),
      footer: [
        { label: t('common.cancel'), type: 'dashed', function: () => Alert.destroy() },
        {
          label: t('communityChat.pin.unpinAction'),
          type: 'danger',
          function: () => {
            Alert.destroy();
            void unpinMessage(chatMessage);
          },
        },
      ],
    });
  }

  async function unpinMessage(chatMessage: CommunityChatMessage) {
    if (!canManagePinnedMessage.value || pinActionBusy.value) return;
    pinActionBusy.value = true;
    messageActionBusyId.value = chatMessage.publicId;
    try {
      const response = await unpinCommunityChatMessage(chatMessage.publicId);
      if (response?.status !== 200) throw new Error('COMMUNITY_CHAT_UNPIN_FAILED');
      if (pinnedMessage.value?.publicId === chatMessage.publicId) pinnedMessage.value = null;
      mobileMessageActionsVisible.value = false;
      void recordOperation({ module: '公共聊天室', operation: '管理员取消置顶消息' });
      message.success(t('communityChat.pin.unpinSuccess'));
    } catch (error: any) {
      message.error(error?.message || t('communityChat.pin.failed'));
      await loadPinnedMessage();
    } finally {
      pinActionBusy.value = false;
      messageActionBusyId.value = '';
    }
  }

  function handleMessageAction(action: string, chatMessage: CommunityChatMessage) {
    if (!props.access.authenticated) return;
    if (action === 'pin') {
      confirmPinMessage(chatMessage);
      return;
    }
    if (action === 'unpin') {
      confirmUnpinMessage(chatMessage);
      return;
    }
    if (action === 'mention') {
      startMention(chatMessage);
      return;
    }
    if (action === 'report') {
      reportTarget.value = chatMessage;
      reportVisible.value = true;
      return;
    }
    if (action === 'block') {
      confirmBlock(chatMessage);
      return;
    }
    if (action === 'hide') confirmHide(chatMessage);
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
      await Promise.all([loadInitial(), loadPinnedMessage()]);
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
      await Promise.all([loadInitial(), loadPinnedMessage()]);
    } catch (error: any) {
      message.error(error?.message || t('communityChat.blocks.unblockFailed'));
    } finally {
      unblockingId.value = '';
    }
  }

  function buildOptimisticMessage(input: {
    publicId: string;
    content: string;
    images: CommunityChatImage[];
    replyTarget: CommunityChatMessage | null;
  }): CommunityChatMessage {
    const previousOwnMessage = [...chatMessages.value].reverse().find((item) => item.isOwn);
    const previousAuthor = previousOwnMessage?.author;
    const currentAvatar = currentUser.headPicture === icon.navigation.user ? '' : currentUser.headPicture || '';
    const authorRole: CommunityChatMessage['author']['role'] =
      currentUser.role === 'root' ? 'official' : props.access.memberRole === 'moderator' ? 'moderator' : 'member';
    const now = new Date();
    return {
      publicId: input.publicId,
      content: input.content,
      status: 'active',
      createdAt: now.toISOString(),
      editedAt: null,
      recalledAt: null,
      recalledByAdmin: false,
      canViewRecalledContent: false,
      canRecall: false,
      recallExpired: false,
      canDelete: false,
      recallDeadlineAt: null,
      isOwn: true,
      images: input.images.map((imageItem) => ({ ...imageItem })),
      likeCount: 0,
      likedByMe: false,
      likePreview: [],
      deliveryState: 'sending',
      author: {
        name: currentUser.alias || currentUser.userName || previousAuthor?.name || t('communityChat.memberFallback'),
        role: authorRole,
        avatar: currentAvatar || previousAuthor?.avatar || '',
        frameId: previousAuthor?.frameId || null,
        level: previousAuthor?.level || 1,
        levelName: previousAuthor?.levelName || '蒙童',
        title: previousAuthor?.title || null,
      },
      reply: input.replyTarget
        ? {
            publicId: input.replyTarget.publicId,
            content: input.replyTarget.content,
            status: input.replyTarget.status,
            authorName: authorName(input.replyTarget),
            hasImages: input.replyTarget.images.length > 0,
          }
        : null,
    };
  }

  async function sendMessage() {
    const roomSlug = selectedRoomSlug.value;
    const content = String(draft.value || '').trim();
    if (!roomSlug || !canSend.value || !canPostCurrentRoom.value) return;
    const clientRequestId = pendingClientRequestId.value || createCommunityChatClientRequestId();
    pendingClientRequestId.value = clientRequestId;
    const imagePublicIds = pendingImages.value.map((imageItem) => imageItem.publicId);
    // 提及对象由上方 tag 单独表达；正文不再重复插入 @昵称，提交时直接使用稳定消息公有 ID。
    const mentionMessagePublicIds = mentionTargets.value.map((target) => target.publicId);
    const optimisticPublicId = `pending-${clientRequestId}`;
    const draftSnapshot = draft.value;
    const replySnapshot = replyTarget.value;
    const mentionSnapshot = [...mentionTargets.value];
    const imageSnapshot = pendingImages.value.map((imageItem) => ({ ...imageItem }));
    const optimisticMessage = buildOptimisticMessage({
      publicId: optimisticPublicId,
      content,
      images: imageSnapshot,
      replyTarget: replySnapshot,
    });
    sending.value = true;
    chatMessages.value = [...chatMessages.value, optimisticMessage];
    draft.value = '';
    replyTarget.value = null;
    mentionTargets.value = [];
    pendingImages.value = [];
    await scrollToBottom();
    try {
      const payload = {
        clientRequestId,
        content,
        ...(replySnapshot ? { replyToPublicId: replySnapshot.publicId } : {}),
        ...(mentionMessagePublicIds.length ? { mentionMessagePublicIds } : {}),
        ...(imagePublicIds.length ? { imagePublicIds } : {}),
      };
      const response = await sendCommunityChatMessage(roomSlug, payload);
      const sentMessage = response.data?.message as CommunityChatMessage | undefined;
      if (!sentMessage) throw new Error('COMMUNITY_CHAT_SEND_RESPONSE_INVALID');
      chatMessages.value = chatMessages.value.filter((item) => item.publicId !== optimisticPublicId);
      if (roomSlug === selectedRoomSlug.value) mergeLatest([sentMessage]);
      pendingClientRequestId.value = null;
      await scrollToBottom();
      void markLatestRead();
    } catch (error: any) {
      chatMessages.value = chatMessages.value.filter((item) => item.publicId !== optimisticPublicId);
      if (roomSlug === selectedRoomSlug.value) {
        draft.value = draftSnapshot;
        replyTarget.value = replySnapshot;
        mentionTargets.value = mentionSnapshot;
        pendingImages.value = imageSnapshot;
      }
      emit('accessInvalidated');
      message.error(error?.message || t('communityChat.sendFailed'));
    } finally {
      sending.value = false;
      if (roomSlug === selectedRoomSlug.value && canPostCurrentRoom.value) {
        await nextTick();
        composerInput.value?.focus();
      }
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
      mobileMessageActionsVisible.value = false;
      mobileMessageActionTarget.value = null;
      mobileMessageActionImageTarget.value = null;
      imageViewerVisible.value = false;
      imageViewerTracksChatSequence.value = false;
      imageViewerImages.value = [];
      imageViewerInitialPublicId.value = '';
      profileLoadGeneration += 1;
      profileVisible.value = false;
      profileLoading.value = false;
      profileError.value = false;
      profileTargetMessageId.value = '';
      authorProfile.value = null;
      pendingNewMessageCount.value = 0;
      focusedMessagePublicId.value = '';
      transientFocusedMessagePublicId.value = '';
      hasNewerThanFocus.value = false;
      pinnedLoadGeneration += 1;
      pinnedMessage.value = null;
      pinActionBusy.value = false;
      lastMarkedReadMessageId = '';
      lastAuthorityRefreshAt = 0;
      lastMessageScrollTop = 0;
      if (messageScrollFrame !== undefined) {
        window.cancelAnimationFrame(messageScrollFrame);
        messageScrollFrame = undefined;
      }
      realtimeAuthorityRefreshPending = false;
      void loadInitial();
      void loadPinnedMessage();
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
    recallClockTimer = window.setInterval(() => {
      recallClock.value = Date.now();
    }, 5000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('resize', syncComposerInputHeight);
    void nextTick(syncComposerInputHeight);
  });

  onBeforeUnmount(() => {
    isUnmounted = true;
    cancelAvatarLongPress();
    clearAvatarClickSuppression();
    resetComposerDragState();
    loadGeneration += 1;
    pinnedLoadGeneration += 1;
    profileLoadGeneration += 1;
    if (pollTimer !== undefined) window.clearInterval(pollTimer);
    if (recallClockTimer !== undefined) window.clearInterval(recallClockTimer);
    if (markReadTimer !== undefined) window.clearTimeout(markReadTimer);
    if (messageScrollFrame !== undefined) window.cancelAnimationFrame(messageScrollFrame);
    stopInitialBottomLock();
    if (avatarMotionResumeTimer !== undefined) window.clearTimeout(avatarMotionResumeTimer);
    if (transientFocusTimer !== undefined) window.clearTimeout(transientFocusTimer);
    messageListEl.value?.classList.remove('is-actively-scrolling');
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('resize', syncComposerInputHeight);
    mobileMessageActionTarget.value = null;
    mobileMessageActionImageTarget.value = null;
    imageViewerVisible.value = false;
    imageViewerTracksChatSequence.value = false;
    imageViewerImages.value = [];
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
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .community-pinned-message {
    min-width: 0;
    min-height: 38px;
    padding: 4px 12px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 6px;
    border-bottom: 1px solid var(--surface-divider-color);
    background: var(--workspace-panel-bg-color);
  }

  .community-pinned-message__jump {
    min-width: 0;
    min-height: 30px;
    height: auto;
    padding: 3px 5px !important;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 6px;
    border: 0 !important;
    color: var(--desc-color);
    background: transparent !important;
    line-height: 1.4;
  }

  .community-pinned-message__jump > strong {
    flex: 0 0 auto;
    color: var(--chip-pin-fg, var(--primary-color));
    font-size: 11px;
  }

  .community-pinned-message__jump > span {
    min-width: 0;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .community-pinned-message__jump:hover > span {
    color: var(--text-color);
  }

  .community-pinned-message__jump:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 1px;
  }

  .community-pinned-message__unpin {
    width: 30px;
    min-width: 30px;
    height: 30px;
    min-height: 30px;
    padding: 0 !important;
    display: grid;
    place-items: center;
    border: 0 !important;
    color: var(--desc-color);
    background: transparent !important;
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

  .community-message-list {
    grid-row: 2;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-x: none;
    overscroll-behavior-y: contain;
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
    padding: 18px clamp(14px, 3vw, 32px) 22px;
    box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }

  .community-message-list:hover {
    scrollbar-color: var(--scrollbar-color) transparent;
  }

  .community-message-list::-webkit-scrollbar {
    width: 3px;
    height: 3px;
  }

  .community-message-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .community-message-list::-webkit-scrollbar-thumb {
    border-radius: 3px;
    background: transparent;
  }

  /* 滚动时每款头像框仍保留一层 transform/opacity 主动效，只暂停滤镜和次级装饰动画。 */
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--gold .avatar-frame__motif),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--neon .avatar-frame__ring),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--aurora .avatar-frame__motif),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--galaxy .avatar-frame__motif),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--galaxy .avatar-frame__motif::before),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--galaxy .avatar-frame__motif::after),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--galaxy .avatar-frame__orbit),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--galaxy .avatar-frame__comet),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--flame .avatar-frame__ring),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--dragon .avatar-frame__orbit),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--celestial .avatar-frame__ring),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--celestial .avatar-frame__ring::after),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--celestial .avatar-frame__motif),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--celestial .avatar-frame__motif::before),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--celestial .avatar-frame__motif::after),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--celestial .avatar-frame__orbit),
  .community-message-list.is-actively-scrolling :deep(.avatar-frame--celestial .avatar-frame__comet) {
    animation-play-state: paused !important;
  }

  .community-message-list:hover::-webkit-scrollbar-thumb {
    background: var(--scrollbar-color);
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
    overflow: visible !important;
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
    background-color: var(--card-background);
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
    max-width: calc(100% - 50px);
    display: grid;
    gap: 5px;
  }

  .community-message.is-own .community-message__body {
    justify-items: end;
  }

  .community-message.is-sending .community-message__payload {
    opacity: 0.72;
  }

  .community-message__payload {
    width: fit-content;
    max-width: 100%;
    position: relative;
    display: grid;
    justify-items: start;
    gap: 5px;
  }

  .community-message.is-own .community-message__payload {
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
    width: auto;
    max-width: 100%;
    min-height: 24px;
    height: auto;
    padding: 3px 2px 3px 9px !important;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    overflow: hidden;
    border: 0 !important;
    border-left: 2px solid var(--surface-border-color) !important;
    border-radius: 0;
    color: var(--desc-color);
    background: transparent !important;
    font-size: 10px;
    line-height: 1.45;
    text-align: left;
  }

  .community-message__reply:not(:disabled):hover {
    border-left-color: var(--primary-color) !important;
    color: var(--text-color);
  }

  .community-message__reply:disabled {
    opacity: 1;
    cursor: default;
  }

  .community-message__reply strong,
  .community-message__reply span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .community-message__reply strong {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-weight: 500;
  }

  .community-message__reply span {
    min-width: 0;
  }

  .community-message__recalled {
    min-height: 34px;
    padding: 7px 10px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 11px;
  }

  .community-message.is-recalled .community-message__content,
  .community-message.is-recalled .community-message__images {
    opacity: 0.76;
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

  .community-message.is-focused .community-message__recalled {
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
    position: absolute;
    top: 4px;
    left: calc(100% + 6px);
    z-index: 1;
    min-height: 24px;
    width: fit-content;
    padding: 2px;
    display: inline-flex;
    align-items: center;
    gap: 1px;
    border: 1px solid var(--surface-border-color);
    border-radius: 8px;
    background: var(--card-background);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.16s ease;
  }

  .community-message.is-own .community-message__actions {
    right: calc(100% + 6px);
    left: auto;
  }

  .community-message:hover .community-message__actions,
  .community-message:focus-within .community-message__actions {
    opacity: 1;
    pointer-events: auto;
  }

  .community-message__actions :deep(.b_btn) {
    min-width: 29px;
    min-height: 27px;
    padding: 3px 6px;
    gap: 4px;
    border: 0 !important;
    border-radius: 6px;
    color: var(--desc-color);
    background: transparent !important;
  }

  .community-message__action.is-selected {
    color: var(--primary-color) !important;
    background: var(--mobile-selected-bg, var(--workspace-panel-bg-color)) !important;
  }

  .community-message__action.is-danger {
    color: var(--danger-color) !important;
  }

  .community-message__reactions {
    width: fit-content;
    max-width: 100%;
    min-width: 0;
    min-height: 25px;
    padding: 3px 8px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border: 1px solid var(--primary-color);
    border-radius: 999px;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color);
    font-size: 10px;
    line-height: 1.4;
    overflow: hidden;
  }

  .community-message__reactions span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  .community-composer__send :deep(.btn-spinner) {
    margin-right: 0;
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

    .community-pinned-message {
      min-height: 36px;
      padding: 3px 8px;
    }

    .community-pinned-message__jump {
      gap: 5px;
    }

    .community-pinned-message__jump > strong,
    .community-pinned-message__jump > span {
      font-size: 10px;
    }

    .community-message-list {
      padding: 14px 10px 18px;
    }

    .community-message {
      width: 94%;
      margin-bottom: 14px;
      gap: 7px;
    }

    .community-message__body {
      max-width: calc(100% - 45px);
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
      display: none !important;
    }

    :global(html.light-note-mobile-rendering .community-message-list) {
      scrollbar-width: none;
    }

    :global(html.light-note-mobile-rendering .community-message-list::-webkit-scrollbar) {
      width: 0;
      height: 0;
      display: none;
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
