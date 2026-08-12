import { SITE_COMPLIANCE } from '@lightnote/shared';

/** 产品品牌名称；不得替换为网站备案全称。 */
export const PRODUCT_NAME = SITE_COMPLIANCE.productName;

/** 工信部网站备案中的互联网信息服务名称。 */
export const WEBSITE_FILING_NAME = SITE_COMPLIANCE.websiteFilingName;

/** 网站 ICP 备案号。 */
export const WEBSITE_ICP_NUMBER = SITE_COMPLIANCE.websiteIcpNumber;

/** 工信部备案查询入口。 */
export const MIIT_QUERY_URL = SITE_COMPLIANCE.miitQueryUrl;

/** 网站公安联网备案；不得作为 APP 公安备案号展示。 */
export const PUBLIC_SECURITY_FILING_NUMBER = SITE_COMPLIANCE.publicSecurityFilingNumber;
export const PUBLIC_SECURITY_QUERY_URL = SITE_COMPLIANCE.publicSecurityQueryUrl;
export const PUBLIC_SECURITY_BADGE_PATH = SITE_COMPLIANCE.publicSecurityBadgePath;

export const hasPublicSecurityFiling = Boolean(
  PUBLIC_SECURITY_FILING_NUMBER && PUBLIC_SECURITY_QUERY_URL && PUBLIC_SECURITY_BADGE_PATH,
);
