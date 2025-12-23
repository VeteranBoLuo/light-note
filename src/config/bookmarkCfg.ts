export interface TagInterface {
  id: string;
  name: string;
  isRename?: boolean;
  relatedTagIds?: any;
  iconUrl?: string;
  bookmarkList?: [];
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

  ADMIN = 'admin',
}
