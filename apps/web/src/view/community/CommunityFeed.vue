<template>
  <main ref="surface" v-auto-scrollbar class="community-feed community-surface" @scroll.passive="rememberScroll">
    <CommunityLayout class="feed-container" :class="{ 'is-post-detail': mode === 'detail' }">
      <template #navigation><CommunityNavigation active="feed" /></template>
      <div class="feed-main-column" :class="{ 'is-management': mode === 'manage' }">
        <p v-if="!caps.feedEnabled && !loading && !error">{{ t('community.feed.closed') }}</p>
        <p v-if="preview || (caps.feedEnabled && !caps.writesEnabled)" class="feed-readonly" role="status">{{
          t(preview ? 'community.feed.previewReadonly' : 'community.feed.readonly')
        }}</p>
        <div v-if="error && !dialog" class="feed-error" role="alert"
          >{{ t(loadFailed ? 'community.feed.loadError' : 'community.feed.error') }}
          <BButton @click="load">{{ t('community.feed.retry') }}</BButton></div
        >
        <template v-if="mode === 'feed' && (caps.feedEnabled || loading)">
          <div class="feed-heading"
            ><div
              ><h1 :class="{ 'community-page-title': !activeTopic }">{{
                activeTopic ? '# ' + topicName : t('community.feed.title')
              }}</h1
              ><p>{{ activeTopic ? topicDescription : t('community.feed.intro') }}</p></div
            ><div class="feed-heading-actions"
              ><BButton v-if="user.role === 'root'" @click="topicManager = true">{{
                t('community.feed.topicActivities')
              }}</BButton
              ><BButton
                v-if="canWrite"
                type="primary"
                @click="
                  editing = null;
                  editor = true;
                "
                >{{ t(activeTopic ? 'community.feed.joinTopic' : 'community.feed.newPost') }}</BButton
              ></div
            ></div
          >
          <section v-if="activeTopic" class="topic-introduction">
            <img
              v-if="communityTopicCover(activeTopic.slug)"
              class="topic-hero-image"
              :src="communityTopicCover(activeTopic.slug)"
              alt=""
              width="2172"
              height="724"
            />
            <BButton class="topic-back" @click="go('/community/feed')">← {{ t('community.feed.topicBack') }}</BButton>
            <span>{{ t('community.feed.topicPostCount', { count: activeTopic.postCount || 0 }) }}</span>
            <CommunityTaskReward
              v-if="activeTopic.reward"
              :key="activeTopic.slug"
              :topic="activeTopic"
              @claimed="load"
              @participate="
                editing = null;
                editor = true;
              "
            />
            <div v-else-if="activeTopic.postTask" class="topic-task-state" role="status">
              <strong>{{ t('community.feed.postTask') }}</strong>
              <span>{{ t('community.feed.task_' + (activeTopic.participation || 'not_started')) }}</span>
              <BButton
                v-if="activeTopic.participationPostId"
                @click="go('/community/posts/' + activeTopic.participationPostId)"
                >{{ t('community.feed.taskViewPost') }} →</BButton
              >
            </div>
          </section>
          <section class="feed-filters" :aria-label="t('community.feed.filters')">
            <div class="feed-toolbar">
              <BTabs
                class="feed-stream-tabs"
                variant="line"
                v-model:active-tab="filters.stream"
                :options="streamOptions"
                @change="filterChanged"
              />
              <div class="feed-search">
                <BInput
                  v-model:value="filters.q"
                  :placeholder="t('community.feed.search')"
                  :aria-label="t('community.feed.search')"
                  @keydown.enter.prevent="filterChanged"
                />
                <BButton @click="filterChanged">{{ t('common.search') }}</BButton>
                <BButton v-if="filters.q.trim()" class="feed-clear" @click="clearSearch">{{
                  t('community.feed.clearSearch')
                }}</BButton>
              </div>
            </div>
            <div class="feed-mobile-topics" :aria-label="t('community.feed.topicFilter')">
              <BButton :aria-pressed="!filters.topic" @click="chooseTopic('')">{{
                t('community.feed.allTopics')
              }}</BButton>
              <BButton
                v-for="topic in topicOptions"
                :key="topic.value"
                :aria-pressed="filters.topic === topic.value"
                @click="chooseTopic(filters.topic === topic.value ? '' : topic.value)"
                ># {{ topic.label }}</BButton
              >
            </div>
          </section>
          <CommunityOfficialCampaign
            @participate="participateInTopic"
            @claimed="load"
            v-if="!hasFilters && filters.stream === 'latest'"
            :topics="topicRows"
          />
          <BLoading class="feed-loading-region" :loading="loading && !loadingMore" :title="t('community.feed.loading')">
            <div v-if="newAvailable" class="feed-new-notice" role="status">
              <BButton class="feed-new" @click="filterChanged()">{{ t('community.feed.newAvailable') }}</BButton>
            </div>
            <BVirtualList
              ref="feedList"
              :items="posts"
              item-key="publicId"
              dynamic-height
              :item-height="280"
              scroll-mode="ancestor"
              :overscan="3"
              :loading="loading"
              :show-loading-indicator="loadingMore"
              :paused="loading && !loadingMore"
              :has-more="Boolean(cursor) && !moreFailed"
              :loading-text="t('community.feed.loading')"
              @load-more="loadMore"
            >
              <template #default="{ item }"
                ><CommunityPostCard
                  :post="item"
                  :can-like="canWrite"
                  :like-pending="liking.has(item.publicId)"
                  :like-failed="likeErrors.has(item.publicId)"
                  @like="togglePostLike"
              /></template>
            </BVirtualList>
            <section v-if="!loading && !error && !posts.length" class="feed-empty" aria-live="polite">
              <h2>{{
                t(
                  hasFilters
                    ? 'community.feed.noResults'
                    : filters.stream === 'following'
                      ? 'community.feed.followingEmpty'
                      : 'community.feed.emptyTitle',
                )
              }}</h2>
              <p>{{
                t(
                  hasFilters
                    ? 'community.feed.noResultsHint'
                    : filters.stream === 'following'
                      ? 'community.feed.followingEmptyHint'
                      : canWrite
                        ? 'community.feed.emptyWriteHint'
                        : 'community.feed.emptyReadHint',
                )
              }}</p>
              <BButton v-if="hasFilters" @click="resetFilters">{{ t('community.feed.clearFilters') }}</BButton>
              <BButton
                v-else-if="filters.stream === 'following'"
                @click="
                  filters.stream = 'latest';
                  filterChanged();
                "
                >{{ t('community.feed.explore') }}</BButton
              >
              <BButton
                v-else-if="canWrite"
                type="primary"
                @click="
                  editing = null;
                  editor = true;
                "
                >{{ t('community.feed.firstPost') }}</BButton
              >
              <BButton v-else @click="go('/community/chat')">{{ t('community.feed.visitChat') }}</BButton>
            </section>
            <div v-if="moreFailed" role="alert" class="feed-error">
              {{ t('community.feed.loadError') }} <BButton @click="loadMore">{{ t('community.feed.retry') }}</BButton>
            </div>
          </BLoading>
        </template>
        <template v-if="mode === 'detail'">
          <BButton class="post-back" @click="backFromPost"
            ><SvgIcon :src="icon.arrow_left" size="16" />{{ t('common.back') }}</BButton
          >
          <BLoading class="feed-loading-region" :loading="loading && !loadingMore" :title="t('community.feed.loading')">
            <CommunityPostDiscussion
              v-if="detail"
              :key="detail.publicId"
              :post="detail"
              :edit-pending="editPending"
              @edit="editDetailPost"
              :action-pending="busy"
              @delete="deletePost(detail)"
              :can-write="canWrite"
              :actions-target="detailActionsTarget"
              :scroll-container="surface"
              :overlay-open="Boolean(dialog || editor)"
              @refresh="load"
              @withdrawn="handleDetailRemoved"
              @update-post="Object.assign(detail!, $event)"
              @report="openReport"
            />
            <p v-else-if="!loading">{{ t('community.feed.unavailable') }}</p>
          </BLoading>
        </template>
        <template v-if="mode === 'manage' || mode === 'moderation'">
          <div class="management-heading">
            <div
              ><h1 class="community-page-title">{{
                t('community.feed.' + (mode === 'manage' ? 'manage' : 'moderation'))
              }}</h1>
              <p v-if="mode === 'manage'">{{ t('community.feed.manageHint') }}</p></div
            >
            <BButton
              v-if="mode === 'manage' && canWrite"
              type="primary"
              @click="
                editing = null;
                editor = true;
              "
              >{{ t('community.feed.newPost') }}</BButton
            >
          </div>
          <BButton
            v-if="mode === 'moderation' && user.role === 'root'"
            class="topic-management-entry"
            @click="topicManager = true"
            >{{ t('community.feed.manageTopics') }}</BButton
          >
          <BTabs
            class="management-tabs"
            variant="line"
            v-model:active-tab="managementTab"
            :options="managementOptions"
            @change="load"
          />
          <p v-if="mode === 'moderation'">{{ t('community.feed.reviewHint') }}</p>
          <BLoading class="feed-loading-region" :loading="loading && !loadingMore" :title="t('community.feed.loading')">
            <BVirtualList
              :key="mode + managementTab"
              :items="managed"
              item-key="publicId"
              dynamic-height
              :item-height="180"
              scroll-mode="ancestor"
              :overscan="3"
              :loading="loading"
              :show-loading-indicator="loadingMore"
              :paused="loading && !loadingMore"
              :has-more="Boolean(cursor) && !error"
              :loading-text="t('community.feed.loading')"
              @load-more="loadMore"
              ><template #default="{ item }"
                ><article
                  class="feed-post managed-post"
                  :class="{ 'is-clickable': canOpenManagedItem(item) }"
                  @click="
                    canOpenManagedItem(item) &&
                    shouldOpenCommunityPost($event) &&
                    router.push({
                      path: '/community/posts/' + (item.postId || item.publicId),
                      query: managedItemQuery(item),
                    })
                  "
                >
                  <div class="managed-post-heading"
                    ><span
                      class="feed-status"
                      :data-status="
                        managementTab === 'results'
                          ? item.action
                          : item.displayStatus || item.status || item.revisionStatus
                      "
                      >{{
                        t(
                          'community.feed.' +
                            (managementTab === 'results'
                              ? item.action
                              : item.displayStatus || item.status || item.revisionStatus || 'published'),
                        )
                      }}</span
                    >
                    <h2
                      ><RouterLink
                        v-if="canOpenManagedItem(item)"
                        :to="{
                          path: '/community/posts/' + (item.postId || item.publicId),
                          query: managedItemQuery(item),
                        }"
                        >{{
                          item.title || t('community.feed.' + (item.action || item.kind || item.status))
                        }}</RouterLink
                      ><template v-else>{{
                        item.title || t('community.feed.' + (item.action || item.kind || item.status))
                      }}</template></h2
                    ></div
                  ><p class="feed-body">{{ item.body || item.reason }}</p
                  ><time v-if="managementTab === 'results' && item.createdAt" :datetime="item.createdAt">{{
                    new Date(item.createdAt).toLocaleString()
                  }}</time
                  ><CommunityPostImages :images="item.images" /><CommunityPostResources :resources="item.resources" /><p
                    v-if="item.detail"
                    >{{ item.detail }}</p
                  ><p v-if="item.reason && item.body">{{ item.reason }}</p>
                  <p v-if="item.appealStatus"
                    >{{ t('community.feed.appeal') }}: {{ t('community.feed.' + item.appealStatus) }}
                    {{ item.appealResult }}</p
                  >
                  <div class="feed-actions">
                    <template v-if="mode === 'manage' && managementTab === 'posts'"
                      ><BButton
                        v-if="canWrite && !['removed', 'deleted'].includes(item.status)"
                        @click="
                          editing = item;
                          editor = true;
                        "
                        >{{ t('community.feed.edit') }}</BButton
                      ><BButton v-if="item.status !== 'withdrawn'" :disabled="busy" @click="withdraw(item)">{{
                        t('community.feed.withdraw')
                      }}</BButton
                      ><BButton class="delete-post-action" :disabled="busy" @click="deletePost(item)">{{
                        t('community.feed.deletePost')
                      }}</BButton></template
                    >
                    <BButton
                      v-if="mode === 'manage' && managementTab === 'comments' && item.status !== 'withdrawn'"
                      :disabled="busy"
                      @click="withdraw(item)"
                      >{{ t('community.feed.withdraw') }}</BButton
                    >
                    <BButton
                      v-if="
                        mode === 'manage' &&
                        managementTab === 'results' &&
                        ['reject', 'remove', 'lock'].includes(item.action) &&
                        !item.appealId
                      "
                      @click="
                        dialog = { kind: 'appeal', item };
                        dialogBody = '';
                      "
                      >{{ t('community.feed.appeal') }}</BButton
                    >
                    <template v-if="mode === 'moderation'"
                      ><BButton
                        v-for="action in moderationActions(item)"
                        :key="action"
                        :disabled="busy"
                        @click="
                          dialog = { kind: 'moderate', item, action };
                          dialogBody = '';
                        "
                        >{{ t('community.feed.' + action) }}</BButton
                      ></template
                    >
                  </div></article
                ></template
              ></BVirtualList
            ><section v-if="!loading && !error && !managed.length" class="feed-empty management-empty">
              <h2>{{ t('community.feed.' + (mode === 'moderation' ? 'reviewEmpty' : managementTab + 'Empty')) }}</h2>
              <p>{{ t('community.feed.' + (mode === 'moderation' ? 'reviewHint' : managementTab + 'EmptyHint')) }}</p>
              <BButton v-if="mode === 'manage' && managementTab !== 'results'" @click="go('/community/feed')"
                >{{ t('community.feed.back') }} →</BButton
              >
            </section>
          </BLoading>
        </template>
        <template v-if="mode === 'profile'">
          <h1>{{ t('community.feed.profile') }}</h1
          ><BLoading class="feed-loading-region" :loading="loading && !loadingMore" :title="t('community.feed.loading')"
            ><template v-if="profile"
              ><div class="public-profile-card"
                ><ChatUserProfileContent
                  :profile="displayProfile"
                  :community-actions="false"
                  :chat-actions="false"
                  :all-achievements="profile.allAchievements"
                  :authenticated="authenticated"
                  :is-own="false"
                  @navigate="go"
                >
                  <template #identityDescription>
                    <p class="profile-inline-bio">{{ profile.bio || t('communityChat.profile.bioEmpty') }}</p>
                    <small v-if="profile.communityTenureLabel" class="profile-inline-tenure">{{
                      profile.communityTenureLabel
                    }}</small>
                    <div class="profile-statistics"
                      ><template v-for="kind in ['following', 'followers']" :key="kind">
                        <BButton
                          v-if="kind === 'followers' ? profile.followerCount : profile.followingCount"
                          @click="
                            relationKind = kind;
                            relationsOpen = true;
                          "
                        >
                          <strong>{{ kind === 'followers' ? profile.followerCount : profile.followingCount }}</strong
                          >{{ t('community.feed.' + kind) }}
                        </BButton>
                        <span v-else><strong>0</strong>{{ t('community.feed.' + kind) }}</span>
                      </template></div
                    >
                  </template>
                  <template #identityActions
                    ><div class="profile-summary-actions">
                      <BButton type="text" v-if="profile.isOwn && !preview" @click="accountEditorOpen = true">{{
                        t('community.feed.editProfile')
                      }}</BButton>
                      <div class="feed-actions profile-relationship-actions" v-if="authenticated && !profile.isOwn"
                        ><BButton
                          type="primary"
                          :disabled="busy || !canWrite"
                          @click="relationship('follow', !profile.following)"
                          >{{ t('community.feed.' + (profile.following ? 'unfollow' : 'follow')) }}</BButton
                        ><BActionMenu
                          :disabled="busy"
                          placement="bottom-right"
                          :items="[
                            { key: 'mute', label: t('community.feed.' + (profile.muted ? 'unmute' : 'mute')) },
                            { key: 'block', label: t('community.feed.block'), danger: true },
                          ]"
                          @select="(key) => (key === 'mute' ? relationship('mute', !profile.muted) : block())"
                          ><BButton :disabled="busy" :aria-label="t('community.feed.contentMore')" class="profile-more"
                            >···</BButton
                          >
                        </BActionMenu></div
                      >
                    </div></template
                  >
                  <template v-if="profile.isOwn && !preview" #achievementActions>
                    <BButton type="text" class="profile-section-edit" @click="profileEditSection = 'achievements'">{{
                      t('community.feed.editAchievements')
                    }}</BButton>
                  </template>
                </ChatUserProfileContent></div
              >
              <section v-if="profile.isOwn || profile.featuredPostItems?.length" class="public-featured-posts">
                <header class="profile-section-heading"
                  ><h2>{{ t('community.feed.featuredTitle') }}</h2>
                  <BButton
                    v-if="profile.isOwn && !preview"
                    type="text"
                    class="profile-section-edit"
                    @click="profileEditSection = 'posts'"
                    >{{ t('community.feed.editFeaturedPosts') }}</BButton
                  >
                </header>
                <p v-if="!profile.featuredPostItems?.length" class="profile-featured-hint">{{
                  t('community.feed.featuredHint')
                }}</p>
                <CommunityPostCard
                  v-for="post in profile.featuredPostItems"
                  :key="post.publicId"
                  :post="post"
                  featured
                  :can-like="canWrite"
                  :like-pending="liking.has(post.publicId)"
                  :like-failed="likeErrors.has(post.publicId)"
                  @like="togglePostLike"
              /></section>
              <BVirtualList
                class="profile-post-list"
                :items="profileRegularPosts"
                item-key="publicId"
                dynamic-height
                :item-height="280"
                scroll-mode="ancestor"
                :overscan="3"
                :loading="loadingMore"
                :paused="loading && !loadingMore"
                :has-more="Boolean(cursor) && !moreFailed"
                :loading-text="t('community.feed.loading')"
                @load-more="loadMore"
                ><template #default="{ item }"
                  ><CommunityPostCard
                    :post="item"
                    :can-like="canWrite"
                    :like-pending="liking.has(item.publicId)"
                    :like-failed="likeErrors.has(item.publicId)"
                    @like="togglePostLike" /></template
              ></BVirtualList>
              <p v-if="moreFailed" role="alert"
                >{{ t('community.feed.loadError') }}
                <BButton @click="loadMore">{{ t('community.feed.retry') }}</BButton>
              </p>
            </template></BLoading
          >
        </template>
      </div>
      <CommunityRelations
        v-if="relationsOpen"
        :user-public-id="String(profile?.userPublicId || route.params.id)"
        :kind="relationKind"
        @close="relationsOpen = false"
      />
      <CommunityTopicManager
        :writable="caps.writesEnabled"
        v-if="topicManager"
        @close="topicManager = false"
        @saved="load"
      />
      <MyInfo v-model:visible="accountEditorOpen" />
      <BModal
        v-if="profileEditSection"
        :visible="true"
        width="min(680px, 94vw)"
        :title="
          t(profileEditSection === 'posts' ? 'community.feed.featuredTitle' : 'communityChat.profile.featuredLabel')
        "
        :close-disabled="Boolean(profileEditor?.saving)"
        :show-footer="false"
        :mask-closable="false"
        @close="closeProfileEditor"
      >
        <CommunityProfileEditor ref="profileEditor" :section="profileEditSection" @saved="refreshPublicProfile" />
      </BModal>
      <CommunityPostEditor
        v-if="editor"
        :key="editing?.publicId || 'new'"
        :post="editing"
        :initial-topic="editorTopic || filters.topic"
        :images-enabled="caps.imagesEnabled"
        :resources-enabled="caps.resourcesEnabled"
        :topics="topicOptions"
        :profile-enabled="options.enabled"
        @close="editor = false"
        @saved="handlePostSaved"
      />
      <template v-if="['feed', 'detail'].includes(mode)" #aside>
        <div v-if="mode === 'detail'" ref="detailActionsTarget" class="post-detail-tools-target" />
        <CommunityContext v-else :topics="topicOptions" :selected-topic="filters.topic" @topic="chooseTopic" />
      </template>
      <BModal
        v-if="dialog"
        :visible="true"
        :title="
          t(
            'community.feed.' +
              (dialog.kind === 'report'
                ? 'report'
                : dialog.kind === 'appeal'
                  ? 'appeal'
                  : dialog.action === 'approve'
                    ? 'approvalReason'
                    : 'reviewReason'),
          )
        "
        width="min(480px, 92vw)"
        :show-footer="false"
        :mask-closable="false"
        :close-disabled="busy"
        @close="dialog = null"
      >
        <div class="community-action-dialog">
          <p v-if="error" class="feed-error" role="alert">{{ t('community.feed.error') }}</p>
          <p v-if="dialog.kind === 'report'">{{ t('community.feed.reportHint') }}</p>

          <BSelect
            v-if="dialog.kind === 'report'"
            v-model:value="reportReason"
            :options="reportOptions"
            :aria-label="t('community.feed.reason')"
          />
          <BInput
            :aria-label="t('community.feed.detail')"
            v-model:value="dialogBody"
            type="textarea"
            :rows="4"
            :disabled="busy"
          /><small>{{ Array.from(dialogBody).length }} / 500</small>
          <div class="feed-actions"
            ><BButton
              type="primary"
              :loading="busy"
              :disabled="
                Array.from(dialogBody.trim()).length > 500 ||
                (dialog.kind !== 'report' && dialog.action !== 'approve' && !dialogBody.trim())
              "
              @click="submitDialog"
              >{{ t('community.feed.confirm') }}</BButton
            ><BButton :disabled="busy" @click="dialog = null">{{ t('community.feed.cancel') }}</BButton></div
          >
        </div>
      </BModal>
    </CommunityLayout>
    <BBackToTop v-if="['feed', 'detail'].includes(mode)" :target="surface" :label="t('community.feed.backToTop')" />
  </main>
</template>
<script setup lang="ts">
  import { useCommunityPreviewImages } from '@/composables/useCommunityPreviewImages';
  import { useCommunityPreview } from '@/composables/useCommunityPreview';
  const { preview } = useCommunityPreview();
  import { communityTopicCover } from '@/config/communityTopicCovers';
  import CommunityRelations from '@/components/community/CommunityRelations.vue';
  import CommunityTopicManager from '@/components/community/CommunityTopicManager.vue';
  import type { FeedTopic } from '@/api/communityFeedApi';
  import BActionMenu from '@/components/base/BasicComponents/BActionMenu.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import CommunityLayout from '@/components/community/CommunityLayout.vue';
  import CommunityContext from '@/components/community/CommunityContext.vue';
  import CommunityNavigation from '@/components/community/CommunityNavigation.vue';
  import CommunityOfficialCampaign from '@/components/community/CommunityOfficialCampaign.vue';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BBackToTop from '@/components/base/BasicComponents/BBackToTop.vue';
  import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
  import { useUserStore } from '@/store';
  import { feedGet, feedOperation, type FeedPost, type FeedPage } from '@/api/communityFeedApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BSelect from '@/components/base/BasicComponents/BSelect.vue';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import MyInfo from '@/components/personCenter/myInfo/MyInfo.vue';
  import CommunityProfileEditor from '@/components/community/CommunityProfileEditor.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import CommunityPostResources from '@/components/community/CommunityPostResources.vue';
  import CommunityTaskReward from '@/components/community/CommunityTaskReward.vue';
  import CommunityPostEditor from '@/components/community/CommunityPostEditor.vue';
  import CommunityPostImages from '@/components/community/CommunityPostImages.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import CommunityPostCard from '@/components/community/CommunityPostCard.vue';
  import CommunityPostDiscussion from '@/components/community/CommunityPostDiscussion.vue';
  import { shouldOpenCommunityPost, hasNewCommunityPost } from '@/utils/communityNavigation';
  import { rememberCommunityLayout } from '@/utils/communityLayoutAvailability';
  import ChatUserProfileContent from '@/components/communityChat/ChatUserProfileContent.vue';

  const { t, locale } = useI18n(),
    route = useRoute(),
    router = useRouter(),
    user = useUserStore();
  const mode = computed(() => String(route.meta.feedMode || 'feed')),
    authenticated = computed(() => Boolean(user.id && user.role !== 'visitor' && !user.adminContext));
  const caps = ref({ feedEnabled: false, writesEnabled: false }),
    canWrite = computed(() => authenticated.value && caps.value.writesEnabled);
  const posts = ref<FeedPost[]>([]),
    detail = ref<FeedPost | null>(null),
    profile = ref<any>(null),
    managed = ref<any[]>([]),
    cursor = ref<string | null>(null),
    topicRows = ref<any[]>([]),
    options = ref<any>({ enabled: true, interests: [], featuredPosts: [], revision: 0 });
  const latestHead = ref('');
  const latestHeadPublishedAt = ref('');
  const filters = reactive({ stream: 'latest', topic: '', q: '' });
  let appliedFilters = { ...filters };
  const feedList = ref<InstanceType<typeof BVirtualList>>();
  const moreFailed = ref(false);
  const hasFilters = computed(() => Boolean(filters.q.trim() || filters.topic));
  const streamOptions = computed(() =>
    ['latest', 'following'].map((key) => ({ key, label: t('community.feed.' + key) })),
  );
  function chooseTopic(topic: string) {
    go(topic ? '/community/topics/' + encodeURIComponent(topic) : '/community/feed');
  }
  function clearSearch() {
    filters.q = '';
    filterChanged();
  }
  function resetFilters() {
    Object.assign(filters, { topic: '', q: '' });
    if (route.params.slug) go('/community/feed');
    else filterChanged();
  }
  const topicManager = ref(false);
  const loadedTopic = ref<FeedTopic | null>(null);
  const activeTopic = computed<FeedTopic | null>(() => {
    const slug = typeof route.params.slug === 'string' ? route.params.slug : '';
    if (!slug) return null;
    if (loadedTopic.value?.slug === slug) return loadedTopic.value;
    return (
      topicRows.value.find((topic) => topic.slug === slug) || {
        slug,
        nameZh: '\u00a0',
        nameEn: '\u00a0',
        descriptionZh: '',
        descriptionEn: '',
        enabled: true,
        officialPinned: false,
        postTask: false,
        sortOrder: 0,
        revision: 0,
      }
    );
  });
  const topicName = computed(() =>
    activeTopic.value ? (locale.value.startsWith('en') ? activeTopic.value.nameEn : activeTopic.value.nameZh) : '',
  );
  const topicDescription = computed(() =>
    activeTopic.value
      ? locale.value.startsWith('en')
        ? activeTopic.value.descriptionEn
        : activeTopic.value.descriptionZh
      : '',
  );
  const topicOptions = computed(() =>
    topicRows.value.map((x) => ({ value: x.slug, label: locale.value.startsWith('en') ? x.nameEn : x.nameZh })),
  );

  const reportOptions = computed(() =>
    ['spam', 'abuse', 'privacy', 'illegal', 'other'].map((x) => ({ value: x, label: t('community.feed.' + x) })),
  );
  const loadingMore = ref(false);
  const loading = ref(false),
    busy = ref(false),
    error = ref(false),
    loadFailed = ref(false),
    editor = ref(false),
    editorTopic = ref(''),
    editing = ref<FeedPost | null>(null),
    managementTab = ref('posts'),
    newAvailable = ref(false),
    surface = ref<HTMLElement | null>(null),
    detailActionsTarget = ref<HTMLElement | null>(null),
    dialog = ref<any>(null),
    dialogBody = ref(''),
    reportReason = ref('other'),
    relationsOpen = ref(false),
    relationKind = ref('followers');
  function participateInTopic(topic: string) {
    if (!canWrite.value) {
      chooseTopic(topic);
      return;
    }
    editorTopic.value = topic;
    editing.value = null;
    editor.value = true;
  }
  watch(editor, (open) => {
    if (!open) editorTopic.value = '';
  });
  const managementOptions = computed(() =>
    (mode.value === 'manage'
      ? ['posts', 'comments', 'results']
      : ['posts', 'publishedPosts', 'comments', 'reports', 'appeals']
    ).map((key) => ({
      key,
      label: t(
        'community.feed.' +
          ({
            posts: mode.value === 'manage' ? 'postsLabel' : 'pendingPosts',
            comments: mode.value === 'manage' ? 'comments' : 'reviewComments',
          }[key] || key),
      ),
    })),
  );
  let generation = 0,
    operation: (() => Promise<any>) | null = null,
    operationKey = '',
    timer: ReturnType<typeof setInterval> | null = null;
  const owner = computed(() => `${user.id}|${user.role}|${user.adminContext?.id || ''}`);
  const scrollKey = () => `community-feed-scroll:${owner.value}:${JSON.stringify(appliedFilters)}`;
  function clearScrollMemory() {
    try {
      const prefix = `community-feed-scroll:${owner.value}:`;
      for (const key of Object.keys(sessionStorage)) if (key.startsWith(prefix)) sessionStorage.removeItem(key);
    } catch {}
  }
  function scrollMemory() {
    try {
      return JSON.parse(sessionStorage.getItem(scrollKey()) || 'null');
    } catch {
      return null;
    }
  }
  let restoringScroll = false;
  function rememberScroll() {
    if (!restoringScroll && mode.value === 'feed' && !loading.value && surface.value)
      try {
        const top = surface.value.getBoundingClientRect().top;
        const card = Array.from(surface.value.querySelectorAll<HTMLElement>('[data-post-id]')).find(
          (el) => el.getBoundingClientRect().bottom > top,
        );
        sessionStorage.setItem(
          scrollKey(),
          JSON.stringify({
            anchor: card?.dataset.postId,
            offset: card ? card.getBoundingClientRect().top - top : 0,
            head: latestHead.value,
            headPublishedAt: latestHeadPublishedAt.value,
          }),
        );
      } catch {}
  }
  onBeforeRouteLeave((to, from) => {
    rememberScroll();
    if (
      !to.path.startsWith('/community/') ||
      (from.meta.feedMode === 'feed' && !to.path.startsWith('/community/posts/'))
    )
      clearScrollMemory();
  });
  onBeforeRouteUpdate(() => rememberScroll());
  function go(path: string) {
    void router.push(path);
  }
  function backFromPost() {
    if (router.options.history.state.back) router.back();
    else if (
      typeof route.query.from === 'string' &&
      route.query.from.startsWith('/community/') &&
      !route.query.from.startsWith('/community/posts/')
    )
      void router.push(route.query.from);
    else if (postOrigin.value) void router.push(postOrigin.value);
    else void router.push('/community/feed');
  }
  function handleDetailRemoved(postId: string) {
    if (mode.value !== 'detail' || route.params.id !== postId) return;
    // 撤回或删除改变了列表，不能沿用只加载旧锚点及更早帖子的阅读恢复范围。
    clearScrollMemory();
    void router.replace('/community/feed');
  }
  const postOrigin = ref('');
  const stopOrigin = router.beforeEach((to, from) => {
    if (to.meta.feedMode === 'feed' && !from.path.startsWith('/community/posts/')) clearScrollMemory();
    if (to.path.startsWith('/community/posts/') && from.path !== to.path) postOrigin.value = from.fullPath;
  });
  const editPending = ref(false);
  async function editDetailPost() {
    const post = detail.value;
    if (!post?.isOwn || post.locked || !canWrite.value || editPending.value) return;
    const current = generation;
    editPending.value = true;
    try {
      const page = await feedGet<FeedPage<FeedPost>>('own/posts', { postId: post.publicId });
      if (current !== generation || detail.value?.publicId !== post.publicId) return;
      const latest = page.items.find((item) => item.publicId === post.publicId);
      if (!latest || latest.locked || ['removed', 'deleted'].includes(latest.status)) {
        error.value = true;
        return;
      }
      editing.value = latest;
      editor.value = true;
    } catch {
      if (current === generation) error.value = true;
    } finally {
      editPending.value = false;
    }
  }
  async function handlePostSaved(result: { status: string }) {
    editor.value = false;
    clearScrollMemory();
    filters.q = '';
    filters.stream = 'latest';
    appliedFilters = { ...filters };
    if (surface.value) surface.value.scrollTop = 0;
    if (result.status === 'published') {
      // A same-route navigation does not run the route watcher. Fetch explicitly.
      if (mode.value === 'feed') await load();
      else await router.push('/community/feed');
    } else if (mode.value === 'manage') await load();
    else await router.push('/community/manage');
  }
  const { imageSource } = useCommunityPreviewImages(() => [profile.value?.avatar]);
  const displayProfile = computed(() =>
    profile.value ? { ...profile.value, avatar: imageSource(profile.value.avatar) || '' } : null,
  );
  const profileRegularPosts = computed(() => {
    const featured = new Set((profile.value?.featuredPostItems || []).map((post: FeedPost) => post.publicId));
    return posts.value.filter((post) => !featured.has(post.publicId));
  });
  function canOpenManagedItem(item: any) {
    if (managementTab.value === 'posts') return Boolean(item.hasPublishedVersion) && item.status === 'published';
    return Boolean(Number(item.canOpen));
  }
  function managedItemQuery(item: any) {
    return {
      from: route.fullPath,
      ...(managementTab.value === 'comments' && item.status === 'published'
        ? { comments: '1', comment: item.replyTo || item.publicId }
        : {}),
    };
  }
  function pagePath() {
    return mode.value === 'manage'
      ? managementTab.value === 'results'
        ? 'own/results'
        : managementTab.value === 'comments'
          ? 'own/comments'
          : 'own/posts'
      : mode.value === 'moderation'
        ? ['posts', 'publishedPosts'].includes(managementTab.value)
          ? 'moderation/posts'
          : 'moderation/queue'
        : 'posts';
  }
  async function readPage(more = false) {
    const current = generation;
    const params: any =
      mode.value === 'feed'
        ? { ...appliedFilters }
        : mode.value === 'profile'
          ? { author: profile.value?.userPublicId || route.params.id }
          : mode.value === 'moderation'
            ? { type: managementTab.value, ...(managementTab.value === 'publishedPosts' ? { scope: 'all' } : {}) }
            : {};
    if (more && cursor.value) params.before = cursor.value;
    else if (mode.value === 'feed' && scrollMemory()?.anchor) params.anchor = scrollMemory().anchor;
    const data = await feedGet<FeedPage<any>>(pagePath(), params);
    if (current !== generation) return;
    if (['manage', 'moderation'].includes(mode.value))
      managed.value = more ? [...managed.value, ...data.items] : data.items;
    else posts.value = more ? [...posts.value, ...data.items] : data.items;
    cursor.value = data.nextCursor;
    if (mode.value === 'feed' && !more) {
      latestHead.value = scrollMemory()?.head || data.items[0]?.publicId || '';
      latestHeadPublishedAt.value = scrollMemory()?.headPublishedAt || data.items[0]?.publishedAt || '';
    }
  }
  async function load() {
    if (
      preview.value &&
      (['manage', 'settings', 'moderation'].includes(mode.value) || (mode.value === 'profile' && !route.params.id))
    ) {
      await router.replace('/community/feed');
      return;
    }
    const current = ++generation;
    newAvailable.value = false;
    filters.topic = typeof route.params.slug === 'string' ? route.params.slug : '';
    appliedFilters = { ...filters };
    moreFailed.value = false;
    loadingMore.value = false;
    const memory = mode.value === 'feed' ? scrollMemory() : null;
    restoringScroll = true;
    loading.value = true;
    error.value = false;
    loadFailed.value = false;
    if (mode.value === 'profile') profile.value = null;
    try {
      const capabilities = await feedGet('feed/capabilities');
      if (current !== generation) return;
      caps.value = capabilities;
      rememberCommunityLayout(owner.value, Boolean(capabilities.feedEnabled));
      const [topics, own] = await Promise.all([
        caps.value.feedEnabled ? feedGet<any[]>('topics') : Promise.resolve([]),
        authenticated.value ? feedGet('profiles/options/me').catch(() => null) : Promise.resolve(null),
      ]);
      if (current !== generation) return;
      topicRows.value = topics;
      if (route.params.slug) {
        const topic = await feedGet<FeedTopic>('topics/' + encodeURIComponent(String(route.params.slug)));
        if (current !== generation) return;
        loadedTopic.value = topic;
      }
      if (own) {
        options.value = own;
      }
      if (mode.value === 'detail') {
        const result = await feedGet<FeedPost>('posts/' + route.params.id);
        if (current === generation) detail.value = result;
      } else if (mode.value === 'profile') {
        const result = await feedGet('profiles/' + (route.params.id || own?.userPublicId));
        if (current !== generation) return;
        profile.value = result;
        posts.value = result.posts.items;
        cursor.value = result.posts.nextCursor;
      } else if (mode.value !== 'feed' || caps.value.feedEnabled) await readPage();
    } catch (failure: any) {
      if (current === generation) {
        const unavailable = mode.value === 'detail' && failure?.code === 'COMMUNITY_CONTENT_UNAVAILABLE';
        error.value = !unavailable;
        loadFailed.value = !unavailable;
        detail.value = null;
        if (['feed', 'profile'].includes(mode.value)) posts.value = [];
      }
    } finally {
      if (current === generation) {
        loading.value = false;
        await nextTick();
        if (current === generation) {
          if (mode.value === 'feed' && surface.value && memory) {
            const index = posts.value.findIndex((post) => post.publicId === memory.anchor);
            if (index >= 0) {
              feedList.value?.scrollToIndex(index, 'start');
              await nextTick();
            }
            const card = Array.from(surface.value.querySelectorAll<HTMLElement>('[data-post-id]')).find(
              (element) => element.dataset.postId === memory.anchor,
            );
            if (card)
              surface.value.scrollTop +=
                card.getBoundingClientRect().top -
                surface.value.getBoundingClientRect().top -
                (Number(memory.offset) || 0);
          }
          restoringScroll = false;
        }
      }
    }
  }
  async function loadMore() {
    if (loading.value || loadingMore.value || !cursor.value) return;
    const current = generation;
    moreFailed.value = false;
    loading.value = loadingMore.value = true;
    try {
      await readPage(true);
    } catch {
      if (current === generation) {
        if (['feed', 'profile'].includes(mode.value)) moreFailed.value = true;
        else error.value = loadFailed.value = true;
      }
    } finally {
      if (current === generation) loading.value = loadingMore.value = false;
    }
  }
  function filterChanged() {
    appliedFilters = { ...filters };
    if (surface.value) surface.value.scrollTop = 0;
    newAvailable.value = false;
    try {
      sessionStorage.removeItem(scrollKey());
    } catch {}
    void load();
  }
  async function perform(path: string, input: any, method: 'post' | 'put' = 'post') {
    if (busy.value) return false;
    const current = generation;
    busy.value = true;
    error.value = false;
    loadFailed.value = false;
    const key = JSON.stringify({ path, input, method });
    if (operationKey !== key) {
      operation = feedOperation(path, input, method);
      operationKey = key;
    }
    try {
      const result = await operation!();
      if (current !== generation) return false;
      operation = null;
      operationKey = '';
      return result;
    } catch {
      if (current === generation) error.value = true;
      return false;
    } finally {
      if (current === generation) busy.value = false;
    }
  }
  function withdraw(item: any) {
    Alert.alert({
      title: t('community.feed.withdraw'),
      content: t(
        managementTab.value === 'comments' ? 'community.feed.withdrawConfirm' : 'community.feed.withdrawPostConfirm',
      ),
      onOk: async () => {
        if (
          await perform(managementTab.value === 'comments' ? 'comments/withdraw' : 'posts/withdraw', {
            postId: item.postId || item.publicId,
            ...(managementTab.value === 'comments' ? { commentId: item.publicId } : {}),
            expectedRevision: item.revision,
          })
        )
          await load();
      },
    });
  }
  function deletePost(item: any) {
    const { publicId: postId, revision: expectedRevision } = item;
    Alert.alert({
      title: t('community.feed.deletePost'),
      content: t('community.feed.deletePostConfirm'),
      onOk: async () => {
        if (await perform('posts/delete', { postId, expectedRevision })) {
          if (mode.value === 'detail') handleDetailRemoved(postId);
          else await load();
        }
      },
    });
  }
  function moderationActions(item: any) {
    if (managementTab.value === 'appeals') return ['accepted', 'rejected'];
    if (managementTab.value === 'reports')
      return item.commentId ? ['remove', 'dismiss'] : ['remove', 'lock', 'dismiss'];
    if (managementTab.value === 'publishedPosts')
      return item.status === 'removed'
        ? ['restore']
        : item.status === 'withdrawn'
          ? []
          : [item.locked ? 'unlock' : 'lock', 'remove'];
    return ['approve', 'reject'];
  }
  function openReport(commentId: string | null) {
    error.value = false;
    loadFailed.value = false;
    dialog.value = { kind: 'report', commentId };
    dialogBody.value = '';
    reportReason.value = 'other';
  }
  async function submitDialog() {
    const d = dialog.value;
    if (!d) return;
    let path = '',
      input: any = {};
    if (d.kind === 'report') {
      path = 'reports';
      input = {
        postId: route.params.id,
        ...(d.commentId ? { commentId: d.commentId } : {}),
        reason: reportReason.value,
        detail: dialogBody.value,
      };
    } else if (d.kind === 'appeal') {
      path = 'appeals';
      input = { actionId: d.item.publicId, body: dialogBody.value };
    } else if (d.action === 'dismiss') {
      path = 'moderation/reports';
      input = { reportId: d.item.publicId, reason: dialogBody.value };
    } else if (managementTab.value === 'appeals') {
      path = 'moderation/appeals';
      input = {
        appealId: d.item.publicId,
        expectedRevision: d.item.revision,
        status: d.action,
        reason: dialogBody.value,
      };
    } else {
      const comment = managementTab.value === 'comments' || d.item.commentId;
      path = 'moderation/' + (comment ? 'comments' : 'posts');
      input = {
        postId: d.item.postId || d.item.publicId,
        ...(comment ? { commentId: d.item.commentId || d.item.publicId } : {}),
        expectedRevision: comment ? d.item.commentRevision || d.item.revision : d.item.revision,
        action: d.action,
        reason: dialogBody.value,
      };
    }
    if (await perform(path, input)) {
      dialog.value = null;
      await load();
    }
  }
  const accountEditorOpen = ref(false);
  const profileEditSection = ref<'achievements' | 'posts' | null>(null);
  const profileEditor = ref<InstanceType<typeof CommunityProfileEditor>>();
  function closeProfileEditor() {
    if (profileEditor.value?.saving) return;
    if (!profileEditor.value?.dirty) {
      profileEditSection.value = null;
      return;
    }
    Alert.alert({
      title: t('community.feed.discardProfileTitle'),
      content: t('community.feed.discardProfileHint'),
      okText: t('community.feed.discardChanges'),
      cancelText: t('community.feed.continueEditing'),
      onOk: () => {
        profileEditSection.value = null;
      },
    });
  }
  async function refreshPublicProfile() {
    const current = generation,
      id = profile.value?.userPublicId;
    profileEditSection.value = null;
    if (!id) return;
    try {
      const updated = await feedGet('profiles/' + id);
      if (current === generation) profile.value = updated;
    } catch {
      error.value = true;
    }
  }
  const liking = ref(new Set<string>()),
    likeErrors = ref(new Set<string>());
  const likeOperations = new Map<string, { liked: boolean; run: () => Promise<any> }>();
  async function togglePostLike(post: FeedPost) {
    if (!canWrite.value || liking.value.has(post.publicId)) return;
    const current = generation,
      id = post.publicId,
      liked = !post.liked;
    let operation = likeOperations.get(id);
    if (!operation || operation.liked !== liked) {
      operation = { liked, run: feedOperation('posts/state', { postId: id, liked }) };
      likeOperations.set(id, operation);
    }
    liking.value.add(id);
    likeErrors.value.delete(id);
    try {
      await operation.run();
      if (current !== generation) return;
      const matches = new Set<FeedPost>([
        post,
        ...posts.value.filter((p) => p.publicId === id),
        ...(profile.value?.featuredPostItems || []).filter((p: FeedPost) => p.publicId === id),
      ]);
      for (const item of matches) {
        if (item.liked !== liked) item.likeCount = Math.max(0, Number(item.likeCount || 0) + (liked ? 1 : -1));
        item.liked = liked;
      }
      likeOperations.delete(id);
    } catch {
      if (current === generation) likeErrors.value.add(id);
    } finally {
      if (current === generation) liking.value.delete(id);
    }
  }
  async function relationship(action: string, enabled: boolean) {
    const target = profile.value;
    if (!target) return;
    if (await perform('relations', { userPublicId: route.params.id, action, enabled }, 'put')) {
      if (profile.value !== target) return;
      if (action === 'follow') {
        target.followerCount = Math.max(0, Number(target.followerCount || 0) + (enabled ? 1 : -1));
        target.following = enabled;
      } else if (action === 'mute') target.muted = enabled;
    }
  }
  function block() {
    Alert.alert({
      title: t('community.feed.block'),
      content: t('community.feed.blockConfirm'),
      onOk: async () => {
        if (await perform('relations', { userPublicId: route.params.id, action: 'block', enabled: true }, 'put'))
          go('/community/feed');
      },
    });
  }
  watch(
    [() => route.fullPath, owner],
    () => {
      generation++;
      newAvailable.value = false;
      latestHead.value = '';
      latestHeadPublishedAt.value = '';
      liking.value.clear();
      likeErrors.value.clear();
      likeOperations.clear();
      restoringScroll = true;
      if (surface.value) surface.value.scrollTop = 0;
      if (timer) clearInterval(timer);
      posts.value = [];
      managed.value = [];
      profile.value = null;
      profileEditSection.value = null;
      loadedTopic.value = null;
      topicRows.value = [];
      topicManager.value = false;
      options.value = { enabled: true, interests: [], featuredPosts: [], revision: 0 };
      detail.value = null;
      cursor.value = null;
      dialog.value = null;
      relationsOpen.value = false;
      editor.value = false;
      busy.value = false;
      operation = null;
      operationKey = '';
      managementTab.value = route.query.tab === 'results' ? 'results' : 'posts';
      void load();
      timer = setInterval(async () => {
        if (mode.value !== 'feed' || !caps.value.feedEnabled || document.hidden || loading.value) return;
        const current = generation;
        try {
          const data = await feedGet<FeedPage<FeedPost>>('posts', { ...appliedFilters, limit: 1 });
          if (current === generation)
            newAvailable.value = hasNewCommunityPost(
              data.items[0],
              latestHead.value,
              latestHeadPublishedAt.value,
              posts.value.map((post) => post.publicId),
            );
        } catch {}
      }, 30000);
    },
    { immediate: true },
  );
  function handleProfileSaved() {
    if (profile.value?.isOwn) void refreshPublicProfile();
  }
  window.addEventListener('light-note:profile-saved', handleProfileSaved);
  onBeforeUnmount(() => {
    window.removeEventListener('light-note:profile-saved', handleProfileSaved);
    stopOrigin();
    generation++;
    if (timer) clearInterval(timer);
  });
</script>
<style lang="less">
  .community-feed {
    & {
      height: 100%;
      min-height: 0;
      overflow: auto;
      overflow-anchor: none;
      box-sizing: border-box;
      color: var(--text-color);
      padding: 0;
    }
    .feed-main-column {
      min-width: 0;
    }
    .feed-heading-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      flex-shrink: 0;
    }
    .feed-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .feed-main-column h1 {
      font-size: 24px;
      margin: 0 0 6px;
    }
    .feed-main-column h2 {
      font-size: 18px;
      margin: 12px 0;
      line-height: 1.6;
      overflow-wrap: anywhere;
    }
    .feed-main-column p {
      line-height: 1.75;
    }
    .feed-main-column small,
    .feed-meta,
    .feed-heading p {
      color: var(--desc-color);
      font-size: 12px;
    }
    .feed-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin: 10px 0;
    }
    .feed-actions:not(.discussion-actions) [aria-pressed='true']:not(.post-like) {
      outline: 1px solid var(--primary-color);
      color: var(--primary-color);
    }
    .feed-actions .input-container {
      flex: 1;
      min-width: 160px;
    }
    .feed-filters {
      padding: 0 0 8px;
      border-bottom: 1px solid var(--surface-border-color);
    }
    .feed-post {
      padding: 22px 0;
      border-bottom: 1px solid var(--surface-border-color);
    }
    .feed-post a {
      color: inherit;
      text-decoration: none;
    }
    .feed-post h2 a:hover {
      color: var(--primary-color);
    }
    .feed-excerpt {
      font-weight: 400;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.8;
    }
    .feed-body {
      font-weight: 400;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .feed-editor {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin: 20px 0;
      padding: 20px;
      border: 1px solid var(--surface-border-color);
      border-radius: 12px;
      background: var(--card-background);
    }
    .feed-editor label {
      font-size: 13px;
    }
    .feed-editor .b-checkbox {
      align-self: flex-start;
    }
    .feed-error {
      color: var(--danger-color, #bb3030);
      border: 1px solid currentColor;
      padding: 12px;
    }
    .feed-comment {
      padding: 16px 0;
      border-bottom: 1px solid var(--surface-border-color);
    }
    .feed-replies {
      margin-left: 18px;
      padding-left: 14px;
      border-left: 2px solid var(--surface-border-color);
    }
    .feed-comment.is-located {
      outline: 2px solid var(--primary-color);
      outline-offset: 4px;
    }
    .feed-status {
      display: inline-block;
      padding: 3px 8px;
      border: 1px solid var(--surface-border-color);
      border-radius: 6px;
      font-size: 12px;
    }
    .managed-post.is-clickable {
      cursor: pointer;
    }
    .feed-new-notice {
      display: flex;
      justify-content: center;
      padding: 16px 0 4px;
    }
    .feed-new.b_btn {
      padding: 5px 10px;
      min-height: 28px;
      border: 0;
      background: transparent;
      color: var(--primary-color);
      font-size: 13px;
    }
    .feed-new-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--primary-color);
    }
    .feed-mentions summary {
      cursor: pointer;
    }
    @media (max-width: 767px) {
      & {
        padding: 0;
      }
      .feed-main-column h1 {
        font-size: 21px;
      }
      .feed-editor {
        padding: 14px;
      }
      .feed-replies {
        margin-left: 8px;
        padding-left: 10px;
      }
    }
  }

  .community-feed {
    .feed-personal-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .feed-heading {
      margin: 0 0 24px;
    }
    .feed-heading h1 {
      margin: 0 0 6px;
    }
    .feed-heading p {
      font-size: 14px;
      margin: 0;
    }
    .feed-readonly {
      font-size: 13px;
      padding: 10px 14px;
      border: 1px solid var(--surface-border-color);
      border-radius: 8px;
      color: var(--desc-color);
      margin: 0 0 20px;
    }
    .feed-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }
    .feed-stream-tabs.tab-container {
      flex: 0 0 auto;
      margin: 0;
      gap: 28px;
      border: 0;
      padding: 0;
    }
    .feed-stream-tabs.tab-container :deep(.tab) {
      min-width: 0;
      margin: 0;
      padding: 12px 2px;
      font-size: 14px;
    }
    .feed-search {
      display: flex;
      align-items: center;
      gap: 8px;
      max-width: 470px;
      flex: 1;
    }
    .feed-search .input-container {
      flex: 1;
      min-width: 0;
    }
    .feed-clear {
      background: transparent;
      color: var(--desc-color);
      font-size: 12px;
      padding: 5px 10px;
    }
    .feed-mobile-topics {
      display: none;
    }
    .management-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 24px;
    }
    .management-heading p {
      margin: 4px 0 0;
      color: var(--desc-color);
      font-size: 13px;
    }
    .management-tabs.tab-container {
      width: 100%;
      margin: 0;
      border-bottom: 1px solid var(--workspace-border);
      gap: 24px;
    }
    .management-tabs :deep(.tab) {
      min-width: 0;
      padding: 12px 2px;
      margin: 0;
      font-size: 14px;
    }
    .managed-post-heading {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .managed-post-heading .feed-status {
      flex-shrink: 0;
      font-size: 11px;
      color: var(--desc-color);
      border-color: currentColor;
    }
    .managed-post-heading .feed-status[data-status='published'],
    .managed-post-heading .feed-status[data-status='approved'] {
      color: var(--success-color);
    }
    .managed-post-heading .feed-status[data-status='pending'],
    .managed-post-heading .feed-status[data-status='pending_review'] {
      color: var(--warning-color);
    }
    .managed-post-heading .feed-status[data-status='rejected'],
    .managed-post-heading .feed-status[data-status='removed'] {
      color: var(--danger-color);
    }
    .is-management {
      max-width: 1080px;
      margin: 0;
    }
    .is-management .managed-post {
      padding: 22px 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 0 20px;
    }
    .is-management .managed-post > :not(.feed-actions) {
      grid-column: 1;
    }
    .is-management .managed-post > .feed-actions {
      grid-column: 2;
      grid-row: 1 / 3;
      align-self: start;
      margin: 0;
    }
    .is-management .managed-post-heading {
      flex-direction: row-reverse;
      justify-content: flex-end;
      align-items: center;
    }
    .management-empty {
      min-height: 200px;
      justify-content: center;
    }
    @media (max-width: 767px) {
      .is-management .managed-post {
        display: block;
      }
      .is-management .managed-post > .feed-actions {
        margin-top: 12px;
      }
    }

    .is-management .managed-post h2 {
      margin: 0;
      font-size: 16px;
    }
    .is-management .managed-post .feed-body {
      margin: 10px 0 12px;
      font-size: 14px;
      color: var(--desc-color);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .is-management .managed-post .feed-actions {
      margin: 14px 0 0;
      gap: 8px;
    }
    .is-management .managed-post .feed-actions .b_btn {
      background: transparent;
      padding: 0 10px;
      font-size: 12px;
      color: var(--desc-color);
    }
    .is-management .managed-post .feed-actions .b_btn:active {
      background: var(--workspace-hover);
      color: var(--text-color);
    }
    @media (hover: hover) and (pointer: fine) {
      .is-management .managed-post .feed-actions .b_btn:hover {
        background: var(--workspace-hover);
        color: var(--text-color);
      }
    }
    .is-management .managed-post .feed-actions .b_btn.delete-post-action {
      color: var(--danger-color);
    }
    @media (max-width: 767px) {
      .is-management .managed-post .feed-actions .b_btn {
        min-width: 44px;
        height: 44px;
      }
    }
    @media (max-width: 1199px) {
      .feed-mobile-topics {
        display: flex;
        overflow-x: auto;
        gap: 8px;
        margin-top: 14px;
        padding: 2px 1px;
      }
      .feed-mobile-topics .b_btn {
        flex-shrink: 0;
        background: transparent;
        color: var(--desc-color);
        font-size: 12px;
      }
      .feed-mobile-topics [aria-pressed='true'] {
        color: var(--workspace-purple-text);
        background: var(--workspace-hover);
        outline: 1px solid var(--workspace-purple-text);
      }
    }
    .feed-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 64px 16px;
    }
    .feed-empty h2 {
      font-size: 18px;
      margin: 0 0 8px;
    }
    .feed-empty p {
      color: var(--desc-color);
      font-size: 14px;
      margin: 0 auto 20px;
      max-width: 400px;
    }
    .feed-profile-source {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      border-bottom: 1px solid var(--surface-border-color);
      padding-bottom: 20px;
    }
    .feed-profile-source p {
      color: var(--desc-color);
      font-size: 13px;
      max-width: 580px;
    }
    .feed-comment .feed-meta {
      font-size: 13px;
      color: var(--text-color);
      font-weight: 600;
    }
    .feed-replies {
      background: var(--card-background);
      border-radius: 8px;
      padding: 0 14px;
      margin: 12px 0 0 24px;
    }
    @media (max-width: 767px) {
      .feed-personal-actions {
        gap: 4px;
      }
      .feed-personal-actions .b_btn {
        font-size: 12px;
      }
      .feed-stream-tabs.tab-container :deep(.tab) {
        min-height: 40px;
      }
      .feed-toolbar {
        display: block;
      }
      .feed-search {
        max-width: none;
        margin-top: 12px;
      }
      .management-tabs.tab-container {
        display: flex;
        width: 100%;
        overflow-x: auto;
        box-sizing: border-box;
      }
      .management-tabs :deep(.tab) {
        flex: 1 0 auto;
        min-width: 0;
        padding: 0 10px;
      }
      .management-heading {
        flex-wrap: wrap;
      }
      .management-heading p {
        margin: 0;
      }
      .managed-post-heading {
        flex-direction: column;
        gap: 8px;
      }
      .feed-empty {
        padding: 44px 8px;
      }
      .feed-profile-source {
        align-items: flex-start;
        flex-direction: column;
        gap: 0;
      }
      .feed-replies {
        margin-left: 8px;
      }
    }
  }

  .community-action-dialog {
    display: flex;
    flex-direction: column;
    gap: 14px;
    color: var(--text-color);
  }
  .community-action-dialog p {
    margin: 0;
    font-size: 13px;
    color: var(--desc-color);
    line-height: 1.65;
  }
  .community-action-dialog small {
    font-size: 12px;
    color: var(--desc-color);
    text-align: right;
  }
  .community-action-dialog .feed-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin: 0;
  }
</style>

<style scoped>
  .post-back.b_btn {
    background: transparent;
    border: 0;
    color: var(--desc-color);
    padding: 4px 0;
    gap: 6px;
    margin-bottom: 16px;
  }
  .managed-post-heading a {
    color: inherit;
    text-decoration: none;
  }
  .managed-post-heading a:hover {
    color: var(--primary-color);
  }
  .topic-hero-image {
    width: 100%;
    height: auto;
    max-height: 250px;
    object-fit: cover;
    border-radius: 12px;
  }
  .topic-introduction {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    margin: 0 0 24px;
    color: var(--desc-color);
    font-size: 13px;
  }
  .topic-introduction :deep(.task-reward) {
    width: 100%;
    margin-top: 0;
  }
  .topic-back.b_btn {
    background: transparent;
    padding-left: 0;
    color: var(--primary-color);
  }
  .topic-task-state {
    width: 100%;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    padding: 16px 0;
    border-top: 1px solid var(--workspace-divider);
    border-bottom: 1px solid var(--workspace-divider);
  }
  .topic-task-state strong {
    color: var(--text-color);
  }
  .topic-task-state .b_btn {
    background: transparent;
    color: var(--primary-color);
  }
  .topic-management-entry {
    margin-bottom: 20px;
  }
  .profile-section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .profile-section-heading h2 {
    font-size: 15px;
    margin: 0;
  }
  .profile-section-edit.b_btn {
    background: transparent;
    color: var(--primary-color);
    font-size: 13px;
    padding: 0;
  }
  .public-featured-posts {
    padding: 8px 0 24px;
    margin-bottom: 8px;
  }
  .profile-featured-hint {
    color: var(--desc-color);
    font-size: 13px;
  }
  .public-profile-card :deep(.chat-profile-content__section-heading > small) {
    margin-left: auto;
  }
  .public-profile-card {
    padding-bottom: 28px;
    margin-bottom: 12px;
  }
  .public-profile-card :deep(.chat-profile-content__hero) {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    padding: 24px 0 12px;
  }
  .public-profile-card :deep(.chat-profile-content__identity) {
    flex: 1;
    align-items: flex-start;
    background: transparent;
    border: 0;
    padding: 0;
    min-width: 0;
  }
  .public-profile-card :deep(.chat-profile-content__empty) {
    border: 0;
    background: transparent;
    padding: 12px 0;
  }
  .profile-inline-bio {
    margin: 8px 0 0;
    max-width: 600px;
    font-size: 14px;
    line-height: 1.7;
    color: var(--desc-color);
  }
  .profile-inline-tenure {
    color: var(--desc-color);
  }
  .profile-summary-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 16px;
  }
  .profile-relationship-actions {
    margin: 0;
  }
  .profile-more.b_btn {
    font-size: 20px;
    letter-spacing: 2px;
    min-width: 40px;
  }
  .public-profile-card :deep(.chat-profile-content__privacy) {
    display: none;
  }
  .feed-stream-tabs :deep(.tab.is-active),
  .management-tabs :deep(.tab.is-active) {
    font-weight: 650;
  }
  @media (max-width: 767px) {
    .public-profile-card :deep(.chat-profile-content__hero) {
      flex-wrap: wrap;
      padding: 16px 0;
      gap: 16px;
    }
    .profile-summary-actions {
      width: 100%;
      flex-direction: row-reverse;
      justify-content: space-between;
      align-items: center;
    }
  }
  .profile-statistics {
    display: flex;
    gap: 24px;
    margin: 0;
    color: var(--desc-color);
  }
  .profile-statistics > span,
  .profile-statistics .b_btn {
    display: flex;
    align-items: center;
    min-height: 32px;
    height: 32px;
    box-sizing: border-box;
    line-height: 20px;
    font-weight: 400;
    gap: 6px;
    font-size: 13px;
  }
  .profile-statistics .b_btn {
    background: transparent;
    padding: 0;
    color: var(--desc-color);
  }
  .profile-statistics strong {
    color: var(--text-color);
    font-size: 15px;
  }
  .profile-relationship-actions .b_btn:not(.primary_btn) {
    background: transparent;
    color: var(--desc-color);
  }

  .feed-loading-region.loader-container {
    height: auto;
    min-height: 280px;
    min-height: max(280px, calc(100vh - 360px));
  }
  .feed-loading-region :deep(.b-loading-overlay) {
    max-height: max(280px, calc(100vh - 360px));
  }
</style>

<style scoped>
  .feed-loading-region[aria-busy='true'] :deep(.b-loading-content) {
    pointer-events: none;
  }
</style>
