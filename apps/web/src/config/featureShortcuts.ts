import icon from '@/config/icon';

/**
 * 快捷搜索「功能直达」的唯一功能清单：电脑端搜索框、手机端搜索层与 Root 的「最近上线」都从这里取。
 * 文案在 i18n `featureShortcut.items.<key>`；aliases 是用户可能搜的说法，中英混写，不进词典。
 * 新功能要出现在「最近上线」，先在这里登记一条。
 */
export type FeatureShortcutPlatform = 'desktop' | 'mobile';

/** open：直接打开对应页面或弹框；guide：跳到所在页面并提示下一步。 */
export type FeatureShortcutMode = 'open' | 'guide';

/** 目标页面通过 useFeatureIntent 登记的一次性动作。 */
export type FeatureShortcutIntent = 'bookmark-import' | 'note-import' | 'ai-organize';

export interface FeatureShortcutDefinition {
  id: string;
  /** i18n 键名：featureShortcut.items.<key> */
  key: string;
  icon: string;
  mode: FeatureShortcutMode;
  platforms: readonly FeatureShortcutPlatform[];
  /** 游客不展示需要个人数据或写入的功能。 */
  requiresLogin: boolean;
  route: { path: string; query?: Record<string, string> };
  intent?: FeatureShortcutIntent;
  /** 目标页没有接住 intent 时，跳转后显示 items.<key>.hint。 */
  hint?: boolean;
  aliases: readonly string[];
}

const BOTH: readonly FeatureShortcutPlatform[] = ['desktop', 'mobile'];
const DESKTOP: readonly FeatureShortcutPlatform[] = ['desktop'];

export const FEATURE_SHORTCUTS: readonly FeatureShortcutDefinition[] = [
  {
    id: 'bookmark-import',
    key: 'bookmarkImport',
    icon: icon.bookmarkManage.importExport,
    mode: 'open',
    platforms: DESKTOP,
    requiresLogin: true,
    route: { path: '/manage/bookmarkMg' },
    intent: 'bookmark-import',
    aliases: ['导入书签', '收藏夹', '浏览器书签', 'Chrome 书签', 'Edge 书签', '书签 HTML', '迁移书签', 'import bookmarks', 'favorites'],
  },
  {
    id: 'note-import',
    key: 'noteImport',
    icon: icon.toolbox.upload,
    mode: 'open',
    platforms: BOTH,
    requiresLogin: true,
    route: { path: '/noteLibrary' },
    intent: 'note-import',
    aliases: ['导入 Markdown', '导入md', 'Markdown 文件', 'Word', 'docx', 'ZIP', '导入文档', '导入文件', 'import notes'],
  },
  {
    id: 'note-export',
    key: 'noteExport',
    icon: icon.noteDetail.export,
    mode: 'guide',
    platforms: BOTH,
    requiresLogin: true,
    route: { path: '/noteLibrary' },
    hint: true,
    aliases: ['导出', '下载笔记', '导出 PDF', '导出 Markdown', '合并导出', 'export notes'],
  },
  {
    id: 'data-backup',
    key: 'dataBackup',
    icon: icon.support.backup,
    mode: 'open',
    platforms: BOTH,
    requiresLogin: true,
    route: { path: '/settings', query: { section: 'export' } },
    aliases: ['备份', '数据导出', '导出全部', '下载全部', '数据丢失', '数据安全', 'backup', 'export data'],
  },
  {
    id: 'ai-organize',
    key: 'aiOrganize',
    icon: icon.ai.organize,
    mode: 'guide',
    platforms: BOTH,
    requiresLogin: true,
    route: { path: '/manage/bookmarkMg' },
    intent: 'ai-organize',
    hint: true,
    aliases: ['自动打标签', '智能标签', 'AI 标签', 'AI 打标签', '自动分类', '智能分类', 'auto tag', 'smart tag'],
  },
  {
    id: 'batch-tags',
    key: 'batchTags',
    icon: icon.resource.tag,
    mode: 'open',
    platforms: BOTH,
    requiresLogin: true,
    route: { path: '/search/batch-tags' },
    aliases: ['批量打标签', '批量加标签', '批量标签', '批量删标签', 'bulk tag', 'batch tag'],
  },
  {
    id: 'todo-calendar',
    key: 'todoCalendar',
    icon: icon.common.calendar,
    mode: 'guide',
    platforms: BOTH,
    requiresLogin: true,
    route: { path: '/inbox' },
    hint: true,
    aliases: ['导出日程', '日程导出', 'ics', '日历', '同步日历', '添加到日历', 'calendar'],
  },
  {
    id: 'trash',
    key: 'trash',
    icon: icon.noteDetail.delete,
    mode: 'open',
    platforms: BOTH,
    requiresLogin: true,
    route: { path: '/trash' },
    aliases: ['恢复', '误删', '已删除', '删除的', 'recycle', 'restore', 'deleted'],
  },
  {
    id: 'note-templates',
    key: 'noteTemplates',
    icon: icon.noteDetail.template,
    mode: 'open',
    platforms: BOTH,
    requiresLogin: true,
    route: { path: '/noteLibrary/templates' },
    aliases: ['模板', '日报模板', '周报模板', '会议模板', 'template'],
  },
  {
    id: 'browser-extension',
    key: 'browserExtension',
    icon: icon.navigation.browserExtension,
    mode: 'open',
    platforms: DESKTOP,
    requiresLogin: false,
    route: { path: '/browser-extension' },
    aliases: ['插件', '扩展', '剪藏', '浏览器插件', 'Chrome 扩展', 'Edge 扩展', 'extension', 'clipper'],
  },
  {
    id: 'install-app',
    key: 'installApp',
    icon: icon.pwa.install,
    mode: 'open',
    platforms: DESKTOP,
    requiresLogin: false,
    route: { path: '/settings', query: { section: 'general', focus: 'install' } },
    aliases: ['安装', 'App', '客户端', '安卓', '手机版', '添加到桌面', 'PWA', 'iOS', 'install'],
  },
  {
    id: 'theme',
    key: 'theme',
    icon: icon.navigation.moon,
    mode: 'open',
    platforms: BOTH,
    requiresLogin: false,
    route: { path: '/settings', query: { section: 'appearance', focus: 'theme' } },
    aliases: ['深色', '暗色', '夜间', '浅色', '主题', '外观', 'dark mode', 'theme'],
  },
  {
    id: 'ui-density',
    key: 'uiDensity',
    icon: icon.settings.appearance,
    mode: 'open',
    platforms: DESKTOP,
    requiresLogin: false,
    route: { path: '/settings', query: { section: 'appearance', focus: 'density' } },
    aliases: ['密度', '字太小', '字太大', '字号', '紧凑', '宽松', '缩放', 'density', 'font size', 'zoom'],
  },
  {
    id: 'shortcuts',
    key: 'shortcuts',
    icon: icon.settings.shortcuts,
    mode: 'open',
    platforms: DESKTOP,
    requiresLogin: false,
    route: { path: '/settings', query: { section: 'general', focus: 'shortcuts' } },
    aliases: ['快捷键', '键盘', 'shortcut', 'keyboard', 'hotkey'],
  },
  {
    id: 'co-build',
    key: 'coBuild',
    icon: icon.coBuild.board,
    mode: 'open',
    platforms: BOTH,
    requiresLogin: false,
    route: { path: '/co-build' },
    aliases: ['共建', '提建议', '建议', '反馈', '意见', '需求', 'bug', 'feedback', 'feature request'],
  },
  {
    id: 'update-logs',
    key: 'updateLogs',
    icon: icon.userCenter.log,
    mode: 'open',
    platforms: BOTH,
    requiresLogin: false,
    route: { path: '/updateLogs' },
    aliases: ['更新', '新功能', '版本', 'changelog', 'release notes', "what's new"],
  },
  {
    id: 'workshop',
    key: 'workshop',
    icon: icon.toolbox.home,
    mode: 'open',
    platforms: BOTH,
    requiresLogin: false,
    route: { path: '/toolbox' },
    aliases: ['工坊', '资料转表格', '表格提取', '学习项目', '研究项目', '写作项目', 'OCR', 'workshop'],
  },
  {
    id: 'manor',
    key: 'manor',
    icon: icon.manor.entry,
    mode: 'open',
    platforms: BOTH,
    requiresLogin: true,
    route: { path: '/knowledge-manor' },
    aliases: ['庄园', '种田', '种地', '农场', '钓鱼', 'farm', 'manor'],
  },
  {
    id: 'note-reference',
    key: 'noteReference',
    icon: icon.noteTree.reference,
    mode: 'guide',
    platforms: DESKTOP,
    requiresLogin: false,
    route: { path: '/noteLibrary' },
    hint: true,
    aliases: ['参考', '分屏', '并排', '拆分视图', '对照', '两篇笔记', 'split view', 'side by side', 'reference'],
  },
];

const FEATURE_SHORTCUT_BY_ID = new Map(FEATURE_SHORTCUTS.map((feature) => [feature.id, feature]));

export function getFeatureShortcut(id: string): FeatureShortcutDefinition | undefined {
  return FEATURE_SHORTCUT_BY_ID.get(id);
}
