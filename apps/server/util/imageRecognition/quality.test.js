import { describe, expect, it } from 'vitest';
import { chooseBetterRecognitionText, inspectRecognitionText } from './quality.js';

describe('图片识别文字质量门禁', () => {
  it('明显替换符和重复乱码不会因为“非空”就被当成可靠正文', () => {
    expect(inspectRecognitionText('������������')).toMatchObject({ suspicious: true });
    expect(inspectRecognitionText('AAAAAAAAAAAAAAAAAAAA')).toMatchObject({ suspicious: true });
  });

  it('本地 OCR 多版面结果优先选择可读内容', () => {
    expect(chooseBetterRecognitionText('��������', '号牌号码 粤B12345\n注册日期 2024-08-05').text).toContain(
      '粤B12345',
    );
  });
});
