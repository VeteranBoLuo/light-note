export type CloudStorageStatus = 'normal' | 'filling' | 'low';

export function getCloudStorageUsageRatio(usedMb: number, maxMb: number) {
  const used = Math.max(0, Number(usedMb) || 0);
  const max = Math.max(0, Number(maxMb) || 0);
  if (max <= 0) return 0;
  return Math.min(1, used / max);
}

export function getCloudStorageStatus(usageRatio: number): CloudStorageStatus {
  const ratio = Math.max(0, Number(usageRatio) || 0);
  if (ratio >= 0.9) return 'low';
  if (ratio >= 0.75) return 'filling';
  return 'normal';
}

export function getCloudStorageRemaining(usedMb: number, maxMb: number) {
  return Math.max(0, (Number(maxMb) || 0) - (Number(usedMb) || 0));
}

export function getLevelBaseCapacity(totalMb: number, bonusMb: number) {
  return Math.max(0, (Number(totalMb) || 0) - (Number(bonusMb) || 0));
}

export function getNextLevelCapacityGain(currentBaseMb: number, nextBaseMb?: number) {
  return Math.max(0, (Number(nextBaseMb) || 0) - (Number(currentBaseMb) || 0));
}

export function getUploadStorageShortfall(incomingMb: number, usedMb: number, maxMb: number) {
  return Math.max(0, (Number(incomingMb) || 0) - getCloudStorageRemaining(usedMb, maxMb));
}
