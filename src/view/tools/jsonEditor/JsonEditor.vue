<template>
  <div class="json-editor-page">
    <section class="hero-card">
      <div class="hero-left">
        <h2>JSON 编辑器</h2>
        <p>面向对象/数组的可视化编辑面板，左侧写代码，右侧快速折叠展开结构。右键结构树节点可进行更多操作。</p>
      </div>
      <div class="hero-actions">
        <b-button size="small" @click="loadSample">加载示例</b-button>
        <b-button size="small" @click="compressJson">压缩</b-button>
        <b-button size="small" @click="formatJson">格式化</b-button>
        <b-button size="small" @click="expandAll">全部展开</b-button>
        <b-button size="small" @click="collapseAll">全部折叠</b-button>
      </div>
    </section>

    <section class="workbench">
      <article class="editor-panel">
        <div class="panel-title">
          <span>代码编辑区</span>
          <small>Ctrl+S 可快速校验</small>
        </div>
        <div ref="editorRef" class="code-editor"></div>
        <div class="panel-foot" :class="{ error: jsonError }">
          <span>{{ statusText }}</span>
          <span>字符数：{{ jsonContent.length }}</span>
        </div>
      </article>

      <article class="tree-panel">
        <div class="panel-title">
          <span>结构树</span>
          <small>{{ treeSummary }}</small>
        </div>
        <div class="tree-scroll">
          <div v-if="jsonError" class="tree-placeholder">JSON 无法解析，右侧树结构暂停渲染。</div>
          <div v-else-if="!treeRoot" class="tree-placeholder">请输入 JSON 内容。</div>
          <JsonTreeNode
            v-else
            :node="treeRoot"
            :level="0"
            :collapsed-map="collapsedMap"
            @toggle="toggleNode"
            @remove="removeNode"
          />
        </div>
      </article>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
  import { message } from 'ant-design-vue';
  import { EditorView, basicSetup } from 'codemirror';
  import { json, jsonParseLinter } from '@codemirror/lang-json';
  import { linter } from '@codemirror/lint';
  import { oneDark } from '@codemirror/theme-one-dark';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import JsonTreeNode from './JsonTreeNode.vue';

  type NodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

  type JsonTreeNodeData = {
    keyLabel: string;
    path: string;
    type: NodeType;
    preview: string;
    value?: unknown;
    children?: JsonTreeNodeData[];
  };

  const SAMPLE_JSON = {
    release: 'v2.9.0',
    date: '2026-03-10',
    highlights: ['新增 JSON 可视化编辑器', '优化后台管理交互', '提升错误提示可读性'],
    modules: [
      {
        name: 'bookmark',
        enabled: true,
        settings: {
          sync: 'realtime',
          backupDays: 30,
        },
      },
      {
        name: 'noteLibrary',
        enabled: true,
        settings: {
          preview: true,
          maxLength: 5000,
        },
      },
    ],
  };

  const editorRef = ref<HTMLElement>();
  const editorView = ref<EditorView>();
  const jsonContent = ref('');
  const jsonError = ref('');
  const treeRoot = ref<JsonTreeNodeData | null>(null);
  const collapsedMap = ref<Record<string, boolean>>({});
  const nodeCount = ref(0);

  const statusText = computed(() => (jsonError.value ? `错误：${jsonError.value}` : 'JSON 有效，可保存或继续编辑'));
  const treeSummary = computed(() => `${nodeCount.value} 个节点`);

  const parseNodePath = (path: string): Array<string | number> => {
    const normalizedPath = path.replace(/^root/, '');
    const tokens: Array<string | number> = [];
    const pathRegex = /\.([^.[\]]+)|\[(\d+)\]/g;
    let match: RegExpExecArray | null;

    while ((match = pathRegex.exec(normalizedPath)) !== null) {
      if (match[1] !== undefined) {
        tokens.push(match[1]);
        continue;
      }

      if (match[2] !== undefined) {
        tokens.push(Number(match[2]));
      }
    }

    return tokens;
  };

  const updateEditorDoc = (nextValue: string) => {
    if (!editorView.value) return;
    editorView.value.dispatch({
      changes: {
        from: 0,
        to: editorView.value.state.doc.length,
        insert: nextValue,
      },
    });
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonContent.value);
      const formatted = JSON.stringify(parsed, null, 2);
      jsonContent.value = formatted;
      updateEditorDoc(formatted);
      syncTree();
      message.success('JSON 已格式化');
    } catch {
      message.error('当前 JSON 无法格式化');
    }
  };

  const compressJson = () => {
    try {
      const parsed = JSON.parse(jsonContent.value);
      const compact = JSON.stringify(parsed);
      jsonContent.value = compact;
      updateEditorDoc(compact);
      syncTree();
      message.success('JSON 已压缩');
    } catch {
      message.error('当前 JSON 无法压缩');
    }
  };

  const loadSample = () => {
    const sample = JSON.stringify(SAMPLE_JSON, null, 2);
    jsonContent.value = sample;
    updateEditorDoc(sample);
    syncTree();
    collapseAll();
  };

  const buildPreview = (value: unknown): { type: NodeType; preview: string } => {
    if (value === null) return { type: 'null', preview: 'null' };
    if (Array.isArray(value)) return { type: 'array', preview: `Array(${value.length})` };
    switch (typeof value) {
      case 'string':
        return { type: 'string', preview: `"${value}"` };
      case 'number':
        return { type: 'number', preview: `${value}` };
      case 'boolean':
        return { type: 'boolean', preview: String(value) };
      case 'object':
        return { type: 'object', preview: `Object(${Object.keys(value as object).length})` };
      default:
        return { type: 'null', preview: 'unknown' };
    }
  };

  const buildTree = (value: unknown, keyLabel: string, path: string): JsonTreeNodeData => {
    const { type, preview } = buildPreview(value);
    const node: JsonTreeNodeData = {
      keyLabel,
      path,
      type,
      preview,
      value,
      children: [],
    };

    if (type === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      node.children = entries.map(([key, child]) => buildTree(child, key, `${path}.${key}`));
    }

    if (type === 'array') {
      const arrayValue = value as unknown[];
      node.children = arrayValue.map((child, index) => buildTree(child, `[${index}]`, `${path}[${index}]`));
    }

    if (type !== 'object' && type !== 'array') {
      delete node.children;
    }

    return node;
  };

  const countNodes = (node: JsonTreeNodeData | null): number => {
    if (!node) return 0;
    if (!node.children || node.children.length === 0) return 1;
    return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
  };

  const syncCollapsedMapWithTree = () => {
    const allBranchPaths = new Set(collectBranchPaths(treeRoot.value));
    const nextCollapsedMap: Record<string, boolean> = {};

    Object.entries(collapsedMap.value).forEach(([path, isCollapsed]) => {
      if (allBranchPaths.has(path)) {
        nextCollapsedMap[path] = isCollapsed;
      }
    });

    collapsedMap.value = nextCollapsedMap;
  };

  const syncTree = () => {
    if (!jsonContent.value.trim()) {
      jsonError.value = '';
      treeRoot.value = null;
      nodeCount.value = 0;
      return;
    }

    try {
      const parsed = JSON.parse(jsonContent.value);
      jsonError.value = '';
      treeRoot.value = buildTree(parsed, 'root', 'root');
      nodeCount.value = countNodes(treeRoot.value);
      syncCollapsedMapWithTree();
    } catch (error: any) {
      jsonError.value = error?.message || 'JSON 解析失败';
      treeRoot.value = null;
      nodeCount.value = 0;
    }
  };

  const collectBranchPaths = (node: JsonTreeNodeData | null): string[] => {
    if (!node) return [];
    const isBranch = node.type === 'object' || node.type === 'array';
    const childPaths = node.children ? node.children.flatMap((child) => collectBranchPaths(child)) : [];
    return isBranch ? [node.path, ...childPaths] : childPaths;
  };

  const collapseAll = () => {
    const nextMap: Record<string, boolean> = {};
    collectBranchPaths(treeRoot.value).forEach((path) => {
      nextMap[path] = true;
    });
    nextMap.root = false;
    collapsedMap.value = nextMap;
  };

  const expandAll = () => {
    collapsedMap.value = {};
  };

  const toggleNode = (path: string) => {
    collapsedMap.value[path] = !collapsedMap.value[path];
  };

  const deleteNodeByPath = (rootData: unknown, path: string): boolean => {
    const pathTokens = parseNodePath(path);
    if (pathTokens.length === 0) return false;

    let parent: any = rootData;
    for (let i = 0; i < pathTokens.length - 1; i++) {
      const token = pathTokens[i];
      parent = parent?.[token as any];
      if (parent === undefined || parent === null) return false;
    }

    const lastToken = pathTokens[pathTokens.length - 1];
    if (Array.isArray(parent) && typeof lastToken === 'number') {
      if (lastToken < 0 || lastToken >= parent.length) return false;
      parent.splice(lastToken, 1);
      return true;
    }

    if (parent && typeof parent === 'object' && typeof lastToken === 'string') {
      if (!(lastToken in parent)) return false;
      delete parent[lastToken];
      return true;
    }

    return false;
  };

  const removeNode = (path: string) => {
    if (path === 'root') {
      jsonContent.value = '';
      updateEditorDoc('');
      syncTree();
      collapsedMap.value = {};
      message.success('根节点已删除，内容已清空');
      return;
    }

    try {
      const parsed = JSON.parse(jsonContent.value);
      const deleted = deleteNodeByPath(parsed, path);
      if (!deleted) {
        message.error('删除失败，节点路径无效');
        return;
      }

      const nextJson = JSON.stringify(parsed, null, 2);
      jsonContent.value = nextJson;
      updateEditorDoc(nextJson);
      syncTree();
      message.success('节点已删除');
    } catch {
      message.error('当前 JSON 无法解析，删除失败');
    }
  };

  const initEditor = () => {
    if (!editorRef.value) return;
    if (editorView.value) {
      editorView.value.destroy();
    }

    editorView.value = new EditorView({
      doc: jsonContent.value,
      extensions: [
        basicSetup,
        json(),
        linter(jsonParseLinter()),
        oneDark,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            jsonContent.value = update.state.doc.toString();
            syncTree();
          }
        }),
      ],
      parent: editorRef.value,
    });

    editorView.value.dom.addEventListener('keydown', handleKeyDown);
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      syncTree();
      if (jsonError.value) {
        message.error('JSON 校验失败');
      } else {
        message.success('JSON 校验通过');
      }
    }
  };

  onMounted(async () => {
    jsonContent.value = JSON.stringify(SAMPLE_JSON, null, 2);
    await nextTick();
    initEditor();
    syncTree();
    collapseAll();
  });

  onUnmounted(() => {
    if (!editorView.value) return;
    editorView.value.dom.removeEventListener('keydown', handleKeyDown);
    editorView.value.destroy();
    editorView.value = undefined;
  });
</script>

<style scoped lang="less">
  .json-editor-page {
    display: flex;
    flex-direction: column;
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
        letter-spacing: 0.3px;
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
    display: grid;
    grid-template-columns: 2fr 3fr;
    gap: 14px;
    min-height: 0;
    flex: 1;
  }

  .editor-panel,
  .tree-panel {
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--menu-item-h-bg-color) 84%, transparent);
    background: color-mix(in srgb, var(--menu-item-h-bg-color) 65%, transparent);
    height: 700px;
  }

  .panel-title {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--menu-item-h-bg-color) 84%, transparent);
    background: color-mix(in srgb, var(--menu-item-h-bg-color) 78%, transparent);

    span {
      font-size: 14px;
      font-weight: 600;
    }

    small {
      color: var(--text-secondary-color);
      font-size: 12px;
    }
  }

  .code-editor {
    flex: 1;
    min-height: 420px;
    overflow: hidden;

    :deep(.cm-editor) {
      height: 100%;

      .cm-scroller {
        font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
      }
    }
  }

  .panel-foot {
    padding: 8px 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    border-top: 1px solid color-mix(in srgb, var(--menu-item-h-bg-color) 84%, transparent);
    color: var(--text-secondary-color);

    &.error {
      color: #dc2626;
    }
  }

  .tree-scroll {
    overflow: auto;
    flex: 1;
    min-height: 420px;
    padding: 8px 8px 12px;
  }

  .tree-placeholder {
    height: 100%;
    min-height: 240px;
    display: grid;
    place-items: center;
    color: var(--text-secondary-color);
    font-size: 13px;
  }

  @media (max-width: 1120px) {
    .workbench {
      grid-template-columns: 1fr;
    }

    .code-editor,
    .tree-scroll {
      min-height: 320px;
    }
  }
</style>
