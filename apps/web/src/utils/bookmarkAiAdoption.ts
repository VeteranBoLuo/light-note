import { recordAiSkillApplied, type AiSkillTelemetrySurface } from '@/api/aiTelemetry';

type Fields = { name?: string; description?: string; relatedTags?: string[] };

/** Ephemeral attribution only. Values stay in this form; telemetry sends no content. */
export function createBookmarkAiAdoption(surface: AiSkillTelemetrySurface) {
  const fields = new Map<'name' | 'description', { requestId: string; value: string }>();
  const tags = new Map<string, string>();
  const record = (requestId: string, adoptionKind: 'draft' | 'saved') => {
    void recordAiSkillApplied({
      skillId: 'bookmark.parse_url',
      requestId,
      adoptionKind,
      surface,
      resourceType: 'bookmark',
    });
  };
  return {
    filled(requestId: string, data: Fields, changed: ('name' | 'description')[], addedTags: string[]) {
      if (!requestId || (!changed.length && !addedTags.length)) return;
      for (const field of changed) fields.set(field, { requestId, value: String(data[field] || '').trim() });
      for (const tag of addedTags) tags.set(tag, requestId);
      record(requestId, 'draft');
    },
    saved(data: Fields) {
      const requests = new Set<string>();
      for (const [field, source] of fields) {
        if (source.value && String(data[field] || '').trim() === source.value) requests.add(source.requestId);
      }
      for (const tag of data.relatedTags || []) {
        const requestId = tags.get(tag);
        if (requestId) requests.add(requestId);
      }
      for (const requestId of requests) record(requestId, 'saved');
      fields.clear();
      tags.clear();
    },
    reset() {
      fields.clear();
      tags.clear();
    },
  };
}
