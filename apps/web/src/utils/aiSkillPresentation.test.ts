import { describe, expect, it } from 'vitest';
import { formatAiSkillCoverageWarnings } from './aiSkillPresentation';

describe('formatAiSkillCoverageWarnings', () => {
  const t = (key: string) =>
    ({
      'aiSkills.coverage.fileParsingInProgress': '文件仍在解析，请稍后再试。',
      'aiSkills.coverage.resourceContentTruncated': '内容较长，本次仅处理了可用范围。',
      'aiSkills.coverage.imageRecognitionFallback': '已自动使用本地 OCR。',
      'aiSkills.coverage.imageRecognitionUncertain': '部分字符需要核验。',
      'aiSkills.coverage.unknown': '部分内容本次未能读取。',
    })[key] || key;

  it('把带内部资源 ID 的稳定诊断码转换成用户文案并去重', () => {
    expect(
      formatAiSkillCoverageWarnings(
        [
          'file_parsing_in_progress:file:private-file-id',
          'file_parsing_in_progress:file:another-private-id',
          'resource_content_truncated:note:private-note-id',
        ],
        t,
      ),
    ).toEqual(['文件仍在解析，请稍后再试。', '内容较长，本次仅处理了可用范围。']);
  });

  it('明确展示图片识别已降级，不把本地 OCR 冒充为高精度识图', () => {
    expect(
      formatAiSkillCoverageWarnings(
        ['image_recognition_fallback:file:private-id', 'image_recognition_uncertain:file:private-id'],
        t,
      ),
    ).toEqual(['已自动使用本地 OCR。', '部分字符需要核验。']);
  });

  it('未知诊断码使用封闭提示，不回显原始值', () => {
    expect(formatAiSkillCoverageWarnings(['future_internal_code:note:secret-id'], t)).toEqual([
      '部分内容本次未能读取。',
    ]);
  });
});
