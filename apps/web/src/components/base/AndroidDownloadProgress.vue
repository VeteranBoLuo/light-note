<template>
  <div v-if="downloads.length" class="native-download-progress">
    <div v-for="item in downloads" :key="item.id" class="native-download-item">
      <div class="native-download-head">
        <span class="native-download-name">{{ item.fileName || t('common.downloadingFile') }}</span>
        <span class="native-download-state" :class="`is-${item.status}`">{{ statusText(item) }}</span>
      </div>
      <div
        class="native-download-track"
        :class="{
          'is-pending': isConnecting(item),
          'is-indeterminate': isIndeterminate(item),
          'is-failed': item.status === 'failed',
        }"
        role="progressbar"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="item.percent >= 0 ? item.percent : undefined"
      >
        <span :style="barStyle(item)"></span>
      </div>
      <!--
        落盘后这一行改说保存位置。原来是另外弹一条「已保存到…」的 toast，
        但移动端 toast 也贴在底部，和这张卡片正好叠在一起；而且卡片已经写了
        「已完成」，toast 再说一遍成功本就是重复。合成一行既不重叠也不啰嗦。
      -->
      <div v-if="item.status === 'success'" class="native-download-meta">{{ t('common.downloadSavedTo') }}</div>
      <div v-else-if="item.status !== 'failed'" class="native-download-meta">{{ sizeText(item) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
  /**
   * 原生下载的界面进度条。
   *
   * 只在轻笺 Android App 内会有内容：系统 DownloadManager 的进度原本只在通知栏，
   * 界面里只能看到「开始/完成」两个 Toast。挂在 App.vue 是因为下载可能从任何页面发起
   * （云空间单文件下载、分享页下载、图片预览的保存），不属于某一个页面。
   *
   * 云空间的「批量下载」不走这里 —— 那条路是网页侧 JSZip 打包，自带进度浮层。
   */
  import { useI18n } from 'vue-i18n';
  import { useAndroidDownloadProgress } from '@/composables/useAndroidDownloadProgress';
  import type { AndroidDownloadProgress } from '@/utils/androidBridge';

  const { t } = useI18n();
  const { downloads } = useAndroidDownloadProgress();

  /**
   * DownloadManager 还在排队、连接还没建立，此时拿不到总大小。
   *
   * 这一段必须和下面的「不确定态」分开处理：它通常只有几百毫秒，如果也用那个 35% 滑块动画，
   * 滑块会先冲到轨道右侧，紧接着拿到 content-length 切成真实百分比（往往只有几个点）从左边
   * 重画 —— 用户看到的就是「进度冲上去又退回来重新计算」。所以这里只让整条轨道呼吸，
   * 不画任何「已完成的量」，后面从 0 自然涨上去。
   */
  function isConnecting(item: AndroidDownloadProgress) {
    return item.status === 'pending' && item.percent < 0;
  }

  /**
   * 服务器没给 Content-Length 时算不出百分比，只能显示「在动」而不是假的数字。
   * 只覆盖「已经在下载但总量未知」——排队阶段交给 isConnecting。
   */
  function isIndeterminate(item: AndroidDownloadProgress) {
    return item.percent < 0 && item.status !== 'failed' && !isConnecting(item);
  }

  /*
   * 失败、排队和不确定态都不给内联宽度：内联 style 会压过样式表里的 `.is-failed{width:100%}`
   * 和不确定态的动画，失败时红条会变成 0 宽（等于看不见）。
   */
  function barStyle(item: AndroidDownloadProgress) {
    if (item.status === 'failed' || isConnecting(item) || isIndeterminate(item)) return undefined;
    return { width: `${Math.max(item.percent, 0)}%` };
  }

  function statusText(item: AndroidDownloadProgress) {
    if (item.status === 'failed') return t('common.downloadInterrupted');
    if (item.status === 'success') return t('common.downloadFinished');
    if (item.status === 'paused') return t('common.downloadPaused');
    // 排队阶段说「连接中」而不是「下载中」：那时轨道上还没有任何进度，说下载中会显得卡住
    if (isConnecting(item)) return t('common.downloadConnecting');
    if (item.percent >= 0) return `${item.percent}%`;
    return t('common.downloadingFile');
  }

  function formatBytes(bytes: number) {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${Math.max(0, bytes)} B`;
  }

  function sizeText(item: AndroidDownloadProgress) {
    const loaded = formatBytes(item.bytesDownloaded);
    return item.totalBytes > 0 ? `${loaded} / ${formatBytes(item.totalBytes)}` : loaded;
  }
</script>

<style scoped lang="less">
  /* 底部浮层:下载多为后台行为,不该盖住正在操作的内容。
     用和 BMessage 同一套坐标(--mobile-shell-bottom-height)让开底部导航与安全区,
     否则两者各按各的算法贴底,会算出几乎相同的位置而叠在一起。 */
  .native-download-progress {
    position: fixed;
    left: 50%;
    bottom: calc(var(--mobile-shell-bottom-height, env(safe-area-inset-bottom)) + 12px);
    transform: translateX(-50%);
    z-index: 1200;
    width: min(420px, calc(100vw - 24px));
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }

  .native-download-item {
    padding: 10px 12px;
    border: 1px solid var(--folder-list-border-color);
    border-radius: 10px;
    background: var(--bl-input-noBorder-bg-color);
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.12);
  }

  .native-download-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
    font-size: 12px;
  }
  .native-download-name {
    min-width: 0;
    flex: 1 1 auto;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 600;
    color: var(--text-color);
  }
  /* 状态同时有文字和颜色:APK 里混色会被回退,光靠颜色区分不出成功/失败(见 AGENTS.md 样式铁律) */
  .native-download-state {
    flex: 0 0 auto;
    color: var(--desc-color);
  }
  .native-download-state.is-success {
    color: var(--resource-note-color, #00a884);
    font-weight: 600;
  }
  .native-download-state.is-failed {
    color: var(--error-color, #e5484d);
    font-weight: 600;
  }

  /* 轨道沿用云空间批量下载那条的尺寸与配色,两处进度视觉一致。
     底色混 border 70%(>=20%)，APK 里会回退成稳定 RGBA 而不是透明。 */
  .native-download-track {
    position: relative;
    overflow: hidden;
    width: 100%;
    height: 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--card-border-color) 70%, transparent);

    > span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--resource-file-color, #ff8a00);
      transition: width 0.2s ease;
    }
  }
  .native-download-track.is-failed > span {
    background: var(--error-color, #e5484d);
    width: 100%;
  }
  /* 排队/连接中:整条轨道呼吸,不画任何「已完成的量」。
     用明暗而不是移动的滑块 —— 滑块会被读成进度,随后切到真实百分比时就显得在回退。 */
  .native-download-track.is-pending {
    animation: native-download-pulse 1.2s ease-in-out infinite;

    > span {
      display: none;
    }
  }
  @keyframes native-download-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }
  /* 总量未知:让一小段来回跑,表示「在下载」但不假报百分比 */
  .native-download-track.is-indeterminate > span {
    width: 35%;
    animation: native-download-slide 1.1s ease-in-out infinite;
  }
  @keyframes native-download-slide {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(286%);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .native-download-track.is-indeterminate > span {
      animation: none;
      width: 100%;
      opacity: 0.6;
    }
    .native-download-track.is-pending {
      animation: none;
      opacity: 0.6;
    }
  }

  .native-download-meta {
    margin-top: 5px;
    font-size: 11px;
    color: var(--desc-color);
  }
</style>
