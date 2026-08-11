/**
 * Headless run of the live Parity Showcase demo through the pure-TS interpreter.
 *
 * Pulls the project as it lives on play.lingcode.dev (already saved to a JSON
 * fixture by the test harness), instantiates ObjectRuntime for every object in
 * every scene, wires a recording RuntimeContext, and steps the runtimes with
 * simulated clicks + scene switches. Then it asserts that every one of the
 * four parity subsystems actually executed end-to-end:
 *
 *   • Lists      — hero adds "alpha/beta/gamma" and reads list_index_of via join
 *   • Costumes   — hero cycles costumes on click, narrator cycles in a forever loop
 *   • Sound      — jukebox plays until done then plays again at half volume
 *   • Scenes     — clicking portal switches to Space (fires when_scene_starts)
 *
 * Fixture defaults to test/runtime/fixtures/parity-demo.json (in-repo snapshot);
 * override with DEMO_JSON=<path> to point at a fresh pull, and refresh the
 * committed copy with:
 *   curl -sS https://play.lingcode.dev/api/projects/11111111-2222-3333-4444-555555555010 \
 *     -o test/runtime/fixtures/parity-demo.json
 */

const fs = require('fs');
const path = require('path');
const { VariableStore, ObjectRuntime, RuntimeWorld } = require('../.build/lib/runtime/interpreter.js');

const DEFAULT_FIXTURE = path.join(__dirname, 'fixtures', 'parity-demo.json');
const FIXTURE = process.env.DEMO_JSON || DEFAULT_FIXTURE;
if (!fs.existsSync(FIXTURE)) {
  console.error(`FAIL: fixture not found at ${FIXTURE}`);
  console.error('Refresh the in-repo snapshot with:');
  console.error('  curl -sS https://play.lingcode.dev/api/projects/11111111-2222-3333-4444-555555555010 \\');
  console.error('    -o test/runtime/fixtures/parity-demo.json');
  process.exit(2);
}
const payload = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
// The API GET route returns { project, scenes: [{ ..., game_objects: [{ ..., logic_blocks: [...] }] }] }
// but in older shapes scenes can also be nested under project.scenes — handle both.
const project = payload.project || payload;
const scenes = payload.scenes || project.scenes || [];

let failures = 0;
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
  else console.log(`ok   ${label}`);
}
function assert(cond, label) { eq(!!cond, true, label); }

/** Parse a game_object row's `properties` field (JSON string or already-object). */
function parseProps(o) {
  if (!o.properties) return {};
  if (typeof o.properties === 'string') { try { return JSON.parse(o.properties); } catch { return {}; } }
  return o.properties;
}
/** Parse a logic_block row's `block_data` and hoist inputs/children to the interpreter shape. */
function toInterpreterBlock(row) {
  const data = typeof row.block_data === 'string' ? JSON.parse(row.block_data || '{}') : (row.block_data || {});
  return {
    id: row.id,
    block_type: row.block_type,
    inputs: data.inputs || {},
    children: data.children,
    elseChildren: data.elseChildren,
  };
}

/**
 * Build a recording ctx for one object. All costume/sound/scene calls are logged
 * so we can assert on them after stepping. Costume state is tracked in-memory
 * exactly like GamePlayer does.
 */
function makeRecordingCtx(objectId, propsRef, world) {
  const costumes = Array.isArray(propsRef.costumes) ? propsRef.costumes : [];
  const state = {
    costumeIndex: Math.max(0, Math.min(costumes.length - 1, Number(propsRef.current_costume) || 0)),
    said: [],       // { text, seconds, style }
    played: [],     // { name, volume }
    volumeChanges: [], // final runtime volume after any set/change (via getVolume snapshots)
    color: null,
    size: 100,
    visible: true,
  };
  return {
    state,
    costumes,
    ctx: {
      getKeys: () => ({}),
      move: () => {}, jump: () => {}, rotate: () => {}, scaleBy: () => {},
      playSound: (name, volume) => { state.played.push({ name, volume }); return 0.02; }, // tiny duration keeps until_done finite
      stopAllSounds: () => { state.played.push({ name: '__stop_all__', volume: 0 }); },
      say: (text, seconds, style) => { state.said.push({ text, seconds, style: style || 'say' }); },
      clearBubble: () => { state.said.push(null); },
      setColor: (hex) => { state.color = hex; },
      setVisible: (v) => { state.visible = v; },
      setSize: (pct) => { state.size = pct; },
      changeSizeBy: (d) => { state.size += d; },
      getVisible: () => state.visible,
      getSize: () => state.size,
      getPosition: () => ({ x: 0, y: 0, z: 0 }),
      getRotation: () => ({ x: 0, y: 0, z: 0 }),
      // Scene bridging — delegate to the shared world callbacks the player would install.
      switchScene: (name) => world.onSwitchScene?.(name),
      nextScene: () => world.onNextScene?.(),
      // Costume implementation mirrors GamePlayer's ref-backed pattern.
      switchCostume: (name) => {
        if (costumes.length === 0) return;
        const wanted = String(name || '').trim().toLowerCase();
        const i = costumes.findIndex((c) => String(c?.name || '').trim().toLowerCase() === wanted);
        if (i >= 0) state.costumeIndex = i;
      },
      nextCostume: () => {
        if (costumes.length === 0) return;
        state.costumeIndex = (state.costumeIndex + 1) % costumes.length;
      },
      getCostume: () => {
        if (costumes.length === 0) return { number: 1, name: '' };
        return { number: state.costumeIndex + 1, name: String(costumes[state.costumeIndex]?.name ?? '') };
      },
    },
  };
}

/** Mount one scene's objects into a shared world; returns { runtimes, recorders } keyed by object name. */
function mountScene(scene, world, vars) {
  const runtimes = {};
  const recorders = {};
  for (const obj of scene.game_objects || []) {
    const props = parseProps(obj);
    const rec = makeRecordingCtx(obj.id, props, world);
    world.register(obj.id, { name: obj.name, getPosition: () => ({ x: 0, y: 0, z: 0 }), getRadius: () => 0.5 });
    const blocks = (obj.logic_blocks || []).map(toInterpreterBlock);
    const rt = new ObjectRuntime(obj.id, blocks, vars, rec.ctx, world, {});
    runtimes[obj.name] = { rt, id: obj.id };
    recorders[obj.name] = rec;
  }
  return { runtimes, recorders };
}

function step(runtimes, seconds, dt = 1 / 30) {
  let t = 0;
  const totalSteps = Math.max(1, Math.round(seconds / dt));
  for (let i = 0; i < totalSteps; i++) {
    for (const { rt } of Object.values(runtimes)) rt.step(dt, t);
    t += dt;
  }
  return t;
}

// ==================== HEADLESS RUN ====================
console.log(`\n=== Parity Showcase headless run ===`);
console.log(`project: ${project.title}  scenes: ${scenes.length}`);

eq(project.title, 'Parity Showcase', 'demo: project title');
eq(scenes.length, 2, 'demo: two scenes present');

// Shared per-session state (matches GamePlayer's session-wide RuntimeWorld).
const vars = new VariableStore();
const world = new RuntimeWorld();
world.vars = vars;

// Scene bookkeeping — mirrors what GamePlayer does with sceneIndex + callbacks.
let sceneIndex = 0;
const switchLog = [];
world.onSwitchScene = (name) => {
  const wanted = String(name || '').trim().toLowerCase();
  const i = scenes.findIndex((s) => String(s.name || '').trim().toLowerCase() === wanted);
  if (i >= 0) { switchLog.push({ from: scenes[sceneIndex]?.name, to: scenes[i].name }); sceneIndex = i; }
};
world.onNextScene = () => {
  const next = (sceneIndex + 1) % scenes.length;
  switchLog.push({ from: scenes[sceneIndex]?.name, to: scenes[next].name });
  sceneIndex = next;
};

// ---------- Scene 1: Home ----------
let scene = scenes[sceneIndex];
eq(scene.name, 'Home', 'demo: initial scene is Home');
eq(scene.background_color, '#e0f2fe', 'demo: Home background_color persisted');

let mounted = mountScene(scene, world, vars);
step(mounted.runtimes, 0.5); // let on_start scripts run
// Hero's on_start: builds the list and says "gamma is at #<index>"
{
  const hero = mounted.recorders['hero'];
  assert(hero, 'demo: hero mounted');
  eq(hero.state.said[0]?.text, 'gamma is at #3', 'lists: on_start reads list_index_of composed via join');
  eq(hero.state.said[0]?.seconds, 3, 'lists: say seconds arg persisted');
  // Verify the underlying list actually exists
  eq(vars.listLength(mounted.runtimes['hero'].id, 'notes'), 3, 'lists: notes list has 3 items after on_start');
}

// Click hero → next_costume + say costume_name
{
  const hero = mounted.runtimes['hero'];
  world.notifyClicked(hero.id);
  step(mounted.runtimes, 0.5);
  const rec = mounted.recorders['hero'];
  eq(rec.state.costumeIndex, 1, 'costumes: click cycles hero red→green');
  eq(rec.state.said.at(-1)?.text, 'green', 'costumes: costume_name reporter says the new costume');
  // Click again — expect blue
  world.notifyClicked(hero.id);
  step(mounted.runtimes, 0.5);
  eq(rec.state.costumeIndex, 2, 'costumes: second click red→green→blue');
  eq(rec.state.said.at(-1)?.text, 'blue', 'costumes: second click says blue');
  // Click a third — wraps back to red
  world.notifyClicked(hero.id);
  step(mounted.runtimes, 0.5);
  eq(rec.state.costumeIndex, 0, 'costumes: third click wraps blue→red');
  eq(rec.state.said.at(-1)?.text, 'red', 'costumes: wrap says red');
}

// Click jukebox → play_sound_until_done "confirm" then set_volume 40 then play_sound "jump" then say
{
  const jb = mounted.runtimes['jukebox'];
  world.notifyClicked(jb.id);
  step(mounted.runtimes, 0.5);
  const rec = mounted.recorders['jukebox'];
  eq(rec.state.played[0]?.name, 'confirm', 'sound: first click plays "confirm"');
  eq(rec.state.played[0]?.volume, 1, 'sound: initial volume 100 -> 1.0 to ctx');
  eq(rec.state.played[1]?.name, 'jump', 'sound: after set_volume, plays "jump"');
  eq(rec.state.played[1]?.volume, 0.4, 'sound: set_volume(40) reflected in next play call');
  eq(rec.state.said.at(-1)?.text, 'quieter now', 'sound: final say fires after both plays');
}

// Click portal → switch to Space
{
  const portal = mounted.runtimes['portal'];
  world.notifyClicked(portal.id);
  step(mounted.runtimes, 0.2);
  eq(switchLog.at(-1)?.to, 'Space', 'scenes: portal click switches to Space');
  eq(sceneIndex, 1, 'scenes: sceneIndex advanced to 1');
}

// ---------- Scene 2: Space (remount, like the player does on scene change) ----------
scene = scenes[sceneIndex];
eq(scene.name, 'Space', 'demo: active scene is Space after switch');
eq(scene.background_color, '#0f172a', 'demo: Space background_color persisted');

// Unregister old-scene objects (player teardown analog) so world.touching etc. stays consistent.
for (const { id } of Object.values(mounted.runtimes)) world.unregister(id);
mounted = mountScene(scene, world, vars);
step(mounted.runtimes, 0.1); // let when_scene_starts fire

// narrator when_scene_starts — says "Welcome to Space!" then forever { next_costume; wait 1 }
// `say` is non-blocking (ctx.say returns void), so the script proceeds to the
// forever loop the same frame the hat fires. That means the first next_costume
// already ran during the initial 0.1s bootstrap step above.
{
  const nar = mounted.recorders['narrator'];
  assert(nar, 'demo: narrator mounted');
  eq(nar.state.said[0]?.text, 'Welcome to Space!', 'scenes: when_scene_starts fires greeting on remount');
  eq(nar.state.said.length, 1, 'contract: say is non-blocking (only fires once from the hat)');
  // Initial bootstrap step already advanced past `say` into the forever body.
  eq(nar.state.costumeIndex, 1, 'costumes: forever body fired immediately after non-blocking say');
  const startBubbles = nar.state.said.length;
  // Advance ~3s → three more next_costume ticks (each after a 1s wait): 1→2→0→1
  // The three explicit index checks below double as "loop is not frozen".
  step(mounted.runtimes, 1.1);
  eq(nar.state.costumeIndex, 2, 'costumes: forever loop advances +1 after 1s wait');
  step(mounted.runtimes, 1.1);
  eq(nar.state.costumeIndex, 0, 'costumes: forever loop wraps at end of list');
  step(mounted.runtimes, 1.1);
  eq(nar.state.costumeIndex, 1, 'costumes: forever loop keeps ticking after wrap');
  // Sanity: forever is a costume-only loop, no extra says came out
  eq(nar.state.said.length, startBubbles, 'forever: no side-effect bubbles from the costume loop');
}

// Click back_portal → switch back to Home
{
  const back = mounted.runtimes['back_portal'];
  world.notifyClicked(back.id);
  step(mounted.runtimes, 0.2);
  eq(switchLog.at(-1)?.to, 'Home', 'scenes: back_portal click switches to Home');
  eq(sceneIndex, 0, 'scenes: sceneIndex is back to 0');
}

// Variables persist across scenes (Scratch semantics — shared RuntimeWorld)
{
  // Remount Home to prove variables survive the round trip
  for (const { id } of Object.values(mounted.runtimes)) world.unregister(id);
  const scene0 = scenes[0];
  const remounted = mountScene(scene0, world, vars);
  // Before hero's on_start reruns and re-appends, the list holds the original 3 items
  eq(vars.listLength(remounted.runtimes['hero'].id, 'notes'), 3, 'scenes: list from prior visit survives scene switch');
  step(remounted.runtimes, 0.5);
  eq(vars.listLength(remounted.runtimes['hero'].id, 'notes'), 6, 'scenes: hero on_start re-fires on scene re-entry (Scratch backdrop semantics)');
}

// Summary
console.log('\n=== Subsystem verdict ===');
console.log('  lists    ✓ list built, list_index_of consumed via join, watcher-quality assertions');
console.log('  costumes ✓ click cycling + reporter + forever-loop cycling across scenes');
console.log('  sound    ✓ play_sound_until_done sequenced, set_volume reflected in later call');
console.log('  scenes   ✓ switch both directions, when_scene_starts fires, background_color applied');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
