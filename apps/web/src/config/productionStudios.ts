import type { ProductionProjectType } from '@lightnote/shared/production-project-protocol';
import icon from '@/config/icon';

export type ProductionStudioId = 'document' | 'presentation' | 'workbook';

export type ProductionStudioDefinition = Readonly<{
  id: ProductionStudioId;
  projectType: ProductionProjectType;
  listRouteName: string;
  projectRouteName: string;
  icon: string;
  accent: 'violet' | 'blue' | 'teal';
  entry: 'primary' | 'legacy';
}>;

/**
 * 生产工作室是长期作品入口，不属于一次性 Tool Catalog。
 *
 * 这里只维护稳定的类型、路由与视觉语义；名称、说明和能力文案由 i18n 负责，
 * 项目内容与版本协议由 @lightnote/shared/production-project-protocol 负责。
 */
export const PRODUCTION_STUDIOS = Object.freeze([
  Object.freeze({
    id: 'document',
    projectType: 'document',
    listRouteName: 'toolboxDocumentProjects',
    projectRouteName: 'toolboxDocumentProject',
    icon: icon.toolbox.documentStudio,
    accent: 'violet',
    entry: 'legacy',
  }),
  Object.freeze({
    id: 'presentation',
    projectType: 'presentation',
    listRouteName: 'toolboxPresentationProjects',
    projectRouteName: 'toolboxPresentationProject',
    icon: icon.toolbox.presentationStudio,
    accent: 'blue',
    entry: 'primary',
  }),
  Object.freeze({
    id: 'workbook',
    projectType: 'workbook',
    listRouteName: 'toolboxWorkbookProjects',
    projectRouteName: 'toolboxWorkbookProject',
    icon: icon.toolbox.workbookStudio,
    accent: 'teal',
    entry: 'primary',
  }),
] as const satisfies readonly ProductionStudioDefinition[]);

/**
 * 首页只公开笔记库无法承载的结构化作品入口。
 * 文档项目仍保留在完整映射中，以兼容已经创建的项目和历史深链。
 */
export const PRIMARY_PRODUCTION_STUDIOS = Object.freeze(
  PRODUCTION_STUDIOS.filter((studio) => studio.entry === 'primary'),
);

const studioByProjectType = new Map<ProductionProjectType, ProductionStudioDefinition>(
  PRODUCTION_STUDIOS.map((studio) => [studio.projectType, studio]),
);

export function productionStudioForProjectType(projectType: ProductionProjectType) {
  return studioByProjectType.get(projectType) || PRODUCTION_STUDIOS[0];
}
