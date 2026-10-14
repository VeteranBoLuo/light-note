/** Only parser-owned, non-overlapping page segments may establish OCR page identity. */
export function buildOcrPages(outputs) {
  return outputs.map(({ source, result }) => ({
    sourceId: String(source.id),
    title: String(source.file_name || ''),
    pages: (Array.isArray(result.segments) ? result.segments : [])
      .filter((segment) => segment.locator?.type === 'page' && typeof segment.text === 'string' && segment.text.trim())
      .map((segment) => ({
        number: /^第\s*(\d+)\s*页$/.test(segment.locator.value) ? Number(segment.locator.value.match(/\d+/)[0]) : null,
        label: String(segment.locator.value || ''),
        text: segment.text,
      })),
  }));
}
