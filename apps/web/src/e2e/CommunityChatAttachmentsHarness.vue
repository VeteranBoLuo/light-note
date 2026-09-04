<template>
  <main class="attachment-harness">
    <header class="attachment-harness__header">
      <span>COMMUNITY CHAT · TEMPORARY ATTACHMENTS</span>
      <h1>{{ t('communityChat.attachment.add') }}</h1>
      <p>4 个 / 20 MB · 发送后 30 天过期 · 未发送 24 小时清理</p>
    </header>

    <section class="attachment-harness__layout">
      <article class="attachment-harness__conversation">
        <div class="attachment-harness__message">
          <small>纸页 · 14:28</small>
          <p>这是本周资料，PDF 可以直接预览，未知格式只会下载。</p>
          <ChatMessageAttachments
            :attachments="activeAttachments"
            author-name="纸页"
            :ready-image-ids="readyImageIds"
            @preview-image="recordAction('预览图片', $event.fileName)"
            @open-file="recordAction('预览文件', $event.fileName)"
            @download-file="recordAction('下载文件', $event.fileName)"
          />
        </div>

        <div class="attachment-harness__message is-own">
          <small>我 · 30 天后</small>
          <p>消息文字仍然保留，附件只留下名称、类型和大小。</p>
          <ChatMessageAttachments :attachments="expiredAttachments" author-name="我" />
        </div>
      </article>

      <article class="attachment-harness__composer">
        <div class="attachment-harness__composer-title">
          <strong>发送前队列</strong>
          <span>{{ pendingAttachments.length }}/4</span>
        </div>
        <ChatPendingAttachments
          :attachments="pendingAttachments"
          @preview="recordAction('预览待发送图片', $event.fileName)"
          @retry="retryAttachment"
          @remove="removeAttachment"
        />
        <div class="attachment-harness__input">
          <span>可选择、拖放或直接粘贴文件</span>
          <BButton type="primary" @click="recordAction('发送', '演示消息')">发送</BButton>
        </div>
        <p class="attachment-harness__status" role="status">{{ lastAction }}</p>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
  import { ref } from 'vue';
  import { useI18n } from 'vue-i18n';
  import type { CommunityChatAttachment, CommunityChatPendingAttachment } from '@/api/communityChatApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import ChatMessageAttachments from '@/components/communityChat/ChatMessageAttachments.vue';
  import ChatPendingAttachments from '@/components/communityChat/ChatPendingAttachments.vue';

  const { t } = useI18n();
  const readyImageIds = new Set(['image-ready']);
  const lastAction = ref('点击可用附件可检查预览与下载反馈');
  const farFuture = '2099-09-04T14:28:00.000Z';
  const expiredAt = '2026-08-04T14:28:00.000Z';

  const activeAttachments: CommunityChatAttachment[] = [
    {
      publicId: 'image-ready',
      kind: 'image',
      fileName: '轻笺工作台.webp',
      fileType: 'image/webp',
      fileSize: 186_240,
      availability: 'available',
      expiresAt: farFuture,
      url: '/screenshots/note1-900.webp',
      width: 900,
      height: 506,
    },
    {
      publicId: 'pdf-ready',
      kind: 'file',
      fileName: '聊天室附件方案与验收清单.pdf',
      fileType: 'application/pdf',
      fileSize: 2_458_624,
      availability: 'available',
      expiresAt: farFuture,
    },
    {
      publicId: 'binary-ready',
      kind: 'file',
      fileName: '很长的未知格式资源名称用于检查省略与下载行为.capture',
      fileType: 'application/octet-stream',
      fileSize: 4_096,
      availability: 'available',
      expiresAt: farFuture,
    },
    {
      publicId: 'image-expired',
      kind: 'image',
      fileName: '上个月的截图.png',
      fileType: 'image/png',
      fileSize: 624_128,
      availability: 'expired',
      expiresAt: expiredAt,
      width: 1280,
      height: 720,
    },
  ];

  const expiredAttachments: CommunityChatAttachment[] = [
    {
      publicId: 'file-expired',
      kind: 'file',
      fileName: '会议记录.docx',
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: 81_920,
      availability: 'expired',
      expiresAt: expiredAt,
    },
  ];

  const pendingAttachments = ref<CommunityChatPendingAttachment[]>([
    {
      localId: 'pending-image',
      publicId: 'pending-image',
      kind: 'image',
      fileName: '刚粘贴的图片.webp',
      fileType: 'image/webp',
      fileSize: 186_240,
      availability: 'available',
      expiresAt: null,
      url: '/screenshots/note1-900.webp',
      state: 'ready',
      progress: 100,
    },
    {
      localId: 'pending-upload',
      publicId: 'pending-upload',
      kind: 'file',
      fileName: '正在上传的研究资料.pdf',
      fileType: 'application/pdf',
      fileSize: 3_145_728,
      availability: 'available',
      expiresAt: null,
      state: 'uploading',
      progress: 62,
    },
    {
      localId: 'pending-error',
      publicId: 'pending-error',
      kind: 'file',
      fileName: '上传失败可重试.zip',
      fileType: 'application/zip',
      fileSize: 524_288,
      availability: 'available',
      expiresAt: null,
      state: 'failed',
      progress: 0,
    },
  ]);

  function recordAction(action: string, fileName: string) {
    lastAction.value = `${action}：${fileName}`;
  }

  function retryAttachment(attachment: CommunityChatPendingAttachment) {
    pendingAttachments.value = pendingAttachments.value.map((item) =>
      item.localId === attachment.localId ? { ...item, state: 'uploading', progress: 36 } : item,
    );
    recordAction('重新上传', attachment.fileName);
  }

  function removeAttachment(attachment: CommunityChatPendingAttachment) {
    pendingAttachments.value = pendingAttachments.value.filter((item) => item.localId !== attachment.localId);
    recordAction('移除', attachment.fileName);
  }
</script>

<style scoped lang="less">
  :global(html),
  :global(body) {
    height: auto;
    min-height: 100%;
    overflow: auto;
  }

  :global(body) {
    display: block;
  }

  :global(#app) {
    width: 100%;
  }

  .attachment-harness {
    min-height: 100vh;
    box-sizing: border-box;
    padding: 32px;
    color: var(--text-color);
    background: var(--background-color);
  }

  .attachment-harness__header,
  .attachment-harness__layout {
    width: min(940px, 100%);
    margin-inline: auto;
  }

  .attachment-harness__header {
    margin-bottom: 20px;
  }

  .attachment-harness__header > span,
  .attachment-harness__header > p {
    color: var(--desc-color);
    font-size: 12px;
  }

  .attachment-harness__header h1 {
    margin: 6px 0 3px;
    font-size: 28px;
  }

  .attachment-harness__header p,
  .attachment-harness__message p,
  .attachment-harness__status {
    margin: 0;
  }

  .attachment-harness__layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(330px, 0.78fr);
    align-items: start;
    gap: 20px;
  }

  .attachment-harness__conversation,
  .attachment-harness__composer {
    border: 1px solid var(--surface-border-color);
    border-radius: 18px;
    background: var(--card-background);
    box-shadow: var(--workspace-panel-shadow);
  }

  .attachment-harness__conversation {
    min-width: 0;
    padding: 20px;
    display: grid;
    gap: 24px;
  }

  .attachment-harness__message {
    min-width: 0;
    max-width: min(390px, 88%);
    display: grid;
    gap: 8px;
  }

  .attachment-harness__message.is-own {
    margin-inline-start: auto;
  }

  .attachment-harness__message > small {
    color: var(--desc-color);
    font-size: 11px;
  }

  .attachment-harness__message > p {
    padding: 10px 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 5px 14px 14px;
    background: var(--workspace-panel-bg-color);
    font-size: 13px;
    line-height: 1.55;
  }

  .attachment-harness__message.is-own > p {
    border-radius: 14px 5px 14px 14px;
    border-color: var(--primary-color);
  }

  .attachment-harness__composer {
    min-width: 0;
    overflow: hidden;
    padding-top: 14px;
  }

  .attachment-harness__composer-title {
    padding: 0 14px 8px;
    display: flex;
    justify-content: space-between;
    color: var(--text-color);
    font-size: 13px;
  }

  .attachment-harness__composer-title span,
  .attachment-harness__status {
    color: var(--desc-color);
  }

  .attachment-harness__input {
    margin: 10px;
    min-height: 44px;
    padding: 6px 7px 6px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid var(--surface-border-color);
    border-radius: 13px;
    color: var(--desc-color);
    background: var(--workspace-panel-bg-color);
    font-size: 12px;
  }

  .attachment-harness__input :deep(.b-button) {
    min-width: 58px;
    height: 32px;
    border-radius: 9px;
  }

  .attachment-harness__status {
    min-height: 18px;
    padding: 0 14px 12px;
    font-size: 11px;
  }

  html.light-note-mobile-rendering .attachment-harness {
    padding: 14px 10px;
  }

  html.light-note-mobile-rendering .attachment-harness__header {
    margin-bottom: 14px;
  }

  html.light-note-mobile-rendering .attachment-harness__header h1 {
    font-size: 22px;
  }

  html.light-note-mobile-rendering .attachment-harness__layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  html.light-note-mobile-rendering .attachment-harness__conversation,
  html.light-note-mobile-rendering .attachment-harness__composer {
    border-radius: 14px;
    box-shadow: none;
  }

  html.light-note-mobile-rendering .attachment-harness__conversation {
    padding: 14px;
  }

  html.light-note-mobile-rendering .attachment-harness__message {
    max-width: 94%;
  }
</style>
