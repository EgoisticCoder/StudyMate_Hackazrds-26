export const SUPPORTED_LANGUAGES = [
  'English', 'Hindi', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Urdu',
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export function isValidLanguage(value: string | null | undefined): value is SupportedLanguage {
  return !!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}
