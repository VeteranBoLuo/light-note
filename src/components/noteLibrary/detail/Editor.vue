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
  import { useI18n } from 'vue-i18n';
  import { useUserStore } from '@/store';
  import icon from '@/config/icon';

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
  const { t } = useI18n();
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
    codesample_languages: CODE_LANGUAGES.map((lang) => ({ text: lang.text, value: lang.value })),
    extended_valid_elements: 'input[type|class|checked]',
    toolbar: props.readonly
      ? false
      : 'undo redo | blocks | bold italic underline | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | todoCheckbox  table | emoticons | link image | codesampleCustom',
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
      editor.options.set(
        'codesample_languages',
        CODE_LANGUAGES.map((lang) => ({ text: lang.text, value: lang.value })),
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
        const languageOptions = (() => {
          const options = editor.options.get('codesample_languages');
          if (Array.isArray(options) && options.length) return options;
          return CODE_LANGUAGES.map((lang) => ({ text: lang.text, value: lang.value }));
        })();
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
      editor.ui.registry.addButton('codesampleCustom', {
        icon: 'code-sample',
        tooltip: editor.translate('Insert/edit code sample'),
        onAction: () => openCodeSampleDialog(),
      });
      editor.on('DblClick', (event: MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        const pre = editor.dom.getParent(target, 'pre');
        if (!isCodeSample(pre)) return;
        event.preventDefault();
        openCodeSampleDialog();
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
          return;
        }
        if (editor.setMode) {
          editor.setMode(props.readonly ? 'readonly' : 'design');
        }
        await ensureToolbarRendered();
      });
    },
    content_style:
      '.note-editor-body, .mce-content-body { font-family: inherit; background-color: var(--background-color); color: var(--text-color); padding: 5px 10px 20px; line-height: 1.7; } .note-editor-body h1,.note-editor-body h2,.note-editor-body h3,.note-editor-body h4,.note-editor-body h5,.note-editor-body h6, .mce-content-body h1,.mce-content-body h2,.mce-content-body h3,.mce-content-body h4,.mce-content-body h5,.mce-content-body h6{ margin: 0.6em 0 0.4em; } .note-editor-body table, .mce-content-body table{ border-collapse: collapse; width: 100%; } .note-editor-body table td, .mce-content-body table th, .note-editor-body table td, .mce-content-body table th{ border: 1px solid #d9d9d9; padding: 6px 10px; } .note-editor-body pre.code-block, .mce-content-body pre.code-block, .note-editor-body pre[class*="language-"], .mce-content-body pre[class*="language-"]{ background: #f6f8fa; border: 1px solid #e5e7eb; padding: 12px 14px; border-radius: 10px; overflow: auto; } .note-editor-body pre.code-block code, .mce-content-body pre.code-block code, .note-editor-body pre[class*="language-"] code, .mce-content-body pre[class*="language-"] code{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 13px; white-space: pre; display: block; } .note-editor-body pre.code-block[data-language]::before, .mce-content-body pre.code-block[data-language]::before{ content: attr(data-language); display: inline-block; margin-bottom: 8px; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.02em; } .note-editor-body .note-todo-checkbox, .mce-content-body .note-todo-checkbox{ vertical-align: middle; margin-right: 6px; }',
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
