<template>
  <div class="help-container">
    <b-input
      v-model:value="searchValue"
      placeholder="请搜索问题"
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
        >帮助中心</div
      >
      <div v-if="!bookmark.isMobileDevice" :style="{ width: '180px' }">
        <div
          class="help-title"
          @click="((checkId = ''), (node = helpInfo))"
          v-click-log="{ module: '帮助中心', operation: `导览` }"
          >帮助中心</div
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
      <b-button
        v-if="user.role === 'root' && node.id"
        style="position: absolute; right: 10px; top: 10px"
        type="primary"
        @click="updateHelp"
        >更新</b-button
      >
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
  import BList from '@/components/base/BasicComponents/BList.vue';
  import icon from '@/config/icon.ts';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import BInput from '@/components/base/BasicComponents/BInput.vue';

  import 'viewerjs/dist/viewer.css'; //样式文件不要忘了

  import { apiBasePost } from '@/http/request.ts';
  import '@wangeditor/editor/dist/css/style.css';
  import { cloneDeep } from 'lodash-es';
  import { listOptions } from '@/config/helpCfg.ts';
  const user = useUserStore();
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

  function updateHelp() {
    const params = cloneDeep(node.value);
    params.content = document.querySelector('.help-editor').innerHTML;
    apiBasePost('/api/common/updateHelp', params).then((res) => {
      if (res.status === 200) {
        listOptions.value = res.data;
        init();
      }
    });
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
    init();
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
