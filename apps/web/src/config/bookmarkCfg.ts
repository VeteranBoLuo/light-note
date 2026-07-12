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
  [key: string]: any;
}

export type BaseOptions = {
  label: string;
  value: any;
};

export enum RoleEnum {
  VISITOR = 'visitor',

  Root = 'root',

  ADMIN = 'admin', // 遗留值,存量数据仍有;阶段 D 迁移后此值不再分配,但枚举保留(路由数组仍引用)

  USER = 'user', // 普通注册用户(原 admin 语义)

  TEST = 'test', // 测试账号:权限同 user,日志/统计中作为内部账号过滤
}
