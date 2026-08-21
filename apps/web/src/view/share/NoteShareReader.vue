<template>
  <div ref="readerRef" class="note-share-reader">
    <header class="note-share-reader__header">
      <BButton class="note-share-reader__brand" @click="router.push('/')">
        <span class="note-share-reader__brand-mark">L</span>
        <span>LIGHT NOTE</span>
      </BButton>
      <nav class="note-share-reader__nav" :aria-label="t('noteShare.siteNavigation')">
        <BButton class="note-share-reader__nav-help" @click="openInNewPage('/help')">
          {{ t('noteShare.help') }}
        </BButton>
        <BButton type="primary" @click="openInNewPage('/app')">{{ t('noteShare.openLightNote') }}</BButton>
      </nav>
    </header>

    <main v-if="loading && !page.id" class="note-share-reader__center" aria-live="polite">
      <BLoading inline loading :title="t('noteShare.loadingShare')" />
    </main>

    <main v-else-if="requiresCode && !page.id" class="note-share-reader__center">
      <section class="note-share-reader__gate">
        <span class="note-share-reader__gate-icon"><SvgIcon :src="icon.share" size="24" /></span>
        <h1>{{ t('noteShare.protectedTitle') }}</h1>
        <p>{{ t('noteShare.protectedHint') }}</p>
        <BInput
          v-model:value="accessCode"
          :maxlength="12"
          autocomplete="one-time-code"
          :placeholder="t('noteShare.accessCodePlaceholder')"
          @enter="resolveShare"
        />
        <p v-if="errorMessage" class="note-share-reader__gate-error" role="alert">{{ errorMessage }}</p>
        <BButton type="primary" :loading="loading" @click="resolveShare">{{ t('noteShare.openShare') }}</BButton>
      </section>
    </main>

    <main v-else-if="errorMessage && !page.id" class="note-share-reader__center">
      <section class="note-share-reader__gate" role="alert">
        <span class="note-share-reader__gate-icon is-error"><SvgIcon :src="icon.common.info" size="24" /></span>
        <h1>{{ t('noteShare.unavailableTitle') }}</h1>
        <p>{{ errorMessage }}</p>
        <BButton :loading="loading" @click="resolveShare">{{ t('common.retry') }}</BButton>
      </section>
    </main>

    <main v-else class="note-share-reader__workspace" :class="{ 'has-sidebar': desktopSidebarVisible }">
      <aside v-if="desktopSidebarVisible" class="note-share-reader__sidebar">
        <div v-if="isSubtreeShare && headings.length" class="note-share-reader__tabs" role="tablist">
          <BButton
            class="note-share-reader__tab"
            :class="{ 'is-active': effectiveSidebarTab === 'pages' }"
            role="tab"
            :aria-selected="effectiveSidebarTab === 'pages'"
            @click="sidebarTab = 'pages'"
          >
            {{ t('noteShare.pages') }}
          </BButton>
          <BButton
            class="note-share-reader__tab"
            :class="{ 'is-active': effectiveSidebarTab === 'outline' }"
            role="tab"
            :aria-selected="effectiveSidebarTab === 'outline'"
            @click="sidebarTab = 'outline'"
          >
            {{ t('noteShare.outline') }}
          </BButton>
        </div>
        <h2 v-else class="note-share-reader__sidebar-title">
          {{ t(isSubtreeShare ? 'noteShare.pages' : 'noteShare.outline') }}
        </h2>
        <div
          class="note-share-reader__sidebar-scroll"
          :class="{ 'is-outline': !isSubtreeShare || effectiveSidebarTab === 'outline' }"
        >
          <template v-if="isSubtreeShare && effectiveSidebarTab === 'pages'">
            <PublicNoteTree
              v-if="rootTreeNode"
              :node="rootTreeNode"
              :active-id="page.id"
              :get-children="getTreeChildren"
              default-expanded
              @open="openPage"
            />
          </template>
          <NoteOutlineList
            v-else
            class="note-share-reader__outline-list"
            :headings="headings"
            :active-index="activeHeadingIndex"
            variant="share"
            @select="scrollToHeading"
          />
        </div>
      </aside>

      <section class="note-share-reader__document-shell">
        <div class="note-share-reader__mobile-bar">
          <BButton v-if="isSubtreeShare || headings.length" @click="mobileNavigationOpen = true">
            <SvgIcon :src="icon.noteTree.sidebarOpen" size="17" />
            {{ t(isSubtreeShare ? 'noteShare.pagesAndOutline' : 'noteShare.outline') }}
          </BButton>
          <span>{{ t('noteShare.readonly') }}</span>
        </div>
        <article class="note-share-reader__article" :aria-busy="pageLoading">
          <nav
            v-if="breadcrumb.length > 1"
            class="note-share-reader__breadcrumb"
            :aria-label="t('noteShare.breadcrumb')"
          >
            <template v-for="(item, index) in breadcrumb" :key="item.id">
              <span v-if="index" aria-hidden="true">/</span>
              <BButton v-if="item.id !== page.id" @click="openPage(item.id)">{{ item.title }}</BButton>
              <span v-else aria-current="page">{{ item.title }}</span>
            </template>
          </nav>
          <div class="note-share-reader__title-row">
            <div>
              <h1>{{ page.title || t('note.untitled') }}</h1>
              <p v-if="share.description" class="note-share-reader__description">{{ share.description }}</p>
            </div>
            <span class="note-share-reader__readonly-badge">{{ t('noteShare.readonly') }}</span>
          </div>
          <div class="note-share-reader__meta">
            <span v-if="share.creatorName">{{ t('noteShare.sharedBy', { name: share.creatorName }) }}</span>
            <span v-if="page.updateTime">{{ t('noteShare.updatedAt', { time: formatDate(page.updateTime) }) }}</span>
          </div>

          <div v-if="pageLoading" class="note-share-reader__page-loading">
            <BLoading inline loading :title="t('common.loading')" />
          </div>
          <DrawingNoteEditor
            v-else-if="page.type === 'drawing'"
            class="note-share-reader__drawing"
            :content="page.content"
            :title="page.title"
            :note-id="page.id"
            readonly
          />
          <div
            v-else-if="renderedHtml"
            ref="contentRef"
            class="note-share-reader__content note-rich-content"
            @click="handleContentClick"
            v-html="renderedHtml"
          />
          <p v-else class="note-share-reader__empty">{{ t('noteShare.emptyPage') }}</p>
        </article>
        <footer class="note-share-reader__footer">
          <span>{{ t('noteShare.poweredBy') }}</span>
          <BButton size="small" @click="router.push('/app')">{{ t('noteShare.createOwnNotes') }}</BButton>
        </footer>
      </section>
    </main>

    <BDrawer
      v-if="isSubtreeShare || headings.length"
      :open="mobileNavigationOpen"
      placement="bottom"
      height="min(76dvh, 680px)"
      :title="t(isSubtreeShare ? 'noteShare.pagesAndOutline' : 'noteShare.outline')"
      body-padding="12px"
      @close="mobileNavigationOpen = false"
    >
      <div v-if="isSubtreeShare && headings.length" class="note-share-reader__tabs" role="tablist">
        <BButton
          class="note-share-reader__tab"
          :class="{ 'is-active': effectiveSidebarTab === 'pages' }"
          @click="sidebarTab = 'pages'"
          >{{ t('noteShare.pages') }}</BButton
        >
        <BButton
          class="note-share-reader__tab"
          :class="{ 'is-active': effectiveSidebarTab === 'outline' }"
          @click="sidebarTab = 'outline'"
          >{{ t('noteShare.outline') }}</BButton
        >
      </div>
      <PublicNoteTree
        v-if="isSubtreeShare && effectiveSidebarTab === 'pages' && rootTreeNode"
        :node="rootTreeNode"
        :active-id="page.id"
        :get-children="getTreeChildren"
        default-expanded
        @open="openPageFromDrawer"
      />
      <NoteOutlineList
        v-else
        class="note-share-reader__drawer-outline"
        :headings="headings"
        :active-index="activeHeadingIndex"
        variant="share"
        mobile
        @select="scrollFromDrawer"
      />
    </BDrawer>
  </div>
</template>

<script setup lang="ts">
  import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useRoute, useRouter } from 'vue-router';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import message from '@/components/base/BasicComponents/BMessage/BMessage';
  import icon from '@/config/icon';
  import NoteOutlineList from '@/components/noteLibrary/detail/NoteOutlineList.vue';
  import PublicNoteTree from '@/components/noteLibrary/share/PublicNoteTree.vue';
  import {
    getPublicNoteSharePage,
    getPublicNoteShareTree,
    readNoteShareSessionTicket,
    resolvePublicNoteShare,
    saveNoteShareSessionTicket,
    type PublicNoteSharePage,
    type PublicNoteShareTreeItem,
  } from '@/api/noteShare';
  import { normalizeNoteContentResourceUrls, noteContentToHtml } from '@/utils/common';
  import { parseResourceHref } from '@/utils/noteResourceRefs';
  import { scrollIntoContainer } from '@/utils/zoom';

  const DrawingNoteEditor = defineAsyncComponent(
    () => import('@/components/noteLibrary/drawing/DrawingNoteEditor.vue'),
  );
  const route = useRoute();
  const router = useRouter();
  const { t, locale } = useI18n();
  const loading = ref(false);
  const pageLoading = ref(false);
  const requiresCode = ref(false);
  const accessCode = ref('');
  const errorMessage = ref('');
  const accessTicket = ref('');
  const mobileNavigationOpen = ref(false);
  const sidebarTab = ref<'pages' | 'outline'>('pages');
  const readerRef = ref<HTMLElement | null>(null);
  const contentRef = ref<HTMLElement | null>(null);
  const renderedHtml = ref('');
  const headings = ref<Array<{ id: string; text: string; level: number; element: HTMLElement }>>([]);
  const activeHeadingIndex = ref<number | null>(null);
  const breadcrumb = ref<Array<{ id: string; title: string }>>([]);
  const treeChildren = new Map<string, PublicNoteShareTreeItem[]>();
  let referrerMeta: HTMLMetaElement | null = null;
  let previousReferrerPolicy: string | null = null;
  let headingSpyFrame = 0;
  let pageRenderVersion = 0;
  const share = reactive({
    rootNoteId: '',
    rootTitle: '',
    rootType: 'html',
    scopeType: 'single' as 'single' | 'subtree',
    description: '',
    creatorName: '',
    expiresAt: '',
  });
  const page = reactive<PublicNoteSharePage>({
    id: '',
    parentId: null,
    title: '',
    content: '',
    type: 'html',
    revision: 1,
    updateTime: null,
  });

  const token = computed(() => {
    const hash = String(route.hash || '').replace(/^#/, '');
    return new URLSearchParams(hash).get('token') || '';
  });
  const isSubtreeShare = computed(() => share.scopeType === 'subtree');
  const effectiveSidebarTab = computed<'pages' | 'outline'>(() =>
    isSubtreeShare.value && sidebarTab.value === 'outline' && !headings.value.length ? 'pages' : sidebarTab.value,
  );
  const desktopSidebarVisible = computed(() => isSubtreeShare.value || headings.value.length > 0);
  const rootTreeNode = computed<PublicNoteShareTreeItem | null>(() =>
    share.rootNoteId
      ? {
          id: share.rootNoteId,
          parentId: null,
          title: share.rootTitle,
          type: share.rootType,
          revision: 1,
          updateTime: null,
          childCount: treeChildren.get(share.rootNoteId)?.length || 0,
          hasChildren: (treeChildren.get(share.rootNoteId)?.length || 0) > 0,
        }
      : null,
  );

  function applyPage(nextPage: PublicNoteSharePage, nextBreadcrumb: Array<{ id: string; title: string }>) {
    Object.assign(page, nextPage);
    breadcrumb.value = nextBreadcrumb;
    void renderPage();
  }

  async function renderPage() {
    const renderVersion = ++pageRenderVersion;
    const sourceContent = page.content;
    const sourceType = page.type;
    headings.value = [];
    activeHeadingIndex.value = null;
    renderedHtml.value = '';
    if (sourceType === 'drawing') return;
    const nextHtml = await noteContentToHtml(normalizeNoteContentResourceUrls(sourceContent), sourceType);
    if (renderVersion !== pageRenderVersion) return;
    renderedHtml.value = nextHtml;
    await collectRenderedHeadings(renderVersion);
  }

  async function collectRenderedHeadings(renderVersion = pageRenderVersion) {
    await nextTick();
    if (renderVersion !== pageRenderVersion) return;
    const content = contentRef.value;
    // 从目录切换子页面时 pageLoading 会暂时卸载正文；等 loading 分支结束后由下方 watch 再收集，
    // 不能在这里把“DOM 尚未挂载”误判成“页面没有标题”。
    if (!content) return;
    const elements = Array.from(content.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')).filter((element) =>
      Boolean(String(element.textContent || '').trim()),
    );
    const minimum = elements.length ? Math.min(...elements.map((element) => Number(element.tagName.slice(1)))) : 1;
    headings.value = elements.map((element, index) => {
      const id = `shared-heading-${index}`;
      element.id = id;
      return {
        id,
        text: String(element.textContent || '').trim() || t('noteDetail.catalogUntitled'),
        level: Math.min(minimum + 3, Number(element.tagName.slice(1))),
        element,
      };
    });
    if (!isSubtreeShare.value) sidebarTab.value = 'outline';
    updateActiveHeading();
  }

  async function resolveShare() {
    if (!token.value) {
      requiresCode.value = false;
      errorMessage.value = t('noteShare.unavailableDescription');
      return;
    }
    loading.value = true;
    errorMessage.value = '';
    try {
      const requestedPage = String(route.query.page || '');
      const sessionTicket = readNoteShareSessionTicket(token.value);
      const data = await resolvePublicNoteShare(token.value, accessCode.value.trim(), requestedPage, sessionTicket);
      accessTicket.value = data.accessTicket;
      saveNoteShareSessionTicket(token.value, data.accessTicket, data.ticketExpiresIn);
      Object.assign(share, data.share);
      treeChildren.clear();
      treeChildren.set(data.share.rootNoteId, data.children || []);
      applyPage(data.page, data.breadcrumb || []);
      requiresCode.value = false;
      sidebarTab.value = data.share.scopeType === 'subtree' ? 'pages' : 'outline';
      document.title = `${data.page.title || t('note.untitled')} · ${t('noteShare.sharedNote')}`;
    } catch (error: any) {
      const code = String(error?.code || '');
      requiresCode.value = code === 'SHARE_CODE_REQUIRED' || code === 'SHARE_CODE_INVALID';
      errorMessage.value = error?.message || t('noteShare.unavailableDescription');
    } finally {
      loading.value = false;
    }
  }

  async function openPage(noteId: string) {
    if (!noteId || noteId === page.id || pageLoading.value) return;
    pageLoading.value = true;
    try {
      const data = await getPublicNoteSharePage(accessTicket.value, noteId);
      applyPage(data.page, data.breadcrumb || []);
      // Vue Router 在只传 query 时会清空 fragment；必须显式保留其中的分享令牌，保证复制/刷新仍可访问。
      await router.replace({
        query: { ...route.query, page: noteId === share.rootNoteId ? undefined : noteId },
        hash: route.hash,
      });
      document.title = `${data.page.title || t('note.untitled')} · ${t('noteShare.sharedNote')}`;
    } catch (error: any) {
      message.warning(error?.message || t('noteShare.pageUnavailable'));
    } finally {
      pageLoading.value = false;
    }
  }

  async function getTreeChildren(parentId: string) {
    const cached = treeChildren.get(parentId);
    if (cached) return cached;
    try {
      const data = await getPublicNoteShareTree(accessTicket.value, parentId);
      treeChildren.set(parentId, data.items || []);
      return data.items || [];
    } catch (error: any) {
      message.warning(error?.message || t('noteShare.directoryUnavailable'));
      throw error;
    }
  }

  function scrollToHeading(index: number) {
    const heading = headings.value[index];
    if (!readerRef.value || !heading?.element) return;
    activeHeadingIndex.value = index;
    scrollIntoContainer(readerRef.value, heading.element, 84);
  }

  function openPageFromDrawer(noteId: string) {
    mobileNavigationOpen.value = false;
    void openPage(noteId);
  }

  function scrollFromDrawer(index: number) {
    mobileNavigationOpen.value = false;
    nextTick(() => scrollToHeading(index));
  }

  function openInNewPage(path: string) {
    const href = router.resolve(path).href;
    const opened = window.open(href, '_blank', 'noopener,noreferrer');
    if (opened) opened.opener = null;
  }

  function scheduleActiveHeading() {
    if (headingSpyFrame) return;
    headingSpyFrame = window.requestAnimationFrame(() => {
      headingSpyFrame = 0;
      updateActiveHeading();
    });
  }

  function updateActiveHeading() {
    const reader = readerRef.value;
    if (!reader || !headings.value.length) return;
    const anchor = reader.getBoundingClientRect().top + 86;
    let selected = 0;
    for (const [index, heading] of headings.value.entries()) {
      if (heading.element.getBoundingClientRect().top <= anchor) selected = index;
      else break;
    }
    activeHeadingIndex.value = selected;
  }

  function handleContentClick(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (!target) return;
    const href = String(target.getAttribute('href') || '');
    const resource = parseResourceHref(href);
    if (!resource) {
      // 畸形的 lightnote: 引用也不能交给浏览器或系统协议处理器，避免绕过分享范围校验。
      if (/^lightnote:/i.test(href)) {
        event.preventDefault();
        message.info(t('noteShare.privateReference'));
        return;
      }
      target.setAttribute('target', '_blank');
      target.setAttribute('rel', 'noopener noreferrer');
      return;
    }
    event.preventDefault();
    if (resource.type === 'note') {
      void openPage(resource.id);
    } else {
      message.info(t('noteShare.privateReference'));
    }
  }

  function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  watch(token, () => {
    Object.assign(page, {
      id: '',
      parentId: null,
      title: '',
      content: '',
      type: 'html',
      revision: 1,
      updateTime: null,
    });
    accessTicket.value = '';
    requiresCode.value = false;
    void resolveShare();
  });

  watch(pageLoading, (busy) => {
    if (!busy && renderedHtml.value) void collectRenderedHeadings(pageRenderVersion);
  });

  onMounted(() => {
    readerRef.value?.addEventListener('scroll', scheduleActiveHeading, { passive: true });
    window.addEventListener('resize', scheduleActiveHeading, { passive: true });
    referrerMeta = document.head.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    if (!referrerMeta) {
      referrerMeta = document.createElement('meta');
      referrerMeta.name = 'referrer';
      referrerMeta.dataset.noteShareReferrer = 'true';
      document.head.appendChild(referrerMeta);
    } else {
      previousReferrerPolicy = referrerMeta.content;
    }
    referrerMeta.content = 'no-referrer';
    void resolveShare();
  });

  onBeforeUnmount(() => {
    if (headingSpyFrame) window.cancelAnimationFrame(headingSpyFrame);
    readerRef.value?.removeEventListener('scroll', scheduleActiveHeading);
    window.removeEventListener('resize', scheduleActiveHeading);
    if (!referrerMeta) return;
    if (referrerMeta.dataset.noteShareReferrer === 'true') referrerMeta.remove();
    else referrerMeta.content = previousReferrerPolicy || '';
    referrerMeta = null;
  });
</script>

<style scoped lang="less">
  .note-share-reader {
    height: 100%;
    min-height: 100vh;
    min-height: 100dvh;
    overflow-x: hidden;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    color: var(--text-color, #24231f);
    background: var(--body-bg-color, #f5f3ee);
  }

  .note-share-reader__header {
    position: sticky;
    top: 0;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 62px;
    padding: 0 clamp(24px, 3vw, 48px);
    box-sizing: border-box;
    border-bottom: 1px solid var(--card-border-color, #e5e1d8);
    background: var(--menu-body-bg-color, #fff);
  }

  .note-share-reader__brand {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 14px 0 0;
    font-weight: 750;
    letter-spacing: 0.08em;
  }

  .note-share-reader__brand-mark {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    color: #fff;
    background: var(--primary-color, #4e4b46);
    letter-spacing: 0;
  }

  .note-share-reader__nav {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .note-share-reader__center {
    display: grid;
    place-items: center;
    min-height: calc(100vh - 62px);
    min-height: calc(100dvh - 62px);
    padding: 24px;
  }

  .note-share-reader__gate {
    display: grid;
    gap: 14px;
    width: min(100%, 390px);
    padding: 30px;
    border: 1px solid var(--card-border-color, #e5e1d8);
    border-radius: 18px;
    background: var(--menu-body-bg-color, #fff);

    h1,
    p {
      margin: 0;
    }

    p {
      color: var(--desc-color, #77736a);
      line-height: 1.6;
    }
  }

  .note-share-reader__gate-icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border: 1px solid var(--primary-color);
    border-radius: 14px;
    color: var(--primary-color);
    background: var(--selected-bg-color);

    &.is-error {
      color: var(--error-color, #b53a3a);
      border-color: var(--error-color, #b53a3a);
      background: var(--error-bg-color, #fff2f2);
    }
  }

  .note-share-reader__gate-error {
    color: var(--error-color, #b53a3a) !important;
  }

  .note-share-reader__workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-height: calc(100vh - 62px);
    min-height: calc(100dvh - 62px);

    &.has-sidebar {
      grid-template-columns: 286px minmax(0, 1fr);
    }
  }

  .note-share-reader__sidebar {
    position: sticky;
    top: 62px;
    height: calc(100vh - 62px);
    height: calc(100dvh - 62px);
    border-right: 1px solid var(--card-border-color, #e5e1d8);
    background: var(--menu-body-bg-color, #fff);
  }

  .note-share-reader__sidebar-scroll {
    height: calc(100% - 54px);
    padding: 10px;
    box-sizing: border-box;
    overflow: auto;

    &.is-outline {
      overflow: hidden;
    }
  }

  .note-share-reader__tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    margin: 10px;
    padding: 4px;
    border: 1px solid var(--card-border-color, #e5e1d8);
    border-radius: 10px;
    background: var(--body-bg-color, #f5f3ee);
  }

  .note-share-reader__tab {
    min-height: 32px;

    &.is-active {
      color: var(--primary-color);
      border: 1px solid var(--primary-color);
      background: var(--menu-body-bg-color, #fff);
    }
  }

  .note-share-reader__sidebar-title {
    height: 54px;
    margin: 0;
    padding: 18px 16px 0;
    box-sizing: border-box;
    font-size: 14px;
  }

  .note-share-reader__outline-list {
    height: calc(100% - 12px);
  }

  .note-share-reader__drawer-outline {
    min-height: 0;
  }

  .note-share-reader__document-shell {
    min-width: 0;
  }

  .note-share-reader__mobile-bar {
    display: none;
  }

  .note-share-reader__article {
    width: min(100% - 48px, 880px);
    min-height: calc(100vh - 150px);
    margin: 34px auto 24px;
    padding: 54px 68px 70px;
    box-sizing: border-box;
    border: 1px solid var(--card-border-color, #e5e1d8);
    border-radius: 18px;
    background: var(--menu-body-bg-color, #fff);
  }

  .note-share-reader__breadcrumb {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 24px;
    color: var(--desc-color);
    font-size: 13px;

    .b_btn {
      min-height: 26px;
      padding: 0 4px;
      color: var(--desc-color);
    }
  }

  .note-share-reader__title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;

    h1 {
      margin: 0;
      font-size: clamp(30px, 4vw, 44px);
      line-height: 1.18;
      letter-spacing: -0.035em;
    }
  }

  .note-share-reader__description {
    margin: 12px 0 0;
    color: var(--desc-color);
    line-height: 1.65;
  }

  .note-share-reader__readonly-badge {
    flex: 0 0 auto;
    padding: 5px 9px;
    border: 1px solid var(--card-border-color);
    border-radius: 999px;
    color: var(--desc-color);
    background: var(--body-bg-color);
    font-size: 12px;
  }

  .note-share-reader__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    margin-top: 18px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--card-border-color);
    color: var(--desc-color);
    font-size: 12px;
  }

  .note-share-reader__content {
    padding-top: 28px;
    font-size: 16px;
    line-height: 1.85;
    overflow-wrap: anywhere;

    :deep(h1),
    :deep(h2),
    :deep(h3),
    :deep(h4),
    :deep(h5),
    :deep(h6) {
      scroll-margin-top: 84px;
      margin: 1.6em 0 0.65em;
      line-height: 1.35;
    }

    :deep(img) {
      max-width: 100%;
      height: auto;
      border-radius: 10px;
    }

    :deep(pre) {
      padding: 16px;
      overflow: auto;
      border: 1px solid var(--card-border-color);
      border-radius: 10px;
      background: var(--body-bg-color);
    }

    :deep(code) {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }

    :deep(blockquote) {
      margin-left: 0;
      padding-left: 16px;
      border-left: 3px solid var(--primary-color);
      color: var(--desc-color);
    }

    :deep(table) {
      display: block;
      max-width: 100%;
      border-collapse: collapse;
      overflow-x: auto;
    }

    :deep(th),
    :deep(td) {
      padding: 8px 10px;
      border: 1px solid var(--card-border-color);
    }
  }

  .note-share-reader__drawing {
    min-height: 520px;
    margin-top: 28px;
  }

  .note-share-reader__page-loading,
  .note-share-reader__empty {
    display: grid;
    place-items: center;
    min-height: 220px;
    color: var(--desc-color);
  }

  .note-share-reader__footer {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    padding: 4px 24px 30px;
    color: var(--desc-color);
    font-size: 12px;
  }

  @media (max-width: 900px) {
    .note-share-reader__workspace.has-sidebar {
      grid-template-columns: minmax(0, 1fr);
    }

    .note-share-reader__sidebar {
      display: none;
    }

    .note-share-reader__mobile-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 46px;
      padding: 0 16px;
      border-bottom: 1px solid var(--card-border-color);
      color: var(--desc-color);
      background: var(--menu-body-bg-color);
      font-size: 12px;
    }
  }

  @media (max-width: 640px) {
    .note-share-reader__header {
      height: 56px;
      padding: 0 max(14px, env(safe-area-inset-right)) 0 max(14px, env(safe-area-inset-left));
    }

    .note-share-reader__brand {
      font-size: 12px;
    }

    .note-share-reader__brand-mark {
      width: 28px;
      height: 28px;
    }

    .note-share-reader__nav-help {
      display: none;
    }

    .note-share-reader__article {
      width: 100%;
      min-height: auto;
      margin: 0;
      padding: 34px 20px 50px;
      border: 0;
      border-radius: 0;
    }

    .note-share-reader__title-row h1 {
      font-size: 30px;
    }

    .note-share-reader__readonly-badge {
      display: none;
    }

    .note-share-reader__footer {
      background: var(--menu-body-bg-color);
    }

    .note-share-reader__gate {
      padding: 24px;
    }
  }

  html.light-note-mobile-rendering & {
    .note-share-reader__article,
    .note-share-reader__header,
    .note-share-reader__mobile-bar {
      box-shadow: none;
    }

    .note-share-reader__tab.is-active,
    .note-share-reader__readonly-badge,
    .note-share-reader__gate-icon {
      border-width: 1px;
      border-style: solid;
    }
  }
</style>
