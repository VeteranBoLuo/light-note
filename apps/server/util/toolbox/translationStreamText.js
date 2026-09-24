// Decode only the top-level text string of an accumulating tool call. Drafts are
// display-only; the full tool call still passes the normal completion validator.
export function translationDraftText(input) {
  let i = 0;
  const whitespace = () => {
    while (/\s/.test(input[i] || '') && i < input.length) i++;
  };
  const string = () => {
    if (input[i++] !== '"') return null;
    let value = '';
    while (i < input.length) {
      let c = input[i++];
      if (c === '"') return { value, complete: true };
      if (c === '\\') {
        if (i >= input.length) break;
        c = input[i++];
        if (c === 'u') {
          const hex = input.slice(i, i + 4);
          if (!/^[a-f\d]{4}$/i.test(hex)) break;
          value += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else {
          const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };
          if (!(c in escapes)) return null;
          value += escapes[c];
        }
      } else value += c;
    }
    return { value: value.replace(/[\uD800-\uDBFF]$/, ''), complete: false };
  };
  whitespace();
  if (input[i++] !== '{') return '';
  while (i < input.length) {
    whitespace();
    const key = string();
    if (!key?.complete) return '';
    whitespace();
    if (input[i++] !== ':') return '';
    whitespace();
    if (input[i] === '"') {
      const field = string();
      if (key.value === 'text') return field?.value || '';
      if (!field?.complete) return '';
    } else {
      // Only primitive fields precede text in this closed output protocol.
      while (i < input.length && ![',', '}'].includes(input[i])) i++;
    }
    whitespace();
    if (input[i++] !== ',') return '';
  }
  return '';
}
export function restoreTranslationDraft(segment, text) {
  let value = text;
  for (const { token, value: original } of segment.tokens) value = value.replaceAll(token, original);
  // Never flash a half-generated protected code/link marker to the reader.
  const pending = value.indexOf('⟦');
  if (pending >= 0) value = value.slice(0, pending);
  return value;
}
