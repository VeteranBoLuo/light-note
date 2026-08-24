import { computed, onMounted, ref, toValue, type MaybeRefOrGetter } from 'vue';
import { getAiSkillsConfig, type AiProductFeatureState } from '@/api/aiSkillApi';

const CACHE_TTL_MS = 60_000;
let cachedState: AiProductFeatureState | null = null;
let cachedAt = 0;
let pending: Promise<AiProductFeatureState | null> | null = null;

function skillDomain(skillId: string) {
  return String(skillId || '').split('.')[0] || '';
}

async function loadFeatureState() {
  if (cachedState && Date.now() - cachedAt < CACHE_TTL_MS) return cachedState;
  if (pending) return pending;
  pending = getAiSkillsConfig()
    .then((state) => {
      cachedState = state;
      cachedAt = Date.now();
      return state;
    })
    .catch(() => {
      cachedState = null;
      cachedAt = 0;
      return null;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function useAiSkillAvailability(skillId: MaybeRefOrGetter<string>) {
  const state = ref<AiProductFeatureState | null>(cachedState);
  const loading = ref(!cachedState);
  const available = computed(() => {
    if (!state.value) return true;
    const id = String(toValue(skillId) || '');
    const domain = skillDomain(id);
    return Boolean(
      state.value.kernelEnabled &&
      state.value.skills[domain] === true &&
      state.value.availableSkills.some((skill) => skill.id === id),
    );
  });

  onMounted(async () => {
    loading.value = true;
    const loaded = await loadFeatureState();
    state.value = loaded;
    loading.value = false;
  });

  return { available, loading };
}

export function resetAiSkillAvailabilityCacheForTest() {
  cachedState = null;
  cachedAt = 0;
  pending = null;
}

export const aiSkillAvailabilityInternals = Object.freeze({ skillDomain, CACHE_TTL_MS, loadFeatureState });
