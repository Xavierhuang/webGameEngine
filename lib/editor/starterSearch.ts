/**
 * Search over the starter pickers.
 *
 * Pure and dependency-free so it can be tested with bare `tsc` — no `@/`
 * imports here, the test scripts do not resolve the alias.
 *
 * Written because the pickers had no search at all. That was survivable at 39
 * starters, where a child can scan the grid; it stops being survivable around
 * a hundred, which is the direction the library is growing.
 *
 * Searching aliases matters more than it looks. A child does not think "Hero",
 * they think "good guy" or "player" — and those words are already written down
 * in each prefab's `aliases`, previously used only by the AI matcher.
 */

/** The subset of a prefab this module needs. Anything with these fields works. */
export interface SearchableItem {
  id: string;
  name: string;
  description?: string;
  aliases?: string[];
}

/** Lowercase, strip punctuation, collapse whitespace. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every word a given item can be found by. */
function haystack(item: SearchableItem): string {
  return normalize(
    [item.name, item.id, item.description ?? '', ...(item.aliases ?? [])].join(' ')
  );
}

/**
 * Does `item` match `query`?
 *
 * Every word in the query must appear, so "space dog" narrows rather than
 * widens — a child adding a word expects fewer results, not more. Matching is
 * on word prefixes so "dino" finds "Dinosaur", which is how anyone types when
 * they are guessing at a name.
 */
export function matchesStarter(item: SearchableItem, query: string): boolean {
  const q = normalize(query);
  if (q === '') return true;

  const words = haystack(item).split(' ');
  return q.split(' ').every((term) => words.some((w) => w.startsWith(term)));
}

/** Filter a list, preserving the curated order of the grid. */
export function filterStarters<T extends SearchableItem>(items: T[], query: string): T[] {
  if (normalize(query) === '') return items;
  return items.filter((item) => matchesStarter(item, query));
}
