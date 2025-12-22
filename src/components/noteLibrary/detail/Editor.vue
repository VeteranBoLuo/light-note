<template>
  <div id="editor-container" style="display: flex; flex-direction: column; height: calc(100% - 60px)">
    <div style="border-bottom: 1px solid #ccc">
      <Toolbar :editor="editorRef" :defaultConfig="toolbarConfig" :style="{ display: readonly ? 'none' : 'flex' }" />
    </div>
    <Editor v-model="content" :defaultConfig="editorConfig" @onCreated="handleCreated" style="overflow: auto" />
  </div>
</template>

<script setup lang="ts">
  import { shallowRef, onMounted, onBeforeUnmount, watchEffect, nextTick } from 'vue';
  import { Editor, Toolbar } from '@wangeditor/editor-for-vue';
  import '@wangeditor/editor/dist/css/style.css';
  import { apiBasePost } from '@/http/request.ts';
  import { IToolbarConfig } from '@wangeditor/editor';

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
  // 编辑器实例，必须用 shallowRef
  const editorRef = shallowRef<Editor | null>(null);

  // 内容 HTML
  const content = defineModel('content');

  const editorConfig: Record<string, any> = {
    autoFocus: false,
    readOnly: props.readonly,
    MENU_CONF: {
      uploadImage: {
        maxFileSize: 200 * 1024 * 1024, // 200MB（需与后端同步）
        customUpload(file, insertFn) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('noteId', props.noteId);
          apiBasePost('/api/note/uploadImage', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          })
            .then((res) => {
              if (res.data.noteId) {
                emits('setNoteId', res.data.noteId);
              }
              insertFn(res.data.url);
            })
            .catch();
        },
      },
    },
    placeholder: '请输入内容...',
    hoverbarKeys: {
      table: {
        menuKeys: [
          'enter',
          'tableHeader',
          'tableFullWidth',
          'insertRowAbove',
          'insertRowBelow',
          'deleteTableRow',
          'insertColumnLeft',
          'insertColumnRight',
          'deleteTableCol',
          'deleteTable',
        ],
      },
    },
  };
  const emits = defineEmits(['update:modelValue', 'setHtml', 'setNoteId', 'saveData']);
  onMounted(() => {});

  // 动态同步配置
  watchEffect(() => {
    if (editorRef.value) {
      props.readonly ? editorRef.value.disable() : editorRef.value.enable();
    }
  });

  const toolbarConfig: Partial<IToolbarConfig> = {
    toolbarKeys: [
      'headerSelect',
      'blockquote',
      '|',
      'bold',
      'underline',
      'italic',
      'color',
      'bgColor',
      'clearStyle',
      '|',
      'fontSize',
      'fontFamily',
      'lineHeight',
      '|',
      'bulletedList',
      'numberedList',
      'todo',
      {
        key: 'group-justify',
        title: '对齐',
        iconSvg:
          '<svg viewBox="0 0 1024 1024"><path d="M768 793.6v102.4H51.2v-102.4h716.8z m204.8-230.4v102.4H51.2v-102.4h921.6z m-204.8-230.4v102.4H51.2v-102.4h716.8zM972.8 102.4v102.4H51.2V102.4h921.6z"></path></svg>',
        menuKeys: ['justifyLeft', 'justifyRight', 'justifyCenter', 'justifyJustify'],
      },
      {
        key: 'group-indent',
        title: '缩进',
        iconSvg:
          '<svg viewBox="0 0 1024 1024"><path d="M0 64h1024v128H0z m384 192h640v128H384z m0 192h640v128H384z m0 192h640v128H384zM0 832h1024v128H0z m0-128V320l256 192z"></path></svg>',
        menuKeys: ['indent', 'delIndent'],
      },
      '|',
      'emotion',
      'insertLink',
      {
        key: 'group-image',
        title: '图片',
        iconSvg:
          '<svg viewBox="0 0 1024 1024"><path d="M959.877 128l0.123 0.123v767.775l-0.123 0.122H64.102l-0.122-0.122V128.123l0.122-0.123h895.775zM960 64H64C28.795 64 0 92.795 0 128v768c0 35.205 28.795 64 64 64h896c35.205 0 64-28.795 64-64V128c0-35.205-28.795-64-64-64zM832 288.01c0 53.023-42.988 96.01-96.01 96.01s-96.01-42.987-96.01-96.01S682.967 192 735.99 192 832 234.988 832 288.01zM896 832H128V704l224.01-384 256 320h64l224.01-192z"></path></svg>',
        menuKeys: ['insertImage', 'uploadImage'],
      },
      'insertTable',
      'codeBlock',
      'divider',
      '|',
      'undo',
      'redo',
    ],
  };

  // 组件销毁时，也及时销毁编辑器
  onBeforeUnmount(() => {
    const editor = editorRef.value;
    if (editor == null) return;
    editor.destroy();
  });

  const handleCreated = (editor: any) => {
    editorRef.value = editor; // 记录 editor 实例，重要！
  };
</script>

<style lang="less">
  /* 编辑区域背景 */
  #editor-container {
    // 编辑区域背景颜色
    .w-e-text-container {
      background-color: var(--background-color) !important; /* 深色背景示例 */
      color: var(--text-color);
    }
    // 工具栏背景
    .w-e-toolbar {
      background-color: var(--w-e-toolbar-bg-color) !important;
      border-color: #3c3c3c;
    }
    // 工具栏图标颜色
    .w-e-bar svg {
      fill: var(--w-e-toolbar-color) !important;
    }
    .w-e-bar-item {
      padding: 2px;
    }
    // 工具栏禁用图标颜色
    .w-e-bar-item .disabled svg {
      fill: #999 !important;
    }
    // 工具栏激活状态背景颜色
    .w-e-bar-item .active {
      background: var(--w-e-toolbar-active-bg-color);
    }
    .w-e-select-list {
      background-color: var(--w-e-select-list);
      color: var(--w-e-select-list-color);
    }
  }
  .w-e-text-container [data-slate-editor] {
    background-color: var(--background-color) !important;
    color: var(--text-color);
    padding: 5px 10px 20px 10px !important;
  }
  .w-e-text-container [data-slate-editor] pre > code {
    text-shadow: unset !important;
  }
</style>
