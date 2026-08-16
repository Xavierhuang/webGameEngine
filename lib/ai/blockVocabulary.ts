/**
 * The complete block vocabulary, generated from the block registry.
 *
 * The AI system prompt described the block language in hand-written prose. It
 * had drifted badly: 34 of the 83 statement blocks were absent, including the
 * entire Pen and Music extensions, text-to-speech, translate, scene switching,
 * graphic effects and ask-and-wait. A child could ask for a drawing game and
 * the AI would not know `pen_down` existed — not because it refused, but
 * because nothing ever told it.
 *
 * The prose stays, because "max 300 clones" and "yields until done" are things
 * a generated list cannot say. This adds an exhaustive reference after it, so
 * shipping a block is enough to make the AI aware of it. A test asserts every
 * block appears.
 *
 * Pure and dependency-free apart from the registry, so bare `tsc` can test it.
 */

import { BLOCK_SPECS } from '../blockly/definitions';

/** Blocks that take a body of other blocks, so the AI knows to nest. */
const describeInputs = (spec: { fields: string[]; values: string[]; statements: string[] }) => {
  const inputs = [...spec.fields, ...spec.values];
  const parts: string[] = [];
  if (inputs.length) parts.push(`inputs: ${inputs.join(', ')}`);
  if (spec.statements.length) parts.push(`children: ${spec.statements.join(', ')}`);
  return parts.length ? ` — ${parts.join('; ')}` : '';
};

/**
 * Every statement block, one per line. Expression blocks are excluded: they
 * appear inside `inputs` as {"op": ...} and are documented separately in the
 * prose, where their argument shapes can be explained properly.
 */
export function blockVocabulary(): string {
  const lines = Object.entries(BLOCK_SPECS)
    .filter(([type]) => !type.startsWith('expr_'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, spec]) => `- ${type}${describeInputs(spec as any)}`);

  return [
    'COMPLETE BLOCK LIST (generated from the block registry — every block the',
    'runtime can execute, including any the prose above does not mention):',
    '',
    ...lines,
  ].join('\n');
}

/** Statement block types, for tests and for anything that needs the raw list. */
export function statementBlockTypes(): string[] {
  return Object.keys(BLOCK_SPECS)
    .filter((t) => !t.startsWith('expr_'))
    .sort();
}
