export type TranslationPair = { id: string; original: string; translated: string };
export function translationMarkdown(
  content: string,
  pairs: TranslationPair[],
  format: 'translationOnly' | 'bilingual',
) {
  return format === 'bilingual'
    ? pairs
        .map((pair) => `### 原文 / Original\n\n${pair.original}\n\n### 译文 / Translation\n\n${pair.translated}`)
        .join('\n\n---\n\n')
    : content;
}
