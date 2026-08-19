/**
 * Locales that live in their own file.
 *
 * The original seven (en, zh, es, fr, pt, de, ja) are still inline in
 * `messages.ts` and `blockMessages.ts`. Everything added since lives here, one
 * file per language, because a single catalog holding thirty languages is a
 * file nobody can review and every translator has to fight over.
 *
 * Adding a language:
 *   1. copy an existing file in this directory and translate it,
 *   2. add the import and the four table entries below,
 *   3. add its native name to `NATIVE_NAMES`,
 *   4. run `npm run test:i18n` and `npm run test:block-messages` — they fail
 *      until every key is present and every placeholder survives.
 *
 * Nothing here imports anything outside this directory, so `tsc` can compile
 * the catalogs on their own for the tests.
 */

import * as ar from './ar';
import * as hi from './hi';
import * as id from './id';
import * as it from './it';
import * as ko from './ko';
import * as nl from './nl';
import * as pl from './pl';
import * as ru from './ru';
import * as sv from './sv';
import * as tr from './tr';
import * as uk from './uk';
import * as vi from './vi';

type Table = Record<string, string>;

/** Locale code -> its four catalogs. */
const LOCALE_FILES: Record<string, { ui: Table; blocks: Table; categories: Table; dropdowns: Table }> = {
  ar,
  hi,
  id,
  it,
  ko,
  nl,
  pl,
  ru,
  sv,
  tr,
  uk,
  vi,
};

/** Codes contributed by this directory, in display order. */
export const EXTRA_LOCALES: string[] = Object.keys(LOCALE_FILES);

/** How each language names itself. Never the English name — a child looking
 *  for their language scans for the shape of their own script. */
export const NATIVE_NAMES: Record<string, string> = {
  ar: 'العربية',
  hi: 'हिन्दी',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ko: '한국어',
  nl: 'Nederlands',
  pl: 'Polski',
  ru: 'Русский',
  sv: 'Svenska',
  tr: 'Türkçe',
  uk: 'Українська',
  vi: 'Tiếng Việt',
};

function collect(key: 'ui' | 'blocks' | 'categories' | 'dropdowns'): Record<string, Table> {
  const out: Record<string, Table> = {};
  for (const [code, file] of Object.entries(LOCALE_FILES)) out[code] = file[key];
  return out;
}

export const EXTRA_UI = collect('ui');
export const EXTRA_BLOCKS = collect('blocks');
export const EXTRA_CATEGORIES = collect('categories');
export const EXTRA_DROPDOWNS = collect('dropdowns');
