// Deployment switch and audience are separate: narrowing the audience keeps
// internal accounts testing, while KNOWLEDGE_MANOR_ENABLED still closes everyone.
const AUDIENCE_ROLES = Object.freeze({
  internal: Object.freeze(['root', 'test']),
  all: Object.freeze(['root', 'user', 'test']),
});

export const knowledgeManorEnabled = () => process.env.KNOWLEDGE_MANOR_ENABLED === 'true';

/** Unknown values fall back to internal accounts, never to a wider audience. */
export function manorAudience() {
  return process.env.KNOWLEDGE_MANOR_AUDIENCE === 'all' ? 'all' : 'internal';
}

export const canEnterManor = role => AUDIENCE_ROLES[manorAudience()].includes(role);
