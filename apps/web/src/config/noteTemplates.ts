import { BUILTIN_NOTE_BODIES } from '@lightnote/shared/note-templates';

/**
 * 内置笔记模板（前端常量，不进数据库）。
 *
 * - 名称/描述是短文案，走 i18n key（picker 里 t() 渲染）
 * - 标题模板与正文含 {{date}} 等占位变量，vue-i18n 会把花括号当插值语法解析报错，
 *   因此按 locale 字典放在这里，不进语言文件；非中文一律回落 en-US
 * - 实例化时经 utils/noteTemplate.ts 的 renderNoteTemplate 替换变量
 */

export type NoteTemplateLocale = 'zh-CN' | 'en-US';

export interface BuiltinNoteTemplate {
  key: string;
  nameKey: string;
  descKey: string;
  type: 'html' | 'markdown';
  /** 新笔记标题模板，可含占位变量 */
  titleTemplate: Record<NoteTemplateLocale, string>;
  content: Record<NoteTemplateLocale, string>;
  /** 只用于预览；创建笔记始终使用 content。 */
  exampleContent: Record<NoteTemplateLocale, string>;
}

export function pickTemplateLocale(locale: string): NoteTemplateLocale {
  return locale === 'zh-CN' ? 'zh-CN' : 'en-US';
}

export const BUILTIN_NOTE_TEMPLATES: BuiltinNoteTemplate[] = [
  {
    key: 'daily',
    nameKey: 'note.tplDailyName',
    descKey: 'note.tplDailyDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '日报 {{date}}', 'en-US': 'Daily Report {{date}}' },
    ...BUILTIN_NOTE_BODIES.daily,
  },
  {
    key: 'weekly',
    nameKey: 'note.tplWeeklyName',
    descKey: 'note.tplWeeklyDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '周报 {{date}}', 'en-US': 'Weekly Report {{date}}' },
    ...BUILTIN_NOTE_BODIES.weekly,
  },
  {
    key: 'meeting',
    nameKey: 'note.tplMeetingName',
    descKey: 'note.tplMeetingDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '会议纪要 {{datetime}}', 'en-US': 'Meeting Notes {{datetime}}' },
    ...BUILTIN_NOTE_BODIES.meeting,
  },
  {
    key: 'reading',
    nameKey: 'note.tplReadingName',
    descKey: 'note.tplReadingDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '读书笔记｜书名', 'en-US': 'Reading Notes | Book Title' },
    ...BUILTIN_NOTE_BODIES.reading,
  },
  {
    key: 'project',
    nameKey: 'note.tplProjectName',
    descKey: 'note.tplProjectDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '项目计划｜项目名称', 'en-US': 'Project Plan | Project Name' },
    ...BUILTIN_NOTE_BODIES.project,
  },
  {
    key: 'review',
    nameKey: 'note.tplReviewName',
    descKey: 'note.tplReviewDesc',
    type: 'html',
    titleTemplate: { 'zh-CN': '复盘｜事项｜{{date}}', 'en-US': 'Retrospective | Topic | {{date}}' },
    ...BUILTIN_NOTE_BODIES.review,
  },
  {
    key: 'knowledge',
    nameKey: 'note.tplKnowledgeName',
    descKey: 'note.tplKnowledgeDesc',
    type: 'markdown',
    titleTemplate: { 'zh-CN': '知识卡片｜主题', 'en-US': 'Knowledge Card | Topic' },
    ...BUILTIN_NOTE_BODIES.knowledge,
  },
  {
    key: 'mindmap',
    nameKey: 'note.tplMindmapName',
    descKey: 'note.tplMindmapDesc',
    type: 'markdown',
    titleTemplate: { 'zh-CN': '思维导图｜主题', 'en-US': 'Mind Map | Topic' },
    ...BUILTIN_NOTE_BODIES.mindmap,
  },
];

export function findBuiltinNoteTemplate(key: string | undefined | null): BuiltinNoteTemplate | undefined {
  if (!key) return undefined;
  return BUILTIN_NOTE_TEMPLATES.find((t) => t.key === key);
}

const BUILTIN_TEMPLATE_FIXED_ORDER = new Map([
  ['daily', 0],
  ['weekly', 1],
]);

/** 日报、周报固定在前两位，其余模板仍按最近使用时间排序。 */
export function sortBuiltinNoteTemplates(
  templates: readonly BuiltinNoteTemplate[],
  recentUsage: Readonly<Record<string, number>>,
): BuiltinNoteTemplate[] {
  return [...templates].sort((a, b) => {
    const fixedOrderA = BUILTIN_TEMPLATE_FIXED_ORDER.get(a.key) ?? Number.POSITIVE_INFINITY;
    const fixedOrderB = BUILTIN_TEMPLATE_FIXED_ORDER.get(b.key) ?? Number.POSITIVE_INFINITY;
    if (fixedOrderA !== fixedOrderB) return fixedOrderA - fixedOrderB;
    return Number(recentUsage[`builtin:${b.key}`] || 0) - Number(recentUsage[`builtin:${a.key}`] || 0);
  });
}
