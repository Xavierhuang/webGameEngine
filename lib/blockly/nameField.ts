'use client';

import * as Blockly from 'blockly';

/**
 * A dropdown of names that already exist in the workspace, with a "New…" option.
 *
 * Variable, list, broadcast and object names were plain text inputs. A typo
 * silently created a *different* variable — and unset variables read as 0
 * (Scratch behaviour) — so `scrore` quietly reads 0 forever with no error
 * anywhere. That is the single most common way a kid's project breaks.
 *
 * Registered as the JSON field type `field_lingplay_name`, so lib/blockly/
 * definitions.ts stays pure data with no Blockly import.
 */

export type NameKind = 'variable' | 'list' | 'broadcast' | 'object';

const NEW_SENTINEL = '__lingplay_new__';

/**
 * Object names come from the project, not the workspace, so the editor pushes
 * them in. Module-level because Blockly fields are constructed by the JSON
 * registry with no route to pass React state through.
 */
let knownObjectNames: string[] = [];

export function setKnownObjectNames(names: string[]) {
  knownObjectNames = Array.from(new Set(names.filter((n) => n && n.trim() !== '')));
}

/** Which (blockType, fieldName) pairs hold each kind of name. */
const FIELD_KINDS: Record<NameKind, Array<[blockType: string, fieldName: string]>> = {
  variable: [
    ['set_variable', 'name'],
    ['change_variable', 'name'],
    ['show_variable', 'name'],
    ['hide_variable', 'name'],
    ['expr_var', 'value'],
    ['ask_ai', 'into_var'],
    ['ai_decide', 'into_var'],
  ],
  list: [
    ['add_to_list', 'name'],
    ['delete_from_list', 'name'],
    ['insert_into_list', 'name'],
    ['replace_in_list', 'name'],
    ['delete_all_of_list', 'name'],
    ['show_list', 'name'],
    ['hide_list', 'name'],
    ['expr_list_item', 'value'],
    ['expr_list_length', 'value'],
    ['expr_list_contains', 'value'],
    ['expr_list_index_of', 'value'],
  ],
  broadcast: [
    ['broadcast', 'message'],
    ['broadcast_and_wait', 'message'],
    ['when_receive', 'message'],
  ],
  object: [
    ['goto_object', 'target'],
    ['point_towards', 'target'],
    ['create_clone_of', 'target'],
    ['when_touches', 'target'],
    ['expr_touching', 'value'],
    ['expr_distance_to', 'value'],
    ['expr_object_x', 'value'],
    ['expr_object_y', 'value'],
    ['expr_object_z', 'value'],
    ['expr_object_rotation_x', 'value'],
    ['expr_object_rotation_y', 'value'],
    ['expr_object_rotation_z', 'value'],
  ],
};

/** Every name of this kind currently used anywhere in the workspace. */
function namesInWorkspace(workspace: Blockly.Workspace | null, kind: NameKind): string[] {
  if (!workspace) return [];
  const found = new Set<string>();
  for (const [blockType, fieldName] of FIELD_KINDS[kind]) {
    for (const block of workspace.getBlocksByType(blockType, false)) {
      const value = block.getFieldValue(fieldName);
      if (typeof value === 'string' && value.trim() !== '') found.add(value);
    }
  }
  return Array.from(found).sort((a, b) => a.localeCompare(b));
}

export class LingplayNameField extends Blockly.FieldDropdown {
  private kind: NameKind = 'variable';

  constructor(value?: string, kind: NameKind = 'variable') {
    // The generator runs lazily each time the menu opens, so it always reflects
    // the current workspace. It also runs once during construction, before
    // `this.kind` is assigned — hence the safe fallback inside.
    super(function (this: Blockly.FieldDropdown) {
      const self = this as LingplayNameField;
      return self.buildOptions();
    } as any);

    this.kind = kind;
    if (typeof value === 'string' && value !== '') {
      this.setValue(value);
    }
  }

  static fromJson(options: any): LingplayNameField {
    const kind: NameKind = FIELD_KINDS[options?.kind as NameKind] ? options.kind : 'variable';
    return new LingplayNameField(options?.text ?? options?.value ?? '', kind);
  }

  private buildOptions(): Blockly.MenuOption[] {
    const kind = this.kind ?? 'variable';
    const current = String(this.getValue() ?? '');

    const names =
      kind === 'object'
        ? Array.from(new Set([...knownObjectNames, ...namesInWorkspace(this.getSourceBlock()?.workspace ?? null, kind)]))
        : namesInWorkspace(this.getSourceBlock()?.workspace ?? null, kind);

    // The current value MUST be present, or FieldDropdown rejects it — that
    // would silently rewrite existing saved projects on load.
    if (current !== '' && !names.includes(current)) names.unshift(current);
    if (names.length === 0) names.push(current || defaultFor(kind));

    const options: Blockly.MenuOption[] = names
      .sort((a, b) => a.localeCompare(b))
      .map((name) => [name, name]);

    options.push([newLabelFor(kind), NEW_SENTINEL]);
    return options;
  }

  /**
   * Accept ANY name, not just ones currently in the option list.
   *
   * FieldDropdown's default validation rejects values it doesn't recognise and
   * falls back to the first option — which on load would silently rewrite every
   * variable name in a saved project that isn't referenced by a second block.
   * Here the dropdown is a convenience for picking existing names, never a
   * constraint on what a name may be, so membership is deliberately not checked.
   */
  protected override doClassValidation_(newValue?: any): any {
    if (newValue === NEW_SENTINEL) {
      const kind = this.kind ?? 'variable';
      // Deferred: returning null cancels this edit, then we apply the typed name.
      setTimeout(() => {
        Blockly.dialog.prompt(promptFor(kind), '', (typed) => {
          const name = (typed ?? '').trim();
          if (name === '' || name === NEW_SENTINEL) return;
          this.setValue(name);
        });
      }, 0);
      return null;
    }
    if (typeof newValue !== 'string') return null;
    return newValue;
  }

  /**
   * FieldDropdown labels itself from its matched option; since we accept values
   * that may not be in the list, the displayed text is simply the value.
   */
  protected override getText_(): string {
    return String(this.getValue() ?? '');
  }
}

function defaultFor(kind: NameKind): string {
  switch (kind) {
    case 'list': return 'my list';
    case 'broadcast': return 'message1';
    case 'object': return '';
    default: return 'score';
  }
}

function newLabelFor(kind: NameKind): string {
  switch (kind) {
    case 'list': return 'New list…';
    case 'broadcast': return 'New message…';
    case 'object': return 'Type a name…';
    default: return 'New variable…';
  }
}

function promptFor(kind: NameKind): string {
  switch (kind) {
    case 'list': return 'New list name:';
    case 'broadcast': return 'New message name:';
    case 'object': return 'Object name:';
    default: return 'New variable name:';
  }
}

let registered = false;

/** Register the field type. Must run before defineBlocksWithJsonArray. */
export function registerNameField() {
  if (registered) return;
  Blockly.fieldRegistry.register('field_lingplay_name', LingplayNameField as any);
  registered = true;
}
