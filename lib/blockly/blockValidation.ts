import { HAT_TYPES } from '../runtime/interpreter';
import { BLOCK_SPECS } from './definitions';

export type BlockValidationFailure = 'unsupported_block_type' | 'invalid_block_data';

export interface SerializedLogicBlock {
  block_type: unknown;
  inputs?: unknown;
  children?: unknown;
  elseChildren?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validExpression(value: unknown): boolean {
  if (!isRecord(value) || typeof value.op !== 'string') return false;
  if (
    !['literal', 'var', 'variable', 'arg'].includes(value.op)
    && !Object.prototype.hasOwnProperty.call(BLOCK_SPECS, `expr_${value.op}`)
  ) return false;
  if (Object.keys(value).some((key) => key !== 'op' && key !== 'args' && key !== 'value')) return false;
  if (value.value !== undefined && !['string', 'number', 'boolean'].includes(typeof value.value)) return false;
  return value.args === undefined || (Array.isArray(value.args) && value.args.every(validExpression));
}

function validInput(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value) || validExpression(value);
}

function validateCustomBlock(blockType: string, data: Record<string, unknown>): BlockValidationFailure | null {
  const inputs = data.inputs;
  if (!isRecord(inputs)) return 'invalid_block_data';
  if (blockType === 'define_custom_block') {
    if (typeof inputs.name !== 'string' || !Array.isArray(inputs.params) || !inputs.params.every((param) => typeof param === 'string')) {
      return 'invalid_block_data';
    }
    if (Object.keys(inputs).some((key) => key !== 'name' && key !== 'params')) return 'invalid_block_data';
    return data.elseChildren === undefined ? null : 'invalid_block_data';
  }
  if (typeof inputs.name !== 'string' || Object.values(inputs).some((value) => !validInput(value))) return 'invalid_block_data';
  return data.children === undefined && data.elseChildren === undefined ? null : 'invalid_block_data';
}

function validateTree(value: unknown, nested: boolean): BlockValidationFailure | null {
  if (!isRecord(value) || typeof value.block_type !== 'string') return 'invalid_block_data';
  const blockType = value.block_type;
  if (nested && HAT_TYPES.has(blockType)) return 'invalid_block_data';
  const data = {
    inputs: value.inputs,
    children: value.children,
    elseChildren: value.elseChildren,
  };
  return validateSerializedLogicBlock(blockType, data, nested);
}

/**
 * Canonical runtime-shape validation for the persisted `logic_blocks` payload.
 * The same Blockly vocabulary drives serialization, template validation, and
 * release validation, so unknown operators and invalid statement placement
 * cannot become a release-only interpretation.
 */
export function validateSerializedLogicBlock(
  blockType: unknown,
  blockData: unknown,
  nested = false,
): BlockValidationFailure | null {
  if (typeof blockType !== 'string') return 'unsupported_block_type';
  if (!isRecord(blockData)) return 'invalid_block_data';
  if (Object.keys(blockData).some((key) => key !== 'inputs' && key !== 'children' && key !== 'elseChildren')) {
    return 'invalid_block_data';
  }
  if (nested && HAT_TYPES.has(blockType)) return 'invalid_block_data';

  if (blockType === 'define_custom_block' || blockType === 'call_custom_block') {
    const customFailure = validateCustomBlock(blockType, blockData);
    if (customFailure) return customFailure;
  } else {
    if (!Object.prototype.hasOwnProperty.call(BLOCK_SPECS, blockType)) return 'unsupported_block_type';
    const spec = BLOCK_SPECS[blockType];
    const inputs = blockData.inputs ?? {};
    if (!isRecord(inputs)) return 'invalid_block_data';
    const allowedInputs = new Set([...spec.fields, ...spec.values]);
    if (Object.keys(inputs).some((key) => !allowedInputs.has(key)) || Object.values(inputs).some((value) => !validInput(value))) {
      return 'invalid_block_data';
    }
    if (blockData.children !== undefined && !spec.statements.includes('children')) return 'invalid_block_data';
    if (blockData.elseChildren !== undefined && !spec.statements.includes('elseChildren')) return 'invalid_block_data';
  }

  for (const key of ['children', 'elseChildren'] as const) {
    const children = blockData[key];
    if (children === undefined) continue;
    if (!Array.isArray(children)) return 'invalid_block_data';
    for (const child of children) {
      const failure = validateTree(child, true);
      if (failure) return failure;
    }
  }
  return null;
}

/** Shared template/release budget counter for persisted nested clone blocks. */
export function countCloneCreationBlocks(blocks: readonly SerializedLogicBlock[]): number {
  let count = 0;
  const walk = (items: readonly SerializedLogicBlock[]) => {
    for (const block of items) {
      if (!isRecord(block)) continue;
      if (block.block_type === 'create_clone_of') count += 1;
      if (Array.isArray(block.children)) walk(block.children as SerializedLogicBlock[]);
      if (Array.isArray(block.elseChildren)) walk(block.elseChildren as SerializedLogicBlock[]);
    }
  };
  walk(blocks);
  return count;
}
