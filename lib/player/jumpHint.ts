import type { LogicBlock } from '../../types/game';

function inputsFor(block: LogicBlock): Record<string, unknown> {
  if (block.inputs) return block.inputs as Record<string, unknown>;
  if (typeof block.block_data === 'string') {
    try {
      return (JSON.parse(block.block_data).inputs ?? {}) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (block.block_data?.inputs ?? {}) as Record<string, unknown>;
}

/** Whether the active player has the exact Space-key jump control we describe. */
export function hasSpaceJumpScript(blocks: readonly LogicBlock[] | undefined): boolean {
  if (!blocks) return false;
  return blocks.some((block, index) =>
    block.block_type === 'on_key_press'
    && String(inputsFor(block).key ?? '').toUpperCase() === 'SPACE'
    && blocks[index + 1]?.block_type === 'jump',
  );
}
