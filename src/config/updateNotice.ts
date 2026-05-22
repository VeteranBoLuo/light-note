export type UpdateNoticeConfig = {
  version: string;
  title: string;
  description: string;
  actionText: string;
  logRoute: string;
  storageKey: string;
};

export const updateNotice: UpdateNoticeConfig = {
  version: '3.1', // 正式版本号
  title: '发现新版本',
  description: '资源中心升级，新增高级筛选与批量标签整理能力；新增回收站，支持书签、笔记、文件30天内恢复。',
  actionText: '查看更新日志',
  logRoute: '/updateLogs',
  storageKey: 'appUpdateVersion',
};
