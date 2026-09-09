import { buildExportFileName } from './fileDelivery';
import { resolveBatchNoteExportFormat } from './noteBatchExport';
import type { NoteBatchExportMode } from './noteBatchExport';
export interface ExportPathNode {
  id: string;
  title?: string | null;
  parentId?: string | null;
  type?: string | null;
}
export function buildNoteExportPaths(
  notes: ExportPathNode[],
  rootId: string,
  mode: NoteBatchExportMode = 'original',
): Map<string, string> {
  const nodes = new Map(notes.map((n) => [n.id, n]));
  const paths = new Map<string, string>();
  const names = new Map<string, Set<string>>();
  const visit = (id: string, seen = new Set<string>()): string => {
    if (paths.has(id)) return paths.get(id)!;
    const note = nodes.get(id);
    if (!note || seen.has(id)) throw new Error('NOTE_EXPORT_INVALID_TREE');
    seen.add(id);
    const parent = id === rootId ? null : note.parentId;
    if (id !== rootId && (!parent || !nodes.has(parent))) throw new Error('NOTE_EXPORT_INVALID_TREE');
    const prefix = parent ? visit(parent, new Set(seen)) + '/' : '';
    const group = parent || '';
    const used = names.get(group) || new Set<string>();
    names.set(group, used);
    let base =
      buildExportFileName(note.title || '', 'Untitled', 'txt')
        .slice(0, -4)
        .replace(/[. ]+$/g, '')
        .slice(0, 100) || 'Untitled';
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = '_' + base;
    const extension = resolveBatchNoteExportFormat(note.type, mode);
    let name = base;
    let suffix = 2;
    while (used.has(name.toLowerCase()) || used.has(`${name}.${extension}`.toLowerCase()))
      name = `${base} (${suffix++})`;
    used.add(name.toLowerCase());
    used.add(`${name}.${extension}`.toLowerCase());
    paths.set(id, prefix + name);
    return prefix + name;
  };
  for (const note of notes) visit(note.id);
  return paths;
}
