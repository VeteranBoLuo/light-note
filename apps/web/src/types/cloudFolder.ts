export interface CloudFolderNode {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  sort: number;
  childCount: number;
  directFileCount: number;
  hasChildren: boolean;
  path: string[];
  fullPath: string;
  createTime?: string;
}
