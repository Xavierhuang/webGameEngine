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

    const workspace = Blockly.inject(hostRef.current, {
      toolbox: TOOLBOX as any,
      renderer: 'zelos', // Scratch-style notches
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.8 },
      move: { scrollbars: true, drag: true, wheel: false },
    } as Blockly.BlocklyOptions);
    workspace.registerToolboxCategoryCallback('PROCEDURE', proceduresFlyout);

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

    return () => {
      if (timer) clearTimeout(timer);
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
