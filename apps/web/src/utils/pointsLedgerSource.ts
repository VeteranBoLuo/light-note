interface LedgerSource {
  reason: string;
  sourceType?: string;
  sourceKey?: string | null;
  sourceName?: { zh?: string; en?: string } | null;
  meta?: { required?: number; challengeKey?: string; achievementKey?: string } | null;
}

/** User-facing explanation only; never render raw ledger references or audit metadata. */
export function describeLedgerSource(
  row: LedgerSource,
  t: (key: string, values?: Record<string, number>) => string,
  te: (key: string) => boolean,
  locale: string,
) {
  const type = row.sourceType || (row.reason.startsWith('storage:') ? 'storage' : row.reason);
  const translated = (key: string) => (te(key) ? t(key) : '');
  const key = row.sourceKey || '';
  let detail = '';
  if (type === 'campaign' && row.sourceName) {
    detail = locale.startsWith('zh')
      ? row.sourceName.zh || row.sourceName.en || ''
      : row.sourceName.en || row.sourceName.zh || '';
  } else if (type === 'weekly') {
    detail = translated(`growth.weeklyName.${row.meta?.challengeKey || key}`);
  } else if (type === 'achievement') {
    detail = translated(`growth.achName.${row.meta?.achievementKey || key}`);
  } else if (type === 'quest' && Number.isInteger(row.meta?.required) && Number(row.meta?.required) > 0) {
    detail = t('settingsRefine.ledger.questStage', { n: Number(row.meta?.required) });
  } else if (type === 'buy') {
    detail = translated(`growth.shopItems.${key}.name`);
  }
  detail ||= translated(`growth.pointsSource.${key}`) || translated(`growth.pointsSourceType.${type}`);
  return detail === translated(`growth.pointsReason.${type}`) ? '' : detail;
}
