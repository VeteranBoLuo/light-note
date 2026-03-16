<template>
  <div class="url-codec-page">
    <section class="hero-card">
      <div class="hero-left">
        <h2>URL 编码解码</h2>
        <p>支持 encodeURIComponent / decodeURIComponent 与 encodeURI / decodeURI，适合处理查询参数和完整链接。</p>
      </div>
      <div class="hero-actions">
        <b-button size="small" @click="encodeComponent">编码参数</b-button>
        <b-button size="small" @click="decodeComponent">解码参数</b-button>
        <b-button size="small" @click="encodeFullUrl">编码链接</b-button>
        <b-button size="small" @click="decodeFullUrl">解码链接</b-button>
        <b-button size="small" @click="swapText">交换输入输出</b-button>
        <b-button size="small" @click="copyOutput">复制输出</b-button>
        <b-button size="small" @click="fillSample">示例</b-button>
        <b-button size="small" @click="clearAll">清空</b-button>
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
            <textarea v-model="inputText" class="panel-textarea" placeholder="输入 URL 文本或编码文本"></textarea>
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

  const setStatus = (text: string, type: 'normal' | 'error' = 'normal') => {
    statusText.value = text;
    statusType.value = type;
  };

  const withInputGuard = (emptyTip: string, action: () => void) => {
    if (!inputText.value) {
      outputText.value = '';
      setStatus(emptyTip, 'error');
      return;
    }
    action();
  };

  const encodeComponent = () => {
    withInputGuard('请输入需要编码的参数文本', () => {
      outputText.value = encodeURIComponent(inputText.value);
      setStatus('参数编码成功');
    });
  };

  const decodeComponent = () => {
    withInputGuard('请输入需要解码的参数文本', () => {
      try {
        outputText.value = decodeURIComponent(inputText.value);
        setStatus('参数解码成功');
      } catch {
        setStatus('参数解码失败，请确认输入为合法编码', 'error');
      }
    });
  };

  const encodeFullUrl = () => {
    withInputGuard('请输入需要编码的完整 URL', () => {
      outputText.value = encodeURI(inputText.value);
      setStatus('链接编码成功');
    });
  };

  const decodeFullUrl = () => {
    withInputGuard('请输入需要解码的 URL 文本', () => {
      try {
        outputText.value = decodeURI(inputText.value);
        setStatus('链接解码成功');
      } catch {
        setStatus('链接解码失败，请确认输入为合法编码', 'error');
      }
    });
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
    inputText.value = 'https://example.com/search?q=轻笺 工具&lang=zh-CN';
    outputText.value = '';
    setStatus('已填充示例文本');
  };
</script>

<style scoped lang="less">
  .url-codec-page {
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

    .panel {
      min-height: 280px;
      width: 100%;
    }
  }
</style>
