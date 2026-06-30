<template>
  <div id="editor-container" class="note-editor">
    <!-- HTML 模式：TinyMCE -->
    <template v-if="currentType === 'html'">
      <div id="editor-toolbar" class="note-editor-toolbar" v-show="!readonly"></div>
      <div class="note-editor-scroll">
        <TinyMceEditor
          v-if="editorReady"
          :key="editorKey"
          v-model="content"
          tag-name="div"
          class="note-editor-body"
          :init="editorInit"
          license-key="gpl"
        />
      </div>
    </template>

    <!-- Markdown 模式：textarea + 预览 -->
    <template v-else>
      <div class="md-editor-container">
        <div class="md-editor-toolbar" v-if="!readonly">
          <span class="md-view-toggle">
            <button class="md-view-btn" :class="{ active: mdView === 'edit' }" @click="mdView = 'edit'" title="仅编辑器"
              >编辑</button
            >
            <button class="md-view-btn" :class="{ active: mdView === 'split' }" @click="mdView = 'split'" title="分栏"
              >编辑+预览</button
            >
            <button
              class="md-view-btn"
              :class="{ active: mdView === 'preview' }"
              @click="mdView = 'preview'"
              title="仅预览"
              >预览</button
            >
          </span>
        </div>
        <div class="md-editor-body" :class="`md-view-${mdView}`">
          <div class="md-editor-pane" v-show="mdView === 'edit' || mdView === 'split'">
            <div class="md-editor-label">编辑</div>
            <textarea
              ref="mdTextareaRef"
              class="md-textarea"
              :value="mdContent"
              @input="onMdInput"
              @scroll="syncMdScroll('edit')"
              :readonly="readonly"
              placeholder="写 Markdown..."
            ></textarea>
          </div>
          <div class="md-preview-pane" v-show="mdView === 'preview' || mdView === 'split'">
            <div class="md-editor-label">预览</div>
            <div ref="mdPreviewRef" class="md-preview" @scroll="syncMdScroll('preview')" v-html="renderedMd"></div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, watchEffect } from 'vue';
  import TinyMceEditor from '@tinymce/tinymce-vue';
  import 'tinymce/tinymce';
  import 'tinymce/icons/default';
  import 'tinymce/themes/silver';
  import 'tinymce/models/dom';
  import 'tinymce/plugins/autolink';
  import 'tinymce/plugins/autoresize';
  import 'tinymce/plugins/code';
  import 'tinymce/plugins/emoticons';
  import 'tinymce/plugins/image';
  import 'tinymce/plugins/link';
  import 'tinymce/plugins/lists';
  import 'tinymce/plugins/table';
  import 'tinymce/plugins/codesample';
  import 'tinymce/plugins/searchreplace';
  import 'tinymce/plugins/wordcount';
  import 'tinymce/plugins/quickbars';
  import 'tinymce/skins/ui/oxide-dark/skin.min.css';
  import { apiBasePost } from '@/http/request.ts';
  import i18n from '@/i18n';
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import { bookmarkStore } from '@/store';
  import icon from '@/config/icon';
  import Alert from '@/components/base/BasicComponents/BModal/Alert.ts';
  import TurndownService from 'turndown';

  const CODE_LANGUAGES = [
    { value: 'plaintext', text: 'Plain Text' },
    { value: 'javascript', text: 'JavaScript' },
    { value: 'typescript', text: 'TypeScript' },
    { value: 'html', text: 'HTML' },
    { value: 'css', text: 'CSS' },
    { value: 'json', text: 'JSON' },
    { value: 'bash', text: 'Bash' },
    { value: 'python', text: 'Python' },
    { value: 'java', text: 'Java' },
    { value: 'go', text: 'Go' },
    { value: 'rust', text: 'Rust' },
    { value: 'cpp', text: 'C++' },
    { value: 'sql', text: 'SQL' },
  ];

  const props = defineProps({
    value: {
      type: String,
      default: () => '',
    },
    editable_root: {
      type: Boolean,
      default: true,
    },
    readonly: {
      type: Boolean,
      default: false,
    },
    noteId: {
      type: String,
      default: '',
    },
    imageUploadMode: {
      type: String as () => 'api' | 'base64',
      default: 'api',
    },
    type: {
      type: String as () => 'html' | 'markdown',
      default: 'html',
    },
  });

  const emits = defineEmits([
    'update:modelValue',
    'setHtml',
    'setNoteId',
    'saveData',
    'ready',
    'update:type',
    'switch-backup-change',
  ]);
  const content = defineModel<string>('content');
  const editorRef = shallowRef<any>(null);
  const editorReady = ref(false);
  const editorKey = ref(0);
  const user = useUserStore();
  const bookmark = bookmarkStore();
  const { t } = useI18n();
  const isMobile = computed(() => bookmark.isMobile);
  // MD 编辑器视图：edit / split / preview
  const mdView = ref(isMobile.value ? 'edit' : 'split');
  let visibilityObserver: IntersectionObserver | null = null;

  const currentType = ref(props.type);
  const switchBackup = ref<{ content: string; type: string } | null>(null);

  // 备份状态变化时通知父组件
  watch(
    switchBackup,
    (val) => {
      emits('switch-backup-change', !!val);
    },
    { immediate: true },
  );

  watch(
    () => props.type,
    (val) => {
      currentType.value = val;
    },
  );

  // Markdown 编辑器状态
  const mdContent = ref('');
  let markedLib: any = null;
  let dompurifyLib: any = null;

  // 滚动同步
  const mdTextareaRef = ref<HTMLTextAreaElement | null>(null);
  const mdPreviewRef = ref<HTMLElement | null>(null);
  let isSyncingMdScroll = false;

  function syncMdScroll(source: 'edit' | 'preview') {
    if (isSyncingMdScroll) return;
    isSyncingMdScroll = true;

    const textarea = mdTextareaRef.value;
    const preview = mdPreviewRef.value;
    if (!textarea || !preview) {
      isSyncingMdScroll = false;
      return;
    }

    if (source === 'edit') {
      // textarea → preview：按百分比同步
      const ratio = textarea.scrollHeight - textarea.clientHeight;
      if (ratio > 0) {
        preview.scrollTop = (textarea.scrollTop / ratio) * (preview.scrollHeight - preview.clientHeight);
      }
    } else {
      // preview → textarea：按百分比同步
      const ratio = preview.scrollHeight - preview.clientHeight;
      if (ratio > 0) {
        textarea.scrollTop = (preview.scrollTop / ratio) * (textarea.scrollHeight - textarea.clientHeight);
      }
    }

    requestAnimationFrame(() => {
      isSyncingMdScroll = false;
    });
  }

  // Markdown 模式下同步外部内容
  watch(
    [() => props.type, content],
    async ([type]) => {
      if (type === 'markdown' && content.value !== mdContent.value) {
        mdContent.value = content.value || '';
        if (!markedLib) await ensureMdLib();
        renderMd();
      }
    },
    { immediate: true },
  );

  // 懒加载 marked + dompurify
  async function ensureMdLib() {
    if (markedLib) return;
    const mods = await Promise.all([import('marked'), import('dompurify')]);
    markedLib = mods[0].marked;
    dompurifyLib = mods[1].default;
  }

  const renderedMd = ref('');
  let mdRenderTimer: ReturnType<typeof setTimeout> | null = null;

  function onMdInput(e: Event) {
    const val = (e.target as HTMLTextAreaElement).value;
    mdContent.value = val;
    content.value = val;
    debounceRenderMd();
  }

  function debounceRenderMd() {
    if (mdRenderTimer) clearTimeout(mdRenderTimer);
    mdRenderTimer = setTimeout(() => {
      renderMd();
    }, 200);
  }

  async function renderMd() {
    if (!markedLib) await ensureMdLib();
    try {
      const raw = markedLib.parse(mdContent.value || '');
      renderedMd.value = dompurifyLib ? dompurifyLib.sanitize(raw) : raw;
    } catch {
      renderedMd.value = '<p>渲染错误</p>';
    }
  }

  // 切换模式
  async function handleModeSwitch() {
    const targetType = currentType.value === 'html' ? 'markdown' : 'html';
    const backup = { content: content.value || '', type: currentType.value };

    // 移动端直接切，不弹框、不备份
    if (isMobile.value) {
      await doDirectSwitch(targetType, backup);
      return;
    }

    Alert.alert({
      title: targetType === 'markdown' ? '切换为 Markdown 模式' : '切换为 HTML 模式',
      content:
        targetType === 'markdown'
          ? '当前内容将自动转换为 Markdown 格式。\n部分富文本样式（文字颜色、待办复选框、表格样式等）可能无法完整保留。\n切换后可点击「 ↩ 撤回切换」恢复。'
          : 'Markdown 内容将渲染为富文本格式，一般不会丢失内容。\n切换后可点击「 ↩ 撤回切换」恢复。',
      okText: '确认切换',
      cancelText: '取消',
      onOk: () => doSwitch(targetType, backup),
    });
  }

  async function doDirectSwitch(targetType: string, backup: { content: string; type: string }) {
    currentType.value = targetType;
    if (targetType === 'markdown') {
      await ensureMdLib();
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      });
      mdContent.value = turndownService.turndown(backup.content || '');
      content.value = mdContent.value;
      await nextTick();
      renderMd();
    } else {
      await ensureMdLib();
      const mdText = backup.content || '';
      if (mdText.trim()) {
        try {
          const html = markedLib.parse(mdText);
          content.value = dompurifyLib ? dompurifyLib.sanitize(html) : html;
        } catch {
          content.value = mdText;
        }
      } else {
        content.value = '';
      }
      forceReinit();
    }
    emits('update:type', targetType);
  }

  async function doSwitch(targetType: string, backup: { content: string; type: string }) {
    switchBackup.value = backup;
    currentType.value = targetType;

    if (targetType === 'markdown') {
      // HTML → MD：用 turndown 转换
      await ensureMdLib();
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      });
      mdContent.value = turndownService.turndown(backup.content || '');
      content.value = mdContent.value;
      await nextTick();
      renderMd();
    } else {
      // MD → HTML：用 marked 转换
      await ensureMdLib();
      const mdText = backup.content || '';
      if (mdText.trim()) {
        try {
          const html = markedLib.parse(mdText);
          content.value = dompurifyLib ? dompurifyLib.sanitize(html) : html;
        } catch {
          content.value = mdText;
        }
      } else {
        content.value = '';
      }
      // 重建 TinyMCE
      forceReinit();
    }

    emits('update:type', targetType);
  }

  function undoSwitch() {
    if (!switchBackup.value) return;
    const backup = switchBackup.value;
    const targetLabel = backup.type === 'html' ? 'HTML' : 'Markdown';
    Alert.alert({
      title: '撤回模式切换',
      content: `确认撤回为 ${targetLabel} 模式？撤回后会丢失当前模式下的编辑内容。`,
      okText: '确认撤回',
      cancelText: '取消',
      onOk: () => doUndo(backup),
    });
  }

  function doUndo(backup: { content: string; type: string }) {
    switchBackup.value = null;

    currentType.value = backup.type;

    if (backup.type === 'html') {
      content.value = backup.content;
      forceReinit();
    } else {
      mdContent.value = backup.content;
      content.value = backup.content;
      if (markedLib) renderMd();
    }

    emits('update:type', backup.type);
  }

  const ensureToolbar = async () => {
    await nextTick();
    const toolbarEl = document.getElementById('editor-toolbar');
    if (!toolbarEl) {
      editorKey.value += 1;
      editorReady.value = false;
      await nextTick();
    }
    editorReady.value = true;
  };

  const ensureToolbarRendered = async () => {
    if (props.readonly) return;
    await nextTick();
    const toolbar = document.querySelector('#editor-toolbar .tox-toolbar');
    if (!toolbar) {
      editorKey.value += 1;
      editorReady.value = false;
      await nextTick();
      editorReady.value = true;
    }
  };

  const currentLang = computed(() => i18n.global.locale.value);
  const isNightTheme = computed(() => user.currentTheme === 'night');

  const forceReinit = async () => {
    if (currentType.value !== 'html') return;
    editorKey.value += 1;
    editorReady.value = false;
    await nextTick();
    editorReady.value = true;
  };

  const resetUndoHistory = (editor: any) => {
    editor.undoManager?.clear?.();
    editor.undoManager?.add?.();
    editor.setDirty?.(false);
  };

  const focusToEnd = async () => {
    await nextTick();
    if (currentType.value === 'markdown') return;
    const editor = editorRef.value;
    if (!editor) return;
    editor.focus();
    const body = editor.getBody?.();
    if (body) {
      editor.selection.select(body, true);
      editor.selection.collapse(false);
    }
    editor.undoManager?.add();
    editor.nodeChanged?.();
  };

  const replaceContentWithUndo = async (html: string) => {
    await nextTick();
    if (currentType.value === 'markdown') {
      // AI 返回的是 HTML，转成 MD 再插入
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      });
      const md = turndownService.turndown(html || '');
      mdContent.value = md;
      content.value = md;
      if (markedLib) renderMd();
      return true;
    }
    const editor = editorRef.value;
    if (!editor) return false;
    editor.undoManager?.transact(() => {
      editor.setContent(html || '');
    });
    editor.nodeChanged?.();
    return true;
  };

  defineExpose({
    focusToEnd,
    replaceContentWithUndo,
    hasSwitchBackup: switchBackup,
    triggerModeSwitch: () => handleModeSwitch(),
    triggerUndoSwitch: () => undoSwitch(),
  });

  const editorInit = computed(() => ({
    inline: true,
    menubar: false,
    branding: false,
    skin: isNightTheme.value ? 'oxide-dark' : 'oxide',
    skin_url: isNightTheme.value ? `/tinymce/skins/ui/oxide-dark` : `/tinymce/skins/ui/oxide`,
    statusbar: false,
    language: currentLang.value === 'zh-CN' ? 'zh_CN' : 'en',
    language_url: currentLang.value === 'zh-CN' ? '/tinymce/langs/zh_CN.js' : undefined,
    license_key: 'gpl',
    base_url: '/node_modules/tinymce',
    plugins: 'codesample searchreplace autolink autoresize code emoticons image link lists table wordcount quickbars',
    quickbars_selection_toolbar: 'myHeadingMenu |  bold italic forecolor backcolor | removeformat |quicklink',
    quickbars_insert_toolbar: false,
    codesample_languages: CODE_LANGUAGES.map((lang) => ({ text: lang.text, value: lang.value })),
    extended_valid_elements: 'input[type|class|checked]',
    toolbar: props.readonly
      ? false
      : 'undo redo | blocks  | bold italic underline removeformat | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | todoCheckbox  table | link image emoticons |  codeBlock',
    fixed_toolbar_container: '#editor-toolbar',
    toolbar_persist: true,
    toolbar_mode: 'wrap',
    placeholder: '请输入内容...',
    readonly: false,
    content_css: false,
    emoticons_database_url: '/tinymce/plugins/emoticons/js/emojis.js',
    paste_data_images: true,
    convert_urls: false,
    automatic_uploads: props.imageUploadMode !== 'base64',
    ...(props.imageUploadMode === 'base64'
      ? {}
      : {
          images_upload_handler: (blobInfo: any) =>
            new Promise((resolve, reject) => {
              const formData = new FormData();
              formData.append('file', blobInfo.blob(), blobInfo.filename());
              formData.append('noteId', props.noteId);
              apiBasePost('/api/note/uploadImage', formData, {
                headers: {
                  'Content-Type': 'multipart/form-data',
                },
              })
                .then((res) => {
                  if (res.data?.noteId) {
                    emits('setNoteId', res.data.noteId);
                  }
                  if (res.data?.url) {
                    resolve(res.data.url);
                    return;
                  }
                  reject('上传失败');
                })
                .catch(() => reject('上传失败'));
            }),
        }),
    setup: (editor: any) => {
      editorRef.value = editor;

      const todoCheckboxHtml = '<input type="checkbox" class="note-todo-checkbox" />';
      const getCurrentBlock = () => {
        const node = editor.selection ? editor.selection.getNode() : null;
        if (!node) return null;
        return editor.dom.getParent(node, 'p,div,li,td,th') as HTMLElement | null;
      };
      const getSelectedBlocks = () => {
        if (editor.selection?.getSelectedBlocks) {
          const blocks = editor.selection.getSelectedBlocks() as HTMLElement[] | null;
          if (blocks && blocks.length) return blocks;
        }
        const current = getCurrentBlock();
        return current ? [current] : [];
      };
      const isBlockEligible = (block: HTMLElement) => {
        const tagName = block.tagName.toLowerCase();
        if (!['p', 'div', 'td', 'th'].includes(tagName)) return false;
        const listParent = editor.dom.getParent(block, 'ul,ol,li');
        return !listParent;
      };
      const hasIneligibleSelection = (blocks: HTMLElement[]) =>
        blocks.length === 0 || blocks.some((block) => !isBlockEligible(block));
      const getLeadingCheckbox = (block: HTMLElement | null) => {
        if (!block) return null;
        let firstNode: ChildNode | null = block.firstChild;
        while (firstNode && firstNode.nodeType === 3 && !firstNode.textContent?.trim()) {
          firstNode = firstNode.nextSibling;
        }
        if (firstNode && firstNode.nodeType === 1) {
          const el = firstNode as HTMLElement;
          if (el.tagName === 'INPUT' && el.classList.contains('note-todo-checkbox')) {
            return el as HTMLInputElement;
          }
        }
        return null;
      };
      const removeLeadingCheckbox = (block: HTMLElement | null) => {
        if (!block) return;
        const checkbox = getLeadingCheckbox(block);
        if (!checkbox) return;
        const next = checkbox.nextSibling;
        editor.undoManager.transact(() => {
          if (next && next.nodeType === 3 && !next.textContent?.trim()) {
            block.removeChild(next);
          }
          block.removeChild(checkbox);
        });
      };
      const ensureTodoCheckbox = (block: HTMLElement | null) => {
        if (!block) return;
        if (getLeadingCheckbox(block)) return;
        const checkboxEl = editor.dom.create('input', {
          type: 'checkbox',
          class: 'note-todo-checkbox',
        }) as HTMLInputElement;
        const spacer = editor.dom.doc.createTextNode(' ');
        editor.undoManager.transact(() => {
          block.insertBefore(spacer, block.firstChild);
          block.insertBefore(checkboxEl, spacer);
        });
      };
      const insertTodoLineAfter = (block: HTMLElement | null) => {
        if (!block || !block.parentNode) return;
        const tagName = block.tagName || 'P';
        const newBlock = editor.dom.create(tagName, {});
        newBlock.innerHTML = `${todoCheckboxHtml}&nbsp;`;
        editor.dom.insertAfter(newBlock, block);
        const textNode = newBlock.lastChild;
        if (textNode) {
          editor.selection.setCursorLocation(textNode, textNode.textContent?.length || 0);
        } else {
          editor.selection.setCursorLocation(newBlock, 0);
        }
      };

      editor.ui.registry.addIcon('todo-checkbox', icon.noteDetail.toolbar.todo);
      editor.ui.registry.addButton('todoCheckbox', {
        icon: 'todo-checkbox',
        tooltip: t('todo'),
        onSetup: (api) => {
          const refresh = () => {
            if (!editor.hasFocus()) {
              api.setEnabled(false);
              return;
            }
            const blocks = getSelectedBlocks();
            api.setEnabled(!hasIneligibleSelection(blocks));
          };
          refresh();
          editor.on('focus', refresh);
          editor.on('blur', refresh);
          editor.on('NodeChange', refresh);
          editor.on('SelectionChange', refresh);
          return () => {
            editor.off('focus', refresh);
            editor.off('blur', refresh);
            editor.off('NodeChange', refresh);
            editor.off('SelectionChange', refresh);
          };
        },
        onAction: () => {
          if (!editor.hasFocus()) return;
          const blocks = getSelectedBlocks();
          if (hasIneligibleSelection(blocks)) return;
          const eligibleBlocks = blocks.filter((block) => isBlockEligible(block));
          if (!eligibleBlocks.length) return;
          const allHaveCheckbox = eligibleBlocks.every((block) => getLeadingCheckbox(block));
          editor.undoManager.transact(() => {
            if (allHaveCheckbox) {
              eligibleBlocks.forEach((block) => removeLeadingCheckbox(block));
              return;
            }
            eligibleBlocks.forEach((block) => {
              if (!getLeadingCheckbox(block)) {
                ensureTodoCheckbox(block);
              }
            });
          });
        },
      });
      editor.ui.registry.addIcon('code-block', icon.noteDetail.toolbar.codeBlock);
      editor.ui.registry.addToggleButton('codeBlock', {
        icon: 'code-block',
        tooltip: t('noteDetail.editor.codeBlock'),
        onSetup: (api) => {
          const refresh = () => {
            const node = editor.selection ? editor.selection.getStart() : null;
            const isActive = node ? editor.dom.is(node, 'pre') : false;
            api.setActive(isActive);
          };
          refresh();
          editor.on('NodeChange', refresh);
          return () => editor.off('NodeChange', refresh);
        },
        onAction: () => editor.execCommand('FormatBlock', false, 'pre'),
      });
      editor.ui.registry.addMenuButton('myHeadingMenu', {
        text: t('noteDetail.editor.headingMenu'),
        fetch: function (callback) {
          const items = [
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading1'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h1'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading2'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h2'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading3'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h3'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading4'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h4'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading5'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h5'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.heading6'),
              onAction: () => editor.execCommand('FormatBlock', false, 'h6'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.paragraph'),
              onAction: () => editor.execCommand('FormatBlock', false, 'p'),
            },
            {
              type: 'menuitem',
              text: t('noteDetail.editor.codeBlock'),
              onAction: () => editor.execCommand('FormatBlock', false, 'pre'),
            },
          ];
          callback(items);
        },
      });
      const syncCheckboxAttribute = (target: EventTarget | null) => {
        if (!target) return;
        const el = target as HTMLElement;
        if (el.tagName !== 'INPUT' || !el.classList.contains('note-todo-checkbox')) return;
        const input = el as HTMLInputElement;
        if (input.checked) {
          editor.dom.setAttrib(input, 'checked', 'checked');
        } else {
          editor.dom.setAttrib(input, 'checked', null);
        }
      };

      editor.on('click', (event: MouseEvent) => {
        syncCheckboxAttribute(event.target);
      });
      editor.on('change', (event: Event) => {
        syncCheckboxAttribute(event.target);
      });

      editor.on('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter' || event.isComposing) return;
        const block = getCurrentBlock();
        if (!block) return;
        if (!getLeadingCheckbox(block)) return;
        event.preventDefault();
        editor.undoManager.transact(() => {
          insertTodoLineAfter(block);
        });
      });
      editor.on('init', async () => {
        if (editor.mode?.set) {
          editor.mode.set(props.readonly ? 'readonly' : 'design');
        } else if (editor.setMode) {
          editor.setMode(props.readonly ? 'readonly' : 'design');
        }
        await ensureToolbarRendered();
        window.setTimeout(() => {
          resetUndoHistory(editor);
          emits('ready');
        }, 0);
      });
    },
    content_style:
      '.note-editor-body, .mce-content-body { font-family: inherit; background-color: var(--background-color); color: var(--text-color); padding: 5px 10px 20px; } .note-editor-body h1,.note-editor-body h2,.note-editor-body h3,.note-editor-body h4,.note-editor-body h5,.note-editor-body h6, .mce-content-body h1,.mce-content-body h2,.mce-content-body h3,.mce-content-body h4,.mce-content-body h5,.mce-content-body h6{ margin: 0.6em 0 0.4em; } .note-editor-body table, .mce-content-body table{ border-collapse: collapse; width: 100%; } .note-editor-body table td, .mce-content-body table th, .note-editor-body table td, .mce-content-body table th{ border: 1px solid #d9d9d9; padding: 6px 10px; } .note-editor-body pre.code-block, .mce-content-body pre.code-block, .note-editor-body pre[class*="language-"], .mce-content-body pre[class*="language-"]{ background: #f6f8fa; border: 1px solid #e5e7eb; padding: 12px 14px; border-radius: 10px; overflow: auto; } .note-editor-body pre.code-block code, .mce-content-body pre.code-block code, .note-editor-body pre[class*="language-"] code, .mce-content-body pre[class*="language-"] code{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 13px; white-space: pre; display: block; } .note-editor-body pre.code-block[data-language]::before, .mce-content-body pre.code-block[data-language]::before{ content: attr(data-language); display: inline-block; margin-bottom: 8px; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.02em; } .note-editor-body .note-todo-checkbox, .mce-content-body .note-todo-checkbox{ vertical-align: middle; margin-right: 6px; }',
  }));

  watchEffect(() => {
    if (!editorRef.value) return;
    if (editorRef.value.mode?.set) {
      editorRef.value.mode.set(props.readonly ? 'readonly' : 'design');
      return;
    }
    if (editorRef.value.setMode) {
      editorRef.value.setMode(props.readonly ? 'readonly' : 'design');
    }
  });

  onMounted(() => {
    ensureToolbar();
    const container = document.getElementById('editor-container');
    if (container && 'IntersectionObserver' in window) {
      visibilityObserver = new IntersectionObserver(async (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          await ensureToolbarRendered();
        }
      });
      visibilityObserver.observe(container);
    }
  });

  watch(currentLang, () => {
    if (!editorReady.value) return;
    forceReinit();
  });

  watch(isNightTheme, () => {
    if (!editorReady.value) return;
    forceReinit();
  });

  onBeforeUnmount(() => {
    if (visibilityObserver) {
      visibilityObserver.disconnect();
      visibilityObserver = null;
    }
    if (editorRef.value) {
      editorRef.value.remove();
    }
  });
</script>

<style lang="less">
  #editor-container.note-editor {
    display: flex;
    flex-direction: column;
    height: calc(100% - 60px);
    overflow: hidden;
  }
  .note-editor-toolbar {
    border-bottom: 1px solid rgb(204, 204, 204);
    background-color: var(--w-e-toolbar-bg-color);
  }
  .note-editor-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .note-editor-body {
    outline: none;
    overflow: visible;
    background-color: var(--background-color);
    color: var(--text-color);
    padding: 5px 10px 20px;
    min-height: 100%;
  }

  /* 模式切换栏 */
  .editor-mode-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--card-border-color, #e8eaf2);
    background: var(--background-color);
  }
  .mode-pill {
    display: inline-flex;
    align-items: center;
    padding: 0 10px;
    height: 22px;
    border-radius: 11px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    letter-spacing: 0.5px;
    transition: background 0.15s;
    user-select: none;
    background: var(--common-tag-bg-color, #f0f0f0);
    color: var(--desc-color, #666);
    &.is-markdown {
      background: #615ced20;
      color: #615ced;
    }
    &.is-html {
      background: #00a88420;
      color: #00a884;
    }
    &:hover {
      opacity: 0.8;
    }
  }
  .undo-switch-btn {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
    height: 22px;
    border: 1px solid var(--card-border-color, #e8eaf2);
    border-radius: 6px;
    background: transparent;
    color: var(--text-color);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
    &:hover {
      background: var(--common-tag-bg-color, #f0f0f0);
      border-color: var(--primary-color, #615ced);
      color: var(--primary-color, #615ced);
    }
  }

  /* Markdown 编辑器工具栏 */
  .md-editor-toolbar {
    display: flex;
    align-items: center;
    padding: 4px 10px;
    border-bottom: 1px solid var(--card-border-color, #e8eaf2);
    background: var(--background-color);
    flex-shrink: 0;
  }
  .md-view-toggle {
    display: inline-flex;
    border: 1px solid var(--card-border-color, #e8eaf2);
    border-radius: 6px;
    overflow: hidden;
  }
  .md-view-btn {
    padding: 2px 10px;
    border: none;
    border-right: 1px solid var(--card-border-color, #e8eaf2);
    background: transparent;
    color: var(--desc-color, #888);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    &:last-child {
      border-right: none;
    }
    &:hover {
      color: var(--text-color);
      background: var(--common-tag-bg-color, #f0f0f0);
    }
    &.active {
      background: var(--primary-color, #615ced);
      color: #fff;
    }
  }

  /* Markdown 编辑器 */
  .md-editor-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .md-editor-body {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
    &.md-view-edit .md-preview-pane,
    &.md-view-preview .md-editor-pane {
      display: none;
    }
  }
  .md-editor-pane,
  .md-preview-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }
  .md-editor-pane {
    border-right: 1px solid var(--card-border-color, #e8eaf2);
  }
  .md-editor-label {
    padding: 4px 10px;
    font-size: 11px;
    color: var(--desc-color, #888);
    border-bottom: 1px solid var(--card-border-color, #e8eaf2);
    flex-shrink: 0;
  }
  .md-textarea {
    flex: 1;
    min-height: 0;
    resize: none;
    border: none;
    outline: none;
    padding: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.6;
    background: var(--background-color);
    color: var(--text-color);
    &::placeholder {
      color: var(--desc-color, #999);
    }
  }
  .md-preview {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 10px;
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.7;
    h1,
    h2,
    h3,
    h4,
    h5,
    h6 {
      margin: 0.6em 0 0.4em;
    }
    pre {
      border: 1px solid var(--card-border-color, #e5e7eb);
      border-radius: 8px;
      padding: 10px 12px;
      overflow: auto;
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace;
        font-size: 13px;
      }
    }
    code {
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      th,
      td {
        border: 1px solid var(--card-border-color, #d9d9d9);
        padding: 6px 10px;
      }
    }
    blockquote {
      border-left: 3px solid var(--primary-color, #615ced);
      margin: 0;
      padding: 4px 12px;
      color: var(--desc-color, #666);
      background: var(--common-tag-bg-color, #f9f9f9);
      border-radius: 0 6px 6px 0;
    }
    img {
      max-width: 100%;
    }
    ul,
    ol {
      padding-left: 20px;
    }
  }

  .note-editor .tox .tox-toolbar,
  .note-editor .tox .tox-toolbar__primary,
  .note-editor .tox .tox-toolbar__overflow {
    background-color: var(--w-e-toolbar-bg-color) !important;
    border: none !important;
    box-shadow: none !important;
  }
  .note-editor .tox .tox-editor-header,
  .note-editor .tox .tox-toolbar__group {
    border: none !important;
    box-shadow: none !important;
  }
  .note-editor .tox .tox-tbtn svg {
    fill: var(--w-e-toolbar-color) !important;
  }
  .note-editor .tox .tox-tbtn--disabled svg {
    fill: #999 !important;
  }
  .note-editor .tox .tox-collection__item-label {
    font-size: 12px;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .note-editor .tox .tox-edit-area,
  .note-editor .tox .tox-edit-area__iframe {
    background-color: var(--background-color) !important;
  }
  [data-theme='night'] {
    .note-editor-toolbar {
      border-bottom-color: #3a3d46;
      background-color: #25262b;
    }

    .note-editor .tox .tox-toolbar,
    .note-editor .tox .tox-toolbar__primary,
    .note-editor .tox .tox-toolbar__overflow,
    .note-editor .tox .tox-editor-header {
      background-color: #25262b !important;
    }

    .note-editor .tox .tox-toolbar__group {
      background-color: transparent !important;
      border-right: 1px solid #3a3d46 !important;
    }

    .note-editor .tox .tox-tbtn,
    .note-editor .tox .tox-mbtn {
      color: #d5d8e1 !important;
      background-color: #343741 !important;
      border: 1px solid #474b56 !important;
    }

    .note-editor .tox .tox-tbtn__select-label,
    .note-editor .tox .tox-mbtn__select-label {
      color: #d5d8e1 !important;
    }

    .note-editor .tox .tox-tbtn svg,
    .note-editor .tox .tox-mbtn svg {
      fill: #d5d8e1 !important;
    }

    .note-editor .tox .tox-tbtn:hover,
    .note-editor .tox .tox-tbtn:focus,
    .note-editor .tox .tox-mbtn:hover,
    .note-editor .tox .tox-mbtn:focus {
      background-color: #414654 !important;
      border-color: #596073 !important;
      color: #f5f7ff !important;
    }

    .note-editor .tox .tox-tbtn:hover svg,
    .note-editor .tox .tox-tbtn:focus svg,
    .note-editor .tox .tox-mbtn:hover svg,
    .note-editor .tox .tox-mbtn:focus svg {
      fill: #f5f7ff !important;
    }

    .note-editor .tox .tox-tbtn.tox-tbtn--enabled,
    .note-editor .tox .tox-tbtn.tox-tbtn--enabled:hover {
      background-color: #59637d !important;
      border-color: #7480a0 !important;
      color: #ffffff !important;
    }

    .note-editor .tox .tox-tbtn.tox-tbtn--enabled svg,
    .note-editor .tox .tox-tbtn.tox-tbtn--enabled:hover svg {
      fill: #ffffff !important;
    }

    .note-editor .tox .tox-tbtn--disabled,
    .note-editor .tox .tox-tbtn--disabled:hover {
      background-color: #2b2d33 !important;
      border-color: #3a3d46 !important;
      color: #767d8f !important;
    }

    .note-editor .tox .tox-tbtn--disabled svg {
      fill: #767d8f !important;
    }

    .note-editor .tox .tox-collection,
    .note-editor .tox .tox-menu,
    .note-editor .tox .tox-collection--list,
    .note-editor .tox .tox-collection--grid {
      background-color: #2c2f37 !important;
      border: 1px solid #444955 !important;
      color: #dfe3ee !important;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35) !important;
    }

    .note-editor .tox .tox-collection__item,
    .note-editor .tox .tox-collection__item-label {
      color: #dfe3ee !important;
    }

    .note-editor .tox .tox-collection__item--active,
    .note-editor .tox .tox-collection__item--enabled:hover,
    .note-editor .tox .tox-collection__item--enabled:focus {
      background-color: #414654 !important;
      color: #ffffff !important;
    }

    .note-editor .tox .tox-collection--list .tox-collection__item,
    .note-editor .tox .tox-collection--list .tox-collection__item-label,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h1,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h2,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h3,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h4,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h5,
    .note-editor .tox .tox-collection--list .tox-collection__item-label h6,
    .note-editor .tox .tox-collection--list .tox-collection__item-label p,
    .note-editor .tox .tox-collection--list .tox-collection__item-label pre {
      color: #dfe3ee !important;
    }

    .note-editor .tox .tox-collection--list .tox-collection__item--active,
    .note-editor .tox .tox-collection--list .tox-collection__item--enabled:hover,
    .note-editor .tox .tox-collection--list .tox-collection__item--enabled:focus,
    .note-editor .tox .tox-collection--list .tox-collection__item--selected {
      background-color: #4a5163 !important;
      color: #ffffff !important;
    }

    .note-editor .tox .tox-collection--list .tox-collection__item--state-disabled,
    .note-editor .tox .tox-collection--list .tox-collection__item--state-disabled .tox-collection__item-label,
    .note-editor .tox .tox-collection--list .tox-collection__item--state-disabled .tox-collection__item-label * {
      color: #7b8294 !important;
    }

    .tox .tox-collection--list .tox-collection__item--active,
    .tox .tox-collection--list .tox-collection__item--enabled:hover,
    .tox .tox-collection--list .tox-collection__item--enabled:focus,
    .tox .tox-collection--list .tox-collection__item--selected {
      background-color: #4a5163 !important;
      color: #ffffff !important;
    }

    .tox .tox-collection--list .tox-collection__item--enabled:not(.tox-collection__item--state-disabled) {
      background-color: #2f3442 !important;
      color: #dfe3ee !important;
    }

    .tox .tox-collection--list .tox-collection__item--active:not(.tox-collection__item--state-disabled),
    .tox .tox-collection--list .tox-collection__item--active.tox-collection__item--state-disabled {
      background-color: #4a5163 !important;
      color: #ffffff !important;
    }
  }
  code[data-mce-selected='inline-boundary'] {
    background-color: unset !important;
  }
  .note-editor-body pre[class*='language-'],
  .mce-content-body pre[class*='language-'] {
    text-shadow: none !important;
  }
  .tox .tox-collection__item {
    cursor: pointer;
    height: 24px;
  }
  .tox-collection__item-label {
    h1 {
      font-size: 17px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h2 {
      font-size: 16px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h3 {
      font-size: 15px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h4 {
      font-size: 14px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h5 {
      font-size: 13px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    h6 {
      font-size: 12px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    p {
      font-size: 11px !important;
      background-color: transparent !important;
      color: var(--text-color) !important;
    }
    pre {
      color: var(--text-color) !important;
      font-family: 微软雅黑 !important;
      font-size: 12px !important;
      background-color: transparent !important;
      border: none !important;
      overflow: hidden !important;
    }
  }

  /* 移动端 MD 视图：隐藏分栏按钮，用简单 tab */
  @media (max-width: 1024px) {
    .md-view-toggle .md-view-btn:nth-child(2) {
      display: none;
    }
  }
</style>
