<template>
  <div class="help-container">
    <div class="help-body">
      <div
        v-if="bookmark.isMobile"
        class="help-title"
        style="position: relative; top: 10px"
        @click="checkId = ''"
        v-click-log="{ module: '帮助中心', operation: `导览` }"
        >{{ t('help.title') }}</div
      >
      <div v-if="!bookmark.isMobile" class="help-sidebar">
        <div
          class="help-title"
          @click="((checkId = ''), (node = helpInfo))"
          v-click-log="{ module: '帮助中心', operation: `导览` }"
          >{{ t('help.title') }}</div
        >
        <b-input v-model:value="searchValue" :placeholder="t('help.searchPlaceholder')" class="help-search-input" id="ref2">
          <template #prefix>
            <svg-icon color="#cccccc" :src="icon.navigation.search" size="16" />
          </template>
        </b-input>
        <BList class="help-menu-list" style="font-size: 12px" :listOptions="viewOptions" @nodeClick="logItem" :check-id="checkId">
          <template #icon>
            <svg-icon :src="icon.help_document" />
          </template>
        </BList>
      </div>
      <div v-else class="phone-help-menu">
        <div
          v-for="item in viewOptions"
          :style="{
            background: checkId === item.id ? '#4e4b46' : '',
            color: checkId === item.id ? 'white' : '',
          }"
          class="phone-help-menu-item"
          @click="checkId = item.id"
          v-click-log="{ module: '帮助中心', operation: `${item.title}` }"
        >
          {{ item.title }}
        </div>
      </div>
      <div
        id="view-body"
        class="help-editor"
        :class="{ 'help-editor--with-outline': !bookmark.isMobile && helpOutline.length }"
        @scroll="syncActiveOutline"
        v-html="renderedContent"
      >
      </div>
      <div v-if="helpOutline.length" :class="[bookmark.isMobile ? 'phone-help-outline' : 'help-outline']">
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
  import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
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
      <p>您好！感谢您使用【轻笺】。</p>
      <p>轻笺是一款专为效率爱好者设计的云端书签管理工具，以智能标签为核心，帮助您即时归档网页、笔记和灵感片段。通过动态关联的标签网络，实现跨设备即时搜索、多维度分类以及智能推荐书签/笔记，让知识管理像浏览社交 feed 一样轻松有趣。</p>
      <p>本帮助文档旨在为您提供详细的使用指南和常见问题解答，帮助您更高效地使用本平台。在此，您可以找到以下方面的详细介绍：</p>
      <ul>
        <li><strong>账户管理</strong>：如何注册、登录、找回密码以及修改个人信息。</li>
        <li><strong>功能操作</strong>：平台各项功能的操作步骤和注意事项。</li>
        <li><strong>常见问题</strong>：用户在使用过程中可能遇到的问题解决方案。</li>
      </ul>
      <p>为了更好地帮助您，请使用左侧目录或搜索框搜索您需要了解的内容。此外，我们的网站支持<b>多设备适配</b>，无论您在 PC、手机还是平板上，都能享受到一致的优质体验。</p>
      <p>如果您在使用过程中遇到任何问题，请通过意见反馈提供您的宝贵建议。您也可以通过以下方式联系我：</p>
      <div>
        邮箱：<a href="mailto:1902013368@qq.com" style="text-decoration: underline;">1902013368@qq.com</a>
      </div>
      <p>虽然项目成立不久，但我保证质量上乘，并在细节上倾注了大量心血，确保您满意体验！未来，我将继续升级它，例如添加书签导出/导入、书签分享、书签同步备份、团队协作、AI 分析等功能，让书签管理更加灵活便捷。请期待吧——更多实用功能正在路上，保证将您的书签管理体验提升到新水平！</p>
      <p>感谢您的理解和支持！</p>
    `
        : `
      <p>Hello! Thank you for using 【Light Note】.</p>
      <p>Light Note is a cloud-based bookmark management tool designed specifically for efficiency enthusiasts, with smart tags at its core, helping you instantly archive web pages, notes, and inspiration snippets. Through a dynamically associated tag network, it enables cross-device instant search, multi-dimensional classification, and intelligent recommendation of bookmarks/notes, making knowledge management as easy and fun as browsing social feeds.</p>
      <p>This help documentation aims to provide you with detailed usage guides and answers to common questions, helping you use this platform more efficiently. Here, you can find detailed introductions about the following aspects:</p>
      <ul>
        <li><strong>Account Management</strong>: How to register, log in, recover passwords, and modify personal information.</li>
        <li><strong>Function Operations</strong>: Operation steps and precautions for various platform functions.</li>
        <li><strong>Frequently Asked Questions</strong>: Solutions to problems users may encounter during use.</li>
      </ul>
      <p>To better assist you, please search for the content you need to understand using the left directory or search box. In addition, our website supports <b>multi-device adaptation</b>, whether you are on PC, mobile phone, or tablet, you can enjoy a consistent excellent experience.</p>
      <p>If you encounter any problems during use, please provide your valuable suggestions through feedback. You can also contact me through the following methods:</p>
      <div>
        Email: <a href="mailto:1902013368@qq.com" style="text-decoration: underline;">1902013368@qq.com</a>
      </div>
      <p>Although the project was established not long ago, I guarantee that the quality is excellent, and considerable effort has been put into the details, ensuring you'll be satisfied with the experience! In the future, I will continue to upgrade it, such as adding bookmark export/import, bookmark sharing, bookmark synchronization and backup, team collaboration, AI analysis, and other features, making bookmark management more flexible and convenient. Please look forward to it - more practical features are on the way, guaranteeing to take your bookmark management experience to the next level!</p>
      <p>Thank you for your understanding and support!</p>
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
</style>
