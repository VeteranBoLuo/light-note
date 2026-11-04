import type { Component } from 'vue';
import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
import ImageOptimizer from './components/ImageOptimizer.vue';
import PdfWorkbench from './components/PdfWorkbench.vue';
import TableConverter from './components/TableConverter.vue';
import DatasetWorkbench from './components/DatasetWorkbench.vue';
import DocumentTextWorkbench from './components/DocumentTextWorkbench.vue';

/** 浏览器本地工具的唯一组件注册表；工作台不再为每个工具追加条件分支。 */
export const TOOLBOX_LOCAL_COMPONENTS: Partial<Record<ToolboxToolId, Component>> = Object.freeze({
  pdf_organizer: PdfWorkbench,
  image_optimizer: ImageOptimizer,
  image_to_pdf: PdfWorkbench,
  pdf_to_images: PdfWorkbench,
  table_converter: TableConverter,
  data_workbench: DatasetWorkbench,
  data_quality_report: DatasetWorkbench,
  data_cleaner: DatasetWorkbench,
  data_validator: DatasetWorkbench,
  pivot_analysis: DatasetWorkbench,
  table_diff: DatasetWorkbench,
  table_merge_split: DatasetWorkbench,
  data_anonymizer: DatasetWorkbench,
  data_chart: DatasetWorkbench,
  pdf_text_extractor: PdfWorkbench,
  docx_to_markdown: DocumentTextWorkbench,
});

export function getToolboxLocalComponent(toolId: ToolboxToolId | string) {
  return TOOLBOX_LOCAL_COMPONENTS[toolId as ToolboxToolId] || null;
}
