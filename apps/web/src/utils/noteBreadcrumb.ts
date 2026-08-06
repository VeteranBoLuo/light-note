import type { NoteBreadcrumbItem } from '@/types/noteTree';

export type NoteBreadcrumbDisplayItem =
  | { kind: 'root'; key: 'root' }
  | { kind: 'ellipsis'; key: 'ellipsis' }
  | { kind: 'note'; key: string; id: string; title: string };

function normalizedNotes(items: NoteBreadcrumbItem[]): NoteBreadcrumbDisplayItem[] {
  const seen = new Set<string>();
  return (Array.isArray(items) ? items : []).flatMap((item) => {
    const id = String(item?.id || '').trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ kind: 'note' as const, key: `note:${id}`, id, title: String(item?.title || '') }];
  });
}

/** 深层路径确定性折叠，不能依赖 overflow 把当前页随机裁掉。 */
export function buildNoteBreadcrumbDisplay(items: NoteBreadcrumbItem[], mobile: boolean) {
  const notes = normalizedNotes(items);
  const root: NoteBreadcrumbDisplayItem = { kind: 'root', key: 'root' };
  if (mobile) {
    if (notes.length <= 2) return [root, ...notes];
    return [root, { kind: 'ellipsis' as const, key: 'ellipsis' }, notes[notes.length - 1]];
  }
  if (notes.length <= 3) return [root, ...notes];
  return [
    root,
    { kind: 'ellipsis' as const, key: 'ellipsis' },
    notes[notes.length - 2],
    notes[notes.length - 1],
  ];
}
