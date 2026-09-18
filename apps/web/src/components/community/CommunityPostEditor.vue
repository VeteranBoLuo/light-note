<template>
  <BDrawer
    :open="drawerOpen"
    full-screen
    :title="t(post ? 'community.feed.edit' : 'community.feed.newPost')"
    :close-disabled="busy || uploading || pickingResource"
    :mask-closable="false"
    :keyboard="false"
    body-padding="0"
    @close="requestClose"
  >
    <template #header-actions>
      <span class="draft-save-state" :class="{ saved: draftSaved }" :title="t('community.feed.localDraft')"
        ><i />{{ t(draftSaved ? 'community.feed.draftSaved' : 'community.feed.localDraft') }}</span
      >
      <span v-if="!isMobile && !imagesReady" class="publish-blocker" role="status">{{
        t(uploading ? 'community.feed.imageUploading' : 'community.feed.imagePublishBlocked')
      }}</span>
      <BButton :disabled="busy" :aria-pressed="preview" @click="preview = !preview">{{
        t(preview ? 'community.feed.continueEditing' : 'community.feed.preview')
      }}</BButton>
      <BButton
        type="primary"
        :disabled="!canContinue || busy"
        @click="isMobile ? (mobileSettings = true) : (confirming = true)"
        >{{ t('community.feed.publishNext') }}</BButton
      >
    </template>
    <section class="community-writing" @paste="pasteImages" @dragover.prevent @drop.prevent="dropImages">
      <p v-if="isMobile && !imagesReady" class="mobile-publish-blocker" role="status">{{
        t(uploading ? 'community.feed.imageUploading' : 'community.feed.imagePublishBlocked')
      }}</p>
      <div class="writing-workspace" :class="{ 'has-materials': !isMobile && !preview }">
        <div class="writing-main">
          <div class="writing-paper">
            <div v-if="!preview" class="writing-mode"
              ><BTabs
                variant="line"
                :active-tab="editorMode"
                :options="[
                  { key: 'rich', label: t('community.feed.richText') },
                  { key: 'markdown', label: 'Markdown' },
                ]"
                @change="changeEditorMode"
              />
              <div
                v-if="editorMode === 'markdown' && isMobile"
                class="writing-view-switch mobile-view-switch"
                role="group"
                :aria-label="t('noteDetail.editor.viewMode')"
              >
                <BButton
                  v-for="option in mdViewOptions"
                  :key="option.key"
                  size="small"
                  :aria-label="option.label"
                  :title="option.label"
                  :aria-pressed="mdView === option.key"
                  :class="{ 'is-active': mdView === option.key }"
                  @click="mdView = option.key"
                  ><SvgIcon :src="option.icon" size="17"
                /></BButton>
              </div>
            </div>
            <template v-if="!preview">
              <div class="writing-rich-toolbar">
                <EditorToolbarV2
                  minimal
                  compact
                  :mobile="isMobile"
                  :ariaLabel="t('community.feed.formatToolbar')"
                  v-bind="richToolbarProps"
                  @action="runEditorAction"
                  ><template v-if="editorMode === 'markdown' && !isMobile" #trailing>
                    <div class="writing-view-switch" role="group" :aria-label="t('noteDetail.editor.viewMode')">
                      <BTooltip v-for="option in mdViewOptions" :key="option.key" :title="option.label">
                        <BButton
                          size="small"
                          :aria-label="option.label"
                          :aria-pressed="mdView === option.key"
                          :class="{ 'is-active': mdView === option.key }"
                          @click="mdView = option.key"
                        >
                          <SvgIcon :src="option.icon" size="17" />
                        </BButton>
                      </BTooltip>
                    </div> </template
                ></EditorToolbarV2>
              </div>
              <BInput
                id="feed-title"
                v-model:value="draft.title"
                class="writing-title"
                :disabled="busy"
                :aria-label="t('community.feed.titleLabel')"
                :placeholder="t('community.feed.titlePlaceholder')"
              />
              <div class="writing-body">
                <div
                  v-if="editorMode === 'markdown'"
                  key="markdown"
                  class="writing-md-panes"
                  :class="{ split: mdView === 'split' && !isMobile }"
                >
                  <div v-show="mdView !== 'preview'" class="writing-md-source"
                    ><MarkdownCodeMirror
                      ref="markdownEditor"
                      v-model="draft.body"
                      :readonly="busy"
                      :mobile="isMobile"
                      :locale="locale"
                      :placeholder="t('community.feed.bodyPlaceholder')"
                      @history-change="markdownHistory = $event"
                      @selection-change="refreshMarkdownState"
                      @input="refreshMarkdownState"
                      @ready="refreshMarkdownState"
                      @command="runMarkdownAction" /></div
                  ><div v-show="mdView !== 'edit'" class="writing-md-preview"
                    ><CommunityMarkdown :body="draft.body" /></div></div
                ><div v-else :key="'rich-' + user.currentTheme + locale"
                  ><TinyMceEditorRuntime
                    license-key="gpl"
                    :model-value="richHtml"
                    :disabled="busy"
                    :init="richConfig"
                    @update:model-value="updateRichBody"
                /></div>
              </div>
            </template>
            <div v-else class="writing-preview"
              ><div inert><CommunityPostCard :post="previewPost" preview can-like /></div
            ></div>
            <div v-if="!preview" class="writing-status"
              ><span>{{ Array.from(draft.body).length }} / 4000</span></div
            >
          </div>
        </div>
        <aside v-if="!isMobile && !preview" class="writing-materials"
          ><CommunityPublishMaterials
            :draft="draft"
            :topics="topics"
            :busy="busy"
            :preview="preview"
            :uploading="uploading"
            :picking-resource="pickingResource"
            :images-enabled="imagesEnabled"
            :resources-enabled="resourcesEnabled"
            :image-error="imageError"
            :retryable-ids="[...imageFiles.keys()]"
            @topic="draft.topics = $event"
            @pick-resource="pickingResource = true"
            @add-images="addImages"
            @retry-image="retryImage"
            @remove-image="removeImage"
            @remove-resource="removeResource"
            @preview-image="
              selectedImage = $event;
              imageViewerOpen = true;
            "
        /></aside>
      </div>
      <div v-if="isMobile && !preview" class="writing-mobile-dock">
        <BButton v-if="imagesEnabled" @click="mobileSettings = true"
          >{{ t('community.feed.imageSection') }} {{ draft.images.length }}</BButton
        >
        <BButton v-if="resourcesEnabled" @click="mobileSettings = true"
          >{{ t('community.feed.resourceSection') }} {{ draft.resources.length }}</BButton
        >
        <BButton @click="mobileSettings = true"
          ># {{ topics.find((topic) => topic.value === draft.topics[0])?.label || t('community.feed.topics') }}</BButton
        >
      </div>
    </section>
    <BDrawer
      v-if="isMobile"
      :open="mobileSettings"
      placement="bottom"
      show-handle
      height="84vh"
      :title="t('community.feed.publishSettings')"
      :close-disabled="busy || uploading || pickingResource"
      @close="mobileSettings = false"
    >
      <CommunityPublishMaterials
        :draft="draft"
        :topics="topics"
        :busy="busy"
        :preview="preview"
        :uploading="uploading"
        :picking-resource="pickingResource"
        :images-enabled="imagesEnabled"
        :resources-enabled="resourcesEnabled"
        :image-error="imageError"
        :retryable-ids="[...imageFiles.keys()]"
        @topic="draft.topics = $event"
        @pick-resource="pickingResource = true"
        @add-images="addImages"
        @retry-image="retryImage"
        @remove-image="removeImage"
        @remove-resource="removeResource"
        @preview-image="
          selectedImage = $event;
          imageViewerOpen = true;
        "
      />

      <p v-if="error" role="alert">{{ t('community.feed.error') }}</p>
      <div class="mobile-submit"
        ><p>{{ t(directPublish ? 'community.feed.publishDirectHint' : 'community.feed.publishReviewHint') }}</p
        ><p v-if="draft.resources.length">{{ t('community.feed.snapshotConfirm') }}</p
        ><BButton type="primary" :loading="busy" :disabled="!valid" @click="submit">{{
          t(directPublish ? 'community.feed.confirmPublish' : 'community.feed.submit')
        }}</BButton></div
      >
    </BDrawer>
    <CommunityResourcePicker
      v-if="pickingResource"
      @close="pickingResource = false"
      @add="draft.resources.push($event)"
    />
    <BModal
      v-if="confirming"
      :visible="true"
      :title="t('community.feed.publishConfirm')"
      width="min(520px, 94vw)"
      :show-footer="false"
      :mask-closable="false"
      :close-disabled="busy"
      @close="confirming = false"
    >
      <section class="community-publish-confirm">
        <p>{{ t(directPublish ? 'community.feed.publishDirectHint' : 'community.feed.publishReviewHint') }}</p>
        <p v-if="draft.resources.length">{{ t('community.feed.snapshotConfirm') }}</p>

        <p v-if="error" role="alert" class="feed-error">{{ t('community.feed.error') }}</p>
        <div class="composer-actions"
          ><BButton :disabled="busy" @click="confirming = false">{{ t('community.feed.continueEditing') }}</BButton
          ><BButton type="primary" :loading="busy" :disabled="!valid" @click="submit">{{
            t(directPublish ? 'community.feed.confirmPublish' : 'community.feed.submit')
          }}</BButton></div
        >
      </section>
    </BModal>
    <BImageViewer
      v-if="imageViewerOpen"
      v-model:visible="imageViewerOpen"
      :images="viewerImages"
      :initial-id="selectedImage"
    />
  </BDrawer>
</template>
<script setup lang="ts">
  import EditorToolbarV2, { type EditorToolbarAction } from '@/components/noteLibrary/detail/EditorToolbarV2.vue';
  import icon from '@/config/icon';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import BTooltip from '@/components/base/BasicComponents/BTooltip.vue';
  import CommunityPostCard from './CommunityPostCard.vue';
  import { getCommunityChatOwnProfile } from '@/api/communityChatApi';
  import {
    wrapSelection,
    setLinePrefix,
    toggleLinePrefix,
    insertMarkdownLink,
    insertBlock,
    buildCodeBlock,
  } from '@/utils/markdownEditing';
  import type { Editor as RichEditor } from 'tinymce';
  import type { MarkdownCodeMirrorExpose } from '@/components/noteLibrary/detail/MarkdownCodeMirror.vue';
  import { renderCommunityMarkdown } from '@/utils/communityMarkdown';
  import { noteHtmlToMarkdown } from '@/utils/noteHtmlToMarkdown';
  import BTabs from '@/components/base/BasicComponents/BTabs.vue';
  import CommunityResourcePicker from './CommunityResourcePicker.vue';
  import { discardFeedResource, type FeedResource } from '@/api/communityFeedApi';
  import { uploadFeedImage, discardFeedImage, type FeedImage } from '@/api/communityFeedApi';
  import CommunityPublishMaterials from './CommunityPublishMaterials.vue';
  import { useMobileLayout } from '@/composables/useMobileLayout';
  import { closeCurrentMobileOverlayThen } from '@/utils/mobileOverlayHistory';
  import BDrawer from '@/components/base/BasicComponents/BDrawer.vue';
  import CommunityMarkdown from './CommunityMarkdown.vue';
  import BModal from '@/components/base/BasicComponents/BModal/BModal.vue';
  import { defineAsyncComponent, computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { feedOperation, type FeedPost } from '@/api/communityFeedApi';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BInput from '@/components/base/BasicComponents/BInput.vue';
  import { onBeforeRouteLeave } from 'vue-router';
  import Alert from '@/components/base/BasicComponents/BModal/Alert';
  import {
    readCommunityPostDraft,
    writeCommunityPostDraft,
    removeCommunityPostDraft,
  } from '@/utils/communityPostDraftStorage';
  const props = defineProps<{
    post?: FeedPost | null;
    initialTopic?: string;
    imagesEnabled?: boolean;
    resourcesEnabled?: boolean;
    topics: { value: string; label: string }[];
    profileEnabled: boolean;
  }>();
  const emit = defineEmits<{ close: []; saved: [result: { status: string }] }>();
  const { t, locale } = useI18n();
  const BImageViewer = defineAsyncComponent(() => import('@/components/base/Viewer/BImageViewer.vue'));
  const mobileSettings = ref(false),
    draftSaved = ref(false);
  const imageViewerOpen = ref(false),
    selectedImage = ref('');
  const viewerImages = computed(() =>
    draft.images
      .filter((item) => item.url)
      .map((item) => ({
        id: item.publicId,
        src: item.url,
        width: item.width,
        height: item.height,
        alt: t('community.feed.imagePreview', { index: draft.images.indexOf(item) + 1 }),
      })),
  );
  const MarkdownCodeMirror = defineAsyncComponent(() =>
    import('@/components/noteLibrary/detail/MarkdownCodeMirror.vue').then((module) => module.default),
  );
  const TinyMceEditorRuntime = defineAsyncComponent(
    () => import('@/components/noteLibrary/detail/TinyMceEditorRuntime.vue'),
  );
  const markdownEditor = ref<MarkdownCodeMirrorExpose>();
  const editorMode = ref('rich');
  const richHtml = ref('');
  function changeEditorMode(mode: string) {
    if (busy.value || mode === editorMode.value) return;
    if (mode === 'rich') richHtml.value = renderCommunityMarkdown(draft.body);
    editorMode.value = mode;
  }
  function updateRichBody(html: string) {
    if (busy.value || editorMode.value !== 'rich' || html === richHtml.value) return;
    richHtml.value = html;
    draft.body = noteHtmlToMarkdown(html);
  }
  const richEditor = shallowRef<RichEditor | null>(null);
  const richState = ref({
    block: 'p',
    canUndo: false,
    canRedo: false,
    bold: false,
    italic: false,
    strike: false,
    quote: false,
    bulletList: false,
    orderedList: false,
  });
  const markdownHistory = ref({ canUndo: false, canRedo: false });
  const markdownBlock = ref('p');
  function refreshMarkdownState() {
    const editor = markdownEditor.value;
    if (!editor) return;
    const { from } = editor.getSelection();
    const value = editor.getValue();
    const line = value.slice(value.lastIndexOf('\n', from - 1) + 1).split('\n')[0];
    const level = line.match(/^(#{1,6})\s/);
    markdownBlock.value = level ? `h${level[1].length}` : 'p';
  }
  const richToolbarProps = computed(() => {
    const isMarkdown = editorMode.value === 'markdown';
    const state = isMarkdown
      ? {
          ...richState.value,
          ...markdownHistory.value,
          block: markdownBlock.value,
          bold: false,
          italic: false,
          strike: false,
          quote: false,
          bulletList: false,
          orderedList: false,
        }
      : richState.value;
    const glyph = icon.noteDetail.toolbar;
    const action = (
      key: string,
      glyphKey: keyof typeof glyph = key as keyof typeof glyph,
      selected = false,
    ): EditorToolbarAction => ({
      key,
      label: t(`noteDetail.editor.${key === 'more' ? 'moreFormatting' : key}`),
      icon: glyph[glyphKey],
      selected,
      disabled:
        busy.value ||
        (isMarkdown && mdView.value === 'preview') ||
        !(isMarkdown ? markdownEditor.value : richEditor.value),
    });
    const headingActions = [
      action('paragraph', 'paragraph', state.block === 'p'),
      ...Array.from({ length: 6 }, (_, index) =>
        action(`heading${index + 1}`, `heading${index + 1}` as 'heading1', state.block === `h${index + 1}`),
      ),
      action('codeBlock', 'codeBlock', state.block === 'pre'),
    ];
    const unused = action('more');
    return {
      undoAction: { ...action('undo'), disabled: busy.value || !state.canUndo },
      redoAction: { ...action('redo'), disabled: busy.value || !state.canRedo },
      headingAction: {
        ...action(
          'paragraph',
          state.block === 'p'
            ? 'paragraph'
            : /^h[1-6]$/.test(state.block)
              ? (`heading${state.block[1]}` as 'heading1')
              : 'codeBlock',
          state.block !== 'p',
        ),
        label: headingActions.find((a) => a.selected)?.label || t('noteDetail.editor.paragraph'),
      },
      boldAction: action('bold', 'bold', state.bold),
      italicAction: action('italic', 'italic', state.italic),
      listAction: action('bulletList', 'bulletList', state.bulletList || state.orderedList),
      linkAction: action('link'),
      moreAction: unused,
      headingActions,
      listActions: [
        action('bulletList', 'bulletList', state.bulletList),
        action('orderedList', 'orderedList', state.orderedList),
      ],
      desktopFormatActions: [action('strike', 'strike', state.strike), action('quote', 'quote', state.quote)],
      moreActions: [
        action('italic', 'italic', state.italic),
        action('strike', 'strike', state.strike),
        action('quote', 'quote', state.quote),
        action('link'),
        action('codeBlock'),
        ...(!isMarkdown ? [action('clearFormatting', 'clearFormat')] : []),
      ],
      repeatAction: unused,
      imageAction: unused,
      insertAction: unused,
      shortcutsAction: unused,
      insertActions: [],
    };
  });
  function runEditorAction(action: EditorToolbarAction) {
    if (editorMode.value === 'markdown') {
      runMarkdownAction(action.key);
      return;
    }
    runRichAction(action);
  }
  function runMarkdownAction(key: string) {
    const editor = markdownEditor.value;
    if (!editor || busy.value) return;
    if (key === 'undo' || key === 'redo') {
      editor[key]();
      editor.focus();
      return;
    }
    const { from, to } = editor.getSelection();
    const input = { value: editor.getValue(), selectionStart: from, selectionEnd: to };
    let edit;
    if (key === 'paragraph' || /^heading[1-6]$/.test(key))
      edit = setLinePrefix(input, key === 'paragraph' ? '' : '#'.repeat(Number(key.slice(-1))) + ' ', /^#{1,6}\s+/);
    else if (key === 'bold' || key === 'italic' || key === 'strike' || key === 'inlineCode')
      edit = wrapSelection(input, { bold: '**', italic: '*', strike: '~~', inlineCode: '`' }[key]!);
    else if (key === 'bulletList' || key === 'orderedList' || key === 'quote')
      edit = toggleLinePrefix(input, { bulletList: '- ', orderedList: '1. ', quote: '> ' }[key]!);
    else if (key === 'link') edit = insertMarkdownLink(input);
    else if (key === 'codeBlock') edit = insertBlock(input, buildCodeBlock('', input.value.slice(from, to)));
    if (edit) editor.applyEdit(edit);
    editor.focus();
    refreshMarkdownState();
  }
  function runRichAction(action: EditorToolbarAction) {
    const editor = richEditor.value;
    if (!editor || busy.value || action.disabled) return;
    editor.focus();
    const blocks: Record<string, string> = {
      paragraph: 'p',
      heading1: 'h1',
      heading2: 'h2',
      heading3: 'h3',
      heading4: 'h4',
      heading5: 'h5',
      heading6: 'h6',
      codeBlock: 'pre',
    };
    if (blocks[action.key]) editor.execCommand('FormatBlock', false, blocks[action.key]);
    else {
      const commands: Record<string, string> = {
        undo: 'Undo',
        redo: 'Redo',
        bold: 'Bold',
        italic: 'Italic',
        strike: 'Strikethrough',
        bulletList: 'InsertUnorderedList',
        orderedList: 'InsertOrderedList',
        quote: 'mceBlockQuote',
        link: 'mceLink',
        clearFormatting: 'RemoveFormat',
      };
      if (commands[action.key]) editor.execCommand(commands[action.key]);
    }
    editor.nodeChanged();
  }
  const richConfig = computed(() => ({
    license_key: 'gpl',
    base_url: '/node_modules/tinymce',
    readonly: false,
    menubar: false,
    branding: false,
    promotion: false,
    statusbar: false,
    language: locale.value.startsWith('zh') ? 'zh_CN' : 'en',
    language_url: locale.value.startsWith('zh') ? '/tinymce/langs/zh_CN.js' : undefined,
    skin_url: user.currentTheme === 'night' ? '/tinymce/skins/ui/oxide-dark' : '/tinymce/skins/ui/oxide',
    content_css: false,
    height: 400,
    min_height: 180,
    resize: false,
    autoresize_bottom_margin: 24,
    plugins: 'autolink lists link',
    setup: (editor: RichEditor) => {
      const refresh = () => {
        if (!editor.initialized || editor.removed) return;
        richEditor.value = editor;
        const node = editor.selection.getNode();
        const block = editor.dom.getParent(node, 'p,h1,h2,h3,h4,h5,h6,pre');
        richState.value = {
          block: block?.nodeName.toLowerCase() || 'p',
          canUndo: editor.undoManager.hasUndo(),
          canRedo: editor.undoManager.hasRedo(),
          bold: editor.queryCommandState('Bold'),
          italic: editor.queryCommandState('Italic'),
          strike: editor.queryCommandState('Strikethrough'),
          quote: editor.queryCommandState('mceBlockQuote'),
          bulletList: editor.queryCommandState('InsertUnorderedList'),
          orderedList: editor.queryCommandState('InsertOrderedList'),
        };
      };
      editor.on('init focus NodeChange SelectionChange Undo Redo change SetContent', refresh);
      editor.on('remove', () => {
        if (richEditor.value === editor) richEditor.value = null;
      });
    },
    toolbar: false,
    valid_elements:
      'p,br,strong/b,em/i,del/s,h1,h2,h3,h4,h5,h6,blockquote,ul,ol,li,pre,code,a[href|title],hr,table,thead,tbody,tr,th,td',
    paste_data_images: false,
    automatic_uploads: false,
    content_style: `html { cursor: text; min-height: 100%; } body { cursor: text; min-height: calc(100% - 32px); font: 16px/1.85 system-ui; margin: 16px 0; overflow-wrap: anywhere; color: ${getComputedStyle(document.documentElement).getPropertyValue('--text-color')}; background: ${getComputedStyle(document.documentElement).getPropertyValue('--workspace-open-canvas')}; } blockquote { margin: 20px 0; padding: 12px 16px; border-left: 3px solid ${getComputedStyle(document.documentElement).getPropertyValue('--primary-color')}; background: ${getComputedStyle(document.documentElement).getPropertyValue('--workspace-hover')}; }`,
  }));
  const isMobile = useMobileLayout();
  const user = useUserStore();
  type DraftImage = FeedImage & { status: 'uploading' | 'ready' | 'error'; errorCode?: string };
  const draft = reactive({
    kind: 'share',
    title: '',
    body: '',
    topics: [] as string[],
    images: [] as DraftImage[],
    resources: [] as FeedResource[],
  });
  const pickingResource = ref(false);
  const imageFiles = new Map<string, File>();
  const imageError = ref(false);
  const uploading = computed(() => draft.images.some((i) => i.status === 'uploading'));
  const imagesReady = computed(() => draft.images.every((i) => i.status === 'ready'));
  const drawerOpen = ref(true);
  const mdView = ref('edit');
  const mdViewOptions = computed(() => [
    { key: 'edit', label: t('note.mdEdit'), icon: icon.noteDetail.toolbar.viewEdit },
    ...(!isMobile.value
      ? [{ key: 'split', label: t('note.mdEditPreview'), icon: icon.noteDetail.toolbar.viewSplit }]
      : []),
    { key: 'preview', label: t('note.mdPreview'), icon: icon.noteDetail.toolbar.viewPreview },
  ]);
  watch(
    () => isMobile.value,
    () => {
      if (isMobile.value && mdView.value === 'split') mdView.value = 'edit';
    },
  );
  const preview = ref(false),
    confirming = ref(false);
  const busy = ref(false),
    error = ref(false);
  let submitted = false;
  let generation = 0,
    operation: (() => Promise<any>) | null = null,
    fingerprint = '';
  const directPublish = computed(() => user.role === 'root' && !user.adminContext);
  const owner = computed(() => `${user.id}|${user.role}|${user.adminContext?.id || ''}`);
  const key = () => `community-post-draft:${owner.value}:${props.post?.publicId || 'new'}`;
  watch(
    [owner, () => props.post?.publicId],
    () => {
      generation++;
      submitted = false;
      editorMode.value = 'rich';
      richHtml.value = '';
      pickingResource.value = false;
      for (const item of draft.images) if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
      imageFiles.clear();
      imageError.value = false;
      busy.value = error.value = confirming.value = preview.value = mobileSettings.value = draftSaved.value = false;
      operation = null;
      fingerprint = '';
      Object.assign(draft, {
        kind: props.post?.kind || 'share',
        title: props.post?.title || '',
        body: props.post?.body || '',
        topics: (props.post?.topics || []).map((topic: any) => (typeof topic === 'string' ? topic : topic.slug)),
        resources: props.post?.resources || [],
        images: (props.post?.images || []).map((i) => ({ ...i, status: 'ready' })),
      });
      try {
        const saved = JSON.parse(readCommunityPostDraft(key()) || 'null');
        if (saved && typeof saved.body === 'string' && saved.revision === props.post?.revision)
          Object.assign(draft, saved.draft, {
            resources: saved.draft.resources || [],
            images: (saved.draft.images || []).map((i: DraftImage) => ({
              ...i,
              url: i.status === 'ready' ? i.url : '',
              status: i.status === 'ready' ? 'ready' : 'error',
            })),
          });
      } catch {}
      if (!props.post && props.initialTopic && props.topics.some((t) => t.value === props.initialTopic))
        draft.topics = [props.initialTopic];
      richHtml.value = renderCommunityMarkdown(draft.body);
      draft.topics = Array.isArray(draft.topics) ? draft.topics.slice(0, 1) : [];
    },
    { immediate: true },
  );
  watch(
    draft,
    () => {
      try {
        writeCommunityPostDraft(key(), JSON.stringify({ draft, body: draft.body, revision: props.post?.revision }));
        draftSaved.value = true;
      } catch {
        draftSaved.value = false;
      }
    },
    { deep: true },
  );
  let exitPromptOpen = false;
  function finishClose(clear: boolean, onExit: () => void) {
    exitPromptOpen = false;
    if (clear) {
      try {
        removeCommunityPostDraft(key());
      } catch {}
    }
    onExit();
  }
  function requestClose(onExit = () => emit('close'), onStay = () => {}) {
    // 保存结果触发的路由跳转可能早于组件卸载，不再拦截已提交内容。
    if (submitted) {
      onExit();
      return;
    }
    if (busy.value || uploading.value || pickingResource.value || exitPromptOpen) {
      onStay();
      return;
    }
    const hasContent = Boolean(
      draft.title.trim() || draft.body.trim() || draft.images.length || draft.resources.length,
    );
    if (!hasContent) {
      finishClose(true, onExit);
      return;
    }
    exitPromptOpen = true;
    Alert.alert({
      title: t('community.feed.exitDraftTitle'),
      keyboard: true,
      content: t('community.feed.exitDraftHint'),
      onCancel: () => {
        exitPromptOpen = false;
        onStay();
      },
      cancelText: t('community.feed.continueEditing'),
      okText: t('community.feed.exitEditor'),
      defaultChoice: 'keep',
      choices: [
        { value: 'keep', label: t('community.feed.keepDraft'), description: t('community.feed.keepDraftHint') },
        { value: 'clear', label: t('community.feed.clearDraft'), description: t('community.feed.clearDraftHint') },
      ],
      onOk: (choice: string) => finishClose(choice === 'clear', onExit),
    });
  }
  onBeforeRouteLeave(
    () =>
      new Promise<boolean>((resolve) =>
        requestClose(
          () => resolve(true),
          () => resolve(false),
        ),
      ),
  );
  const previewAuthor = ref<FeedPost['author'] | null>(null);
  watch(preview, async (open) => {
    if (!open || previewAuthor.value || props.post?.author) return;
    try {
      const response = await getCommunityChatOwnProfile();
      if (response.status === 200) previewAuthor.value = response.data.publicPreview;
    } catch {
      /* Keep the local draft preview available while offline. */
    }
  });
  const previewPost = computed<FeedPost>(() => ({
    publicId: '',
    kind: 'share',
    title: draft.title,
    body: draft.body,
    revision: 0,
    status: 'published',
    pending: false,
    locked: false,
    resolved: false,
    publishedAt: props.post?.publishedAt || new Date().toISOString(),
    topics: draft.topics.map((slug) => ({
      slug,
      nameZh: props.topics.find((topic) => topic.value === slug)?.label || slug,
      nameEn: props.topics.find((topic) => topic.value === slug)?.label || slug,
    })),
    mentions: [],
    likeCount: 0,
    commentCount: 0,
    liked: false,
    subscription: 'disabled',
    isOwn: true,
    author: props.post?.author || previewAuthor.value || { userPublicId: '', name: user.name || '' },
    resources: draft.resources,
    images: draft.images.filter((image) => image.status === 'ready'),
  }));
  const valid = computed(
    () =>
      !pickingResource.value &&
      draft.resources.length <= 3 &&
      imagesReady.value &&
      draft.body.trim() &&
      Array.from(draft.body.trim()).length <= 4000 &&
      Array.from(draft.title.trim()).length <= 80 &&
      draft.topics.length <= 1,
  );
  const canContinue = computed(
    () =>
      !pickingResource.value &&
      draft.resources.length <= 3 &&
      imagesReady.value &&
      Boolean(draft.body.trim()) &&
      Array.from(draft.body.trim()).length <= 4000 &&
      Array.from(draft.title.trim()).length <= 80,
  );
  async function submit() {
    if (!valid.value || busy.value) return;
    const current = generation;
    busy.value = true;
    error.value = false;
    const body = {
      ...draft,
      mentions: [],
      images: draft.images.map((i) => i.publicId),
      resources: draft.resources.map((r) => r.publicId),
      kind: 'share',
      title: draft.title,
      ...(props.post ? { postId: props.post.publicId, expectedRevision: props.post.revision } : {}),
    };
    const next = JSON.stringify(body);
    if (next !== fingerprint) {
      operation = feedOperation('posts', body);
      fingerprint = next;
    }
    try {
      const result = await operation!();
      if (current !== generation) return;
      submitted = true;
      try {
        removeCommunityPostDraft(key());
      } catch {}
      await closeCurrentMobileOverlayThen(
        () => {
          confirming.value = false;
          mobileSettings.value = false;
        },
        () =>
          closeCurrentMobileOverlayThen(
            () => {
              drawerOpen.value = false;
            },
            () => {
              if (current === generation) emit('saved', result);
            },
          ),
      );
    } catch {
      if (current === generation) error.value = true;
    } finally {
      if (current === generation) busy.value = false;
    }
  }
  async function uploadOne(item: DraftImage, file: File) {
    const current = generation;
    item.status = 'uploading';
    item.errorCode = undefined;
    try {
      const result = await uploadFeedImage(file, item.publicId);
      if (current !== generation) {
        void discardFeedImage(result.publicId).catch(() => {});
        return;
      }
      const oldUrl = item.url;
      Object.assign(item, result, { status: 'ready' });
      if (oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
      imageFiles.delete(item.publicId);
    } catch (error: any) {
      if (current === generation) {
        item.status = 'error';
        item.errorCode = error?.response?.data?.data?.code || error?.code || error?.message;
      }
    }
  }
  async function addImages(files: File[]) {
    if (!props.imagesEnabled || busy.value || uploading.value) return;
    imageError.value = false;
    if (
      draft.images.length + files.length > 9 ||
      files.some(
        (f) => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 5 * 1024 * 1024 || !f.size,
      )
    ) {
      imageError.value = true;
      return;
    }
    const selected = files.map((file) => ({
      file,
      item: {
        publicId: crypto.randomUUID(),
        url: URL.createObjectURL(file),
        width: 0,
        height: 0,
        fileSize: file.size,
        contentType: file.type,
        status: 'uploading',
      } as DraftImage,
    }));
    draft.images.push(...selected.map((x) => x.item));
    const current = generation;
    for (const { file, item } of selected) {
      if (current !== generation) break;
      imageFiles.set(item.publicId, file);
      await uploadOne(
        draft.images.find((i) => i.publicId === item.publicId)!,
        file,
      );
    }
  }
  function pasteImages(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files || []);
    if (files.length && props.imagesEnabled) {
      event.preventDefault();
      void addImages(files);
    }
  }
  function dropImages(event: DragEvent) {
    void addImages(Array.from(event.dataTransfer?.files || []));
  }
  async function retryImage(item: DraftImage) {
    const file = imageFiles.get(item.publicId);
    if (!file) return;
    void discardFeedImage(item.publicId).catch(() => {});
    imageFiles.delete(item.publicId);
    item.publicId = crypto.randomUUID();
    imageFiles.set(item.publicId, file);
    await uploadOne(item, file);
  }
  function removeResource(item: FeedResource) {
    draft.resources = draft.resources.filter((r) => r.publicId !== item.publicId);
    void discardFeedResource(item.publicId).catch(() => {});
  }
  function removeImage(item: DraftImage) {
    draft.images = draft.images.filter((i) => i.publicId !== item.publicId);
    imageFiles.delete(item.publicId);
    if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
    void discardFeedImage(item.publicId).catch(() => {});
  }
  onBeforeUnmount(() => {
    generation++;
    for (const item of draft.images) if (item.url.startsWith('blob:')) URL.revokeObjectURL(item.url);
  });
</script>

<style scoped>
  .community-writing {
    height: 100%;
    overflow: hidden;
    color: var(--text-color);
    background: var(--workspace-open-canvas);
  }
  .writing-workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    align-items: stretch;
    height: 100%;
    min-height: 0;
    gap: 40px;
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px;
    box-sizing: border-box;
  }
  .writing-workspace:not(.has-materials) {
    grid-template-columns: minmax(0, 1fr);
  }
  .mobile-publish-blocker {
    margin: 0;
    padding: 10px 16px;
    font-size: 12px;
    color: var(--desc-color);
  }
  .publish-blocker {
    font-size: 12px;
    color: var(--desc-color);
    max-width: 240px;
  }
  .writing-main {
    min-width: 0;
    min-height: 0;
  }
  .writing-paper {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--workspace-open-canvas);
    border: 0;
    border-radius: 0;
    overflow: hidden;
  }
  .writing-mode {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 20px 36px 0;
  }
  .writing-mode :deep(.tab-container) {
    display: inline-flex;
    width: auto;
    padding: 0;
    margin: 0;
    gap: 24px;
    border: 0;
    background: transparent;
  }
  .writing-mode :deep(.tab) {
    border: 0;
    border-radius: 0;
    padding: 10px 0;
    font-size: 13px;
    min-width: 0;
  }
  .writing-mode :deep(.tab.is-active) {
    background: transparent;
    color: var(--primary-color);
    box-shadow: none;
    font-weight: 600;
  }
  .writing-rich-toolbar {
    flex-shrink: 0;
    padding: 8px 36px;
    border-bottom: 1px solid var(--workspace-border);
  }
  .writing-rich-toolbar :deep(.editor-toolbar-v2) {
    border: 0;
    background: transparent;
    padding: 0;
  }
  @media (max-width: 767px) {
    .writing-rich-toolbar {
      padding: 8px 20px;
    }
  }
  .writing-toolbar {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    padding: 8px 36px;
    min-height: 40px;
    box-sizing: border-box;
  }
  .writing-toolbar .b_btn {
    background: transparent;
    min-width: 32px;
    padding: 6px 9px;
    font-size: 13px;
  }
  .writing-title {
    margin: 30px 36px 16px;
    width: auto;
  }
  .writing-title :deep(input),
  .writing-title :deep(input:focus) {
    font-size: 28px;
    font-weight: 650;
    height: auto;
    padding: 8px 0 !important;
    border: 0;
    background: transparent;
    box-shadow: none;
    outline: none;
  }
  .writing-view-switch {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .writing-view-switch .b_btn {
    width: 30px;
    height: 28px;
    padding: 0;
    background: transparent;
    color: var(--desc-color);
  }
  .writing-view-switch .b_btn.is-active {
    color: var(--primary-color);
    border-color: var(--primary-color);
    background: var(--workspace-hover);
  }
  .writing-rich-toolbar :deep(.editor-toolbar-v2__trailing) {
    margin-left: 8px;
  }
  .mobile-view-switch {
    flex-shrink: 0;
    padding: 0;
  }
  .writing-preview > div {
    max-width: 920px;
    margin: 0 auto;
  }
  .writing-md-panes {
    display: flex;
    min-width: 0;
  }
  .writing-md-source,
  .writing-md-preview {
    flex: 1;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: auto;
  }
  .writing-md-preview {
    padding: 16px;
    overflow-wrap: anywhere;
  }
  .writing-md-panes.split .writing-md-preview {
    border-left: 1px solid var(--surface-border-color);
  }
  .writing-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    cursor: text;
    padding: 0 36px;
  }
  .writing-body :deep(.cm-editor) {
    cursor: text;
    height: 100%;
    min-height: 0;
    background: transparent;
  }
  .writing-body > div,
  .writing-body :deep(.tox-tinymce) {
    height: 100% !important;
    min-height: 0;
  }
  .writing-body :deep(.cm-scroller) {
    overflow: auto;
  }
  .writing-body :deep(.cm-content) {
    padding: 16px 0;
  }
  .writing-body :deep(.cm-line) {
    padding: 0;
  }
  .writing-body :deep(.cm-scroller) {
    font-size: 16px;
    line-height: 1.9;
  }
  .writing-body :deep(.cm-focused) {
    outline: none;
  }
  .writing-body :deep(.tox-tinymce) {
    border-radius: 0;
    box-shadow: none;
    border: 0;
  }
  .writing-body :deep(.tox-edit-area::before) {
    border: 0;
  }
  .writing-body :deep(.tox-editor-header) {
    box-shadow: none !important;
  }
  .writing-preview {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 16px 36px;
    line-height: 1.9;
  }
  .writing-status {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin: 10px 24px 0;
    padding: 14px 0;
    border-top: 1px solid var(--workspace-border);
    font-size: 11px;
    color: var(--desc-color);
  }
  .writing-materials {
    position: sticky;
    top: 24px;
    min-width: 0;
    padding: 20px;
    background: var(--workspace-open-canvas);
    border: 0;
    border-left: 1px solid var(--workspace-divider);
    border-radius: 0;
    min-height: 0;
    max-height: 100%;

    overflow-y: auto;
    overscroll-behavior: contain;
    box-sizing: border-box;
  }
  .draft-save-state {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 11px;
    color: var(--desc-color);
    margin-right: 12px;
  }
  .draft-save-state i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--desc-color);
  }
  .draft-save-state.saved i {
    background: #20975b;
  }
  .community-publish-confirm {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .community-publish-confirm p,
  .mobile-submit p {
    font-size: 12px;
    line-height: 1.7;
    color: var(--desc-color);
    margin: 0;
  }
  .composer-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .feed-error {
    color: var(--danger-color);
  }
  .mobile-submit {
    position: sticky;
    bottom: 0;
    background: var(--workspace-open-canvas);
    padding: 12px 0 max(10px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .mobile-submit .b_btn {
    width: 100%;
    min-height: 42px;
  }
  .writing-mobile-dock {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1;
    display: flex;
    gap: 6px;
    padding: 10px 12px max(10px, env(safe-area-inset-bottom));
    background: var(--workspace-open-canvas);
    border-top: 1px solid var(--workspace-border);
  }
  .writing-mobile-dock .b_btn {
    flex: 1;
    min-width: 0;
    min-height: 38px;
    padding: 8px 6px;
    font-size: 12px;
  }
  @media (max-width: 767px) {
    .community-writing {
      padding-bottom: calc(62px + env(safe-area-inset-bottom));
      box-sizing: border-box;
    }
    .writing-workspace {
      display: block;
      padding: 0;
    }
    .writing-main {
      height: 100%;
      width: 100%;
    }
    .writing-paper {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      border: 0;
      border-radius: 0;
      min-height: 0;
    }
    .writing-mode {
      flex-wrap: nowrap;
      gap: 8px;
      padding: 12px 20px 6px;
    }
    .writing-toolbar {
      flex-wrap: nowrap;
      overflow-x: auto;
      padding: 6px 12px;
      gap: 2px;
    }
    .writing-toolbar .b_btn {
      flex-shrink: 0;
    }
    .writing-title {
      margin: 20px 20px 12px;
    }
    .writing-title :deep(input),
    .writing-title :deep(input:focus) {
      font-size: 24px;
    }
    .writing-body {
      cursor: text;
      padding: 0 20px;
    }
    .writing-body :deep(.cm-editor) {
      cursor: text;
      min-height: 0;
    }
    .writing-preview {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 12px 20px;
      min-height: 0;
    }
    .writing-status {
      margin: 16px 20px 0;
    }
    .draft-save-state {
      margin-right: 0;
      font-size: 0;
      gap: 0;
    }
  }
</style>
