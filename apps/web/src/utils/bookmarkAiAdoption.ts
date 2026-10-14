import { recordAiSkillApplied, type AiSkillTelemetrySurface } from '@/api/aiTelemetry';
import { createBookmarkAiAttribution } from './bookmarkAiAttribution';

export function createBookmarkAiAdoption(surface: AiSkillTelemetrySurface) {
  return createBookmarkAiAttribution((requestId, adoptionKind) =>
    recordAiSkillApplied({ skillId: 'bookmark.parse_url', requestId, adoptionKind, surface, resourceType: 'bookmark' }),
  );
}
