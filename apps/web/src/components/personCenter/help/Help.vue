<template>
  <div class="help-container" :class="{ 'is-compact': isCompactHelpLayout }">
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
            <SvgIcon :src="icon.catalogue" size="18" />
          </BButton>
        </BTooltip>
        <BTooltip :title="t('help.outline')" :disabled="bookmark.isMobile">
          <BButton
            class="help-mobile-action"
            :class="{ active: isCompactOutlineOpen }"
            :aria-label="t('help.outline')"
            :aria-expanded="isCompactOutlineOpen"
            :disabled="isSearching || !helpOutline.length"
            aria-controls="help-article-outline"
            @click="toggleCompactOutline"
          >
            <SvgIcon :src="icon.navigation.list" size="18" />
          </BButton>
        </BTooltip>
      </div>
    </div>
    <div
      class="help-body"
      :class="{ 'help-body--catalog-open': isCompactHelpLayout && isCompactCatalogOpen && !isSearching }"
    >
      <div class="help-sidebar">
        <b-input
          v-model:value="searchValue"
          :placeholder="t('help.searchPlaceholder')"
          class="help-search-input"
          clearable
          id="ref2"
        >
          <template #prefix>
            <svg-icon color="#cccccc" :src="icon.navigation.search" size="16" />
          </template>
        </b-input>
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
        <div v-if="isSearching && !isCompactHelpLayout" class="help-search-hint"> 搜索中，请在右侧结果中选择 </div>
        <BList
          v-else-if="!isCompactHelpLayout || isCompactCatalogOpen"
          id="help-article-list"
          class="help-menu-list"
          style="font-size: 12px"
          :listOptions="viewOptions"
          @nodeClick="logItem"
          :check-id="checkId"
        >
          <template #icon>
            <svg-icon :src="icon.help_document" />
          </template>
        </BList>
      </div>

      <div class="help-content-workspace">
        <!-- 搜索模式：展示搜索结果列表（未从结果中选具体文章时） -->
        <div v-if="isSearching && !selectedFromSearch" class="help-editor search-results-panel">
          <div class="search-results-header">
            <span class="search-results-count">{{ t('help.searchResults', { count: searchResults.length }) }}</span>
            <span class="search-results-hint" v-if="searchResults.length === 0">{{ t('help.searchEmpty') }}</span>
          </div>
          <div
            v-for="result in searchResults"
            :key="result.id"
            class="search-result-card"
            @click="selectSearchResult(result)"
          >
            <div class="search-result-icon">📄</div>
            <div class="search-result-body">
              <div class="search-result-title" v-html="highlightText(result.title, searchValue)"></div>
              <div class="search-result-snippets">
                <div
                  v-for="(snippet, si) in result.snippets"
                  :key="si"
                  class="search-result-snippet"
                  v-html="highlightText(snippet, searchValue)"
                ></div>
              </div>
            </div>
          </div>
        </div>
        <!-- 正常文章浏览模式 -->
        <div
          v-else
          id="view-body"
          class="help-editor"
          :class="{ 'help-editor--search-active': selectedFromSearch }"
          @scroll="!selectedFromSearch ? syncActiveOutline : undefined"
        >
          <div v-if="selectedFromSearch" class="search-back-bar" @click="backToSearchResults">
            <span class="search-back-icon">←</span>
            <span class="search-back-text">{{ t('help.backToResults') }}</span>
          </div>
          <div v-if="selectedFromSearch" class="search-content-scroll">
            <div class="help-article-content" v-html="renderedContent"></div>
          </div>
          <div v-else class="help-article-content" v-html="renderedContent"></div>
        </div>
        <aside v-if="!isSearching && !isCompactHelpLayout && helpOutline.length" class="help-outline">
          <HelpOutlineList
            :title="t('help.outline')"
            :items="helpOutline"
            :active-id="activeOutlineId"
            @select="scrollToHelpHeading"
          />
        </aside>
      </div>
      <AiSkillPanel
        class="help-ai-panel"
        :title="t('help.aiTitle')"
        :description="t('help.aiDescription')"
        skill-id="help.answer"
        :show-prompt="true"
        surface="help.center"
        presentation="sidebar"
        :prompt-rows="3"
        :placeholder="t('help.aiPlaceholder')"
        :submit-label="t('help.aiSubmit')"
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import BList from '@/components/base/BasicComponents/BList.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import { getHelpConfig } from '@/api/helpApi';
  import { useRoute, useRouter } from 'vue-router';
  import message from '@/components/base/BasicComponents/BMessage/BMessage.ts';
  import AiSkillPanel from '@/components/aiSkills/AiSkillPanel.vue';
  import HelpOutlineList from './HelpOutlineList.vue';


  const { t, locale } = useI18n();
  const route = useRoute();
  const router = useRouter();
  const helpEntryHistoryPosition =
    typeof window.history.state?.position === 'number' ? window.history.state.position : null;
  const helpInfo = {
    content:
      locale.value === 'zh-CN'
        ? `
      <h2>欢迎来到轻笺帮助中心 👋</h2>
<p>您好！感谢您选择<b>轻笺</b>——一款以智能标签为核心的云端知识管理工具。</p>
<p>轻笺不只是书签收藏夹，更是一个将<b>书签、笔记、文件</b>统一管理、通过<b>共享标签体系</b>动态关联的知识中台。无论您是在收集灵感、整理资料还是深度写作，轻笺都能帮您把零散信息串联成体系。</p>

<h3>✨ 核心功能</h3>
<ul>
  <li><strong>智能书签</strong>：一键收藏网页，AI 自动生成名称与描述；支持 Excel / HTML 格式导入导出，批量编辑标签</li>
  <li><strong>统一标签</strong>：书签、笔记、云文件共享同一标签库，点击标签即可跨类型查看所有关联内容</li>
  <li><strong>快速添加与待办</strong>：登录后可从导航栏添加网址、文本、文件或待办；资源进入“资源中心 → 待整理”，待办进入独立待办列表</li>
  <li><strong>笔记库</strong>：支持 HTML 富文本 / Markdown 双模式编辑器；AI 笔记助手可润色全文、优化标题、生成摘要、纠错语病、改写选段；可导出为 PDF / HTML / Markdown</li>
  <li><strong>云空间</strong>：支持点击上传、Ctrl+V 粘贴上传、拖拽上传三种方式；文件可搜索、按类型筛选、移动、重命名、分享链接、批量操作与打包下载</li>
  <li><strong>资源中心</strong>：一键检索书签、笔记、文件和标签，并在“全部资源”和“待整理”之间切换；按 <code>/</code> 键可快速唤起搜索</li>
  <li><strong>回收站</strong>：删除的书签、笔记、文件统一进入回收站，30 天内可随时恢复，过期自动清理</li>
  <li><strong>模块 AI</strong>：在笔记、书签、文件、待办、资源中心和帮助中心内按当前对象使用专属能力；材料不会跨模块继承，生成内容先给出预览，再由原业务页面决定是否保存</li>
  <li><strong>工作台</strong>：聚合书签/笔记/文件总数、7 天活跃趋势、高频书签与标签热度排行，快捷操作一步直达</li>
</ul>
<p>更多功能：<b>全局快捷键</b>（<code>/</code> 快速搜索，可在“设置”中查看）、<b>移动端</b>专属界面、<b>GitHub 快捷登录</b>，助你高效管理知识。</p>

<h3>🖥 多端体验</h3>
<p>轻笺全面适配<b>PC、手机和平板</b>，各端界面与交互均做了针对性优化，数据云端同步，随时随地访问您的知识库。</p>

<h3>🎨 个性化设置</h3>
<ul>
  <li><strong>主题模式</strong>：浅色 / 深色 / 跟随系统，三种模式自由切换</li>
  <li><strong>语言</strong>：支持中文和英文界面</li>
</ul>

<h3>📂 快速上手</h3>
<ol>
  <li>登录后点击导航栏的<b>快速添加</b>，随手保存网址、文本、文件或创建待办；资源稍后到<b>资源中心 → 待整理</b>处理，任务则在<b>待办</b>中推进</li>
  <li>在<b>书签页</b>点击标签筛选收藏的网页</li>
  <li>进入<b>书签管理</b>新增、编辑或批量操作书签</li>
  <li>打开<b>笔记库</b>新建笔记（支持 HTML 或 Markdown），用标签关联相关知识</li>
  <li>使用<b>云空间</b>上传文件，为文件关联标签实现分类</li>
  <li>在导航栏搜索框输入关键词，一键定位任何资源</li>
</ol>

<h3>💬 反馈与支持</h3>
<p>如果您在使用中遇到问题或有改进建议，可通过以下方式联系我：</p>
<div style="margin: 8px 0;">
  邮箱：<a href="mailto:1902013368@qq.com" style="text-decoration: underline;">1902013368@qq.com</a>
</div>
<p>也可以在<b>个人中心 → 意见反馈</b>直接提交，我会尽快回复。</p>

<p>感谢您的信任与支持！轻笺仍在持续迭代，更多实用功能正在路上 ✌️</p>
    `
        : `
     <h2>Welcome to Light Note Help Center 👋</h2>
<p>Hello! Thank you for choosing <b>Light Note</b> — a smart tag-powered cloud knowledge management tool.</p>
<p>Light Note is more than a bookmark collector. It's a knowledge hub that unifies <b>bookmarks, notes, and files</b> under a <b>shared tag system</b> for dynamic cross-type association. Whether you're capturing inspiration, organizing research, or writing in depth, Light Note helps you connect scattered information into a coherent system.</p>

<h3>✨ Core Features</h3>
<ul>
  <li><strong>Smart Bookmarks</strong>: Save web pages with one click; AI auto-generates titles and descriptions; import/export in Excel and HTML formats; batch tag editing</li>
  <li><strong>Unified Tags</strong>: Bookmarks, notes, and cloud files share the same tag library — click a tag to view all associated content across types</li>
  <li><strong>Quick Add & Todos</strong>: Signed-in users can add URLs, text, files, or todos from the navigation bar; resources go to Resource Center → To Organize, while tasks go to the dedicated Todos list</li>
  <li><strong>Note Library</strong>: Dual-mode editor supporting HTML rich text and Markdown; AI Note Assistant can polish text, optimize titles, generate summaries, correct errors, and rewrite sections; export to PDF / HTML / Markdown</li>
  <li><strong>Cloud Space</strong>: Upload via click, Ctrl+V paste, or drag & drop; search, filter by type, move, rename, share links, batch operations and zip download</li>
  <li><strong>Resource Center</strong>: Find bookmarks, notes, files, and tags in one place, and switch between All Resources and Inbox; press <code>/</code> to quickly activate search</li>
  <li><strong>Trash</strong>: Deleted bookmarks, notes, and files go to the trash for 30 days — recover anytime before automatic cleanup</li>
  <li><strong>Module AI</strong>: Use focused skills inside Notes, Bookmarks, Files, Todos, Resource Center, and Help. Materials never carry across modules, and generated content is previewed before the original module saves it</li>
  <li><strong>Workbench</strong>: Aggregate bookmark/note/file totals, 7-day activity trends, top bookmarks and tag popularity rankings, and one-click quick actions</li>
</ul>
<p>More features: <b>Global shortcuts</b> (<code>/</code> for search, listed in Settings), <b>mobile</b> optimized interface, <b>GitHub quick login</b>.</p>

<h3>🖥 Multi-Device Experience</h3>
<p>Light Note is fully optimized for <b>PC, mobile, and tablet</b>, with tailored interfaces and interactions for each device. Your data syncs via the cloud, so you can access your knowledge base anytime, anywhere.</p>

<h3>🎨 Personalization</h3>
<ul>
  <li><strong>Theme</strong>: Light / Dark / Follow System — switch freely among three modes</li>
  <li><strong>Language</strong>: Supports Chinese and English interfaces</li>
</ul>

<h3>📂 Quick Start</h3>
<ol>
  <li>After signing in, use <b>Quick Add</b> to save a URL, text, file, or todo; organize resources under <b>Resource Center → To Organize</b> and manage tasks in <b>Todos</b></li>
  <li>On the <b>Bookmarks</b> page, click tags to filter your saved web pages</li>
  <li>Go to <b>Bookmark Management</b> to add, edit, or batch-operate bookmarks</li>
  <li>Open the <b>Note Library</b> to create notes and link them with tags</li>
  <li>Use <b>Cloud Space</b> to upload files and associate tags for classification</li>
  <li>Type keywords in the navigation search bar to locate any resource instantly</li>
</ol>

<h3>💬 Feedback & Support</h3>
<p>If you encounter any issues or have suggestions for improvement, feel free to reach out:</p>
<div style="margin: 8px 0;">
  Email: <a href="mailto:1902013368@qq.com" style="text-decoration: underline;">1902013368@qq.com</a>
</div>
<p>You can also submit feedback directly via <b>Personal Center → Feedback</b>, and I'll respond as soon as possible.</p>

<p>Thank you for your trust and support! Light Note is continuously evolving — more practical features are on the way ✌️</p>
    `,
  };

  const node = ref(helpInfo);
  type HelpOutlineItem = {
    id: string;
    text: string;
    level: number;
  };
  type HelpItem = {
    id: string;
    title: string;
    content: string;
  };
  const serverOptions = ref<HelpItem[]>([]);

  const bookmark = bookmarkStore();
  const isCompactHelpLayout = computed(() => bookmark.isMobileDevice);
  const checkId = ref('');
  const activeOutlineId = ref('');
  const isCompactCatalogOpen = ref(false);
  const isCompactOutlineOpen = ref(false);
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
  function applyArticle(item: HelpItem) {
    isCompactCatalogOpen.value = false;
    isCompactOutlineOpen.value = false;
    checkId.value = item.id;
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

  function articleQuery(articleId = '') {
    const query = { ...route.query };
    if (articleId) query.article = articleId;
    else delete query.article;
    return query;
  }

  function navigateToArticle(articleId: string, replace = false) {
    if (routeArticleId() === articleId) return;
    const navigation = { name: 'help', query: articleQuery(articleId) };
    void (replace ? router.replace(navigation) : router.push(navigation));
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
    checkId.value = '';
    activeOutlineId.value = '';
    node.value = helpInfo;
    nextTick(() => {
      const dom = document.getElementById('view-body');
      if (dom) dom.scrollTop = 0;
    });
  }

  function logItem(item: HelpItem) {
    searchValue.value = '';
    selectedFromSearch.value = false;
    applyArticle(item);
    navigateToArticle(String(item.id));
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
  const searchValue = ref('');
  const viewOptions = computed(() => {
    if (searchValue.value) {
      return serverOptions.value.filter((data) => {
        return data.title.includes(searchValue.value);
      });
    }
    return serverOptions.value;
  });

  /** 是否处于搜索模式 */
  const isSearching = computed(() => searchValue.value.trim().length > 0);

  /** 是否从搜索结果中选中了具体文章 */
  const selectedFromSearch = ref(false);

  /** 从 HTML 中提取纯文本 */
  function stripHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
  }

  /** 在文本中高亮关键词（返回安全 HTML） */
  function highlightText(text: string, keyword: string): string {
    if (!keyword?.trim()) return text;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    return text.replace(regex, '<mark class="search-highlight">$1</mark>');
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
        const contentLower = contentText.toLowerCase();
        const kwLower = kw.toLowerCase();

        const titleMatch = titleLower.includes(kwLower);
        const snippets = titleMatch ? [] : findSnippets(contentLower, kwLower);
        const contentMatch = snippets.length > 0;

        if (!titleMatch && !contentMatch) return null;

        // 分数：标题命中 10 分，正文每段 3 分
        const score = (titleMatch ? 10 : 0) + snippets.length * 3;
        return {
          ...item,
          score,
          snippets: titleMatch ? [findSnippets(contentLower, kwLower, 120, 1).pop() || ''] : snippets,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.score - a.score);
  });

  /** 点击搜索结果 → 加载文章，保持搜索词 */
  function selectSearchResult(result: any) {
    selectedFromSearch.value = true;
    applyArticle(result);
    navigateToArticle(String(result.id));
  }

  /** 返回搜索结果列表 */
  function backToSearchResults() {
    selectedFromSearch.value = false;
    navigateToArticle('');
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
      navigateToArticle('', true);
    }
  });

  watch(isCompactHelpLayout, (isCompact) => {
    if (!isCompact) {
      isCompactCatalogOpen.value = false;
      isCompactOutlineOpen.value = false;
    }
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

  const helpConfigLoaded = ref(false);
  let unavailableArticleId = '';

  async function loadHelpConfig() {
    const res = await getHelpConfig();
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      serverOptions.value = res.data;
    }
    helpConfigLoaded.value = true;
    openArticleFromRoute();
  }

  function openArticleFromRoute() {
    if (!helpConfigLoaded.value) return;
    const articleId = routeArticleId();
    if (!articleId) {
      unavailableArticleId = '';
      resetToIntro();
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
    () => route.query.article,
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
    width: 100%;
    height: 100%;
    padding: 20px;
    box-sizing: border-box;
    flex-direction: column;
    display: flex;
    gap: 10px;
  }
  .help-mobile-header {
    position: relative;
    min-height: 40px;
    flex: 0 0 40px;
    display: flex;
    align-items: center;
  }
  .help-mobile-exit.b_btn {
    position: relative;
    z-index: 1;
    height: 36px;
    padding: 0 8px;
    gap: 5px;
    border: 0;
    background: transparent;
    box-shadow: none;
    color: var(--text-color);
  }
  .help-mobile-title {
    position: absolute;
    left: 50%;
    max-width: 42%;
    transform: translateX(-50%);
    overflow: hidden;
    color: var(--text-color);
    font-size: 17px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .help-mobile-actions {
    position: relative;
    z-index: 1;
    min-width: 0;
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .help-mobile-action.b_btn {
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 9px;
    color: var(--desc-color);
    background: transparent;
  }
  .help-mobile-action.b_btn.active {
    border-color: var(--resource-bookmark-color);
    color: var(--resource-bookmark-color);
    background: var(--primary-btn-bg-color);
  }
  .help-title {
    height: 30px;
    line-height: 1rem;
    background-color: #fe2c55;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .help-body {
    position: relative;
    display: flex;
    gap: 0;
    height: auto;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
    box-shadow: var(--surface-card-shadow);
  }
  .help-sidebar {
    width: 220px;
    min-width: 220px;
    max-width: 220px;
    flex: 0 0 220px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    padding: 16px;
    box-sizing: border-box;
    border-right: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }
  .help-ai-panel {
    width: 320px;
    min-width: 280px;
    max-width: 360px;
    margin: 12px;
    align-self: stretch;
    overflow: hidden;
    box-sizing: border-box;
  }
  .help-content-workspace {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
    background: var(--card-background);
  }
  .help-search-input {
    width: 100% !important;
    min-width: 100%;
    max-width: 100%;
    flex: 0 0 auto;
    box-sizing: border-box;
  }
  .help-search-input.input-container {
    width: 100% !important;
  }
  .help-search-input :deep(.b-input) {
    border-color: var(--surface-border-color) !important;
    background: var(--card-background) !important;
  }
  .help-menu-list {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
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
    height: 100%;
    border: 0;
    border-radius: 0;
    padding: clamp(24px, 3vw, 40px);
    overflow: auto;
    box-sizing: border-box;
    line-height: 2rem;
    flex: 1 1 auto;
    min-width: 0;
    background: var(--card-background);
    box-shadow: none;
  }
  .help-article-content {
    width: 100%;
    max-width: 960px;
    margin: 0 auto;
    color: var(--text-color);
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
    line-height: 1.4;
    scroll-margin-top: 24px;
  }
  .help-article-content h1,
  .help-article-content h2 {
    margin: 36px 0 18px;
    letter-spacing: -0.015em;
  }
  .help-article-content > h1:first-child,
  .help-article-content > h2:first-child {
    margin-top: 0;
    margin-bottom: 24px;
  }
  .help-article-content h3,
  .help-article-content h4,
  .help-article-content h5,
  .help-article-content h6 {
    margin: 32px 0 12px;
  }
  .help-article-content p {
    margin: 0 0 16px;
    line-height: 1.9;
  }
  .help-article-content ul,
  .help-article-content ol {
    margin: 12px 0 20px;
    padding-left: 1.75em;
  }
  .help-article-content li {
    margin: 6px 0;
    line-height: 1.85;
  }
  .help-outline {
    width: 190px;
    min-width: 190px;
    max-width: 190px;
    height: 100%;
    padding: 16px 8px;
    box-sizing: border-box;
    overflow-y: auto;
    overflow-x: hidden;
    border-left: 1px solid var(--surface-border-color);
    background: var(--workspace-panel-bg-color);
  }
  .help-compact-outline {
    width: 100%;
    max-height: min(38vh, 320px);
    padding: 10px 4px;
    box-sizing: border-box;
    overflow-y: auto;
    overflow-x: hidden;
    border-radius: 8px;
    border: 1px solid var(--card-border-color);
    background: var(--menu-container-bg-color);
    box-shadow: var(--surface-card-shadow);
  }
  .help-container.is-compact {
    padding: 12px;

    .help-body {
      flex-direction: column;
      gap: 12px;
      overflow: visible;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }

    .help-sidebar {
      width: 100%;
      min-width: 0;
      max-width: none;
      flex: 0 0 auto;
      padding: 0;
      border-right: 0;
      background: transparent;
    }

    .help-content-workspace {
      width: 100%;
      min-height: 0;
      flex: 1 1 auto;
      overflow: visible;
      border-radius: 10px;
    }

    .help-ai-panel {
      width: auto;
      min-width: 0;
      max-width: none;
      margin: 0;
      flex: 0 0 auto;
      height: auto;
      overflow: hidden;
    }

    .help-menu-list {
      flex: 0 1 auto;
    }

    .help-body--catalog-open {
      overflow: hidden;
    }

    .help-body--catalog-open .help-sidebar {
      height: 100%;
      min-height: 0;
      flex: 1 1 auto;
      overflow: hidden;
    }

    .help-body--catalog-open .help-content-workspace,
    .help-body--catalog-open .help-ai-panel {
      display: none;
    }

    .help-body--catalog-open #help-article-list.help-menu-list {
      // BList 根节点自身有更高优先级的 height: 100%，这里必须明确覆盖，
      // 目录打开时占满搜索区以下空间，正文暂时隐藏，目录自身负责完整滚动。
      height: auto !important;
      max-height: none;
      min-height: 0;
      flex: 1 1 auto;
      overflow: hidden;
    }

    .help-body--catalog-open #help-article-list.help-menu-list .category-body {
      // 此处没有使用 BList 内置搜索框，不应再预留 50px；完整高度交给目录自身滚动。
      height: 100% !important;
      max-height: 100%;
      box-sizing: border-box;
      overscroll-behavior: contain;
      touch-action: pan-y;
    }

    .help-editor {
      width: 100%;
      height: auto;
      min-height: 0;
      flex: 1 1 auto;
      padding: 22px 18px;
      border: 1px solid color-mix(in srgb, var(--resource-bookmark-color) 14%, var(--card-border-color));
      border-radius: 10px;
      background: var(--menu-body-bg-color);
    }

    .help-editor--search-active {
      padding: 0;
    }
  }

  /* ===== 搜索结果面板 ===== */
  .search-results-panel {
    padding: 20px;
    overflow-y: auto;
  }
  .search-results-header {
    font-size: 14px;
    color: var(--desc-color);
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--card-border-color);
  }
  .search-results-hint {
    margin-left: 8px;
    color: var(--desc-color);
    font-size: 13px;
  }
  .search-result-card {
    display: flex;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s;
    margin-bottom: 8px;
    border: 1px solid var(--card-border-color);
  }
  .search-result-card:hover {
    background: var(--bl-input-noBorder-bg-color);
    border-color: var(--primary-color);
  }
  .search-result-icon {
    flex: 0 0 auto;
    font-size: 20px;
    line-height: 1.4;
  }
  .search-result-body {
    flex: 1;
    min-width: 0;
  }
  .search-result-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 6px;
    line-height: 1.5;
  }
  .search-result-snippets {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .search-result-snippet {
    font-size: 13px;
    color: var(--desc-color);
    line-height: 1.6;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  mark.search-highlight {
    background: color-mix(in srgb, #facc15 72%, transparent);
    color: #171717;
    padding: 1px 2px;
    border-radius: 2px;
  }
  .search-result-title mark.search-highlight {
    background: color-mix(in srgb, #facc15 72%, transparent);
    color: #171717;
    font-weight: 700;
  }
  .help-search-hint {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--desc-color);
    font-size: 13px;
    padding: 20px;
    text-align: center;
  }
  /* ===== 搜索结果 → 文章 → 返回按钮 ===== */
  .help-editor--search-active {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 0;
  }
  .search-back-bar {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    cursor: pointer;
    color: var(--primary-color);
    font-size: 14px;
    transition: background 0.15s;
    user-select: none;
    border-bottom: 1px solid var(--card-border-color);
  }
  .search-back-bar:hover {
    background: color-mix(in srgb, var(--primary-color) 10%, transparent);
  }
  .search-back-icon {
    font-size: 16px;
    line-height: 1;
  }
  .search-content-scroll {
    flex: 1;
    overflow: auto;
    padding: clamp(24px, 3vw, 40px);
  }

  /* ===== 搜索框清除按钮 ===== */
</style>
