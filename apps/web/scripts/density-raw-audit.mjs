// Review gate for NEW fixed CSS dimensions. Existing debt remains in the full
// inventory; this comparison must not be used as proof of migration completion.
const dimensions =
  /^(?:font-size|line-height|(?:min-|max-)?(?:width|height|inline-size|block-size)|(?:row-|column-)?gap|(?:padding|margin)(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?|grid-(?:template|auto)-(?:rows|columns)|flex-basis|--[\w-]*(?:width|height|size|gap|padding|margin|spacing|inset|top|right|bottom|left)(?:-(?:inline|block|top|right|bottom|left|start|end))*)$/;

export function fixedDensityDeclarations(source, vue = false) {
  const blocks = vue
    ? [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => ({
        text: m[1],
        offset: m.index + m[0].indexOf('>') + 1,
      }))
    : [{ text: source, offset: 0 }];
  const result = [];
  for (const { text, offset } of blocks) {
    const comments = [];
    const clean = text.replace(/\/\*[\s\S]*?\*\//g, (value, index) => {
      comments.push({ index, end: index + value.length, value });
      return value.replace(/[^\n]/g, ' ');
    });
    for (const match of clean.matchAll(/(?:^|(?<=[;{}\n]))\s*([\w-]+)\s*:\s*([^;{}]+)(?:;|(?=}))/g)) {
      const [, property, value] = match;
      if (!dimensions.test(property)) continue;
      const raw = value
        .replace(/var\(\s*--ui-[\w-]+\s*,\s*\d+(?:\.\d+)?px\s*\)/g, 'DENSITY')
        .replace(/\.ui-(?:space|control|layout|font|card)\(\s*\d+(?:\.\d+)?px\s*\)\s*\[\s*\]/g, 'DENSITY');
      if (![...raw.matchAll(/(-?\d*\.?\d+)(?:px|rem|em)\b/g)].some((m) => Number(m[1]) !== 0)) continue;
      const propertyIndex = match.index + match[0].indexOf(property);
      const previous = comments.filter((c) => c.end <= propertyIndex).at(-1);
      const reason =
        previous && !clean.slice(previous.end, propertyIndex).trim()
          ? previous.value.match(/^\/\*\s*ui-density-fixed:\s*(\S[\s\S]*?)\s*\*\/$/)?.[1]
          : undefined;
      result.push({
        line: source.slice(0, offset + propertyIndex).split('\n').length,
        property,
        value: value.trim().replace(/\s+/g, ' '),
        ...(reason ? { reason } : {}),
      });
    }
  }
  return result;
}

export function addedFixedDimensions(before, after, vue = false) {
  const key = (entry) => JSON.stringify([entry.property, entry.value]);
  const counts = new Map();
  for (const entry of fixedDensityDeclarations(before, vue)) counts.set(key(entry), (counts.get(key(entry)) || 0) + 1);
  return fixedDensityDeclarations(after, vue).filter((entry) => {
    const count = counts.get(key(entry)) || 0;
    if (count) {
      counts.set(key(entry), count - 1);
      return false;
    }
    return !entry.reason;
  });
}
