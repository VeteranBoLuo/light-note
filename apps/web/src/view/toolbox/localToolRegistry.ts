import type { Component } from 'vue';
import type { ToolboxToolId } from '@lightnote/shared/toolbox-protocol';
import PdfWorkbench from './components/PdfWorkbench.vue';

/** 浏览器本地工具的唯一组件注册表；工作台不再为每个工具追加条件分支。 */
export const TOOLBOX_LOCAL_COMPONENTS: Partial<Record<ToolboxToolId, Component>> = Object.freeze({
  pdf_organizer: PdfWorkbench,
  image_to_pdf: PdfWorkbench,
  pdf_to_images: PdfWorkbench,
  pdf_text_extractor: PdfWorkbench,
});

export function getToolboxLocalComponent(toolId: ToolboxToolId | string) {
  return TOOLBOX_LOCAL_COMPONENTS[toolId as ToolboxToolId] || null;
}
