export interface ProductionDocumentOutlineItem {
  id: string;
  level: 1 | 2 | 3;
  title: string;
  position: number;
  selectionEnd: number;
}

export function buildProductionDocumentOutline(markdown: string): ProductionDocumentOutlineItem[] {
  const source = String(markdown || '').replace(/\r\n?/gu, '\n');
  const items: ProductionDocumentOutlineItem[] = [];
  let position = 0;
  let fence: string | null = null;

  for (const line of source.split('\n')) {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/u.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]![0]!;
      if (!fence) fence = marker;
      else if (fence === marker) fence = null;
      position += line.length + 1;
      continue;
    }
    if (!fence) {
      const heading = /^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/u.exec(line);
      const title = heading?.[2]?.trim() || '';
      if (heading && title) {
        const level = heading[1]!.length as 1 | 2 | 3;
        const titleOffset = line.indexOf(heading[2]!);
        items.push({
          id: `heading-${position}`,
          level,
          title,
          position,
          selectionEnd: position + Math.max(0, titleOffset) + title.length,
        });
      }
    }
    position += line.length + 1;
  }
  return items;
}
