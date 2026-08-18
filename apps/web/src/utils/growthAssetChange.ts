export interface GrowthAssetChange {
  type: 'ai' | 'storage';
  amount: number;
}

function compactNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function formatAiTokens(amount: number, locale: string) {
  if (locale.toLowerCase().startsWith('zh')) {
    return amount >= 10_000 ? `${compactNumber(amount / 10_000)} 万` : amount.toLocaleString('zh-CN');
  }
  if (amount >= 1_000_000) return `${compactNumber(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `${compactNumber(amount / 1_000)}K`;
  return amount.toLocaleString('en-US');
}

function formatStorageMb(amount: number) {
  return amount >= 1024 ? `${compactNumber(amount / 1024)}GB` : `${amount}MB`;
}

export function formatGrowthAssetChange(change: GrowthAssetChange, locale = 'zh-CN') {
  const amount = Math.max(0, Math.trunc(Number(change.amount) || 0));
  if (change.type === 'ai') return `+${formatAiTokens(amount, locale)} AI`;
  return `+${formatStorageMb(amount)}`;
}
