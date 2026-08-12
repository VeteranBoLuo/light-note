import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_NAME,
  PUBLIC_SECURITY_BADGE_PATH,
  PUBLIC_SECURITY_FILING_NUMBER,
  PUBLIC_SECURITY_QUERY_URL,
  WEBSITE_FILING_NAME,
  WEBSITE_ICP_NUMBER,
  hasPublicSecurityFiling,
} from './siteCompliance.ts';

const publicDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');
const readPublicFile = (path: string) => readFileSync(resolve(publicDirectory, path), 'utf8');

describe('站点备案名称展示', () => {
  it('保持产品品牌与网站备案全称分离', () => {
    expect(PRODUCT_NAME).toBe('轻笺');
    expect(WEBSITE_FILING_NAME).toBe('轻笺知识库');
    expect(WEBSITE_ICP_NUMBER).toBe('蜀ICP备2026017699号-1');
    expect(PUBLIC_SECURITY_FILING_NUMBER).toBe('川公网安备51200002001211号');
    expect(PUBLIC_SECURITY_QUERY_URL).toBe(
      'https://beian.mps.gov.cn/#/query/webSearch?code=51200002001211',
    );
    expect(PUBLIC_SECURITY_BADGE_PATH).toBe('/public-security-filing-badge.png');
    expect(hasPublicSecurityFiling).toBe(true);
  });

  it.each(['about.html', 'legal/privacy-policy.html', 'legal/user-agreement.html'])(
    '%s 建立备案全称与产品简称的公开对应关系',
    (path) => {
      const html = readPublicFile(path);
      expect(html).toContain(WEBSITE_FILING_NAME);
      expect(html).toContain(PRODUCT_NAME);
      expect(html).toContain(WEBSITE_ICP_NUMBER);
      expect(html).toContain(PUBLIC_SECURITY_FILING_NUMBER);
      expect(html).toContain(PUBLIC_SECURITY_QUERY_URL);
      expect(html).toContain(PUBLIC_SECURITY_BADGE_PATH);
    },
  );

  it('打包公安平台提供的官方备案徽标', () => {
    const badge = readFileSync(resolve(publicDirectory, PUBLIC_SECURITY_BADGE_PATH.replace(/^\//u, '')));
    expect(createHash('sha256').update(badge).digest('hex')).toBe(
      'a20583c81805fe64f7fa210851ce29754af9d25fd6aa5a3225a9557529602513',
    );
  });
});
