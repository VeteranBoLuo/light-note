export interface TagInterface {
  id: string;
  name: string;
  isRename?: boolean;
  relatedTagIds?: any;
  iconUrl?: string;
  bookmarkList?: string[];
  noteList?: string[];
  fileList?: string[];
  relatedTagList?: { id: string; name: string }[];
  [key: string]: any;
}

export interface BookmarkInterface {
  id: string;
  name: string;
  url: string;
  description?: string;
  tagList?: TagInterface[];
  iconUrl?: string;
  iconCheckedAt?: string;
  hasSnapshot?: boolean; // 是否已有网页正文存档(列表/编辑页角标)
  hasSummary?: boolean; // 是否已有 AI 摘要
  [key: string]: any;
}

export type BaseOptions = {
  label: string;
  value: any;
};

export enum RoleEnum {
  VISITOR = 'visitor',

  Root = 'root',

  USER = 'user', // 普通注册用户(原 admin 语义)

  TEST = 'test', // 测试账号:权限同 user,日志/统计中作为内部账号过滤
}

// 所有角色都可访问的普通页面(游客可只读预览):路由白名单统一引用此常量,替代逐一枚举 [Root, ADMIN, VISITOR]。
// 以后新增角色只需改这里一处;守卫仍以「是否含 VISITOR」判定公开页。
export const ALL_ROLES = [RoleEnum.Root, RoleEnum.USER, RoleEnum.TEST, RoleEnum.VISITOR];
