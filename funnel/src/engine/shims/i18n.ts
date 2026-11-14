import { EXERCISES_EN } from '@app/shared/lib/i18n/catalogue/en/exercises';

/**
 * The app's catalogue, English only: the funnel speaks English, and the
 * exercise names and cues are read from the same file the app reads.
 */
export type Key = keyof typeof EXERCISES_EN;
export const LANGUAGES = ['en'] as const;
export const getLanguage = (): 'en' => 'en';

const TEXT: Readonly<Record<string, unknown>> = EXERCISES_EN;

export function translatorFor(_language: string) {
  return (key: string, params: Readonly<Record<string, string | number>> = {}): string => {
    const value = TEXT[key];
    const text =
      typeof value === 'string'
        ? value
        : value != null && typeof value === 'object'
          ? ((params.count === 1 ? (value as { one?: string }).one : (value as { other?: string }).other) ?? key)
          : key;
    return text.replace(/\{(\w+)\}/g, (whole, name: string) => (params[name] != null ? String(params[name]) : whole));
  };
}
