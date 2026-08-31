import { defineAsyncComponent, type Component } from 'vue';
import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
import ImageOptimizer from './components/ImageOptimizer.vue';
import MarkdownConverter from './components/MarkdownConverter.vue';
import MermaidEditor from './components/MermaidEditor.vue';
import PdfWorkbench from './components/PdfWorkbench.vue';
import TableConverter from './components/TableConverter.vue';
import TextDiff from './components/TextDiff.vue';
import DatasetWorkbench from './components/DatasetWorkbench.vue';
import KnowledgeTextWorkbench from './components/KnowledgeTextWorkbench.vue';
import DocumentTextWorkbench from './components/DocumentTextWorkbench.vue';
import CodeSnapshotWorkbench from './components/CodeSnapshotWorkbench.vue';

/** 浏览器本地工具的唯一组件注册表；工作台不再为每个工具追加条件分支。 */
export const TOOLBOX_LOCAL_COMPONENTS: Partial<Record<ToolboxToolId, Component>> = Object.freeze({
  pdf_organizer: PdfWorkbench,
  image_optimizer: ImageOptimizer,
  image_to_pdf: PdfWorkbench,
  pdf_to_images: PdfWorkbench,
  markdown_converter: MarkdownConverter,
  text_diff: TextDiff,
  table_converter: TableConverter,
  mermaid_editor: MermaidEditor,
  data_workbench: DatasetWorkbench,
  data_quality_report: DatasetWorkbench,
  data_cleaner: DatasetWorkbench,
  data_validator: DatasetWorkbench,
  pivot_analysis: DatasetWorkbench,
  table_diff: DatasetWorkbench,
  table_merge_split: DatasetWorkbench,
  data_anonymizer: DatasetWorkbench,
  data_chart: DatasetWorkbench,
  text_batch: KnowledgeTextWorkbench,
  regex_extractor: KnowledgeTextWorkbench,
  markdown_checker: KnowledgeTextWorkbench,
  frontmatter_batch: KnowledgeTextWorkbench,
  citation_converter: KnowledgeTextWorkbench,
  structured_data_lab: KnowledgeTextWorkbench,
  pdf_text_extractor: PdfWorkbench,
  docx_to_markdown: DocumentTextWorkbench,
  code_snapshot: CodeSnapshotWorkbench,
  browser_sql: defineAsyncComponent(() => import('./components/BrowserSqlWorkbench.vue')),
});

export function getToolboxLocalComponent(toolId: ToolboxToolId | string) {
  return TOOLBOX_LOCAL_COMPONENTS[toolId as ToolboxToolId] || null;
}
