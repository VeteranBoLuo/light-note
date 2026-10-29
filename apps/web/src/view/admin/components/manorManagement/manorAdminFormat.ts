import { useI18n } from 'vue-i18n';
import { MANOR_SPECIES } from '@lightnote/shared/manor';

export function useManorAdminFormat() {
  const { t, te, locale } = useI18n();
  const a = (key: string, values: Record<string, unknown> = {}) => t(`manorAdmin.${key}`, values);
  const number = (value: unknown) => (value == null ? '—' : Number(value).toLocaleString(locale.value));
  const signed = (value: number) => (value > 0 ? `+${number(value)}` : value < 0 ? `−${number(-value)}` : '—');
  const time = (value?: string | null) => {
    if (!value) return '—';
    const date = new Date(/^\d{4}-\d\d-\d\d \d\d:/.test(value) ? value.replace(' ', 'T') + '+08:00' : value);
    return Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat(locale.value, {
          timeZone: 'Asia/Shanghai',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(date)
      : '—';
  };
  const action = (key: string | null) => (key && te(`manorAdmin.actions.${key}`) ? a(`actions.${key}`) : a('history'));
  const resource = (key: string) => {
    const [group, name] = key.split(':');
    if (!name) return te(`manorAdmin.${group}`) ? a(group) : group;
    if (group === 'fish') return String(MANOR_SPECIES[name]?.name || name);
    if (group === 'facility') return a(name);
    if (group === 'fertilizers') return a(`fertNames.${name}`);
    if (group === 'craftedBait') return a(`baitNames.${name}`);
    const crop = te(`manorAdmin.cropsNames.${name}`) ? a(`cropsNames.${name}`) : name;
    return `${crop} · ${a(group)}`;
  };
  return { a, number, signed, time, action, resource };
}
