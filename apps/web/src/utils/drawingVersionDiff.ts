import { parseDrawingScene, type DrawingElement } from '@lightnote/shared/drawing-note';

export interface DrawingVersionDiffSummary {
  added: number;
  removed: number;
  changed: number;
}

function parseElements(content: string): DrawingElement[] {
  try {
    return parseDrawingScene(String(content || '')).elements;
  } catch {
    return [];
  }
}

export function compareDrawingVersions(currentContent: string, historicalContent: string): DrawingVersionDiffSummary {
  const currentElements = parseElements(currentContent);
  const historicalElements = parseElements(historicalContent);
  const currentById = new Map(currentElements.map((element) => [element.id, element]));
  const historicalById = new Map(historicalElements.map((element) => [element.id, element]));
  let changed = 0;

  currentById.forEach((element, id) => {
    const historicalElement = historicalById.get(id);
    if (historicalElement && JSON.stringify(element) !== JSON.stringify(historicalElement)) changed += 1;
  });

  return {
    added: currentElements.filter((element) => !historicalById.has(element.id)).length,
    removed: historicalElements.filter((element) => !currentById.has(element.id)).length,
    changed,
  };
}
