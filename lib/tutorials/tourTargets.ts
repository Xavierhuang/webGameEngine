/**
 * Places a tutorial step can point at.
 *
 * Steps used to carry `hint: 'Toolbar, top left'` — a sentence telling an
 * 8-12 year old where to look. Telling a child to look somewhere is not the
 * same as showing them, and it's the part of a tutorial they're least equipped
 * to do. These identifiers are attached to real elements with
 * `data-tour-target`, so the panel can highlight the thing it's talking about.
 *
 * Add a case here, tag the element, and the step can point at it. A target with
 * no matching element on screen simply doesn't highlight — the step still
 * reads, so a missing tag degrades quietly rather than breaking the tutorial.
 */
export type TourTarget =
  | 'toolbar'
  | 'blockPalette'
  | 'blockCanvas'
  | 'scene'
  | 'propertiesPanel'
  | 'sceneLogicTabs'
  | 'playButton'
  | 'shareButton'
  | 'saveButton'
  | 'tutorialsButton'
  | 'exploreNav';

/**
 * Block-palette categories are one target with a variant, rather than eleven
 * near-identical cases: the palette is a single element and the category is a
 * child inside it.
 */
export interface TourAnchorQuery {
  target: TourTarget;
  /** Lower-case category id, e.g. "motion" — only meaningful for `blockPalette`. */
  category?: string;
}

/** The `data-tour-target` value to put on an element. */
export function tourTargetAttr(target: TourTarget): Record<string, string> {
  return { 'data-tour-target': target };
}

/**
 * Finds the element a step points at. Category lookups fall back to the palette
 * itself when the category isn't rendered (a collapsed or filtered palette), so
 * the child still gets pointed at the right region instead of nothing.
 */
export function findTourElement(query: TourAnchorQuery | undefined): HTMLElement | null {
  if (typeof document === 'undefined' || !query) return null;
  const { target, category } = query;

  if (target === 'blockPalette') {
    return findPaletteElement(category);
  }
  return document.querySelector<HTMLElement>(`[data-tour-target="${CSS.escape(target)}"]`);
}

/**
 * The palette is Blockly's own toolbox, built outside React, so it can't carry
 * a `data-tour-target` the way our components do — these class names are
 * Blockly's and are the coupling point. If a Blockly upgrade renames them the
 * lookup returns null and the step stops highlighting; it does not break.
 *
 * Categories are matched on their visible label because that is the only stable
 * handle Blockly exposes, and it's also exactly what the child is reading.
 */
function findPaletteElement(category?: string): HTMLElement | null {
  const toolbox = document.querySelector<HTMLElement>('.blocklyToolboxDiv');
  if (!toolbox || !category) return toolbox;

  const wanted = category.trim().toLowerCase();
  const rows = Array.from(toolbox.querySelectorAll<HTMLElement>('.blocklyTreeRow, .blocklyToolboxCategory'));
  const match = rows.find((row) => (row.textContent ?? '').trim().toLowerCase().startsWith(wanted));
  // Falling back to the whole toolbox still points at the right region when a
  // category is scrolled out of view or renamed in translation.
  return match ?? toolbox;
}
