'use client';

import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import 'blockly/blocks'; // built-in procedures_defnoreturn / procedures_callnoreturn
import { localizedBlockDefinitions, localizedToolbox } from '../../lib/blockly/definitions';
import { useLocale } from '../common/LocaleProvider';
import { registerNameField, setKnownObjectNames, setKnownSounds } from '../../lib/blockly/nameField';
import { SOUND_CATALOG } from '../../lib/audio/soundCatalog';
import { blocklyToLogic, logicToBlockly, normalizeDbBlocks } from '../../lib/blockly/serializer';
import { HAT_TYPES, ObjectRuntime, RuntimeWorld, VariableStore, type RuntimeContext } from '../../lib/runtime/interpreter';
import AudioManager from '../../lib/audio/AudioManager';
import { logger } from '../../lib/utils/logger';

/**
 * Which locale the global Blockly block table currently holds.
 * Null until the first registration. Module-scope because Blockly's registry
 * is global — every workspace on the page shares it.
 */
let blocksRegisteredFor: string | null = null;

interface BlockEditorProps {
  objectId: string;
  objectName: string;
  /** Raw logic_blocks rows (or LogicBlock[]) for the selected object. */
  initialBlocks: any[];
  /** Names of the other sprites in this scene, for the object-name pickers. */
  objectNames?: string[];
  /** Sounds recorded in this project, so `play sound` can offer them. */
  recordedSounds?: Array<{ name: string; url: string }>;
}

/** "My Blocks" flyout: one define block plus a caller per existing definition. */
function proceduresFlyout(workspace: Blockly.WorkspaceSvg): Element[] {
  const items: Element[] = [];
  const def = document.createElement('block');
  def.setAttribute('type', 'procedures_defnoreturn');
  items.push(def);
  for (const defBlock of workspace.getBlocksByType('procedures_defnoreturn', false)) {
    const name = String(defBlock.getFieldValue('NAME') ?? '');
    if (!name.trim()) continue;
    const state = (defBlock as any).saveExtraState?.();
    const params: string[] = (state?.params ?? []).map((p: any) => String(typeof p === 'string' ? p : p.name));
    const caller = document.createElement('block');
    caller.setAttribute('type', 'procedures_callnoreturn');
    const mutation = document.createElement('mutation');
    mutation.setAttribute('name', name);
    for (const p of params) {
      const arg = document.createElement('arg');
      arg.setAttribute('name', p);
      mutation.appendChild(arg);
    }
    caller.appendChild(mutation);
    items.push(caller);
  }
  return items;
}

/**
 * Minimal RuntimeContext for the in-editor "run this stack" preview. Sound
 * plays for real via AudioManager so kids can hear their sequences. Motion,
 * looks, and world-facing calls no-op so a stack that mixes `move` with
 * `play sound` still runs to completion without needing a scene/camera.
 */
function createPreviewContext(): RuntimeContext {
  return {
    getKeys: () => ({}),
    move: () => {},
    jump: () => {},
    rotate: () => {},
    scaleBy: () => {},
    playSound: (name, volume) => {
      try {
        return AudioManager.get().playSfx(name, volume ?? 1);
      } catch {
        return 0;
      }
    },
    stopAllSounds: () => {
      try {
        AudioManager.get().stopAllSfx();
      } catch { /* noop */ }
    },
    getPosition: () => ({ x: 0, y: 0, z: 0 }),
    getRotation: () => ({ x: 0, y: 0, z: 0 }),
    setPosition: () => {},
    changePosition: () => {},
    setPositionAxis: () => {},
    setRotation: () => {},
    pointTowards: () => {},
    setVisible: () => {},
    getVisible: () => true,
    setSize: () => {},
    changeSizeBy: () => {},
    getSize: () => 100,
    say: () => {},
    clearBubble: () => {},
    setColor: () => {},
    switchCostume: () => {},
    nextCostume: () => {},
    getCostume: () => ({ number: 1, name: '' }),
  };
}

export default function BlockEditor({ objectId, objectName, initialBlocks, objectNames, recordedSounds }: BlockEditorProps) {
  const locale = useLocale();
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const previewStopRef = useRef<(() => void) | null>(null);

  // Public stop handle for the Stop overlay button and unmount cleanup.
  const stopPreview = () => {
    previewStopRef.current?.();
    previewStopRef.current = null;
    setIsPreviewing(false);
  };

  useEffect(() => {
    if (!hostRef.current) return;
    // Blockly registers block definitions in a global table keyed by type, so
    // re-defining them replaces the labels for every workspace. Tracking the
    // locale they were registered under means a child who switches language
    // gets translated blocks without a full reload.
    if (blocksRegisteredFor !== locale) {
      // Must precede defineBlocksWithJsonArray — the definitions reference the
      // `field_lingplay_name` field type.
      registerNameField();
      Blockly.defineBlocksWithJsonArray(localizedBlockDefinitions(locale) as any[]);
      blocksRegisteredFor = locale;
    }

    // Object-name pickers list the sprites in the current scene, which the
    // workspace itself has no way to know about.
    setKnownObjectNames(objectNames ?? []);
    // Built-in synth sounds plus anything recorded in this project.
    setKnownSounds([
      ...SOUND_CATALOG.map((s) => ({ label: s.name, value: s.id })),
      ...(recordedSounds ?? []).map((s) => ({ label: s.name, value: s.url })),
    ]);

    // React strict-mode double-invokes effects in dev. If the previous mount's
    // workspace.dispose() left any Blockly SVG residue in the host, the second
    // inject stacks a fresh workspace on top of it — you see two overlaid
    // workspaces with matching scrollbars, a phantom divider between them, and
    // the context menu reports "Delete 2 Blocks" for what looks like one.
    // Blank the host defensively so every inject starts from an empty div.
    hostRef.current.innerHTML = '';
    const workspace = Blockly.inject(hostRef.current, {
      toolbox: localizedToolbox(locale) as any,
      renderer: 'zelos', // Scratch-style notches
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.8 },
      // Scrollbars off: Blockly renders them at the left edge of its internal
      // SVG viewport, which after our container sizing lands mid-panel as a
      // stray grey vertical bar. Users still pan with drag/right-click.
      move: { scrollbars: false, drag: true, wheel: false },
    } as Blockly.BlocklyOptions);
    workspace.registerToolboxCategoryCallback('PROCEDURE', proceduresFlyout);

    // Blockly's categoryToolbox may leave a category pre-selected after inject,
    // which renders the flyout as a persistent grey strip between the category
    // list and the workspace. Force it closed so nothing shows until the user
    // clicks a category.
    workspace.getToolbox()?.clearSelection();

    // Load the object's existing blocks.
    try {
      const blocks = normalizeDbBlocks(initialBlocks ?? []);
      if (blocks.length) {
        Blockly.serialization.workspaces.load(logicToBlockly(blocks), workspace);
      }
    } catch (e) {
      logger.warn('[BlockEditor] Failed to load existing blocks:', e);
    }

    // Debounced autosave on any non-UI change.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = async () => {
      try {
        setStatus('saving');
        const json = Blockly.serialization.workspaces.save(workspace);
        const blocks = blocklyToLogic(json);
        const res = await fetch(`/api/game-objects/${objectId}/logic-blocks`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blocks }),
        });
        setStatus(res.ok ? 'saved' : 'error');
      } catch (e) {
        logger.warn('[BlockEditor] Save failed:', e);
        setStatus('error');
      }
    };
    const listener = (event: Blockly.Events.Abstract) => {
      if (event.isUiEvent) return;
      if (event.type === Blockly.Events.FINISHED_LOADING) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 800);
    };
    workspace.addChangeListener(listener);

    // Auto-close the toolbox flyout once the user commits a block to the
    // workspace. Blockly's categoryToolbox leaves the flyout tray open by
    // default, so an empty grey strip lingers between the category list and
    // the workspace — this collapses it as soon as the drop completes.
    const flyoutCloser = (event: Blockly.Events.Abstract) => {
      if (event.type !== Blockly.Events.BLOCK_CREATE) return;
      workspace.getToolbox()?.clearSelection();
    };
    workspace.addChangeListener(flyoutCloser);

    // Scratch-style stack preview: clicking any block runs its whole stack
    // (rooted at the top block) via the real interpreter, with sound routed to
    // AudioManager and motion/looks/world calls no-op'd. A `forever { play
    // sound }` will loop forever until Stop; a bare `play sound` fires once.
    const svg = workspace.getParentSvg();
    const onSvgClick = (nativeEvent: MouseEvent) => {
      const target = nativeEvent.target as SVGElement | null;
      if (!target) return;
      // Find the enclosing Blockly block via the .blocklyDraggable class the
      // top-level block group carries. Fields (dropdowns, inputs) sit inside
      // the same group so this also fires when a kid clicks the dropdown.
      const blockGroup = target.closest('.blocklyDraggable') as SVGGElement | null;
      if (!blockGroup) return;
      const blockId = blockGroup.getAttribute('data-id');
      if (!blockId) return;
      const block = workspace.getBlockById(blockId);
      if (!block) return;
      startStackPreview(block);
    };
    svg.addEventListener('click', onSvgClick);

    // Runs the clicked stack (from its root) via the shared ObjectRuntime.
    // Any hat at the top is dropped so the stack always runs immediately as
    // an implicit always-on script (the runtime's "no hat = fire now" path),
    // which is what a kid pointing at a stack expects.
    //
    // Standalone one-shot blocks (a lone `play sound` with no next, no
    // wrapping loop) shortcut straight to AudioManager — no interpreter, no
    // Stop overlay, plays exactly once. Only stacks that could run for a
    // while (contain forever / wait_until / wait / any nested statements)
    // spin up the runtime and show the Stop button.
    const startStackPreview = (block: Blockly.Block) => {
      // Any currently-running preview stops first; one at a time keeps sound
      // predictable and avoids compounding forever loops.
      stopPreview();
      const root = block.getRootBlock();
      const rootJson = Blockly.serialization.blocks.save(root, {
        addCoordinates: false,
        addInputBlocks: true,
        addNextBlocks: true,
      } as any);
      if (!rootJson) return;
      const logicChain = blocklyToLogic({ blocks: { blocks: [rootJson] } });
      // Strip a leading hat so the stack runs immediately (implicit always-on).
      const body = logicChain[0] && HAT_TYPES.has(logicChain[0].block_type)
        ? logicChain.slice(1)
        : logicChain;
      if (body.length === 0) return;

      // Standalone single-block audition — skip the interpreter entirely.
      if (body.length === 1 && !hasChildren(body[0])
          && (body[0].block_type === 'play_sound' || body[0].block_type === 'play_sound_until_done')) {
        const soundName = String((body[0].inputs as any)?.sound ?? 'click');
        try { AudioManager.get().playSfx(soundName); } catch { /* noop */ }
        return;
      }

      const previewVars = new VariableStore();
      const previewWorld = new RuntimeWorld();
      const ctx = createPreviewContext();
      const runtime = new ObjectRuntime('preview', body, previewVars, ctx, previewWorld);

      const dt = 1 / 30;
      let time = 0;
      const interval = window.setInterval(() => {
        try {
          runtime.step(dt, time);
        } catch (e) {
          logger.warn('[BlockEditor] Preview step threw:', e);
          window.clearInterval(interval);
          try { ctx.stopAllSounds?.(); } catch { /* noop */ }
          previewStopRef.current = null;
          setIsPreviewing(false);
        }
        time += dt;
      }, dt * 1000);

      previewStopRef.current = () => {
        window.clearInterval(interval);
        try { ctx.stopAllSounds?.(); } catch { /* noop */ }
      };
      setIsPreviewing(true);
    };

    // Structural: does this LogicBlock have nested statement children?
    // (Used to keep the standalone-sound shortcut from grabbing sound blocks
    // that live inside a forever/if/etc.)
    function hasChildren(b: any): boolean {
      if (Array.isArray(b?.children) && b.children.length > 0) return true;
      if (Array.isArray(b?.elseChildren) && b.elseChildren.length > 0) return true;
      return false;
    }

    // Re-fit Blockly's SVG whenever its host div resizes. Blockly captures the
    // host's size at inject time and never listens for changes on its own, so
    // any layout change (Scene→Logic tab, window resize, sidebar toggle) leaves
    // the workspace SVG at its stale size and the right-edge scrollbar renders
    // wherever the SVG happens to end — often mid-container as a grey strip.
    const resizeObserver = new ResizeObserver(() => {
      Blockly.svgResize(workspace);
    });
    resizeObserver.observe(hostRef.current);
    // Initial fit — needed too since the tab-switch animation can finish after
    // inject and leave us with the pre-animation dimensions baked in.
    Blockly.svgResize(workspace);

    return () => {
      if (timer) clearTimeout(timer);
      resizeObserver.disconnect();
      svg.removeEventListener('click', onSvgClick);
      // Always kill an in-flight preview on unmount so a forever loop can't
      // outlive its owning editor.
      previewStopRef.current?.();
      previewStopRef.current = null;
      workspace.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId, locale]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-white text-sm font-medium">
          Blocks for <span className="text-blue-300">{objectName}</span>
        </span>
        <span className="text-xs text-gray-400">
          {status === 'saving' ? 'Saving…' : status === 'error' ? 'Save failed' : 'Saved'}
        </span>
      </div>
      <div className="relative flex-1 min-h-0">
        <div ref={hostRef} className="absolute inset-0" />
        {isPreviewing && (
          <button
            type="button"
            onClick={stopPreview}
            className="absolute top-3 right-3 z-10 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-sm font-semibold shadow-lg"
          >
            <span className="w-3 h-3 rounded-sm bg-white" />
            Stop preview
          </button>
        )}
      </div>
    </div>
  );
}
