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
            <div class="community-conversation-header__title-line">
              <strong>{{ currentRoom.name }}</strong>
              <span
                v-if="canViewOnlinePresence && realtimeEnabled && onlineCount !== null"
                class="community-conversation-header__online"
                @click="openOnlineMembers"
              >
                {{ t('communityChat.onlineCount', { count: onlineCount }) }}
              </span>
            </div>
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

      <div class="community-message-stream" :aria-busy="initialLoading">
        <div
          v-if="initialLoading"
          class="community-message-skeleton"
          role="status"
          :aria-label="t('communityChat.messagesLoading')"
        >
          <span v-for="index in 4" :key="index" :class="{ 'is-own': index % 3 === 0 }"></span>
        </div>
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

          <div v-if="loadError && !chatMessages.length" class="community-message-state" role="status">
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
                  <BButton
                    class="community-message__author-name"
                    :aria-label="t('communityChat.profile.view', { name: authorName(chatMessage) })"
                    @click.stop="openAuthorProfile(chatMessage)"
                  >
                    {{ authorName(chatMessage) }}
                  </BButton>
                  <span class="community-message__level">
                    Lv.{{ chatMessage.author.level }} {{ chatMessage.author.levelName }}
                  </span>
                  <span v-if="chatMessage.author.role !== 'member'" class="community-message__role">
                    {{ authorRoleLabel(chatMessage.author.role) }}
                  </span>
                  <time :datetime="chatMessage.createdAt">{{ formatMessageTime(chatMessage.createdAt) }}</time>
                </div>
                <div class="community-message__payload" @click="handleMessageTap($event, chatMessage)">
                  <div class="community-message__surface">
                    <div
                      v-if="chatMessage.status === 'recalled' && chatMessage.canViewRecalledContent"
                      class="community-message__recalled"
                      role="status"
                    >
                      <span>
                        {{ t('communityChat.recall.adminVisible') }}
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
                    </template>
                    <div class="community-message__primary">
                      <div
                        v-if="chatMessage.status === 'recalled' && !chatMessage.canViewRecalledContent"
                        class="community-message__recalled"
                        role="status"
                      >
                        <span>{{ t('communityChat.recall.placeholder') }}</span>
                      </div>
                      <p v-else-if="messageHasText(chatMessage)" class="community-message__content">
                        <span
                          v-if="chatMessage.mentionEveryone || chatMessage.mentions?.length"
                          class="community-message__mentions"
                        >
                          <span v-if="chatMessage.mentionEveryone" class="community-message__mention">
                            @{{ t('communityChat.mentionSearch.everyone') }}
                          </span>
                          <span
                            v-for="(name, index) in chatMessage.mentions"
                            :key="`${chatMessage.publicId}:mention:${index}`"
                            class="community-message__mention"
                          >
                            @{{ name }}
                          </span>
                        </span>
                        <span v-if="chatMessage.content">{{ chatMessage.content }}</span>
                      </p>
                      <div
                        v-else-if="messageHasImages(chatMessage)"
                        class="community-message__images"
                        :class="`has-${Math.min(chatMessage.images.length, 4)}`"
                      >
                        <BButton
                          v-for="imageItem in chatMessage.images"
                          :key="imageItem.publicId"
                          class="community-message__image"
                          :class="{ 'is-ready': isMessageImageReady(imageItem.publicId) }"
                          :style="messageImageLayoutStyle(imageItem)"
                          :aria-label="t('communityChat.image.preview')"
                          @click.stop="handleMessageImageClick(chatMessage, imageItem)"
                        >
                          <span class="community-message__image-sizer" aria-hidden="true"></span>
                          <span
                            v-if="!isMessageImageReady(imageItem.publicId)"
                            class="community-message__image-placeholder"
                            aria-hidden="true"
                          >
                            <SvgIcon :src="icon.noteDetail.toolbar.image" size="22" />
                          </span>
                          <img
                            :src="imageItem.url"
                            :alt="t('communityChat.image.messageAlt', { name: authorName(chatMessage) })"
                            :width="positiveImageDimension(imageItem.width)"
                            :height="positiveImageDimension(imageItem.height)"
                            :loading="isMessageImagePriority(imageItem.publicId) ? 'eager' : 'lazy'"
                            :fetchpriority="isMessageImagePriority(imageItem.publicId) ? 'high' : 'auto'"
                            decoding="async"
                            @load="handleMessageImageLoaded($event, imageItem)"
                            @error="handleMessageImageError(imageItem)"
                          />
                        </BButton>
                      </div>
                      <div
                        v-else-if="chatMessage.messageKind === 'sticker'"
                        class="community-message__sticker"
                        :class="{ 'has-image': Boolean(chatMessage.sticker?.url) }"
                      >
                        <img
                          v-if="chatMessage.sticker?.url"
                          :src="chatMessage.sticker.url"
                          :alt="t('communityChat.sticker.messageAlt', { name: authorName(chatMessage) })"
                          loading="lazy"
                          decoding="async"
                        />
                        <span v-else>{{ t('communityChat.sticker.messageFallback') }}</span>
                      </div>
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
                        <BTooltip
                          v-if="canReplyToMessage(chatMessage)"
                          :title="t('communityChat.replyAction')"
                          :delay="80"
                        >
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
                    <div
                      v-if="messageHasText(chatMessage) && messageHasImages(chatMessage)"
                      class="community-message__images"
                      :class="`has-${Math.min(chatMessage.images.length, 4)}`"
                    >
                      <BButton
                        v-for="imageItem in chatMessage.images"
                        :key="imageItem.publicId"
                        class="community-message__image"
                        :class="{ 'is-ready': isMessageImageReady(imageItem.publicId) }"
                        :style="messageImageLayoutStyle(imageItem)"
                        :aria-label="t('communityChat.image.preview')"
                        @click.stop="handleMessageImageClick(chatMessage, imageItem)"
                      >
                        <span class="community-message__image-sizer" aria-hidden="true"></span>
                        <span
                          v-if="!isMessageImageReady(imageItem.publicId)"
                          class="community-message__image-placeholder"
                          aria-hidden="true"
                        >
                          <SvgIcon :src="icon.noteDetail.toolbar.image" size="22" />
                        </span>
                        <img
                          :src="imageItem.url"
                          :alt="t('communityChat.image.messageAlt', { name: authorName(chatMessage) })"
                          :width="positiveImageDimension(imageItem.width)"
                          :height="positiveImageDimension(imageItem.height)"
                          :loading="isMessageImagePriority(imageItem.publicId) ? 'eager' : 'lazy'"
                          :fetchpriority="isMessageImagePriority(imageItem.publicId) ? 'high' : 'auto'"
                          decoding="async"
                          @load="handleMessageImageLoaded($event, imageItem)"
                          @error="handleMessageImageError(imageItem)"
                        />
                      </BButton>
                    </div>
                    <div
                      v-if="
                        (messageHasText(chatMessage) || messageHasImages(chatMessage)) &&
                        chatMessage.messageKind === 'sticker'
                      "
                      class="community-message__sticker"
                      :class="{ 'has-image': Boolean(chatMessage.sticker?.url) }"
                    >
                      <img
                        v-if="chatMessage.sticker?.url"
                        :src="chatMessage.sticker.url"
                        :alt="t('communityChat.sticker.messageAlt', { name: authorName(chatMessage) })"
                        loading="lazy"
                        decoding="async"
                      />
                      <span v-else>{{ t('communityChat.sticker.messageFallback') }}</span>
                    </div>
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
          class="community-message-list__new community-message-list__new--unread"
          :aria-label="t('communityChat.newMessages', { count: pendingNewMessageCount })"
          @click="jumpToLatest"
        >
          <SvgIcon :src="icon.ai.scrollDown" size="15" aria-hidden="true" />
          <span>{{ t('communityChat.newMessages', { count: pendingNewMessageDisplayCount }) }}</span>
        </BButton>
        <BButton
          v-else-if="showBackToBottom"
          class="community-message-list__new"
          :aria-label="t('communityChat.backToBottom')"
          @click="jumpToLatest"
        >
          <SvgIcon :src="icon.ai.scrollDown" size="15" aria-hidden="true" />
          <span>{{ t('communityChat.backToBottom') }}</span>
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

          <div v-if="mentionEveryone || mentionTargets.length" class="community-composer__mentions">
            <strong>{{ t('communityChat.mentioning') }}</strong>
            <div>
              <BButton
                v-if="mentionEveryone"
                size="small"
                :aria-label="t('communityChat.cancelMention', { name: t('communityChat.mentionSearch.everyone') })"
                @click="cancelMentionEveryone"
              >
                @{{ t('communityChat.mentionSearch.everyone') }}
                <SvgIcon :src="icon.common.close" size="12" aria-hidden="true" />
              </BButton>
              <BButton
                v-for="target in mentionTargets"
                :key="target.key"
                size="small"
                :aria-label="t('communityChat.cancelMention', { name: target.name })"
                @click="cancelMention(target.key)"
              >
                @{{ target.name }}
                <SvgIcon :src="icon.common.close" size="12" aria-hidden="true" />
              </BButton>
            </div>
          </div>

          <div v-if="replyTarget" class="community-composer__reply">
            <div>
              <strong>{{ t('communityChat.replyingTo', { name: authorName(replyTarget) }) }}</strong>
              <span>{{ messageSummary(replyTarget) }}</span>
            </div>
            <BButton size="small" :aria-label="t('communityChat.cancelReply')" @click="cancelReply">
              <SvgIcon :src="icon.common.close" size="14" aria-hidden="true" />
            </BButton>
          </div>

          <div v-if="bookmark.isMobile && expressionPanelOpen" class="community-composer__auxiliary">
            <ChatExpressionPanel
              v-model:tab="expressionPanelTab"
              :recent="recentEmojis"
              @select-emoji="insertEmoji"
              @select-sticker="sendCustomSticker"
            />
          </div>

          <BPopover
            v-model:open="mentionSuggestionsOpen"
            class="community-composer__mention-anchor"
            trigger="manual"
            placement="top-left"
            overlay-class-name="community-composer__mention-popover"
          >
            <BInput
              ref="composerInput"
              v-model:value="draft"
              class="community-composer__input"
              type="textarea"
              :rows="1"
              :maxlength="2000"
              :submit-on-enter="true"
              :placeholder="
                t(bookmark.isMobile ? 'communityChat.messagePlaceholderMobile' : 'communityChat.messagePlaceholder')
              "
              :disabled="sending"
              @input="handleComposerTextInput"
              @keydown="handleComposerKeydown"
              @select="handleComposerSelectionChange"
              @compositionstart="handleComposerCompositionStart"
              @compositionend="handleComposerCompositionEnd"
              @focus="handleComposerFocus"
              @focusout="handleComposerFocusOut"
              @enter="sendMessage"
            />
            <template #content>
              <ChatMentionSuggestions
                embedded
                :query="mentionSearchQuery"
                :items="mentionSearchItems"
                :loading="mentionSearchLoading"
                :active-index="mentionSearchActiveIndex"
                :show-everyone="showMentionEveryoneSuggestion"
                @select="selectMentionSuggestion"
                @select-everyone="selectMentionEveryone"
              />
            </template>
          </BPopover>

          <div class="community-composer__toolbar">
            <div class="community-composer__tools">
              <BPopover
                v-if="!bookmark.isMobile"
                v-model:open="expressionPanelOpen"
                trigger="click"
                placement="top-left"
                overlay-class-name="community-composer__expression-popover"
                @open-change="handleExpressionPanelOpenChange"
              >
                <BButton
                  class="community-composer__attach"
                  :class="{ 'is-active': expressionPanelOpen }"
                  :aria-label="t('communityChat.expression.action')"
                  :title="t('communityChat.expression.action')"
                >
                  <SvgIcon :src="icon.noteDetail.toolbar.emoji" size="19" aria-hidden="true" />
                </BButton>
                <template #content>
                  <ChatExpressionPanel
                    v-model:tab="expressionPanelTab"
                    :recent="recentEmojis"
                    @select-emoji="insertEmoji"
                    @select-sticker="sendCustomSticker"
                  />
                </template>
              </BPopover>
              <BButton
                v-else
                class="community-composer__attach"
                :class="{ 'is-active': expressionPanelOpen }"
                :aria-label="t('communityChat.expression.action')"
                :title="t('communityChat.expression.action')"
                @click="toggleMobileExpressionPanel"
              >
                <SvgIcon :src="icon.noteDetail.toolbar.emoji" size="19" aria-hidden="true" />
              </BButton>

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
              <span class="community-composer__upload-hint">{{
                t(bookmark.isMobile ? 'communityChat.image.inputHintMobile' : 'communityChat.image.inputHint')
              }}</span>
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
    @manage-profile="openProfileFromSettings"
    @notification-saved="handleNotificationSettingsSaved"
  />
  <ChatOnlineMembersModal
    v-if="canViewOnlinePresence"
    v-model:visible="onlineMembersVisible"
    :online-count="onlineCount || 0"
    :snapshot="onlineMembersSnapshot"
    :loading="onlineMembersLoading"
    :error="onlineMembersError"
    @retry="loadOnlineMembers"
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
    :authenticated="props.access.authenticated"
    :is-own="profileIsOwn"
    :own-profile="ownProfile"
    :own-loading="ownProfileLoading"
    :own-error="ownProfileError"
    :saving="ownProfileSaving"
    :all-achievements="profileAllAchievements"
    :all-achievements-loading="profileAllAchievementsLoading"
    :all-achievements-error="profileAllAchievementsError"
    :session-key="profileSessionKey"
    @retry="retryAuthorProfile"
    @request-own="requestOwnProfile"
    @load-all-achievements="requestAllProfileAchievements"
    @save="saveCommunityProfile"
    @block="blockProfileMember"
    @report="reportProfileMember"
    @login="loginFromProfile"
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
    ensureCommunityChatIdentity,
    getCommunityChatBlocks,
    getCommunityChatMessages,
    getCommunityChatPinnedMessage,
    markCommunityChatRoomRead,
    pinCommunityChatMessage,
    recallCommunityChatMessage,
    reportCommunityChatMessage,
    searchCommunityChatMembers,
    sendCommunityChatMessage,
    toggleCommunityChatMessageLike,
    unblockCommunityChatUser,
    unpinCommunityChatMessage,
    uploadCommunityChatImage,
    type CommunityChatAccess,
    type CommunityChatBlockItem,
    type CommunityChatImage,
    type CommunityChatMessage,
    type CommunityChatMemberSearchItem,
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
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
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
  import ChatOnlineMembersModal from '@/components/communityChat/ChatOnlineMembersModal.vue';
  import ChatExpressionPanel from '@/components/communityChat/ChatExpressionPanel.vue';
  import ChatMentionSuggestions from '@/components/communityChat/ChatMentionSuggestions.vue';
  import { useGrowth } from '@/composables/useGrowth';
  import { useCommunityChatProfile, type CommunityChatProfileUpdateInput } from '@/composables/useCommunityChatProfile';
  import {
    useCommunityChatSocket,
    type CommunityChatOnlineMembersSnapshot,
    type CommunityChatRealtimeEvent,
  } from '@/composables/useCommunityChatSocket';
  import { useCommunityChatUnread } from '@/composables/useCommunityChatUnread';
  import { getCommunityChatDraft, rememberCommunityChatDraft } from '@/composables/useCommunityChatDraftMemory';
  import { useCommunityChatEmojiRecent } from '@/composables/useCommunityChatEmojiRecent';
  import icon from '@/config/icon';
  import { frameVariant } from '@/config/growthFrames';
  import { bookmarkStore, useUserStore } from '@/store';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
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
  const { growth: currentGrowth } = useGrowth();
  const {
    visible: profileVisible,
    targetMessage: profileTargetMessage,
    sessionKey: profileSessionKey,
    profile: authorProfile,
    profileLoading,
    profileError,
    ownProfile,
    ownLoading: ownProfileLoading,
    ownError: ownProfileError,
    ownSaving: ownProfileSaving,
    allAchievements: profileAllAchievements,
    allAchievementsLoading: profileAllAchievementsLoading,
    allAchievementsError: profileAllAchievementsError,
    isOwn: profileIsOwn,
    openForMessage: openCommunityProfileForMessage,
    openOwnProfile: openOwnCommunityProfile,
    closeProfile: closeCommunityProfile,
    loadPublicProfile,
    loadOwnProfile,
    loadAllAchievements: loadProfileAchievements,
    saveOwnProfile,
  } = useCommunityChatProfile();
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
  type MentionTarget = {
    key: string;
    name: string;
    communityId?: string;
    userPublicId?: string;
    messagePublicId?: string;
  };
  const mentionTargets = ref<MentionTarget[]>([]);
  const mentionEveryone = ref(false);
  const expressionPanelOpen = ref(false);
  const expressionPanelTab = ref<'emoji' | 'custom'>('emoji');
  const mentionSuggestionsOpen = ref(false);
  const mentionSearchQuery = ref('');
  const mentionSearchItems = ref<CommunityChatMemberSearchItem[]>([]);
  const mentionSearchLoading = ref(false);
  const mentionSearchActiveIndex = ref(-1);
  const mentionQueryRange = ref<{ start: number; end: number } | null>(null);
  const composerIsComposing = ref(false);
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
  const readyMessageImageIds = ref(new Set<string>());
  const priorityMessageImageIds = ref(new Set<string>());
  const messageImagePreloads = new Map<string, HTMLImageElement>();
  const imageUploadsInFlight = ref(0);
  const isComposerDragActive = ref(false);
  const removingImageIds = ref(new Set<string>());
  const blocksVisible = ref(false);
  const settingsVisible = ref(false);
  const onlineMembersVisible = ref(false);
  const onlineMembersLoading = ref(false);
  const onlineMembersError = ref(false);
  const onlineMembersSnapshot = ref<CommunityChatOnlineMembersSnapshot | null>(null);
  const blocksLoading = ref(false);
  const blockedUsers = ref<CommunityChatBlockItem[]>([]);
  const unblockingId = ref('');
  const messageActionBusyId = ref('');
  const mobileMessageActionsVisible = ref(false);
  const mobileMessageActionTarget = ref<CommunityChatMessage | null>(null);
  const mobileMessageActionImageTarget = ref<CommunityChatImage | null>(null);
  const recallClock = ref(Date.now());
  const pendingNewMessageCount = ref(0);
  const distanceFromBottom = ref(0);
  const focusedMessagePublicId = ref('');
  const transientFocusedMessagePublicId = ref('');
  const hasNewerThanFocus = ref(false);
  const pinnedMessage = ref<CommunityChatMessage | null>(null);
  const pinActionBusy = ref(false);
  let loadGeneration = 0;
  let pinnedLoadGeneration = 0;
  let pollTimer: number | undefined;
  let markReadTimer: number | undefined;
  let messageScrollFrame: number | undefined;
  let messageNavigationGeneration = 0;
  let programmaticMessageNavigationActive = false;
  let avatarMotionResumeTimer: number | undefined;
  let messageListResizeObserver: ResizeObserver | null = null;
  let keyboardAnchorFrame: number | undefined;
  let keyboardAnchorCloseTimer: number | undefined;
  let composerKeyboardAnchorActive = false;
  let composerKeyboardAnchorAtBottom = false;
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
  let mentionSearchTimer: number | undefined;
  let mentionSearchGeneration = 0;
  const INITIAL_MESSAGE_PAGE_SIZE = 30;
  const COMPOSER_INPUT_MIN_HEIGHT = 42;
  const COMPOSER_INPUT_MAX_HEIGHT = 112;
  const AVATAR_LONG_PRESS_MS = 480;
  const AVATAR_LONG_PRESS_MOVE_TOLERANCE = 10;
  const AVATAR_MOTION_SCROLL_IDLE_MS = 140;
  const INITIAL_IMAGE_PRIORITY_MESSAGE_COUNT = 8;
  const INITIAL_IMAGE_PRIORITY_MAX = 4;
  const BACK_TO_BOTTOM_DESKTOP_THRESHOLD = 128;
  const BACK_TO_BOTTOM_MOBILE_THRESHOLD = 320;

  const currentRoom = computed(() => props.rooms.find((room) => room.slug === selectedRoomSlug.value) || null);
  const pendingNewMessageDisplayCount = computed(() =>
    pendingNewMessageCount.value > 99 ? '99+' : pendingNewMessageCount.value,
  );
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
  const showBackToBottom = computed(() => {
    const threshold = bookmark.isMobile ? BACK_TO_BOTTOM_MOBILE_THRESHOLD : BACK_TO_BOTTOM_DESKTOP_THRESHOLD;
    return !initialLoading.value && chatMessages.value.length > 0 && distanceFromBottom.value > threshold;
  });
  const draftLength = computed(() => Array.from(String(draft.value || '')).length);
  const focusMessageFromRoute = computed(() => {
    const value = route.query.message;
    return typeof value === 'string' ? value.trim() : '';
  });
  const canSend = computed(() => {
    const hasPayload = Boolean(String(draft.value || '').trim()) || pendingImages.value.length > 0;
    return hasPayload && draftLength.value <= 2000 && !sending.value && imageUploadsInFlight.value === 0;
  });
  const canMentionEveryone = computed(() => currentUser.role === 'root');
  const canViewOnlinePresence = computed(() => currentUser.role === 'root');
  const showMentionEveryoneSuggestion = computed(() => {
    if (!canMentionEveryone.value || mentionEveryone.value) return false;
    const query = String(mentionSearchQuery.value || '')
      .trim()
      .toLocaleLowerCase();
    if (!query) return true;
    return ['所有人', '全体', 'everyone', 'all'].some((label) => label.toLocaleLowerCase().includes(query));
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
  const emojiRecentOwnerId = computed(() => currentUser.id || 'visitor');
  const { recent: recentEmojis, remember: rememberEmoji } = useCommunityChatEmojiRecent(emojiRecentOwnerId);
  const {
    onlineCount,
    requestOnlineMembers,
    status: realtimeStatus,
  } = useCommunityChatSocket({
    enabled: realtimeEnabled,
    roomSlug: selectedRoomSlug,
    identityKey: realtimeIdentityKey,
    onEvent: handleRealtimeEvent,
    onSynchronized: handleRealtimeSynchronized,
  });
  async function loadOnlineMembers() {
    if (currentUser.role !== 'root' || onlineMembersLoading.value) return;
    onlineMembersLoading.value = true;
    onlineMembersError.value = false;
    try {
      onlineMembersSnapshot.value = await requestOnlineMembers();
      void recordOperation({ module: '公共聊天室', operation: 'Root 查看当前在线成员' });
    } catch {
      onlineMembersError.value = true;
    } finally {
      onlineMembersLoading.value = false;
    }
  }

  function openOnlineMembers() {
    if (currentUser.role !== 'root') return;
    onlineMembersVisible.value = true;
    onlineMembersSnapshot.value = null;
    void loadOnlineMembers();
  }
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

  function messageHasText(chatMessage: CommunityChatMessage) {
    return Boolean(
      chatMessage.mentionEveryone || chatMessage.mentions?.length || String(chatMessage.content || '').trim(),
    );
  }

  function messageHasImages(chatMessage: CommunityChatMessage) {
    return Boolean(chatMessage.images?.length);
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
    if (chatMessage.messageKind === 'sticker' || chatMessage.sticker) return t('communityChat.sticker.messageFallback');
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
          .trim() ||
        (reply.hasSticker
          ? t('communityChat.sticker.messageFallback')
          : reply.hasImages
            ? t('communityChat.image.messageFallback')
            : t('communityChat.replyUnavailable'))
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
    const currentFrameId = currentGrowth.value?.equippedFrame;
    const frameId = chatMessage.isOwn && currentFrameId !== undefined ? currentFrameId : chatMessage.author.frameId;
    return frameVariant(frameId) ? frameId : null;
  }

  function authorRoleLabel(role: CommunityChatMessage['author']['role']) {
    return t(`communityChat.authorRole.${role}`);
  }

  function openAuthorProfile(chatMessage: CommunityChatMessage) {
    openCommunityProfileForMessage(chatMessage);
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

  function retryAuthorProfile() {
    if (profileIsOwn.value && !profileTargetMessage.value) {
      void loadOwnProfile({ force: true }).catch(() => undefined);
      return;
    }
    void loadPublicProfile({ force: true }).catch(() => undefined);
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
          disabled: mentionTargets.value.some(
            (target) =>
              (chatMessage.author.userPublicId && target.userPublicId === chatMessage.author.userPublicId) ||
              target.messagePublicId === chatMessage.publicId,
          ),
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
      distanceFromBottom.value = 0;
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

  function messageImageLayoutStyle(imageItem: CommunityChatImage) {
    const width = positiveImageDimension(imageItem.width);
    const height = positiveImageDimension(imageItem.height);
    const paddingPercent = width && height ? Math.min(400, Math.max(20, (height / width) * 100)) : 75;
    return {
      aspectRatio: messageImageAspectRatio(imageItem),
      '--community-message-image-padding': `${paddingPercent}%`,
    };
  }

  function isMessageImageReady(publicId: string) {
    return readyMessageImageIds.value.has(publicId);
  }

  function isMessageImagePriority(publicId: string) {
    return priorityMessageImageIds.value.has(publicId);
  }

  function markMessageImageReady(publicId: string) {
    if (!publicId || readyMessageImageIds.value.has(publicId)) return;
    const next = new Set(readyMessageImageIds.value);
    next.add(publicId);
    readyMessageImageIds.value = next;
  }

  async function decodeMessageImage(image: HTMLImageElement, publicId: string) {
    try {
      if (typeof image.decode === 'function') await image.decode();
    } catch {
      // 个别旧 WebView 会在图片已经可绘制时拒绝 decode；load 事件仍可作为可靠回退。
    }
    if (!isUnmounted) markMessageImageReady(publicId);
  }

  function releaseMessageImagePreloads({ clearReady = false } = {}) {
    for (const image of messageImagePreloads.values()) {
      image.onload = null;
      image.onerror = null;
    }
    messageImagePreloads.clear();
    priorityMessageImageIds.value = new Set();
    if (clearReady) readyMessageImageIds.value = new Set();
  }

  function initialViewportImages(messages: CommunityChatMessage[], focusPublicId = '') {
    if (!messages.length) return [];
    const focusIndex = focusPublicId ? messages.findIndex((chatMessage) => chatMessage.publicId === focusPublicId) : -1;
    const anchorIndex = focusIndex >= 0 ? focusIndex : messages.length - 1;
    const messageIndexes: number[] = [];
    if (focusIndex >= 0) {
      for (let distance = 0; messageIndexes.length < INITIAL_IMAGE_PRIORITY_MESSAGE_COUNT; distance += 1) {
        const nextIndexes = distance === 0 ? [anchorIndex] : [anchorIndex + distance, anchorIndex - distance];
        const validIndexes = nextIndexes.filter((index) => index >= 0 && index < messages.length);
        if (!validIndexes.length && anchorIndex + distance >= messages.length && anchorIndex - distance < 0) break;
        messageIndexes.push(...validIndexes.slice(0, INITIAL_IMAGE_PRIORITY_MESSAGE_COUNT - messageIndexes.length));
      }
    } else {
      for (
        let index = anchorIndex;
        index >= 0 && messageIndexes.length < INITIAL_IMAGE_PRIORITY_MESSAGE_COUNT;
        index -= 1
      ) {
        messageIndexes.push(index);
      }
    }
    const candidates: CommunityChatImage[] = [];
    for (const index of messageIndexes) {
      for (const imageItem of messages[index]?.images || []) {
        if (!imageItem.publicId || !imageItem.url) continue;
        if (candidates.some((candidate) => candidate.publicId === imageItem.publicId)) continue;
        candidates.push(imageItem);
        if (candidates.length >= INITIAL_IMAGE_PRIORITY_MAX) return candidates;
      }
    }
    return candidates;
  }

  function prewarmInitialViewportImages(messages: CommunityChatMessage[], focusPublicId = '') {
    const candidates = initialViewportImages(messages, focusPublicId);
    priorityMessageImageIds.value = new Set(candidates.map((imageItem) => imageItem.publicId));
    for (const imageItem of candidates) {
      if (readyMessageImageIds.value.has(imageItem.publicId) || messageImagePreloads.has(imageItem.publicId)) continue;
      const image = new window.Image();
      image.decoding = 'async';
      image.fetchPriority = 'high';
      image.onload = () => {
        void decodeMessageImage(image, imageItem.publicId).finally(() => {
          messageImagePreloads.delete(imageItem.publicId);
        });
      };
      image.onerror = () => {
        messageImagePreloads.delete(imageItem.publicId);
      };
      messageImagePreloads.set(imageItem.publicId, image);
      image.src = imageItem.url;
    }
  }

  function handleMessageImageLoaded(event: Event, imageItem: CommunityChatImage) {
    const image = event.currentTarget;
    if (image instanceof HTMLImageElement) void decodeMessageImage(image, imageItem.publicId);
    else markMessageImageReady(imageItem.publicId);
  }

  function handleMessageImageError(imageItem: CommunityChatImage) {
    messageImagePreloads.delete(imageItem.publicId);
  }

  function nextAnimationFrame() {
    return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }

  function cancelProgrammaticMessageNavigation() {
    messageNavigationGeneration += 1;
    programmaticMessageNavigationActive = false;
  }

  async function scrollToFocusedMessage(publicId: string) {
    if (!publicId) return;
    const navigationGeneration = ++messageNavigationGeneration;
    programmaticMessageNavigationActive = true;
    try {
      await nextTick();
      if (!messageListEl.value) await nextAnimationFrame();
      const container = messageListEl.value;
      if (!container || navigationGeneration !== messageNavigationGeneration) return;
      const findTarget = () =>
        Array.from(container.querySelectorAll<HTMLElement>('[data-message-public-id]')).find(
          (element) => element.getAttribute('data-message-public-id') === publicId,
        );
      let target = findTarget();
      if (!target) {
        await nextAnimationFrame();
        if (navigationGeneration !== messageNavigationGeneration) return;
        target = findTarget();
      }
      if (!target) {
        await scrollToBottom();
        return;
      }

      const locateTarget = (element: HTMLElement) => {
        const centerOffset = Math.max(12, container.clientHeight / 2 - element.offsetHeight / 2);
        // 聊天消息定位属于导航而非浏览动画。长距离 smooth 在部分 Android WebView 中会被懒加载图片
        // 或滚动锚点中断，表现为需要连续点击；直接定位配合实色高亮能保证一次点击到位。
        scrollIntoContainer(container, element, centerOffset, 'auto');
        lastMessageScrollTop = container.scrollTop;
      };

      locateTarget(target);
      // 保持两帧“程序化定位中”，让 scroll 事件先完成，避免被误判为用户上滑而触发历史分页。
      await nextAnimationFrame();
      if (navigationGeneration !== messageNavigationGeneration) return;
      await nextAnimationFrame();
    } finally {
      if (navigationGeneration === messageNavigationGeneration) programmaticMessageNavigationActive = false;
    }
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
    distanceFromBottom.value = Math.max(0, scrollHeight - scrollTop - clientHeight);
    const scrollingUp = scrollTop < lastMessageScrollTop;
    lastMessageScrollTop = scrollTop;
    if (
      !programmaticMessageNavigationActive &&
      scrollingUp &&
      scrollTop <= 160 &&
      hasMore.value &&
      !olderLoading.value
    ) {
      void loadOlder();
    }
    if (distanceFromBottom.value >= 96) return;
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
    cancelProgrammaticMessageNavigation();
    // 用户开始主动浏览历史后，键盘或容器后续的尺寸变化不得再把列表抢回底部。
    composerKeyboardAnchorAtBottom = false;
    pauseAvatarMotionForScroll();
  }

  function writeBottomAnchor() {
    keyboardAnchorFrame = undefined;
    if (!composerKeyboardAnchorActive || !composerKeyboardAnchorAtBottom || !messageListEl.value) return;
    messageListEl.value.scrollTop = messageListEl.value.scrollHeight;
    lastMessageScrollTop = messageListEl.value.scrollTop;
    distanceFromBottom.value = 0;
  }

  function scheduleBottomAnchor() {
    if (!composerKeyboardAnchorActive || !composerKeyboardAnchorAtBottom || keyboardAnchorFrame !== undefined) return;
    keyboardAnchorFrame = window.requestAnimationFrame(writeBottomAnchor);
  }

  function handleComposerFocus() {
    if (bookmark.isMobile) {
      expressionPanelOpen.value = false;
    }
    if (keyboardAnchorCloseTimer !== undefined) {
      window.clearTimeout(keyboardAnchorCloseTimer);
      keyboardAnchorCloseTimer = undefined;
    }
    composerKeyboardAnchorAtBottom = isNearBottom();
    composerKeyboardAnchorActive = true;
    scheduleBottomAnchor();
  }

  function handleComposerFocusOut() {
    // 失焦早于系统键盘的收起动画；短暂保留锚点，让关闭过程也不会在底部留下空白。
    if (keyboardAnchorCloseTimer !== undefined) window.clearTimeout(keyboardAnchorCloseTimer);
    keyboardAnchorCloseTimer = window.setTimeout(() => {
      keyboardAnchorCloseTimer = undefined;
      composerKeyboardAnchorActive = false;
      composerKeyboardAnchorAtBottom = false;
      if (keyboardAnchorFrame === undefined) return;
      window.cancelAnimationFrame(keyboardAnchorFrame);
      keyboardAnchorFrame = undefined;
    }, 320);
  }

  function handleDocumentPointerDown(event: PointerEvent) {
    if (!mentionSuggestionsOpen.value || !(event.target instanceof Element)) return;
    if (
      event.target.closest('.community-composer__mention-anchor') ||
      event.target.closest('.community-composer__mention-popover')
    ) {
      return;
    }
    closeMentionSuggestions();
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

  async function requestPinnedMessage(roomSlug: string) {
    try {
      const response = await getCommunityChatPinnedMessage(roomSlug);
      const data = response.data as CommunityChatPinnedMessage;
      return data?.message || null;
    } catch {
      return null;
    }
  }

  async function commitPinnedMessage(nextPinnedMessage: CommunityChatMessage | null) {
    const keepBottomAnchored = !initialLoading.value && isNearBottom();
    pinnedMessage.value = nextPinnedMessage;
    // 置顶栏位于滚动容器外，在线新增/取消时会改变 messageList 的可用高度。用户本就在底部时，
    // 同一轮 DOM 更新后补写最终 scrollTop；浏览历史时保持 scrollTop，不抢走当前阅读位置。
    if (keepBottomAnchored) await scrollToBottom();
  }

  async function loadPinnedMessage() {
    const roomSlug = selectedRoomSlug.value;
    if (!roomSlug) return;
    const generation = ++pinnedLoadGeneration;
    const nextPinnedMessage = await requestPinnedMessage(roomSlug);
    if (generation !== pinnedLoadGeneration || roomSlug !== selectedRoomSlug.value) return;
    await commitPinnedMessage(nextPinnedMessage);
  }

  async function loadInitial({ ignoreFocus = false } = {}) {
    const roomSlug = selectedRoomSlug.value;
    if (!roomSlug) return;
    const generation = ++loadGeneration;
    const pinnedGeneration = ++pinnedLoadGeneration;
    const requestedFocus = ignoreFocus ? '' : focusMessageFromRoute.value;
    initialLoading.value = true;
    loadError.value = false;
    pendingNewMessageCount.value = 0;
    try {
      const messagePagePromise = (async () => {
        try {
          return await getCommunityChatMessages(
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
          return getCommunityChatMessages(roomSlug, { limit: INITIAL_MESSAGE_PAGE_SIZE });
        }
      })();
      // 首屏消息与置顶栏都会改变消息区结构，两条请求并行，但在同一轮提交后再撤掉覆盖整个消息流的骨架。
      // 这样等待时间取较慢请求而不是相加，也不会出现“先贴底 → 插入置顶栏 → 图片回调再次贴底”的三段跳动。
      const [response, nextPinnedMessage] = await Promise.all([messagePagePromise, requestPinnedMessage(roomSlug)]);
      if (generation !== loadGeneration || roomSlug !== selectedRoomSlug.value) return;
      const page = response.data as CommunityChatMessagePage;
      prewarmInitialViewportImages(page.items || [], page.focusPublicId || '');
      chatMessages.value = page.items || [];
      if (pinnedGeneration === pinnedLoadGeneration) pinnedMessage.value = nextPinnedMessage;
      lastAuthorityRefreshAt = Date.now();
      hasMore.value = Boolean(page.hasMore);
      nextBefore.value = page.nextBefore || null;
      focusedMessagePublicId.value = page.focusPublicId || '';
      hasNewerThanFocus.value = Boolean(page.focusPublicId && page.hasNewer);
      // 真实消息始终在覆盖层后完成挂载和定位；覆盖层只在最终 scrollTop 已写入后移除，首帧即最终布局。
      if (focusedMessagePublicId.value) await scrollToFocusedMessage(focusedMessagePublicId.value);
      else await scrollToBottom();
      initialLoading.value = false;
      void markLatestRead();
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
      prewarmInitialViewportImages(page.items || [], page.focusPublicId || '');
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
      if (pinnedMessage.value?.publicId === chatMessage.publicId) await commitPinnedMessage(null);
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
    const userPublicId = String(chatMessage.author.userPublicId || '').trim();
    const existing = mentionTargets.value.some(
      (target) =>
        (userPublicId && target.userPublicId === userPublicId) || target.messagePublicId === chatMessage.publicId,
    );
    if (existing) {
      void nextTick(() => composerInput.value?.focus());
      return;
    }
    if (mentionTargets.value.length >= 5) {
      message.warning(t('communityChat.mentionLimit'));
      return;
    }
    const name = authorName(chatMessage);
    mentionEveryone.value = false;
    mentionTargets.value = [
      ...mentionTargets.value,
      userPublicId
        ? {
            key: `user:${userPublicId}`,
            userPublicId,
            communityId: chatMessage.author.communityId || '',
            name,
          }
        : { key: `message:${chatMessage.publicId}`, messagePublicId: chatMessage.publicId, name },
    ];
    pendingClientRequestId.value = null;
    closeMentionSuggestions();
    void nextTick(() => composerInput.value?.focus());
  }

  function cancelMention(key: string) {
    mentionTargets.value = mentionTargets.value.filter((item) => item.key !== key);
    pendingClientRequestId.value = null;
  }

  function cancelMentionEveryone() {
    mentionEveryone.value = false;
    pendingClientRequestId.value = null;
  }

  function closeMentionSuggestions() {
    if (mentionSearchTimer !== undefined) window.clearTimeout(mentionSearchTimer);
    mentionSearchTimer = undefined;
    mentionSearchGeneration += 1;
    mentionSuggestionsOpen.value = false;
    mentionSearchLoading.value = false;
    mentionSearchItems.value = [];
    mentionSearchActiveIndex.value = -1;
    mentionQueryRange.value = null;
  }

  async function loadMentionSuggestions(query: string) {
    const generation = ++mentionSearchGeneration;
    mentionSearchLoading.value = true;
    try {
      const response = await searchCommunityChatMembers({
        roomSlug: selectedRoomSlug.value,
        q: query,
        limit: 10,
      });
      if (generation !== mentionSearchGeneration || !mentionSuggestionsOpen.value) return;
      const selectedUserIds = new Set(
        mentionTargets.value.map((target) => target.userPublicId).filter((value): value is string => Boolean(value)),
      );
      mentionSearchItems.value = (Array.isArray(response.data?.items) ? response.data.items : []).filter(
        (item: CommunityChatMemberSearchItem) => !selectedUserIds.has(item.userPublicId),
      );
      mentionSearchActiveIndex.value = -1;
    } catch {
      if (generation === mentionSearchGeneration) mentionSearchItems.value = [];
    } finally {
      if (generation === mentionSearchGeneration) mentionSearchLoading.value = false;
    }
  }

  function scheduleMentionSuggestions(query: string) {
    if (mentionSearchTimer !== undefined) window.clearTimeout(mentionSearchTimer);
    // 浮层首帧就进入加载态，避免防抖结束后才插入 loading 导致高度和定位二次跳变。
    // 同时立即废弃上一请求；否则旧响应可能在新查询的 220ms 防抖窗口内短暂回填。
    mentionSearchGeneration += 1;
    mentionSearchLoading.value = true;
    mentionSearchItems.value = [];
    mentionSearchTimer = window.setTimeout(() => {
      mentionSearchTimer = undefined;
      void loadMentionSuggestions(query);
    }, 220);
  }

  function detectMentionQuery() {
    if (
      composerIsComposing.value ||
      !canPostCurrentRoom.value ||
      mentionEveryone.value ||
      mentionTargets.value.length >= 5
    ) {
      closeMentionSuggestions();
      return;
    }
    const textarea = composerInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
    if (!textarea) return;
    const caret = textarea.selectionStart ?? draft.value.length;
    const prefix = String(draft.value || '').slice(0, caret);
    const match = /(^|[\s([{（【，。！？])@([^\s@]{0,32})$/u.exec(prefix);
    if (!match) {
      closeMentionSuggestions();
      return;
    }
    const query = match[2] || '';
    const start = caret - Array.from(`@${query}`).join('').length;
    const sameQuery = mentionSuggestionsOpen.value && mentionSearchQuery.value === query;
    mentionQueryRange.value = { start, end: caret };
    mentionSearchQuery.value = query;
    mentionSuggestionsOpen.value = true;
    expressionPanelOpen.value = false;
    if (!sameQuery) {
      mentionSearchActiveIndex.value = -1;
      scheduleMentionSuggestions(query);
    }
  }

  function handleComposerTextInput() {
    void nextTick(detectMentionQuery);
  }

  function handleComposerSelectionChange() {
    void nextTick(detectMentionQuery);
  }

  function handleComposerCompositionStart() {
    composerIsComposing.value = true;
  }

  function handleComposerCompositionEnd() {
    composerIsComposing.value = false;
    void nextTick(detectMentionQuery);
  }

  function handleComposerKeydown(event: KeyboardEvent) {
    if (!mentionSuggestionsOpen.value) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeMentionSuggestions();
      return;
    }
    const suggestionCount = mentionSearchItems.value.length + (showMentionEveryoneSuggestion.value ? 1 : 0);
    if (!suggestionCount) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (mentionSearchActiveIndex.value < 0) {
        mentionSearchActiveIndex.value = event.key === 'ArrowDown' ? 0 : suggestionCount - 1;
      } else {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        mentionSearchActiveIndex.value =
          (mentionSearchActiveIndex.value + direction + suggestionCount) % suggestionCount;
      }
      return;
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault();
      const selectedIndex = mentionSearchActiveIndex.value < 0 ? 0 : mentionSearchActiveIndex.value;
      if (showMentionEveryoneSuggestion.value && selectedIndex === 0) {
        selectMentionEveryone();
        return;
      }
      const itemIndex = selectedIndex - (showMentionEveryoneSuggestion.value ? 1 : 0);
      selectMentionSuggestion(mentionSearchItems.value[itemIndex]);
    }
  }

  function selectMentionEveryone() {
    const range = mentionQueryRange.value;
    if (!canMentionEveryone.value || !range) return;
    const before = draft.value.slice(0, range.start);
    const after = draft.value.slice(range.end);
    draft.value = `${before}${after}`;
    mentionTargets.value = [];
    mentionEveryone.value = true;
    pendingClientRequestId.value = null;
    closeMentionSuggestions();
    void nextTick(() => {
      const textarea = composerInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
      composerInput.value?.focus();
      textarea?.setSelectionRange(range.start, range.start);
    });
  }

  function selectMentionSuggestion(item: CommunityChatMemberSearchItem | undefined) {
    const range = mentionQueryRange.value;
    if (!item?.userPublicId || !range) return;
    if (mentionTargets.value.some((target) => target.userPublicId === item.userPublicId)) {
      closeMentionSuggestions();
      return;
    }
    const before = draft.value.slice(0, range.start);
    const after = draft.value.slice(range.end);
    draft.value = `${before}${after}`;
    mentionEveryone.value = false;
    mentionTargets.value = [
      ...mentionTargets.value,
      {
        key: `user:${item.userPublicId}`,
        userPublicId: item.userPublicId,
        communityId: item.communityId,
        name: item.displayName,
      },
    ];
    pendingClientRequestId.value = null;
    closeMentionSuggestions();
    void nextTick(() => {
      const textarea = composerInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
      composerInput.value?.focus();
      textarea?.setSelectionRange(range.start, range.start);
    });
  }

  function handleExpressionPanelOpenChange(open: boolean) {
    if (!open) return;
    closeMentionSuggestions();
  }

  function toggleMobileExpressionPanel() {
    const willOpen = !expressionPanelOpen.value;
    expressionPanelOpen.value = willOpen;
    closeMentionSuggestions();
    if (willOpen) {
      const textarea = composerInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
      textarea?.blur();
      void nextTick(scrollToBottom);
    } else {
      void nextTick(() => composerInput.value?.focus());
    }
  }

  function insertEmoji(emoji: string) {
    const textarea = composerInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
    const start = textarea?.selectionStart ?? draft.value.length;
    const end = textarea?.selectionEnd ?? start;
    draft.value = `${draft.value.slice(0, start)}${emoji}${draft.value.slice(end)}`;
    rememberEmoji(emoji);
    pendingClientRequestId.value = null;
    expressionPanelOpen.value = false;
    closeMentionSuggestions();
    void nextTick(() => {
      const nextCaret = start + emoji.length;
      const nextTextarea = composerInput.value?.inputEl as HTMLTextAreaElement | null | undefined;
      nextTextarea?.setSelectionRange(nextCaret, nextCaret);
      composerInput.value?.focus();
    });
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

  function openProfileFromSettings() {
    openOwnCommunityProfile();
  }

  function requestOwnProfile() {
    void loadOwnProfile().catch(() => undefined);
  }

  function requestAllProfileAchievements() {
    void loadProfileAchievements().catch(() => undefined);
  }

  function communityProfileErrorCode(error: any) {
    return String(error?.response?.data?.data?.code || error?.data?.code || error?.code || '');
  }

  async function saveCommunityProfile(input: CommunityChatProfileUpdateInput) {
    try {
      const saved = await saveOwnProfile(input);
      if (!saved) return;
      void recordOperation({ module: '公共聊天室', operation: '更新社区名片公开资料' });
      message.success(t('communityChat.profile.saveSuccess'));
    } catch (error: any) {
      if (communityProfileErrorCode(error) === 'COMMUNITY_PROFILE_CONFLICT') {
        message.warning(t('communityChat.profile.saveConflict'));
        await loadOwnProfile({ force: true }).catch(() => undefined);
        return;
      }
      const apiMessage = error?.response?.data?.msg || error?.data?.msg;
      message.error(apiMessage || t('communityChat.profile.saveFailed'));
    }
  }

  async function closeProfileThen(next: () => void | Promise<void>) {
    await closeCurrentMobileOverlayThen(() => {
      profileVisible.value = false;
    }, next);
  }

  function blockProfileMember() {
    const target = profileTargetMessage.value;
    if (!target) return;
    void closeProfileThen(() => confirmBlock(target));
  }

  function reportProfileMember() {
    const target = profileTargetMessage.value;
    if (!target) return;
    void closeProfileThen(() => {
      reportTarget.value = target;
      reportVisible.value = true;
    });
  }

  function loginFromProfile() {
    void closeProfileThen(openAuthentication);
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
      await commitPinnedMessage(response.data.message as CommunityChatMessage);
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
      if (pinnedMessage.value?.publicId === chatMessage.publicId) await commitPinnedMessage(null);
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

  function buildOptimisticMessage(input: {
    publicId: string;
    content: string;
    images: CommunityChatImage[];
    replyTarget: CommunityChatMessage | null;
    mentions: string[];
    mentionEveryone?: boolean;
    messageKind?: 'text' | 'sticker';
    sticker?: CommunityChatMessage['sticker'];
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
      messageKind: input.messageKind || 'text',
      stickerSource: input.sticker?.source || null,
      stickerKey: input.sticker?.key || null,
      sticker: input.sticker || null,
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
      mentions: [...input.mentions],
      mentionEveryone: Boolean(input.mentionEveryone),
      mentionItems: [],
      likeCount: 0,
      likedByMe: false,
      likePreview: [],
      deliveryState: 'sending',
      author: {
        name: currentUser.alias || currentUser.userName || previousAuthor?.name || t('communityChat.memberFallback'),
        userPublicId: previousAuthor?.userPublicId,
        communityId: previousAuthor?.communityId,
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
            hasSticker: input.replyTarget.messageKind === 'sticker' || Boolean(input.replyTarget.sticker),
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
    // 新客户端以不可变用户公有 UUID 发送；仅对尚未回填身份的旧消息保留历史消息 ID 兼容字段。
    const mentionUserPublicIds = mentionTargets.value
      .map((target) => target.userPublicId)
      .filter((value): value is string => Boolean(value));
    const mentionMessagePublicIds = mentionTargets.value
      .map((target) => target.messagePublicId)
      .filter((value): value is string => Boolean(value));
    const optimisticPublicId = `pending-${clientRequestId}`;
    const draftSnapshot = draft.value;
    const replySnapshot = replyTarget.value;
    const mentionSnapshot = [...mentionTargets.value];
    const mentionEveryoneSnapshot = mentionEveryone.value;
    const imageSnapshot = pendingImages.value.map((imageItem) => ({ ...imageItem }));
    const optimisticMessage = buildOptimisticMessage({
      publicId: optimisticPublicId,
      content,
      images: imageSnapshot,
      replyTarget: replySnapshot,
      mentions: mentionSnapshot.map((target) => target.name),
      mentionEveryone: mentionEveryoneSnapshot,
    });
    sending.value = true;
    chatMessages.value = [...chatMessages.value, optimisticMessage];
    draft.value = '';
    replyTarget.value = null;
    mentionTargets.value = [];
    mentionEveryone.value = false;
    pendingImages.value = [];
    await scrollToBottom();
    try {
      const payload = {
        clientRequestId,
        content,
        ...(replySnapshot ? { replyToPublicId: replySnapshot.publicId } : {}),
        ...(mentionUserPublicIds.length ? { mentionUserPublicIds } : {}),
        ...(mentionMessagePublicIds.length ? { mentionMessagePublicIds } : {}),
        ...(mentionEveryoneSnapshot ? { mentionEveryone: true } : {}),
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
        mentionEveryone.value = mentionEveryoneSnapshot;
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

  async function sendCustomSticker(stickerPublicId: string) {
    const roomSlug = selectedRoomSlug.value;
    if (!roomSlug || !canPostCurrentRoom.value || sending.value || !stickerPublicId) return;
    const clientRequestId = createCommunityChatClientRequestId();
    const optimisticPublicId = `pending-${clientRequestId}`;
    const replySnapshot = replyTarget.value;
    const sticker = {
      source: 'custom' as const,
      key: stickerPublicId,
      url: `/api/community-chat/stickers/${encodeURIComponent(stickerPublicId)}/content`,
    };
    const optimisticMessage = buildOptimisticMessage({
      publicId: optimisticPublicId,
      content: '',
      images: [],
      replyTarget: replySnapshot,
      mentions: [],
      messageKind: 'sticker',
      sticker,
    });
    sending.value = true;
    replyTarget.value = null;
    expressionPanelOpen.value = false;
    chatMessages.value = [...chatMessages.value, optimisticMessage];
    await scrollToBottom();
    try {
      const response = await sendCommunityChatMessage(roomSlug, {
        clientRequestId,
        content: '',
        messageKind: 'sticker',
        stickerSource: 'custom',
        stickerKey: stickerPublicId,
        ...(replySnapshot ? { replyToPublicId: replySnapshot.publicId } : {}),
      });
      const sentMessage = response.data?.message as CommunityChatMessage | undefined;
      if (!sentMessage) throw new Error('COMMUNITY_CHAT_SEND_RESPONSE_INVALID');
      chatMessages.value = chatMessages.value.filter((item) => item.publicId !== optimisticPublicId);
      if (roomSlug === selectedRoomSlug.value) mergeLatest([sentMessage]);
      await scrollToBottom();
      void markLatestRead();
    } catch (error: any) {
      chatMessages.value = chatMessages.value.filter((item) => item.publicId !== optimisticPublicId);
      if (roomSlug === selectedRoomSlug.value) replyTarget.value = replySnapshot;
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

  watch(realtimeIdentityKey, (nextIdentity, previousIdentity) => {
    if (!previousIdentity || nextIdentity === previousIdentity) return;
    rememberCommunityChatDraft(previousIdentity, selectedRoomSlug.value, draft.value);
    draft.value = getCommunityChatDraft(nextIdentity, selectedRoomSlug.value);
    mentionTargets.value = [];
    mentionEveryone.value = false;
    expressionPanelOpen.value = false;
    closeMentionSuggestions();
    closeCommunityProfile({ reset: true, clearIdentityCache: true });
  });

  watch(
    selectedRoomSlug,
    (nextRoomSlug, previousRoomSlug) => {
      if (previousRoomSlug) rememberCommunityChatDraft(realtimeIdentityKey.value, previousRoomSlug, draft.value);
      resetComposerDragState();
      releasePendingImages();
      chatMessages.value = [];
      hasMore.value = false;
      nextBefore.value = null;
      loadError.value = false;
      replyTarget.value = null;
      mentionTargets.value = [];
      mentionEveryone.value = false;
      expressionPanelOpen.value = false;
      closeMentionSuggestions();
      draft.value = getCommunityChatDraft(realtimeIdentityKey.value, nextRoomSlug);
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
      releaseMessageImagePreloads({ clearReady: true });
      closeCommunityProfile({ reset: true });
      pendingNewMessageCount.value = 0;
      distanceFromBottom.value = 0;
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
    },
    { immediate: true },
  );

  watch(
    [
      draft,
      () => replyTarget.value?.publicId,
      () => mentionTargets.value.map((target) => target.key).join('|'),
      mentionEveryone,
      () => pendingImages.value.map((imageItem) => imageItem.publicId).join('|'),
    ],
    () => {
      if (!sending.value) pendingClientRequestId.value = null;
    },
  );

  watch(draft, (value) => {
    rememberCommunityChatDraft(realtimeIdentityKey.value, selectedRoomSlug.value, value);
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
    if (props.access.authenticated && props.access.canEnter) {
      void ensureCommunityChatIdentity().catch(() => undefined);
    }
    pollTimer = window.setInterval(refreshLatest, 8000);
    recallClockTimer = window.setInterval(() => {
      recallClock.value = Date.now();
    }, 5000);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    window.addEventListener('resize', syncComposerInputHeight);
    window.visualViewport?.addEventListener('resize', scheduleBottomAnchor);
    const ResizeObserverConstructor = globalThis.ResizeObserver;
    if (bookmark.isMobile && typeof ResizeObserverConstructor === 'function' && messageListEl.value) {
      messageListResizeObserver = new ResizeObserverConstructor(scheduleBottomAnchor);
      messageListResizeObserver.observe(messageListEl.value);
    }
    void nextTick(syncComposerInputHeight);
  });

  onBeforeUnmount(() => {
    isUnmounted = true;
    rememberCommunityChatDraft(realtimeIdentityKey.value, selectedRoomSlug.value, draft.value);
    cancelAvatarLongPress();
    clearAvatarClickSuppression();
    resetComposerDragState();
    closeMentionSuggestions();
    loadGeneration += 1;
    pinnedLoadGeneration += 1;
    closeCommunityProfile({ reset: true });
    if (pollTimer !== undefined) window.clearInterval(pollTimer);
    if (recallClockTimer !== undefined) window.clearInterval(recallClockTimer);
    if (markReadTimer !== undefined) window.clearTimeout(markReadTimer);
    if (messageScrollFrame !== undefined) window.cancelAnimationFrame(messageScrollFrame);
    if (keyboardAnchorFrame !== undefined) window.cancelAnimationFrame(keyboardAnchorFrame);
    if (keyboardAnchorCloseTimer !== undefined) window.clearTimeout(keyboardAnchorCloseTimer);
    cancelProgrammaticMessageNavigation();
    if (avatarMotionResumeTimer !== undefined) window.clearTimeout(avatarMotionResumeTimer);
    if (transientFocusTimer !== undefined) window.clearTimeout(transientFocusTimer);
    messageListEl.value?.classList.remove('is-actively-scrolling');
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    window.removeEventListener('resize', syncComposerInputHeight);
    window.visualViewport?.removeEventListener('resize', scheduleBottomAnchor);
    messageListResizeObserver?.disconnect();
    messageListResizeObserver = null;
    mobileMessageActionTarget.value = null;
    mobileMessageActionImageTarget.value = null;
    imageViewerVisible.value = false;
    imageViewerTracksChatSequence.value = false;
    imageViewerImages.value = [];
    releaseMessageImagePreloads({ clearReady: true });
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

  .community-conversation-header__title-line {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .community-conversation-header__title strong,
  .community-conversation-header__title small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .community-conversation-header__title strong {
    min-width: 0;
    flex: 0 1 auto;
    color: var(--text-color);
    font-size: 15px;
  }

  .community-conversation-header__online {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
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

  .community-message-list__new--unread {
    border-color: var(--primary-color) !important;
    color: var(--primary-contrast-color, #fff);
    background: var(--primary-color) !important;
    box-shadow: 0 8px 20px rgb(0 0 0 / 12%);
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
    position: absolute;
    inset: 0;
    z-index: 3;
    align-content: start;
    padding: 18px clamp(14px, 3vw, 32px) 22px;
    box-sizing: border-box;
    display: grid;
    gap: 18px;
    overflow: hidden;
    background: var(--card-background);
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
    min-width: 0;
    max-width: 100%;
    justify-self: start;
    display: block;
  }

  .community-message.is-own .community-message__payload {
    justify-self: end;
  }

  .community-message__surface {
    width: fit-content;
    min-width: 0;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
  }

  .community-message.is-own .community-message__surface {
    align-items: flex-end;
  }

  .community-message__primary {
    width: fit-content;
    min-width: 0;
    max-width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .community-message.is-own .community-message__primary {
    flex-direction: row-reverse;
  }

  .community-message__meta {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
    color: var(--desc-color);
    font-size: 10px;
  }

  .community-message__meta strong,
  .community-message__author-name {
    color: var(--text-color);
    font-size: 11px;
  }

  .community-message__author-name {
    width: auto;
    height: auto;
    min-height: 20px;
    padding: 0;
    line-height: 20px;
    font-weight: 700;
    background: transparent;
  }

  .community-message__author-name:hover {
    color: var(--primary-color);
    background: transparent;
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
  .community-message.is-recalled .community-message__images,
  .community-message.is-recalled .community-message__sticker {
    opacity: 0.76;
  }

  .community-message__sticker {
    width: min(176px, 48vw);
    min-height: 72px;
    padding: 6px;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    color: var(--desc-color);
    background: var(--card-background);
    font-size: 11px;
  }

  .community-message__sticker img {
    width: 100%;
    max-height: 176px;
    display: block;
    object-fit: contain;
  }

  .community-message__sticker.has-image {
    min-height: 0;
    padding: 0;
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .community-message.is-own .community-message__sticker:not(.has-image) {
    border-color: var(--primary-color);
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

  .community-message__mentions {
    display: inline;
    margin-inline-end: 5px;
  }

  .community-message__mention {
    margin-inline-end: 5px;
    color: var(--primary-color);
    font-weight: 600;
    white-space: nowrap;
  }

  .community-message.is-own .community-message__content {
    border-color: var(--primary-color);
    border-radius: 15px 5px 15px 15px;
    color: #fff;
    background: var(--primary-color);
  }

  .community-message.is-own .community-message__mention {
    color: #fff;
    text-decoration: underline;
    text-decoration-color: rgba(255, 255, 255, 0.68);
    text-underline-offset: 2px;
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
    position: relative;
    isolation: isolate;
    display: block !important;
    width: 100%;
    min-width: 0;
    height: auto !important;
    min-height: 92px;
    max-height: 280px;
    line-height: 0 !important;
    padding: 0 !important;
    overflow: hidden;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 12px !important;
    background: var(--workspace-panel-bg-color) !important;
  }

  .community-message__image-sizer {
    display: block;
    width: 100%;
    padding-top: var(--community-message-image-padding, 75%);
    pointer-events: none;
  }

  .community-message__image-placeholder {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: grid;
    place-items: center;
    color: var(--text-color-secondary);
    background: var(--workspace-panel-bg-color);
    pointer-events: none;
  }

  .community-message__image img {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    min-height: 92px;
    max-height: 280px;
    display: block;
    object-fit: cover;
    opacity: 0;
    transition: opacity 0.12s ease-out;
  }

  .community-message__image.is-ready img {
    opacity: 1;
  }

  .community-message__images.has-1 .community-message__image img {
    object-fit: contain;
  }

  .community-message__actions {
    position: relative;
    top: 4px;
    z-index: 1;
    flex: 0 0 auto;
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

  .community-composer__auxiliary {
    min-width: 0;
    padding: 8px 8px 0;
    display: flex;
  }

  .community-composer__auxiliary > * {
    width: 100%;
  }

  .community-composer__auxiliary {
    padding-bottom: 8px;
    border-bottom: 1px solid var(--surface-border-color);
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
    width: 100%;
    min-width: 0;
    display: block;
  }

  .community-composer__mention-anchor {
    width: 100%;
    min-width: 0;
    display: flex;
  }

  :global(.community-composer__mention-popover) {
    width: 360px;
    max-width: calc(100% - 16px);
    overflow: hidden;
  }

  :global(.community-composer__expression-popover) {
    width: 360px;
    max-width: calc(100% - 16px);
    box-sizing: border-box;
    overflow: hidden;
  }

  :global(.community-composer__mention-popover.b-popover-fade-enter-from),
  :global(.community-composer__mention-popover.b-popover-fade-leave-to) {
    transform: none;
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
  .community-composer__attach:focus-visible,
  .community-composer__attach.is-active {
    border-color: var(--surface-border-color) !important;
    color: var(--primary-color);
    background: var(--workspace-panel-bg-color) !important;
  }

  .community-composer__attach.is-active {
    border-color: var(--primary-color) !important;
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

    .community-conversation-header__title-line {
      gap: 6px;
    }

    .community-conversation-header__online {
      font-size: 10px;
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

    .community-message__sticker {
      width: min(148px, 46vw);
      min-height: 64px;
    }

    .community-message__sticker img {
      max-height: 148px;
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

    .community-composer__auxiliary {
      padding-inline: 6px;
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
