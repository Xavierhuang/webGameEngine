/**
 * Decides whether an object's scripts require the gravity/collision loop.
 * Event hats can run on stationary objects, so an event category by itself
 * must never make a collectible fall.
 */
export function requiresDynamicPhysics(blocks: readonly { block_type?: string; category?: string | null }[]): boolean {
  return blocks.some((block) => (
    block.block_type === 'on_key_press'
    || block.block_type === 'move'
    || block.block_type === 'jump'
    || block.category === 'movement'
    || block.category === 'input'
  ));
}
