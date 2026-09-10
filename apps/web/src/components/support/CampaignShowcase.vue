<template>
  <section
    class="campaign-showcase commerce-surface"
    :class="{ 'is-mobile': bookmark.isMobile, 'is-compact': !bookmark.isDesktop, 'is-dense': bookmark.isCompactLayout }"
  >
    <div class="commerce-landscape commerce-landscape--campaign" aria-hidden="true"
      ><img src="/brand-scenes/campaign-hd-footer.webp" alt="" loading="lazy" decoding="async"
    /></div>
    <BrandSceneHero
      scene="campaign"
      :title="presentation?.title || t('autumn.reference.campaignTitle')"
      :description="presentation?.description || t('autumn.description')"
      :eyebrow="t('autumn.entry')"
    >
      <BChip :tone="draft ? 'neutral' : 'pending'">{{
        draft ? t('autumn.draft') : t(`autumn.${presentation?.lifecycle || 'upcoming'}`)
      }}</BChip>
      <div class="campaign-date"
        ><strong>{{ t('autumn.dates') }}</strong
        ><span>{{ presentation ? dateLabel : t('autumn.reference.datePending') }}</span></div
      >
      <BButton
        v-if="draft || presentation?.checkoutEnabled"
        type="primary"
        @click="offers?.scrollIntoView({ behavior: 'smooth' })"
        >{{ t(draft ? 'autumn.reference.viewOffers' : 'autumn.purchase') }}</BButton
      >
    </BrandSceneHero>
    <div class="campaign-body">
      <p v-if="draft" class="campaign-preview-note">{{ t('autumn.adminDateHint') }}</p>
      <div ref="offers" class="campaign-offers">
        <section class="campaign-catalog scene-panel"
          ><div class="campaign-section-heading"
            ><h2>{{ t('autumn.reference.offers') }}</h2
            ><p>{{ t('autumn.reference.offersHint') }}</p></div
          ><div class="campaign-grid">
            <template v-if="!presentation?.packages?.length && draft">
              <BCard v-for="i in 4" :key="i" padding="14px" radius="14px" class="campaign-draft-card">
                <span class="campaign-draft-card__ornament"
                  ><SvgIcon
                    :src="[icon.support.autumn, icon.growth.reward, icon.growth.ai, icon.todoWorkspace.star][i - 1]"
                    size="38"
                    aria-hidden="true"
                /></span>
                <h2>{{ t(`autumn.tier${i}`) }}</h2
                ><strong>{{ t('autumn.reference.draftPrice') }}</strong
                ><p>{{ t('autumn.reference.draftBenefits') }}</p
                ><BButton disabled type="primary">{{ t('autumn.draft') }}</BButton>
              </BCard>
            </template>
            <EntitlementPackageCard
              v-for="item in presentation?.packages || []"
              :key="item.campaignSkuId"
              :item="item"
              :action-label="
                draft
                  ? t('autumn.draft')
                  : item.limitReached
                    ? t('entitlementStore.limitReached')
                    : item.hasActiveCheckout
                      ? t('entitlementStore.checkoutPending')
                      : presentation?.checkoutEnabled
                        ? t('autumn.purchase')
                        : t(`autumn.${presentation?.lifecycle || 'upcoming'}`)
              "
              :disabled="draft || !presentation?.checkoutEnabled || item.limitReached || item.hasActiveCheckout"
              @select="emit('select', item)"
            />
          </div> </section
        ><BCard as="aside" class="campaign-rules" padding="18px" radius="14px"
          ><SvgIcon :src="icon.growth.reward" size="28" aria-hidden="true" /><h2>{{ t('autumn.rulesTitle') }}</h2
          ><img class="campaign-rules__gift" src="/brand-scenes/gift-object.webp" alt="" loading="lazy" /><p>{{
            t('autumn.rules')
          }}</p>
          <ul
            ><li>{{ t('autumn.reference.campaignRule1') }}</li
            ><li>{{ t('autumn.reference.campaignRule2') }}</li
            ><li>{{ t('autumn.reference.campaignRule3') }}</li></ul
          ><p v-if="presentation"
            >{{ t('autumn.dates') }}<br />{{ formatDate(presentation.startsAt) }} —
            {{ formatDate(presentation.endsAt) }}</p
          ></BCard
        >
      </div>
      <div class="campaign-lower">
        <AiQuotaValueSection />
        <section class="scene-panel campaign-scenarios"
          ><h2>{{ t('autumn.reference.scenarios') }}</h2
          ><p>{{ t('autumn.usageDescription') }}</p
          ><div class="campaign-scenarios__grid"
            ><div
              v-for="(glyph, i) in [icon.resource.note, icon.resource.bookmark, icon.growth.ai, icon.growth.storage]"
              :key="i"
              ><SvgIcon :src="glyph" size="26" /><strong>{{ t(`autumn.reference.scenario${i + 1}`) }}</strong
              ><small>{{ t(`autumn.reference.scenarioHint${i + 1}`) }}</small></div
            ></div
          ></section
        >
        <section class="scene-panel campaign-faq"
          ><h2>{{ t('autumn.reference.faq') }}</h2
          ><div
            class="campaign-faq__item"
            v-for="(question, i) in ['duration', 'eligibility', 'delivery']"
            :key="question"
            ><h3
              ><span>Q{{ i + 1 }}</span
              >{{ t(`autumn.reference.${question}`) }}</h3
            ><p>{{ t(i === 0 ? 'autumn.faqDescription' : i === 1 ? 'autumn.rules' : 'autumn.paymentHint') }}</p></div
          ></section
        >
        <section class="scene-panel campaign-closing"
          ><div
            ><h2>{{ t('autumn.reference.closing') }}</h2
            ><p>{{ t('autumn.comboDescription') }}</p
            ><slot name="closing" /></div
          ><img src="/brand-scenes/autumn-vista.webp" alt="" loading="lazy"
        /></section>
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
  import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
  import { useI18n } from 'vue-i18n';
  import { bookmarkStore } from '@/store';
  import type { CampaignPresentation, SupportCampaignPackage } from '@/api/supportApi';
  import BrandSceneHero from './BrandSceneHero.vue';
  import AiQuotaValueSection from './AiQuotaValueSection.vue';
  import EntitlementPackageCard from '@/view/entitlementStore/EntitlementPackageCard.vue';
  import BButton from '@/components/base/BasicComponents/BButton.vue';
  import BChip from '@/components/base/BasicComponents/BChip.vue';
  import BCard from '@/components/base/BasicComponents/BCard.vue';
  import SvgIcon from '@/components/base/SvgIcon/src/SvgIcon.vue';
  import icon from '@/config/icon';
  const props = defineProps<{ presentation?: CampaignPresentation | null; draft?: boolean }>();
  const emit = defineEmits<{ select: [item: SupportCampaignPackage] }>();
  const bookmark = bookmarkStore();
  const { t, locale } = useI18n();
  const offers = ref<HTMLElement>();
  const tick = ref(Date.now());
  const calibration = computed(() => ({
    client: Date.now(),
    server: new Date(props.presentation?.serverNow || Date.now()).getTime(),
  }));
  function formatDate(value: string) {
    return new Date(value).toLocaleString(locale.value, {
      timeZone: 'Asia/Shanghai',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  const dateLabel = computed(() => {
    const p = props.presentation;
    if (!p) return '';
    if (p.lifecycle === 'upcoming') return t('autumn.starts', { time: formatDate(p.startsAt) });
    if (p.lifecycle !== 'active') return '';
    const remaining = Math.max(
      0,
      new Date(p.endsAt).getTime() - calibration.value.server - (tick.value - calibration.value.client),
    );
    return t('autumn.countdown', {
      days: Math.floor(remaining / 86400000),
      hours: Math.floor(remaining / 3600000) % 24,
    });
  });
  let timer: ReturnType<typeof setInterval>;
  onMounted(() => {
    timer = setInterval(() => {
      if (!document.hidden) tick.value = Date.now();
    }, 30000);
  });
  onBeforeUnmount(() => clearInterval(timer));
</script>
<style scoped>
  .campaign-showcase {
    position: relative;
    isolation: isolate;
    color: var(--text-color);
    background: var(--background-color);
  }
  .campaign-body {
    width: 88%;
    max-width: 1480px;
    margin: auto;
    padding-bottom: 25px;
  }
  .campaign-offers {
    display: grid;
    grid-template-columns: minmax(0, 4fr) minmax(210px, 1fr);
    gap: 12px;
  }
  .campaign-section-heading {
    margin-bottom: 16px;
  }
  .campaign-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .campaign-draft-card {
    position: relative;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 200px;
  }
  .campaign-draft-card > .svg-icon {
    color: var(--primary-color);
  }
  h2 {
    font:
      700 21px/1.4 'Songti SC',
      serif;
    margin: 0 0 6px;
    white-space: pre-line;
  }
  p {
    font-size: 14px;
    line-height: 1.65;
    color: var(--desc-color);
    margin: 5px 0;
  }
  .campaign-draft-card h2 {
    font-size: 16px;
  }
  .campaign-draft-card strong {
    font-size: 20px;
  }
  .campaign-draft-card p {
    font-size: 13px;
  }
  .campaign-lower {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin-top: 12px;
  }
  .campaign-lower :deep(.quota-value) {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .campaign-lower :deep(.quota-value__note) {
    display: none;
  }
  .campaign-lower :deep(.quota-value h2) {
    font-size: 21px;
  }
  .campaign-date {
    padding: 10px 16px;
    display: grid;
    gap: 4px;
    border: 1px solid var(--surface-border-color);
    border-radius: 12px;
    background: var(--card-background);
  }
  .campaign-date strong {
    font-size: 12px;
  }
  .campaign-draft-card > .b_btn {
    width: 100%;
    margin-top: auto;
  }
  .campaign-date,
  .campaign-preview-note {
    font-size: 12px;
  }
  .campaign-preview-note {
    margin: 0;
    padding: 8px 0;
  }
  .campaign-scenarios__grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 9px;
    margin-top: 18px;
  }
  .campaign-scenarios__grid > div {
    padding: 15px 8px;
    display: grid;
    justify-items: center;
    gap: 12px;
    border: 1px solid var(--surface-border-color);
    border-radius: 10px;
    background: var(--primary-color-light);
    text-align: center;
    font-size: 14px;
  }
  .campaign-scenarios__grid .svg-icon {
    color: var(--primary-color);
  }
  .campaign-faq h3 {
    font-size: 14px;
    margin: 14px 0 4px;
  }
  .campaign-faq h3 span {
    color: var(--primary-color);
    margin-right: 8px;
  }
  .campaign-faq p {
    font-size: 12px;
  }
  .campaign-closing {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    min-height: 210px;
  }
  .campaign-closing > div {
    position: relative;
    z-index: 1;
    max-width: 80%;
  }
  .campaign-closing h2 {
    font-size: 29px;
  }
  .campaign-closing img {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 55%;
    height: 100%;
    object-fit: cover;
    opacity: 0.4;
  }
  .campaign-draft-card__ornament {
    position: absolute;
    top: 22px;
    right: 14px;
    color: var(--primary-color);
    transform: rotate(-12deg);
    opacity: 0.35;
  }
  .campaign-rules {
    position: relative;
  }
  .campaign-rules__gift {
    float: right;
    width: 62px;
    height: 62px;
    object-fit: contain;
  }
  .campaign-rules ul {
    clear: both;
    padding-left: 18px;
    color: var(--desc-color);
    font-size: 12px;
    line-height: 1.8;
  }
  .campaign-scenarios__grid small {
    font-size: 12px;
    line-height: 1.6;
    color: var(--desc-color);
  }
  .campaign-faq {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 18px;
  }
  .campaign-faq > h2 {
    grid-column: 1 / -1;
  }
  .is-mobile .campaign-faq {
    grid-template-columns: 1fr;
  }
  .is-dense .campaign-body {
    width: 94%;
  }
  .is-compact .campaign-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .is-mobile .campaign-body {
    width: calc(100% - 24px);
  }
  .is-mobile .campaign-offers,
  .is-mobile .campaign-lower {
    grid-template-columns: 1fr;
  }
  .is-mobile .campaign-grid {
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 165px), 1fr));
  }
  .is-mobile .campaign-scenarios__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
</style>
