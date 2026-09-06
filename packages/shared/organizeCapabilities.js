// New organizing runs share this applicability policy across the wizard and preflight.
// Existing suggestions remain readable and actionable independently of this policy.
const resourcesByCheck = Object.freeze({
  tags: ['bookmark', 'note', 'file'],
  title: ['note'],
  empty: ['note', 'file'],
  duplicate: ['bookmark', 'note', 'file'],
});

export function supportsOrganizeCheck(type, check) {
  return resourcesByCheck[check]?.includes(type) ?? false;
}

export function applicableOrganizeResources(resourceTypes, checks) {
  return resourceTypes.filter((type) => checks.some((check) => supportsOrganizeCheck(type, check)));
}
