<template>
  <div class="help-container">
    <div class="help-body">
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
        <div v-if="isSearching" class="help-search-hint">搜索中，请在右侧结果中选择</div>
        <BList
          v-else
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
        :class="{
          'help-editor--with-outline': !bookmark.isMobile && helpOutline.length && !selectedFromSearch,
          'help-editor--search-active': selectedFromSearch,
        }"
        @scroll="!selectedFromSearch ? syncActiveOutline : undefined"
      >
        <div v-if="selectedFromSearch" class="search-back-bar" @click="backToSearchResults">
          <span class="search-back-icon">←</span>
          <span class="search-back-text">{{ t('help.backToResults') }}</span>
        </div>
        <div v-if="selectedFromSearch" class="search-content-scroll" v-html="renderedContent"></div>
        <div v-else v-html="renderedContent"></div>
      </div>
      <div v-if="!isSearching && helpOutline.length" :class="[bookmark.isMobile ? 'phone-help-outline' : 'help-outline']">
        <div class="help-outline-title">{{ t('help.outline') }}</div>
        <button
          v-for="heading in helpOutline"
          :key="heading.id"
          class="help-outline-item"
          :class="{ active: activeOutlineId === heading.id }"
          :style="{ paddingLeft: `${Math.max(heading.level - 1, 0) * 12 + 10}px` }"
          @click="scrollToHelpHeading(heading.id)"
        >
          <span class="help-outline-marker"></span>
          <span class="text-hidden">{{ heading.text }}</span>
        </button>
      </div>
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
  import { getHelpConfig } from '@/api/helpApi';

  import 'viewerjs/dist/viewer.css'; //样式文件不要忘了

  const { t, locale } = useI18n();
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
  <li><strong>笔记库</strong>：支持 HTML 富文本 / Markdown 双模式编辑器；AI 笔记助手可润色全文、优化标题、生成摘要、纠错语病、改写选段；可导出为 PDF / HTML / Markdown</li>
  <li><strong>云空间</strong>：支持点击上传、Ctrl+V 粘贴上传、拖拽上传三种方式；文件可搜索、按类型筛选、移动、重命名、分享链接、批量操作与打包下载</li>
  <li><strong>资源中心</strong>：导航栏全局搜索，一键检索书签、笔记、文件和标签，支持按类型筛选；按 <code>/</code> 键可快速唤起搜索</li>
  <li><strong>回收站</strong>：删除的书签、笔记、文件统一进入回收站，30 天内可随时恢复，过期自动清理</li>
  <li><strong>轻笺智域</strong>：内置 AI 对话助手，可查询书签/笔记/文件数据、搜索帮助文档、多语言翻译，以及常见功能问题快捷问答</li>
  <li><strong>工作台</strong>：聚合书签/笔记/文件总数、7 天活跃趋势、高频书签与标签热度排行，快捷操作一步直达</li>
</ul>
<p>更多功能：<b>键盘快捷键</b>（<code>/</code> 快速搜索、拖拽排序等）、<b>移动端</b>专属界面、<b>GitHub 快捷登录</b>，助你高效管理知识。</p>

<h3>🖥 多端体验</h3>
<p>轻笺全面适配<b>PC、手机和平板</b>，各端界面与交互均做了针对性优化，数据云端同步，随时随地访问您的知识库。</p>

<h3>🎨 个性化设置</h3>
<ul>
  <li><strong>主题模式</strong>：浅色 / 深色 / 跟随系统，三种模式自由切换</li>
  <li><strong>语言</strong>：支持中文和英文界面</li>
</ul>

<h3>📂 快速上手</h3>
<ol>
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
  <li><strong>Note Library</strong>: Dual-mode editor supporting HTML rich text and Markdown; AI Note Assistant can polish text, optimize titles, generate summaries, correct errors, and rewrite sections; export to PDF / HTML / Markdown</li>
  <li><strong>Cloud Space</strong>: Upload via click, Ctrl+V paste, or drag & drop; search, filter by type, move, rename, share links, batch operations and zip download</li>
  <li><strong>Resource Center</strong>: Global search from the navigation bar — find bookmarks, notes, files, and tags in one place; filter by type; press <code>/</code> to quickly activate search</li>
  <li><strong>Trash</strong>: Deleted bookmarks, notes, and files go to the trash for 30 days — recover anytime before automatic cleanup</li>
  <li><strong>Light Note AI</strong>: Built-in AI chat assistant for querying bookmarks/notes/files, searching help docs, multi-language translation, and quick answers to common feature questions</li>
  <li><strong>Workbench</strong>: Aggregate bookmark/note/file totals, 7-day activity trends, top bookmarks and tag popularity rankings, and one-click quick actions</li>
</ul>
<p>More features: <b>Keyboard shortcuts</b> (<code>/</code> quick search, drag & drop sorting, etc.), <b>mobile</b> optimized interface, <b>GitHub quick login</b>.</p>

<h3>🖥 Multi-Device Experience</h3>
<p>Light Note is fully optimized for <b>PC, mobile, and tablet</b>, with tailored interfaces and interactions for each device. Your data syncs via the cloud, so you can access your knowledge base anytime, anywhere.</p>

<h3>🎨 Personalization</h3>
<ul>
  <li><strong>Theme</strong>: Light / Dark / Follow System — switch freely among three modes</li>
  <li><strong>Language</strong>: Supports Chinese and English interfaces</li>
</ul>

<h3>📂 Quick Start</h3>
<ol>
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
  const checkId = ref('');
  const activeOutlineId = ref('');
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
  function logItem(item) {
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
  function scrollToHelpHeading(id: string) {
    activeOutlineId.value = id;
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
    logItem(result);
  }

  /** 返回搜索结果列表 */
  function backToSearchResults() {
    selectedFromSearch.value = false;
  }

  /** 搜索词变化时重置选中状态 */
  watch(searchValue, () => {
    if (!searchValue.value.trim()) {
      selectedFromSearch.value = false;
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

  async function loadHelpConfig() {
    const res = await getHelpConfig();
    if (res.status === 200 && Array.isArray(res.data) && res.data.length > 0) {
      serverOptions.value = res.data;
    }
  }

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
    gap: 20px;
    height: 100%;
    min-height: 0;
  }
  .help-sidebar {
    width: 200px;
    min-width: 200px;
    max-width: 200px;
    flex: 0 0 200px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    box-sizing: border-box;
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
  .help-menu-list {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
  }

  .tag-explanation {
    margin: 20px auto;
    font-family: Arial, sans-serif;
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
    height: 100%;
    border: 1px solid var(--card-border-color);
    border-radius: 8px;
    padding: 20px;
    overflow: auto;
    box-sizing: border-box;
    line-height: 2rem;
    flex: 1 1 auto;
    min-width: 0;
  }
  .help-editor--with-outline {
    flex-basis: calc(100% - 420px);
  }
  .help-outline {
    width: 180px;
    min-width: 180px;
    max-width: 180px;
    height: 100%;
    padding: 12px 0;
    box-sizing: border-box;
    overflow: auto;
    border-left: 1px solid var(--card-border-color);
  }
  .help-outline-title {
    padding: 0 10px 8px;
    color: var(--desc-color);
    font-size: 12px;
    font-weight: 700;
  }
  .help-outline-item {
    width: 100%;
    min-height: 30px;
    border: 0;
    background: transparent;
    color: var(--catalog-color);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px;
    box-sizing: border-box;
    text-align: left;
    font: inherit;
    font-size: 13px;
    border-radius: 6px;
  }
  .help-outline-item:hover {
    background: var(--bl-input-noBorder-bg-color);
  }
  .help-outline-item.active {
    color: var(--resource-bookmark-color);
    font-weight: 700;
  }
  .help-outline-marker {
    width: 3px;
    height: 14px;
    border-radius: 2px;
    background: transparent;
    flex: 0 0 auto;
  }
  .help-outline-item.active .help-outline-marker {
    background: var(--resource-bookmark-color);
  }
  .phone-help-outline {
    position: fixed;
    right: 16px;
    bottom: 18px;
    z-index: 900;
    width: min(240px, calc(100vw - 32px));
    max-height: 42vh;
    padding: 10px 0;
    overflow: auto;
    border-radius: 8px;
    border: 1px solid var(--card-border-color);
    background: var(--menu-container-bg-color);
    box-shadow:
      0 6px 16px 0 rgba(0, 0, 0, 0.08),
      0 3px 6px -4px rgba(0, 0, 0, 0.12),
      0 9px 28px 8px rgba(0, 0, 0, 0.05);
  }
  .phone-help-outline .help-outline-item {
    padding-right: 12px;
  }
  @media (max-width: 768px) {
    .help-body {
      flex-direction: column;
      gap: 12px;
    }
    .help-editor {
      width: 100%;
      height: auto;
      min-height: 0;
      flex: 1 1 auto;
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
    background: color-mix(in srgb, var(--primary-color) 30%, transparent);
    color: var(--text-color);
    padding: 1px 2px;
    border-radius: 2px;
  }
  .search-result-title mark.search-highlight {
    background: color-mix(in srgb, var(--primary-color) 35%, transparent);
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
    padding: 20px;
  }

  /* ===== 搜索框清除按钮 ===== */
</style>
