'use client';

import { useEffect, useRef, useState } from 'react';
import * as Blockly from 'blockly';
import 'blockly/blocks'; // built-in procedures_defnoreturn / procedures_callnoreturn
import { BLOCK_DEFINITIONS, TOOLBOX } from '../../lib/blockly/definitions';
import { blocklyToLogic, logicToBlockly, normalizeDbBlocks } from '../../lib/blockly/serializer';
import { logger } from '../../lib/utils/logger';

let blocksRegistered = false;

interface BlockEditorProps {
  objectId: string;
  objectName: string;
  /** Raw logic_blocks rows (or LogicBlock[]) for the selected object. */
  initialBlocks: any[];
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

export default function BlockEditor({ objectId, objectName, initialBlocks }: BlockEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  useEffect(() => {
    if (!hostRef.current) return;
    if (!blocksRegistered) {
      Blockly.defineBlocksWithJsonArray(BLOCK_DEFINITIONS as any[]);
      blocksRegistered = true;
    }

    // React strict-mode double-invokes effects in dev. If the previous mount's
    // workspace.dispose() left any Blockly SVG residue in the host, the second
    // inject stacks a fresh workspace on top of it — you see two overlaid
    // workspaces with matching scrollbars, a phantom divider between them, and
    // the context menu reports "Delete 2 Blocks" for what looks like one.
    // Blank the host defensively so every inject starts from an empty div.
    hostRef.current.innerHTML = '';
    const workspace = Blockly.inject(hostRef.current, {
      toolbox: TOOLBOX as any,
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
      workspace.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId]);

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
      <div ref={hostRef} className="flex-1 min-h-0" />
    </div>
  );
}
