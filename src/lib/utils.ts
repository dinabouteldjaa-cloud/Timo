import type { Strings } from '../i18n/en';
import type { Locale } from '../i18n/LocaleContext';

export function getGreetingKey(date: Date = new Date()): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
  const hour = date.getHours();
  if (hour < 12) return 'greetingMorning';
  if (hour < 18) return 'greetingAfternoon';
  return 'greetingEvening';
}

export function formatFriendlyDate(locale: Locale, date: Date = new Date()) {
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export function formatDuration(minutes: number, t: Strings) {
  if (minutes < 60) return `${minutes} ${t.common.minutes}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h${rest}`;
}
