<template>
  <div
    class="help-container"
    :class="{
      'is-compact': isCompactHelpLayout,
      'is-landing': isLandingView,
    }"
  >
    <div v-if="isCompactHelpLayout" class="help-mobile-header">
      <BButton class="help-mobile-exit" :aria-label="t('help.exitToProfile')" @click="exitHelpCenter">
        <SvgIcon :src="icon.arrow_left" size="18" />
        <span>{{ t('help.exitToProfile') }}</span>
      </BButton>
      <span class="help-mobile-title">{{ t('help.title') }}</span>
      <div class="help-mobile-actions">
        <BTooltip :title="t('help.catalog')" :disabled="bookmark.isMobile">
          <BButton
            class="help-mobile-action"
            :class="{ active: isCompactCatalogOpen }"
            :aria-label="t('help.catalog')"
            :aria-expanded="isCompactCatalogOpen"
            :disabled="isSearching"
            aria-controls="help-article-list"
            @click="toggleCompactCatalog"
          >
            <SvgIcon :src="icon.noteDetail.catalogue" size="18" />
          </BButton>
        </BTooltip>
        <BTooltip :title="t('help.outline')" :disabled="bookmark.isMobile">
          <BButton
            class="help-mobile-action"
            :class="{ active: isCompactOutlineOpen }"
            :aria-label="t('help.outline')"
            :aria-expanded="isCompactOutlineOpen"
            :disabled="isSearching || isLandingView || !helpOutline.length"
            aria-controls="help-article-outline"
            @click="toggleCompactOutline"
          >
            <SvgIcon :src="icon.filterPanel.list" size="18" />
          </BButton>
        </BTooltip>
      </div>
    </div>
    <div
      class="help-body"
      :class="{ 'help-body--catalog-open': isCompactHelpLayout && isCompactCatalogOpen && !isSearching }"
    >
      <aside
        v-if="!isCompactHelpLayout || isCompactCatalogOpen || isCompactOutlineOpen"
        class="help-sidebar"
        :aria-label="isCompactOutlineOpen && !isCompactCatalogOpen ? t('help.outline') : t('help.catalog')"
      >
        <div
          v-if="isCompactHelpLayout && !isSearching && isCompactOutlineOpen && helpOutline.length"
          id="help-article-outline"
          class="help-compact-outline"
        >
          <HelpOutlineList
            :title="t('help.outline')"
            :items="helpOutline"
            :active-id="activeOutlineId"
            @select="scrollToHelpHeading"
          />
        </div>
        <div v-if="!isCompactHelpLayout || isCompactCatalogOpen" id="help-article-list" class="help-catalog">
          <BButton
            class="help-home-link"
            :class="{ active: isLandingView && !isSearching }"
            :aria-current="isLandingView && !isSearching ? 'page' : undefined"
            @click="goToHelpHome"
          >
            <span class="help-home-link__icon" aria-hidden="true">
              <SvgIcon :src="icon.common.question" size="17" />
            </span>
            <span class="help-home-link__copy">
              <strong>{{ t('help.title') }}</strong>
              <small>{{ t('help.homeDescription') }}</small>
            </span>
          </BButton>

          <div class="help-catalog__label">{{ t('help.catalog') }}</div>
          <div v-if="!helpConfigLoaded" class="help-catalog-state">
            <BLoading inline loading :title="t('help.loading')" />
          </div>
          <div v-else-if="helpConfigError" class="help-catalog-state is-error">
            <span>{{ t('help.loadFailed') }}</span>
            <BButton size="small" @click="loadHelpConfig">{{ t('help.retry') }}</BButton>
          </div>
          <div v-else-if="!serverOptions.length" class="help-catalog-state">
            {{ t('help.noArticles') }}
          </div>
          <div v-else class="help-catalog__scroll" v-auto-scrollbar>
            <section v-for="group in catalogGroups" :key="group.id" class="help-catalog-group">
              <BButton
                class="help-catalog-group__title"
                :class="{ active: activeSectionName === group.name && !checkId && !isSearching }"
                :aria-current="activeSectionName === group.name && !checkId && !isSearching ? 'page' : undefined"
                @click="openSection(group)"
              >
                <span>{{ group.name }}</span>
                <small>{{ group.items.length }}</small>
              </BButton>
              <BButton
                v-for="item in group.items"
                :key="item.id"
                class="help-catalog-item"
                :class="{ active: String(checkId) === String(item.id) && !isSearching }"
                :aria-current="String(checkId) === String(item.id) && !isSearching ? 'page' : undefined"
                :title="item.title"
                @click="logItem(item)"
              >
                <SvgIcon :src="icon.help_document" size="15" />
                <span class="text-hidden">{{ item.title }}</span>
              </BButton>
            </section>
          </div>
        </div>
      </aside>

      <main class="help-content-workspace">
        <header class="help-workspace-header" :class="{ 'is-discovery': isDiscoveryView }">
          <div v-if="isDiscoveryView" class="help-hero-copy">
            <span class="help-hero-eyebrow">{{ t('help.heroEyebrow') }}</span>
            <h1>{{ t('help.heroTitle') }}</h1>
            <p>{{ t('help.heroDescription') }}</p>
          </div>
          <div class="help-workspace-actions">
            <BInput
              id="help-search"
              v-model:value="searchValue"
              :placeholder="t('help.searchPlaceholder')"
              :height="isDiscoveryView ? '50px' : '42px'"
              class="help-search-input"
              clearable
            >
              <template #prefix>
                <SvgIcon :src="icon.navigation.search" size="17" />
              </template>
            </BInput>

            <BPopover
              v-if="!isCompactHelpLayout && !isSearching && !isLandingView && helpOutline.length"
              v-model:open="isCompactOutlineOpen"
              trigger="click"
              placement="bottom-right"
              overlay-class-name="help-outline-popover"
              @open-change="handleDesktopOutlineOpenChange"
            >
              <BButton
                class="help-workspace-tool"
                :class="{ active: isCompactOutlineOpen }"
                :aria-label="t('help.outline')"
                :aria-expanded="isCompactOutlineOpen"
                aria-controls="help-desktop-outline"
              >
                <SvgIcon :src="icon.filterPanel.list" size="17" />
                <span class="help-workspace-tool__label">{{ t('help.outline') }}</span>
              </BButton>
              <template #content>
                <div id="help-desktop-outline" class="help-tools-outline">
                  <HelpOutlineList
                    :title="t('help.outline')"
                    :items="helpOutline"
                    :active-id="activeOutlineId"
                    @select="scrollToHelpHeading"
                  />
                </div>
              </template>
            </BPopover>

            <BButton
              class="help-workspace-tool help-assistant-trigger"
              :class="{ active: isAssistantOpen }"
              :aria-label="t('help.aiTitle')"
              :aria-expanded="isAssistantOpen"
              aria-controls="help-ai-assistant"
              data-drawer-keep-open
              @click="toggleAssistant"
            >
              <SvgIcon :src="icon.common.magicWand" size="17" />
              <span class="help-workspace-tool__label">{{ t('help.aiEntry') }}</span>
            </BButton>
          </div>
        </header>

        <section v-if="isSearching && !selectedFromSearch" class="search-results-panel">
          <div class="search-results-header">
            <span class="search-results-count">{{ t('help.searchResults', { count: searchResults.length }) }}</span>
            <span v-if="searchResults.length === 0 && !helpConfigError" class="search-results-hint">
              {{ t('help.searchEmpty') }}
            </span>
          </div>
          <div v-if="helpConfigError" class="help-state-card is-error" role="alert">
            <SvgIcon :src="icon.common.question" size="22" />
            <strong>{{ t('help.loadFailed') }}</strong>
            <BButton size="small" @click="loadHelpConfig">{{ t('help.retry') }}</BButton>
          </div>
          <div v-else-if="searchResults.length === 0" class="help-state-card">
            <SvgIcon :src="icon.navigation.search" size="22" />
            <span>{{ t('help.searchSuggestion') }}</span>
          </div>
          <template v-else>
            <BButton
              v-for="result in searchResults"
              :key="result.id"
              class="search-result-card"
              @click="selectSearchResult(result)"
            >
              <span class="search-result-icon" aria-hidden="true">
                <SvgIcon :src="icon.help_document" size="18" />
              </span>
              <span class="search-result-body">
                <span class="search-result-title" v-html="highlightText(result.title, searchValue)"></span>
                <span class="search-result-snippets">
                  <span
                    v-for="(snippet, si) in result.snippets"
                    :key="si"
                    class="search-result-snippet"
                    v-html="highlightText(snippet, searchValue)"
                  ></span>
                </span>
              </span>
            </BButton>
          </template>
        </section>

        <section v-else-if="isSectionView && activeSection" class="help-section-panel">
          <div class="help-section-panel__header">
            <BButton class="help-section-back" @click="goToHelpHome">
              <SvgIcon :src="icon.arrow_left" size="15" />
              <span>{{ t('help.backToTopics') }}</span>
            </BButton>
            <div>
              <h2>{{ activeSection.name }}</h2>
              <p>{{ t('help.sectionResultCount', { count: activeSection.items.length }) }}</p>
            </div>
          </div>
          <div class="help-section-list">
            <BButton
              v-for="item in activeSection.items"
              :key="item.id"
              class="search-result-card"
              @click="openSectionArticle(item)"
            >
              <span class="search-result-icon" aria-hidden="true">
                <SvgIcon :src="icon.help_document" size="18" />
              </span>
              <span class="search-result-body">
                <strong class="search-result-title">{{ item.title }}</strong>
                <span class="search-result-snippet">{{ articlePreview(item) }}</span>
              </span>
            </BButton>
          </div>
        </section>

        <section v-else-if="isLandingView" class="help-topic-section">
          <div class="help-topic-section__header">
            <div>
              <h2>{{ t('help.topicTitle') }}</h2>
              <p>{{ t('help.topicDescription') }}</p>
            </div>
            <span v-if="helpConfigLoaded && !helpConfigError" class="help-topic-section__count">
              {{ t('help.articleCount', { count: serverOptions.length }) }}
            </span>
          </div>
          <div v-if="!helpConfigLoaded" class="help-state-card">
            <BLoading inline loading :title="t('help.loading')" />
          </div>
          <div v-else-if="helpConfigError" class="help-state-card is-error" role="alert">
            <SvgIcon :src="icon.common.question" size="22" />
            <strong>{{ t('help.loadFailed') }}</strong>
            <BButton size="small" @click="loadHelpConfig">{{ t('help.retry') }}</BButton>
          </div>
          <div v-else-if="!serverOptions.length" class="help-state-card">
            <SvgIcon :src="icon.common.question" size="22" />
            <span>{{ t('help.noArticles') }}</span>
          </div>
          <div v-else class="help-topic-grid">
            <BButton
              v-for="section in catalogGroups"
              :key="section.id"
              class="help-topic-card"
              @click="openSection(section)"
            >
              <span class="help-topic-card__icon" aria-hidden="true">
                <SvgIcon :src="icon.help_document" size="20" />
              </span>
              <span class="help-topic-card__copy">
                <strong>{{ section.name }}</strong>
                <small>{{ t('help.sectionDescription', { name: section.name }) }}</small>
                <span>{{ t('help.relatedArticles', { count: section.items.length }) }}</span>
              </span>
            </BButton>
          </div>
        </section>

        <div
          v-else
          id="view-body"
          class="help-editor"
          :class="{ 'help-editor--search-active': selectedFromSearch }"
          @scroll="syncActiveOutline"
        >
          <BButton v-if="selectedFromSearch" class="search-back-bar" @click="backToSearchResults">
            <SvgIcon :src="icon.arrow_left" size="16" />
            <span>{{ t('help.backToResults') }}</span>
          </BButton>
          <BButton v-else-if="activeSectionName" class="search-back-bar" @click="navigateToSection(activeSectionName)">
            <SvgIcon :src="icon.arrow_left" size="16" />
            <span>{{ t('help.backToSection', { name: activeSectionName }) }}</span>
          </BButton>
          <article class="help-article-content" v-html="renderedContent"></article>
        </div>
      </main>
    </div>

    <BDrawer
      :open="isAssistantOpen"
      :title="t('help.aiTitle')"
      width="420px"
      height="min(78dvh, 680px)"
      :placement="isCompactHelpLayout ? 'bottom' : 'right'"
      :modal="isCompactHelpLayout"
      :close-on-click-outside="!isCompactHelpLayout"
      :destroy-on-close="false"
      :mobile-centered-header="isCompactHelpLayout"
      :show-handle="isCompactHelpLayout"
      body-padding="0"
      @close="isAssistantOpen = false"
    >
      <div class="help-assistant-drawer-content">
        <div class="help-assistant-intro">
          <span class="help-assistant-intro__icon" aria-hidden="true">
            <SvgIcon :src="icon.common.magicWand" size="18" />
          </span>
          <p>{{ t('help.aiDescription') }}</p>
        </div>
        <AiSkillPanel
          id="help-ai-assistant"
          class="help-ai-panel"
          :title="t('help.aiTitle')"
          skill-id="help.answer"
          :show-prompt="true"
          surface="help.center"
          :prompt-rows="3"
          :placeholder="t('help.aiPlaceholder')"
          :submit-label="t('help.aiSubmit')"
          presentation="sidebar"
          composer-variant="chat"
          :show-header="false"
          :show-grounding="false"
          :clear-prompt-on-success="true"
        />
      </div>
    </BDrawer>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BLoading from '@/components/base/BasicComponents/BLoading.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import BPopover from '@/components/base/BasicComponents/BPopover.vue';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import { getHelpConfig } from '@/api/helpApi';
  import { useRoute, useRouter } from 'vue-router';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import AiSkillPanel from '@/components/aiSkills/AiSkillPanel.vue';
  import HelpOutlineList from './HelpOutlineList.vue';
  import { groupHelpArticles, normalizeHelpSection, type HelpArticle, type HelpSectionGroup } from './helpCatalog';

  type HelpOutlineItem = {
    id: string;
    text: string;
    level: number;
  };
  type HelpSearchResult = HelpArticle & {
    score: number;
    snippets: string[];
  };

  const { t } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const helpEntryHistoryPosition =
    typeof window.history.state?.position === 'number' ? window.history.state.position : null;
  const helpInfo: HelpArticle = { id: '', title: '', content: '' };
  const node = ref<HelpArticle>(helpInfo);
  const serverOptions = ref<HelpArticle[]>([]);

  const bookmark = bookmarkStore();
  const isCompactHelpLayout = computed(() => bookmark.isMobileDevice);
  const checkId = ref('');
  const activeOutlineId = ref('');
  const isCompactCatalogOpen = ref(false);
  const isCompactOutlineOpen = ref(false);
  const isAssistantOpen = ref(false);
  const searchValue = ref('');
  const selectedFromSearch = ref(false);
  const helpConfigLoaded = ref(false);
  const helpConfigError = ref(false);
  const isSearching = computed(() => searchValue.value.trim().length > 0);
  const activeSectionName = computed(routeSectionName);
  const catalogGroups = computed(() => groupHelpArticles(serverOptions.value, t('help.uncategorizedSection')));
  const activeSection = computed(
    () => catalogGroups.value.find((group) => group.name === activeSectionName.value) || null,
  );
  const isSectionView = computed(
    () => !isSearching.value && !checkId.value && !selectedFromSearch.value && Boolean(activeSection.value),
  );
  const isLandingView = computed(
    () =>
      !isSearching.value &&
      !checkId.value &&
      !selectedFromSearch.value &&
      (!activeSectionName.value || !helpConfigLoaded.value || helpConfigError.value),
  );
  const isDiscoveryView = computed(() => !checkId.value && !selectedFromSearch.value);
  const renderedHelp = computed(() => {
    const source = node.value?.content || '';
    if (!source) {
      return { html: '', outline: [] as HelpOutlineItem[] };
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${source}</div>`, 'text/html');
    const headings = Array.from(doc.body.querySelectorAll<HTMLHeadingElement>('h1, h2, h3, h4, h5, h6'));
    const outline = headings
      .map((heading, index) => {
        const text = (heading.innerText || heading.textContent || '').trim();
        if (!text) return null;
        const id = `help-heading-${index}`;
        heading.id = id;
        return {
          id,
          text,
          level: Number(heading.tagName.replace('H', '')),
        };
      })
      .filter(Boolean) as HelpOutlineItem[];
    return {
      html: doc.body.firstElementChild?.innerHTML || source,
      outline,
    };
  });
  const renderedContent = computed(() => renderedHelp.value.html);
  const helpOutline = computed(() => renderedHelp.value.outline);
  function applyArticle(item: HelpArticle) {
    isCompactCatalogOpen.value = false;
    isCompactOutlineOpen.value = false;
    isAssistantOpen.value = false;
    checkId.value = String(item.id);
    activeOutlineId.value = '';
    nextTick(() => {
      const dom = document.getElementById('view-body');
      if (dom) {
        dom.scrollTop = 0;
      }
    });
    node.value = item;
  }

  function routeArticleId() {
    const value = route.query.article;
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }

  function routeSectionName() {
    const value = route.query.section;
    return Array.isArray(value) ? String(value[0] || '') : String(value || '');
  }

  function helpQuery(articleId = '', sectionName = '') {
    const query = { ...route.query };
    if (articleId) query.article = articleId;
    else delete query.article;
    if (sectionName) query.section = sectionName;
    else delete query.section;
    return query;
  }

  function navigateToArticle(articleId: string, replace = false, sectionName = routeSectionName()) {
    if (routeArticleId() === articleId && routeSectionName() === sectionName) return;
    const navigation = { name: 'help', query: helpQuery(articleId, sectionName) };
    void (replace ? router.replace(navigation) : router.push(navigation));
  }

  function navigateToSection(sectionName: string, replace = false) {
    navigateToArticle('', replace, sectionName);
  }

  function exitHelpCenter() {
    isCompactCatalogOpen.value = false;
    isCompactOutlineOpen.value = false;
    const currentHistoryPosition =
      typeof window.history.state?.position === 'number' ? window.history.state.position : null;
    if (
      helpEntryHistoryPosition !== null &&
      currentHistoryPosition !== null &&
      currentHistoryPosition >= helpEntryHistoryPosition &&
      window.history.length > 1
    ) {
      // 一次跨过本次帮助中心内累积的文章记录，回到进入帮助中心前的页面。
      router.go(-(currentHistoryPosition - helpEntryHistoryPosition + 1));
      return;
    }
    void router.replace({ name: 'personCenter' });
  }

  function resetToIntro() {
    isCompactCatalogOpen.value = false;
    isCompactOutlineOpen.value = false;
    isAssistantOpen.value = false;
    checkId.value = '';
    activeOutlineId.value = '';
    node.value = helpInfo;
    nextTick(() => {
      const dom = document.getElementById('view-body');
      if (dom) dom.scrollTop = 0;
    });
  }

  function logItem(item: HelpArticle) {
    searchValue.value = '';
    selectedFromSearch.value = false;
    applyArticle(item);
    navigateToArticle(String(item.id), false, normalizeHelpSection(item.helpSection, t('help.uncategorizedSection')));
  }
  function goToHelpHome() {
    searchValue.value = '';
    selectedFromSearch.value = false;
    resetToIntro();
    navigateToArticle('', false, '');
  }
  function openSection(section: HelpSectionGroup) {
    searchValue.value = '';
    selectedFromSearch.value = false;
    resetToIntro();
    navigateToSection(section.name);
  }
  function openSectionArticle(item: HelpArticle) {
    if (!activeSectionName.value) return;
    applyArticle(item);
    navigateToArticle(String(item.id), false, activeSectionName.value);
  }
  function articlePreview(item: HelpArticle) {
    const text = stripHtml(item.content || '');
    return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  }
  function toggleCompactCatalog() {
    isCompactCatalogOpen.value = !isCompactCatalogOpen.value;
    if (isCompactCatalogOpen.value) {
      isCompactOutlineOpen.value = false;
    }
  }
  function toggleCompactOutline() {
    isCompactOutlineOpen.value = !isCompactOutlineOpen.value;
    if (isCompactOutlineOpen.value) {
      isCompactCatalogOpen.value = false;
      isAssistantOpen.value = false;
    }
  }
  function handleDesktopOutlineOpenChange(open: boolean) {
    isCompactOutlineOpen.value = open;
    if (open) isAssistantOpen.value = false;
  }
  function toggleAssistant() {
    isAssistantOpen.value = !isAssistantOpen.value;
    if (isAssistantOpen.value) {
      isCompactOutlineOpen.value = false;
    }
  }
  function scrollToHelpHeading(id: string) {
    activeOutlineId.value = id;
    isCompactOutlineOpen.value = false;
    nextTick(() => {
      const container = document.getElementById('view-body');
      const heading = container?.querySelector<HTMLElement>(`#${id}`);
      if (!container || !heading) return;
      container.scrollTo({
        top: Math.max(heading.offsetTop - 14, 0),
        behavior: 'smooth',
      });
    });
  }
  function syncActiveOutline() {
    const container = document.getElementById('view-body');
    if (!container || !helpOutline.value.length) return;
    const headings = helpOutline.value
      .map((item) => container.querySelector<HTMLElement>(`#${item.id}`))
      .filter(Boolean) as HTMLElement[];
    const current = [...headings].reverse().find((heading) => heading.offsetTop - container.scrollTop <= 36);
    activeOutlineId.value = current?.id || helpOutline.value[0]?.id || '';
  }
  /** 从 HTML 中提取纯文本 */
  function stripHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
  }

  /** 在文本中高亮关键词（返回安全 HTML） */
  function escapeHtml(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function highlightText(text: string, keyword: string): string {
    const safeText = escapeHtml(text);
    if (!keyword?.trim()) return safeText;
    const escapedKeyword = escapeHtml(keyword.trim());
    const escaped = escapedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return safeText.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  /** 从纯文本中提取匹配关键词的上下文片段 */
  function findSnippets(text: string, keyword: string, contextChars = 80, maxSnippets = 2): string[] {
    if (!keyword?.trim()) return [];
    const lower = text.toLowerCase();
    const kw = keyword.toLowerCase();
    const snippets: string[] = [];
    let pos = 0;
    while ((pos = lower.indexOf(kw, pos)) !== -1 && snippets.length < maxSnippets) {
      const start = Math.max(0, pos - contextChars);
      const end = Math.min(text.length, pos + kw.length + contextChars);
      let snippet = text.slice(start, end);
      if (start > 0) snippet = '…' + snippet;
      if (end < text.length) snippet = snippet + '…';
      snippets.push(snippet);
      pos = pos + kw.length;
    }
    return snippets;
  }

  /** 全文搜索结果（标题+正文匹配，按分数排序） */
  const searchResults = computed(() => {
    const kw = searchValue.value.trim();
    if (!kw) return [];
    return serverOptions.value
      .map((item) => {
        const titleText = item.title || '';
        const contentText = stripHtml(item.content || '');
        const titleLower = titleText.toLowerCase();
        const kwLower = kw.toLowerCase();

        const titleMatch = titleLower.includes(kwLower);
        const contentSnippets = findSnippets(contentText, kw);
        const snippets = titleMatch ? [] : contentSnippets;
        const contentMatch = snippets.length > 0;

        if (!titleMatch && !contentMatch) return null;

        // 分数：标题命中 10 分，正文每段 3 分
        const score = (titleMatch ? 10 : 0) + snippets.length * 3;
        return {
          ...item,
          score,
          snippets: titleMatch ? findSnippets(contentText, kw, 120, 1) : snippets,
        } as HelpSearchResult;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score);
  });

  /** 点击搜索结果 → 加载文章，保持搜索词 */
  function selectSearchResult(result: HelpSearchResult) {
    selectedFromSearch.value = true;
    applyArticle(result);
    navigateToArticle(String(result.id), false, '');
  }

  /** 返回搜索结果列表 */
  function backToSearchResults() {
    selectedFromSearch.value = false;
    navigateToArticle('', false, '');
  }

  /** 搜索词变化时重置选中状态 */
  watch(searchValue, (value, previousValue) => {
    if (value.trim()) {
      isCompactCatalogOpen.value = false;
      isCompactOutlineOpen.value = false;
    }
    if (!value.trim()) {
      selectedFromSearch.value = false;
    } else if (selectedFromSearch.value) {
      // 搜索内容变化（未清空）→ 返回搜索结果，更新新关键词
      selectedFromSearch.value = false;
    }
    if (value.trim() && value !== previousValue && routeArticleId() && !selectedFromSearch.value) {
      navigateToArticle('', true, '');
    } else if (value.trim() && value !== previousValue && routeSectionName()) {
      navigateToSection('', true);
    }
  });

  watch(isCompactHelpLayout, () => {
    isCompactCatalogOpen.value = false;
    isCompactOutlineOpen.value = false;
    isAssistantOpen.value = false;
  });

  function setupClickListener() {
    document.addEventListener('click', imgClick);
  }
  function removeClickListener() {
    document.removeEventListener('click', imgClick);
  }
  function imgClick(e: any) {
    if (e.target?.className === 'bookmark-image') {
      bookmark.refreshViewer(e.target.src, {});
    }
  }

  let unavailableArticleId = '';

  async function loadHelpConfig() {
    helpConfigLoaded.value = false;
    helpConfigError.value = false;
    try {
      const res = await getHelpConfig();
      if (res.status !== 200 || !Array.isArray(res.data)) {
        throw new Error('INVALID_HELP_CONFIG_RESPONSE');
      }
      serverOptions.value = res.data;
      helpConfigLoaded.value = true;
      openArticleFromRoute();
    } catch {
      helpConfigLoaded.value = true;
      helpConfigError.value = true;
    }
  }

  function openArticleFromRoute() {
    if (!helpConfigLoaded.value || helpConfigError.value) return;
    const articleId = routeArticleId();
    if (!articleId) {
      unavailableArticleId = '';
      resetToIntro();
      const sectionName = routeSectionName();
      if (sectionName && !catalogGroups.value.some((group) => group.name === sectionName)) {
        navigateToSection('', true);
        message.warning(t('help.sectionUnavailable'));
      }
      return;
    }
    const target = serverOptions.value.find((item) => String(item.id) === articleId);
    if (!target) {
      resetToIntro();
      navigateToArticle('', true);
      if (unavailableArticleId !== articleId) {
        unavailableArticleId = articleId;
        message.warning(t('help.articleUnavailable'));
      }
      return;
    }
    unavailableArticleId = '';
    if (String(checkId.value) === articleId && (selectedFromSearch.value || !isSearching.value)) return;
    searchValue.value = '';
    selectedFromSearch.value = false;
    applyArticle(target);
  }

  watch(
    () => [route.query.article, route.query.section],
    () => openArticleFromRoute(),
  );

  onMounted(() => {
    setupClickListener();
    loadHelpConfig();
  });

  onUnmounted(() => {
    removeClickListener();
  });
</script>

<style lang="less">
  .help-container {
    display: flex;
    width: 100%;
    height: 100%;
    padding: clamp(12px, 1.4vw, 22px);
    box-sizing: border-box;
    flex-direction: column;
    gap: 12px;
    color: var(--text-color);
    background: var(--surface-page-bg);
  }

  .help-mobile-header {
    position: relative;
    display: flex;
    min-height: 40px;
    flex: 0 0 40px;
    align-items: center;
  }

  .help-mobile-exit.b_btn {
    position: relative;
    z-index: 1;
    height: 36px;
    padding: 0 8px;
    gap: 5px;
    border: 0 !important;
    color: var(--text-color);
    background: transparent;
    box-shadow: none;
  }

  .help-mobile-title {
    position: absolute;
    left: 50%;
    max-width: 42%;
    overflow: hidden;
    transform: translateX(-50%);
    color: var(--text-color);
    font-size: 17px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .help-mobile-actions {
    position: relative;
    z-index: 1;
    display: flex;
    min-width: 0;
    margin-left: auto;
    align-items: center;
    gap: 4px;
  }

  .help-mobile-action.b_btn {
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid transparent !important;
    border-radius: 9px;
    color: var(--desc-color);
    background: transparent;
  }
  .help-mobile-action.b_btn.active {
    border-color: var(--resource-bookmark-color) !important;
    color: var(--resource-bookmark-color);
    background: var(--primary-btn-bg-color);
  }

  .help-body {
    position: relative;
    display: grid;
    grid-template-columns: 236px minmax(0, 1fr);
    grid-template-areas: 'catalog content';
    gap: 14px;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .help-sidebar {
    grid-area: catalog;
    display: flex;
    min-height: 0;
    box-sizing: border-box;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }

  .help-catalog {
    display: flex;
    min-height: 0;
    flex: 1 1 auto;
    padding: 12px 10px;
    box-sizing: border-box;
    flex-direction: column;
    gap: 8px;
    overflow: hidden;
  }

  .help-home-link.b_btn {
    width: 100%;
    height: auto;
    min-height: 58px;
    padding: 8px;
    justify-content: flex-start;
    gap: 9px;
    border: 1px solid transparent !important;
    border-radius: 10px;
    color: var(--text-color);
    background: transparent;
    line-height: 1.35;
    text-align: left;
  }

  .help-home-link.b_btn.active {
    border-color: var(--resource-bookmark-color) !important;
    color: var(--resource-bookmark-color);
    background: var(--primary-btn-bg-color);
  }

  .help-home-link__icon {
    display: inline-flex;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    color: var(--resource-bookmark-color);
    background: var(--workspace-panel-bg-color);
  }

  .help-home-link.active .help-home-link__icon {
    border-color: var(--resource-bookmark-color);
    color: #ffffff;
    background: var(--resource-bookmark-color);
  }

  .help-home-link__copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .help-home-link__copy strong,
  .help-home-link__copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .help-home-link__copy strong {
    font-size: 14px;
  }

  .help-home-link__copy small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .help-catalog__label {
    padding: 10px 8px 2px;
    color: var(--desc-color);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
  }

  .help-catalog__scroll {
    min-height: 0;
    flex: 1 1 auto;
    padding-right: 2px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .help-catalog-group + .help-catalog-group {
    margin-top: 12px;
  }

  .help-catalog-group__title.b_btn {
    width: 100%;
    height: 28px;
    margin: 0 0 3px;
    padding: 0 8px;
    justify-content: space-between;
    border: 1px solid transparent !important;
    border-radius: 7px;
    color: var(--desc-color);
    background: transparent;
    font-size: 11px;
    font-weight: 600;
    line-height: 18px;
    text-align: left;
  }

  .help-catalog-group__title.b_btn small {
    color: inherit;
    font-size: 10px;
    font-weight: 500;
  }

  .help-catalog-group__title.b_btn.active {
    border-color: var(--resource-bookmark-color) !important;
    color: var(--resource-bookmark-color);
    background: var(--primary-btn-bg-color);
  }

  .help-catalog-item.b_btn {
    position: relative;
    width: 100%;
    height: 34px;
    min-width: 0;
    padding: 0 9px;
    justify-content: flex-start;
    gap: 8px;
    overflow: hidden;
    border: 1px solid transparent !important;
    border-radius: 8px;
    color: var(--catalog-color);
    background: transparent;
    font-size: 13px;
    text-align: left;
  }

  .help-catalog-item.b_btn .text-hidden {
    min-width: 0;
    flex: 1 1 auto;
    text-align: left;
  }

  .help-catalog-item.b_btn.active {
    border-color: var(--resource-bookmark-color) !important;
    color: var(--resource-bookmark-color);
    background: var(--primary-btn-bg-color);
    font-weight: 700;
  }

  .help-catalog-state {
    display: flex;
    min-height: 100px;
    padding: 12px;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 10px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.5;
    text-align: center;
  }

  .help-catalog-state.is-error {
    color: var(--danger-color);
  }

  .help-content-workspace {
    grid-area: content;
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 14px;
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }

  .help-workspace-header {
    display: flex;
    padding: 14px 20px;
    min-width: 0;
    flex: 0 0 auto;
    justify-content: center;
    box-sizing: border-box;
    border-bottom: 1px solid var(--surface-divider-color);
  }

  .help-workspace-header.is-discovery {
    padding: clamp(30px, 4vw, 52px) clamp(24px, 5vw, 64px) 34px;
    align-items: flex-start;
    flex-direction: column;
    gap: 22px;
    background: var(--surface-raised-background);
  }

  .help-hero-copy {
    max-width: 680px;
  }

  .help-hero-eyebrow {
    display: inline-flex;
    margin-bottom: 10px;
    color: var(--resource-bookmark-color);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .help-hero-copy h1 {
    margin: 0;
    color: var(--text-color);
    font-size: clamp(28px, 3vw, 40px);
    line-height: 1.18;
    letter-spacing: -0.025em;
  }

  .help-hero-copy p {
    max-width: 620px;
    margin: 12px 0 0;
    color: var(--desc-color);
    font-size: 14px;
    line-height: 1.75;
  }

  .help-search-input {
    width: 100% !important;
    min-width: 0;
    flex: 1 1 auto;
    box-sizing: border-box;
  }

  .help-search-input.input-container {
    width: 100% !important;
  }

  .help-search-input .b-input {
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 11px;
    color: var(--text-color);
    background: var(--workspace-panel-bg-color);
  }

  .help-search-input .b-input:focus-visible {
    border-color: var(--resource-bookmark-color) !important;
    outline: 2px solid var(--primary-btn-bg-color);
    outline-offset: -2px;
  }

  .help-workspace-header.is-discovery .help-search-input .b-input {
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow) !important;
  }

  .help-workspace-actions {
    display: flex;
    width: 100%;
    max-width: 860px;
    min-width: 0;
    align-items: center;
    gap: 9px;
  }

  .help-workspace-actions > .b-popover-trigger {
    flex: 0 0 auto;
  }

  .help-workspace-tool.b_btn {
    height: 42px;
    padding: 0 13px;
    flex: 0 0 auto;
    gap: 7px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 11px;
    color: var(--desc-color);
    background: var(--card-background);
  }

  .help-workspace-header.is-discovery .help-workspace-tool.b_btn {
    height: 50px;
  }

  .help-workspace-tool.b_btn.active {
    border-color: var(--resource-bookmark-color) !important;
    color: var(--resource-bookmark-color);
    background: var(--primary-btn-bg-color);
    font-weight: 700;
  }

  .help-assistant-trigger.b_btn {
    border-color: var(--resource-bookmark-color) !important;
    color: var(--resource-bookmark-color);
    background: var(--primary-btn-bg-color);
  }

  .help-assistant-trigger.b_btn.active {
    color: #ffffff;
    background: var(--resource-bookmark-color);
  }

  .help-workspace-tool__label {
    line-height: 1;
  }

  .help-tools-outline {
    min-width: 0;
    padding: 4px 0;
    box-sizing: border-box;
    overflow: hidden;
    border: 0;
    background: transparent;
  }

  .help-outline-popover {
    width: min(300px, calc(100vw - 16px));
    max-height: min(62vh, 520px);
    padding: 10px 8px;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .help-assistant-drawer-content {
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    background: var(--card-background);
  }

  .help-assistant-intro {
    display: flex;
    margin: 14px 16px 0;
    padding: 12px;
    flex: 0 0 auto;
    align-items: flex-start;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--workspace-panel-bg-color);
  }

  .help-assistant-intro__icon {
    display: inline-flex;
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--resource-bookmark-color);
    border-radius: 10px;
    color: var(--resource-bookmark-color);
    background: var(--primary-btn-bg-color);
  }

  .help-assistant-intro p {
    margin: 1px 0 0;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.65;
  }

  .help-assistant-drawer-content .help-ai-panel {
    height: auto;
    min-height: 0;
    flex: 1 1 auto;
    padding: 16px;
    overflow: hidden;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .tag-explanation {
    margin: 20px auto;
    font-family: var(--app-font-family);
  }
  .bookmark-definition {
    background-color: var(--background-color);
    border-left: 4px solid #007bff;
    padding: 0 20px;
    margin: 20px 0;
  }
  :deep(.bookmark-example) {
    text-align: center;
  }
  .bookmark-image {
    width: 100%;
    height: auto;
    border: 1px solid #ddd;
    padding: 5px;
  }
  .svg-code {
    font-family: 'Courier New', Courier, monospace;
    overflow-wrap: break-word;
    background-color: var(--background-color);
    padding: 10px;
    border: 1px solid #ccc;
  }
  .help-editor {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    padding: clamp(28px, 4vw, 52px);
    overflow: auto;
    box-sizing: border-box;
    background: var(--card-background);
  }

  .help-article-content {
    width: 100%;
    max-width: 820px;
    margin: 0 auto;
    color: var(--text-color);
    font-size: 15px;
    line-height: 1.8;
  }

  .help-article-content > :first-child {
    margin-top: 0;
  }

  .help-article-content > :last-child {
    margin-bottom: 0;
  }

  .help-article-content h1,
  .help-article-content h2,
  .help-article-content h3,
  .help-article-content h4,
  .help-article-content h5,
  .help-article-content h6 {
    color: var(--text-color);
    line-height: 1.35;
    scroll-margin-top: 24px;
  }

  .help-article-content h1,
  .help-article-content h2 {
    margin: 38px 0 18px;
    letter-spacing: -0.02em;
  }

  .help-article-content > h1:first-child,
  .help-article-content > h2:first-child {
    margin-top: 0;
    margin-bottom: 26px;
  }

  .help-article-content h3,
  .help-article-content h4,
  .help-article-content h5,
  .help-article-content h6 {
    margin: 32px 0 12px;
  }

  .help-article-content p {
    margin: 0 0 18px;
    line-height: 1.82;
  }

  .help-article-content ul,
  .help-article-content ol {
    margin: 12px 0 20px;
    padding-left: 1.75em;
  }

  .help-article-content li {
    margin: 6px 0;
    line-height: 1.78;
  }

  .help-article-content img {
    max-width: 100%;
    height: auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
  }

  .help-article-content a {
    color: var(--resource-bookmark-color);
  }

  .help-compact-outline {
    width: 100%;
    max-height: min(38vh, 320px);
    padding: 12px 6px;
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }

  .help-container.is-compact {
    height: auto;
    min-height: 100%;
    padding: 10px 12px 18px;

    .help-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow: visible;
    }

    .help-sidebar {
      width: 100%;
      min-width: 0;
      max-width: none;
      flex: 0 0 auto;
      overflow: visible;
    }

    .help-content-workspace {
      width: 100%;
      min-height: 0;
      flex: 0 0 auto;
      overflow: visible;
    }

    .help-body--catalog-open {
      height: calc(100vh - 82px);
      overflow: hidden;
    }

    .help-body--catalog-open .help-sidebar {
      height: 100%;
      min-height: 0;
      flex: 1 1 auto;
      overflow: hidden;
    }

    .help-body--catalog-open .help-content-workspace {
      display: none;
    }

    .help-body--catalog-open .help-catalog {
      height: 100%;
      min-height: 0;
      flex: 1 1 auto;
      overflow: hidden;
    }

    .help-body--catalog-open .help-catalog__scroll {
      min-height: 0;
      flex: 1 1 auto;
      overscroll-behavior: contain;
      touch-action: pan-y;
    }

    .help-workspace-header {
      padding: 12px 14px;
    }

    .help-workspace-header.is-discovery {
      padding: 26px 18px 24px;
      gap: 18px;
    }

    .help-hero-copy h1 {
      font-size: clamp(26px, 7vw, 34px);
    }

    .help-topic-section,
    .help-section-panel,
    .search-results-panel {
      overflow: visible;
    }

    .help-editor {
      width: 100%;
      height: auto;
      min-height: 0;
      flex: 0 0 auto;
      padding: 26px 20px;
      overflow: visible;
    }

    .help-workspace-actions {
      gap: 8px;
    }

    .help-workspace-tool.b_btn {
      width: 42px;
      height: 42px;
      padding: 0;
    }

    .help-workspace-header.is-discovery .help-workspace-tool.b_btn {
      width: 50px;
      height: 50px;
    }

    .help-workspace-tool__label {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  }

  .help-topic-section {
    flex: 1 1 auto;
    min-height: 0;
    padding: clamp(24px, 3vw, 38px);
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .help-topic-section__header {
    display: flex;
    margin-bottom: 22px;
    align-items: flex-end;
    justify-content: space-between;
    gap: 18px;
  }

  .help-topic-section__header h2 {
    margin: 0;
    color: var(--text-color);
    font-size: 20px;
    line-height: 1.35;
  }

  .help-topic-section__header p {
    margin: 6px 0 0;
    color: var(--desc-color);
    font-size: 13px;
    line-height: 1.6;
  }

  .help-topic-section__count {
    flex: 0 0 auto;
    color: var(--desc-color);
    font-size: 12px;
  }

  .help-topic-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .help-topic-card.b_btn {
    --help-topic-color: var(--resource-bookmark-color);
    width: 100%;
    height: auto;
    min-height: 142px;
    padding: 18px;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 13px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 13px;
    color: var(--text-color);
    background: var(--workspace-panel-bg-color);
    box-shadow: none;
    white-space: normal;
    text-align: left;
    transition:
      border-color 0.18s ease,
      transform 0.18s ease,
      box-shadow 0.18s ease;
  }

  .help-topic-card:nth-child(6n + 2) {
    --help-topic-color: var(--resource-tag-color);
  }

  .help-topic-card:nth-child(6n + 3) {
    --help-topic-color: var(--resource-note-color);
  }

  .help-topic-card:nth-child(6n + 4) {
    --help-topic-color: var(--resource-file-color);
  }

  .help-topic-card:nth-child(6n + 5) {
    --help-topic-color: var(--todo-accent-color);
  }

  .help-topic-card:nth-child(6n + 6) {
    --help-topic-color: var(--desc-color);
  }

  .help-topic-card__icon {
    display: inline-flex;
    width: 40px;
    height: 40px;
    flex: 0 0 40px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--help-topic-color);
    border-radius: 11px;
    color: var(--help-topic-color);
    background: color-mix(in srgb, var(--help-topic-color) 10%, var(--card-background));
  }

  .help-topic-card__copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    line-height: 1.45;
  }

  .help-topic-card__copy strong {
    color: var(--text-color);
    font-size: 15px;
  }

  .help-topic-card__copy small {
    min-height: 42px;
    margin-top: 5px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.65;
  }

  .help-topic-card__copy > span {
    margin-top: 10px;
    color: var(--help-topic-color);
    font-size: 11px;
    font-weight: 700;
  }

  .help-state-card {
    display: flex;
    min-height: 150px;
    padding: 24px;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 10px;
    border: 1px dashed var(--surface-border-color);
    border-radius: 12px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 13px;
    line-height: 1.6;
    text-align: center;
  }

  .help-state-card.is-error {
    border-color: var(--danger-color);
    color: var(--danger-color);
  }

  .help-section-panel {
    flex: 1 1 auto;
    min-height: 0;
    padding: clamp(22px, 3vw, 36px);
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .help-section-panel__header {
    display: flex;
    margin-bottom: 20px;
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .help-section-panel__header h2 {
    margin: 0;
    color: var(--text-color);
    font-size: 24px;
    line-height: 1.3;
  }

  .help-section-panel__header p {
    margin: 6px 0 0;
    color: var(--desc-color);
    font-size: 13px;
  }

  .help-section-back.b_btn {
    width: max-content;
    height: 34px;
    padding: 0 10px;
    gap: 6px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 9px;
    color: var(--resource-bookmark-color);
    background: var(--workspace-panel-bg-color);
  }

  .help-section-list {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .help-section-list .search-result-card.b_btn {
    margin-bottom: 0;
  }

  .search-results-panel {
    flex: 1 1 auto;
    min-height: 0;
    padding: clamp(20px, 3vw, 34px);
    box-sizing: border-box;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .search-results-header {
    display: flex;
    margin-bottom: 16px;
    padding-bottom: 12px;
    align-items: baseline;
    gap: 8px;
    border-bottom: 1px solid var(--surface-divider-color);
    color: var(--desc-color);
    font-size: 13px;
  }

  .search-results-count {
    color: var(--text-color);
    font-weight: 700;
  }

  .search-results-hint {
    color: var(--desc-color);
    font-size: 12px;
  }

  .search-result-card.b_btn {
    display: flex;
    width: 100%;
    height: auto;
    min-height: 82px;
    margin-bottom: 9px;
    padding: 14px 16px;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 12px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 11px;
    color: var(--text-color);
    background: var(--card-background);
    white-space: normal;
    text-align: left;
    transition:
      border-color 0.16s ease,
      background-color 0.16s ease;
  }

  .search-result-icon {
    display: inline-flex;
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--surface-border-color);
    border-radius: 9px;
    color: var(--resource-bookmark-color);
    background: var(--workspace-panel-bg-color);
  }

  .search-result-body {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }

  .search-result-title {
    display: block;
    margin-bottom: 6px;
    color: var(--text-color);
    font-size: 15px;
    font-weight: 600;
    line-height: 1.5;
  }

  .search-result-snippets {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .search-result-snippet {
    display: -webkit-box;
    overflow: hidden;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.6;
    text-overflow: ellipsis;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  mark.search-highlight {
    padding: 1px 2px;
    border-radius: 2px;
    color: #171717;
    background: #fde047;
  }

  .search-result-title mark.search-highlight {
    font-weight: 700;
  }

  .search-back-bar.b_btn {
    width: max-content;
    height: 34px;
    margin: 0 0 24px;
    padding: 0 10px;
    gap: 6px;
    border: 1px solid var(--surface-border-color) !important;
    border-radius: 9px;
    color: var(--resource-bookmark-color);
    background: var(--workspace-panel-bg-color);
    font-size: 14px;
  }

  @media (hover: hover) and (pointer: fine) {
    .help-home-link.b_btn:hover,
    .help-catalog-group__title.b_btn:hover,
    .help-catalog-item.b_btn:hover {
      background: var(--primary-btn-bg-color);
    }

    .help-topic-card.b_btn:hover {
      transform: translateY(-1px);
      border-color: var(--help-topic-color) !important;
      box-shadow: var(--surface-hover-shadow);
    }

    .search-result-card.b_btn:hover {
      border-color: var(--resource-bookmark-color) !important;
      background: var(--workspace-panel-bg-color);
    }

    .help-workspace-tool.b_btn:hover {
      border-color: var(--resource-bookmark-color) !important;
      color: var(--resource-bookmark-color);
      background: var(--primary-btn-bg-color);
    }
  }

  @media (max-width: 1180px) and (min-width: 721px) {
    .help-workspace-tool.b_btn {
      width: 42px;
      padding: 0;
    }

    .help-workspace-tool__label {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  }

  @media (max-width: 720px) {
    .help-topic-grid {
      grid-template-columns: 1fr;
    }

    .help-topic-section__header {
      align-items: flex-start;
      flex-direction: column;
      gap: 8px;
    }

    .help-topic-card.b_btn {
      min-height: 126px;
      padding: 16px;
    }

    .help-topic-card__copy small {
      min-height: 0;
    }

    .search-results-header {
      align-items: flex-start;
      flex-direction: column;
      gap: 3px;
    }

    .help-section-panel {
      padding: 20px 16px 24px;
    }

    .help-section-panel__header h2 {
      font-size: 21px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .help-topic-card.b_btn,
    .search-result-card.b_btn {
      transition: none;
    }
  }

  html.light-note-mobile-rendering .help-workspace-header.is-discovery {
    background: var(--workspace-panel-bg-color);
  }

  html.light-note-mobile-rendering .help-topic-card.b_btn,
  html.light-note-mobile-rendering .help-ai-panel,
  html.light-note-mobile-rendering .help-sidebar,
  html.light-note-mobile-rendering .help-content-workspace {
    box-shadow: none;
  }

  html.light-note-mobile-rendering .help-topic-card__icon {
    background: var(--card-background);
  }

  html.light-note-mobile-rendering .help-home-link.b_btn.active,
  html.light-note-mobile-rendering .help-catalog-group__title.b_btn.active,
  html.light-note-mobile-rendering .help-catalog-item.b_btn.active,
  html.light-note-mobile-rendering .help-mobile-action.b_btn.active {
    border-color: var(--resource-bookmark-color) !important;
    color: var(--resource-bookmark-color);
    background: var(--workspace-panel-bg-color);
  }
</style>
