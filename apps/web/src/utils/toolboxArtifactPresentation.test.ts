import { describe, expect, it } from 'vitest';
import {
  toolboxArtifactSourceRecords,
  toolboxCoverageIssueKinds,
  toolboxSourceIncludedChars,
  toolboxSourceLocator,
  toolboxSourceState,
  toolboxSourceType,
} from './toolboxArtifactPresentation';

describe('toolbox artifact presentation', () => {
  it('keeps structured locators structured instead of stringifying objects', () => {
    expect(toolboxSourceLocator({ locator: { type: 'section', value: '安装步骤' } })).toEqual({
      type: 'section',
      value: '安装步骤',
    });
    expect(toolboxSourceLocator({ locator: {} })).toBeNull();
  });

  it('maps private warning codes to stable user-facing issue kinds without ids', () => {
    expect(
      toolboxCoverageIssueKinds([
        'bookmark_page_content_unavailable:bookmark:private-id',
        'resource_content_truncated:note:another-private-id',
      ]),
    ).toEqual(['bookmarkMetadataOnly', 'contentTruncated']);
  });

  it('reads AI and OCR source shapes through the same adapter', () => {
    const aiSource = {
      resourceType: 'note',
      coverage: { complete: true, status: 'ready', includedChars: 1240, warnings: [] },
    };
    const ocrSource = { type: 'file', fileType: 'application/pdf', status: 'completed' };
    expect(toolboxSourceType(aiSource)).toBe('note');
    expect(toolboxSourceIncludedChars(aiSource)).toBe(1240);
    expect(toolboxSourceState(aiSource)).toBe('complete');
    expect(toolboxSourceType(ocrSource)).toBe('file');
    expect(toolboxSourceState(ocrSource)).toBe('complete');
  });

  it('merges unreadable selected resources into the user-facing material ledger', () => {
    const records = toolboxArtifactSourceRecords(
      [
        {
          id: 'note:readable-note',
          resourceType: 'note',
          resourceId: 'readable-note',
          title: '可读笔记',
          coverage: { complete: true, includedChars: 120 },
        },
      ],
      {
        resources: [
          {
            type: 'note',
            id: 'readable-note',
            title: '可读笔记',
            status: 'ready',
            includedChars: 120,
            coverageComplete: true,
          },
          {
            type: 'file',
            id: 'private-file-id',
            title: '仍在解析的文件.pdf',
            status: 'parsing',
            includedChars: 0,
            warnings: ['file_parsing_in_progress'],
            coverageComplete: false,
          },
        ],
      },
    );

    expect(records).toHaveLength(2);
    expect(records[1]).toMatchObject({ resourceType: 'file', title: '仍在解析的文件.pdf' });
    expect(toolboxSourceState(records[1])).toBe('unavailable');
  });
});
