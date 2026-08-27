import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const modalSource = source('src/view/admin/components/pointsOps/PointsGovernanceDailyDetailModal.vue');
const overviewSource = source('src/view/admin/components/pointsOps/PointsGovernanceOverview.vue');
const apiSource = source('src/api/growthApi.ts');

describe('daily points detail drill-down', () => {
  it('opens from a trend bar while keyboard focus only updates the exact-day summary', () => {
    expect(overviewSource).toContain('@click="openTrendDay(item.day)"');
    expect(overviewSource).toContain('@focus="selectTrendDay(item.day)"');
    expect(overviewSource).toContain('@keydown.enter="openTrendDay(item.day)"');
    expect(overviewSource).toContain('@keydown.space.prevent="openTrendDay(item.day)"');
    expect(overviewSource).toContain('<PointsGovernanceDailyDetailModal');
  });

  it('uses BTable virtualization and automatic cursor pagination without a load-more control', () => {
    expect(modalSource).toContain('<BTable');
    expect(modalSource).toMatch(/<BTable[\s\S]*?\bfill\b[\s\S]*?\bvirtual\b/);
    expect(modalSource).toContain(':has-more="canAutoLoad"');
    expect(modalSource).toContain('@load-more="loadNext"');
    expect(modalSource).toContain('limit: 50');
    expect(modalSource).not.toContain('pointsLogMore');
    expect(modalSource).not.toContain('load-more-button');
  });

  it('fails closed on stale or non-advancing pages and blocks automatic retry storms', () => {
    expect(modalSource).toContain('let requestSequence = 0');
    expect(modalSource).toContain('sequence !== requestSequence');
    expect(modalSource).toContain('responseCursor === requestedCursor');
    expect(modalSource).toContain("errorState.value = reset ? 'initial' : 'append'");
    expect(modalSource).toContain('paginationBlocked.value = !reset');
    expect(modalSource).toContain('hasMore.value && !paginationBlocked.value');
  });

  it('assigns one inner table scroll owner inside the fullscreen mobile modal', () => {
    expect(modalSource).toContain('content-class="points-daily-detail-modal__content"');
    expect(modalSource).toContain('fullscreen-mobile');
    expect(modalSource).toMatch(/\.points-daily-detail-modal__content\s*\{[\s\S]*?overflow:\s*hidden !important/);
    expect(modalSource).toMatch(/grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
  });

  it('declares the bounded daily-detail API and keeps the cursor in the request contract', () => {
    expect(apiSource).toContain("'/api/growth/admin/pointsGovernanceDailyDetails'");
    expect(apiSource).toContain('cursor?: string | null');
    expect(apiSource).toContain('PointsGovernanceDailyDetailsResponse');
  });
});
