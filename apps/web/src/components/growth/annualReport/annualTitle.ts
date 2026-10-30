import { formatAnnualDate, type AnnualReport } from '@/utils/annualReport';

type Translate = (key: string, values?: Record<string, unknown>) => string;

/** 年度称号：服务端只给规则键，文案在这里按语言拼出，海报与测试共用。 */
export function annualTitleText(report: AnnualReport, t: Translate) {
  const title = report.title;
  if (!title || title.key === 'starter' || !title.noun) return t('annualReport.titles.starter');
  const noun = t(`annualReport.titles.nouns.${title.noun}`);
  if (!title.modifier) return noun;
  return t('annualReport.titles.combined', {
    modifier: t(`annualReport.titles.modifiers.${title.modifier}`),
    noun,
  });
}

export function annualTitleSub(report: AnnualReport, t: Translate, locale: string) {
  const title = report.title;
  if (!title || title.key === 'starter' || !title.noun) {
    const joined = report.profile?.joinedDay;
    if (joined && report.start && joined >= report.start) {
      return t('annualReport.titles.basis.starterJoined', { date: formatAnnualDate(joined, locale) });
    }
    return t('annualReport.titles.basis.starter', { n: report.overview?.total || 0 });
  }
  if (title.modifier) return t(`annualReport.titles.basis.${title.modifier}`, { n: title.basis ?? 0 });
  return t('annualReport.titles.basis.plain', { type: t(`annualReport.types.${title.noun}`), n: title.basis ?? 0 });
}
