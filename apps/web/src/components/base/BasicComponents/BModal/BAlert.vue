<template>
  <Teleport to="body" v-if="bookmark.isMobile">
    <div class="bAlert-bg">
      <!-- 移动端弹框:正常 flex 流(不再用 .row-center 绝对定位——它把标题限成 50% 宽度导致无谓换行、正文脱流);
           高度自适应内容,底部按钮永远横排(flex:1) -->
      <div class="bAlert bAlert--mobile" :class="{ out: isExit }">
        <div class="bAlert-m-body">
          <slot name="title">
            <div class="bAlert-m-title">{{ title }}</div>
          </slot>
          <div class="bAlert-m-content">{{ content }}</div>
        </div>
        <div class="bAlert-m-footer">
          <slot name="footer" v-if="footer?.length > 0">
            <div
              v-for="btn in footer"
              class="btn dom-hover"
              :type="btn.type"
              @click="btn.function ? btnFunc(btn.function) : obClose()"
              >{{ btn.label }}</div
            >
          </slot>
          <template v-else>
            <div class="btn dom-hover" @click="obClose(200)">{{ cancelText || $t('common.cancel') }}</div>
            <div class="btn dom-hover" style="color: var(--primary-color)" @click="onOk">{{
              okText || $t('common.confirm')
            }}</div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body" v-else>
    <div class="bAlert-bg">
      <div class="bAlert" :class="{ out: isExit }">
        <slot name="title">
          <div style="font-size: 16px; margin-bottom: 15px">{{ title }}</div>
        </slot>
        <div
          style="color: var(--desc-color); font-size: 14px; overflow: auto; height: calc(100% - 70px)"
          v-html="safeContent"
        />
        <div
          style="
            position: absolute;
            bottom: 20px;
            width: calc(100% - 40px);
            display: flex;
            align-items: center;
            justify-content: flex-end;
            box-sizing: border-box;
          "
        >
          <slot name="footer" v-if="footer?.length > 0">
            <b-space>
              <b-button
                v-for="btn in footer"
                class="btn"
                :type="btn.type"
                @click="btn.function ? btnFunc(btn.function) : obClose()"
                >{{ btn.label }}</b-button
              >
            </b-space>
          </slot>
          <b-space v-else>
            <b-button class="btn" @click="obClose(200)">{{ cancelText || $t('common.cancel') }}</b-button>
            <b-button class="btn" type="primary" @click="onOk">{{ okText || $t('common.confirm') }}</b-button>
          </b-space>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import bAlert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { computed, ref } from 'vue';
  import DOMPurify from 'dompurify';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import { bookmarkStore } from '@/store';
  import i18n from '@/i18n';
  const $t = i18n.global.t;

  interface ButtonItem {
    type?: 'function' | 'primary' | 'danger' | 'success';
    label: string;
    function?: () => void;
  }

  const bookmark = bookmarkStore();
  const props = withDefaults(
    defineProps<{
      title: string;
      okText: string;
      cancelText: string;
      content: string;
      footer: ButtonItem[];
    }>(),
    {
      title: '',
      okText: '',
      cancelText: '',
      content: '',
      footer: () => [],
    },
  );
  // 弹框内容在桌面端以 v-html 渲染;部分调用方会拼入用户可控文本(文件/书签/会话标题),必须净化防 XSS:
  // 保留 <br>/<div> 等良性格式,剥离 <script>/onerror 等脚本与事件处理器。
  const safeContent = computed(() => DOMPurify.sanitize(String(props.content || '')));
  const isExit = ref(false);
  function obClose(time = 200) {
    isExit.value = true;
    const timer = setTimeout(() => {
      bAlert.destroy();
      clearTimeout(timer);
    }, time);
  }

  function onOk() {
    bAlert.onOk();
  }

  function btnFunc(func) {
    obClose(0);
    func();
  }
</script>

<style scoped lang="less">
  .bAlert-bg {
    /* fixed + inset:0:界面缩放(html zoom)下始终铺满可视视口;
       原 absolute + 100vw/100vh 在缩放时会露白、且定位随滚动漂移。 */
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.8);
    z-index: 1300;
  }
  .bAlert {
    position: relative;
    left: 50%;
    top: 30%;
    transform: translate(-50%, -50%);
    box-sizing: border-box;
    width: 460px;
    height: 180px;
    //box-shadow: 0px 0px 12px rgba(0, 0, 0, 0.12);
    border-radius: 16px;
    z-index: 1;
    box-shadow: 0 0 24px rgba(0, 0, 0, 0.6);
    background-color: var(--background-color);
    animation: in-animation 0.3s ease;
    padding: 22px;
  }
  .out {
    animation: out-animation 0.3s ease;
  }
  @keyframes in-animation {
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  }
  @keyframes out-animation {
    0% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }

  /* 移动端样式绑到 .bAlert--mobile(与 HTML 分支同源 bookmark.isMobile),不再用 @media (max-width:767px):
     此前 HTML 用 JS innerWidth<768 门控、CSS 用媒体查询门控,界面缩放(html zoom)/断点边界会分叉 →「移动标记+桌面样式」按钮错位。
     高度自适应(不再固定 160px),标题正文正常流(不再 .row-center 绝对定位),底部按钮永远横排。 */
  .bAlert.bAlert--mobile {
    width: min(78%, 320px);
    top: 45%;
    height: auto;
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background-color: var(--phone-menu-item-bg-color);
  }
  .bAlert--mobile .bAlert-m-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 22px 20px 16px;
  }
  .bAlert--mobile .bAlert-m-title {
    font-size: 16px;
    font-weight: 600;
    text-align: center;
    line-height: 1.4;
  }
  .bAlert--mobile .bAlert-m-content {
    width: 100%;
    color: var(--desc-color);
    font-size: 14px;
    text-align: center;
    line-height: 1.55;
    max-height: 40vh;
    overflow: auto;
    word-break: break-word;
  }
  .bAlert--mobile .bAlert-m-footer {
    display: flex;
    align-items: stretch;
    border-top: 1px solid var(--phone-menu-item-border-color);
  }
  .bAlert--mobile .btn {
    flex: 1;
    text-align: center;
    height: 44px;
    line-height: 44px;
    &:not(:last-child) {
      border-right: 1px solid var(--phone-menu-item-border-color);
    }
  }
</style>
