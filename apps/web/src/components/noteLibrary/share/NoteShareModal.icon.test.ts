import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import icon from '@/config/icon';

const source = readFileSync(resolve(process.cwd(), 'src/components/noteLibrary/share/NoteShareModal.vue'), 'utf8');

describe('NoteShareModal 图标配置', () => {
  it('使用真实分享图标，不回退默认地球占位', () => {
    expect(source).toContain('<SvgIcon :src="icon.share" size="18" />');
    expect(icon.share).toContain('<svg');
    expect(icon.share).toContain('M13.5 4h5.25');
    expect(icon.share).not.toBe(icon.nullImg);
  });

  it('切换分享目标或重新打开时清空上一篇笔记的临时状态', () => {
    expect(source).toMatch(/function resetState\(\)[\s\S]*?stateVersion \+= 1;[\s\S]*?lastCreatedUrl\.value = ''/);
    expect(source).toMatch(/watch\(\s*visible,[\s\S]*?resetState\(\);[\s\S]*?if \(open\) void loadRecords\(\)/);
    expect(source).toMatch(
      /watch\(\s*\(\) => props\.note\.id,[\s\S]*?resetState\(\);[\s\S]*?if \(visible\.value\) void loadRecords\(\)/,
    );
    expect(source).toContain('version !== stateVersion || !visible.value || props.note.id !== noteId');
  });

  it('将访问次数和限制次数分开展示', () => {
    expect(source).toContain("t('noteShare.accessCount')");
    expect(source).toContain('{{ record.accessCount }}');
    expect(source).toContain("t('noteShare.limitCount')");
    expect(source).toContain("record.maxAccessCount ?? t('noteShare.unlimited')");
    expect(source).not.toContain("t('noteShare.visitMeta'");
  });
});
