// 定义一个基础操作类型
type Operation = {
  module: string;
  operation: string;
};
function createModule<T extends Record<string, string>>(module: string, operations: T): { [K in keyof T]: Operation } {
  const result = {} as { [K in keyof T]: Operation };

  for (const key in operations) {
    result[key] = {
      module,
      operation: operations[key],
    };
  }

  return result;
}
export const OPERATION_LOG_MAP = {
  navigation: createModule('导航栏', {
    toolkit: '工具箱',
    work: '工作台模块',
    resourceCenter: '资源中心模块',
    home: '书签模块',
    note: '笔记模块',
    cloudSpace: '云空间模块',
    tag: '标签模块',
    securityCenter: '安全中心',
    admin: '后台管理',
    aiAssistant: 'AI智能助手模块',
  }),
  login: createModule('登录', {
    previewMobile: '移动端预览',
    githubLogin: 'GitHub快捷登录',
  }),
  register: createModule('注册', {
    register: '注册',
    githubRegister: 'GitHub一键注册/登录',
  }),
  bookmarkMg: createModule('书签管理', {
    toAddBtn: '添加书签',
    exportToExcel: '导出书签',
    importExport: '打开书签导入导出',
    healthCheck: '打开死链体检',
    aiOrganize: '打开 AI 智能整理',
    viewSnapshot: '查看网页正文存档',
    viewSummary: '查看书签 AI 摘要',
  }),
  bookmarkDetail: createModule('书签详情', {
    save: '保存书签',
  }),
  tagMg: createModule('标签管理', {
    addTag: '添加标签',
  }),
  tagDetail: createModule('标签详情', {
    saveTag: '保存标签',
    viewCopyTip: '查看图标复制示例',
    uploadIcon: '上传图标',
  }),
  noteLibrary: createModule('笔记库', {
    addNote: '添加笔记',
    deleteNote: '删除笔记',
    filterNote: '筛选笔记',
    searchNote: '搜索笔记',
    aiOrganize: '打开 AI 智能整理',
  }),
  note: createModule('笔记', {
    updateTag: '更新标签',
    exportPdf: '导出PDF',
    deleteNote: '删除笔记',
    saveNote: '保存笔记',
  }),
  cloudSpace: createModule('云空间', {}),
  inbox: createModule('待处理', {
    openCapture: '打开快速添加',
    captureBookmark: '收集书签成功',
    captureNote: '收集笔记成功',
    captureFile: '收集文件成功',
    captureTodo: '创建待办成功',
    completeOne: '单条整理完成',
    completeBatch: '批量整理完成',
    deleteOne: '单条资源移入回收站',
    deleteBatch: '批量资源移入回收站',
    openResource: '打开原资源继续整理',
  }),
  quickSave: createModule('一键收藏', {
    generateMeta: '智能识别书签信息成功',
    createSuggestedTag: '创建 AI 建议标签成功',
    save: '保存书签成功',
  }),
  notification: createModule('通知中心', {
    deleteOne: '删除单条通知',
  }),
  settings: createModule('设置', {
    exportData: '导出个人数据成功',
  }),
  trash: createModule('回收站', {
    restore: '恢复资源成功',
    permanentDelete: '永久删除资源成功',
    restoreAll: '一键恢复全部资源成功',
    emptyAll: '清空回收站成功',
  }),
  aiAssistant: createModule('AI助手', {
    confirmTool: '确认执行 AI 工具成功',
  }),
  workbenches: createModule('工作台', {
    tag: '标签总览',
    note: '笔记总览',
    bookmark: '书签总览',
    cloud: '云空间总览',
    guide: '新手指引',
    moreLog: '更多更新日志',
    LogDetail: '更新日志详情',
  }),
};
