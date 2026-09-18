<template>
  <section ref="articleRoot" class="community-discussion">
    <CommunityPostCard :post="post" detail>
      <template #author-actions>
        <BButton
          v-if="post.isOwn"
          type="text"
          class="post-edit-action"
          :disabled="editPending || !canWrite || post.locked"
          :title="post.locked ? t('community.feed.locked') : !canWrite ? t('community.feed.readonly') : undefined"
          @click="emit('edit')"
          >{{ t('community.feed.edit') }}</BButton
        >
      </template>
    </CommunityPostCard>
    <Teleport :to="actionsTarget || 'body'" :disabled="!showSidebar || !actionsTarget">
      <div class="post-reading-tools" :class="{ 'is-bottom-bar': !showSidebar }" v-show="!commentsOpen && !overlayOpen">
        <div v-if="showSidebar" class="post-tools-heading">{{ t('community.feed.postActions') }}</div>
        <div class="feed-actions discussion-actions" role="group" :aria-label="t('community.feed.postActions')">
          <BButton
            :disabled="busy || !canWrite"
            :loading="stateBusy === 'like'"
            border="0"
            :aria-pressed="post.liked"
            :title="t(post.liked ? 'community.feed.liked' : 'community.feed.likes')"
            :aria-label="t(post.liked ? 'community.feed.liked' : 'community.feed.likes')"
            @click="state({ liked: !post.liked })"
          >
            <SvgIcon
              :src="post.liked ? icon.coBuild.vote : icon.coBuild.voteOutline"
              size="17"
              aria-hidden="true"
            /><span>{{ post.likeCount || 0 }}</span
            ><span v-if="showSidebar">{{ t('community.feed.likes') }}</span>
          </BButton>
          <BButton
            class="discussion-open-comments"
            :title="t('community.feed.comments')"
            :aria-label="t('community.feed.comments') + ' · ' + (post.commentCount || 0)"
            @click="openComments"
          >
            <SvgIcon :src="icon.ai.conversations" size="17" aria-hidden="true" /><span>{{
              post.commentCount || 0
            }}</span
            ><span v-if="showSidebar">{{ t('community.feed.comments') }}</span>
          </BButton>
          <BButton
            :disabled="busy || !canWrite"
            :loading="stateBusy === 'subscription'"
            :icon-only="!showSidebar"
            border="0"
            :aria-pressed="post.subscription === 'enabled'"
            :title="t(post.subscription === 'enabled' ? 'community.feed.unsubscribe' : 'community.feed.subscribe')"
            :aria-label="t(post.subscription === 'enabled' ? 'community.feed.unsubscribe' : 'community.feed.subscribe')"
            @click="state({ subscription: post.subscription === 'enabled' ? 'disabled' : 'enabled' })"
          >
            <SvgIcon
              :src="post.subscription === 'enabled' ? icon.settings.notificationFilled : icon.settings.notification"
              size="17"
              aria-hidden="true"
            /><span v-if="showSidebar">{{
              t(post.subscription === 'enabled' ? 'community.feed.unsubscribe' : 'community.feed.subscribe')
            }}</span>
          </BButton>
          <BButton v-if="post.isOwn && isHelpPost" :disabled="busy || !canWrite" @click="solve(!post.resolved)">{{
            t(post.resolved ? 'community.feed.reopen' : 'community.feed.solve')
          }}</BButton>
          <CommunityContentMenu
            :placement="showSidebar ? 'bottom-left' : 'top-right'"
            :own="post.isOwn"
            :disabled="busy || actionPending"
            @select="selectPostAction"
          />
        </div>
        <p v-if="error" class="post-tools-error" role="alert">{{ t('community.feed.error') }}</p>
        <CommunityPostOutline
          v-if="showSidebar"
          :content-root="articleRoot"
          :scroll-container="scrollContainer"
          :content="post.body"
        />
      </div>
    </Teleport>
    <BDrawer
      :open="commentsOpen"
      :title="t('community.feed.comments') + ' · ' + (post.commentCount || 0)"
      width="600px"
      mobile-full-screen
      :destroy-on-close="false"
      :close-disabled="busy"
      @close="commentsOpen = false"
    >
      <div class="community-comments-panel">
        <h2 class="feed-comments-heading"
          >{{ t('community.feed.comments') }} <span>{{ post.commentCount || 0 }}</span></h2
        >
        <p v-if="targetUnavailable" role="status">{{ t('community.feed.commentUnavailable') }}</p>
        <BLoading
          class="community-comments-loading"
          :loading="loading && !loadingMore"
          :title="t('community.feed.loading')"
        >
          <p v-if="!loading && !error && !comments.length" class="feed-comments-empty"
            >{{ t('community.feed.noComments')
            }}<span v-if="canWrite && !post.locked"> · {{ t('community.feed.noCommentsHint') }}</span></p
          >
          <p v-if="error" class="feed-error" role="alert"
            >{{ t('community.feed.error') }}
            <BButton @click="load(Boolean(comments.length && cursor))">{{ t('community.feed.retry') }}</BButton></p
          >
          <BVirtualList
            v-if="comments.length"
            ref="commentList"
            class="comment-list"
            style="height: 100%"
            :items="comments"
            item-key="publicId"
            dynamic-height
            :item-height="160"
            :overscan="3"
            :loading="loading"
            :paused="!commentsOpen"
            :has-more="Boolean(cursor) && !error"
            :loading-text="t('community.feed.loading')"
            @load-more="load(true)"
            ><template #default="{ item: root }">
              <article :id="'comment-' + root.publicId" :key="root.publicId" class="feed-comment">
                <CommentContent
                  v-if="root.status !== 'withdrawn' && root.status !== 'removed'"
                  :comment="root"
                  :disabled="busy || !canWrite || post.locked"
                  :can-solve="post.isOwn && isHelpPost"
                  @reply="reply = reply?.publicId === root.publicId ? null : root"
                  @withdraw="withdraw(root)"
                  @report="$emit('report', root.publicId)"
                  @solve="solve(true, root.publicId)"
                />
                <div v-if="root.replyCount || replies[root.publicId]?.items.length" class="feed-replies">
                  <BButton v-if="!replies[root.publicId]" :disabled="busy" @click="loadReplies(root.publicId)"
                    >{{ t('community.feed.replies') }} ({{ root.replyCount }})</BButton
                  >
                  <article
                    v-for="child in replies[root.publicId]?.items || []"
                    :id="'comment-' + child.publicId"
                    :key="child.publicId"
                    class="feed-comment"
                  >
                    <CommentContent
                      :comment="child"
                      :disabled="busy || !canWrite || post.locked"
                      :can-solve="post.isOwn && isHelpPost"
                      @reply="reply = reply?.publicId === child.publicId ? null : child"
                      @withdraw="withdraw(child)"
                      @report="$emit('report', child.publicId)"
                      @solve="solve(true, child.publicId)"
                    />
                  </article>
                  <BButton
                    v-if="replies[root.publicId]?.nextCursor"
                    :disabled="busy"
                    @click="loadReplies(root.publicId, true)"
                    >{{ t('community.feed.more') }}</BButton
                  >
                </div>
              </article>
            </template></BVirtualList
          >
        </BLoading>
        <CommunityCommentComposer
          v-if="canWrite && !post.locked"
          v-model="body"
          :replying="reply?.author?.name"
          :quote="reply?.body"
          @cancel-reply="reply = null"
          :busy="busy"
          @submit="submit"
        />
        <p v-if="submitted && submitted !== 'published'" role="status">{{ t('community.feed.' + submitted) }}</p>
        <p v-if="!canWrite || post.locked" class="feed-comments-empty">{{
          t(post.locked ? 'community.feed.locked' : 'community.feed.readonly')
        }}</p>
      </div></BDrawer
    >
  </section>
</template>
<script setup lang="ts">
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import { useUserStore } from '@/store';
  import { VIEWPORT_BREAKPOINTS } from '@/config/responsive';
  import CommunityPostOutline from './CommunityPostOutline.vue';
  import { feedGet, feedOperation, type FeedPost, type FeedComment, type FeedPage } from '@/api/communityFeedApi';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import CommunityCommentComposer from './CommunityCommentComposer.vue';
  import ChatInlineEmojiText from '@/components/communityChat/ChatInlineEmojiText.vue';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import CommunityContentMenu from './CommunityContentMenu.vue';
  import CommunityPostCard from './CommunityPostCard.vue';
  const props = defineProps<{
    post: FeedPost;
    canWrite: boolean;
    actionsTarget?: HTMLElement | null;
    scrollContainer?: HTMLElement | null;
    overlayOpen?: boolean;
    editPending?: boolean;
    actionPending?: boolean;
  }>();
  const articleRoot = ref<HTMLElement | null>(null);
  const showSidebar = ref(typeof window !== 'undefined' && window.innerWidth >= VIEWPORT_BREAKPOINTS.desktop);
  const syncToolsLayout = () => {
    showSidebar.value = window.innerWidth >= VIEWPORT_BREAKPOINTS.desktop;
  };
  onMounted(() => window.addEventListener('resize', syncToolsLayout, { passive: true }));
  onBeforeUnmount(() => window.removeEventListener('resize', syncToolsLayout));
  const emit = defineEmits<{
    refresh: [];
    withdrawn: [postId: string];
    edit: [];
    delete: [];
    'update-post': [patch: Partial<FeedPost>];
    report: [commentId: string | null];
  }>();
  const { t } = useI18n();
  const router = useRouter();
  const route = useRoute(),
    user = useUserStore();
  const comments = ref<FeedComment[]>([]),
    replies = ref<Record<string, FeedPage<FeedComment>>>({}),
    cursor = ref<string | null>(null),
    reply = ref<FeedComment | null>(null),
    body = ref(''),
    busy = ref(false),
    error = ref(false),
    loading = ref(false),
    loadingMore = ref(false),
    submitted = ref(''),
    target = ref('');
  const isHelpPost = computed(() =>
    props.post.topics?.some((topic) => (typeof topic === 'string' ? topic : topic.slug) === 'help'),
  );
  const commentsOpen = ref(false);
  const targetUnavailable = ref(false);
  const stateBusy = ref('');
  const pendingTargetRoot = ref('');
  const commentList = ref<InstanceType<typeof BVirtualList>>();
  let initialized = false;
  async function openComments() {
    commentsOpen.value = true;
    if (!initialized) {
      initialized = true;
      await load();
    }
  }
  let generation = 0;
  let pending: (() => Promise<any>) | null = null,
    pendingKey = '';
  const CommentContent = defineComponent({
    props: ['comment', 'disabled', 'canSolve'],
    emits: ['reply', 'withdraw', 'report', 'solve'],
    setup(p, { emit }) {
      return () => {
        const c = p.comment as FeedComment;
        return h('div', [
          h('div', { class: 'feed-meta' }, [
            c.author
              ? h(
                  BButton,
                  {
                    size: 'small',
                    onClick: () =>
                      closeCurrentMobileOverlayThen(
                        () => {
                          commentsOpen.value = false;
                        },
                        () => router.push('/community/people/' + c.author!.userPublicId),
                      ),
                  },
                  () => c.author!.name,
                )
              : t('community.feed.unavailableStatus'),
            c.replyTo ? ' → ' + c.replyTo.name : '',
            c.isSolution ? ' · ' + t('community.feed.solution') : '',
          ]),
          h(
            'p',
            { class: 'feed-body' },
            c.status === 'published'
              ? h(ChatInlineEmojiText, { content: c.body })
              : t(
                  'community.feed.' +
                    (c.status === 'unavailable'
                      ? 'unavailableStatus'
                      : c.status === 'withdrawn'
                        ? 'commentDeleted'
                        : c.status),
                ),
          ),
          h(
            'div',
            { class: 'feed-actions' },
            c.status === 'published'
              ? [
                  h(
                    BButton,
                    {
                      class: 'comment-action',
                      disabled: p.disabled,
                      'aria-pressed': Boolean(c.liked),
                      'aria-label': t(c.liked ? 'community.feed.unlike' : 'community.feed.likes'),
                      onClick: () => likeComment(c),
                    },
                    () => [
                      h(SvgIcon, { src: c.liked ? icon.coBuild.vote : icon.coBuild.voteOutline, size: '17' }),
                      String(c.likeCount || '') + ' ' + t(c.liked ? 'community.feed.liked' : 'community.feed.likes'),
                    ],
                  ),
                  h(BButton, { class: 'comment-action', disabled: p.disabled, onClick: () => emit('reply') }, () => [
                    h(SvgIcon, { src: icon.ai.conversations, size: '17' }),
                    reply.value?.publicId === c.publicId ? t('community.feed.cancelReply') : t('community.feed.reply'),
                  ]),
                  h(CommunityContentMenu, {
                    own: c.isOwn,
                    comment: true,
                    disabled: busy.value,
                    onSelect: (key: string) => emit(key === 'withdraw' ? 'withdraw' : 'report'),
                  }),
                  p.canSolve
                    ? h(
                        BButton,
                        { size: 'small', disabled: p.disabled || c.isSolution, onClick: () => emit('solve') },
                        () => t(c.isSolution ? 'community.feed.solution' : 'community.feed.adoptAnswer'),
                      )
                    : null,
                ]
              : [],
          ),
        ]);
      };
    },
  });
  // Also tolerate older servers that still return deleted leaf placeholders.
  function visibleComments(items: FeedComment[], roots = false) {
    return items.filter((c) => !['withdrawn', 'removed'].includes(c.status) || (roots && c.replyCount > 0));
  }
  async function load(more = false) {
    if (loading.value) return;
    loadingMore.value = more;
    const current = generation;
    loading.value = true;
    try {
      const data = await feedGet<FeedPage<FeedComment>>('comments', {
        postId: props.post.publicId,
        ...(more && cursor.value ? { before: cursor.value } : {}),
      });
      if (current !== generation) return;
      comments.value = visibleComments(more ? [...comments.value, ...data.items] : data.items, true);
      cursor.value = data.nextCursor;
      error.value = false;
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) loading.value = loadingMore.value = false;
    }
  }
  async function loadReplies(root: string, more = false, before?: string) {
    const current = generation;
    try {
      const data = await feedGet<FeedPage<FeedComment>>('comments', {
        postId: props.post.publicId,
        root,
        ...(before || (more && replies.value[root]?.nextCursor)
          ? { before: before || replies.value[root].nextCursor }
          : {}),
      });
      if (current === generation)
        replies.value[root] = {
          ...data,
          items: visibleComments(more ? [...(replies.value[root]?.items || []), ...data.items] : data.items),
        };
    } catch {
      if (current === generation) error.value = true;
    }
  }
  async function perform(path: string, input: Record<string, any>) {
    if (busy.value) return false;
    const current = generation;
    const key = JSON.stringify({ path, input });
    if (key !== pendingKey) {
      pending = feedOperation(path, input);
      pendingKey = key;
    }
    busy.value = true;
    error.value = false;
    try {
      const result = await pending!();
      if (current !== generation) return false;
      pending = null;
      pendingKey = '';
      return result;
    } catch {
      if (current === generation) error.value = true;
      return false;
    } finally {
      if (current === generation) busy.value = false;
    }
  }
  async function submit() {
    const result = await perform('comments', {
      postId: props.post.publicId,
      body: body.value,
      mentions: [],
      ...(reply.value ? { replyTo: reply.value.publicId } : {}),
    });
    if (!result) return;
    body.value = '';
    submitted.value = result.status;
    const root = reply.value
      ? comments.value.find((c) => c.publicId === reply.value?.publicId)?.publicId ||
        Object.keys(replies.value).find((r) => replies.value[r].items.some((c) => c.publicId === reply.value?.publicId))
      : null;
    reply.value = null;
    await load();
    if (root) await loadReplies(root);
    emit('refresh');
  }
  async function likeComment(comment: FeedComment) {
    const result = await perform('comments/state', {
      postId: props.post.publicId,
      commentId: comment.publicId,
      liked: !comment.liked,
    });
    if (result) Object.assign(comment, { liked: result.liked, likeCount: result.likeCount });
  }
  async function state(input: any) {
    if (busy.value) return;
    stateBusy.value = input.liked !== undefined ? 'like' : 'subscription';
    try {
      const result = await perform('posts/state', { postId: props.post.publicId, ...input });
      if (result)
        emit('update-post', {
          liked: result.liked,
          subscription: result.subscription,
          likeCount: Math.max(0, props.post.likeCount + Number(result.liked) - Number(props.post.liked)),
        });
    } finally {
      stateBusy.value = '';
    }
  }
  async function solve(resolved: boolean, commentId?: string) {
    if (
      await perform('posts/resolve', {
        postId: props.post.publicId,
        expectedRevision: props.post.revision,
        resolved,
        ...(commentId ? { commentId } : {}),
      })
    ) {
      if (commentsOpen.value) await load();
      emit('refresh');
    }
  }
  function confirm(action: () => Promise<void>, comment = false) {
    Alert.alert({
      title: t(comment ? 'community.feed.deleteComment' : 'community.feed.withdraw'),
      content: t(comment ? 'community.feed.deleteCommentConfirm' : 'community.feed.withdrawPostConfirm'),
      onOk: action,
    });
  }
  function withdraw(c: FeedComment) {
    confirm(async () => {
      if (
        await perform('comments/withdraw', {
          postId: props.post.publicId,
          commentId: c.publicId,
          expectedRevision: c.revision,
        })
      ) {
        if (reply.value?.publicId === c.publicId) reply.value = null;
        await load();
        replies.value = {};
        emit('refresh');
      }
    }, true);
  }
  function selectPostAction(key: string) {
    if (key === 'withdraw' && props.post.isOwn) withdrawPost();
    else if (key === 'delete' && props.post.isOwn) emit('delete');
    else if (key === 'report') emit('report', null);
  }
  function withdrawPost() {
    const { publicId: postId, revision: expectedRevision } = props.post;
    confirm(async () => {
      if (await perform('posts/withdraw', { postId, expectedRevision })) emit('withdrawn', postId);
    });
  }
  watch(
    [() => props.post.publicId, () => user.id, () => route.query.comment, () => route.query.comments],
    async () => {
      const current = ++generation;
      loading.value = loadingMore.value = false;
      comments.value = [];
      replies.value = {};
      body.value = '';
      reply.value = null;
      pending = null;
      pendingKey = '';
      busy.value = false;
      submitted.value = '';
      pendingTargetRoot.value = '';
      targetUnavailable.value = false;
      target.value = typeof route.query.comment === 'string' ? route.query.comment : '';
      commentsOpen.value = Boolean(target.value) || route.query.comments === '1';
      initialized = commentsOpen.value;
      if (!commentsOpen.value) return;
      await load();
      if (current !== generation) return;
      if (target.value) {
        try {
          const context = await feedGet('comments/context', { postId: props.post.publicId, commentId: target.value });
          const page = await feedGet<FeedPage<FeedComment>>('comments', {
            postId: props.post.publicId,
            before: context.before,
          });
          if (current !== generation) return;
          comments.value = visibleComments(page.items, true);
          cursor.value = page.nextCursor;
          if (context.root) await loadReplies(context.root, false, context.replyBefore);
          await nextTick();
          if (current !== generation) return;
          pendingTargetRoot.value = context.root || target.value;
        } catch {
          if (current === generation) targetUnavailable.value = true;
        }
      }
    },
    { immediate: true },
  );
  watch(
    [commentList, pendingTargetRoot],
    async ([list, root]) => {
      if (!list || !root) return;
      const current = generation;
      await nextTick();
      if (current !== generation) return;
      const index = comments.value.findIndex((c) => c.publicId === root);
      if (index < 0) return;
      list.scrollToIndex(index, 'start');
      await nextTick();
      if (current !== generation) return;
      const element = document.getElementById('comment-' + target.value);
      element?.scrollIntoView({ block: 'nearest' });
      if (element) pendingTargetRoot.value = '';
    },
    { flush: 'post' },
  );
  onBeforeUnmount(() => generation++);
</script>

<style scoped lang="less">
  .feed-comments-heading {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 18px;
  }
  .feed-comments-heading span {
    font-size: 13px;
    color: var(--desc-color);
    font-weight: 400;
  }
  .feed-comments-empty {
    padding: 20px 0;
    color: var(--desc-color);
    font-size: 14px;
  }

  .community-discussion {
    background: var(--workspace-content);
    border: 0;
    padding: 0;
    margin-top: 16px;
  }
  .community-discussion :deep(.community-post-card) {
    border: 0;
    border-radius: 0;
    padding: 0;
    margin: 0;
  }
  .community-discussion :deep(.feed-actions) {
    gap: 8px;
  }
  .community-discussion .community-reply-composer {
    padding: 16px;
    background: var(--workspace-canvas);
    border: 1px solid var(--workspace-border);
    border-radius: 10px;
    margin: 20px 0 0;
    gap: 10px;
  }
  .reply-composer-tools {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .reply-composer-tools small {
    font-size: 12px;
    color: var(--desc-color);
    white-space: nowrap;
  }
  .community-reply-composer > .b_btn {
    align-self: flex-end;
  }
  @media (max-width: 767px) {
    .community-discussion {
      padding: 0;
    }
    .community-discussion .community-reply-composer {
      padding: 12px;
    }
  }
</style>

<style lang="less">
  .community-comments-panel .comment-action.b_btn {
    background: transparent;
    border: 0;
    padding: 0 4px;
    color: var(--desc-color);
    gap: 6px;
  }
  .community-comments-panel .comment-action[aria-pressed='true'] {
    color: var(--primary-color);
  }

  .community-comments-panel {
    color: var(--text-color);
    min-width: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .community-comments-panel .comment-list {
    max-height: none;
    padding-right: 10px;
  }
  .community-comments-panel .feed-comments-heading {
    display: none;
  }
  .community-comments-panel .feed-comment {
    padding: 18px 0;
    border-bottom: 1px solid var(--workspace-divider);
  }
  .community-comments-panel .feed-body {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.8;
  }
  .community-comments-panel .feed-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .community-comments-panel .feed-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--desc-color);
    font-size: 12px;
  }
  .community-comments-panel .feed-meta .b_btn {
    padding-left: 0;
    background: transparent;
    font-weight: 600;
  }
  .community-comments-panel .feed-replies {
    margin: 12px 0 0 14px;
    padding-left: 14px;
    border-left: 2px solid var(--workspace-divider);
  }
  .community-comments-panel .community-reply-composer {
    padding: 18px 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .community-comments-panel .reply-composer-tools {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .community-comments-panel small,
  .community-comments-panel .feed-comments-empty {
    color: var(--desc-color);
    font-size: 13px;
  }
  .discussion-open-comments {
    margin-top: 20px;
  }
</style>

<style scoped>
  .community-comments-loading {
    flex: 1;
    min-height: 0;
    height: 0;
  }
  .community-comments-loading :deep(.b-loading-overlay) {
    max-height: 320px;
  }
  .community-comments-loading[aria-busy='true'] :deep(.b-loading-content) {
    pointer-events: none;
  }
</style>

<style scoped>
  .discussion-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
  }
  .discussion-actions :deep(.b_btn) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    min-height: 36px;
    padding: 6px 12px;
    color: var(--desc-color);
  }
  .discussion-actions :deep(.b_btn[aria-pressed='true']) {
    color: var(--workspace-purple-text);
  }
  .discussion-actions .discussion-open-comments {
    margin: 0;
  }
</style>

<style scoped>
  .community-comments-loading :deep(.b-loading-content) {
    height: 100%;
  }
  .community-comments-panel > .comment-composer {
    flex-shrink: 0;
    margin: 0;
  }
  .discussion-actions :deep(.b_btn[aria-pressed]) {
    border: 0;
  }
</style>

<style scoped lang="less">
  .post-reading-tools {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .post-reading-tools .discussion-actions.feed-actions {
    margin: 0;
  }
  .post-tools-error {
    margin: 0;
    font-size: 12px;
    color: var(--desc-color);
  }
  .post-tools-heading {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
  }
  .post-reading-tools:not(.is-bottom-bar) .discussion-actions {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }
  .post-reading-tools:not(.is-bottom-bar) .discussion-actions :deep(.b_btn) {
    justify-content: flex-start;
    width: 100%;
    min-height: 40px;
  }
  .post-reading-tools:not(.is-bottom-bar) .discussion-actions :deep(.b-action-menu-anchor) {
    align-self: flex-start;
  }
  .post-reading-tools:not(.is-bottom-bar) .discussion-actions :deep(.community-content-more) {
    width: 40px;
  }
  @media (max-width: 1199px) {
    .community-discussion {
      padding-bottom: 64px;
    }
    .post-reading-tools.is-bottom-bar {
      position: fixed;
      left: 176px;
      right: 0;
      bottom: 0;
      z-index: 200;
      padding: 8px 16px;
      background: var(--workspace-open-canvas);
      border-top: 1px solid var(--workspace-border);
    }
    .is-bottom-bar .discussion-actions {
      flex-wrap: nowrap;
      justify-content: space-around;
      gap: 4px;
    }
    .is-bottom-bar .discussion-actions :deep(.b_btn) {
      min-height: 40px;
      padding: 6px 10px;
      white-space: nowrap;
    }
  }
  @media (max-width: 767px) {
    .post-reading-tools.is-bottom-bar {
      left: 0;
      bottom: var(--mobile-bottom-nav-visible-height, calc(56px + env(safe-area-inset-bottom)));
      padding: 6px 12px;
    }
    .is-bottom-bar .discussion-actions :deep(.b_btn) {
      min-height: 44px;
    }
  }
</style>

<style scoped>
  .post-edit-action {
    flex-shrink: 0;
  }
</style>
