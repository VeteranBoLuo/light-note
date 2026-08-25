import pool from '../../../db/index.js';
import { AI_TAG_SUGGESTION_CAP, suggestBookmarkMeta } from '../../aiOrganize.js';
import { requireBookmarkUrl } from '../../bookmarkUrl.js';
import { AI_SKILL_AUTHENTICATED_ROLES } from '../accessPolicy.js';
import { aiSkillError } from '../errors.js';
import { validateBookmarkParseInput } from '../inputValidators.js';

export default Object.freeze({
  id: 'bookmark.parse_url',
  version: 1,
  domain: 'bookmark',
  effect: 'preview',
  allowedRoles: AI_SKILL_AUTHENTICATED_ROLES,
  contextPolicy: Object.freeze({
    resourceTypes: Object.freeze([]),
    minResources: 0,
    maxResources: 0,
    allowConversation: false,
    historyTurns: 0,
    freezeScopeAcrossThread: true,
  }),
  modelPolicy: Object.freeze({ temperature: 0.1, maxTokens: 800 }),
  outputContract: Object.freeze({ kind: 'field_suggestions', requireSources: false }),
  validateInput: validateBookmarkParseInput,
  async prepare({ input, context, dependencies = {} }) {
    const resolution = requireBookmarkUrl(input.url, { allowTextExtraction: true });
    const database = dependencies.database || pool;
    const [tagRows] = await database.query('SELECT id, name FROM tag WHERE user_id = ? AND del_flag = 0', [
      context.identity.subjectUserId,
    ]);
    const userTags = Array.isArray(tagRows) ? tagRows : [];
    const suggest = dependencies.suggestBookmarkMeta || suggestBookmarkMeta;
    return {
      sources: [],
      coverage: { complete: true, warnings: [] },
      availableActions: [{ id: 'apply_bookmark_fields', label: '应用识别结果', requiresConfirmation: true }],
      async callModel({ trace }) {
        const result = await suggest({
          url: resolution.canonicalUrl,
          userTags,
          signal: dependencies.signal,
          trace,
        });
        if (!result) throw aiSkillError('AI_SKILL_BOOKMARK_PARSE_INVALID', 'AI 没有返回可用的书签信息', 502);
        const matchedTagIds = (result.matchedTagIds || []).map(String).slice(0, AI_TAG_SUGGESTION_CAP);
        const newTags = (result.newTags || [])
          .map(String)
          .slice(0, Math.max(0, AI_TAG_SUGGESTION_CAP - matchedTagIds.length));
        return Object.freeze({
          kind: 'field_suggestions',
          fields: Object.freeze({
            url: String(result.resolvedUrl || resolution.canonicalUrl),
            name: String(result.name || '').slice(0, 255),
            description: String(result.description || '').slice(0, 255),
            matchedTagIds: Object.freeze(matchedTagIds),
            newTags: Object.freeze(newTags),
          }),
          metadataSource: result.metadataSource || 'unknown',
          fetchReason: result.fetchReason || '',
          writeCommitted: false,
        });
      },
    };
  },
});
