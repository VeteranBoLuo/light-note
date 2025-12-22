<template>
  <CommonContainer title="帮助中心">
    <div class="help-container">
      <b-input v-model:value="searchValue" placeholder="目录名..." style="width: 100%" />
      <div class="help-body">
        <div class="help-title" @click="checkId = ''" v-click-log="{ module: '帮助中心', operation: `导览` }"
          >帮助中心</div
        >
        <div class="phone-help-menu">
          <div
            v-for="item in viewOptions.slice(0, 4)"
            :style="{
              color: checkId === item.id ? 'gray' : '',
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
          style="
            height: calc(100% - 115px);
            border: 1px solid var(--card-border-color);
            border-radius: 4px;
            padding: 20px;
            overflow: auto;
            line-height: 2rem;
            flex-grow: 1;
          "
          ><component v-if="node?.['type'] === 'vue'" :is="node.content" /> <div v-else v-html="node.content"></div
        ></div>
      </div>
    </div>
  </CommonContainer>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
  import { bookmarkStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';

  import 'viewerjs/dist/viewer.css'; //样式文件不要忘了
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { listOptions } from '@/config/helpCfg.ts';
  import { apiBasePost } from '@/http/request.ts';
  import { backRouterPage } from '@/utils/common';

  const bookmark = bookmarkStore();
  const checkId = ref('');
  const searchValue = ref('');
  const viewOptions = computed(() => {
    if (searchValue.value) {
      return listOptions.value.filter((data) => {
        return data.title.includes(searchValue.value);
      });
    }
    return listOptions.value;
  });

  const node = computed(() => {
    const item = listOptions.value.find((data) => data.id === checkId.value);
    return item ?? helpInfo;
  });

  const helpInfo = {
    content: `<div class="help-document-intro">
    <h2>欢迎来到帮助中心</h2>
    <p>您好！感谢您使用【轻笺】。
    <p>轻笺是专为效率控设计的云端书签管理神器，以智能标签为核心，帮你瞬间归档网页、笔记与灵感碎片。通过动态关联的标签网络，实现书签/笔记的跨设备秒搜、多维分类与智能推荐，让知识管理像刷社交动态一样轻松有趣</p>
    本帮助文档旨在为您提供详细的使用指南和解答常见问题，帮助您更高效地使用此平台。在这里，您可以找到关于以下方面的详细介绍：</p>
    <ul>
      <li><strong>账号管理</strong>：如何注册、登录、找回密码及修改个人信息。</li>
      <li><strong>功能操作</strong>：平台各项功能的操作步骤和注意事项。</li>
      <li><strong>常见问题解答</strong>：针对用户在使用过程中遇到的问题提供解决方案。</li>
    </ul>
    <p>为了更好地帮助您，请根据左侧目录或搜索框查找您需要了解的内容。此外，我们的网站支持<b>多端适配</b>，无论您是在PC、手机还是平板上，都能获得一致的良好体验。</p>
    <p>
    如果您在使用过程中遇到任何问题，请通过意见反馈，提出您宝贵的的建议。也可以通过以下方式联系我：</p>
    <div>
      邮箱：<a href="mailto:1902013368@qq.com" style="text-decoration: underline;">1902013368@qq.com</a>
    </div>
    <p>虽然项目建立时间不长，但我保证，质量杠杠的，细节上也下了不少功夫，绝对会让你用得舒心！未来我还会不断升级它，比如加入导出导入书签、书签分享、书签同步与备份、团队协作、AI分析等功能，让书签管理更加灵活方便。敬请期待，更多实用功能正在路上，保证让你的书签管理体验更上一层楼！
    </p><p>感谢您的理解与支持！</p>
  </div>`,
  };

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

  function init() {
    apiBasePost('/api/common/getHelpConfig').then((res) => {
      if (res.status === 200) {
        if (res.data.length > 0) {
          listOptions.value = res.data;
        }
      }
    });
  }
  onMounted(() => {
    setupClickListener();
  });

  onUnmounted(() => {
    removeClickListener();
  });
</script>

<style lang="less" scoped>
  .help-container {
    height: 100%;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .help-title {
    margin-top: 10px;
    height: 30px;
    line-height: 1rem;
    background-color: #fe2c55;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .tag-explanation {
    margin: 20px auto;
    font-family: Arial, sans-serif;
  }
  .bookmark-definition {
    background-color: var(--background-color);
    border-left: 4px solid #007bff;
    padding: 10px 20px;
    margin: 20px 0;
  }
  :deep(.bookmark-example) {
    text-align: center;
  }
  :deep(.bookmark-image) {
    width: 100% !important;
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
  .help-body {
    height: calc(100% - 40px);
    flex-direction: column;
    gap: 10px;
    position: relative;
    bottom: 10px;
  }
  .phone-help-menu {
    display: flex;
    margin-top: 10px;
    box-sizing: border-box;
    height: max-content;
    width: max-content;
    &:not(:last-child) {
      border-right: unset;
    }
  }
  .phone-help-menu-item {
    height: 28px;
    line-height: 28px;
    display: flex;
    box-sizing: border-box;
    justify-content: center;
    cursor: pointer;
    padding: 0 4px;
    &:not(:last-child) {
      border-right: 1px solid var(--text-color);
    }
  }
</style>
