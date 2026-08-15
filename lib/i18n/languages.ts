/**
 * Languages the `translate` block offers.
 *
 * Separate from lib/i18n/messages.ts: that lists the locales the *interface* is
 * translated into, which is a much smaller set. A child can translate text into
 * a language the UI itself doesn't speak.
 *
 * Pure data with no imports, so the Blockly definitions can use it without
 * dragging anything else in.
 */
export const TRANSLATE_LANGUAGES: Record<string, string> = {
  en: 'English', zh: 'Chinese', es: 'Spanish', fr: 'French',
  pt: 'Portuguese', de: 'German', ja: 'Japanese', ko: 'Korean',
  it: 'Italian', nl: 'Dutch', pl: 'Polish', ru: 'Russian',
  ar: 'Arabic', hi: 'Hindi', tr: 'Turkish', sv: 'Swedish',
};

/** Full names for the model prompt; the dropdown shows these too. */
export const TRANSLATE_PROMPT_NAMES: Record<string, string> = {
  ...TRANSLATE_LANGUAGES,
  zh: 'Chinese (Simplified)',
};

export function languageOptions(): [string, string][] {
  return Object.entries(TRANSLATE_LANGUAGES).map(([code, name]) => [name, code]);
}

export function isSupportedLanguage(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(TRANSLATE_LANGUAGES, code);
}
