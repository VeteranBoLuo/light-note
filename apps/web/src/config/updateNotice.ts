export type UpdateNoticeConfig = {
  version: string;
  title: string;
  description: string;
  actionText: string;
  logRoute: string;
  storageKey: string;
};

export const updateNotice: UpdateNoticeConfig = {
  version: '3.2', // 正式版本号
  title: '发现新版本',
  description: 'AI 智能助手升级为 Agent & 官网首页上线 & 多项体验优化',
  actionText: '查看更新日志',
  logRoute: '/updateLogs',
  storageKey: 'appUpdateVersion',
};
