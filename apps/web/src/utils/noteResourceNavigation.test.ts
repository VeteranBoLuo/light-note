import { describe, expect, it } from 'vitest';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import { buildNoteReturnFocusLocation, normalizeReferencedFilePreviewInfo } from './noteResourceNavigation';

function noteRoute(overrides: Partial<RouteLocationNormalizedLoaded> = {}) {
  return {
    name: 'noteDetail',
    params: { id: 'note-1' },
    query: { source: 'reference' },
    hash: '#content',
    ...overrides,
  } as RouteLocationNormalizedLoaded;
}

describe('noteResourceNavigation', () => {
  it('进入引用目标前保留当前笔记参数并登记返回定位引用', () => {
    expect(buildNoteReturnFocusLocation(noteRoute(), { type: 'file', id: 'file-1' })).toEqual({
      name: 'noteDetail',
      params: { id: 'note-1' },
      query: { source: 'reference', focusRef: 'file:file-1' },
      hash: '#content',
    });
  });

  it('非笔记页或相同定位不重复改写历史项', () => {
    expect(buildNoteReturnFocusLocation(noteRoute({ name: 'cloudSpace' }), { type: 'file', id: 'file-1' })).toBeNull();
    expect(
      buildNoteReturnFocusLocation(noteRoute({ query: { focusRef: 'file:file-1' } }), {
        type: 'file',
        id: 'file-1',
      }),
    ).toBeNull();
  });

  it('统一云文件详情字段供本页 FilePreview 使用', () => {
    expect(
      normalizeReferencedFilePreviewInfo(
        {
          id: 12,
          file_name: '方案.pdf',
          file_type: 'application/pdf',
          file_url: 'https://example.com/plan.pdf',
          category: 'pdf',
        },
        { id: 'fallback' },
      ),
    ).toEqual({
      id: '12',
      fileName: '方案.pdf',
      fileType: 'application/pdf',
      fileUrl: 'https://example.com/plan.pdf',
      category: 'pdf',
    });
    expect(normalizeReferencedFilePreviewInfo(null, { id: 'file-1' })).toBeNull();
  });
});
