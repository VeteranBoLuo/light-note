<template>
  <main class="image-optimization-harness" :class="{ 'is-note': noteEntry }">
    <h1>图片浏览验收</h1>
    <Editor
      v-if="noteEntry"
      v-model:content="noteContent"
      :type="noteEntry"
      note-id="image-qa-note"
      style="height: 540px"
    />
    <div class="image-optimization-harness__cards">
      <BButton
        v-for="id in ['1', '2', '3']"
        :key="id"
        @click="
          cloudId = id;
          cloudVisible = true;
        "
      >
        <DerivedImage source="cloud" :resource-id="id" :original-url="`/qa/original-${id}.png`" :alt="`图片 ${id}`" />
      </BButton>
    </div>
    <BButton @click="chatVisible = true">聊天照片</BButton>
    <BButton
      @click="
        shared = true;
        cloudId = '1';
        cloudVisible = true;
      "
      >分享照片</BButton
    >
    <ChatMessageAttachments
      :attachments="attachments"
      :ready-image-ids="ready"
      @image-loaded="(_event, attachment) => ready.add(attachment.publicId)"
      author-name="验收"
      @preview-image="chatVisible = true"
    />
    <FilePreview
      v-model:visible="cloudVisible"
      :file-info="{
        id: cloudId,
        fileName: '示例照片.png',
        fileType: 'image/png',
        fileUrl: shared ? '' : `/qa/original-${cloudId}.png`,
        category: 'image',
      }"
      :preview-access="shared ? { kind: 'share', token: 'fixture' } : { kind: 'owner' }"
    />
    <ChatImageViewerModal v-model:visible="chatVisible" :images="images" initial-public-id="chat-1" />
  </main>
</template>
<script setup lang="ts">
  import { ref, defineAsyncComponent } from 'vue';
  const Editor = defineAsyncComponent(() => import('@/components/noteLibrary/detail/Editor.vue'));
  const requestedNote = new URLSearchParams(location.search).get('note');
  const noteEntry = requestedNote === 'markdown' || requestedNote === 'html' ? requestedNote : '';
  const noteContent = ref('');
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import DerivedImage from '@/components/imagePreview/DerivedImage.vue';
  import FilePreview from '@/components/FilePreview.vue';
  import ChatImageViewerModal from '@/components/communityChat/ChatImageViewerModal.vue';
  import ChatMessageAttachments from '@/components/communityChat/ChatMessageAttachments.vue';
  import type { CommunityChatAttachment, CommunityChatImage } from '@/api/communityChatApi';
  const ready = ref(new Set<string>());
  const cloudVisible = ref(false);
  const chatVisible = ref(false);
  const cloudId = ref('1');
  const shared = ref(false);
  const images: CommunityChatImage[] = [
    {
      publicId: 'chat-1',
      url: '/qa/chat-original.png',
      contentType: 'image/png',
      fileSize: 4000000,
      width: 1200,
      height: 800,
    },
  ];
  const attachments: CommunityChatAttachment[] = [
    {
      ...images[0],
      kind: 'image',
      availability: 'available',
      expiresAt: null,
      fileName: 'photo.png',
      fileType: 'image/png',
    },
  ];
</script>
<style scoped>
  .image-optimization-harness {
    padding: 24px;
    color: var(--text-color);
    background: var(--background-color);
    min-height: 100vh;
  }
  .image-optimization-harness__cards :deep(button) {
    position: relative;
    width: 200px;
    height: 140px;
    padding: 10px;
  }
  .image-optimization-harness__cards {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin: 20px 0;
  }
  .image-optimization-harness__cards :deep(img) {
    width: 180px;
    height: 120px;
    object-fit: contain;
  }
  .image-optimization-harness :deep(.chat-attachments) {
    max-width: 320px;
    margin-top: 16px;
  }
  .image-optimization-harness.is-note {
    height: 100vh;
    box-sizing: border-box;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 12px;
  }
  .is-note > h1 {
    font-size: 20px;
    margin: 0 0 12px;
  }
  .is-note > :not(h1):not(.note-editor) {
    display: none;
  }
</style>
