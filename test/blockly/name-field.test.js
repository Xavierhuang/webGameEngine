/**
 * Headless checks for the variable/list/broadcast/object name picker.
 *
 * These fields replaced free-text inputs, where a typo silently created a
 * different variable that reads as 0. The risk of the replacement is the
 * opposite failure: a FieldDropdown rejects any value not in its option list,
 * which would silently rewrite names in existing saved projects on load. That
 * is what most of these assertions guard.
 */
const Blockly = require('blockly');
const { BLOCK_DEFINITIONS } = require('../.build/lib/blockly/definitions.js');
const { registerNameField, setKnownObjectNames, setKnownSounds } = require('../.build/lib/blockly/nameField.js');

let failures = 0;
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}
function ok(cond, label) { eq(Boolean(cond), true, label); }

registerNameField();
Blockly.defineBlocksWithJsonArray(BLOCK_DEFINITIONS);
ok(true, 'every block definition registers with the custom field type');

const workspace = new Blockly.Workspace();

// --- a legacy value not present anywhere else must survive -----------------
{
  const block = workspace.newBlock('set_variable');
  block.setFieldValue('legacy_typo_name', 'name');
  eq(block.getFieldValue('name'), 'legacy_typo_name', 'an arbitrary saved value is preserved, not rewritten');

  const field = block.getField('name');
  const options = field.getOptions(false).map((o) => o[1]);
  ok(options.includes('legacy_typo_name'), 'current value always appears in its own option list');
  ok(options.includes('__lingplay_new__'), 'a "New…" option is offered');
}

// --- names are discovered across the workspace ------------------------------
{
  const setter = workspace.newBlock('set_variable');
  setter.setFieldValue('score', 'name');
  const changer = workspace.newBlock('change_variable');
  changer.setFieldValue('lives', 'name');

  const reporter = workspace.newBlock('expr_var');
  const options = reporter.getField('value').getOptions(false).map((o) => o[1]);
  ok(options.includes('score'), 'variable reporter sees a name defined by set_variable');
  ok(options.includes('lives'), 'variable reporter sees a name defined by change_variable');
}

// --- kinds do not leak into one another -------------------------------------
{
  const listBlock = workspace.newBlock('add_to_list');
  listBlock.setFieldValue('inventory', 'name');

  const varReporter = workspace.newBlock('expr_var');
  const varOptions = varReporter.getField('value').getOptions(false).map((o) => o[1]);
  eq(varOptions.includes('inventory'), false, 'a list name does not appear in the variable picker');

  const listReporter = workspace.newBlock('expr_list_length');
  const listOptions = listReporter.getField('value').getOptions(false).map((o) => o[1]);
  ok(listOptions.includes('inventory'), 'a list name appears in the list picker');
}

// --- broadcasts ------------------------------------------------------------
{
  const sender = workspace.newBlock('broadcast');
  sender.setFieldValue('game over', 'message');
  const receiver = workspace.newBlock('when_receive');
  const options = receiver.getField('message').getOptions(false).map((o) => o[1]);
  ok(options.includes('game over'), 'when_receive offers a message used by broadcast');
}

// --- object names come from the project, not the workspace -----------------
{
  setKnownObjectNames(['Cat', 'Dog']);
  const touching = workspace.newBlock('expr_touching');
  const options = touching.getField('value').getOptions(false).map((o) => o[1]);
  ok(options.includes('Cat'), 'object picker lists scene objects pushed in from the editor');
  ok(options.includes('Dog'), 'object picker lists every scene object');
}

// --- sounds: built-ins plus recordings, which are stored as URLs -----------
{
  setKnownSounds([
    { label: 'Click', value: 'click' },
    { label: 'My roar', value: '/uploads/audio/abc.webm' },
  ]);
  const block = workspace.newBlock('play_sound');
  const options = block.getField('sound').getOptions(false);
  const values = options.map((o) => o[1]);
  ok(values.includes('click'), 'built-in sounds are offered');
  ok(values.includes('/uploads/audio/abc.webm'), 'recorded sounds are offered');
  // A URL is unreadable as a menu label.
  const recorded = options.find((o) => o[1] === '/uploads/audio/abc.webm');
  eq(recorded[0], 'My roar', 'recording shows its name, not its URL');

  // A saved project referencing a recording that is no longer listed must keep
  // playing it rather than being silently rewritten to another sound.
  const orphan = workspace.newBlock('play_sound');
  orphan.setFieldValue('/uploads/audio/gone.webm', 'sound');
  eq(orphan.getFieldValue('sound'), '/uploads/audio/gone.webm', 'unknown recording value is preserved');
  const orphanLabels = orphan.getField('sound').getOptions(false).map((o) => o[0]);
  ok(orphanLabels.includes('gone'), 'orphaned recording gets a readable label');
}

// --- round-trip through Blockly serialization -------------------------------
{
  const block = workspace.newBlock('set_variable');
  block.setFieldValue('persisted_name', 'name');
  const saved = Blockly.serialization.workspaces.save(workspace);

  const fresh = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(saved, fresh);
  const names = fresh
    .getBlocksByType('set_variable', false)
    .map((b) => b.getFieldValue('name'));
  ok(names.includes('persisted_name'), 'field value survives a save/load round trip');
  fresh.dispose();
}

workspace.dispose();

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll name-field tests passed');
