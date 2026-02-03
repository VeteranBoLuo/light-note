export type UpdateNoticeConfig = {
  version: string;
  title: string;
  description: string;
  actionText: string;
  logRoute: string;
  storageKey: string;
};

export const updateNotice: UpdateNoticeConfig = {
  version: '1.0', // 正式版本号
  title: '发现新版本',
  description: '本次更新包含新增笔记AI助手和一些功能优化与体验改进。',
  actionText: '查看更新日志',
  logRoute: '/updateLogs',
  storageKey: 'appUpdateVersion',
};
