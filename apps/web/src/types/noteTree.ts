export interface NoteTreeItem {
  id: string;
  parentId: string | null;
  title: string;
  type?: string | null;
  revision?: number;
  hasContent?: boolean;
  childCount: number;
  hasChildren: boolean;
  isTop: boolean;
  sort: number;
  updateTime?: string | null;
  invalidParent?: boolean;
  matched?: boolean;
  children?: NoteTreeItem[];
}

export interface NoteBreadcrumbItem {
  id: string;
  title: string;
}

export interface NoteTreeQueryResult {
  parentId: string | null;
  maxDepth: number;
  items: NoteTreeItem[];
  keyword?: string;
  matchCount?: number;
}
