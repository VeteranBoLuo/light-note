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
    work: '工作台模块',
    home: '书签模块',
    note: '笔记模块',
    cloudSpace: '云空间模块',
    aiAssistant: 'AI智能助手模块',
  }),
  login: createModule('登录', {
    previewMobile: '移动端预览',
  }),
  register: createModule('注册', {
    register: '注册',
  }),
  bookmarkMg: createModule('书签管理', {
    toAddBtn: '添加书签',
    exportToExcel: '导出书签',
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
  }),
  note: createModule('笔记', {
    updateTag: '更新标签',
    exportPdf: '导出PDF',
    deleteNote: '删除笔记',
    saveNote: '保存笔记',
  }),
  cloudSpace: createModule('云空间', {}),
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
