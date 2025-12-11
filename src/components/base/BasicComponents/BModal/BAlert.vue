<template>
  <Teleport to="body" v-if="bookmark.isMobileDevice">
    <div class="bAlert-bg">
      <div class="bAlert" :class="{ out: isExit }">
        <div
          style="
            padding: 22px;
            height: 100%;
            width: 100%;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-items: center;
            position: relative;
          "
        >
          <slot name="title">
            <div style="font-size: 16px; margin-bottom: 15px; font-weight: 550" class="row-center">{{ title }}</div>
          </slot>
          <div
            style="
              color: var(--desc-color);
              font-size: 14px;
              margin-top: 40px;
              width: 100%;
              text-align: center;
              padding: 0 20px;
              box-sizing: border-box;
              overflow: auto;
              height: calc(100% - 70px);
            "
            class="row-center"
          >
            {{ content }}
          </div>
        </div>
        <div
          style="
            position: absolute;
            bottom: 0;
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            box-sizing: border-box;
          "
        >
          <slot name="footer" v-if="footer?.length > 0">
            <div>
              <div
                v-for="btn in footer"
                class="btn"
                :type="btn.type"
                @click="btn.function ? btnFunc(btn.function) : obClose()"
                >{{ btn.label }}</div
              >
            </div>
          </slot>
          <div v-else style="width: 100%" class="flex-align-center">
            <div class="btn dom-hover" @click="obClose(200)">{{ cancelText }}</div>
            <div class="btn dom-hover" style="color: #5c82ff" type="primary" @click="onOk">{{ okText }}</div>
          </div>
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
          v-html="content"
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
            <b-button class="btn" @click="obClose(200)">{{ cancelText }}</b-button>
            <b-button class="btn" type="primary" @click="onOk">{{ okText }}</b-button>
          </b-space>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts" setup>
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import bAlert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import { ref } from 'vue';
  import BSpace from '@/components/base/BasicComponents/BSpace.vue';
  import { bookmarkStore } from '@/store';

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
      okText: '确认',
      cancelText: '取消',
      content: '取消',
      footer: () => [],
    },
  );
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
    position: absolute;
    height: 100vh;
    width: 100vw;
    background-color: rgba(0, 0, 0, 0.8);
    z-index: 99999999;
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
    z-index: 9999;
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

  @media (max-width: 1000px) {
    .bAlert {
      width: 70%;
      top: 45%;
      height: 160px;
      padding: 0;
      background-color: var(--phone-menu-item-bg-color);
    }
    .btn {
      border-top: 1px solid var(--phone-menu-item-border-color);
      flex: 1;
      text-align: center;
      height: 44px;
      line-height: 44px;
      &:not(:last-child) {
        border-right: 1px solid var(--phone-menu-item-border-color);
      }
    }
  }
</style>
