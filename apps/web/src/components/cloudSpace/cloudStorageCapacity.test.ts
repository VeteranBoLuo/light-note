import { describe, expect, it } from 'vitest';
import {
  getCloudStorageRemaining,
  getCloudStorageStatus,
  getCloudStorageUsageRatio,
  getLevelBaseCapacity,
  getNextLevelCapacityGain,
  getUploadStorageShortfall,
} from './cloudStorageCapacity';

describe('cloud storage capacity details', () => {
  it('uses quiet, filling, and low-space states at the agreed thresholds', () => {
    expect(getCloudStorageStatus(getCloudStorageUsageRatio(20.4, 100))).toBe('normal');
    expect(getCloudStorageStatus(getCloudStorageUsageRatio(75, 100))).toBe('filling');
    expect(getCloudStorageStatus(getCloudStorageUsageRatio(89.9, 100))).toBe('filling');
    expect(getCloudStorageStatus(getCloudStorageUsageRatio(90, 100))).toBe('low');
  });

  it('clamps invalid usage and remaining capacity instead of showing negative values', () => {
    expect(getCloudStorageUsageRatio(120, 100)).toBe(1);
    expect(getCloudStorageUsageRatio(10, 0)).toBe(0);
    expect(getCloudStorageRemaining(120, 100)).toBe(0);
    expect(getUploadStorageShortfall(12, 95, 100)).toBe(7);
    expect(getUploadStorageShortfall(4, 95, 100)).toBe(0);
  });

  it('separates permanent expansion from level capacity and calculates the next gain', () => {
    expect(getLevelBaseCapacity(24_832, 4_352)).toBe(20_480);
    expect(getNextLevelCapacityGain(16_896, 20_480)).toBe(3_584);
    expect(getNextLevelCapacityGain(20_480)).toBe(0);
  });
});
