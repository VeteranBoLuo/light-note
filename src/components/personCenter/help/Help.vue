<template>
  <div class="help-container">
    <b-input
      v-model:value="searchValue"
      :placeholder="t('help.searchPlaceholder')"
      style="width: 30%; margin: 0 auto; position: fixed; top: 15px; transform: translateX(-50%); left: 50%"
      id="ref2"
    >
      <template #prefix>
        <svg-icon color="#cccccc" :src="icon.navigation.search" size="16" />
      </template>
    </b-input>
    <div class="help-body">
      <div
        v-if="bookmark.isMobileDevice"
        class="help-title"
        style="position: relative; top: 10px"
        @click="checkId = ''"
        v-click-log="{ module: '帮助中心', operation: `导览` }"
        >{{ t('help.title') }}</div
      >
      <div v-if="!bookmark.isMobileDevice" :style="{ width: '180px' }">
        <div
          class="help-title"
          @click="((checkId = ''), (node = helpInfo))"
          v-click-log="{ module: '帮助中心', operation: `导览` }"
          >{{ t('help.title') }}</div
        >
        <BList style="font-size: 12px" :listOptions="viewOptions" @nodeClick="logItem" :check-id="checkId">
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
        :style="{ width: bookmark.isMobileDevice ? 'calc(100% - 40px)' : 'calc(100% - 180px)' }"
        style="
          height: 100%;
          border: 1px solid var(--card-border-color);
          border-radius: 8px;
          padding: 20px;
          overflow: auto;
          box-sizing: border-box;
          line-height: 2rem;
          flex-grow: 1;
        "
        v-html="node.content"
        :contenteditable="user.role === 'root'"
      >
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
  import { bookmarkStore, useUserStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';

  import 'viewerjs/dist/viewer.css'; //样式文件不要忘了
  import '@wangeditor/editor/dist/css/style.css';
  import { listOptions } from '@/config/helpCfg.ts';

  const { t, locale } = useI18n();
  const user = useUserStore();
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

  const bookmark = bookmarkStore();
  const checkId = ref('');
  function logItem(item) {
    checkId.value = item.id;
    nextTick(() => {
      const dom = document.getElementById('view-body');
      if (dom) {
        dom.scrollTop = 0;
      }
    });
    node.value = item;
  }
  const searchValue = ref('');
  const viewOptions = computed(() => {
    if (searchValue.value) {
      return listOptions.value.filter((data) => {
        return data.title.includes(searchValue.value);
      });
    }
    return listOptions.value;
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

  onMounted(() => {
    setupClickListener();
  });

  onUnmounted(() => {
    removeClickListener();
  });
</script>

<style lang="less">
  .help-container {
    width: 100%;
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
    height: calc(100% - 80px);
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
    width: 100%;
  }
</style>
