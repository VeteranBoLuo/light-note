<template>
  <CommonContainer :title="$t('changelog.title')">
    <b-button class="edit_btn" v-if="user.role === 'root'" @click="editLogs">{{ $t('common.edit') }}</b-button>
    <div
      style="color: white !important; height: 100%; overflow-y: auto"
      :style="{ padding: bookmark.isMobileDevice ? '20px' : '20px 100px' }"
    >
      <a-timeline>
        <a-timeline-item color="#615ced" v-for="item in [...updateOptions]?.reverse()" :key="item.time">
          <span v-html="item.label"></span>
          <span style="font-size: 14px; color: #a0a0a0">&nbsp;{{ item.time }}</span>
          <div style="margin-bottom: -10px">
            <p v-for="(li, index) in item.list" :key="index" style="font-size: 12px">
              <template v-if="item.hideIndex">
                <span v-html="li"></span>
              </template>
              <template v-else> {{ index + 1 }}、<span v-html="li"></span></template>
            </p>
          </div>
        </a-timeline-item>
      </a-timeline>
    </div>

    <!-- JSON编辑器模态框 -->
    <b-modal
      v-model:visible="visible"
      :title="$t('changelog.editTitle')"
      width="800px"
      :maskClosable="false"
      :showFooter="false"
      @ok="handleUpdate"
      @cancel="handleCancel"
    >
      <div class="json-editor-wrapper">
        <div class="editor-header">
          <span>{{ $t('changelog.jsonEditor') }} {{ jsonContent.length }} {{ $t('changelog.charCount') }}</span>
          <div class="editor-actions">
            <a-button size="small" @click="formatJson" :disabled="!isValidJson">{{ $t('changelog.format') }}</a-button>
            <a-button size="small" @click="resetJson" style="margin-left: 8px">{{ $t('changelog.reset') }}</a-button>
            <a-button
              size="small"
              type="primary"
              class="bo"
              @click="handleUpdate"
              :loading="updating"
              :disabled="!isValidJson"
            >
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
  import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
  import { API_TEXTS } from '@/config/constants.ts';
  import { message } from 'ant-design-vue';
  import { CloseCircleOutlined } from '@ant-design/icons-vue';
  import { EditorView, basicSetup } from 'codemirror';
  import { json, jsonParseLinter } from '@codemirror/lang-json';
  import { linter } from '@codemirror/lint';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { useI18n } from 'vue-i18n';

  const { t } = useI18n();
  const bookmark = bookmarkStore();
  const user = useUserStore();
  const updateOptions = ref<any[]>([]);
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
      updateOptions.value = JSON.parse(res.data.jsonContent);
    } catch (error) {
      message.error(t('changelog.errorInfo'));
    }
  }

  // 初始化编辑器
  const initEditor = () => {
    if (!editorRef.value) return;

    // 销毁已有的编辑器
    if (editorView.value) {
      editorView.value.destroy();
    }

    // 创建新编辑器
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

    // 添加键盘快捷键
    editorView.value.dom.addEventListener('keydown', handleKeyDown);
  };

  // 键盘快捷键处理
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+S 保存
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (isValidJson.value) {
        handleUpdate();
      }
    }
    // Ctrl+F 格式化
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault();
      formatJson();
    }
    // Esc 关闭
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  // 验证JSON
  const validateJson = () => {
    try {
      if (jsonContent.value.trim()) {
        JSON.parse(jsonContent.value);
        jsonError.value = '';
        isValidJson.value = true;
      } else {
        jsonError.value = 'JSON内容不能为空';
        isValidJson.value = false;
      }
    } catch (error: any) {
      jsonError.value = error.message;
      isValidJson.value = false;
    }
  };

  // 格式化JSON
  const formatJson = () => {
    try {
      const parsed = JSON.parse(jsonContent.value);
      const formatted = JSON.stringify(parsed, null, 2);
      jsonContent.value = formatted;
      if (editorView.value) {
        editorView.value.dispatch({
          changes: {
            from: 0,
            to: editorView.value.state.doc.length,
            insert: formatted,
          },
        });
      }
    } catch (error) {
      console.error('JSON格式化失败:', error);
    }
  };

  // 重置JSON
  const resetJson = () => {
    jsonContent.value = originalContent.value;
    if (editorView.value) {
      editorView.value.dispatch({
        changes: {
          from: 0,
          to: editorView.value.state.doc.length,
          insert: originalContent.value,
        },
      });
    }
    validateJson();
  };

  // 编辑日志
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

  // 保存更新
  const handleUpdate = async () => {
    if (!isValidJson.value) {
      message.warning('请先修正JSON格式错误');
      return;
    }

    try {
      updating.value = true;
      const parsed = JSON.parse(jsonContent.value);
      const response = await updateConfig({
        jsonContent: JSON.stringify(parsed),
        name: API_TEXTS.CHANGELOG,
      });

      if (response.status === 200) {
        message.success('更新成功');
        visible.value = false;
        await getLogs();
      }
    } catch (error) {
      console.error('更新失败:', error);
      message.error('更新失败，请稍后重试');
    } finally {
      updating.value = false;
    }
  };

  // 格式化按钮处理
  const handleFormat = () => {
    formatJson();
  };

  // 取消编辑
  const handleCancel = () => {
    if (jsonContent.value !== originalContent.value) {
      const confirmCancel = window.confirm('您有未保存的更改，确定要取消吗？');
      if (!confirmCancel) return;
    }
    visible.value = false;
    jsonError.value = '';
  };

  // 监听模态框显示状态
  watch(visible, (newVal) => {
    if (!newVal && editorView.value) {
      editorView.value.dom.removeEventListener('keydown', handleKeyDown);
      editorView.value.destroy();
      editorView.value = undefined;
    }
  });

  onMounted(() => {
    getLogs();
  });

  onUnmounted(() => {
    if (editorView.value) {
      editorView.value.dom.removeEventListener('keydown', handleKeyDown);
      editorView.value.destroy();
    }
  });
</script>

<style lang="less" scoped>
  :deep(.ant-timeline .ant-timeline-item-tail) {
    background-color: var(--timeline-line-bg-color);
  }

  ::-webkit-scrollbar {
    width: 10px;
  }

  .edit_btn {
    position: absolute;
    right: 20px;
    z-index: 1;
  }

  .json-editor-wrapper {
    display: flex;
    flex-direction: column;
    height: 600px;
    width: 1200px;
    border: 1px solid #434343;
    border-radius: 6px;
    overflow: hidden;
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
</style>
