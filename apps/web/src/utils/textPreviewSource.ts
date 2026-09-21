/** Decode original bytes before replacement characters can discard legacy Chinese text. */
export function decodePreviewText(bytes: Uint8Array, partial = false): string {
  let encoding: string | undefined;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  else if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) encoding = 'utf-8';
  if (encoding) return new TextDecoder(encoding).decode(bytes, { stream: partial });

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: partial });
  } catch {
    // GB18030 also covers GBK/GB2312 lyrics. This is a fallback, not universal encoding detection.
    return new TextDecoder('gb18030').decode(bytes, { stream: partial });
  }
}

export async function readTextPreviewSource(
  response: Response,
  maxChars: number,
): Promise<{ content: string; truncated: boolean }> {
  // Bound retained bytes as well as displayed characters; leave room for BOM and lookahead.
  const maxBytes = (maxChars + 1) * 4 + 3;
  let bytes: Uint8Array;
  let partial = false;
  if (response.body) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value.slice(0, maxBytes - length);
        chunks.push(chunk);
        length += chunk.length;
        if (length >= maxBytes) {
          partial = true;
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
    } finally {
      reader.releaseLock();
    }
    bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
  } else {
    const buffer = await response.arrayBuffer();
    partial = buffer.byteLength > maxBytes;
    bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, maxBytes));
  }
  const decoded = decodePreviewText(bytes, partial);
  let content = decoded.slice(0, maxChars);
  // Do not split a supplementary character at the display limit.
  if (content.length < decoded.length && /[\uD800-\uDBFF]$/.test(content)) content = content.slice(0, -1);
  return { content, truncated: partial || content.length < decoded.length };
}
