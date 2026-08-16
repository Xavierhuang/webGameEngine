/**
 * What the Logic tab's preview can actually demonstrate.
 *
 * The preview runs the interpreter against a stub context in which every
 * visual method — move, jump, rotate, say, setColor — is an empty function.
 * Only sound is really wired up. So a child pressing Preview on `burst smoke`,
 * or on `move 200`, sees nothing happen and gets no explanation: the blocks run
 * perfectly and there is nowhere for the result to appear.
 *
 * That was reported as "where should I see the smoke?", which is a fair
 * question to ask of a button labelled Preview.
 *
 * This module says which blocks the preview can show, so the editor can tell
 * the truth rather than silently doing nothing. Pure and dependency-free, and a
 * test asserts every block in the palette is classified — a new block must be
 * placed deliberately rather than defaulting to a wrong answer.
 */

/** Blocks whose whole effect is sound, which the preview really does play. */
const AUDIBLE = new Set([
  'play_sound', 'play_sound_until_done', 'stop_all_sounds',
  'set_volume', 'change_volume_by',
  'play_note', 'play_drum', 'rest_for_beats', 'set_instrument',
  'set_tempo', 'change_tempo_by',
  'speak', 'speak_until_done',
]);

/**
 * Blocks with no visible or audible effect on their own — control flow,
 * variables, lists, broadcasts, sensing. The preview runs them correctly, and
 * there is nothing to see either way, so they are not worth warning about.
 */
const INVISIBLE = new Set([
  'on_start', 'on_key_press', 'when_clicked', 'when_touches', 'when_receive',
  'when_clone_start', 'when_scene_starts', 'when_video_motion',
  'wait', 'wait_until', 'if_then', 'repeat', 'repeat_until', 'forever', 'stop',
  'set_variable', 'change_variable', 'add_to_list', 'delete_from_list',
  'insert_into_list', 'replace_in_list', 'delete_all_of_list',
  'broadcast', 'broadcast_and_wait', 'reset_timer',
  'ask_and_wait', 'ask_ai', 'ai_decide', 'translate_to',
]);

/**
 * Human-readable groups for the ones that need the real scene. Grouped rather
 * than listed block by block: "movement, particles and the camera" is a
 * sentence a child can read, and eleven block names is not.
 */
const NEEDS_SCENE: Array<{ label: string; blocks: string[] }> = [
  {
    label: 'movement',
    blocks: ['move', 'jump', 'rotate', 'scale', 'goto_xyz', 'goto_object', 'change_xyz',
             'set_x', 'set_y', 'set_z', 'glide_to_xyz', 'point_towards', 'set_rotation'],
  },
  {
    label: 'how things look',
    blocks: ['show', 'hide', 'set_size', 'change_size_by', 'say', 'think', 'clear_bubble',
             'set_color', 'set_effect', 'change_effect_by', 'clear_effects',
             'go_to_layer', 'change_layer_by', 'switch_costume_to', 'next_costume',
             'switch_animation_to', 'show_variable', 'hide_variable', 'show_list', 'hide_list'],
  },
  {
    label: 'particles',
    blocks: ['burst_particles', 'start_particles', 'stop_particles',
             'set_particle_size', 'set_particle_amount'],
  },
  {
    label: 'the camera',
    blocks: ['camera_follow', 'camera_stop_following', 'camera_shake',
             'camera_zoom', 'camera_zoom_by'],
  },
  { label: 'the pen', blocks: ['pen_down', 'pen_up', 'pen_clear', 'pen_set_color', 'pen_set_size'] },
  { label: 'clones', blocks: ['create_clone_of', 'delete_clone'] },
  { label: 'scenes', blocks: ['switch_to_scene', 'next_scene'] },
  { label: 'the camera feed', blocks: ['set_video', 'set_video_transparency'] },
];

const SCENE_BLOCKS = new Map<string, string>();
for (const group of NEEDS_SCENE) {
  for (const block of group.blocks) SCENE_BLOCKS.set(block, group.label);
}

export type PreviewCapability = 'audible' | 'invisible' | 'needs-scene';

export function previewCapability(blockType: string): PreviewCapability {
  if (AUDIBLE.has(blockType)) return 'audible';
  if (SCENE_BLOCKS.has(blockType)) return 'needs-scene';
  if (INVISIBLE.has(blockType)) return 'invisible';
  // Anything unclassified is treated as needing the scene: the safe answer is
  // "press Play to be sure", never a silent nothing.
  return 'needs-scene';
}

/** Every block type this module knows about, for the coverage test. */
export function classifiedBlocks(): string[] {
  return [...AUDIBLE, ...INVISIBLE, ...SCENE_BLOCKS.keys()].sort();
}

export interface PreviewSummary {
  /** True if any block in the script makes a sound the preview can play. */
  playsSound: boolean;
  /** Group labels present in the script that need the real scene. */
  needsPlay: string[];
}

/**
 * Summarise a script, walking nested children.
 *
 * `blocks` is the flat script array; C-blocks carry their bodies in `children`.
 */
export function summarisePreview(
  blocks: Array<{ block_type: string; children?: unknown }>
): PreviewSummary {
  const labels: string[] = [];
  let playsSound = false;

  const walk = (list: Array<{ block_type: string; children?: unknown }>) => {
    for (const block of list ?? []) {
      if (!block || typeof block.block_type !== 'string') continue;
      const capability = previewCapability(block.block_type);
      if (capability === 'audible') playsSound = true;
      if (capability === 'needs-scene') {
        const label = SCENE_BLOCKS.get(block.block_type) ?? 'the scene';
        if (!labels.includes(label)) labels.push(label);
      }
      const kids = (block as { children?: unknown }).children;
      if (Array.isArray(kids)) walk(kids as Array<{ block_type: string }>);
    }
  };
  walk(blocks);

  return { playsSound, needsPlay: labels };
}

/** A sentence for the editor, or null when the preview shows everything. */
export function previewNotice(summary: PreviewSummary): string | null {
  if (summary.needsPlay.length === 0) return null;
  const list = summary.needsPlay;
  const readable =
    list.length === 1
      ? list[0]
      : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
  const prefix = summary.playsSound ? 'Sounds play here. ' : '';
  return `${prefix}To see ${readable}, press Play.`;
}
