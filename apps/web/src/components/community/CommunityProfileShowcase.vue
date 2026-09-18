<template>
  <section class="profile-showcase" :aria-label="t('community.feed.customizeHome')">
    <header v-if="!embedded"
      ><div
        ><h2>{{ t('community.feed.customizeHome') }}</h2
        ><p>{{ t('community.feed.customizeHomeHint') }}</p></div
      ><BButton type="primary" :loading="saving" :disabled="loading || !writable || !options" @click="save">{{
        t('community.feed.save')
      }}</BButton></header
    >
    <BLoading class="community-section-loading" :loading="loading" :title="t('community.feed.loading')">
      <p v-if="error" role="alert"
        >{{ t('community.feed.error') }}
        <BButton v-if="!dirty" :disabled="disabled || saving" @click="load">{{ t('community.feed.retry') }}</BButton></p
      >
      <p v-if="!loading && !error && !options">{{ t('community.feed.closed') }}</p>
      <template v-if="options">
        <p v-if="!writable" class="showcase-notice">{{ t('community.feed.readonly') }}</p>
        <section class="showcase-section"
          ><h3
            >{{ t('community.feed.featured') }} <small>{{ options.featuredPosts.length }} / 3</small></h3
          ><p>{{ t('community.feed.featuredHint') }}</p>
          <div v-if="options.featuredPosts.length" class="featured-selected">
            <BButton
              v-for="(id, index) in options.featuredPosts"
              :key="id"
              :disabled="disabled || saving || !writable"
              @click="toggle(options.featuredPosts, id)"
            >
              <span>{{ index + 1 }}</span
              ><strong>{{ posts.find((post) => post.publicId === id)?.title || t('community.feed.thought') }}</strong
              ><span>{{ t('community.feed.removeImage') }}</span>
            </BButton>
          </div>
          <BVirtualList
            v-if="displayPosts.length || cursor"
            class="featured-choices"
            :items="displayPosts"
            item-key="publicId"
            :item-height="110"
            dynamic-height
            :gap="10"
            :overscan="2"
            :loading="loadingMore"
            :paused="loading || disabled || saving"
            :has-more="Boolean(cursor) && !moreError"
            :loading-text="t('community.feed.loading')"
            @load-more="more"
            ><template #default="{ item: post }"
              ><BButton
                :aria-pressed="options.featuredPosts.includes(post.publicId)"
                :disabled="
                  disabled ||
                  saving ||
                  !writable ||
                  (options.featuredPosts.length >= 3 && !options.featuredPosts.includes(post.publicId))
                "
                @click="toggle(options.featuredPosts, post.publicId)"
                ><span class="selection-mark" aria-hidden="true">{{
                  options.featuredPosts.includes(post.publicId) ? '✓' : '+'
                }}</span
                ><span class="featured-copy"
                  ><strong>{{ post.title || t('community.feed.thought') }}</strong
                  ><span>{{ post.body }}</span></span
                ></BButton
              ></template
            ></BVirtualList
          >
          <p v-if="!displayPosts.length" class="showcase-empty">{{ t('community.feed.noFeaturedPosts') }}</p>
          <p v-if="moreError" role="alert"
            >{{ t('community.feed.error') }}
            <BButton :disabled="disabled || loadingMore || saving" @click="retryMore">{{
              t('community.feed.retry')
            }}</BButton></p
          >
        </section>
        <p v-if="saved && !embedded" role="status">{{ t('community.feed.profileSaved') }}</p>
      </template>
    </BLoading>
  </section>
</template>
<script setup lang="ts">
  import { computed, ref, watch, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { feedGet, feedOperation, type FeedPost } from '@/api/communityFeedApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BVirtualList from '@/components/base/BasicComponents/BVirtualList.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  defineProps<{ embedded?: boolean; disabled?: boolean }>();
  const baseline = ref('');
  const signature = () => JSON.stringify(options.value?.featuredPosts);
  const dirty = computed(() => Boolean(options.value && signature() !== baseline.value));
  defineExpose({ save, dirty });
  const { t } = useI18n(),
    user = useUserStore();
  const options = ref<any>(null),
    posts = ref<FeedPost[]>([]),
    cursor = ref<string | null>(null);
  const loading = ref(false),
    saving = ref(false),
    loadingMore = ref(false),
    error = ref(false),
    moreError = ref(false),
    saved = ref(false),
    writable = ref(false);
  let generation = 0,
    operation: (() => Promise<any>) | null = null,
    fingerprint = '';
  const displayPosts = computed(() => [
    ...posts.value,
    ...(options.value?.featuredPosts || [])
      .filter((id: string) => !posts.value.some((p) => p.publicId === id))
      .map((publicId: string) => ({
        publicId,
        title: t('community.feed.unavailableStatus'),
        body: t('community.feed.unavailable'),
      })),
  ]);
  function merge(items: FeedPost[]) {
    const unique = new Map(posts.value.map((p) => [p.publicId, p]));
    for (const p of items) if (p.status === 'published' || p.hasPublishedVersion) unique.set(p.publicId, p);
    posts.value = [...unique.values()];
  }
  async function load() {
    const current = ++generation;
    loading.value = true;
    error.value = false;
    moreError.value = false;
    try {
      const caps = await feedGet('feed/capabilities');
      if (current !== generation) return;
      if (!caps.feedEnabled) {
        options.value = null;
        return;
      }
      const [own, page] = await Promise.all([feedGet('profiles/options/me'), feedGet('own/posts')]);
      if (current !== generation) return;
      options.value = own;
      baseline.value = signature();
      posts.value = [];
      merge(page.items);
      cursor.value = page.nextCursor;
      writable.value = caps.writesEnabled;
      const missing = own.featuredPosts.filter((id: string) => !posts.value.some((p) => p.publicId === id));
      const extra = await Promise.all(missing.map((id: string) => feedGet('posts/' + id).catch(() => null)));
      if (current === generation) merge(extra.filter(Boolean));
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) loading.value = false;
    }
  }
  function toggle(list: string[], id: string) {
    saved.value = false;
    const index = list.indexOf(id);
    if (index >= 0) list.splice(index, 1);
    else if (list.length < 3) list.push(id);
  }
  async function more() {
    if (!cursor.value || loading.value || loadingMore.value || moreError.value) return;
    const current = generation;
    loadingMore.value = true;
    try {
      const page = await feedGet('own/posts', { before: cursor.value });
      if (current === generation) {
        merge(page.items);
        cursor.value = page.nextCursor;
      }
    } catch {
      if (current === generation) moreError.value = true;
    } finally {
      if (current === generation) loadingMore.value = false;
    }
  }
  function retryMore() {
    moreError.value = false;
    void more();
  }
  async function save() {
    if (!dirty.value) return true;
    if (saving.value || !options.value || !writable.value) return false;
    const current = generation;
    saving.value = true;
    error.value = false;
    saved.value = false;
    const input = {
      expectedRevision: options.value.revision,
      featuredPosts: [...options.value.featuredPosts],
    };
    const next = JSON.stringify(input);
    if (!operation || fingerprint !== next) {
      operation = feedOperation('profiles/options/me', input, 'put');
      fingerprint = next;
    }
    try {
      const result = await operation();
      if (current !== generation) return;
      options.value.revision = result.revision;
      saved.value = true;
      operation = null;
      baseline.value = signature();
      return true;
    } catch {
      if (current === generation) error.value = true;
      return false;
    } finally {
      if (current === generation) saving.value = false;
    }
  }
  watch(
    () => `${user.id}|${user.role}|${user.adminContext?.id || ''}`,
    () => {
      generation++;
      options.value = null;
      posts.value = [];
      saved.value = false;
      saving.value = loadingMore.value = loading.value = writable.value = error.value = false;
      cursor.value = null;
      moreError.value = false;
      operation = null;
      if (user.id && user.role !== 'visitor' && !user.adminContext) void load();
    },
    { immediate: true },
  );
  onBeforeUnmount(() => generation++);
</script>
<style scoped lang="less">
  .featured-selected {
    display: grid;
    gap: 6px;
    margin: 12px 0 18px;
  }
  .featured-selected .b_btn {
    width: 100%;
    display: flex;
    gap: 10px;
    text-align: left;
    background: transparent;
    border: 1px solid var(--workspace-border);
    padding: 8px 10px;
    height: auto;
    color: var(--primary-color);
  }
  .featured-selected strong {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 13px;
  }
  .featured-selected span {
    flex-shrink: 0;
    font-size: 12px;
  }

  .profile-showcase {
    min-width: 0;
    color: var(--text-color);
    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
    }
    h2 {
      font-size: 18px;
      margin: 0;
    }
    p {
      color: var(--desc-color);
      font-size: 13px;
      line-height: 1.7;
      margin: 8px 0 16px;
    }
    h3 {
      font-size: 14px;
      margin: 0 0 16px;
      display: flex;
      justify-content: space-between;
    }
    small {
      font-weight: 400;
      color: var(--desc-color);
    }
  }
  .showcase-section {
    padding: 24px 0;
    border-top: 1px solid var(--workspace-divider);
    margin-top: 20px;
  }
  [aria-pressed='true'].b_btn {
    color: var(--primary-color);
    border-color: var(--primary-color);
    background: var(--workspace-hover);
  }
  .featured-choices {
    height: 440px;
    max-height: 440px;
    overflow: auto;
    padding: 2px;
    margin-bottom: 12px;
  }
  .featured-choices .b_btn {
    width: 100%;
    min-width: 0;
    white-space: normal;
    text-align: left;
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--workspace-border);
    border-radius: 12px;
    background: var(--workspace-open-canvas);
    height: auto;
  }
  .featured-choices .b_btn[aria-pressed='true'] {
    border-color: var(--primary-color);
    background: var(--workspace-hover);
  }
  .featured-choices .b_btn:disabled {
    opacity: 1;
  }
  .selection-mark {
    flex: 0 0 20px;
    width: 20px;
    height: 22.4px;
    line-height: 22.4px;
    text-align: center;
    color: var(--primary-color);
    font-size: 18px;
  }
  .featured-copy {
    flex: 1;
    min-width: 0;
    display: grid;
    gap: 6px;
    strong {
      font-size: 14px;
      line-height: 1.6;
    }
    span {
      color: var(--desc-color);
      font-size: 12px;
      line-height: 1.6;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  }
  .showcase-empty {
    padding: 24px;
    border-radius: 12px;
    background: var(--workspace-hover);
  }
</style>

<style scoped>
  .community-section-loading {
    height: auto;
    min-height: 240px;
  }
  .community-section-loading[aria-busy='true'] :deep(.b-loading-content) {
    pointer-events: none;
  }
</style>
