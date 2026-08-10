import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRODUCT_NAME, WEBSITE_FILING_NAME, WEBSITE_ICP_NUMBER, hasPublicSecurityFiling } from './siteCompliance.ts';

const publicDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');
const readPublicFile = (path: string) => readFileSync(resolve(publicDirectory, path), 'utf8');

describe('站点备案名称展示', () => {
  it('保持产品品牌与网站备案全称分离', () => {
    expect(PRODUCT_NAME).toBe('轻笺');
    expect(WEBSITE_FILING_NAME).toBe('轻笺知识库');
    expect(WEBSITE_ICP_NUMBER).toBe('蜀ICP备2026017699号-1');
    expect(hasPublicSecurityFiling).toBe(false);
  });

  it.each(['about.html', 'legal/privacy-policy.html', 'legal/user-agreement.html'])(
    '%s 建立备案全称与产品简称的公开对应关系',
    (path) => {
      const html = readPublicFile(path);
      expect(html).toContain(WEBSITE_FILING_NAME);
      expect(html).toContain(PRODUCT_NAME);
      expect(html).toContain(WEBSITE_ICP_NUMBER);
    },
  );
});
