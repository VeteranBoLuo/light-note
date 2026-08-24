const COVERAGE_WARNING_KEYS: Record<string, string> = Object.freeze({
  resource_unavailable: 'aiSkills.coverage.resourceUnavailable',
  note_drawing_no_text: 'aiSkills.coverage.noteDrawingNoText',
  note_empty: 'aiSkills.coverage.noteEmpty',
  bookmark_page_content_unavailable: 'aiSkills.coverage.bookmarkPageContentUnavailable',
  todo_empty: 'aiSkills.coverage.todoEmpty',
  file_not_parsed: 'aiSkills.coverage.fileNotParsed',
  file_upload_incomplete: 'aiSkills.coverage.fileUploadIncomplete',
  file_parsing_queued: 'aiSkills.coverage.fileParsingQueued',
  file_parsing_in_progress: 'aiSkills.coverage.fileParsingInProgress',
  file_parsing_failed: 'aiSkills.coverage.fileParsingFailed',
  file_no_readable_text: 'aiSkills.coverage.fileNoReadableText',
  image_recognition_fallback: 'aiSkills.coverage.imageRecognitionFallback',
  image_recognition_uncertain: 'aiSkills.coverage.imageRecognitionUncertain',
  resource_content_truncated: 'aiSkills.coverage.resourceContentTruncated',
});

/**
 * 服务端 warning 是可审计的稳定诊断码，可能附带 `资源类型:资源 ID`。
 * 页面只展示本地化后的能力边界，禁止把内部 ID 或未知诊断文本直接暴露给用户。
 */
export function formatAiSkillCoverageWarnings(warnings: unknown, translate: (key: string) => string): string[] {
  if (!Array.isArray(warnings)) return [];
  const messages = new Set<string>();
  for (const raw of warnings) {
    const code = String(raw || '')
      .trim()
      .split(':', 1)[0];
    if (!code) continue;
    messages.add(translate(COVERAGE_WARNING_KEYS[code] || 'aiSkills.coverage.unknown'));
  }
  return [...messages].filter(Boolean);
}

export const aiSkillPresentationInternals = Object.freeze({ COVERAGE_WARNING_KEYS });
