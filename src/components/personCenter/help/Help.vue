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
  const { t } = useI18n();
  const user = useUserStore();
  const helpInfo = computed(() => ({
    content: t('help.introContent'),
  }));

  const node = ref(helpInfo.value);

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
