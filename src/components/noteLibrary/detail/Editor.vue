<template>
  <div id="editor-container" class="note-editor">
    <div id="editor-toolbar" class="note-editor-toolbar"></div>
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
  import 'tinymce/skins/ui/oxide-dark/skin.min.css';
  import { apiBasePost } from '@/http/request.ts';
  import i18n from '@/i18n';
  import { useUserStore } from '@/store';

  const props = defineProps({
    value: {
      type: String,
      default: () => {
        return '';
      },
    },
    // 编辑器初始可编辑状态
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
  });

  const emits = defineEmits(['update:modelValue', 'setHtml', 'setNoteId', 'saveData']);
  const content = defineModel<string>('content');
  const editorRef = shallowRef<any>(null);
  const editorReady = ref(false);
  const editorKey = ref(0);
  const user = useUserStore();
  let visibilityObserver: IntersectionObserver | null = null;

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

  const forceReinit = async () => {
    editorKey.value += 1;
    editorReady.value = false;
    await nextTick();
    editorReady.value = true;
  };

  const editorInit = computed(() => ({
    inline: true,
    menubar: false,
    branding: false,
    skin: user?.preferences?.theme === 'night' ? 'oxide-dark' : 'oxide',
    skin_url: user?.preferences?.theme === 'night' ? `/tinymce/skins/ui/oxide-dark` : `/tinymce/skins/ui/oxide`,
    statusbar: false,
    language: currentLang.value === 'zh-CN' ? 'zh_CN' : 'en',
    language_url: currentLang.value === 'zh-CN' ? '/tinymce/langs/zh_CN.js' : undefined,
    license_key: 'gpl',
    base_url: '/node_modules/tinymce',
    plugins: 'codesample searchreplace autolink autoresize code emoticons image link lists table wordcount',
    toolbar: props.readonly
      ? false
      : 'undo redo | blocks | bold italic underline | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | table | emoticons | link image | codesampleCustom',
    fixed_toolbar_container: '#editor-toolbar',
    toolbar_persist: true,
    toolbar_mode: 'wrap',
    placeholder: '请输入内容...',
    readonly: false,
    content_css: false,
    emoticons_database_url: '/tinymce/plugins/emoticons/js/emojis.js',
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
    setup: (editor: any) => {
      editorRef.value = editor;
      const codeLanguages = [
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
      editor.options.set(
        'codesample_languages',
        codeLanguages.map((lang) => ({ text: lang.text, value: lang.value })),
      );

      const isCodeSample = (node: Node | null) => {
        if (!node || (node as HTMLElement).nodeName !== 'PRE') return false;
        return ((node as HTMLElement).className || '').includes('language-');
      };

      const getSelectedCodeSample = () => {
        const node = editor.selection ? editor.selection.getNode() : null;
        return isCodeSample(node) ? (node as HTMLElement) : null;
      };
      const openCodeSampleDialog = () => {
        const selectedNode = getSelectedCodeSample();
        const selectedText = editor.selection.getContent({ format: 'text' }) || '';
        const normalizedText = selectedText.replace(/\r\n/g, '\n');
        const languageOptions = editor.options.get('codesample_languages') || [];
        const initialLanguage = languageOptions[0]?.value || 'plaintext';
        const currentLanguage = (() => {
          if (!selectedNode) return initialLanguage;
          const matches = selectedNode.className.match(/language-(\w+)/);
          return matches ? matches[1] : initialLanguage;
        })();
        const currentCode = selectedNode ? selectedNode.textContent || '' : normalizedText;

        editor.windowManager.open({
          title: editor.translate('Insert/Edit Code Sample'),
          size: 'large',
          body: {
            type: 'panel',
            items: [
              {
                type: 'listbox',
                name: 'language',
                label: editor.translate('Language'),
                items: languageOptions,
              },
              {
                type: 'textarea',
                name: 'code',
                label: editor.translate('Code view'),
                spellcheck: false,
              },
            ],
          },
          buttons: [
            { type: 'cancel', name: 'cancel', text: editor.translate('Cancel') },
            { type: 'submit', name: 'save', text: editor.translate('Save'), primary: true },
          ],
          initialData: {
            language: currentLanguage,
            code: currentCode,
          },
          onSubmit: (api) => {
            const data = api.getData();
            const lang = data.language || currentLanguage;
            const code = (data.code || '').replace(/\r\n/g, '\n');
            const encodedText = editor.dom.encode(code);

            editor.undoManager.transact(() => {
              const node = getSelectedCodeSample();
              if (node) {
                editor.dom.setAttrib(node, 'class', `language-${lang}`);
                node.innerHTML = encodedText;
                editor.selection.select(node);
              } else {
                editor.insertContent(`<pre class="language-${lang}">${encodedText}</pre>`);
              }
            });

            api.close();
          },
        });
      };
      editor.ui.registry.addButton('codesampleCustom', {
        icon: 'code-sample',
        tooltip: editor.translate('Insert/edit code sample'),
        onAction: () => openCodeSampleDialog(),
      });
      editor.on('init', async () => {
        if (editor.mode?.set) {
          editor.mode.set(props.readonly ? 'readonly' : 'design');
          return;
        }
        if (editor.setMode) {
          editor.setMode(props.readonly ? 'readonly' : 'design');
        }
        await ensureToolbarRendered();
      });
    },
    content_style:
      '.note-editor-body, .mce-content-body { font-family: inherit; background-color: var(--background-color); color: var(--text-color); padding: 5px 10px 20px; line-height: 1.7; } .note-editor-body h1,.note-editor-body h2,.note-editor-body h3,.note-editor-body h4,.note-editor-body h5,.note-editor-body h6, .mce-content-body h1,.mce-content-body h2,.mce-content-body h3,.mce-content-body h4,.mce-content-body h5,.mce-content-body h6{ margin: 0.6em 0 0.4em; } .note-editor-body table, .mce-content-body table{ border-collapse: collapse; width: 100%; } .note-editor-body table td, .mce-content-body table th, .note-editor-body table td, .mce-content-body table th{ border: 1px solid #d9d9d9; padding: 6px 10px; } .note-editor-body pre.code-block, .mce-content-body pre.code-block, .note-editor-body pre[class*="language-"], .mce-content-body pre[class*="language-"]{ background: #f6f8fa; border: 1px solid #e5e7eb; padding: 12px 14px; border-radius: 10px; overflow: auto; } .note-editor-body pre.code-block code, .mce-content-body pre.code-block code, .note-editor-body pre[class*="language-"] code, .mce-content-body pre[class*="language-"] code{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 13px; white-space: pre; display: block; } .note-editor-body pre.code-block[data-language]::before, .mce-content-body pre.code-block[data-language]::before{ content: attr(data-language); display: inline-block; margin-bottom: 8px; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.02em; }',
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
  }
  .note-editor-toolbar {
    border-bottom: 1px solid rgb(204, 204, 204);
  }
  .note-editor-body {
    outline: none;
    overflow: auto;
    background-color: var(--background-color);
    color: var(--text-color);
    padding: 5px 10px 20px;
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
</style>
