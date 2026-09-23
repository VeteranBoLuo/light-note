import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleContexts } from './density-style-context.mjs';

// Inventory, not proof of visual completion: authored content, decoration and
// breakpoint constants require review before any dimension is migrated.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => (entry.isDirectory() ? files(join(directory, entry.name)) : join(directory, entry.name))),
    )
  ).flat();
}
const dimensions =
  /^(?:font-size|line-height|(?:min-|max-)?(?:width|height|inline-size|block-size)|(?:row-|column-)?gap|(?:padding|margin)(?:-(?:top|right|bottom|left|inline|block))?|grid-(?:template|auto)-(?:rows|columns)|flex(?:-basis)?|--[\w-]*(?:width|height|size|gap))$/;
const report = [];
for (const file of (await files(join(root, 'src'))).sort()) {
  if (!/\.(vue|less|css)$/.test(file) || file.includes('/e2e/')) continue;
  const source = await readFile(file, 'utf8');
  const blocks = file.endsWith('.vue')
    ? [...source.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((match) => ({
        text: match[1],
        offset: match.index + match[0].indexOf('>') + 1,
      }))
    : [{ text: source, offset: 0 }];
  const remaining = [];
  for (const { text, offset } of blocks) {
    const matches = [...text.matchAll(/(?:^|(?<=[;{}\n]))\s*([\w-]+)\s*:\s*([^;{}]+)(?:;|(?=}))/g)];
    const contexts = styleContexts(text, matches.map(match => match.index));
    for (const match of matches) {
      const [, property, value] = match;
      if (!dimensions.test(property)) continue;
      const withoutDensityFallback = value
        .replace(/var\(\s*--ui-[\w-]+(?:,\s*[^()]*)?\)/g, 'DENSITY')
        .replace(/\.ui-(?:space|control|layout|font|card)\(\s*\d+(?:\.\d+)?px\s*\)\s*\[\s*\]/g, 'DENSITY');
      if (!/-?\d*\.?\d+(?:px|rem|em)\b/.test(withoutDensityFallback)) continue;
      remaining.push({ line: source.slice(0, offset + match.index).split('\n').length, property, value: value.trim(), context: contexts.get(match.index) });
    }
  }
  const inline = file.endsWith('.vue')
    ? [...source.matchAll(/\b(?:style|:style|size|:size|width|:width|height|:height)="([^"]*)"/g)]
        .filter((match) => /(?:\d+(?:px|rem|em)\b)|^\d+(?:\.\d+)?$/.test(match[1]))
        .map((match) => ({ line: source.slice(0, match.index).split('\n').length, attribute: match[0] }))
    : [];
  report.push({
    file: relative(root, file),
    densityReferences: (source.match(/--ui-|useUiDensity/g) || []).length,
    remaining,
    inline,
  });
}
const output = process.env.DENSITY_AUDIT_OUTPUT || '/tmp/lightnote-density-inventory.json';
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    files: report.length,
    withDensity: report.filter((file) => file.densityReferences).length,
    remainingDeclarations: report.reduce((sum, file) => sum + file.remaining.length, 0),
    inlineDimensions: report.reduce((sum, file) => sum + file.inline.length, 0),
    output,
  }),
);
