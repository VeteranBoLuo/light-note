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
});
