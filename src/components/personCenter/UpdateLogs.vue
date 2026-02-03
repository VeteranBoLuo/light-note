<template>
  <CommonContainer :title="$t('changelog.title')">
    <b-button type="primary" size="small" v-if="user.role === 'root'" @click="editLogs" class="edit-btn">
      {{ $t('common.edit') }}
    </b-button>

    <div class="logs-container">
      <div class="logs-intro">
        <h2 class="intro-title">{{ ($t('changelog.pageTitle'), '更新日志') }}</h2>
        <p class="intro-desc">{{ ($t('changelog.pageDesc'), '查看系统的版本更新历史与功能改进详情。') }}</p>
      </div>

      <div class="timeline-wrapper">
        <a-timeline>
          <a-timeline-item color="#615ced" v-for="(item, index) in displayLogs" :key="item.time || index">
            <!-- 自定义时间轴点 -->
            <template #dot>
              <div class="timeline-dot">
                <div class="dot-inner"></div>
              </div>
            </template>

            <div class="log-card">
              <div class="log-header" :class="{ 'no-border': !item.list || item.list.length === 0 }">
                <div class="version-tag">
                  <span class="v-num" v-html="item.label"></span>
                </div>
                <span class="log-date">{{ item.time }}</span>
              </div>

              <div class="log-content" v-if="item.list && item.list.length > 0">
                <div v-for="(li, i) in item.list" :key="i" class="log-item">
                  <span class="item-index" v-if="!item.hideIndex">{{ (i as number) + 1 }}.</span>
                  <span class="item-text" v-html="li"></span>
                </div>
              </div>
            </div>
          </a-timeline-item>
        </a-timeline>
      </div>
    </div>

    <!-- JSON编辑器模态框 (保持原有逻辑) -->
    <b-modal
      v-model:visible="visible"
      :title="$t('changelog.editTitle')"
      top="45%"
      :maskClosable="false"
      :showFooter="false"
      @ok="handleUpdate"
      @cancel="visible = false"
    >
      <div class="json-editor-wrapper">
        <div class="editor-header">
          <span>{{ $t('changelog.charCount', { count: jsonContent.length }) }}</span>
          <div class="editor-actions">
            <a-button size="small" @click="formatJson">{{ $t('changelog.format') }}</a-button>
            <a-button size="small" @click="resetJson" style="margin-left: 8px">{{ $t('changelog.reset') }}</a-button>
            <a-button size="small" type="primary" class="bo" @click="handleUpdate" :loading="updating">
              {{ $t('common.save') }}
            </a-button>
          </div>
        </div>
        <div ref="editorRef" class="code-editor"></div>
        <div v-if="jsonError" class="error-message">
          <CloseCircleOutlined style="color: #ff4d4f; margin-right: 4px" />
          {{ jsonError }}
        </div>
        <div class="editor-footer">
          <span>{{ $t('changelog.shortcuts') }}</span>
        </div>
      </div>
    </b-modal>
  </CommonContainer>
</template>

<script lang="ts" setup>
  import CommonContainer from '@/components/base/BasicComponents/CommonContainer.vue';
  import { bookmarkStore, useUserStore } from '@/store';
  import { getJsonInfo, updateConfig } from '@/config/jsonCfg.ts';
  import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue';
  import { API_TEXTS } from '@/config/constants.ts';
  import { message } from 'ant-design-vue';
  import { CloseCircleOutlined } from '@ant-design/icons-vue';
  import { EditorView, basicSetup } from 'codemirror';
  import { json, jsonParseLinter } from '@codemirror/lang-json';
  import { linter } from '@codemirror/lint';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { useI18n } from 'vue-i18n';
  import BButton from '@/components/base/BasicComponents/BButton.vue';

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const updateOptions = ref<any[]>([]);

  // 显示列表计算属性，确保反转逻辑
  const displayLogs = computed(() => {
    return [...updateOptions.value].reverse();
  });

  const visible = ref(false);
  const jsonContent = ref('');
  const editorRef = ref<HTMLElement>();
  const editorView = ref<EditorView>();
  const jsonError = ref('');
  const isValidJson = ref(true);
  const updating = ref(false);
  const originalContent = ref('');

  // 获取更新日志
  async function getLogs() {
    try {
      const res = await getJsonInfo(API_TEXTS.CHANGELOG);
      // 兼容可能返回的字符串或对象
      const content =
        typeof res.data.jsonContent === 'string' ? JSON.parse(res.data.jsonContent) : res.data.jsonContent;
      updateOptions.value = content || [];
    } catch (error) {
      console.error(error);
      message.error(t('changelog.errorInfo'));
    }
  }

  // 初始化编辑器 (保持逻辑不变)
  const initEditor = () => {
    if (!editorRef.value) return;
    if (editorView.value) editorView.value.destroy();

    editorView.value = new EditorView({
      doc: jsonContent.value,
      extensions: [
        basicSetup,
        json(),
        linter(jsonParseLinter()),
        oneDark,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            jsonContent.value = editorView.value?.state.doc.toString() || '';
            validateJson();
          }
        }),
        EditorView.lineWrapping,
      ],
      parent: editorRef.value,
    });

    // 监听键盘事件
    editorView.value.dom.addEventListener('keydown', handleKeyDown);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (isValidJson.value) handleUpdate();
    }
    // ... 其他快捷键逻辑保持
  };

  const validateJson = () => {
    try {
      if (jsonContent.value.trim()) {
        JSON.parse(jsonContent.value);
        jsonError.value = '';
        isValidJson.value = true;
      } else {
        jsonError.value = 'Empty JSON';
        isValidJson.value = false;
      }
    } catch (error: any) {
      jsonError.value = error.message;
      isValidJson.value = false;
    }
  };

  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonContent.value);
      const formatted = JSON.stringify(parsed, null, 2);
      jsonContent.value = formatted;
      if (editorView.value) {
        editorView.value.dispatch({
          changes: { from: 0, to: editorView.value.state.doc.length, insert: formatted },
        });
      }
    } catch (e) {}
  };

  const resetJson = () => {
    jsonContent.value = originalContent.value;
    if (editorView.value) {
      editorView.value.dispatch({
        changes: { from: 0, to: editorView.value.state.doc.length, insert: originalContent.value },
      });
    }
    validateJson();
  };

  const editLogs = () => {
    visible.value = true;
    const content = JSON.stringify(updateOptions.value, null, 2);
    jsonContent.value = content;
    originalContent.value = content;

    nextTick(() => {
      initEditor();
      validateJson();
    });
  };

  const handleUpdate = async () => {
    if (!isValidJson.value) return;
    try {
      updating.value = true;
      const parsed = JSON.parse(jsonContent.value);
      // 同时更新当前视图
      updateOptions.value = parsed;

      const response = await updateConfig({
        jsonContent: JSON.stringify(parsed),
        name: API_TEXTS.CHANGELOG,
      });

      if (response.status === 200) {
        message.success('更新成功');
        visible.value = false;
      } else {
        // 如果后端失败，回滚
        getLogs();
      }
    } catch (error) {
      message.error('保存失败');
    } finally {
      updating.value = false;
    }
  };

  watch(visible, (newVal) => {
    if (!newVal && editorView.value) {
      editorView.value.destroy();
      editorView.value = undefined;
    }
  });

  onMounted(() => {
    getLogs();
  });

  onUnmounted(() => {
    if (editorView.value) editorView.value.destroy();
  });
</script>

<style lang="less" scoped>
  .logs-container {
    height: 100%;
    overflow-y: auto;
    padding: 24px 16px;

    // 滚动条样式
    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background-color: rgba(100, 100, 100, 0.2);
      border-radius: 3px;
    }

    @media (min-width: 768px) {
      padding: 32px 10%;
    }
    @media (min-width: 1200px) {
      padding: 32px 15%;
    }
  }

  .logs-intro {
    text-align: center;
    margin-bottom: 40px;
    animation: fadeIn 0.6s ease;

    .intro-title {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 8px;
      background: linear-gradient(135deg, #615ced 0%, #3d37c9 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .intro-desc {
      font-size: 14px;
      color: var(--text-secondary-color);
      opacity: 0.8;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .timeline-wrapper {
    max-width: 900px;
    margin: 0 auto;
  }

  // Timeline customization
  :deep(.ant-timeline-item) {
    padding-bottom: 30px;

    &-tail {
      border-left: 2px solid var(--menu-item-h-bg-color); // Subtler line
      left: 6px; // Adjust for custom dot
    }

    &-head {
      background: transparent;
      padding: 0;
    }

    &-content {
      margin-left: 32px;
      top: -6px;
    }
  }

  .timeline-dot {
    width: 14px;
    height: 14px;
    background: var(--background-color); // Match parent bg to look like ring
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;

    .dot-inner {
      width: 10px;
      height: 10px;
      background: #615ced;
      border-radius: 50%;
      box-shadow: 0 0 0 2px rgba(97, 92, 237, 0.3);
    }
  }

  .log-card {
    background: var(--menu-item-h-bg-color); // Consistent card bg
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.05);
    transition:
      transform 0.2s,
      box-shadow 0.2s;

    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
    }
  }

  .log-header {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px dashed rgba(150, 150, 150, 0.2);

    &.no-border {
      margin-bottom: 0;
      padding-bottom: 0;
      border-bottom: none;
    }
  }

  .version-tag {
    display: flex;
    align-items: center;
    background: linear-gradient(135deg, #615ced 0%, #3d37c9 100%);
    color: #fff;
    padding: 4px 12px;
    border-radius: 20px;
    font-weight: 700;
    box-shadow: 0 2px 6px rgba(97, 92, 237, 0.25);

    .v-num {
      font-size: 15px;
    }
  }

  .log-date {
    color: var(--text-secondary-color);
    font-size: 13px;
  }

  .log-content {
    color: var(--text-color);
    font-size: 14px;
    line-height: 1.6;
  }

  .log-item {
    display: flex;
    align-items: flex-start;
    margin-bottom: 8px;

    &:last-child {
      margin-bottom: 0;
    }

    .item-index {
      color: #615ced;
      font-weight: 600;
      margin-right: 8px;
      flex-shrink: 0;
      font-feature-settings: 'tnum'; // Monospace numbers
    }

    .item-text {
      opacity: 0.9;
    }
  }

  [data-theme='day'] {
    .log-card {
      background-color: #f7f8fa;
      border: 1px solid #ebedf0;
    }
  }

  // Editor styles (Optimized)
  .json-editor-wrapper {
    display: flex;
    flex-direction: column;
    height: 600px;

    border: 1px solid #434343;
    border-radius: 6px;
    overflow: hidden;
    @media (min-width: 764px) {
      width: 1200px;
    }
  }

  .editor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background-color: #1a1a1a;
    border-bottom: 1px solid #434343;
    font-size: 12px;
    color: #8c8c8c;
  }

  .editor-actions {
    display: flex;
    gap: 8px;
  }

  .code-editor {
    flex: 1;
    overflow: hidden;

    :deep(.cm-editor) {
      height: 100%;

      .cm-scroller {
        overflow: auto;
        font-family: 'JetBrains Mono', 'Fira Code', Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
        font-size: 13px;
        line-height: 1.5;
      }

      .cm-gutters {
        background-color: #1a1a1a;
        border-right: 1px solid #434343;
        color: #8c8c8c;
      }
    }
  }

  .error-message {
    padding: 8px 12px;
    background-color: rgba(255, 77, 79, 0.1);
    border-top: 1px solid #434343;
    color: #ff4d4f;
    font-size: 12px;
    display: flex;
    align-items: center;
  }

  .editor-footer {
    padding: 4px 12px;
    background-color: #1a1a1a;
    border-top: 1px solid #434343;
    color: #8c8c8c;
    font-size: 11px;
  }

  .edit-btn {
    position: absolute;
    top: 5px;
    right: 20px;
    z-index: 10;
  }
</style>
