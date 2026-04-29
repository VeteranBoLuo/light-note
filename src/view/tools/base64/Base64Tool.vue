<template>
  <div class="base64-page">
    <section class="hero-card">
      <div class="hero-left">
        <h2>Base64 编解码</h2>
        <p>支持 UTF-8 文本编码与解码，适合快速处理参数、密钥片段和调试数据。</p>
      </div>
      <div class="hero-actions">
        <b-button size="small" @click="encodeText" v-click-log="{ module: '工具箱', operation: 'Base64编码' }">编码为 Base64</b-button>
        <b-button size="small" @click="decodeText" v-click-log="{ module: '工具箱', operation: 'Base64解码' }">解码为文本</b-button>
        <b-button size="small" @click="swapText" v-click-log="{ module: '工具箱', operation: 'Base64交换输入输出' }">交换输入输出</b-button>
        <b-button size="small" @click="copyOutput" v-click-log="{ module: '工具箱', operation: 'Base64复制输出' }">复制输出</b-button>
        <b-button size="small" @click="fillSample" v-click-log="{ module: '工具箱', operation: 'Base64加载示例' }">示例</b-button>
        <b-button size="small" @click="clearAll" v-click-log="{ module: '工具箱', operation: 'Base64清空' }">清空</b-button>
      </div>
    </section>

    <section class="workbench">
      <Splitpanes class="split-workbench" :mobile-breakpoint="1180">
        <template #first>
          <article class="panel">
            <div class="panel-title">
              <span>输入区</span>
              <small>{{ inputText.length }} 字符</small>
            </div>
            <textarea v-model="inputText" class="panel-textarea" placeholder="输入原文或 Base64 文本"></textarea>
          </article>
        </template>
        <template #second>
          <article class="panel">
            <div class="panel-title">
              <span>输出区</span>
              <small>{{ outputText.length }} 字符</small>
            </div>
            <textarea
              v-model="outputText"
              class="panel-textarea"
              placeholder="编码或解码结果会显示在这里"
              readonly
            ></textarea>
            <div class="status" :class="{ error: statusType === 'error' }">{{ statusText }}</div>
          </article>
        </template>
      </Splitpanes>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import { message } from 'ant-design-vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import Splitpanes from '@/components/base/Splitpanes.vue';

  const inputText = ref('');
  const outputText = ref('');
  const statusText = ref('等待操作');
  const statusType = ref<'normal' | 'error'>('normal');

  const encodeBase64Utf8 = (value: string): string => {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  };

  const decodeBase64Utf8 = (value: string): string => {
    const normalized = value.replace(/\s+/g, '');
    const binary = atob(normalized);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  };

  const setStatus = (text: string, type: 'normal' | 'error' = 'normal') => {
    statusText.value = text;
    statusType.value = type;
  };

  const encodeText = () => {
    if (!inputText.value) {
      outputText.value = '';
      setStatus('请输入需要编码的文本', 'error');
      return;
    }

    try {
      outputText.value = encodeBase64Utf8(inputText.value);
      setStatus('编码成功');
    } catch {
      setStatus('编码失败，请检查输入内容', 'error');
    }
  };

  const decodeText = () => {
    if (!inputText.value) {
      outputText.value = '';
      setStatus('请输入需要解码的 Base64 文本', 'error');
      return;
    }

    try {
      outputText.value = decodeBase64Utf8(inputText.value);
      setStatus('解码成功');
    } catch {
      setStatus('解码失败，请确认 Base64 格式是否正确', 'error');
    }
  };

  const swapText = () => {
    const nextInput = outputText.value;
    outputText.value = inputText.value;
    inputText.value = nextInput;
    setStatus('输入输出已交换');
  };

  const copyOutput = async () => {
    if (!outputText.value) {
      setStatus('当前没有可复制的输出内容', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(outputText.value);
      setStatus('输出内容已复制');
      message.success('复制成功');
    } catch {
      setStatus('复制失败，请检查剪贴板权限', 'error');
      message.error('复制失败');
    }
  };

  const clearAll = () => {
    inputText.value = '';
    outputText.value = '';
    setStatus('已清空');
  };

  const fillSample = () => {
    inputText.value = 'light-note 工具箱';
    outputText.value = '';
    setStatus('已填充示例文本');
  };
</script>

<style scoped lang="less">
  .base64-page {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    height: 100%;
    gap: 14px;
    min-height: calc(100vh - 140px);
    background:
      radial-gradient(circle at 10% -10%, rgba(28, 126, 214, 0.15), transparent 35%),
      radial-gradient(circle at 100% 10%, rgba(12, 163, 106, 0.14), transparent 35%), var(--background-color);
    border-radius: 14px;
    padding: 16px;
  }

  .hero-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 14px 16px;
    border-radius: 14px;
    border: 1px solid color-mix(in srgb, var(--menu-item-h-bg-color) 88%, transparent);
    background: color-mix(in srgb, var(--menu-item-h-bg-color) 75%, transparent);

    .hero-left {
      h2 {
        margin: 0;
        font-size: 20px;
        line-height: 1.2;
      }

      p {
        margin: 6px 0 0;
        color: var(--text-secondary-color);
        font-size: 12px;
      }
    }

    .hero-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }
  }

  .workbench {
    display: flex;
    gap: 14px;
    min-height: 0;
    flex: 1 1 auto;
  }

  .split-workbench {
    flex: 1 1 auto;
    height: calc(100% - 10px);
    min-height: 0;
  }

  .panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--menu-item-h-bg-color) 84%, transparent);
    background: color-mix(in srgb, var(--menu-item-h-bg-color) 65%, transparent);
    height: 100%;
  }

  .panel-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--menu-item-h-bg-color) 84%, transparent);

    span {
      font-size: 14px;
      font-weight: 600;
    }

    small {
      color: var(--text-secondary-color);
      font-size: 12px;
    }
  }

  .panel-textarea {
    flex: 1;
    width: 100%;
    min-height: 0;
    overflow: auto;
    resize: none;
    border: none;
    outline: none;
    padding: 12px;
    color: var(--text-color);
    background: var(--user-body-bg-color);
    font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
    font-size: 13px;
    line-height: 1.6;
  }

  .status {
    border-top: 1px solid color-mix(in srgb, var(--menu-item-h-bg-color) 84%, transparent);
    padding: 8px 12px;
    font-size: 12px;
    color: var(--text-secondary-color);
    background: color-mix(in srgb, var(--menu-item-h-bg-color) 72%, transparent);

    &.error {
      color: #dc2626;
    }
  }

  @media (max-width: 1180px) {
    .split-workbench {
      height: auto;
    }

    .panel-textarea {
      min-height: 320px;
    }

    .panel {
      min-height: 280px;
      width: 100%;
    }
  }
</style>
