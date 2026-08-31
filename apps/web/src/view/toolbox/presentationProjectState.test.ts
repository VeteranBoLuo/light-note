import { describe, expect, it } from 'vitest';
import {
  clonePresentationContent,
  createPresentationContent,
  createPresentationSlide,
  movePresentationSlide,
  presentationContentForSave,
  presentationContentSnapshot,
} from './presentationProjectState';

describe('演示文稿工作室本地状态', () => {
  it('新项目包含一张可编辑标题页并符合 presentation/v1', () => {
    const content = createPresentationContent();
    expect(content).toMatchObject({
      type: 'presentation',
      schemaVersion: 1,
      canvas: { aspectRatio: '16:9' },
      slides: [{ layout: 'title', body: { format: 'markdown', value: '' } }],
    });
    expect(presentationContentForSave(content)).toEqual(content);
  });

  it('克隆后可以独立编辑，保存快照不会被后续输入污染', () => {
    const source = createPresentationContent();
    const snapshot = presentationContentSnapshot(source);
    const draft = clonePresentationContent(source);
    draft.slides[0]!.title = 'Changed';
    expect(source.slides[0]!.title).not.toBe('Changed');
    expect(presentationContentSnapshot(source)).toBe(snapshot);
    expect(presentationContentSnapshot(draft)).not.toBe(snapshot);
  });

  it('排序保持幻灯片 id 与内容，不接受越界移动', () => {
    const content = createPresentationContent();
    const second = createPresentationSlide(1);
    content.slides.push(second);
    const firstId = content.slides[0]!.id;
    expect(movePresentationSlide(content, 0, 1)).toBe(true);
    expect(content.slides.map((slide) => slide.id)).toEqual([second.id, firstId]);
    expect(movePresentationSlide(content, 4, 0)).toBe(false);
  });
});
