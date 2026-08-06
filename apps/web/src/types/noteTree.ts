export const NOTE_TREE_MAX_DEPTH = 8;

export interface NoteTreeItem {
  id: string;
  parentId: string | null;
  title: string;
  childCount: number;
  hasChildren: boolean;
  isTop: boolean;
  sort: number;
  updateTime?: string | null;
  invalidParent?: boolean;
  children?: NoteTreeItem[];
}

export interface NoteBreadcrumbItem {
  id: string;
  title: string;
}

export interface NoteTreeQueryResult {
  parentId: string | null;
  items: NoteTreeItem[];
}
