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

export type BaseOptions = {
  label: string;
  value: any;
};

export enum RoleEnum {
  VISITOR = 'visitor',

  Root = 'root',

  ADMIN = 'admin',
}
