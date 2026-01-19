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
  import 'tinymce/plugins/wordcount';
  import 'tinymce/skins/ui/oxide-dark/skin.min.css';
  import hljs from 'highlight.js/lib/core';
  import javascript from 'highlight.js/lib/languages/javascript';
  import typescript from 'highlight.js/lib/languages/typescript';
  import xml from 'highlight.js/lib/languages/xml';
  import css from 'highlight.js/lib/languages/css';
  import json from 'highlight.js/lib/languages/json';
  import bash from 'highlight.js/lib/languages/bash';
  import python from 'highlight.js/lib/languages/python';
  import java from 'highlight.js/lib/languages/java';
  import go from 'highlight.js/lib/languages/go';
  import rust from 'highlight.js/lib/languages/rust';
  import cpp from 'highlight.js/lib/languages/cpp';
  import sql from 'highlight.js/lib/languages/sql';
  import 'highlight.js/styles/github.css';
  import { apiBasePost } from '@/http/request.ts';
  import i18n from '@/i18n';
  import { bookmarkStore } from '@/store';

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
  const bookmark = bookmarkStore();
  let highlightTimer: number | null = null;
  let visibilityObserver: IntersectionObserver | null = null;
  const tinymceBaseUrl = import.meta.env.PROD ? '/tinymce' : '/node_modules/tinymce';

  hljs.registerLanguage('javascript', javascript);
  hljs.registerLanguage('typescript', typescript);
  hljs.registerLanguage('html', xml);
  hljs.registerLanguage('xml', xml);
  hljs.registerLanguage('css', css);
  hljs.registerLanguage('json', json);
  hljs.registerLanguage('bash', bash);
  hljs.registerLanguage('python', python);
  hljs.registerLanguage('java', java);
  hljs.registerLanguage('go', go);
  hljs.registerLanguage('rust', rust);
  hljs.registerLanguage('cpp', cpp);
  hljs.registerLanguage('sql', sql);

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
    skin: 'oxide-dark',
    skin_url: `/tinymce/skins/ui/oxide-dark`,
    statusbar: false,
    language: currentLang.value === 'zh-CN' ? 'zh_CN' : 'en',
    language_url: currentLang.value === 'zh-CN' ? '/tinymce/langs/zh_CN.js' : undefined,
    license_key: 'gpl',
    base_url: '/node_modules/tinymce',
    plugins: 'autolink autoresize code emoticons image link lists table wordcount',
    toolbar: props.readonly
      ? false
      : 'undo redo | blocks | bold italic underline | forecolor backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | table | emoticons | link image | codeblock',
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
        { value: 'plaintext', text: 'Plain Text', hljs: null },
        { value: 'javascript', text: 'JavaScript', hljs: 'javascript' },
        { value: 'typescript', text: 'TypeScript', hljs: 'typescript' },
        { value: 'html', text: 'HTML', hljs: 'html' },
        { value: 'css', text: 'CSS', hljs: 'css' },
        { value: 'json', text: 'JSON', hljs: 'json' },
        { value: 'bash', text: 'Bash', hljs: 'bash' },
        { value: 'python', text: 'Python', hljs: 'python' },
        { value: 'java', text: 'Java', hljs: 'java' },
        { value: 'go', text: 'Go', hljs: 'go' },
        { value: 'rust', text: 'Rust', hljs: 'rust' },
        { value: 'cpp', text: 'C++', hljs: 'cpp' },
        { value: 'sql', text: 'SQL', hljs: 'sql' },
      ];
      const normalizeLanguageClass = (className: string) => {
        const cleaned = className
          .replace(/\blanguage-[^\s]+/g, '')
          .replace(/\bhljs\b/g, '')
          .trim();
        return cleaned.length ? `${cleaned} ` : '';
      };
      const setCodeLanguage = (preNode: HTMLElement, codeNode: HTMLElement, lang: string) => {
        const preBase = normalizeLanguageClass(preNode.className);
        preNode.className = `${preBase}code-block language-${lang}`.trim();
        preNode.setAttribute('data-language', lang);
        const codeBase = normalizeLanguageClass(codeNode.className);
        codeNode.className = `${codeBase}language-${lang}`.trim();
      };
      const highlightCodeBlocks = () => {
        if (!editorRef.value) return;
        if (highlightTimer) {
          window.clearTimeout(highlightTimer);
        }
        highlightTimer = window.setTimeout(() => {
          const body = editorRef.value.getBody();
          if (!body) return;
          const nodes = body.querySelectorAll('pre code');
          nodes.forEach((node) => {
            hljs.highlightElement(node as HTMLElement);
          });
        }, 50);
      };
      const insertOrUpdateCodeBlock = (lang: string) => {
        const selectionNode = editor.selection.getNode();
        const codeNode = editor.dom.getParent(selectionNode, 'code') as HTMLElement | null;
        const preNode = editor.dom.getParent(selectionNode, 'pre') as HTMLElement | null;
        if (codeNode && preNode) {
          setCodeLanguage(preNode, codeNode, lang);
          highlightCodeBlocks();
          return;
        }
        const selectedText = editor.selection.getContent({ format: 'text' }) || '';
        const normalizedText = selectedText.replace(/\r\n/g, '\n');
        const encodedText = editor.dom.encode(normalizedText);
        const codeInner = encodedText || '&#8203;';
        const codeHtml = `<pre class="code-block language-${lang}" data-language="${lang}"><code class="language-${lang}">${codeInner}</code></pre>`;
        editor.insertContent(codeHtml);
        highlightCodeBlocks();
      };
      editor.ui.registry.addMenuButton('codeblock', {
        text: 'block',
        icon: 'sourcecode',
        fetch: (callback) => {
          const items = codeLanguages.map((lang) => ({
            type: 'menuitem',
            text: lang.text,
            onAction: () => insertOrUpdateCodeBlock(lang.value),
          }));
          callback(items);
        },
      });
      editor.on('SetContent Change Input Undo Redo', () => {
        highlightCodeBlocks();
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
      '.note-editor-body, .mce-content-body { font-family: inherit; background-color: var(--background-color); color: var(--text-color); padding: 5px 10px 20px; line-height: 1.7; } .note-editor-body h1,.note-editor-body h2,.note-editor-body h3,.note-editor-body h4,.note-editor-body h5,.note-editor-body h6, .mce-content-body h1,.mce-content-body h2,.mce-content-body h3,.mce-content-body h4,.mce-content-body h5,.mce-content-body h6{ margin: 0.6em 0 0.4em; } .note-editor-body table, .mce-content-body table{ border-collapse: collapse; width: 100%; } .note-editor-body table td, .mce-content-body table th, .mce-content-body table td, .mce-content-body table th{ border: 1px solid #d9d9d9; padding: 6px 10px; } .note-editor-body pre.code-block, .mce-content-body pre.code-block{ background: #f6f8fa; border: 1px solid #e5e7eb; padding: 12px 14px; border-radius: 10px; overflow: auto; } .note-editor-body pre.code-block code, .mce-content-body pre.code-block code{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 13px; white-space: pre; display: block; } .note-editor-body pre.code-block[data-language]::before, .mce-content-body pre.code-block[data-language]::before{ content: attr(data-language); display: inline-block; margin-bottom: 8px; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.02em; }',
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
    min-height: 100%;
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
