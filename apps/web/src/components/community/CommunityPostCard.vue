<template>
  <article
    class="feed-post community-post-card"
    :class="{ 'is-detail': detail, 'is-preview': preview }"
    :data-post-id="post.publicId"
    @click="!detail && !preview && shouldOpenCommunityPost($event) && router.push(postTarget())"
  >
    <div v-if="post.author" class="post-author-row" :inert="preview">
      <BButton class="post-author" @click="router.push('/community/people/' + post.author.userPublicId)">
        <img
          v-if="imageSource(post.author.avatar)"
          :src="imageSource(post.author.avatar)"
          alt=""
          width="34"
          height="34"
        />
        <span v-else class="post-avatar-fallback" aria-hidden="true">{{ Array.from(post.author.name || '?')[0] }}</span>
        <span class="post-author-copy"
          ><strong>{{ post.author.name }}</strong
          ><span
            ><time>{{ formatDate(post.publishedAt) }}</time
            ><span v-if="post.author.level"> · Lv.{{ post.author.level }}</span></span
          ></span
        >
      </BButton>
      <div class="post-labels"
        ><span v-if="featured" class="post-state">{{ t('community.feed.featuredTitle') }}</span
        ><span v-if="post.resolved" class="post-state">{{ t('community.feed.solved') }}</span
        ><span v-if="post.locked" class="post-state">{{ t('community.feed.locked') }}</span
        ><slot name="author-actions"
      /></div>
    </div>
    <h2 v-if="post.title"
      ><span v-if="detail || preview">{{ post.title }}</span
      ><RouterLink v-else :to="postTarget()">{{ post.title }}</RouterLink></h2
    >
    <CommunityPostImages v-if="detail || preview" :images="post.images" article />
    <CommunityMarkdown :body="post.body" :class="{ 'feed-excerpt': !detail && !preview }" :inert="preview" />
    <div :inert="preview">
      <CommunityPostResources :resources="post.resources" :class="{ 'feed-resource-grid': !detail }" />
    </div>
    <CommunityPostImages v-if="!detail && !preview" :images="post.images" />
    <div class="feed-actions feed-meta" :inert="preview"
      ><RouterLink
        class="post-topic"
        v-for="topic in post.topics"
        :key="typeof topic === 'string' ? topic : topic.slug"
        :to="'/community/topics/' + (typeof topic === 'string' ? topic : topic.slug)"
        >#{{ typeof topic === 'string' ? topic : locale.startsWith('en') ? topic.nameEn : topic.nameZh }}</RouterLink
      ><BButton
        v-if="!detail"
        class="post-like"
        :disabled="!canLike || likePending"
        :aria-pressed="post.liked"
        :aria-label="t(post.liked ? 'community.feed.unlike' : 'community.feed.likes')"
        @click="$emit('like', post)"
        ><SvgIcon :src="icon.coBuild.vote" size="15" />{{ post.likeCount || 0 }}
        {{ t(post.liked ? 'community.feed.liked' : 'community.feed.likes') }}</BButton
      ><BButton
        v-if="!detail"
        class="post-like"
        @click="router.push({ ...postTarget(), query: { ...postTarget().query, comments: '1' } })"
        >{{ post.commentCount || 0 }} {{ t('community.feed.comments') }}</BButton
      ></div
    >
    <small v-if="likeFailed" class="post-like-error" role="alert">{{ t('community.feed.likeFailed') }}</small>
    <slot />
  </article>
</template>
<script setup lang="ts">
  import { useCommunityPreviewImages } from '@/composables/useCommunityPreviewImages';
  import { useRouter, useRoute } from 'vue-router';
  import { useI18n } from 'vue-i18n';
  import type { FeedPost } from '@/api/communityFeedApi';
  import CommunityPostResources from './CommunityPostResources.vue';
  import CommunityPostImages from './CommunityPostImages.vue';
  import CommunityMarkdown from './CommunityMarkdown.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { shouldOpenCommunityPost } from '@/utils/communityNavigation';
  import icon from '@/config/icon';
  const props = defineProps<{
    post: FeedPost;
    detail?: boolean;
    preview?: boolean;
    featured?: boolean;
    canLike?: boolean;
    likePending?: boolean;
    likeFailed?: boolean;
  }>();
  defineEmits<{ like: [post: FeedPost] }>();
  const { imageSource } = useCommunityPreviewImages(() => [props.post.author?.avatar]);
  const { t, locale } = useI18n();
  const router = useRouter();
  const route = useRoute();
  const postTarget = () => ({ path: '/community/posts/' + props.post.publicId, query: { from: route.fullPath } });
  function formatDate(value: string) {
    return value
      ? new Date(value).toLocaleString(locale.value, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  }
</script>

<style scoped lang="less">
  .post-like.b_btn {
    border: 0;
    background: transparent;
    color: var(--desc-color);
    padding: 0 var(--ui-space-4, 4px);
    height: var(--ui-layout-28, 28px);
    gap: var(--ui-space-5, 5px);
    font-size: var(--ui-font-12, 12px);
  }
  .post-like.b_btn[aria-pressed='true'] {
    color: var(--primary-color);
  }
  .post-like-error {
    display: block;
    color: var(--desc-color);
    font-size: var(--ui-font-12, 12px);
    margin-top: var(--ui-space-8, 8px);
  }
  .community-post-card:not(.is-detail) {
    cursor: pointer;
  }
  .community-post-card {
    border-bottom: 1px solid var(--surface-border-color);
    > h2 > a {
      color: inherit;
      text-decoration: none;
    }
    .feed-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
    }
    .feed-excerpt {
      margin: 0;
      color: var(--desc-color);
      font-size: var(--ui-font-14, 14px);
      font-weight: 400;
      line-height: 1.8;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
      max-height: 9em;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .feed-excerpt :deep(h1),
    .feed-excerpt :deep(h2),
    .feed-excerpt :deep(h3),
    .feed-excerpt :deep(h4),
    .feed-excerpt :deep(h5),
    .feed-excerpt :deep(h6) {
      font-size: var(--ui-font-15, 15px);
      line-height: 1.6;
      margin: 0.4em 0 0.2em;
    }
    .feed-excerpt :deep(p),
    .feed-excerpt :deep(ul),
    .feed-excerpt :deep(ol),
    .feed-excerpt :deep(blockquote),
    .feed-excerpt :deep(pre),
    .feed-excerpt :deep(table) {
      margin-top: 0;
      margin-bottom: 0.35em;
    }
    .feed-excerpt :deep(pre) {
      padding: var(--ui-space-6, 6px) var(--ui-space-10, 10px);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .feed-excerpt :deep(> :first-child) {
      margin-top: 0;
    }
    padding: var(--ui-space-24, 24px) 0;
    .post-author-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--ui-space-12, 12px);
      margin-bottom: var(--ui-space-14, 14px);
    }
    .post-author {
      display: flex;
      align-items: center;
      gap: var(--ui-space-10, 10px);
      padding: 0;
      background: transparent;
      text-align: left;
      min-width: 0;
      white-space: normal;
    }
    .post-author img,
    .post-avatar-fallback {
      width: var(--ui-layout-34, 34px);
      height: var(--ui-layout-34, 34px);
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
    }
    .post-avatar-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--card-background);
      border: 1px solid var(--surface-border-color);
      color: var(--primary-color);
      font-size: var(--ui-font-14, 14px);
    }
    .post-author-copy {
      line-height: 1.4;
      display: flex;
      flex-direction: column;
      gap: var(--ui-space-3, 3px);
      min-width: 0;
    }
    .post-author-copy strong {
      font-size: var(--ui-font-14, 14px);
      font-weight: 600;
      color: var(--text-color);
      overflow-wrap: anywhere;
    }
    .post-author-copy > span {
      font-size: var(--ui-font-12, 12px);
      color: var(--desc-color);
    }
    .post-labels {
      display: flex;
      align-items: center;
      gap: var(--ui-space-8, 8px);
      font-size: var(--ui-font-12, 12px);
      color: var(--desc-color);
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .post-state {
      border: 1px solid currentColor;
      border-radius: 4px;
      padding: var(--ui-space-2, 2px) var(--ui-space-5, 5px);
    }
    > h2 {
      margin: 0 0 var(--ui-space-8, 8px);
      font-size: var(--ui-font-18, 18px);
      line-height: 1.5;
    }
    .feed-meta {
      margin: var(--ui-space-14, 14px) 0 0;
      gap: var(--ui-space-14, 14px);
    }
    &.is-detail {
      padding-top: var(--ui-space-24, 24px);
    }
    &.is-detail > h2 {
      font-size: var(--ui-font-25, 25px);
      margin: var(--ui-space-18, 18px) 0;
    }
    @media (max-width: 767px) {
      padding: 20px 0;
      .post-labels {
        gap: 5px;
      }
      &.is-detail > h2 {
        font-size: 22px;
      }
    }
  }

  .community-post-card .post-labels > span:first-child {
    color: var(--workspace-purple-text);
    background: var(--workspace-hover);
    border-radius: 5px;
    padding: var(--ui-space-2, 2px) var(--ui-space-8, 8px);
  }
  .community-post-card .feed-meta > span {
    line-height: 1.5;
  }
  .community-post-card .feed-meta > .post-topic {
    text-decoration: none;
    color: var(--workspace-purple-text);
  }
  .community-post-card .post-avatar-fallback {
    background: var(--workspace-hover);
    color: var(--workspace-purple-text);
    border: 0;
  }

  .feed-resource-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-10, 10px);
  }
  .feed-resource-grid :deep(.resource-card) {
    background: var(--workspace-content);
    min-height: var(--ui-layout-68, 68px);
    padding: var(--ui-space-12, 12px);
    gap: var(--ui-space-10, 10px);
  }
  .feed-resource-grid :deep(.resource-copy strong) {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: var(--ui-font-13, 13px);
  }
  .feed-resource-grid :deep(.resource-read) {
    font-size: var(--ui-font-11, 11px);
  }
  .community-post-card:not(.is-detail) {
    padding-left: var(--ui-space-46, 46px);
    position: relative;
  }
  .community-post-card:not(.is-detail) .post-author img,
  .community-post-card:not(.is-detail) .post-avatar-fallback {
    position: absolute;
    left: 0;
    top: var(--ui-space-24, 24px);
  }
  .community-post-card:not(.is-detail) .post-author-copy {
    flex-direction: row;
    align-items: baseline;
    gap: var(--ui-space-12, 12px);
    flex-wrap: wrap;
  }
  @media (max-width: 767px) {
    .feed-resource-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .community-post-card:not(.is-detail) {
      padding-left: 0;
    }
    .community-post-card:not(.is-detail) .post-author img,
    .community-post-card:not(.is-detail) .post-avatar-fallback {
      position: static;
    }
  }
</style>
