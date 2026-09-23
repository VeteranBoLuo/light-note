/** Validate authored density references, including malformed names and fallbacks.
 * This does not classify raw dimensions or prove that a page is fully migrated.
 */
export function auditDensityTokens(source, standard) {
  const errors = [];
  for (const match of source.matchAll(/var\(\s*(--ui-[\w-]+)/g)) {
    const name = match[1];
    const line = source.slice(0, match.index).split('\n').length;
    const tail = source.slice(match.index + match[0].length);
    if (!Object.hasOwn(standard, name)) {
      errors.push({ line, name, reason: 'undefined density token' });
      continue;
    }
    const fallback = tail.match(/^\s*,\s*(\d+(?:\.\d+)?)px\s*\)/);
    if (!fallback) {
      errors.push({ line, name, reason: 'explicit standard px fallback required' });
    } else if (`${Number(fallback[1])}px` !== standard[name]) {
      errors.push({ line, name, reason: `standard fallback must be ${standard[name]}` });
    }
  }
  // Less helpers must use literal standard px sizes so review and catalog checks
  // remain deterministic. Dynamic geometry belongs in useUiDensity().
  for (const match of source.matchAll(/\.ui-(space|control|layout|font|card)\(\s*([^)]*)\)\s*\[\s*\]/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    const size = match[2].trim().match(/^(\d+(?:\.\d+)?)px$/);
    const name = size ? `--ui-${match[1]}-${String(Number(size[1])).replace('.', '_')}` : match[0];
    if (!size) errors.push({ line, name, reason: 'density helper requires a literal standard px size' });
    else if (!Object.hasOwn(standard, name)) errors.push({ line, name, reason: 'undefined density token' });
  }
  return errors;
}
