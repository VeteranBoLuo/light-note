<template>
  <Teleport to="body" v-if="isMobileLayout">
    <div class="bAlert-bg">
      <!-- 移动端弹框使用正常 flex 流；三个以上操作改为整宽纵向排列，避免窄屏下长文案被压成多行。 -->
      <div class="bAlert bAlert--mobile" :class="{ out: isExit, 'bAlert--stacked-actions': footer.length > 2 }">
        <div class="bAlert-m-body">
          <slot name="title">
            <div class="bAlert-m-title">{{ title }}</div>
          </slot>
          <div class="bAlert-m-content">{{ content }}</div>
        </div>
        <div class="bAlert-m-footer">
          <slot name="footer" v-if="footer?.length > 0">
            <BButton
              v-for="btn in footer"
              :key="btn.label"
              class="btn dom-hover"
              :class="{
                'is-primary': btn.type === 'primary' || btn.type === 'function',
                'is-danger': btn.type === 'danger',
              }"
              :type="btn.type === 'dashed' ? undefined : btn.type"
              @click="btn.function ? btnFunc(btn.function) : obClose()"
              >{{ btn.label }}</BButton
            >
          </slot>
          <template v-else>
            <BButton class="btn dom-hover" @click="obClose(200)">{{ cancelText || $t('common.cancel') }}</BButton>
            <BButton class="btn dom-hover is-primary" @click="onOk">{{ okText || $t('common.confirm') }}</BButton>
          </template>
        </div>
      </div>
    </div>
  </Teleport>

  <Teleport to="body" v-else>
    <div class="bAlert-bg">
      <div class="bAlert" :class="{ out: isExit, 'bAlert--multi-action': footer.length > 2 }">
        <slot name="title">
          <div class="bAlert-title">{{ title }}</div>
        </slot>
        <div class="bAlert-content" v-html="safeContent" />
        <div class="bAlert-footer">
          <slot name="footer" v-if="footer?.length > 0">
            <b-space :wrap="footer.length > 2">
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
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
  import DOMPurify from 'dompurify';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import i18n from '@/i18n';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import {
    registerMobileOverlayHistory,
    releaseMobileOverlayHistory,
    requestMobileOverlayHistoryClose,
    type MobileOverlayHistoryHandle,
  } from '@/utils/mobileOverlayHistory';
  const $t = i18n.global.t;

  interface ButtonItem {
    type?: 'function' | 'primary' | 'dashed' | 'danger' | 'success';
    label: string;
    function?: () => void;
  }

  const isMobileLayout = useMobileLayout();
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
  let historyHandle: MobileOverlayHistoryHandle | null = null;
  let pendingHistoryAction: (() => void) | null = null;

  function performClose(time = 200) {
    isExit.value = true;
    const timer = setTimeout(() => {
      bAlert.destroy();
      clearTimeout(timer);
    }, time);
  }

  function closeFromMobileHistory() {
    historyHandle = null;
    const action = pendingHistoryAction;
    pendingHistoryAction = null;
    if (action) action();
    else performClose();
  }

  function runAfterHistory(action: () => void) {
    pendingHistoryAction = action;
    if (historyHandle && requestMobileOverlayHistoryClose(historyHandle)) return;
    historyHandle = null;
    pendingHistoryAction = null;
    action();
  }

  function obClose(time = 200) {
    runAfterHistory(() => performClose(time));
  }

  function onOk() {
    runAfterHistory(() => bAlert.onOk());
  }

  function btnFunc(func) {
    runAfterHistory(() => {
      bAlert.destroy();
      func();
    });
  }

  onMounted(() => {
    if (isMobileLayout.value) historyHandle = registerMobileOverlayHistory(closeFromMobileHistory);
  });

  onBeforeUnmount(() => {
    pendingHistoryAction = null;
    if (historyHandle) releaseMobileOverlayHistory(historyHandle);
    historyHandle = null;
  });
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
    min-height: 180px;
    //box-shadow: 0px 0px 12px rgba(0, 0, 0, 0.12);
    border-radius: 16px;
    z-index: 1;
    box-shadow: 0 0 24px rgba(0, 0, 0, 0.6);
    background-color: var(--background-color);
    animation: in-animation 0.3s ease;
    padding: 22px;
    display: flex;
    flex-direction: column;
  }
  .bAlert--multi-action {
    width: min(680px, calc(100vw - 40px));
  }
  .bAlert-title {
    flex: 0 0 auto;
    margin-bottom: 15px;
    font-size: 16px;
  }
  .bAlert-content {
    flex: 1 1 auto;
    min-height: 42px;
    max-height: min(45vh, 360px);
    overflow: auto;
    color: var(--desc-color);
    font-size: 14px;
    line-height: 1.55;
    overflow-wrap: anywhere;
  }
  .bAlert-footer {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
    padding-top: 18px;
    box-sizing: border-box;
  }
  .bAlert-footer :deep(.space-body) {
    width: 100%;
    max-width: 100%;
    justify-content: flex-end;
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

  /* 移动端样式绑到 .bAlert--mobile(与 HTML 分支同源 isMobileLayout),不再用 @media (max-width:767px):
     此前 HTML 用 JS innerWidth<768 门控、CSS 用媒体查询门控,界面缩放(html zoom)/断点边界会分叉 →「移动标记+桌面样式」按钮错位。
     高度自适应(不再固定 160px),标题正文正常流(不再 .row-center 绝对定位),底部按钮不撑破弹框。 */
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
    min-width: 0;
    border-top: 1px solid var(--phone-menu-item-border-color);
  }
  .bAlert--mobile .btn {
    flex: 1 1 0;
    min-width: 0;
    min-height: 44px;
    height: auto;
    padding: 8px 6px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    line-height: 1.35;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
    &:not(:last-child) {
      border-right: 1px solid var(--phone-menu-item-border-color);
    }
  }
  .bAlert--mobile .btn.is-primary {
    color: var(--primary-color);
    font-weight: 600;
  }
  .bAlert--mobile .btn.is-danger {
    color: var(--danger-color, #fe2c55);
  }
  .bAlert--mobile.bAlert--stacked-actions .bAlert-m-footer {
    flex-direction: column;
  }
  .bAlert--mobile.bAlert--stacked-actions .btn {
    width: 100%;
    flex: 0 0 48px;
    min-height: 48px;
    padding: 0 18px;
    white-space: nowrap;
    overflow-wrap: normal;
    word-break: keep-all;

    &:not(:last-child) {
      border-right: 0;
    }

    & + .btn {
      border-top: 1px solid var(--phone-menu-item-border-color);
    }
  }
</style>
